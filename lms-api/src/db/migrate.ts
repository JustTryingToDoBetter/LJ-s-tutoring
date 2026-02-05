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
  return path.resolve(__dirname, '../../prisma/migrations');
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
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureMigrationsTable(client);

    for (const folder of files) {
      if (await applied(client, folder)) continue;

      const full = path.join(dir, folder, 'migration.sql');
      if (!fs.existsSync(full)) continue;
      const sql = fs.readFileSync(full, 'utf8');

      console.log(`Applying ${folder}...`);
      await client.query(sql);
      await markApplied(client, folder);
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
