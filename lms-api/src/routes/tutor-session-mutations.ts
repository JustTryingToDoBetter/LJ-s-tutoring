import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { requireTutor } from '../lib/rbac.js';
import { AmendSessionSchema } from '../lib/schemas.js';

export async function tutorSessionMutationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireTutor);

  // Amend (append-only)
  app.post('/tutor/sessions/:logicalSessionId/amend', async (req, reply) => {
    const tutorId = req.user!.tutorId!;
    const logicalSessionId = (req.params as any).logicalSessionId as string;

    const parsed = AmendSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const start = new Date(parsed.data.startAt);
    const end = new Date(parsed.data.endAt);
    const now = new Date();

    if (!(end > start)) return reply.code(400).send({ error: 'end_must_be_after_start' });
    if (start > now || end > now) return reply.code(400).send({ error: 'cannot_log_future_sessions' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock current row to serialize edits
      const cur = await client.query(
        `select * from tutoring_session_current
         where logical_session_id = $1 and tutor_id = $2
         for update`,
        [logicalSessionId, tutorId]
      );

      if (cur.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'session_not_found' });
      }

      const current = cur.rows[0];
      if (current.status !== 'active') {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'session_not_active' });
      }

      // Enforce assignment window still (student might have been unassigned later)
      const assign = await client.query(
        `select valid_from, valid_to
         from tutor_student_assignments
         where tutor_id = $1 and student_id = $2 and is_active = true`,
        [tutorId, current.student_id]
      );

      if (assign.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(403).send({ error: 'student_not_assigned_to_tutor' });
      }

      const vf = new Date(assign.rows[0].valid_from);
      const vt = assign.rows[0].valid_to ? new Date(assign.rows[0].valid_to) : null;
      if (start < vf || (vt && end > vt)) {
        await client.query('ROLLBACK');
        return reply.code(403).send({ error: 'outside_assignment_window' });
      }

      const nextVersion = Number(current.current_version) + 1;

      // Append to log
      const log = await client.query(
        `insert into tutoring_session_log
         (logical_session_id, version, action, tutor_id, student_id, start_at, end_at, notes, created_by_user_id)
         values ($1, $2, 'amend', $3, $4, $5::timestamptz, $6::timestamptz, $7, $8)
         returning event_id, logical_session_id, version, action, created_at`,
        [
          logicalSessionId,
          nextVersion,
          tutorId,
          current.student_id,
          start.toISOString(),
          end.toISOString(),
          parsed.data.notes ?? '',
          req.user!.userId
        ]
      );

      // Update snapshot
      const updated = await client.query(
        `update tutoring_session_current
         set start_at = $1::timestamptz,
             end_at = $2::timestamptz,
             notes = $3,
             current_version = $4,
             current_event_id = $5,
             updated_at = now()
         where logical_session_id = $6
         returning logical_session_id, tutor_id, student_id, start_at, end_at, notes, status, current_version, updated_at`,
        [
          start.toISOString(),
          end.toISOString(),
          parsed.data.notes ?? '',
          nextVersion,
          log.rows[0].event_id,
          logicalSessionId
        ]
      );

      await client.query('COMMIT');
      return reply.send({ session: updated.rows[0], audit: log.rows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK');

      if (err?.code === '23P01') return reply.code(409).send({ error: 'overlapping_session' });
      if (err?.code === '23514') return reply.code(400).send({ error: 'constraint_violation' });

      req.log?.error?.(err);
      return reply.code(500).send({ error: 'internal_error' });
    } finally {
      client.release();
    }
  });

  // Void (append-only)
  app.post('/tutor/sessions/:logicalSessionId/void', async (req, reply) => {
    const tutorId = req.user!.tutorId!;
    const logicalSessionId = (req.params as any).logicalSessionId as string;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const cur = await client.query(
        `select * from tutoring_session_current
         where logical_session_id = $1 and tutor_id = $2
         for update`,
        [logicalSessionId, tutorId]
      );

      if (cur.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'session_not_found' });
      }

      const current = cur.rows[0];
      if (current.status !== 'active') {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'session_not_active' });
      }

      const nextVersion = Number(current.current_version) + 1;

      const log = await client.query(
        `insert into tutoring_session_log
         (logical_session_id, version, action, tutor_id, student_id, start_at, end_at, notes, created_by_user_id)
         values ($1, $2, 'void', $3, $4, $5::timestamptz, $6::timestamptz, $7, $8)
         returning event_id, logical_session_id, version, action, created_at`,
        [
          logicalSessionId,
          nextVersion,
          tutorId,
          current.student_id,
          current.start_at,
          current.end_at,
          current.notes ?? '',
          req.user!.userId
        ]
      );

      const updated = await client.query(
        `update tutoring_session_current
         set status = 'void',
             current_version = $1,
             current_event_id = $2,
             updated_at = now()
         where logical_session_id = $3
         returning logical_session_id, status, current_version, updated_at`,
        [nextVersion, log.rows[0].event_id, logicalSessionId]
      );

      await client.query('COMMIT');
      return reply.send({ session: updated.rows[0], audit: log.rows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK');
      req.log?.error?.(err);
      return reply.code(500).send({ error: 'internal_error' });
    } finally {
      client.release();
    }
  });
}
