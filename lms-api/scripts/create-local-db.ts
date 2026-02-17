import { Client } from 'pg';

async function main() {
  const adminUrl = process.env.DATABASE_ADMIN_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
  const targetDb = process.env.LOCAL_DB_NAME || 'lms';

  const client = new Client({ connectionString: adminUrl });
  await client.connect();

  const exists = await client.query('select 1 from pg_database where datname = $1', [targetDb]);
  if (exists.rowCount && exists.rowCount > 0) {
    console.log(`exists:${targetDb}`);
    await client.end();
    return;
  }

  await client.query(`create database "${targetDb}"`);
  console.log(`created:${targetDb}`);
  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
