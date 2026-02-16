import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { resetDb } from './helpers/db.js';
import { createAdmin, createStudent, createTutor, issueMagicToken, loginWithMagicToken } from './helpers/factories.js';

describe('Community RBAC', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('restricts student posting surfaces to STUDENT role', async () => {
    const app = await buildApp();

    const admin = await createAdmin('admin-community-rbac@test.local');
    const { user: tutorUser } = await createTutor({
      email: 'tutor-community-rbac@test.local',
      fullName: 'Tutor Community RBAC',
    });

    const student = await createStudent({ fullName: 'Student RBAC', grade: '11' });
    const studentUserRes = await pool.query(
      `insert into users (email, role, student_id)
       values ($1, 'STUDENT', $2)
       returning id`,
      ['student-community-rbac@test.local', student.id]
    );

    const adminAuth = await loginWithMagicToken(app, await issueMagicToken(admin.id));
    const tutorAuth = await loginWithMagicToken(app, await issueMagicToken(tutorUser.id));
    const studentAuth = await loginWithMagicToken(app, await issueMagicToken(studentUserRes.rows[0].id as string));

    const questionByAdmin = await app.inject({
      method: 'POST',
      url: '/community/questions',
      headers: adminAuth.headers,
      payload: {
        subject: 'Mathematics',
        topic: 'Algebra',
        title: 'How do I simplify this?',
        body: 'Need help simplifying this expression.'
      }
    });
    expect(questionByAdmin.statusCode).toBe(403);

    const challengeCreate = await app.inject({
      method: 'POST',
      url: '/community/challenges',
      headers: tutorAuth.headers,
      payload: {
        title: 'Algebra Sprint',
        subject: 'Mathematics',
        grade: '11',
        weekStart: '2026-02-16',
        weekEnd: '2026-02-22',
        xpReward: 30,
      }
    });
    expect(challengeCreate.statusCode).toBe(201);

    const challengeId = challengeCreate.json().challenge.id as string;

    const tutorSubmit = await app.inject({
      method: 'POST',
      url: `/community/challenges/${challengeId}/submissions`,
      headers: tutorAuth.headers,
      payload: { content: 'Tutor should not submit this.' }
    });
    expect(tutorSubmit.statusCode).toBe(403);

    const studentQuestion = await app.inject({
      method: 'POST',
      url: '/community/questions',
      headers: studentAuth.headers,
      payload: {
        subject: 'Mathematics',
        topic: 'Functions',
        title: 'How do I graph this function?',
        body: 'Please explain the steps to graph a quadratic function.'
      }
    });
    expect(studentQuestion.statusCode).toBe(201);

    await app.close();
  });
});
