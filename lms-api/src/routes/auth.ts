import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { normalizeEmail, generateCsrfToken, verifyPassword } from '../lib/security.js';
import { LoginSchema, MagicLinkRequestSchema, RegisterAdminSchema, TestLoginSchema } from '../lib/schemas.js';
import { safeAuditMeta, writeAuditLog } from '../lib/audit.js';
import { findUserByEmail, requestMagicLink, verifyMagicLink } from '../domains/auth/service.js';

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
  function createWindowLimiter(windowMs: number, maxAttempts: number) {
    const attempts = new Map<string, { count: number; resetAt: number }>();
    return (key: string) => {
      const now = Date.now();
      const entry = attempts.get(key);
      if (!entry || entry.resetAt <= now) {
        attempts.set(key, { count: 1, resetAt: now + windowMs });
        return false;
      }
      if (entry.count >= maxAttempts) return true;
      entry.count += 1;
      return false;
    };
  }

  const checkRequestLimit = createWindowLimiter(60 * 1000, 5);
  const checkVerifyLimit = createWindowLimiter(60 * 1000, 5);
  const checkLoginLimit = createWindowLimiter(10 * 60 * 1000, 10);

  const getHeaderValue = (req: any, name: string): string => {
    const raw = req.headers?.[name];
    if (Array.isArray(raw)) return String(raw[0] ?? '');
    if (typeof raw === 'string') return raw;
    return '';
  };

  const getCountryCode = (req: any) => {
    const raw = getHeaderValue(req, 'cf-ipcountry')
      || getHeaderValue(req, 'x-vercel-ip-country')
      || getHeaderValue(req, 'x-country-code');
    if (!raw) return null;
    const normalized = raw.trim().toUpperCase();
    if (!normalized || normalized === 'XX' || normalized === 'UNKNOWN') return null;
    return normalized;
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

    const result = await requestMagicLink(pool, { email: parsed.data.email }, {
      checkRequestLimit,
      baseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:3001'
    });

    if (!result.ok) {
      return reply.code(result.status).send({ error: result.error });
    }

    return reply.send({ ok: true });
  });
  const handleVerify = async (token: string | undefined, req: any, reply: any) => {
    const result = await verifyMagicLink(pool, { token }, {
      ip: req.ip,
      userAgent: getHeaderValue(req, 'user-agent') || undefined,
      acceptLanguage: getHeaderValue(req, 'accept-language') || undefined,
      countryCode: getCountryCode(req),
      correlationId: req.id
    }, {
      checkVerifyLimit,
      signJwt: (payload) => app.jwt.sign(payload),
      writeRiskAudit: async (entry) => {
        await writeAuditLog(pool, {
          actorUserId: entry.actorUserId,
          actorRole: entry.actorRole,
          action: 'auth.risk.flag',
          entityType: 'auth',
          entityId: entry.actorUserId,
          meta: safeAuditMeta({
            riskScore: entry.riskScore,
            flags: entry.flags,
            country: entry.country,
            ip: entry.ip
          }),
          ip: entry.ip,
          userAgent: entry.userAgent ?? undefined,
          correlationId: entry.correlationId
        });
      },
      onInternalError: (err, context) => {
        req.log?.error?.(err, context);
      }
    });

    if (!result.ok) {
      return reply.code(result.status).send({ error: result.error });
    }

    setAuthCookies(reply, result.jwt);
    return reply.redirect(result.redirectTo);
  };

  app.get('/auth/verify', {
    config: {
      rateLimit: {
        max: 10,
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
        max: 10,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    const token = (req.body as { token?: string } | undefined)?.token;
    return handleVerify(token, req, reply);
  });

  app.post('/auth/login', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const ip = req.ip ?? 'unknown';
    const email = normalizeEmail(parsed.data.email);
    const ipLimited = checkLoginLimit(`ip:${ip}`);
    const emailLimited = checkLoginLimit(`email:${email}`);
    const comboLimited = checkLoginLimit(`login:${ip}:${email}`);
    if (ipLimited || emailLimited || comboLimited) {
      return reply.code(429).send({ error: 'rate_limited' });
    }

    const user = await findUserByEmail(pool, email);
    if (!user || !user.password_hash) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    if (!user.is_active) {
      return reply.code(403).send({ error: 'account_disabled' });
    }

    const passwordOk = await verifyPassword(user.password_hash, parsed.data.password);
    if (!passwordOk) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    if (user.role === 'TUTOR' && !user.tutor_profile_id) {
      return reply.code(500).send({ error: 'tutor_profile_missing' });
    }

    const jwt = await app.jwt.sign({
      userId: user.id,
      role: user.role,
      tutorId: user.tutor_profile_id ?? undefined
    });

    const csrfToken = setAuthCookies(reply, jwt);
    return reply.send({
      ok: true,
      token: jwt,
      csrfToken,
      role: user.role,
      redirectTo: user.role === 'ADMIN' ? '/admin' : '/tutor'
    });
  });

  app.post('/auth/logout', async (_req, reply) => {
    reply.clearCookie('session', { path: '/' });
    reply.clearCookie('csrf', { path: '/' });
    reply.clearCookie('impersonation', { path: '/' });
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

        if (Number(existing.rowCount || 0) > 0) {
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
