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

describe('Integrity report', () => {
  beforeEach(async () => resetDb());
  afterAll(async () => pool.end());

  it('flags missing invoice lines and mismatched totals', async () => {
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

    const sessionId = sessionRes.json().session.id as string;

    await app.inject({
      method: 'POST',
      url: `/tutor/sessions/${sessionId}/submit`,
      headers: { cookie: tutorAuth.cookie }
    });

    await app.inject({
      method: 'POST',
      url: `/admin/sessions/${sessionId}/approve`,
      headers: { cookie: adminAuth.cookie }
    });

    await app.inject({
      method: 'POST',
      url: '/admin/payroll/generate-week',
      headers: { cookie: adminAuth.cookie },
      payload: { weekStart: '2026-02-02' }
    });

    await pool.query('delete from invoice_lines');

    const reportRes = await app.inject({
      method: 'GET',
      url: '/admin/integrity/pay-period/2026-02-02',
      headers: { cookie: adminAuth.cookie }
    });

    expect(reportRes.statusCode).toBe(200);
    const report = reportRes.json();
    expect(report.missingInvoiceLines.length).toBeGreaterThan(0);
    expect(report.invoiceTotalMismatches.length).toBeGreaterThan(0);

    await app.close();
  });
});
