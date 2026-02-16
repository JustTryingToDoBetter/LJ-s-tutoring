import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { resetDb } from './helpers/db.js';
import { createStudent, createTutor, issueMagicToken, loginWithMagicToken } from './helpers/factories.js';

describe('Community moderation endpoints', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('supports report, verify, hide, and block flows', async () => {
    const app = await buildApp();

    const { user: tutorUser } = await createTutor({
      email: 'tutor-community-mod@test.local',
      fullName: 'Tutor Moderator',
    });

    const studentA = await createStudent({ fullName: 'Student A', grade: '11' });
    const studentB = await createStudent({ fullName: 'Student B', grade: '11' });

    const studentAUser = await pool.query(
      `insert into users (email, role, student_id)
       values ($1, 'STUDENT', $2)
       returning id`,
      ['student-a-community-mod@test.local', studentA.id]
    );
    const studentBUser = await pool.query(
      `insert into users (email, role, student_id)
       values ($1, 'STUDENT', $2)
       returning id`,
      ['student-b-community-mod@test.local', studentB.id]
    );

    const tutorAuth = await loginWithMagicToken(app, await issueMagicToken(tutorUser.id));
    const studentAAuth = await loginWithMagicToken(app, await issueMagicToken(studentAUser.rows[0].id as string));
    const studentBAuth = await loginWithMagicToken(app, await issueMagicToken(studentBUser.rows[0].id as string));

    const questionRes = await app.inject({
      method: 'POST',
      url: '/community/questions',
      headers: studentAAuth.headers,
      payload: {
        subject: 'Mathematics',
        topic: 'Trigonometry',
        title: 'How do sine rules work?',
        body: 'Can someone explain when to use sine rule versus cosine rule?'
      }
    });
    expect(questionRes.statusCode).toBe(201);
    const questionId = questionRes.json().question.id as string;

    const answerRes = await app.inject({
      method: 'POST',
      url: `/community/questions/${questionId}/answers`,
      headers: studentBAuth.headers,
      payload: {
        body: 'Use sine rule when you know an angle-opposite side pair.'
      }
    });
    expect(answerRes.statusCode).toBe(201);
    const answerId = answerRes.json().answer.id as string;

    const verifyRes = await app.inject({
      method: 'POST',
      url: `/community/answers/${answerId}/verify`,
      headers: tutorAuth.headers,
      payload: {}
    });
    expect(verifyRes.statusCode).toBe(200);

    const reportRes = await app.inject({
      method: 'POST',
      url: '/community/moderation/report',
      headers: studentAAuth.headers,
      payload: {
        targetType: 'ANSWER',
        targetId: answerId,
        reason: 'Contains misleading details for this level.'
      }
    });
    expect(reportRes.statusCode).toBe(201);

    const hideRes = await app.inject({
      method: 'PATCH',
      url: `/community/moderation/ANSWER/${answerId}/hide`,
      headers: tutorAuth.headers,
      payload: {}
    });
    expect(hideRes.statusCode).toBe(200);

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/community/moderation/ANSWER/${answerId}`,
      headers: tutorAuth.headers,
      payload: {}
    });
    expect(deleteRes.statusCode).toBe(200);

    const blockRes = await app.inject({
      method: 'POST',
      url: '/community/moderation/block',
      headers: studentAAuth.headers,
      payload: {
        blockedUserId: studentBUser.rows[0].id
      }
    });
    expect(blockRes.statusCode).toBe(200);

    await app.close();
  });
});
