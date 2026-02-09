import 'dotenv/config';
import { Pool } from 'pg';
import { claimNextJob, completeJob, failJob } from '../src/lib/job-queue.js';
import { buildAuditCsv } from '../src/lib/audit-export.js';
import { buildPayrollCsv } from '../src/lib/payroll-export.js';
import { generatePayrollWeek } from '../src/domains/admin/payroll/service.js';
import { safeAuditMeta, writeAuditLog } from '../src/lib/audit.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({ connectionString: databaseUrl });

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
