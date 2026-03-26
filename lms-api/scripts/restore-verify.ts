import { Pool } from 'pg';

async function main() {
  const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_TEST;
  if (!databaseUrl) {
    console.error('DATABASE_URL or DATABASE_URL_TEST is required');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const ping = await pool.query('select 1 as ok');
    if (Number(ping.rows[0]?.ok) !== 1) {
      throw new Error('db_ping_failed');
    }

    const migrations = await pool.query('select count(*)::int as count from schema_migrations');
    const criticalTables = await pool.query(
      `select count(*)::int as count
       from information_schema.tables
       where table_schema = 'public'
         and table_name in ('users', 'audit_log', 'sessions')`
    );

    console.log('restore.verify.ok');
    console.log(`schema_migrations=${migrations.rows[0]?.count ?? 0}`);
    console.log(`critical_tables_present=${criticalTables.rows[0]?.count ?? 0}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('restore.verify.failed', error);
  process.exit(1);
});
