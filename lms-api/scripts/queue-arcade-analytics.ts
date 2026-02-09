import 'dotenv/config';
import { Pool } from 'pg';
import { enqueueJob } from '../src/lib/job-queue.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({ connectionString: databaseUrl });

async function run() {
  const client = await pool.connect();
  try {
    const refreshJob = await enqueueJob(client, 'arcade_analytics_refresh', { requestedAt: new Date().toISOString() });
    const reconJob = await enqueueJob(client, 'arcade_reconciliation', { requestedAt: new Date().toISOString() });
    console.log('[arcade] queued refresh', refreshJob.id);
    console.log('[arcade] queued reconciliation', reconJob.id);
  } finally {
    client.release();
  }
}

run()
  .catch((err) => {
    console.error('[arcade] queue failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
