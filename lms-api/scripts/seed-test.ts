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

async function run() {
  try {
    const adminId = await ensureAdmin();
    const tutorUserId = await ensureTutor();
    const studentId = await ensureStudent();
    const assignmentId = await ensureAssignment();

    const studentUserRes = await pool.query(
      `insert into users (email, role, student_id)
       values ($1, 'STUDENT', $2)
       on conflict (email) do update set student_id = excluded.student_id
       returning id`,
      ['student@test.local', studentId]
    );
    const studentUserId = studentUserRes.rows[0].id as string;

    await pool.query(
      `insert into community_profiles (user_id, nickname, privacy_settings_json)
       values ($1, $2, $3::jsonb)
       on conflict (user_id) do nothing`,
      [studentUserId, 'TestLearner', JSON.stringify({ leaderboardOptIn: true, showFullName: false })]
    );

    await pool.query(
      `insert into study_rooms (subject, grade, created_by)
       values ('Mathematics', '10', $1)
       on conflict do nothing`,
      [studentUserId]
    );

    await pool.query(
      `insert into career_goal_selections (user_id, goal_id)
       values ($1, 'engineering-foundations')
       on conflict (user_id, goal_id) do nothing`,
      [studentUserId]
    );

    console.log('Seeded test data:', {
      adminId,
      tutorUserId,
      tutorProfileId: ids.tutorProfile,
      studentId,
      studentUserId,
      assignmentId,
    });
  } finally {
    await pool.end();
  }
}

run();
