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

describe('Phase 5 operational readiness', () => {
  beforeEach(async () => resetDb());
  afterAll(async () => pool.end());

  it('bulk approve only affects submitted sessions', async () => {
    const app = await buildApp();

    const admin = await createAdmin('admin@example.com');
    const adminToken = await issueMagicToken(admin.id);
    const adminAuth = await loginWithMagicToken(app, adminToken);

    const { tutor, user } = await createTutor({
      email: 'tutor@example.com',
      fullName: 'Tutor Bulk',
      defaultHourlyRate: 300
    });
    const student = await createStudent({ fullName: 'Student Bulk' });

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

    const draftRes = await app.inject({
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
    const draftId = draftRes.json().session.id as string;

    const submittedRes = await app.inject({
      method: 'POST',
      url: '/tutor/sessions',
      headers: tutorAuth.headers,
      payload: {
        assignmentId: assignment.id,
        studentId: student.id,
        date: '2026-02-04',
        startTime: '10:00',
        endTime: '11:00',
        mode: 'online'
      }
    });
    const submittedId = submittedRes.json().session.id as string;

    await app.inject({
      method: 'POST',
      url: `/tutor/sessions/${submittedId}/submit`,
      headers: tutorAuth.headers
    });

    const bulkRes = await app.inject({
      method: 'POST',
      url: '/admin/sessions/bulk-approve',
      headers: adminAuth.headers,
      payload: {
        sessionIds: [draftId, submittedId]
      }
    });

    expect(bulkRes.statusCode).toBe(200);
    const results = bulkRes.json().results as Array<{ sessionId: string; status: string }>;
    expect(results.find((r) => r.sessionId === draftId)?.status).toBe('skipped');
    expect(results.find((r) => r.sessionId === submittedId)?.status).toBe('approved');

    const statusRes = await pool.query('select status from sessions where id = $1', [submittedId]);
    expect(statusRes.rows[0].status).toBe('APPROVED');

    await app.close();
  });

  it('bulk reject only affects submitted sessions', async () => {
    const app = await buildApp();

    const admin = await createAdmin('admin@example.com');
    const adminToken = await issueMagicToken(admin.id);
    const adminAuth = await loginWithMagicToken(app, adminToken);

    const { tutor, user } = await createTutor({
      email: 'tutor@example.com',
      fullName: 'Tutor Bulk Reject',
      defaultHourlyRate: 300
    });
    const student = await createStudent({ fullName: 'Student Bulk Reject' });

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

    const draftRes = await app.inject({
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
    const draftId = draftRes.json().session.id as string;

    const submittedRes = await app.inject({
      method: 'POST',
      url: '/tutor/sessions',
      headers: tutorAuth.headers,
      payload: {
        assignmentId: assignment.id,
        studentId: student.id,
        date: '2026-02-04',
        startTime: '10:00',
        endTime: '11:00',
        mode: 'online'
      }
    });
    const submittedId = submittedRes.json().session.id as string;

    await app.inject({
      method: 'POST',
      url: `/tutor/sessions/${submittedId}/submit`,
      headers: tutorAuth.headers
    });

    const bulkRes = await app.inject({
      method: 'POST',
      url: '/admin/sessions/bulk-reject',
      headers: adminAuth.headers,
      payload: {
        sessionIds: [draftId, submittedId],
        reason: 'invalid'
      }
    });

    expect(bulkRes.statusCode).toBe(200);
    const results = bulkRes.json().results as Array<{ sessionId: string; status: string }>;
    expect(results.find((r) => r.sessionId === draftId)?.status).toBe('skipped');
    expect(results.find((r) => r.sessionId === submittedId)?.status).toBe('rejected');

    const statusRes = await pool.query('select status from sessions where id = $1', [submittedId]);
    expect(statusRes.rows[0].status).toBe('REJECTED');

    await app.close();
  });

  it('history diffs are readable and stable', async () => {
    const app = await buildApp();

    const admin = await createAdmin('admin@example.com');
    const adminToken = await issueMagicToken(admin.id);
    const adminAuth = await loginWithMagicToken(app, adminToken);

    const { tutor, user } = await createTutor({
      email: 'tutor@example.com',
      fullName: 'Tutor History',
      defaultHourlyRate: 300
    });
    const student = await createStudent({ fullName: 'Student History' });

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
        date: '2026-02-05',
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

    const historyRes = await app.inject({
      method: 'GET',
      url: `/admin/sessions/${sessionId}/history`,
      headers: adminAuth.headers
    });

    expect(historyRes.statusCode).toBe(200);
    const history = historyRes.json().history as Array<any>;
    expect(history.length).toBeGreaterThan(0);
    const diffs = history[0].diffs as Array<{ field: string; label: string; before: string; after: string }>;
    const statusDiff = diffs.find((diff) => diff.field === 'status');
    expect(statusDiff?.label).toBe('Status');
    expect(statusDiff?.before).toBe('SUBMITTED');
    expect(statusDiff?.after).toBe('APPROVED');

    await app.close();
  });

  it('impersonation is read-only and auditable', async () => {
    const app = await buildApp();

    const admin = await createAdmin('admin@example.com');
    const adminToken = await issueMagicToken(admin.id);
    const adminAuth = await loginWithMagicToken(app, adminToken);

    const { tutor } = await createTutor({
      email: 'tutor@example.com',
      fullName: 'Tutor Impersonation',
      defaultHourlyRate: 300
    });
    const student = await createStudent({ fullName: 'Student Impersonation' });

    const assignment = await createAssignment({
      tutorId: tutor.id,
      studentId: student.id,
      subject: 'Math',
      startDate: '2026-02-01',
      allowedDays: [1, 2, 3, 4, 5],
      allowedTimeRanges: [{ start: '08:00', end: '18:00' }]
    });

    const startRes = await app.inject({
      method: 'POST',
      url: '/admin/impersonate/start',
      headers: adminAuth.headers,
      payload: { tutorId: tutor.id }
    });

    expect(startRes.statusCode).toBe(200);
    const token = startRes.json().impersonationToken as string;
    const impersonationId = startRes.json().impersonationId as string;

    const readRes = await app.inject({
      method: 'GET',
      url: '/tutor/me',
      headers: {
        'X-Impersonation-Token': token
      }
    });

    expect(readRes.statusCode).toBe(200);

    const writeRes = await app.inject({
      method: 'POST',
      url: '/tutor/sessions',
      headers: {
        'X-Impersonation-Token': token
      },
      payload: {
        assignmentId: assignment.id,
        studentId: student.id,
        date: '2026-02-06',
        startTime: '10:00',
        endTime: '11:00',
        mode: 'online'
      }
    });

    expect(writeRes.statusCode).toBe(403);
    expect(writeRes.json().error).toBe('impersonation_read_only');

    await app.inject({
      method: 'POST',
      url: '/admin/impersonate/stop',
      headers: adminAuth.headers,
      payload: { impersonationId }
    });

    const auditRes = await pool.query(
      `select action from audit_log where action like 'impersonation.%' order by created_at asc`
    );
    const actions = auditRes.rows.map((row) => row.action);
    expect(actions).toContain('impersonation.start');
    expect(actions).toContain('impersonation.read');
    expect(actions).toContain('impersonation.stop');

    await app.close();
  });

  it('returns and logs correlation ids on requests', async () => {
    const app = await buildApp();

    const logs: string[] = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: any) => {
      logs.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
      return true;
    }) as typeof process.stdout.write;

    const requestId = 'test-request-id-123';
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': requestId
      }
    });

    process.stdout.write = originalWrite;

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-request-id']).toBe(requestId);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.db?.ok).toBe(true);

    const combinedLogs = logs.join('');
    expect(combinedLogs).toContain(requestId);

    await app.close();
  });

  it('ready endpoint reports database and migration health', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/ready'
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.db?.ok).toBe(true);
    expect(body.migrations?.ok).toBe(true);

    await app.close();
  });
});
