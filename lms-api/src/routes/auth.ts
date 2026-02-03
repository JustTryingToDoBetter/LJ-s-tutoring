import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { hashPassword, verifyPassword, normalizeEmail } from '../lib/security.js';
import { LoginSchema, RegisterAdminSchema } from '../lib/schemas.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register-admin', async (req, reply) => {
    const parsed = RegisterAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const expected = process.env.ADMIN_BOOTSTRAP_TOKEN;
    if (!expected || parsed.data.bootstrapToken !== expected) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const email = normalizeEmail(parsed.data.email);
    const passwordHash = await hashPassword(parsed.data.password);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const inserted = await client.query(
        `insert into users (email, password_hash, role)
         values ($1, $2, 'admin')
         returning id, email, role`,
        [email, passwordHash]
      );

      await client.query('COMMIT');

      const user = inserted.rows[0];
      const token = await app.jwt.sign({ userId: user.id, role: user.role });

      return reply.code(201).send({ user, token });
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

  app.post('/auth/login', async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const email = normalizeEmail(parsed.data.email);

    const userRes = await pool.query(
      `select id, email, password_hash, role, is_active
       from users
       where email = $1`,
      [email]
    );

    if (userRes.rowCount === 0) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    const user = userRes.rows[0] as {
      id: string;
      email: string;
      password_hash: string;
      role: 'admin' | 'tutor';
      is_active: boolean;
    };

    if (!user.is_active) return reply.code(403).send({ error: 'account_disabled' });

    const ok = await verifyPassword(user.password_hash, parsed.data.password);
    if (!ok) return reply.code(401).send({ error: 'invalid_credentials' });

    let tutorId: string | undefined;
    if (user.role === 'tutor') {
      const tutorRes = await pool.query(`select id from tutors where user_id = $1`, [user.id]);
      tutorId = tutorRes.rows[0]?.id;
      if (!tutorId) return reply.code(500).send({ error: 'tutor_profile_missing' });
    }

    const token = await app.jwt.sign({ userId: user.id, role: user.role, tutorId });

    return reply.send({
      user: { id: user.id, email: user.email, role: user.role, tutorId },
      token
    });
  });
}
