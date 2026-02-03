import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { hashPassword, normalizeEmail } from '../lib/security.js';
import { AssignmentSchema, CreateStudentSchema, CreateTutorSchema } from '../lib/schemas.js';
import { requireAdmin } from '../lib/rbac.js';

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireAdmin);

  app.post('/admin/tutors', async (req, reply) => {
    const parsed = CreateTutorSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const email = normalizeEmail(parsed.data.email);
    const passwordHash = await hashPassword(parsed.data.password);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userRes = await client.query(
        `insert into users (email, password_hash, role)
         values ($1, $2, 'tutor')
         returning id, email, role`,
        [email, passwordHash]
      );

      const userId = userRes.rows[0].id as string;

      const tutorRes = await client.query(
        `insert into tutors (user_id, first_name, last_name, phone)
         values ($1, $2, $3, $4)
         returning id, user_id, first_name, last_name, phone`,
        [userId, parsed.data.firstName, parsed.data.lastName, parsed.data.phone ?? null]
      );

      await client.query('COMMIT');
      return reply.code(201).send({ tutor: tutorRes.rows[0], user: userRes.rows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK');

      if (err?.code === '23505') {
        return reply.code(409).send({ error: 'email_already_exists' });
      }
      req.log?.error?.(err);
      return reply.code(500).send({ error: 'internal_error' });
    } finally {
      client.release();
    }
  });

  app.post('/admin/students', async (req, reply) => {
    const parsed = CreateStudentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const res = await pool.query(
      `insert into students (first_name, last_name, grade)
       values ($1, $2, $3)
       returning id, first_name, last_name, grade, is_active, created_at`,
      [parsed.data.firstName, parsed.data.lastName, parsed.data.grade ?? null]
    );

    return reply.code(201).send({ student: res.rows[0] });
  });

  app.post('/admin/assignments', async (req, reply) => {
    const parsed = AssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const { tutorId, studentId, isActive } = parsed.data;

    const [tutorRes, studentRes] = await Promise.all([
      pool.query(`select 1 from tutors where id = $1`, [tutorId]),
      pool.query(`select 1 from students where id = $1`, [studentId])
    ]);

    if (tutorRes.rowCount === 0) return reply.code(404).send({ error: 'tutor_not_found' });
    if (studentRes.rowCount === 0) return reply.code(404).send({ error: 'student_not_found' });

    const validFrom = parsed.data.validFrom ? new Date(parsed.data.validFrom) : new Date();
    const validTo = parsed.data.validTo ? new Date(parsed.data.validTo) : null;
    if (validTo && !(validTo > validFrom)) {
      return reply.code(400).send({ error: 'invalid_assignment_window' });
    }

    const res = await pool.query(
      `insert into tutor_student_assignments (tutor_id, student_id, is_active, assigned_at, unassigned_at, valid_from, valid_to)
      values ($1, $2, true, now(), null, $3::timestamptz, $4::timestamptz)
      on conflict (tutor_id, student_id)
      do update set is_active = true, unassigned_at = null, valid_from = $3::timestamptz, valid_to = $4::timestamptz
      returning tutor_id, student_id, is_active, assigned_at, unassigned_at, valid_from, valid_to`,
      [tutorId, studentId, validFrom.toISOString(), validTo ? validTo.toISOString() : null]
    );

  });
}
