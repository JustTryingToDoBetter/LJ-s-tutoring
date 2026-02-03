import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { resetDb } from './helpers/db.js';
import { pool } from '../src/db/pool.js';

async function bootstrapAdmin(app: any) {
  process.env.ADMIN_BOOTSTRAP_TOKEN = 'bootstrap';
  const reg = await app.inject({
    method: 'POST',
    url: '/auth/register-admin',
    payload: {
      email: 'admin@example.com',
      password: 'superstrongpassword123',
      firstName: 'Admin',
      lastName: 'User',
      bootstrapToken: 'bootstrap'
    }
  });
  return reg.json().token as string;
}

describe('Tutor logging security', () => {
  beforeEach(async () => resetDb());
  afterAll(async () => pool.end());

  it('prevents tutor logging for unassigned student (IDOR)', async () => {
    const app = await buildApp();
    const adminToken = await bootstrapAdmin(app);

    // Create tutor
    const tutorRes = await app.inject({
      method: 'POST',
      url: '/admin/tutors',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        email: 'tutor@example.com',
        password: 'superstrongpassword123',
        firstName: 'T',
        lastName: 'U'
      }
    });
    expect(tutorRes.statusCode).toBe(201);

    // Create two students
    const s1 = await app.inject({
      method: 'POST',
      url: '/admin/students',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { firstName: 'Stu', lastName: 'One', grade: '10' }
    });
    const s2 = await app.inject({
      method: 'POST',
      url: '/admin/students',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { firstName: 'Stu', lastName: 'Two', grade: '10' }
    });

    const student1Id = s1.json().student.id;
    const student2Id = s2.json().student.id;

    // Assign only student1
    const tutorId = tutorRes.json().tutor.id;
    await app.inject({
      method: 'POST',
      url: '/admin/assignments',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { tutorId, studentId: student1Id, isActive: true }
    });

    // Login tutor
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'tutor@example.com', password: 'superstrongpassword123' }
    });
    const tutorToken = login.json().token as string;

    // Attempt to log for student2 (not assigned)
    const now = new Date();
    const start = new Date(now.getTime() - 60 * 60000);
    const end = new Date(now.getTime() - 30 * 60000);

    const log = await app.inject({
      method: 'POST',
      url: '/tutor/sessions',
      headers: { authorization: `Bearer ${tutorToken}` },
      payload: {
        studentId: student2Id,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        notes: 'Trying IDOR'
      }
    });

    expect(log.statusCode).toBe(403);
    expect(log.json().error).toBe('student_not_assigned_to_tutor');

    await app.close();
  });

  it('blocks logging outside assignment window', async () => {
    const app = await buildApp();
    const adminToken = await bootstrapAdmin(app);

    const tutorRes = await app.inject({
      method: 'POST',
      url: '/admin/tutors',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        email: 'tutor@example.com',
        password: 'superstrongpassword123',
        firstName: 'T',
        lastName: 'U'
      }
    });

    const studentRes = await app.inject({
      method: 'POST',
      url: '/admin/students',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { firstName: 'Stu', lastName: 'One' }
    });

    const tutorId = tutorRes.json().tutor.id;
    const studentId = studentRes.json().student.id;

    // assignment valid from now-10m to now-5m (so current time is outside)
    // Make base far enough in the past so a 30-min session can't drift into "future"
    const base = new Date(Date.now() - 2 * 60 * 60_000); // 2 hours safely in the past

    const validFrom = new Date(base.getTime() - 10 * 60_000); // base - 10m
    const validTo   = new Date(base.getTime() - 5  * 60_000); // base - 5m


    await app.inject({
      method: 'POST',
      url: '/admin/assignments',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { tutorId, studentId, isActive: true, validFrom: validFrom.toISOString(), validTo: validTo.toISOString() }
    });

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'tutor@example.com', password: 'superstrongpassword123' }
    });
    const tutorToken = login.json().token as string;

    // Session happens AFTER validTo and lasts 30 minutes (passes min-duration rule)
    const start = new Date(base.getTime() - 4 * 60_000); // base - 4m
    const end   = new Date(base.getTime() + 30 * 60_000); // base - 3m

    const log = await app.inject({
      method: 'POST',
      url: '/tutor/sessions',
      headers: { authorization: `Bearer ${tutorToken}` },
      payload: { studentId, startAt: start.toISOString(), endAt: end.toISOString(), notes: 'Outside window' }
    });

    expect(log.statusCode).toBe(403);
    expect(log.json().error).toBe('outside_assignment_window');

    await app.close();
  });
});
