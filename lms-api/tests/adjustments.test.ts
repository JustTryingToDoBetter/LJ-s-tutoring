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

describe('Adjustments', () => {
  beforeEach(async () => resetDb());
  afterAll(async () => pool.end());

  it('includes adjustments in invoice totals', async () => {
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

    await app.inject({
      method: 'POST',
      url: `/admin/sessions/${sessionId}/approve`,
      headers: adminAuth.headers
    });

    const adjustmentRes = await app.inject({
      method: 'POST',
      url: '/admin/pay-periods/2026-02-02/adjustments',
      headers: adminAuth.headers,
      payload: {
        tutorId: tutor.id,
        type: 'BONUS',
        amount: 150,
        reason: 'Performance bonus'
      }
    });

    expect(adjustmentRes.statusCode).toBe(201);

    const payrollRes = await app.inject({
      method: 'POST',
      url: '/admin/payroll/generate-week',
      headers: adminAuth.headers,
      payload: { weekStart: '2026-02-02' }
    });

    expect(payrollRes.statusCode).toBe(200);
    const invoices = payrollRes.json().invoices as Array<{ total_amount: string | number }>;
    expect(invoices.length).toBe(1);

    const total = Number(invoices[0].total_amount);
    expect(total).toBeCloseTo(450, 2);

    await app.close();
  });

  it('blocks adjustment deletion in locked periods', async () => {
    const app = await buildApp();

    const admin = await createAdmin('admin@example.com');
    const adminToken = await issueMagicToken(admin.id);
    const adminAuth = await loginWithMagicToken(app, adminToken);

    const { tutor } = await createTutor({
      email: 'tutor@example.com',
      fullName: 'Tutor One',
      defaultHourlyRate: 300
    });

    const adjustmentRes = await app.inject({
      method: 'POST',
      url: '/admin/pay-periods/2026-02-02/adjustments',
      headers: adminAuth.headers,
      payload: {
        tutorId: tutor.id,
        type: 'PENALTY',
        amount: 50,
        reason: 'Late cancellation'
      }
    });

    const adjustmentId = adjustmentRes.json().adjustment.id as string;

    await app.inject({
      method: 'POST',
      url: '/admin/pay-periods/2026-02-02/lock',
      headers: adminAuth.headers
    });

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/admin/adjustments/${adjustmentId}`,
      headers: adminAuth.headers
    });

    expect(deleteRes.statusCode).toBe(409);
    expect(deleteRes.json().error).toBe('pay_period_locked');

    await app.close();
  });
});
