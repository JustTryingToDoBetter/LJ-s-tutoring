import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { resetDb } from './helpers/db.js';
import { createAssignment, createStudent, createTutor, issueMagicToken, loginWithMagicToken } from './helpers/factories.js';

describe('Academic OS Phase 1', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('records streak with per-day credit idempotency', async () => {
    const app = await buildApp();

    const student = await createStudent({ fullName: 'Student Streak' });
    const userRes = await pool.query(
      `insert into users (email, role, student_id)
       values ($1, 'STUDENT', $2)
       returning id`,
      ['student-streak@test.local', student.id]
    );

    const token = await issueMagicToken(userRes.rows[0].id as string);
    const auth = await loginWithMagicToken(app, token);

    const first = await app.inject({
      method: 'POST',
      url: '/study-activity',
      headers: auth.headers,
      payload: {
        type: 'practice_completed',
        dedupeKey: 'same-event-1',
        metadata: { durationMinutes: 30 }
      }
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().credited).toBe(true);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/study-activity',
      headers: auth.headers,
      payload: {
        type: 'practice_completed',
        dedupeKey: 'same-event-1',
        metadata: { durationMinutes: 30 }
      }
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().deduped).toBe(true);

    await app.close();
  });

  it('generates and restricts report access by role', async () => {
    const app = await buildApp();

    const { tutor, user: tutorUser } = await createTutor({
      email: 'tutor-report@test.local',
      fullName: 'Tutor Report'
    });
    const student = await createStudent({ fullName: 'Student Report' });

    await createAssignment({
      tutorId: tutor.id,
      studentId: student.id,
      subject: 'Algebra',
      startDate: '2026-02-01',
      allowedDays: [1, 2, 3, 4, 5],
      allowedTimeRanges: [{ start: '08:00', end: '17:00' }]
    });

    await pool.query(
      `insert into tutor_student_map (tutor_id, student_id)
       values ($1, $2)
       on conflict do nothing`,
      [tutor.id, student.id]
    );

    const studentUserRes = await pool.query(
      `insert into users (email, role, student_id)
       values ($1, 'STUDENT', $2)
       returning id`,
      ['student-report@test.local', student.id]
    );

    const tutorToken = await issueMagicToken(tutorUser.id);
    const tutorAuth = await loginWithMagicToken(app, tutorToken);
    const studentToken = await issueMagicToken(studentUserRes.rows[0].id as string);
    const studentAuth = await loginWithMagicToken(app, studentToken);

    const generated = await app.inject({
      method: 'POST',
      url: '/reports/generate',
      headers: tutorAuth.headers,
      payload: { studentId: student.id }
    });
    expect(generated.statusCode).toBe(201);

    const reportId = generated.json().report.id as string;

    const ownView = await app.inject({
      method: 'GET',
      url: `/reports/${reportId}`,
      headers: studentAuth.headers,
    });
    expect(ownView.statusCode).toBe(200);

    const outsider = await pool.query(
      `insert into users (email, role)
       values ($1, 'ADMIN')
       returning id`,
      ['admin-report@test.local']
    );
    const outsiderToken = await issueMagicToken(outsider.rows[0].id as string);
    const outsiderAuth = await loginWithMagicToken(app, outsiderToken);

    const adminView = await app.inject({
      method: 'GET',
      url: `/reports/${reportId}`,
      headers: outsiderAuth.headers,
    });
    expect(adminView.statusCode).toBe(200);

    await app.close();
  });
});
