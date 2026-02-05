import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { isWithinAssignmentWindow } from '../src/lib/scheduling.js';
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

describe('Assignment window and overlap regression', () => {
  beforeEach(async () => resetDb());
  afterAll(async () => pool.end());

  it('rejects sessions outside assignment date window', () => {
    const before = isWithinAssignmentWindow('2026-01-31', '15:00', '16:00', {
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      allowedDays: [1, 3, 5],
      allowedTimeRanges: [{ start: '15:00', end: '18:00' }]
    });

    const after = isWithinAssignmentWindow('2026-03-01', '15:00', '16:00', {
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      allowedDays: [1, 3, 5],
      allowedTimeRanges: [{ start: '15:00', end: '18:00' }]
    });

    expect(before).toBe(false);
    expect(after).toBe(false);
  });

  it('accepts adjacent sessions but rejects containment overlaps', async () => {
    const app = await buildApp();
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

    const first = await app.inject({
      method: 'POST',
      url: '/tutor/sessions',
      headers: tutorAuth.headers,
      payload: {
        assignmentId: assignment.id,
        studentId: student.id,
        date: '2026-02-03',
        startTime: '09:00',
        endTime: '11:00',
        mode: 'online'
      }
    });
    expect(first.statusCode).toBe(201);

    const adjacent = await app.inject({
      method: 'POST',
      url: '/tutor/sessions',
      headers: tutorAuth.headers,
      payload: {
        assignmentId: assignment.id,
        studentId: student.id,
        date: '2026-02-03',
        startTime: '11:00',
        endTime: '12:00',
        mode: 'online'
      }
    });
    expect(adjacent.statusCode).toBe(201);

    const contained = await app.inject({
      method: 'POST',
      url: '/tutor/sessions',
      headers: tutorAuth.headers,
      payload: {
        assignmentId: assignment.id,
        studentId: student.id,
        date: '2026-02-03',
        startTime: '09:30',
        endTime: '10:00',
        mode: 'online'
      }
    });
    expect(contained.statusCode).toBe(409);
    expect(contained.json().error).toBe('overlapping_session');

    await app.close();
  });

  it('enforces status transitions on edit/approve/reject', async () => {
    const app = await buildApp();
    const admin = await createAdmin('admin@example.com');
    const adminToken = await issueMagicToken(admin.id);
    const adminAuth = await loginWithMagicToken(app, adminToken);

    const { tutor, user } = await createTutor({
      email: 'tutor@example.com',
      fullName: 'Tutor Status',
      defaultHourlyRate: 300
    });
    const student = await createStudent({ fullName: 'Student Status' });

    const assignment = await createAssignment({
      tutorId: tutor.id,
      studentId: student.id,
      subject: 'Physics',
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
        date: '2026-02-04',
        startTime: '09:00',
        endTime: '10:00',
        mode: 'online'
      }
    });
    const sessionId = sessionRes.json().session.id as string;

    const approveDraft = await app.inject({
      method: 'POST',
      url: `/admin/sessions/${sessionId}/approve`,
      headers: adminAuth.headers
    });
    expect(approveDraft.statusCode).toBe(409);
    expect(approveDraft.json().error).toBe('only_submitted_approvable');

    const rejectDraft = await app.inject({
      method: 'POST',
      url: `/admin/sessions/${sessionId}/reject`,
      headers: adminAuth.headers,
      payload: { reason: 'Missing details' }
    });
    expect(rejectDraft.statusCode).toBe(409);
    expect(rejectDraft.json().error).toBe('only_submitted_rejectable');

    await app.inject({
      method: 'POST',
      url: `/tutor/sessions/${sessionId}/submit`,
      headers: tutorAuth.headers
    });

    const editAfterSubmit = await app.inject({
      method: 'PATCH',
      url: `/tutor/sessions/${sessionId}`,
      headers: tutorAuth.headers,
      payload: { notes: 'Attempted edit' }
    });
    expect(editAfterSubmit.statusCode).toBe(409);
    expect(editAfterSubmit.json().error).toBe('only_draft_editable');

    await app.close();
  });
});
