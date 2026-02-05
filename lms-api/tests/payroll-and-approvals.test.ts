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

describe('Approvals and payroll', () => {
  beforeEach(async () => resetDb());
  afterAll(async () => pool.end());

  it('submits and approves a session', async () => {
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

    const createRes = await app.inject({
      method: 'POST',
      url: '/tutor/sessions',
      headers: { cookie: tutorAuth.cookie },
      payload: {
        assignmentId: assignment.id,
        studentId: student.id,
        date: '2026-02-03',
        startTime: '09:00',
        endTime: '10:00',
        mode: 'online'
      }
    });

    expect(createRes.statusCode).toBe(201);
    const sessionId = createRes.json().session.id as string;

    const submitRes = await app.inject({
      method: 'POST',
      url: `/tutor/sessions/${sessionId}/submit`,
      headers: { cookie: tutorAuth.cookie }
    });

    expect(submitRes.statusCode).toBe(200);
    expect(submitRes.json().session.status).toBe('SUBMITTED');

    const approveRes = await app.inject({
      method: 'POST',
      url: `/admin/sessions/${sessionId}/approve`,
      headers: { cookie: adminAuth.cookie }
    });

    expect(approveRes.statusCode).toBe(200);
    expect(approveRes.json().session.status).toBe('APPROVED');

    await app.close();
  });

  it('generates weekly payroll invoices with correct totals', async () => {
    const app = await buildApp();

    const admin = await createAdmin('admin@example.com');
    const adminToken = await issueMagicToken(admin.id);
    const adminAuth = await loginWithMagicToken(app, adminToken);

    const { tutor, user } = await createTutor({
      email: 'tutor@example.com',
      fullName: 'Tutor Payroll',
      defaultHourlyRate: 300
    });
    const student = await createStudent({ fullName: 'Student Payroll' });

    const assignment = await createAssignment({
      tutorId: tutor.id,
      studentId: student.id,
      subject: 'Science',
      startDate: '2026-02-01',
      allowedDays: [1, 2, 3, 4, 5],
      allowedTimeRanges: [{ start: '08:00', end: '18:00' }]
    });

    const tutorToken = await issueMagicToken(user.id);
    const tutorAuth = await loginWithMagicToken(app, tutorToken);

    const sessionA = await app.inject({
      method: 'POST',
      url: '/tutor/sessions',
      headers: { cookie: tutorAuth.cookie },
      payload: {
        assignmentId: assignment.id,
        studentId: student.id,
        date: '2026-02-03',
        startTime: '09:00',
        endTime: '10:00',
        mode: 'online'
      }
    });

    const sessionB = await app.inject({
      method: 'POST',
      url: '/tutor/sessions',
      headers: { cookie: tutorAuth.cookie },
      payload: {
        assignmentId: assignment.id,
        studentId: student.id,
        date: '2026-02-05',
        startTime: '09:00',
        endTime: '09:30',
        mode: 'online'
      }
    });

    const sessionIds = [sessionA.json().session.id, sessionB.json().session.id];

    for (const id of sessionIds) {
      await app.inject({
        method: 'POST',
        url: `/tutor/sessions/${id}/submit`,
        headers: { cookie: tutorAuth.cookie }
      });
      await app.inject({
        method: 'POST',
        url: `/admin/sessions/${id}/approve`,
        headers: { cookie: adminAuth.cookie }
      });
    }

    const payroll = await app.inject({
      method: 'POST',
      url: '/admin/payroll/generate-week',
      headers: { cookie: adminAuth.cookie },
      payload: { weekStart: '2026-02-02' }
    });

    expect(payroll.statusCode).toBe(200);
    const invoices = payroll.json().invoices as Array<{ total_amount: string | number }>;
    expect(invoices.length).toBe(1);

    const total = Number(invoices[0].total_amount);
    expect(total).toBeCloseTo(450, 2);

    await app.close();
  });
});
