import 'dotenv/config';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL_TEST;
if (!databaseUrl) {
  throw new Error('DATABASE_URL_TEST is required');
}
if (process.env.NODE_ENV !== 'test') {
  throw new Error('seed-test can only run with NODE_ENV=test');
}

const pool = new Pool({ connectionString: databaseUrl });

const ids = {
  adminUser: '00000000-0000-0000-0000-000000000001',
  tutorProfile: '00000000-0000-0000-0000-000000000002',
  tutorUser: '00000000-0000-0000-0000-000000000003',
  student: '00000000-0000-0000-0000-000000000004',
  assignment: '00000000-0000-0000-0000-000000000005',
  parentUser: '00000000-0000-0000-0000-000000000006',
  parentProfile: '00000000-0000-0000-0000-000000000007',
};

async function ensureAdmin() {
  const email = 'admin@test.local';
  const existing = await pool.query('select id from users where email = $1', [email]);
  if (existing.rowCount > 0) return existing.rows[0].id as string;

  const res = await pool.query(
    `insert into users (id, email, role)
     values ($1, $2, 'ADMIN')
     returning id`,
    [ids.adminUser, email]
  );
  return res.rows[0].id as string;
}

async function ensureTutor() {
  const email = 'tutor@test.local';
  const existing = await pool.query('select id from users where email = $1', [email]);
  if (existing.rowCount > 0) return existing.rows[0].id as string;

  await pool.query(
    `insert into tutor_profiles (id, full_name, phone, default_hourly_rate, active)
     values ($1, $2, null, $3, true)
     on conflict (id) do nothing`,
    [ids.tutorProfile, 'Test Tutor', 300]
  );

  const res = await pool.query(
    `insert into users (id, email, role, tutor_profile_id)
     values ($1, $2, 'TUTOR', $3)
     returning id`,
    [ids.tutorUser, email, ids.tutorProfile]
  );
  return res.rows[0].id as string;
}

async function ensureStudent() {
  const existing = await pool.query('select id from students where id = $1', [ids.student]);
  if (existing.rowCount > 0) return existing.rows[0].id as string;

  const res = await pool.query(
    `insert into students (id, full_name, grade, is_active)
     values ($1, $2, $3, true)
     returning id`,
    [ids.student, 'Test Student', '10']
  );
  return res.rows[0].id as string;
}

async function ensureAssignment() {
  const existing = await pool.query('select id from assignments where id = $1', [ids.assignment]);
  if (existing.rowCount > 0) return existing.rows[0].id as string;

  const res = await pool.query(
    `insert into assignments
     (id, tutor_id, student_id, subject, start_date, end_date, rate_override, allowed_days_json, allowed_time_ranges_json, active)
     values ($1, $2, $3, $4, $5::date, $6::date, $7, $8::jsonb, $9::jsonb, true)
     returning id`,
    [
      ids.assignment,
      ids.tutorProfile,
      ids.student,
      'Math',
      '2026-02-01',
      '2026-02-28',
      null,
      JSON.stringify([1, 3, 5]),
      JSON.stringify([{ start: '15:00', end: '18:00' }])
    ]
  );
  return res.rows[0].id as string;
}

async function ensureParentLink() {
  const email = 'parent@test.local';
  const existing = await pool.query('select id from users where email = $1', [email]);
  let userId: string;

  if (existing.rowCount > 0) {
    userId = existing.rows[0].id as string;
  } else {
    const userRes = await pool.query(
      `insert into users (id, email, role, tier)
       values ($1, $2, 'PARENT', 'BASIC')
       returning id`,
      [ids.parentUser, email]
    );
    userId = userRes.rows[0].id as string;
  }

  await pool.query(
    `insert into parent_profiles (id, user_id, full_name, phone)
     values ($1, $2, $3, null)
     on conflict (id) do nothing`,
    [ids.parentProfile, userId, 'Seed Parent']
  );

  await pool.query(
    `update users
     set parent_profile_id = $1
     where id = $2`,
    [ids.parentProfile, userId]
  );

  await pool.query(
    `insert into parent_student_links (parent_profile_id, student_id, relationship)
     values ($1, $2, $3)
     on conflict (parent_profile_id, student_id) do nothing`,
    [ids.parentProfile, ids.student, 'Guardian']
  );

  await pool.query(
    `insert into vault_resources (title, description, category, body_markdown, minimum_tier, is_published, is_public_preview, created_by_user_id)
     values ($1, $2, $3, $4, 'BASIC', true, false, $5)
     on conflict do nothing`,
    ['Seed Algebra Vault', 'Seed content for vault listing', 'Algebra', 'Seed notes for algebra drill setup.', ids.tutorUser]
  );

  const latestVault = await pool.query(
    `select id
     from vault_resources
     where title = $1
     order by created_at desc
     limit 1`,
    ['Seed Algebra Vault']
  );

  if (latestVault.rowCount > 0) {
    const vaultId = latestVault.rows[0].id as string;
    await pool.query(
      `insert into vault_access_rules (resource_id, role, is_allowed)
       values ($1, 'STUDENT', true), ($1, 'PARENT', true), ($1, 'TUTOR', true)
       on conflict (resource_id, role) do update set is_allowed = excluded.is_allowed`,
      [vaultId]
    );
  }

  return userId;
}

async function run() {
  try {
    const adminId = await ensureAdmin();
    const tutorUserId = await ensureTutor();
    const studentId = await ensureStudent();
    const assignmentId = await ensureAssignment();
    const parentUserId = await ensureParentLink();

    console.log('Seeded test data:', {
      adminId,
      tutorUserId,
      tutorProfileId: ids.tutorProfile,
      studentId,
      assignmentId,
      parentUserId,
      parentProfileId: ids.parentProfile,
    });
  } finally {
    await pool.end();
  }
}

run();
