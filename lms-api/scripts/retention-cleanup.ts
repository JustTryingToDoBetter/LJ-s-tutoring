import 'dotenv/config';
import { Pool } from 'pg';
import { runRetentionCleanup } from '../src/lib/retention-cleanup.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({ connectionString: databaseUrl });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await runRetentionCleanup(client, new Date());
    await client.query('COMMIT');
    console.log('[retention] config', result.config);
    console.log('[retention] summary', result.summary);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

run()
  .catch((err) => {
    console.error('[retention] failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
