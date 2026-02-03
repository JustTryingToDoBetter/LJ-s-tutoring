import { pool } from '../../src/db/pool.js';

export async function resetDb() {
  // Order matters due to FKs
  await pool.query('begin');
  try {
    await pool.query('delete from tutoring_session_current');
    await pool.query('delete from tutoring_session_log');
    await pool.query('delete from tutoring_sessions'); // if you still have old table lingering
    await pool.query('delete from tutor_student_assignments');
    await pool.query('delete from students');
    await pool.query('delete from tutors');
    await pool.query('delete from users');
    await pool.query('commit');
  } catch (e) {
    await pool.query('rollback');
    throw e;
  }
}
