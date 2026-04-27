import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { resetDb } from './helpers/db.js';
import { pool } from '../src/db/pool.js';
import { hashPassword } from '../src/lib/security.js';
import {
  createAdmin,
  createAssignment,
  createStudent,
  createTutor,
  issueMagicToken,
  loginWithMagicToken
} from './helpers/factories.js';

describe('Auth + RBAC', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('verifies magic link and sets session cookie', async () => {
    const app = await buildApp();
    const admin = await createAdmin('admin@example.com');
    const token = await issueMagicToken(admin.id);

    const { response, cookie } = await loginWithMagicToken(app, token);
    expect(response.statusCode).toBe(302);
    expect(cookie).toMatch(/^session=/);
    await app.close();
  });

  it('blocks magic link token reuse', async () => {
    const app = await buildApp();
    const admin = await createAdmin('admin@example.com');
    const token = await issueMagicToken(admin.id);

    const first = await app.inject({
      method: 'GET',
      url: `/auth/verify?token=${token}`
    });

    expect(first.statusCode).toBe(302);

    const second = await app.inject({
      method: 'GET',
      url: `/auth/verify?token=${token}`
    });

    expect(second.statusCode).toBe(400);
    expect(second.json().error).toBe('token_used');
    await app.close();
  });

  it('blocks admin routes without cookie', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/students',
      payload: { fullName: 'A B' }
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('blocks tutors from admin endpoints', async () => {
    const app = await buildApp();
    const { user } = await createTutor({
      email: 'tutor@example.com',
      fullName: 'Tutor One',
      defaultHourlyRate: 300
    });
    const token = await issueMagicToken(user.id);
    const auth = await loginWithMagicToken(app, token);

    const res = await app.inject({
      method: 'GET',
      url: '/admin/tutors',
      headers: auth.headers
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('requires MFA for admin password login', async () => {
    const app = await buildApp();

    const passwordHash = await hashPassword('correct-horse-battery-staple');
    const res = await pool.query(
      `insert into users (email, role, password_hash, is_active)
       values ($1, 'ADMIN', $2, true)
       returning email`,
      ['admin-mfa@example.com', passwordHash]
    );

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: res.rows[0].email, password: 'correct-horse-battery-staple' }
    });

    expect(login.statusCode).toBe(403);
    expect(login.json().error).toBe('admin_login_requires_mfa');
    await app.close();
  });

  it('blocks tutors from other tutor sessions', async () => {
    const app = await buildApp();

    const { tutor: tutorA, user: userA } = await createTutor({
      email: 'tutor-a@example.com',
      fullName: 'Tutor A',
      defaultHourlyRate: 300
    });
    const { user: userB } = await createTutor({
      email: 'tutor-b@example.com',
      fullName: 'Tutor B',
      defaultHourlyRate: 300
    });
    const student = await createStudent({ fullName: 'Student One' });
    const assignment = await createAssignment({
      tutorId: tutorA.id,
      studentId: student.id,
      subject: 'Math',
      startDate: '2026-02-01',
      allowedDays: [1, 2, 3, 4, 5],
      allowedTimeRanges: [{ start: '08:00', end: '18:00' }]
    });

    const tokenA = await issueMagicToken(userA.id);
    const authA = await loginWithMagicToken(app, tokenA);

    const sessionRes = await app.inject({
      method: 'POST',
      url: '/tutor/sessions',
      headers: authA.headers,
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

    const tokenB = await issueMagicToken(userB.id);
    const authB = await loginWithMagicToken(app, tokenB);

    const res = await app.inject({
      method: 'PATCH',
      url: `/tutor/sessions/${sessionId}`,
      headers: authB.headers,
      payload: { notes: 'Attempted update' }
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('allows admins to access admin endpoints', async () => {
    const app = await buildApp();
    const admin = await createAdmin('admin@example.com');
    const token = await issueMagicToken(admin.id);
    const auth = await loginWithMagicToken(app, token);

    const res = await app.inject({
      method: 'GET',
      url: '/admin/sessions',
      headers: auth.headers
    });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('requires CSRF for state-changing requests', async () => {
    const app = await buildApp();
    const admin = await createAdmin('admin@example.com');
    const token = await issueMagicToken(admin.id);
    const auth = await loginWithMagicToken(app, token);

    const missing = await app.inject({
      method: 'POST',
      url: '/admin/students',
      headers: { cookie: auth.cookie },
      payload: { fullName: 'CSRF Test' }
    });

    expect(missing.statusCode).toBe(403);
    expect(missing.json().error).toBe('csrf_missing_or_invalid');

    const ok = await app.inject({
      method: 'POST',
      url: '/admin/students',
      headers: auth.headers,
      payload: { fullName: 'CSRF Test OK' }
    });

    expect(ok.statusCode).toBe(201);
    await app.close();
  });

  it('blocks cross-origin state-changing requests even with CSRF', async () => {
    const app = await buildApp();
    const admin = await createAdmin('admin@example.com');
    const token = await issueMagicToken(admin.id);
    const auth = await loginWithMagicToken(app, token);

    const blocked = await app.inject({
      method: 'POST',
      url: '/admin/students',
      headers: {
        ...auth.headers,
        origin: 'https://evil.example.com'
      },
      payload: { fullName: 'Origin Attack' }
    });

    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error).toBe('origin_not_allowed');
    await app.close();
  });

  it('revokes current session on logout and blocks logout-all sessions', async () => {
    const app = await buildApp();
    const admin = await createAdmin('admin@example.com');

    const tokenA = await issueMagicToken(admin.id);
    const authA = await loginWithMagicToken(app, tokenA);

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: authA.headers
    });
    expect(logoutRes.statusCode).toBe(200);

    const postLogoutAccess = await app.inject({
      method: 'GET',
      url: '/admin/sessions',
      headers: authA.headers
    });
    expect(postLogoutAccess.statusCode).toBe(401);

    const tokenB = await issueMagicToken(admin.id);
    const authB = await loginWithMagicToken(app, tokenB);

    const globalLogout = await app.inject({
      method: 'POST',
      url: '/auth/logout-all',
      headers: authB.headers
    });
    expect(globalLogout.statusCode).toBe(200);

    const afterGlobalLogout = await app.inject({
      method: 'GET',
      url: '/admin/sessions',
      headers: authB.headers
    });
    expect(afterGlobalLogout.statusCode).toBe(401);

    await app.close();
  });

  it('rate limits magic link requests', async () => {
    const app = await buildApp();
    const admin = await createAdmin('admin@example.com');

    let status = 0;
    for (let i = 0; i < 6; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/request-link',
        payload: { email: admin.email }
      });
      status = res.statusCode;
    }

    expect(status).toBe(429);
    await app.close();
  });
});
