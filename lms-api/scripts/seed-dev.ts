/**
 * seed-dev.ts
 * Seeds the local dev database with one admin, one tutor, and one student.
 *
 * Usage: npm run seed:dev
 *
 * Accounts created:
 *   admin@dev.local   / DevPass123!   (ADMIN)
 *   tutor@dev.local   / DevPass123!   (TUTOR)
 *   student@dev.local / DevPass123!   (STUDENT)
 */

import 'dotenv/config';
import argon2 from 'argon2';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: DATABASE_URL });

const PASSWORD = 'DevPass123!';

async function hash(pw: string) {
  return argon2.hash(pw, { type: argon2.argon2id });
}

async function seedAdmin() {
  const email = 'admin@dev.local';
  const existing = await pool.query('select id from users where email = $1', [email]);
  if (existing.rowCount && existing.rowCount > 0) {
    console.log('  admin already exists, skipping');
    return existing.rows[0].id as string;
  }

  const ph = await hash(PASSWORD);
  const res = await pool.query(
    `insert into users (email, role, password_hash, first_name, last_name, is_active)
     values ($1, 'ADMIN', $2, 'Dev', 'Admin', true)
     returning id`,
    [email, ph]
  );
  return res.rows[0].id as string;
}

async function seedTutor() {
  const email = 'tutor@dev.local';
  const existing = await pool.query('select id from users where email = $1', [email]);
  if (existing.rowCount && existing.rowCount > 0) {
    console.log('  tutor already exists, skipping');
    return existing.rows[0].id as string;
  }

  // tutor_profile first (no user yet)
  const profileRes = await pool.query(
    `insert into tutor_profiles (full_name, phone, default_hourly_rate, active)
     values ('Dev Tutor', null, 350, true)
     returning id`
  );
  const profileId = profileRes.rows[0].id as string;

  const ph = await hash(PASSWORD);
  const res = await pool.query(
    `insert into users (email, role, password_hash, tutor_profile_id, first_name, last_name, is_active)
     values ($1, 'TUTOR', $2, $3, 'Dev', 'Tutor', true)
     returning id`,
    [email, ph, profileId]
  );
  return res.rows[0].id as string;
}

async function seedStudent() {
  const email = 'student@dev.local';
  const existing = await pool.query('select id from users where email = $1', [email]);
  if (existing.rowCount && existing.rowCount > 0) {
    console.log('  student already exists, skipping');
    return existing.rows[0].id as string;
  }

  const studentRes = await pool.query(
    `insert into students (full_name, grade, is_active)
     values ('Dev Student', '10', true)
     returning id`
  );
  const studentId = studentRes.rows[0].id as string;

  const ph = await hash(PASSWORD);
  const res = await pool.query(
    `insert into users (email, role, password_hash, student_id, first_name, last_name, is_active)
     values ($1, 'STUDENT', $2, $3, 'Dev', 'Student', true)
     returning id`,
    [email, ph, studentId]
  );
  return res.rows[0].id as string;
}

async function run() {
  try {
    console.log('Seeding dev accounts...');
    const adminId   = await seedAdmin();
    const tutorId   = await seedTutor();
    const studentId = await seedStudent();

    console.log('\nDone! Test credentials (password: DevPass123!):');
    console.log(`  admin@dev.local   → id: ${adminId}`);
    console.log(`  tutor@dev.local   → id: ${tutorId}`);
    console.log(`  student@dev.local → id: ${studentId}`);
  } finally {
    await pool.end();
  }
}

run();
