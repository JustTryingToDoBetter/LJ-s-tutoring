import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { normalizeEmail, generateCsrfToken, generateMagicToken, hashToken } from '../lib/security.js';
import { MagicLinkRequestSchema, RegisterAdminSchema, TestLoginSchema } from '../lib/schemas.js';
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

function csrfCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: false,
    sameSite: 'lax' as const,
    secure: isProd,
    path: '/',
    maxAge: 60 * 60 * 24 * 7
  };
}

function setAuthCookies(reply: any, jwt: string) {
  reply.setCookie('session', jwt, sessionCookieOptions());
  const csrfToken = generateCsrfToken();
  reply.setCookie('csrf', csrfToken, csrfCookieOptions());
  return csrfToken;
}

export async function authRoutes(app: FastifyInstance) {
  const requestAttempts = new Map<string, { count: number; resetAt: number }>();
  const requestWindowMs = 60 * 1000;
  const requestMaxPerEmail = 5;
  const verifyAttempts = new Map<string, { count: number; resetAt: number }>();
  const verifyWindowMs = 60 * 1000;
  const verifyMax = 10;

  const checkRequestLimit = (key: string) => {
    const now = Date.now();
    const entry = requestAttempts.get(key);
    if (!entry || entry.resetAt <= now) {
      requestAttempts.set(key, { count: 1, resetAt: now + requestWindowMs });
      return false;
    }
    if (entry.count >= requestMaxPerEmail) return true;
    entry.count += 1;
    return false;
  };

  const checkVerifyLimit = (key: string) => {
    const now = Date.now();
    const entry = verifyAttempts.get(key);
    if (!entry || entry.resetAt <= now) {
      verifyAttempts.set(key, { count: 1, resetAt: now + verifyWindowMs });
      return false;
    }
    if (entry.count >= verifyMax) return true;
    entry.count += 1;
    return false;
  };

  app.post('/auth/request-link', {
    config: {
      rateLimit: {
        max: 15,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    const parsed = MagicLinkRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const email = normalizeEmail(parsed.data.email);
    const emailKey = `email:${email}`;
    if (checkRequestLimit(emailKey)) {
      return reply.code(429).send({ error: 'rate_limited' });
    }
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

  const handleVerify = async (token: string | undefined, req: any, reply: any) => {
    if (!token) return reply.code(400).send({ error: 'missing_token' });

    const ip = req.ip ?? 'unknown';
    if (checkVerifyLimit(ip)) {
      return reply.code(429).send({ error: 'rate_limited' });
    }

    const tokenHash = hashToken(token);
    const consumeRes = await pool.query(
      `update magic_link_tokens
       set used_at = now()
       where token_hash = $1
         and used_at is null
         and expires_at >= now()
       returning id, user_id`,
      [tokenHash]
    );

    if (consumeRes.rowCount === 0) {
      const statusRes = await pool.query(
        `select used_at, expires_at
         from magic_link_tokens
         where token_hash = $1`,
        [tokenHash]
      );

      if (statusRes.rowCount === 0) {
        return reply.code(400).send({ error: 'invalid_token' });
      }

      const statusRow = statusRes.rows[0] as { used_at: Date | null; expires_at: Date };
      if (statusRow.used_at) return reply.code(400).send({ error: 'token_used' });
      return reply.code(400).send({ error: 'token_expired' });
    }

    const rowRes = await pool.query(
      `select u.id as user_id, u.role, u.tutor_profile_id, u.is_active
       from users u
       where u.id = $1`,
      [consumeRes.rows[0].user_id]
    );

    if (rowRes.rowCount === 0) {
      return reply.code(400).send({ error: 'invalid_token' });
    }

    const row = rowRes.rows[0] as {
      user_id: string;
      role: 'ADMIN' | 'TUTOR';
      tutor_profile_id: string | null;
      is_active: boolean;
    };

    if (!row.is_active) return reply.code(403).send({ error: 'account_disabled' });

    if (row.role === 'TUTOR' && !row.tutor_profile_id) {
      return reply.code(500).send({ error: 'tutor_profile_missing' });
    }

    const jwt = await app.jwt.sign({
      userId: row.user_id,
      role: row.role,
      tutorId: row.tutor_profile_id ?? undefined
    });

    setAuthCookies(reply, jwt);
    const redirectTo = row.role === 'ADMIN' ? '/admin' : '/tutor';
    return reply.redirect(redirectTo);
  };

  app.get('/auth/verify', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    const token = (req.query as { token?: string }).token;
    return handleVerify(token, req, reply);
  });

  app.post('/auth/verify', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    const token = (req.body as { token?: string } | undefined)?.token;
    return handleVerify(token, req, reply);
  });

  app.post('/auth/logout', async (_req, reply) => {
    reply.clearCookie('session', { path: '/' });
    reply.clearCookie('csrf', { path: '/' });
    return reply.send({ ok: true });
  });

  if (process.env.NODE_ENV === 'test') {
    app.post('/test/login-as', async (req, reply) => {
      const parsed = TestLoginSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
      }

      const email = normalizeEmail(parsed.data.email);
      const role = parsed.data.role;
      const client = await pool.connect();
      let userId: string | undefined;
      let tutorId: string | null = null;

      try {
        await client.query('BEGIN');

        const existing = await client.query(
          `select id, role, tutor_profile_id from users where email = $1`,
          [email]
        );

        if (existing.rowCount > 0) {
          const row = existing.rows[0] as { id: string; role: 'ADMIN' | 'TUTOR'; tutor_profile_id: string | null };
          if (row.role !== role) {
            await client.query('ROLLBACK');
            return reply.code(409).send({ error: 'role_mismatch' });
          }
          userId = row.id;
          tutorId = row.tutor_profile_id;

          if (role === 'TUTOR' && !tutorId) {
            const tutorRes = await client.query(
              `insert into tutor_profiles (full_name, phone, default_hourly_rate, active)
               values ($1, null, $2, true)
               returning id`,
              ['Test Tutor', 250]
            );
            tutorId = tutorRes.rows[0].id as string;
            await client.query(
              `update users set tutor_profile_id = $1 where id = $2`,
              [tutorId, userId]
            );
          }
        } else if (role === 'ADMIN') {
          const res = await client.query(
            `insert into users (email, role)
             values ($1, 'ADMIN')
             returning id`,
            [email]
          );
          userId = res.rows[0].id as string;
        } else {
          const tutorRes = await client.query(
            `insert into tutor_profiles (full_name, phone, default_hourly_rate, active)
             values ($1, null, $2, true)
             returning id`,
            ['Test Tutor', 250]
          );
          tutorId = tutorRes.rows[0].id as string;
          const userRes = await client.query(
            `insert into users (email, role, tutor_profile_id)
             values ($1, 'TUTOR', $2)
             returning id`,
            [email, tutorId]
          );
          userId = userRes.rows[0].id as string;
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        req.log?.error?.(err);
        return reply.code(500).send({ error: 'internal_error' });
      } finally {
        client.release();
      }

      const jwt = await app.jwt.sign({
        userId,
        role,
        tutorId: tutorId ?? undefined
      });
      const csrfToken = setAuthCookies(reply, jwt);
      return reply.send({ ok: true, csrfToken });
    });
  }

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
