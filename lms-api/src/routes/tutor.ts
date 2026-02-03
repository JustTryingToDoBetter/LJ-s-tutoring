import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { requireTutor } from '../lib/rbac.js';
import { CreateSessionSchema } from '../lib/schemas.js';

export async function tutorRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireTutor);

  app.get('/tutor/students', async (req, reply) => {
    const tutorId = req.user!.tutorId!;

    const res = await pool.query(
      `select s.id, s.first_name, s.last_name, s.grade
       from tutor_student_assignments a
       join students s on s.id = a.student_id
       where a.tutor_id = $1 and a.is_active = true and s.is_active = true
       order by s.last_name asc, s.first_name asc`,
      [tutorId]
    );

    return reply.send({ students: res.rows });
  });

  app.post('/tutor/sessions', async (req, reply) => {
    const tutorId = req.user!.tutorId!;

    const parsed = CreateSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const { studentId, startAt, endAt, notes } = parsed.data;
    const start = new Date(startAt);
    const end = new Date(endAt);
    const now = new Date();

    if (!(end > start)) return reply.code(400).send({ error: 'end_must_be_after_start' });
    if (start > now || end > now) return reply.code(400).send({ error: 'cannot_log_future_sessions' });

    const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    if (minutes < 15 || minutes > 8 * 60) {
      return reply.code(400).send({ error: 'invalid_duration_minutes', minutes });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const assignment = await client.query(
        `select valid_from, valid_to
         from tutor_student_assignments
         where tutor_id = $1 and student_id = $2 and is_active = true`,
        [tutorId, studentId]
      );

      if (assignment.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(403).send({ error: 'student_not_assigned_to_tutor' });
      }

      const { valid_from, valid_to } = assignment.rows[0];

      const vf = new Date(valid_from);
      const vt = valid_to ? new Date(valid_to) : null;

      // Must be fully inside assignment window
      if (start < vf || (vt && end > vt)) {
        await client.query('ROLLBACK');
        return reply.code(403).send({ error: 'outside_assignment_window' });
      }

      const logicalSessionIdRes = await client.query(`select gen_random_uuid() as id`);
const logicalSessionId = logicalSessionIdRes.rows[0].id as string;

// 1) append-only log
const logRes = await client.query(
  `insert into tutoring_session_log
   (logical_session_id, version, action, tutor_id, student_id, start_at, end_at, notes, created_by_user_id)
   values ($1, 1, 'create', $2, $3, $4::timestamptz, $5::timestamptz, $6, $7)
   returning event_id, logical_session_id, version, action, start_at, end_at, notes, created_at`,
  [
    logicalSessionId,
    tutorId,
    studentId,
    start.toISOString(),
    end.toISOString(),
    notes,
    req.user!.userId
  ]
);

    // 2) current snapshot
    const currentRes = await client.query(
      `insert into tutoring_session_current
      (logical_session_id, tutor_id, student_id, start_at, end_at, notes, status, current_version, current_event_id)
      values ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, 'active', 1, $7)
      returning logical_session_id, tutor_id, student_id, start_at, end_at, notes, status, current_version, updated_at`,
      [
        logicalSessionId,
        tutorId,
        studentId,
        start.toISOString(),
        end.toISOString(),
        notes,
        logRes.rows[0].event_id
      ]
    );

    await client.query('COMMIT');
    return reply.code(201).send({ session: currentRes.rows[0], audit: logRes.rows[0] });
    } finally {
      client.release();
    }
  });

  app.get('/tutor/sessions', async (req, reply) => {
    const tutorId = req.user!.tutorId!;
    const { studentId, from, to } = req.query as { studentId?: string; from?: string; to?: string };

    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    if (from) {
      const d = new Date(from);
      if (isNaN(d.getTime())) return reply.code(400).send({ error: 'invalid_from' });
      fromDate = d;
    }
    if (to) {
      const d = new Date(to);
      if (isNaN(d.getTime())) return reply.code(400).send({ error: 'invalid_to' });
      toDate = d;
    }

    if (studentId) {
      const assignment = await pool.query(
        `select 1
         from tutor_student_assignments
         where tutor_id = $1 and student_id = $2 and is_active = true`,
        [tutorId, studentId]
      );
      if (assignment.rowCount === 0) return reply.code(403).send({ error: 'student_not_assigned_to_tutor' });
    }

    const params: any[] = [tutorId];
    let where = 'where ts.tutor_id = $1';

    if (studentId) {
      params.push(studentId);
      where += ` and ts.student_id = $${params.length}`;
    }
    if (fromDate) {
      params.push(fromDate.toISOString());
      where += ` and ts.start_at >= $${params.length}::timestamptz`;
    }
    if (toDate) {
      params.push(toDate.toISOString());
      where += ` and ts.end_at <= $${params.length}::timestamptz`;
    }

    const res = await pool.query(
      `select c.logical_session_id, c.student_id, c.start_at, c.end_at, c.notes, c.status, c.current_version, c.updated_at,
              s.first_name as student_first_name, s.last_name as student_last_name
      from tutoring_session_current c
      join students s on s.id = c.student_id
      ${where.replaceAll('ts.', 'c.')}  -- if you used ts alias earlier, simplify instead
      and c.status = 'active'
      order by c.start_at desc
      limit 100`,
      params
    );


    return reply.send({ sessions: res.rows });
  });
}
