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

describe('Tutor logging security', () => {
  beforeEach(async () => resetDb());
  afterAll(async () => pool.end());

  it('prevents tutor logging with mismatched student', async () => {
    const app = await buildApp();
    await createAdmin('admin@example.com');

    const { tutor, user } = await createTutor({
      email: 'tutor@example.com',
      fullName: 'Tutor One',
      defaultHourlyRate: 300
    });

    const student1 = await createStudent({ fullName: 'Student One', grade: '10' });
    const student2 = await createStudent({ fullName: 'Student Two', grade: '10' });

    const assignment = await createAssignment({
      tutorId: tutor.id,
      studentId: student1.id,
      subject: 'Math',
      startDate: '2026-01-01',
      allowedDays: [1, 2, 3, 4, 5],
      allowedTimeRanges: [{ start: '14:00', end: '18:00' }]
    });

    const tutorToken = await issueMagicToken(user.id);
    const tutorLogin = await loginWithMagicToken(app, tutorToken);

    const log = await app.inject({
      method: 'POST',
      url: '/tutor/sessions',
      headers: tutorLogin.headers,
      payload: {
        assignmentId: assignment.id,
        studentId: student2.id,
        date: '2026-02-04',
        startTime: '14:30',
        endTime: '15:30',
        mode: 'online'
      }
    });

    expect(log.statusCode).toBe(400);
    expect(log.json().error).toBe('student_mismatch');
    await app.close();
  });

  it('blocks logging outside assignment window', async () => {
    const app = await buildApp();
    const admin = await createAdmin('admin@example.com');
    const adminToken = await issueMagicToken(admin.id);
    const adminAuth = await loginWithMagicToken(app, adminToken);

    const { tutor, user } = await createTutor({
      email: 'tutor@example.com',
      fullName: 'Tutor Two',
      defaultHourlyRate: 300
    });
    const student = await createStudent({ fullName: 'Student One' });

    const assignment = await createAssignment({
      tutorId: tutor.id,
      studentId: student.id,
      subject: 'Physics',
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      allowedDays: [1],
      allowedTimeRanges: [{ start: '08:00', end: '09:00' }]
    });

    const tutorToken = await issueMagicToken(user.id);
    const tutorLogin = await loginWithMagicToken(app, tutorToken);

    const log = await app.inject({
      method: 'POST',
      url: '/tutor/sessions',
      headers: tutorLogin.headers,
      payload: {
        assignmentId: assignment.id,
        studentId: student.id,
        date: '2026-02-02',
        startTime: '10:00',
        endTime: '11:00',
        mode: 'in-person'
      }
    });

    expect(log.statusCode).toBe(400);
    expect(log.json().error).toBe('outside_assignment_window');
    await app.close();
  });

  it('rejects overlapping sessions for a tutor', async () => {
    const app = await buildApp();
    const admin = await createAdmin('admin@example.com');
    const adminToken = await issueMagicToken(admin.id);
    await loginWithMagicToken(app, adminToken);

    const { tutor, user } = await createTutor({
      email: 'tutor@example.com',
      fullName: 'Tutor Three',
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
    const tutorLogin = await loginWithMagicToken(app, tutorToken);

    const first = await app.inject({
      method: 'POST',
      url: '/tutor/sessions',
      headers: tutorLogin.headers,
      payload: {
        assignmentId: assignment.id,
        studentId: student.id,
        date: '2026-02-03',
        startTime: '09:00',
        endTime: '10:00',
        mode: 'online'
      }
    });
    expect(first.statusCode).toBe(201);

    const overlap = await app.inject({
      method: 'POST',
      url: '/tutor/sessions',
      headers: tutorLogin.headers,
      payload: {
        assignmentId: assignment.id,
        studentId: student.id,
        date: '2026-02-03',
        startTime: '09:30',
        endTime: '10:30',
        mode: 'online'
      }
    });

    expect(overlap.statusCode).toBe(409);
    expect(overlap.json().error).toBe('overlapping_session');
    await app.close();
  });
});
