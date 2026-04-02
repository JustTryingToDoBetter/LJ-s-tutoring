import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { resetDb } from './helpers/db.js';
import { pool } from '../src/db/pool.js';
import {
  createAdmin,
  createAdjustment,
  createAssignment,
  createPayPeriod,
  createStudent,
  createTutor,
  issueMagicToken,
  loginWithMagicToken
} from './helpers/factories.js';

describe('Admin routes', () => {
  beforeEach(async () => resetDb());
  afterAll(async () => pool.end());

  // ─── Tutors ───────────────────────────────────────────────────────────────

  describe('Tutors', () => {
    it('creates a tutor via POST /admin/tutors', async () => {
      const app = await buildApp();
      const admin = await createAdmin();
      const token = await issueMagicToken(admin.id);
      const auth = await loginWithMagicToken(app, token);

      const res = await app.inject({
        method: 'POST',
        url: '/admin/tutors',
        headers: auth.headers,
        payload: { email: 'newtutor@example.com', fullName: 'New Tutor', defaultHourlyRate: 250 }
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().tutor).toMatchObject({ full_name: 'New Tutor' });
      await app.close();
    });

    it('lists tutors via GET /admin/tutors', async () => {
      const app = await buildApp();
      const admin = await createAdmin();
      await createTutor({ email: 'tutor@example.com', fullName: 'Alice Tutor', defaultHourlyRate: 200 });
      const token = await issueMagicToken(admin.id);
      const auth = await loginWithMagicToken(app, token);

      const res = await app.inject({ method: 'GET', url: '/admin/tutors', headers: auth.headers });

      expect(res.statusCode).toBe(200);
      const tutors = res.json().tutors ?? res.json();
      expect(Array.isArray(tutors)).toBe(true);
      expect(tutors.length).toBeGreaterThanOrEqual(1);
      await app.close();
    });

    it('updates a tutor via PATCH /admin/tutors/:id', async () => {
      const app = await buildApp();
      const admin = await createAdmin();
      const { tutor } = await createTutor({ email: 'tutor@example.com', fullName: 'Bob Tutor', defaultHourlyRate: 200 });
      const token = await issueMagicToken(admin.id);
      const auth = await loginWithMagicToken(app, token);

      const res = await app.inject({
        method: 'PATCH',
        url: `/admin/tutors/${tutor.id}`,
        headers: auth.headers,
        payload: { defaultHourlyRate: 350 }
      });

      expect(res.statusCode).toBe(200);
      expect(Number(res.json().tutor.default_hourly_rate)).toBe(350);
      await app.close();
    });

    it('rejects non-admin access to tutor endpoints', async () => {
      const app = await buildApp();
      const { user } = await createTutor({ email: 'tutor@example.com', fullName: 'Non Admin', defaultHourlyRate: 200 });
      const token = await issueMagicToken(user.id);
      const auth = await loginWithMagicToken(app, token);

      const res = await app.inject({ method: 'GET', url: '/admin/tutors', headers: auth.headers });

      expect(res.statusCode).toBe(403);
      await app.close();
    });
  });

  // ─── Sessions ─────────────────────────────────────────────────────────────

  describe('Sessions', () => {
    it('approves a session via POST /admin/sessions/:id/approve', async () => {
      const app = await buildApp();
      const admin = await createAdmin();
      const { tutor, user: tutorUser } = await createTutor({
        email: 'tutor@example.com',
        fullName: 'Tutor One',
        defaultHourlyRate: 300
      });
      const student = await createStudent({ fullName: 'Student One' });
      await createAssignment({
        tutorId: tutor.id,
        studentId: student.id,
        subject: 'Math',
        startDate: '2026-01-01',
        allowedDays: [1, 2, 3, 4, 5],
        allowedTimeRanges: [{ start: '08:00', end: '18:00' }]
      });

      const tutorToken = await issueMagicToken(tutorUser.id);
      const tutorAuth = await loginWithMagicToken(app, tutorToken);
      const adminToken = await issueMagicToken(admin.id);
      const adminAuth = await loginWithMagicToken(app, adminToken);

      const sessionRes = await app.inject({
        method: 'POST',
        url: '/tutor/sessions',
        headers: tutorAuth.headers,
        payload: {
          assignmentId: (await pool.query(`select id from assignments where tutor_id = $1`, [tutor.id])).rows[0].id,
          studentId: student.id,
          date: '2026-01-05',
          startTime: '09:00',
          endTime: '10:00',
          mode: 'online'
        }
      });
      expect(sessionRes.statusCode).toBe(201);
      const sessionId = sessionRes.json().session.id as string;

      await app.inject({ method: 'POST', url: `/tutor/sessions/${sessionId}/submit`, headers: tutorAuth.headers });

      const approveRes = await app.inject({
        method: 'POST',
        url: `/admin/sessions/${sessionId}/approve`,
        headers: adminAuth.headers
      });

      expect(approveRes.statusCode).toBe(200);
      expect(approveRes.json().session.status).toBe('APPROVED');
      await app.close();
    });

    it('rejects a session via POST /admin/sessions/:id/reject', async () => {
      const app = await buildApp();
      const admin = await createAdmin();
      const { tutor, user: tutorUser } = await createTutor({
        email: 'tutor@example.com',
        fullName: 'Tutor Rej',
        defaultHourlyRate: 300
      });
      const student = await createStudent({ fullName: 'Student Rej' });
      await createAssignment({
        tutorId: tutor.id,
        studentId: student.id,
        subject: 'Science',
        startDate: '2026-01-01',
        allowedDays: [1, 2, 3, 4, 5],
        allowedTimeRanges: [{ start: '08:00', end: '18:00' }]
      });

      const tutorToken = await issueMagicToken(tutorUser.id);
      const tutorAuth = await loginWithMagicToken(app, tutorToken);
      const adminToken = await issueMagicToken(admin.id);
      const adminAuth = await loginWithMagicToken(app, adminToken);

      const assignmentId = (await pool.query(`select id from assignments where tutor_id = $1`, [tutor.id])).rows[0].id;
      const sessionRes = await app.inject({
        method: 'POST',
        url: '/tutor/sessions',
        headers: tutorAuth.headers,
        payload: { assignmentId, studentId: student.id, date: '2026-01-05', startTime: '10:00', endTime: '11:00', mode: 'in-person' }
      });
      const sessionId = sessionRes.json().session.id as string;
      await app.inject({ method: 'POST', url: `/tutor/sessions/${sessionId}/submit`, headers: tutorAuth.headers });

      const rejectRes = await app.inject({
        method: 'POST',
        url: `/admin/sessions/${sessionId}/reject`,
        headers: adminAuth.headers,
        payload: { reason: 'Duplicate entry' }
      });

      expect(rejectRes.statusCode).toBe(200);
      expect(rejectRes.json().session.status).toBe('REJECTED');
      await app.close();
    });

    it('lists sessions via GET /admin/sessions', async () => {
      const app = await buildApp();
      const admin = await createAdmin();
      const token = await issueMagicToken(admin.id);
      const auth = await loginWithMagicToken(app, token);

      const res = await app.inject({ method: 'GET', url: '/admin/sessions', headers: auth.headers });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('sessions');
      expect(Array.isArray(body.sessions)).toBe(true);
      await app.close();
    });
  });

  // ─── Payroll ──────────────────────────────────────────────────────────────

  describe('Payroll', () => {
    it('generates payroll for a week via POST /admin/payroll/generate-week', async () => {
      const app = await buildApp();
      const admin = await createAdmin();
      const { tutor, user: tutorUser } = await createTutor({
        email: 'tutor@example.com',
        fullName: 'Tutor Pay',
        defaultHourlyRate: 300
      });
      const student = await createStudent({ fullName: 'Student Pay' });
      await createAssignment({
        tutorId: tutor.id,
        studentId: student.id,
        subject: 'English',
        startDate: '2026-02-01',
        allowedDays: [1, 2, 3, 4, 5],
        allowedTimeRanges: [{ start: '08:00', end: '18:00' }]
      });

      const tutorToken = await issueMagicToken(tutorUser.id);
      const tutorAuth = await loginWithMagicToken(app, tutorToken);
      const adminToken = await issueMagicToken(admin.id);
      const adminAuth = await loginWithMagicToken(app, adminToken);

      const assignmentId = (await pool.query(`select id from assignments where tutor_id = $1`, [tutor.id])).rows[0].id;
      const sessionRes = await app.inject({
        method: 'POST',
        url: '/tutor/sessions',
        headers: tutorAuth.headers,
        payload: { assignmentId, studentId: student.id, date: '2026-02-02', startTime: '09:00', endTime: '11:00', mode: 'online' }
      });
      const sessionId = sessionRes.json().session.id as string;
      await app.inject({ method: 'POST', url: `/tutor/sessions/${sessionId}/submit`, headers: tutorAuth.headers });
      await app.inject({ method: 'POST', url: `/admin/sessions/${sessionId}/approve`, headers: adminAuth.headers });

      const genRes = await app.inject({
        method: 'POST',
        url: '/admin/payroll/generate-week',
        headers: adminAuth.headers,
        payload: { weekStart: '2026-02-02' }
      });

      expect(genRes.statusCode).toBe(200);
      const body = genRes.json();
      expect(body).toHaveProperty('payPeriod');
      await app.close();
    });

    it('locks a pay period via POST /admin/pay-periods/:weekStart/lock', async () => {
      const app = await buildApp();
      const admin = await createAdmin();
      const { tutor } = await createTutor({ email: 'tutor@example.com', fullName: 'Tutor Lock', defaultHourlyRate: 300 });
      await createPayPeriod({ weekStart: '2026-03-02', weekEnd: '2026-03-08', status: 'OPEN' });

      const adminToken = await issueMagicToken(admin.id);
      const adminAuth = await loginWithMagicToken(app, adminToken);

      const lockRes = await app.inject({
        method: 'POST',
        url: '/admin/pay-periods/2026-03-02/lock',
        headers: adminAuth.headers
      });

      expect(lockRes.statusCode).toBe(200);
      expect(lockRes.json().payPeriod.status).toBe('LOCKED');
      await app.close();
    });
  });

  // ─── Adjustments ──────────────────────────────────────────────────────────

  describe('Adjustments', () => {
    it('creates an adjustment via POST /admin/pay-periods/:weekStart/adjustments', async () => {
      const app = await buildApp();
      const admin = await createAdmin();
      const { tutor } = await createTutor({ email: 'tutor@example.com', fullName: 'Tutor Adj', defaultHourlyRate: 300 });
      await createPayPeriod({ weekStart: '2026-03-02', weekEnd: '2026-03-08' });

      const adminToken = await issueMagicToken(admin.id);
      const adminAuth = await loginWithMagicToken(app, adminToken);

      const res = await app.inject({
        method: 'POST',
        url: '/admin/pay-periods/2026-03-02/adjustments',
        headers: adminAuth.headers,
        payload: { tutorId: tutor.id, type: 'BONUS', amount: 100, reason: 'Great work' }
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().adjustment).toMatchObject({ type: 'BONUS', amount: '100' });
      await app.close();
    });

    it('lists adjustments via GET /admin/pay-periods/:weekStart/adjustments', async () => {
      const app = await buildApp();
      const admin = await createAdmin();
      const { tutor } = await createTutor({ email: 'tutor@example.com', fullName: 'Tutor AdjList', defaultHourlyRate: 300 });
      const payPeriod = await createPayPeriod({ weekStart: '2026-03-02', weekEnd: '2026-03-08' });
      await createAdjustment({
        tutorId: tutor.id,
        payPeriodId: payPeriod.id,
        type: 'CORRECTION',
        amount: 50,
        reason: 'Rate correction',
        createdByUserId: admin.id
      });

      const adminToken = await issueMagicToken(admin.id);
      const adminAuth = await loginWithMagicToken(app, adminToken);

      const res = await app.inject({
        method: 'GET',
        url: '/admin/pay-periods/2026-03-02/adjustments',
        headers: adminAuth.headers
      });

      expect(res.statusCode).toBe(200);
      const adjustments = res.json().adjustments ?? res.json();
      expect(Array.isArray(adjustments)).toBe(true);
      expect(adjustments.length).toBeGreaterThanOrEqual(1);
      await app.close();
    });

    it('deletes an adjustment via DELETE /admin/adjustments/:id', async () => {
      const app = await buildApp();
      const admin = await createAdmin();
      const { tutor } = await createTutor({ email: 'tutor@example.com', fullName: 'Tutor Del', defaultHourlyRate: 300 });
      const payPeriod = await createPayPeriod({ weekStart: '2026-03-09', weekEnd: '2026-03-15' });
      const adjustment = await createAdjustment({
        tutorId: tutor.id,
        payPeriodId: payPeriod.id,
        type: 'PENALTY',
        amount: 25,
        reason: 'Late cancellation',
        createdByUserId: admin.id
      });

      const adminToken = await issueMagicToken(admin.id);
      const adminAuth = await loginWithMagicToken(app, adminToken);

      const res = await app.inject({
        method: 'DELETE',
        url: `/admin/adjustments/${adjustment.id}`,
        headers: adminAuth.headers
      });

      expect(res.statusCode).toBe(200);
      await app.close();
    });
  });
});
