import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { resetDb } from './helpers/db.js';
import { createAdmin, createAssignment, createStudent, createTutor } from './helpers/factories.js';

describe('audit immutability controls', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('blocks direct UPDATE and DELETE on audit_log unless retention bypass is enabled', async () => {
    const admin = await createAdmin('immutability-admin@example.com');

    const insert = await pool.query(
      `insert into audit_log (actor_user_id, actor_role, action, entity_type, entity_id)
       values ($1, 'ADMIN', 'test.action', 'test_entity', 'entity-1')
       returning id`,
      [admin.id]
    );
    const auditId = insert.rows[0].id as string;

    await expect(
      pool.query(`update audit_log set action = 'tamper' where id = $1`, [auditId])
    ).rejects.toThrow(/immutable/i);

    await expect(
      pool.query(`delete from audit_log where id = $1`, [auditId])
    ).rejects.toThrow(/blocked outside retention cleanup/i);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`set local app.retention_cleanup = 'on'`);
      const deleted = await client.query(`delete from audit_log where id = $1`, [auditId]);
      await client.query('COMMIT');
      expect(deleted.rowCount).toBe(1);
    } finally {
      client.release();
    }
  });

  it('blocks direct UPDATE and DELETE on session_history unless retention bypass is enabled', async () => {
    const admin = await createAdmin('immutability-admin2@example.com');
    const { tutor } = await createTutor({
      email: 'immutability-tutor@example.com',
      fullName: 'Immutability Tutor',
      defaultHourlyRate: 250
    });
    const student = await createStudent({ fullName: 'Immutability Student' });
    const assignment = await createAssignment({
      tutorId: tutor.id,
      studentId: student.id,
      subject: 'Math',
      startDate: '2026-03-01',
      allowedDays: [1, 2, 3, 4, 5],
      allowedTimeRanges: [{ start: '08:00', end: '18:00' }]
    });

    const sessionRes = await pool.query(
      `insert into sessions
       (tutor_id, student_id, assignment_id, date, start_time, end_time, duration_minutes, mode, status)
       values ($1, $2, $3, $4::date, $5::time, $6::time, $7, $8, 'DRAFT')
       returning id`,
      [tutor.id, student.id, assignment.id, '2026-03-03', '09:00', '10:00', 60, 'online']
    );
    const sessionId = sessionRes.rows[0].id as string;

    const historyRes = await pool.query(
      `insert into session_history (session_id, changed_by_user_id, change_type, before_json, after_json)
       values ($1, $2, 'create', '{}'::jsonb, '{}'::jsonb)
       returning id`,
      [sessionId, admin.id]
    );
    const historyId = historyRes.rows[0].id as string;

    await expect(
      pool.query(`update session_history set change_type = 'tamper' where id = $1`, [historyId])
    ).rejects.toThrow(/immutable/i);

    await expect(
      pool.query(`delete from session_history where id = $1`, [historyId])
    ).rejects.toThrow(/blocked outside retention cleanup/i);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`set local app.retention_cleanup = 'on'`);
      const deleted = await client.query(`delete from session_history where id = $1`, [historyId]);
      await client.query('COMMIT');
      expect(deleted.rowCount).toBe(1);
    } finally {
      client.release();
    }
  });
});
