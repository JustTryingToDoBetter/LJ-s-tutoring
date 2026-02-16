import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAdmin, requireAuth, requireRole, requireTutor } from '../lib/rbac.js';
import { parsePagination } from '../lib/pagination.js';
import { enqueueJob } from '../lib/job-queue.js';
import { moderateCommunityText, sanitizeNickname } from '../lib/community-safety.js';
import { computeScoreSnapshot } from '../lib/predictive-scoring.js';
import { findCareerGoal, loadCareerGoals, type CareerGoal } from '../lib/career-goals.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const COMMUNITY_DAILY_XP_CAP = 80;

const PagingSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const RecomputeSchema = z.object({
  userId: z.string().uuid().optional(),
});

const StudyRoomCreateSchema = z.object({
  subject: z.string().trim().min(2).max(80),
  grade: z.string().trim().min(1).max(20).optional(),
});

const StudyRoomMessageSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

const PinnedResourceSchema = z.object({
  title: z.string().trim().min(1).max(120),
  url: z.string().url().max(500),
});

const ChallengeCreateSchema = z.object({
  title: z.string().trim().min(3).max(180),
  subject: z.string().trim().min(2).max(80),
  grade: z.string().trim().min(1).max(20).optional(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  xpReward: z.coerce.number().int().min(1).max(500),
});

const ChallengeSubmissionSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

const QuestionCreateSchema = z.object({
  subject: z.string().trim().min(2).max(80),
  topic: z.string().trim().min(2).max(80),
  title: z.string().trim().min(4).max(180),
  body: z.string().trim().min(8).max(5000),
});

const AnswerCreateSchema = z.object({
  body: z.string().trim().min(2).max(5000),
});

const ModerationReportSchema = z.object({
  targetType: z.enum(['QUESTION', 'ANSWER', 'ROOM_MESSAGE']),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(4).max(1000),
});

const ModerationTargetParamSchema = z.object({
  targetType: z.enum(['QUESTION', 'ANSWER', 'ROOM_MESSAGE']),
  id: z.string().uuid(),
});

const BlockSchema = z.object({
  blockedUserId: z.string().uuid(),
});

const CommunityProfilePatchSchema = z.object({
  nickname: z.string().trim().min(2).max(40).optional(),
  privacySettings: z.object({
    leaderboardOptIn: z.boolean().optional(),
    showFullName: z.boolean().optional(),
  }).optional(),
});

const CareerSelectionSchema = z.object({
  goalIds: z.array(z.string().trim().min(1).max(100)).min(1).max(5),
});

const CareerTutorParamSchema = z.object({
  studentId: z.string().uuid(),
});

function toDateOnly(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function setPrivateNoStore(reply: any) {
  reply.header('Cache-Control', 'private, no-store, max-age=0');
  reply.header('Pragma', 'no-cache');
}

function isModerator(role: string) {
  return role === 'ADMIN' || role === 'TUTOR';
}

async function ensureStreakRow(client: any, userId: string) {
  await client.query(
    `insert into study_streaks (user_id, current, longest, xp)
     values ($1, 0, 0, 0)
     on conflict (user_id) do nothing`,
    [userId]
  );
}

async function getStudentIdForUser(userId: string) {
  const res = await pool.query(`select student_id from users where id = $1`, [userId]);
  return (res.rows[0]?.student_id as string | null) ?? null;
}

async function userCanAccessStudent(userId: string, role: 'ADMIN' | 'TUTOR' | 'STUDENT', studentId: string, tutorId?: string) {
  if (role === 'ADMIN') return true;
  if (role === 'STUDENT') {
    const own = await getStudentIdForUser(userId);
    return own === studentId;
  }
  if (role === 'TUTOR' && tutorId) {
    const linked = await pool.query(
      `select 1
       from tutor_student_map
       where tutor_id = $1 and student_id = $2
       limit 1`,
      [tutorId, studentId]
    );
    if (Number(linked.rowCount || 0) > 0) return true;

    const fallback = await pool.query(
      `select 1
       from assignments
       where tutor_id = $1 and student_id = $2 and active = true
       limit 1`,
      [tutorId, studentId]
    );
    return Number(fallback.rowCount || 0) > 0;
  }
  return false;
}

async function getBlockedUserIds(userId: string) {
  const res = await pool.query(
    `select blocked_user_id
     from community_blocks
     where blocker_user_id = $1`,
    [userId]
  );
  return res.rows.map((row) => row.blocked_user_id as string);
}

async function buildDefaultNickname(userId: string) {
  const res = await pool.query(
    `select s.full_name
     from users u
     left join students s on s.id = u.student_id
     where u.id = $1`,
    [userId]
  );

  const fullName = (res.rows[0]?.full_name as string | null) ?? '';
  const firstName = fullName.trim().split(/\s+/)[0] ?? '';
  if (firstName) return sanitizeNickname(firstName, `Learner-${userId.slice(0, 6)}`);
  return `Learner-${userId.slice(0, 6)}`;
}

async function ensureCommunityProfile(userId: string) {
  const existing = await pool.query(
    `select user_id, nickname, privacy_settings_json, created_at, updated_at
     from community_profiles
     where user_id = $1`,
    [userId]
  );
  if (Number(existing.rowCount || 0) > 0) return existing.rows[0];

  const nickname = await buildDefaultNickname(userId);
  const created = await pool.query(
    `insert into community_profiles (user_id, nickname, privacy_settings_json)
     values ($1, $2, $3::jsonb)
     returning user_id, nickname, privacy_settings_json, created_at, updated_at`,
    [userId, nickname, JSON.stringify({ leaderboardOptIn: false, showFullName: false })]
  );
  return created.rows[0];
}

async function awardCommunityXp(client: any, userId: string, requestedXp: number, rewardKey: string, referenceId: string) {
  const xpTarget = Math.max(0, Math.min(60, Math.round(requestedXp)));
  if (xpTarget <= 0) return { grantedXp: 0, capped: false };

  const earnedRes = await client.query(
    `select coalesce(sum((metadata_json ->> 'xp')::int), 0)::int as earned
     from study_activity_events
     where user_id = $1
       and type = 'goal_completed'
       and metadata_json ->> 'source' = 'community_xp'
       and occurred_at::date = current_date`,
    [userId]
  );

  const earned = Number(earnedRes.rows[0]?.earned || 0);
  const grant = Math.max(0, Math.min(xpTarget, COMMUNITY_DAILY_XP_CAP - earned));
  if (grant <= 0) {
    return { grantedXp: 0, capped: true };
  }

  await ensureStreakRow(client, userId);

  const dedupeKey = `community-${rewardKey}-${referenceId}-${toDateOnly()}`;
  const inserted = await client.query(
    `insert into study_activity_events (user_id, type, occurred_at, metadata_json, dedupe_key)
     select $1, 'goal_completed', now(), $2::jsonb, $3
     where not exists (
       select 1
       from study_activity_events existing
       where existing.user_id = $1
         and existing.dedupe_key = $3
     )
     returning id`,
    [userId, JSON.stringify({ source: 'community_xp', xp: grant, rewardKey, referenceId }), dedupeKey]
  );

  if (Number(inserted.rowCount || 0) === 0) {
    return { grantedXp: 0, capped: false };
  }

  await client.query(
    `update study_streaks
     set xp = xp + $2,
         updated_at = now()
     where user_id = $1`,
    [userId, grant]
  );

  return { grantedXp: grant, capped: grant < xpTarget };
}

async function computeStudentMetrics(userId: string, scoreDate: string) {
  const sessionsRes = await pool.query(
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

  const streakRes = await pool.query(
    `select current::int as current
     from study_streaks
     where user_id = $1`,
    [userId]
  );

  const breaksRes = await pool.query(
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

  const practiceRes = await pool.query(
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

  const engagementRes = await pool.query(
    `select
        count(*) filter (where metadata_json ->> 'source' = 'vault')::int as vault_events,
        count(*) filter (where metadata_json ->> 'source' = 'assistant')::int as assistant_events
     from study_activity_events
     where user_id = $1
       and occurred_at >= ($2::date - interval '7 day')`,
    [userId, scoreDate]
  );

  const reportsRes = await pool.query(
    `select payload_json
     from weekly_reports
     where user_id = $1
     order by week_end desc
     limit 2`,
    [userId]
  );

  const reportAverages = reportsRes.rows.map((row) => {
    const payload = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json;
    const topics = Array.isArray(payload?.topicProgress) ? payload.topicProgress : [];
    if (topics.length === 0) return 0;
    const sum = topics.reduce((acc: number, topic: any) => acc + Number(topic?.completion || 0), 0);
    return sum / topics.length;
  });

  const topicTrendDelta = reportAverages.length >= 2
    ? (reportAverages[0] - reportAverages[1]) / 100
    : 0;

  const prevRes = await pool.query(
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

async function recomputeUserScore(client: any, userId: string, scoreDate: string) {
  const metrics = await computeStudentMetrics(userId, scoreDate);
  const scored = computeScoreSnapshot(metrics);

  const res = await client.query(
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
       created_at = now()
     returning id, user_id, score_date, risk_score, momentum_score, reasons_json, metrics_json, recommended_actions_json, created_at`,
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

  return res.rows[0];
}

async function recomputeCareerSnapshot(client: any, userId: string, goal: CareerGoal) {
  const reportRes = await client.query(
    `select payload_json
     from weekly_reports
     where user_id = $1
     order by week_end desc
     limit 1`,
    [userId]
  );

  const streakRes = await client.query(
    `select current::int as current
     from study_streaks
     where user_id = $1`,
    [userId]
  );

  const activityRes = await client.query(
    `select coalesce(sum(
      case
        when (metadata_json ->> 'durationMinutes') ~ '^[0-9]+$' then (metadata_json ->> 'durationMinutes')::int
        else 0
      end
    ), 0)::int as minutes
     from study_activity_events
     where user_id = $1
       and occurred_at >= (current_date - interval '7 day')`,
    [userId]
  );

  const payload = reportRes.rows[0]?.payload_json
    ? (typeof reportRes.rows[0].payload_json === 'string' ? JSON.parse(reportRes.rows[0].payload_json) : reportRes.rows[0].payload_json)
    : {};
  const topics = Array.isArray(payload?.topicProgress) ? payload.topicProgress : [];

  const subjectMatchCount = goal.recommendedSubjects.reduce((acc, subject) => {
    const found = topics.some((topic: any) => String(topic?.topic || '').toLowerCase().includes(subject.toLowerCase().split(' ')[0]));
    return acc + (found ? 1 : 0);
  }, 0);

  const subjectCoverage = goal.recommendedSubjects.length > 0
    ? (subjectMatchCount / goal.recommendedSubjects.length) * 100
    : 0;

  const averageCompletion = topics.length
    ? topics.reduce((acc: number, topic: any) => acc + Number(topic?.completion || 0), 0) / topics.length
    : 0;

  const streakScore = Math.min(100, Number(streakRes.rows[0]?.current || 0) * 10);
  const practiceMinutes = Number(activityRes.rows[0]?.minutes || 0);
  const practiceScore = Math.min(100, Math.round(practiceMinutes * 0.45));

  const alignmentScore = Math.max(0, Math.min(100, Math.round(
    subjectCoverage * 0.35 +
    averageCompletion * 0.3 +
    streakScore * 0.2 +
    practiceScore * 0.15
  )));

  const reasons = [
    `Subject coverage across goal requirements: ${Math.round(subjectCoverage)}%.`,
    `Average topic completion from weekly report: ${Math.round(averageCompletion)}%.`,
    `Current streak contribution: ${Math.round(streakScore)}.`
  ];

  const metrics = {
    subjectCoverage: Number(subjectCoverage.toFixed(2)),
    averageCompletion: Number(averageCompletion.toFixed(2)),
    streakScore,
    practiceMinutes,
    practiceScore,
  };

  await client.query(
    `insert into career_progress_snapshots (user_id, goal_id, alignment_score, reasons_json, metrics_json)
     values ($1, $2, $3, $4::jsonb, $5::jsonb)`,
    [userId, goal.id, alignmentScore, JSON.stringify(reasons), JSON.stringify(metrics)]
  );

  return {
    goalId: goal.id,
    alignmentScore,
    reasons,
    metrics,
  };
}

export async function phase3Routes(app: FastifyInstance) {
  app.get('/scores/me', {
    preHandler: [app.authenticate, requireAuth, requireRole('STUDENT')],
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    const userId = req.user!.userId;

    let snapshotRes = await pool.query(
      `select id, score_date, risk_score, momentum_score, reasons_json, metrics_json, recommended_actions_json, created_at
       from student_score_snapshots
       where user_id = $1
       order by score_date desc
       limit 1`,
      [userId]
    );

    if (snapshotRes.rowCount === 0) {
      const client = await pool.connect();
      try {
        const today = toDateOnly();
        const recomputed = await recomputeUserScore(client, userId, today);
        snapshotRes = { rows: [recomputed], rowCount: 1 } as any;
      } finally {
        client.release();
      }
    }

    const snapshot = snapshotRes.rows[0];
    return reply.send({
      snapshot: {
        id: snapshot.id,
        date: toDateOnly(new Date(snapshot.score_date)),
        riskScore: Number(snapshot.risk_score),
        momentumScore: Number(snapshot.momentum_score),
        reasons: typeof snapshot.reasons_json === 'string' ? JSON.parse(snapshot.reasons_json) : snapshot.reasons_json,
        metrics: typeof snapshot.metrics_json === 'string' ? JSON.parse(snapshot.metrics_json) : snapshot.metrics_json,
        recommendedActions: typeof snapshot.recommended_actions_json === 'string'
          ? JSON.parse(snapshot.recommended_actions_json)
          : snapshot.recommended_actions_json,
        createdAt: snapshot.created_at,
      }
    });
  });

  app.get('/tutor/scores', {
    preHandler: [app.authenticate, requireAuth, requireTutor],
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    const parsed = PagingSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const { page, pageSize, offset, limit } = parsePagination(parsed.data, { pageSize: 20 });

    const rows = await pool.query(
      `select
          s.id as student_id,
          s.full_name as student_name,
          latest.risk_score,
          latest.momentum_score,
          latest.score_date,
          latest.reasons_json,
          latest.recommended_actions_json
       from students s
       join tutor_student_map tsm on tsm.student_id = s.id and tsm.tutor_id = $1
       left join users u on u.student_id = s.id
       left join lateral (
          select risk_score, momentum_score, score_date, reasons_json, recommended_actions_json
          from student_score_snapshots ss
          where ss.user_id = u.id
          order by score_date desc
          limit 1
       ) latest on true
       order by latest.risk_score desc nulls last, s.full_name asc
       limit $2 offset $3`,
      [req.user!.tutorId, limit, offset]
    );

    const totalRes = await pool.query(
      `select count(*)::int as total
       from tutor_student_map
       where tutor_id = $1`,
      [req.user!.tutorId]
    );

    return reply.send({
      items: rows.rows.map((row) => ({
        studentId: row.student_id,
        studentName: row.student_name,
        riskScore: row.risk_score == null ? null : Number(row.risk_score),
        momentumScore: row.momentum_score == null ? null : Number(row.momentum_score),
        scoreDate: row.score_date ? toDateOnly(new Date(row.score_date)) : null,
        reasons: row.reasons_json ? (typeof row.reasons_json === 'string' ? JSON.parse(row.reasons_json) : row.reasons_json) : [],
        recommendedActions: row.recommended_actions_json
          ? (typeof row.recommended_actions_json === 'string' ? JSON.parse(row.recommended_actions_json) : row.recommended_actions_json)
          : [],
      })),
      total: Number(totalRes.rows[0]?.total || 0),
      page,
      pageSize,
    });
  });

  app.post('/admin/scores/recompute', {
    preHandler: [app.authenticate, requireAuth, requireAdmin],
  }, async (req, reply) => {
    const parsed = RecomputeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const scoreDate = toDateOnly();
    let targetUsers: string[] = [];

    if (parsed.data.userId) {
      targetUsers = [parsed.data.userId];
    } else {
      const usersRes = await pool.query(
        `select id
         from users
         where role = 'STUDENT'
           and student_id is not null
         order by id asc`
      );
      targetUsers = usersRes.rows.map((row) => row.id as string);
    }

    const client = await pool.connect();
    const snapshots: any[] = [];
    try {
      for (const userId of targetUsers) {
        const snapshot = await recomputeUserScore(client, userId, scoreDate);
        snapshots.push(snapshot);
      }
    } finally {
      client.release();
    }

    return reply.send({ ok: true, processed: snapshots.length, scoreDate, snapshots });
  });

  app.post('/jobs/scores/daily', {
    config: {
      rateLimit: {
        max: 6,
        timeWindow: '1 minute',
      }
    }
  }, async (req, reply) => {
    const expected = process.env.SCORE_CRON_TOKEN?.trim();
    if (!expected) {
      return reply.code(503).send({ error: 'cron_token_not_configured' });
    }

    const incoming = (req.headers['x-cron-token'] as string | undefined)?.trim();
    if (!incoming || incoming !== expected) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const job = await enqueueJob(pool, 'score_recompute', {
      requestedAt: new Date().toISOString(),
      requestId: req.id,
    });

    return reply.code(202).send({ ok: true, jobId: job.id, status: job.status });
  });

  app.get('/community/profile/me', {
    preHandler: [app.authenticate, requireAuth],
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    const profile = await ensureCommunityProfile(req.user!.userId);
    return reply.send({
      profile: {
        userId: profile.user_id,
        nickname: profile.nickname,
        privacySettings: typeof profile.privacy_settings_json === 'string'
          ? JSON.parse(profile.privacy_settings_json)
          : profile.privacy_settings_json,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      }
    });
  });

  app.patch('/community/profile/me', {
    preHandler: [app.authenticate, requireAuth],
  }, async (req, reply) => {
    const parsed = CommunityProfilePatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const existing = await ensureCommunityProfile(req.user!.userId);
    const currentPrivacy = typeof existing.privacy_settings_json === 'string'
      ? JSON.parse(existing.privacy_settings_json)
      : existing.privacy_settings_json;

    const nextNickname = sanitizeNickname(parsed.data.nickname ?? existing.nickname, existing.nickname);
    const nextPrivacy = {
      ...currentPrivacy,
      ...(parsed.data.privacySettings || {}),
    };

    const updated = await pool.query(
      `update community_profiles
       set nickname = $2,
           privacy_settings_json = $3::jsonb,
           updated_at = now()
       where user_id = $1
       returning user_id, nickname, privacy_settings_json, updated_at`,
      [req.user!.userId, nextNickname, JSON.stringify(nextPrivacy)]
    );

    return reply.send({
      profile: {
        userId: updated.rows[0].user_id,
        nickname: updated.rows[0].nickname,
        privacySettings: typeof updated.rows[0].privacy_settings_json === 'string'
          ? JSON.parse(updated.rows[0].privacy_settings_json)
          : updated.rows[0].privacy_settings_json,
        updatedAt: updated.rows[0].updated_at,
      }
    });
  });

  app.get('/community/rooms', {
    preHandler: [app.authenticate, requireAuth],
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    const parsed = PagingSchema.extend({
      subject: z.string().trim().max(80).optional(),
      grade: z.string().trim().max(20).optional(),
    }).safeParse(req.query);

    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const { page, pageSize, offset, limit } = parsePagination(parsed.data, { pageSize: 20 });
    const params: any[] = [];
    const where: string[] = [];

    if (parsed.data.subject) {
      params.push(parsed.data.subject);
      where.push(`sr.subject = $${params.length}`);
    }
    if (parsed.data.grade) {
      params.push(parsed.data.grade);
      where.push(`sr.grade = $${params.length}`);
    }

    const whereSql = where.length ? `where ${where.join(' and ')}` : '';

    const rows = await pool.query(
      `select sr.id, sr.subject, sr.grade, sr.created_at,
              (select count(*)::int from study_room_members m where m.room_id = sr.id) as member_count,
              exists (
                select 1 from study_room_members own
                where own.room_id = sr.id and own.user_id = $${params.length + 1}
              ) as is_member
       from study_rooms sr
       ${whereSql}
       order by sr.created_at desc
       limit $${params.length + 2} offset $${params.length + 3}`,
      [...params, req.user!.userId, limit, offset]
    );

    const totalRes = await pool.query(
      `select count(*)::int as total from study_rooms sr ${whereSql}`,
      params
    );

    return reply.send({
      items: rows.rows,
      total: Number(totalRes.rows[0]?.total || 0),
      page,
      pageSize,
    });
  });

  app.post('/community/rooms', {
    preHandler: [app.authenticate, requireAuth],
    config: {
      rateLimit: {
        max: 15,
        timeWindow: '1 minute',
      }
    }
  }, async (req, reply) => {
    if (!['STUDENT', 'TUTOR', 'ADMIN'].includes(req.user!.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const parsed = StudyRoomCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const room = await client.query(
        `insert into study_rooms (subject, grade, created_by)
         values ($1, $2, $3)
         returning id, subject, grade, created_by, created_at`,
        [parsed.data.subject, parsed.data.grade ?? null, req.user!.userId]
      );

      await client.query(
        `insert into study_room_members (room_id, user_id)
         values ($1, $2)
         on conflict do nothing`,
        [room.rows[0].id, req.user!.userId]
      );

      await client.query('COMMIT');
      return reply.code(201).send({ room: room.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/community/rooms/:id/join', {
    preHandler: [app.authenticate, requireAuth],
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute',
      }
    }
  }, async (req, reply) => {
    const parsed = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const exists = await pool.query(`select id from study_rooms where id = $1`, [parsed.data.id]);
    if (exists.rowCount === 0) {
      return reply.code(404).send({ error: 'room_not_found' });
    }

    await pool.query(
      `insert into study_room_members (room_id, user_id)
       values ($1, $2)
       on conflict do nothing`,
      [parsed.data.id, req.user!.userId]
    );

    return reply.send({ ok: true });
  });

  app.get('/community/rooms/:id/messages', {
    preHandler: [app.authenticate, requireAuth],
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    const parsed = z.object({ id: z.string().uuid() }).merge(PagingSchema).safeParse({
      id: (req.params as any)?.id,
      ...(req.query as any || {}),
    });
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const memberRes = await pool.query(
      `select 1 from study_room_members where room_id = $1 and user_id = $2`,
      [parsed.data.id, req.user!.userId]
    );
    if (memberRes.rowCount === 0) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { page, pageSize, offset, limit } = parsePagination(parsed.data, { pageSize: 30 });
    const blocked = await getBlockedUserIds(req.user!.userId);
    const blockedFilterSql = blocked.length ? `and m.user_id <> all($4::uuid[])` : '';

    const rows = await pool.query(
      `select m.id, m.room_id, m.user_id, m.content, m.moderation_state, m.created_at,
              cp.nickname,
              u.role,
              st.full_name as student_name
       from study_room_messages m
       join users u on u.id = m.user_id
       left join students st on st.id = u.student_id
       left join community_profiles cp on cp.user_id = m.user_id
       where m.room_id = $1
         ${isModerator(req.user!.role) ? '' : `and m.moderation_state = 'VISIBLE'`}
         ${blockedFilterSql}
       order by m.created_at desc
       limit $2 offset $3`,
      blocked.length
        ? [parsed.data.id, limit, offset, blocked]
        : [parsed.data.id, limit, offset]
    );

    const totalRes = await pool.query(
      `select count(*)::int as total
       from study_room_messages m
       where m.room_id = $1
         ${isModerator(req.user!.role) ? '' : `and m.moderation_state = 'VISIBLE'`}`,
      [parsed.data.id]
    );

    return reply.send({
      items: rows.rows,
      total: Number(totalRes.rows[0]?.total || 0),
      page,
      pageSize,
    });
  });

  app.post('/community/rooms/:id/messages', {
    preHandler: [app.authenticate, requireAuth],
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
      }
    }
  }, async (req, reply) => {
    if (!['STUDENT', 'TUTOR', 'ADMIN'].includes(req.user!.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    const body = StudyRoomMessageSchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        details: {
          params: params.success ? null : params.error.flatten(),
          body: body.success ? null : body.error.flatten(),
        }
      });
    }

    const memberRes = await pool.query(
      `select 1 from study_room_members where room_id = $1 and user_id = $2`,
      [params.data.id, req.user!.userId]
    );
    if (memberRes.rowCount === 0) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const moderation = moderateCommunityText(body.data.content);

    const inserted = await pool.query(
      `insert into study_room_messages (room_id, user_id, content, moderation_state)
       values ($1, $2, $3, $4)
       returning id, room_id, user_id, content, moderation_state, created_at`,
      [params.data.id, req.user!.userId, body.data.content, moderation.state]
    );

    return reply.code(201).send({
      message: inserted.rows[0],
      moderationFlags: moderation.flags,
    });
  });

  app.get('/community/rooms/:id/resources', {
    preHandler: [app.authenticate, requireAuth],
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }

    const memberRes = await pool.query(
      `select 1 from study_room_members where room_id = $1 and user_id = $2`,
      [params.data.id, req.user!.userId]
    );
    if (memberRes.rowCount === 0) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const rows = await pool.query(
      `select id, title, url, created_by, created_at
       from study_room_pinned_resources
       where room_id = $1
       order by created_at desc`,
      [params.data.id]
    );

    return reply.send({ items: rows.rows });
  });

  app.post('/community/rooms/:id/resources', {
    preHandler: [app.authenticate, requireAuth],
  }, async (req, reply) => {
    if (!isModerator(req.user!.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    const body = PinnedResourceSchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        details: {
          params: params.success ? null : params.error.flatten(),
          body: body.success ? null : body.error.flatten(),
        }
      });
    }

    const inserted = await pool.query(
      `insert into study_room_pinned_resources (room_id, title, url, created_by)
       values ($1, $2, $3, $4)
       returning id, room_id, title, url, created_by, created_at`,
      [params.data.id, body.data.title, body.data.url, req.user!.userId]
    );

    return reply.code(201).send({ resource: inserted.rows[0] });
  });

  app.get('/community/challenges', {
    preHandler: [app.authenticate, requireAuth],
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    const parsed = PagingSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const { page, pageSize, offset, limit } = parsePagination(parsed.data, { pageSize: 20 });

    const rows = await pool.query(
      `select c.id, c.title, c.subject, c.grade, c.week_start, c.week_end, c.xp_reward, c.created_at,
              exists (
                select 1 from challenge_submissions cs
                where cs.challenge_id = c.id and cs.user_id = $1
              ) as has_submitted
       from challenges c
       order by c.week_start desc, c.created_at desc
       limit $2 offset $3`,
      [req.user!.userId, limit, offset]
    );

    const totalRes = await pool.query(`select count(*)::int as total from challenges`);

    return reply.send({
      items: rows.rows,
      total: Number(totalRes.rows[0]?.total || 0),
      page,
      pageSize,
    });
  });

  app.post('/community/challenges', {
    preHandler: [app.authenticate, requireAuth],
  }, async (req, reply) => {
    if (!isModerator(req.user!.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const parsed = ChallengeCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const challenge = await pool.query(
      `insert into challenges (title, subject, grade, week_start, week_end, xp_reward, created_by)
       values ($1, $2, $3, $4::date, $5::date, $6, $7)
       returning id, title, subject, grade, week_start, week_end, xp_reward, created_by, created_at`,
      [
        parsed.data.title,
        parsed.data.subject,
        parsed.data.grade ?? null,
        parsed.data.weekStart,
        parsed.data.weekEnd,
        parsed.data.xpReward,
        req.user!.userId,
      ]
    );

    return reply.code(201).send({ challenge: challenge.rows[0] });
  });

  app.post('/community/challenges/:id/submissions', {
    preHandler: [app.authenticate, requireAuth, requireRole('STUDENT')],
    config: {
      rateLimit: {
        max: 12,
        timeWindow: '1 minute',
      }
    }
  }, async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    const body = ChallengeSubmissionSchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        details: {
          params: params.success ? null : params.error.flatten(),
          body: body.success ? null : body.error.flatten(),
        }
      });
    }

    const moderation = moderateCommunityText(body.data.content);
    if (moderation.state === 'FLAGGED') {
      return reply.code(400).send({ error: 'content_flagged', moderationFlags: moderation.flags });
    }

    const challenge = await pool.query(
      `select id, xp_reward from challenges where id = $1`,
      [params.data.id]
    );
    if (challenge.rowCount === 0) {
      return reply.code(404).send({ error: 'challenge_not_found' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `insert into challenge_submissions (challenge_id, user_id, content)
         values ($1, $2, $3)
         on conflict (challenge_id, user_id) do nothing
         returning id, challenge_id, user_id, content, created_at`,
        [params.data.id, req.user!.userId, body.data.content]
      );

      if (inserted.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'already_submitted' });
      }

      const xpAward = await awardCommunityXp(
        client,
        req.user!.userId,
        Number(challenge.rows[0].xp_reward || 0),
        'challenge_submission',
        inserted.rows[0].id as string
      );

      await client.query('COMMIT');
      return reply.code(201).send({
        submission: inserted.rows[0],
        xpAward,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.get('/community/challenges/:id/leaderboard', {
    preHandler: [app.authenticate, requireAuth],
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }

    const rows = await pool.query(
      `select cs.user_id, cs.score, cs.created_at,
              cp.nickname,
              cp.privacy_settings_json,
              st.full_name
       from challenge_submissions cs
       join users u on u.id = cs.user_id
       left join students st on st.id = u.student_id
       left join community_profiles cp on cp.user_id = cs.user_id
       where cs.challenge_id = $1
         and cs.score is not null
       order by cs.score desc, cs.created_at asc
       limit 100`,
      [params.data.id]
    );

    const items = rows.rows
      .map((row, index) => {
        const privacy = row.privacy_settings_json
          ? (typeof row.privacy_settings_json === 'string' ? JSON.parse(row.privacy_settings_json) : row.privacy_settings_json)
          : { leaderboardOptIn: false };

        if (!privacy.leaderboardOptIn) {
          return null;
        }

        return {
          rank: index + 1,
          userId: row.user_id,
          nickname: row.nickname || sanitizeNickname((row.full_name || '').split(' ')[0] || 'Learner', 'Learner'),
          score: Number(row.score || 0),
        };
      })
      .filter(Boolean);

    return reply.send({ items });
  });

  app.get('/community/questions', {
    preHandler: [app.authenticate, requireAuth],
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    const parsed = PagingSchema.extend({
      subject: z.string().trim().max(80).optional(),
      topic: z.string().trim().max(80).optional(),
      status: z.enum(['OPEN', 'RESOLVED', 'CLOSED']).optional(),
    }).safeParse(req.query);

    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const { page, pageSize, offset, limit } = parsePagination(parsed.data, { pageSize: 20 });
    const params: any[] = [];
    const filters: string[] = [];

    if (!isModerator(req.user!.role)) {
      filters.push(`q.moderation_state = 'VISIBLE'`);
    }
    if (parsed.data.subject) {
      params.push(parsed.data.subject);
      filters.push(`q.subject = $${params.length}`);
    }
    if (parsed.data.topic) {
      params.push(parsed.data.topic);
      filters.push(`q.topic = $${params.length}`);
    }
    if (parsed.data.status) {
      params.push(parsed.data.status);
      filters.push(`q.status = $${params.length}`);
    }

    const blocked = await getBlockedUserIds(req.user!.userId);
    if (blocked.length > 0) {
      params.push(blocked);
      filters.push(`q.user_id <> all($${params.length}::uuid[])`);
    }

    const where = filters.length ? `where ${filters.join(' and ')}` : '';

    const rows = await pool.query(
      `select q.id, q.user_id, q.subject, q.topic, q.title, q.body, q.status, q.moderation_state, q.created_at,
              cp.nickname,
              (select count(*)::int from answers a where a.question_id = q.id and a.moderation_state = 'VISIBLE') as answer_count,
              (select a2.id from answers a2 where a2.question_id = q.id and a2.is_verified = true order by a2.created_at asc limit 1) as verified_answer_id
       from questions q
       left join community_profiles cp on cp.user_id = q.user_id
       ${where}
       order by q.created_at desc
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limit, offset]
    );

    const totalRes = await pool.query(
      `select count(*)::int as total
       from questions q
       ${where}`,
      params
    );

    return reply.send({
      items: rows.rows,
      total: Number(totalRes.rows[0]?.total || 0),
      page,
      pageSize,
    });
  });

  app.post('/community/questions', {
    preHandler: [app.authenticate, requireAuth, requireRole('STUDENT')],
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      }
    }
  }, async (req, reply) => {
    const parsed = QuestionCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const moderation = moderateCommunityText(`${parsed.data.title}\n${parsed.data.body}`);
    const question = await pool.query(
      `insert into questions (user_id, subject, topic, title, body, moderation_state)
       values ($1, $2, $3, $4, $5, $6)
       returning id, user_id, subject, topic, title, body, status, moderation_state, created_at`,
      [
        req.user!.userId,
        parsed.data.subject,
        parsed.data.topic,
        parsed.data.title,
        parsed.data.body,
        moderation.state,
      ]
    );

    return reply.code(201).send({ question: question.rows[0], moderationFlags: moderation.flags });
  });

  app.get('/community/questions/:id/answers', {
    preHandler: [app.authenticate, requireAuth],
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    const parsed = z.object({ id: z.string().uuid() }).merge(PagingSchema).safeParse({
      id: (req.params as any)?.id,
      ...(req.query as any || {}),
    });
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const { page, pageSize, offset, limit } = parsePagination(parsed.data, { pageSize: 20 });
    const blocked = await getBlockedUserIds(req.user!.userId);

    const rows = await pool.query(
      `select a.id, a.question_id, a.user_id, a.body, a.is_verified, a.verified_by, a.moderation_state, a.created_at,
              cp.nickname
       from answers a
       left join community_profiles cp on cp.user_id = a.user_id
       where a.question_id = $1
         ${isModerator(req.user!.role) ? '' : `and a.moderation_state = 'VISIBLE'`}
         ${blocked.length > 0 ? `and a.user_id <> all($4::uuid[])` : ''}
       order by a.is_verified desc, a.created_at asc
       limit $2 offset $3`,
      blocked.length > 0 ? [parsed.data.id, limit, offset, blocked] : [parsed.data.id, limit, offset]
    );

    const totalRes = await pool.query(
      `select count(*)::int as total
       from answers a
       where a.question_id = $1
         ${isModerator(req.user!.role) ? '' : `and a.moderation_state = 'VISIBLE'`}`,
      [parsed.data.id]
    );

    return reply.send({
      items: rows.rows,
      total: Number(totalRes.rows[0]?.total || 0),
      page,
      pageSize,
    });
  });

  app.post('/community/questions/:id/answers', {
    preHandler: [app.authenticate, requireAuth, requireRole('STUDENT')],
    config: {
      rateLimit: {
        max: 12,
        timeWindow: '1 minute',
      }
    }
  }, async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    const body = AnswerCreateSchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        details: {
          params: params.success ? null : params.error.flatten(),
          body: body.success ? null : body.error.flatten(),
        }
      });
    }

    const question = await pool.query(`select id from questions where id = $1`, [params.data.id]);
    if (question.rowCount === 0) {
      return reply.code(404).send({ error: 'question_not_found' });
    }

    const moderation = moderateCommunityText(body.data.body);
    const inserted = await pool.query(
      `insert into answers (question_id, user_id, body, moderation_state)
       values ($1, $2, $3, $4)
       returning id, question_id, user_id, body, is_verified, verified_by, moderation_state, created_at`,
      [params.data.id, req.user!.userId, body.data.body, moderation.state]
    );

    return reply.code(201).send({ answer: inserted.rows[0], moderationFlags: moderation.flags });
  });

  app.post('/community/answers/:id/verify', {
    preHandler: [app.authenticate, requireAuth],
  }, async (req, reply) => {
    if (!isModerator(req.user!.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }

    const answerRes = await pool.query(
      `select a.id, a.user_id, q.user_id as question_user_id
       from answers a
       join questions q on q.id = a.question_id
       where a.id = $1`,
      [params.data.id]
    );

    if (answerRes.rowCount === 0) {
      return reply.code(404).send({ error: 'answer_not_found' });
    }

    const answer = answerRes.rows[0];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `update answers
         set is_verified = true,
             verified_by = $2,
             moderation_state = 'VISIBLE'
         where id = $1`,
        [params.data.id, req.user!.userId]
      );

      await client.query(
        `update questions
         set status = 'RESOLVED'
         where id = (select question_id from answers where id = $1)`,
        [params.data.id]
      );

      const xpAward = await awardCommunityXp(client, answer.user_id as string, 12, 'verified_answer', params.data.id);

      await client.query('COMMIT');
      return reply.send({ ok: true, xpAward });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/community/moderation/report', {
    preHandler: [app.authenticate, requireAuth],
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
      }
    }
  }, async (req, reply) => {
    const parsed = ModerationReportSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const created = await pool.query(
      `insert into community_reports (reporter_id, target_type, target_id, reason)
       values ($1, $2, $3, $4)
       returning id, reporter_id, target_type, target_id, reason, created_at`,
      [req.user!.userId, parsed.data.targetType, parsed.data.targetId, parsed.data.reason]
    );

    return reply.code(201).send({ report: created.rows[0] });
  });

  app.post('/community/moderation/block', {
    preHandler: [app.authenticate, requireAuth],
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
      }
    }
  }, async (req, reply) => {
    const parsed = BlockSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    if (parsed.data.blockedUserId === req.user!.userId) {
      return reply.code(400).send({ error: 'cannot_block_self' });
    }

    await pool.query(
      `insert into community_blocks (blocker_user_id, blocked_user_id)
       values ($1, $2)
       on conflict do nothing`,
      [req.user!.userId, parsed.data.blockedUserId]
    );

    return reply.send({ ok: true });
  });

  app.patch('/community/moderation/:targetType/:id/hide', {
    preHandler: [app.authenticate, requireAuth],
  }, async (req, reply) => {
    if (!isModerator(req.user!.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const parsed = ModerationTargetParamSchema.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    if (parsed.data.targetType === 'QUESTION') {
      await pool.query(`update questions set moderation_state = 'HIDDEN' where id = $1`, [parsed.data.id]);
    } else if (parsed.data.targetType === 'ANSWER') {
      await pool.query(`update answers set moderation_state = 'HIDDEN' where id = $1`, [parsed.data.id]);
    } else {
      await pool.query(`update study_room_messages set moderation_state = 'HIDDEN' where id = $1`, [parsed.data.id]);
    }

    return reply.send({ ok: true });
  });

  app.delete('/community/moderation/:targetType/:id', {
    preHandler: [app.authenticate, requireAuth],
  }, async (req, reply) => {
    if (!isModerator(req.user!.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const parsed = ModerationTargetParamSchema.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    if (parsed.data.targetType === 'QUESTION') {
      await pool.query(`update questions set moderation_state = 'DELETED', status = 'CLOSED' where id = $1`, [parsed.data.id]);
    } else if (parsed.data.targetType === 'ANSWER') {
      await pool.query(`update answers set moderation_state = 'DELETED' where id = $1`, [parsed.data.id]);
    } else {
      await pool.query(`update study_room_messages set moderation_state = 'DELETED' where id = $1`, [parsed.data.id]);
    }

    return reply.send({ ok: true });
  });

  app.get('/career/goals', {
    preHandler: [app.authenticate, requireAuth],
  }, async (_req, reply) => {
    setPrivateNoStore(reply);
    const data = loadCareerGoals();
    return reply.send(data);
  });

  app.post('/career/me/goals', {
    preHandler: [app.authenticate, requireAuth, requireRole('STUDENT')],
  }, async (req, reply) => {
    const parsed = CareerSelectionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const goalsData = loadCareerGoals();
    const validGoalIds = new Set(goalsData.goals.map((goal) => goal.id));
    const dedupedGoalIds = [...new Set(parsed.data.goalIds)];

    for (const goalId of dedupedGoalIds) {
      if (!validGoalIds.has(goalId)) {
        return reply.code(400).send({ error: 'invalid_goal_id', goalId });
      }
    }

    const userId = req.user!.userId;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`delete from career_goal_selections where user_id = $1`, [userId]);

      for (const goalId of dedupedGoalIds) {
        await client.query(
          `insert into career_goal_selections (user_id, goal_id)
           values ($1, $2)`,
          [userId, goalId]
        );
      }

      const snapshots = [];
      for (const goalId of dedupedGoalIds) {
        const goal = findCareerGoal(goalId);
        if (!goal) continue;
        const snapshot = await recomputeCareerSnapshot(client, userId, goal);
        snapshots.push(snapshot);
      }

      await client.query('COMMIT');

      return reply.send({ ok: true, goalIds: dedupedGoalIds, snapshots });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.get('/career/me', {
    preHandler: [app.authenticate, requireAuth, requireRole('STUDENT')],
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    const goalsData = loadCareerGoals();
    const userId = req.user!.userId;

    const selectedRes = await pool.query(
      `select goal_id, created_at
       from career_goal_selections
       where user_id = $1
       order by created_at asc`,
      [userId]
    );

    const selectedGoalIds = selectedRes.rows.map((row) => row.goal_id as string);

    const snapshotsRes = selectedGoalIds.length > 0
      ? await pool.query(
        `select distinct on (goal_id)
            goal_id, alignment_score, reasons_json, metrics_json, created_at
         from career_progress_snapshots
         where user_id = $1
           and goal_id = any($2::text[])
         order by goal_id, created_at desc`,
        [userId, selectedGoalIds]
      )
      : { rows: [] as any[] };

    const latestByGoal = new Map<string, any>();
    snapshotsRes.rows.forEach((row) => latestByGoal.set(String(row.goal_id), row));

    const selectedGoals = selectedGoalIds
      .map((goalId) => {
        const goal = goalsData.goals.find((item) => item.id === goalId);
        if (!goal) return null;
        const snapshot = latestByGoal.get(goalId);
        return {
          goal,
          latestSnapshot: snapshot
            ? {
              alignmentScore: Number(snapshot.alignment_score),
              reasons: typeof snapshot.reasons_json === 'string' ? JSON.parse(snapshot.reasons_json) : snapshot.reasons_json,
              metrics: typeof snapshot.metrics_json === 'string' ? JSON.parse(snapshot.metrics_json) : snapshot.metrics_json,
              createdAt: snapshot.created_at,
            }
            : null,
        };
      })
      .filter(Boolean);

    const recommendedVaultTags = [...new Set(selectedGoals.flatMap((entry: any) => entry.goal.recommendedVaultTags))].slice(0, 12);
    const nextSteps = selectedGoals.flatMap((entry: any) => {
      const reasons = entry.latestSnapshot?.reasons || [];
      return reasons.slice(0, 2);
    }).slice(0, 4);

    return reply.send({
      version: goalsData.version,
      selectedGoals,
      recommendedVaultTags,
      nextSteps,
      emptyState: selectedGoals.length === 0
        ? {
          title: 'No career goals selected yet',
          description: 'Select at least one goal to unlock roadmap recommendations.',
        }
        : null,
    });
  });

  app.get('/tutor/students/:studentId/career', {
    preHandler: [app.authenticate, requireAuth, requireTutor],
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    const params = CareerTutorParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }

    const allowed = await userCanAccessStudent(req.user!.userId, req.user!.role, params.data.studentId, req.user!.tutorId);
    if (!allowed) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const ownerRes = await pool.query(`select id from users where student_id = $1`, [params.data.studentId]);
    if (ownerRes.rowCount === 0) {
      return reply.code(404).send({ error: 'student_user_not_found' });
    }

    const ownerUserId = ownerRes.rows[0].id as string;
    const goalsData = loadCareerGoals();

    const selectedRes = await pool.query(
      `select goal_id
       from career_goal_selections
       where user_id = $1
       order by created_at asc`,
      [ownerUserId]
    );

    const selectedGoalIds = selectedRes.rows.map((row) => row.goal_id as string);
    const snapshotsRes = selectedGoalIds.length > 0
      ? await pool.query(
        `select distinct on (goal_id)
            goal_id, alignment_score, reasons_json, metrics_json, created_at
         from career_progress_snapshots
         where user_id = $1
           and goal_id = any($2::text[])
         order by goal_id, created_at desc`,
        [ownerUserId, selectedGoalIds]
      )
      : { rows: [] as any[] };

    const byGoal = new Map<string, any>();
    snapshotsRes.rows.forEach((row) => byGoal.set(String(row.goal_id), row));

    return reply.send({
      selectedGoals: selectedGoalIds
        .map((goalId) => {
          const goal = goalsData.goals.find((item) => item.id === goalId);
          if (!goal) return null;
          const snapshot = byGoal.get(goalId);
          return {
            goal,
            latestSnapshot: snapshot
              ? {
                alignmentScore: Number(snapshot.alignment_score),
                reasons: typeof snapshot.reasons_json === 'string' ? JSON.parse(snapshot.reasons_json) : snapshot.reasons_json,
                metrics: typeof snapshot.metrics_json === 'string' ? JSON.parse(snapshot.metrics_json) : snapshot.metrics_json,
                createdAt: snapshot.created_at,
              }
              : null,
          };
        })
        .filter(Boolean),
    });
  });
}
