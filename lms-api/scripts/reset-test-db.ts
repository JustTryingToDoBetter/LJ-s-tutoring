import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL_TEST;
if (!databaseUrl) {
  throw new Error('DATABASE_URL_TEST is required');
}
if (process.env.NODE_ENV !== 'test') {
  throw new Error('reset-test-db can only run with NODE_ENV=test');
}

const pool = new Pool({ connectionString: databaseUrl });

const getMigrationsDir = () => path.resolve(process.cwd(), 'prisma/migrations');

async function ensureMigrationsTable(client: any) {
  await client.query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    );
  `);
}

async function applied(client: any, id: string): Promise<boolean> {
  const res = await client.query('select 1 from schema_migrations where id = $1', [id]);
  return res.rowCount > 0;
}

async function markApplied(client: any, id: string) {
  await client.query('insert into schema_migrations (id) values ($1) on conflict do nothing', [id]);
}

async function resetSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('drop schema if exists public cascade');
    await client.query('create schema public');
    await client.query('grant all on schema public to public');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function runMigrations() {
  const dir = getMigrationsDir();
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const folders = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => {
      const priority = (name: string) => {
        if (name.includes('baseline_legacy')) return 0;
        if (name.includes('init_tutor_records')) return 1;
        return 2;
      };
      const pa = priority(a);
      const pb = priority(b);
      if (pa !== pb) return pa - pb;
      return a.localeCompare(b);
    });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureMigrationsTable(client);

    for (const folder of folders) {
      if (await applied(client, folder)) continue;

      const full = path.join(dir, folder, 'migration.sql');
      if (!fs.existsSync(full)) continue;
      const sql = fs.readFileSync(full, 'utf8');

      console.log(`Applying ${folder}...`);
      await client.query(sql);
      await markApplied(client, folder);
    }

    await client.query('COMMIT');
    console.log('Test database reset complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reset failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

async function run() {
  try {
    await resetSchema();
    await runMigrations();
  } finally {
    await pool.end();
  }
}

run();
