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

describe('Privacy requests', () => {
  beforeEach(async () => resetDb());
  afterAll(async () => pool.end());

  it('anonymizes student on deletion request when invoice retained', async () => {
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

    const payrollRes = await app.inject({
      method: 'POST',
      url: '/admin/payroll/generate-week',
      headers: adminAuth.headers,
      payload: { weekStart: '2026-02-02' }
    });

    expect(payrollRes.statusCode).toBe(200);
    const invoiceId = payrollRes.json().invoices[0].id as string;

    const requestRes = await app.inject({
      method: 'POST',
      url: '/admin/privacy-requests',
      headers: adminAuth.headers,
      payload: {
        requestType: 'DELETION',
        subjectType: 'STUDENT',
        subjectId: student.id,
        reason: 'Data removal request'
      }
    });

    expect(requestRes.statusCode).toBe(201);
    const requestId = requestRes.json().request.id as string;

    const closeRes = await app.inject({
      method: 'POST',
      url: `/admin/privacy-requests/${requestId}/close`,
      headers: adminAuth.headers,
      payload: {}
    });

    expect(closeRes.statusCode).toBe(200);
    expect(closeRes.json().request.outcome).toBe('ANONYMIZED');

    const studentRes = await pool.query(`select full_name, guardian_name, notes from students where id = $1`, [student.id]);
    expect(studentRes.rows[0].full_name).toBe('Anonymized Student');
    expect(studentRes.rows[0].guardian_name).toBeNull();
    expect(studentRes.rows[0].notes).toBeNull();

    const invoiceRes = await pool.query(`select total_amount from invoices where id = $1`, [invoiceId]);
    expect(Number(invoiceRes.rows[0].total_amount)).toBeGreaterThan(0);

    await app.close();
  });
});
