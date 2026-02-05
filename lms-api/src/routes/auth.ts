import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { normalizeEmail, generateMagicToken, hashToken } from '../lib/security.js';
import { MagicLinkRequestSchema, RegisterAdminSchema } from '../lib/schemas.js';
import { sendMagicLink } from '../lib/email.js';

function sessionCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProd,
    path: '/',
    maxAge: 60 * 60 * 24 * 7
  };
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/request-link', async (req, reply) => {
    const parsed = MagicLinkRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const email = normalizeEmail(parsed.data.email);
    const userRes = await pool.query(
      `select id, role, tutor_profile_id, is_active
       from users
       where email = $1`,
      [email]
    );

    if (userRes.rowCount === 0) {
      return reply.send({ ok: true });
    }

    const user = userRes.rows[0] as {
      id: string;
      role: 'ADMIN' | 'TUTOR';
      tutor_profile_id: string | null;
      is_active: boolean;
    };

    if (!user.is_active) {
      return reply.send({ ok: true });
    }

    const rawToken = generateMagicToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      `insert into magic_link_tokens (user_id, token_hash, expires_at)
       values ($1, $2, $3::timestamptz)`,
      [user.id, tokenHash, expiresAt.toISOString()]
    );

    const baseUrl = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3001';
    const link = `${baseUrl}/auth/verify?token=${rawToken}`;
    await sendMagicLink({ to: email, link });

    return reply.send({ ok: true });
  });

  app.get('/auth/verify', async (req, reply) => {
    const token = (req.query as { token?: string }).token;
    if (!token) return reply.code(400).send({ error: 'missing_token' });

    const tokenHash = hashToken(token);
    const tokenRes = await pool.query(
      `select t.id, t.expires_at, t.used_at, u.id as user_id, u.role, u.tutor_profile_id, u.is_active
       from magic_link_tokens t
       join users u on u.id = t.user_id
       where t.token_hash = $1`,
      [tokenHash]
    );

    if (tokenRes.rowCount === 0) {
      return reply.code(400).send({ error: 'invalid_token' });
    }

    const row = tokenRes.rows[0] as {
      id: string;
      expires_at: Date;
      used_at: Date | null;
      user_id: string;
      role: 'ADMIN' | 'TUTOR';
      tutor_profile_id: string | null;
      is_active: boolean;
    };

    if (!row.is_active) return reply.code(403).send({ error: 'account_disabled' });
    if (row.used_at) return reply.code(400).send({ error: 'token_used' });
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return reply.code(400).send({ error: 'token_expired' });
    }

    await pool.query(`update magic_link_tokens set used_at = now() where id = $1`, [row.id]);

    if (row.role === 'TUTOR' && !row.tutor_profile_id) {
      return reply.code(500).send({ error: 'tutor_profile_missing' });
    }

    const jwt = await app.jwt.sign({
      userId: row.user_id,
      role: row.role,
      tutorId: row.tutor_profile_id ?? undefined
    });

    reply.setCookie('session', jwt, sessionCookieOptions());
    const redirectTo = row.role === 'ADMIN' ? '/admin' : '/tutor';
    return reply.redirect(redirectTo);
  });

  app.post('/auth/logout', async (_req, reply) => {
    reply.clearCookie('session', { path: '/' });
    return reply.send({ ok: true });
  });

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

    const res = await pool.query(
      `insert into users (email, role)
       values ($1, 'ADMIN')
       returning id, email, role`,
      [email]
    );

    return reply.code(201).send({ user: res.rows[0] });
  });
}
