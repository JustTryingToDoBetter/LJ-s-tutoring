import 'dotenv/config';
import { Pool } from 'pg';
import { claimNextJob, completeJob, failJob } from '../src/lib/job-queue.js';
import { buildAuditCsv } from '../src/lib/audit-export.js';
import { buildPayrollCsv } from '../src/lib/payroll-export.js';
import { generatePayrollWeek } from '../src/domains/admin/payroll/service.js';
import { safeAuditMeta, writeAuditLog } from '../src/lib/audit.js';
import { runRetentionCleanup } from '../src/lib/retention-cleanup.js';
import { computeScoreSnapshot } from '../src/lib/predictive-scoring.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({ connectionString: databaseUrl });

function toDateOnly(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function computeStudentMetrics(client: any, userId: string, scoreDate: string) {
  const sessionsRes = await client.query(
    `select
        count(*) filter (where status = 'APPROVED')::int as approved_sessions,
        count(*) filter (where status = 'REJECTED')::int as rejected_sessions
     from sessions s
     join users u on u.student_id = s.student_id
     where u.id = $1
       and s.date >= ($2::date - interval '14 day')
       and s.date <= $2::date`,
    [userId, scoreDate]
  );

  const streakRes = await client.query(
    `select current::int as current
     from study_streaks
     where user_id = $1`,
    [userId]
  );

  const breaksRes = await client.query(
    `with dates as (
       select distinct (occurred_at::date) as d
       from study_activity_events
       where user_id = $1
         and occurred_at >= ($2::date - interval '14 day')
     ),
     gaps as (
       select d, lag(d) over (order by d asc) as prev_d
       from dates
     )
     select coalesce(count(*) filter (where prev_d is not null and d - prev_d > 1), 0)::int as breaks
     from gaps`,
    [userId, scoreDate]
  );

  const practiceRes = await client.query(
    `select
        count(*)::int as events,
        coalesce(sum(
          case
            when (metadata_json ->> 'durationMinutes') ~ '^[0-9]+$'
            then (metadata_json ->> 'durationMinutes')::int
            else 0
          end
        ), 0)::int as minutes
     from study_activity_events
     where user_id = $1
       and occurred_at >= ($2::date - interval '7 day')
       and type in ('practice_completed', 'focus_session', 'goal_completed')`,
    [userId, scoreDate]
  );

  const engagementRes = await client.query(
    `select
        count(*) filter (where metadata_json ->> 'source' = 'vault')::int as vault_events,
        count(*) filter (where metadata_json ->> 'source' = 'assistant')::int as assistant_events
     from study_activity_events
     where user_id = $1
       and occurred_at >= ($2::date - interval '7 day')`,
    [userId, scoreDate]
  );

  const reportsRes = await client.query(
    `select payload_json
     from weekly_reports
     where user_id = $1
     order by week_end desc
     limit 2`,
    [userId]
  );

  const reportAverages = reportsRes.rows.map((row: any) => {
    const payload = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json;
    const topics = Array.isArray(payload?.topicProgress) ? payload.topicProgress : [];
    if (topics.length === 0) return 0;
    const sum = topics.reduce((acc: number, topic: any) => acc + Number(topic?.completion || 0), 0);
    return sum / topics.length;
  });

  const topicTrendDelta = reportAverages.length >= 2
    ? (reportAverages[0] - reportAverages[1]) / 100
    : 0;

  const prevRes = await client.query(
    `select risk_score, momentum_score
     from student_score_snapshots
     where user_id = $1
       and score_date < $2::date
     order by score_date desc
     limit 1`,
    [userId, scoreDate]
  );

  return {
    approvedSessions14: Number(sessionsRes.rows[0]?.approved_sessions || 0),
    rejectedSessions14: Number(sessionsRes.rows[0]?.rejected_sessions || 0),
    streakCurrent: Number(streakRes.rows[0]?.current || 0),
    streakBreaks14: Number(breaksRes.rows[0]?.breaks || 0),
    practiceEvents7: Number(practiceRes.rows[0]?.events || 0),
    practiceMinutes7: Number(practiceRes.rows[0]?.minutes || 0),
    topicTrendDelta,
    vaultEvents7: Number(engagementRes.rows[0]?.vault_events || 0),
    assistantEvents7: Number(engagementRes.rows[0]?.assistant_events || 0),
    previousRiskScore: prevRes.rows[0]?.risk_score != null ? Number(prevRes.rows[0].risk_score) : null,
    previousMomentumScore: prevRes.rows[0]?.momentum_score != null ? Number(prevRes.rows[0].momentum_score) : null,
  };
}

async function recomputeAllStudentScores(client: any, scoreDate: string) {
  const users = await client.query(
    `select id
     from users
     where role = 'STUDENT'
       and student_id is not null
     order by id asc`
  );

  let processed = 0;
  for (const row of users.rows) {
    const userId = row.id as string;
    const metrics = await computeStudentMetrics(client, userId, scoreDate);
    const scored = computeScoreSnapshot(metrics);

    await client.query(
      `insert into student_score_snapshots
         (user_id, score_date, risk_score, momentum_score, reasons_json, metrics_json, recommended_actions_json)
       values ($1, $2::date, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)
       on conflict (user_id, score_date)
       do update set
         risk_score = excluded.risk_score,
         momentum_score = excluded.momentum_score,
         reasons_json = excluded.reasons_json,
         metrics_json = excluded.metrics_json,
         recommended_actions_json = excluded.recommended_actions_json,
         created_at = now()`,
      [
        userId,
        scoreDate,
        scored.riskScore,
        scored.momentumScore,
        JSON.stringify(scored.reasons),
        JSON.stringify(scored.metrics),
        JSON.stringify(scored.recommendedActions),
      ]
    );

    processed += 1;
  }

  return { processed, scoreDate };
}

const auditWriter = async (client: any, entry: any) => {
  try {
    await writeAuditLog(client, entry);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[job-worker] audit log failed', err);
  }
};

async function processJob(client: any, job: any) {
  const payload = job.payload_json || {};

  if (job.job_type === 'payroll_generate') {
    const adminId = payload.adminId;
    const weekStart = payload.weekStart;
    const result = await generatePayrollWeek(
      client,
      { weekStart },
      adminId,
      { ip: null, userAgent: null, correlationId: job.id },
      auditWriter
    );
    if ('error' in result) {
      throw new Error(result.error);
    }
    return { invoices: result.invoices, weekStart };
  }

  if (job.job_type === 'audit_export_csv') {
    const csv = await buildAuditCsv(client, payload.filters || {});
    return { csv, filename: 'audit-export.csv', contentType: 'text/csv; charset=utf-8' };
  }

  if (job.job_type === 'payroll_week_csv') {
    const csv = await buildPayrollCsv(client, payload.weekStart);
    return { csv, filename: `payroll-${payload.weekStart}.csv`, contentType: 'text/csv' };
  }

  if (job.job_type === 'retention_cleanup') {
    const result = await runRetentionCleanup(client, new Date());
    return { summary: result.summary, event: result.event };
  }

  if (job.job_type === 'score_recompute') {
    const scoreDate = toDateOnly();
    const result = await recomputeAllStudentScores(client, scoreDate);
    return result;
  }

  throw new Error(`unknown_job_type:${job.job_type}`);
}

async function runOnce() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const job = await claimNextJob(client);
    if (!job) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query('COMMIT');

    try {
      const result = await processJob(client, job);
      await completeJob(client, job.id, result);
      if (job.job_type === 'audit_export_csv' || job.job_type === 'payroll_week_csv') {
        await auditWriter(client, {
          actorUserId: payloadAdminId(job),
          actorRole: 'ADMIN',
          action: 'job.csv.export',
          entityType: 'job',
          entityId: job.id,
          meta: safeAuditMeta({ jobType: job.job_type, filename: result.filename }),
          correlationId: job.id
        });
      }
    } catch (err: any) {
      await failJob(client, job.id, err?.message ?? 'job_failed');
    }

    return true;
  } finally {
    client.release();
  }
}

function payloadAdminId(job: any) {
  const payload = job.payload_json || {};
  return payload.adminId ?? null;
}

async function run() {
  const processed = await runOnce();
  if (!processed) {
    // eslint-disable-next-line no-console
    console.log('[job-worker] no pending jobs');
  }
}

run()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[job-worker] failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
