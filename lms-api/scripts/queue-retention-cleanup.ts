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
    const job = await enqueueJob(client, 'retention_cleanup', { requestedAt: new Date().toISOString() });
    console.log('[retention] queued', job.id);
  } finally {
    client.release();
  }
}

run()
  .catch((err) => {
    console.error('[retention] queue failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
