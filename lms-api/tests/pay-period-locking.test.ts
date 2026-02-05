import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { resetDb } from './helpers/db.js';
import { pool } from '../src/db/pool.js';
import {
  createAdmin,
  createAssignment,
  createStudent,
  createTutor,
  issueMagicToken,
  loginWithMagicToken
} from './helpers/factories.js';

describe('Pay period locking', () => {
  beforeEach(async () => resetDb());
  afterAll(async () => pool.end());

  it('rejects locking when pending submissions exist', async () => {
    const app = await buildApp();

    const admin = await createAdmin('admin@example.com');
    const adminToken = await issueMagicToken(admin.id);
    const adminAuth = await loginWithMagicToken(app, adminToken);

    const { tutor, user } = await createTutor({
      email: 'tutor@example.com',
      fullName: 'Tutor One',
      defaultHourlyRate: 300
    });
    const student = await createStudent({ fullName: 'Student One' });

    const assignment = await createAssignment({
      tutorId: tutor.id,
      studentId: student.id,
      subject: 'Math',
      startDate: '2026-02-01',
      allowedDays: [1, 2, 3, 4, 5],
      allowedTimeRanges: [{ start: '08:00', end: '18:00' }]
    });

    const tutorToken = await issueMagicToken(user.id);
    const tutorAuth = await loginWithMagicToken(app, tutorToken);

    const sessionRes = await app.inject({
      method: 'POST',
      url: '/tutor/sessions',
      headers: tutorAuth.headers,
      payload: {
        assignmentId: assignment.id,
        studentId: student.id,
        date: '2026-02-03',
        startTime: '09:00',
        endTime: '10:00',
        mode: 'online'
      }
    });

    const sessionId = sessionRes.json().session.id as string;

    await app.inject({
      method: 'POST',
      url: `/tutor/sessions/${sessionId}/submit`,
      headers: tutorAuth.headers
    });

    const lockRes = await app.inject({
      method: 'POST',
      url: '/admin/pay-periods/2026-02-02/lock',
      headers: adminAuth.headers
    });

    expect(lockRes.statusCode).toBe(409);
    expect(lockRes.json().error).toBe('pending_sessions');

    await app.close();
  });

  it('blocks tutor edits and submissions after locking', async () => {
    const app = await buildApp();

    const admin = await createAdmin('admin@example.com');
    const adminToken = await issueMagicToken(admin.id);
    const adminAuth = await loginWithMagicToken(app, adminToken);

    const { tutor, user } = await createTutor({
      email: 'tutor@example.com',
      fullName: 'Tutor One',
      defaultHourlyRate: 300
    });
    const student = await createStudent({ fullName: 'Student One' });

    const assignment = await createAssignment({
      tutorId: tutor.id,
      studentId: student.id,
      subject: 'Math',
      startDate: '2026-02-01',
      allowedDays: [1, 2, 3, 4, 5],
      allowedTimeRanges: [{ start: '08:00', end: '18:00' }]
    });

    const tutorToken = await issueMagicToken(user.id);
    const tutorAuth = await loginWithMagicToken(app, tutorToken);

    const sessionRes = await app.inject({
      method: 'POST',
      url: '/tutor/sessions',
      headers: tutorAuth.headers,
      payload: {
        assignmentId: assignment.id,
        studentId: student.id,
        date: '2026-02-03',
        startTime: '09:00',
        endTime: '10:00',
        mode: 'online'
      }
    });

    const sessionId = sessionRes.json().session.id as string;

    const lockRes = await app.inject({
      method: 'POST',
      url: '/admin/pay-periods/2026-02-02/lock',
      headers: adminAuth.headers
    });

    expect(lockRes.statusCode).toBe(200);

    const editRes = await app.inject({
      method: 'PATCH',
      url: `/tutor/sessions/${sessionId}`,
      headers: tutorAuth.headers,
      payload: { notes: 'Updated notes' }
    });

    expect(editRes.statusCode).toBe(409);
    expect(editRes.json().error).toBe('pay_period_locked');

    const submitRes = await app.inject({
      method: 'POST',
      url: `/tutor/sessions/${sessionId}/submit`,
      headers: tutorAuth.headers
    });

    expect(submitRes.statusCode).toBe(409);
    expect(submitRes.json().error).toBe('pay_period_locked');

    await app.close();
  });
});
