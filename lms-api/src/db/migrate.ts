import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

function getMigrationsDir() {
  return path.resolve(__dirname, '../../migrations');
}

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

async function run() {
  const dir = getMigrationsDir();
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort((a, b) => a.localeCompare(b));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureMigrationsTable(client);

    for (const file of files) {
      if (await applied(client, file)) continue;

      const full = path.join(dir, file);
      const sql = fs.readFileSync(full, 'utf8');

      console.log(`Applying ${file}...`);
      await client.query(sql);
      await markApplied(client, file);
    }

    await client.query('COMMIT');
    console.log('Migrations complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
