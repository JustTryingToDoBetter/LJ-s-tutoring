import type { FastifyInstance } from 'fastify';
import type { OAuth2Namespace } from '@fastify/oauth2';
import crypto from 'node:crypto';

// Augment FastifyInstance so TypeScript knows about googleOAuth2 when the plugin is registered
declare module 'fastify' {
  interface FastifyInstance {
    googleOAuth2?: OAuth2Namespace;
    googleStudentOAuth2?: OAuth2Namespace;
  }
}
import { pool } from '../db/pool.js';
import { normalizeEmail, generateCsrfToken, verifyPassword, hashPassword, hashToken } from '../lib/security.js';
import { LoginSchema, MagicLinkRequestSchema, RegisterAdminSchema, AdminLoginSchema, AdminOtpSchema, TestLoginSchema } from '../lib/schemas.js';
import { sendOtpEmail } from '../lib/email.js';
import { safeAuditMeta, writeAuditLog } from '../lib/audit.js';
import { findUserByEmail, requestMagicLink, verifyMagicLink } from '../domains/auth/service.js';

function setPrivateNoStore(reply: any) {
  reply.header('Cache-Control', 'private, no-store, max-age=0');
  reply.header('Pragma', 'no-cache');
}

function cookieDomain() {
  return process.env.COOKIE_DOMAIN || undefined;
}

function sessionCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProd,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
    ...(cookieDomain() ? { domain: cookieDomain() } : {})
  };
}

function csrfCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: false,
    sameSite: 'lax' as const,
    secure: isProd,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
    ...(cookieDomain() ? { domain: cookieDomain() } : {})
  };
}

function clearAuthCookieOptions() {
  return {
    path: '/',
    ...(cookieDomain() ? { domain: cookieDomain() } : {})
  };
}

function setAuthCookies(reply: any, jwt: string) {
  reply.setCookie('session', jwt, sessionCookieOptions());
  const csrfToken = generateCsrfToken();
  reply.setCookie('csrf', csrfToken, csrfCookieOptions());
  return csrfToken;
}

function sessionExpiryFromJwt(app: FastifyInstance, jwtToken: string): string | null {
  const decoded = app.jwt.decode(jwtToken) as { exp?: number } | null;
  if (!decoded || typeof decoded.exp !== 'number') return null;
  return new Date(decoded.exp * 1000).toISOString();
}

async function trackSession(
  app: FastifyInstance,
  jwtToken: string,
  userId: string,
  req?: { ip?: string; headers?: Record<string, unknown> }
) {
  const sessionHash = hashToken(jwtToken);
  const expiresAt = sessionExpiryFromJwt(app, jwtToken);
  const userAgent = typeof req?.headers?.['user-agent'] === 'string'
    ? req.headers['user-agent']
    : null;

  await pool.query(
    `insert into auth_sessions (user_id, session_hash, issued_at, expires_at, last_seen_at, ip, user_agent)
     values ($1, $2, now(), $3::timestamptz, now(), $4, $5)
     on conflict (session_hash) do update set
       user_id = excluded.user_id,
       expires_at = coalesce(excluded.expires_at, auth_sessions.expires_at),
       revoked_at = null,
       revoked_reason = null,
       last_seen_at = now(),
       ip = coalesce(excluded.ip, auth_sessions.ip),
       user_agent = coalesce(excluded.user_agent, auth_sessions.user_agent)`,
    [userId, sessionHash, expiresAt, req?.ip ?? null, userAgent]
  );
}

async function issueTrackedSessionJwt(
  app: FastifyInstance,
  payload: { userId: string; role: 'ADMIN' | 'TUTOR' | 'STUDENT'; tutorId?: string; studentId?: string },
  req?: { ip?: string; headers?: Record<string, unknown> }
) {
  const jwtToken = await app.jwt.sign(payload);
  await trackSession(app, jwtToken, payload.userId, req);
  return jwtToken;
}

function portalRedirectTarget(role: 'ADMIN' | 'TUTOR' | 'STUDENT') {
  if (role === 'ADMIN') {
    const base = process.env.ADMIN_PORTAL_URL?.replace(/\/$/, '');
    return base ? `${base}/` : '/admin/';
  }
  if (role === 'TUTOR') {
    const base = process.env.TUTOR_PORTAL_URL?.replace(/\/$/, '');
    return base ? `${base}/dashboard/` : '/tutor/dashboard/';
  }
  const base = process.env.STUDENT_PORTAL_URL?.replace(/\/$/, '');
  return base ? `${base}/dashboard/` : '/dashboard/';
}

function portalLoginTarget(role: 'ADMIN' | 'TUTOR' | 'STUDENT') {
  if (role === 'ADMIN') {
    const base = process.env.ADMIN_PORTAL_URL?.replace(/\/$/, '');
    return base ? `${base}/login.html` : '/admin/login.html';
  }
  if (role === 'TUTOR') {
    const base = process.env.TUTOR_PORTAL_URL?.replace(/\/$/, '');
    return base ? `${base}/login.html` : '/tutor/login.html';
  }
  const base = process.env.STUDENT_PORTAL_URL?.replace(/\/$/, '');
  return base ? `${base}/login.html` : '/dashboard/login.html';
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

    const verified = await app.jwt.verify<{ userId: string }>(result.jwt);
    await trackSession(app, result.jwt, verified.userId, req);

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
    if (user.role === 'STUDENT' && !user.student_id) {
      return reply.code(500).send({ error: 'student_profile_missing' });
    }

    const jwt = await issueTrackedSessionJwt(app, {
      userId: user.id,
      role: user.role,
      tutorId: user.tutor_profile_id ?? undefined,
      studentId: user.student_id ?? undefined
    }, req);

    const csrfToken = setAuthCookies(reply, jwt);
    return reply.send({
      ok: true,
      token: jwt,
      csrfToken,
      role: user.role,
      redirectTo: portalRedirectTarget(user.role)
    });
  });

  app.post('/auth/logout', async (req, reply) => {
    const token = req.cookies?.session;
    if (token) {
      try {
        const decoded = await app.jwt.verify<{ userId: string }>(token);
        const sessionHash = hashToken(token);
        const res = await pool.query(
          `update auth_sessions
           set revoked_at = now(), revoked_reason = 'logout', last_seen_at = now()
           where session_hash = $1 and user_id = $2 and revoked_at is null`,
          [sessionHash, decoded.userId]
        );

        if ((res.rowCount ?? 0) === 0) {
          await pool.query(
            `insert into auth_sessions (user_id, session_hash, issued_at, expires_at, revoked_at, revoked_reason, last_seen_at)
             values ($1, $2, now(), $3::timestamptz, now(), 'logout', now())
             on conflict (session_hash) do update set revoked_at = now(), revoked_reason = 'logout', last_seen_at = now()`,
            [decoded.userId, sessionHash, sessionExpiryFromJwt(app, token)]
          );
        }
      } catch {
        // Best effort revocation; cookie clearing still proceeds.
      }
    }

    reply.clearCookie('session', clearAuthCookieOptions());
    reply.clearCookie('csrf', clearAuthCookieOptions());
    reply.clearCookie('impersonation', clearAuthCookieOptions());
    return reply.send({ ok: true });
  });

  app.post('/auth/logout-all', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    await pool.query(
      `update auth_sessions
       set revoked_at = now(), revoked_reason = 'global_sign_out', last_seen_at = now()
       where user_id = $1 and revoked_at is null`,
      [req.user.userId]
    );

    reply.clearCookie('session', clearAuthCookieOptions());
    reply.clearCookie('csrf', clearAuthCookieOptions());
    reply.clearCookie('impersonation', clearAuthCookieOptions());
    return reply.send({ ok: true });
  });

  // ── Admin 2-step login ────────────────────────────────────────────────────

  const checkAdminLoginLimit = createWindowLimiter(15 * 60 * 1000, 10);
  const checkAdminOtpLimit   = createWindowLimiter(5  * 60 * 1000, 5);

  app.post('/auth/admin/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const parsed = AdminLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const ip    = req.ip ?? 'unknown';
    const email = normalizeEmail(parsed.data.email);

    if (checkAdminLoginLimit(`ip:${ip}`) || checkAdminLoginLimit(`email:${email}`)) {
      return reply.code(429).send({ error: 'rate_limited' });
    }

    const user = await findUserByEmail(pool, email);
    // Constant-time response regardless of whether user exists
    if (!user || user.role !== 'ADMIN' || !user.is_active || !user.password_hash) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    const passwordOk = await verifyPassword(user.password_hash, parsed.data.password);
    if (!passwordOk) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    // Generate a 6-digit OTP
    const otp       = String(crypto.randomInt(100000, 1000000));
    const tokenHash = hashToken(otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await pool.query(
      `insert into email_otp_tokens (user_id, token_hash, expires_at)
       values ($1, $2, $3::timestamptz)`,
      [user.id, tokenHash, expiresAt.toISOString()]
    );

    await sendOtpEmail({ to: email, code: otp });

    // Issue a short-lived interim JWT — only valid for OTP verification
    const interimJwt = await app.jwt.sign(
      { userId: user.id, role: 'ADMIN', awaitingMfa: true },
      { expiresIn: '5m' }
    );

    const isProd = process.env.NODE_ENV === 'production';
    reply.setCookie('mfa_pending', interimJwt, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      path: '/',
      maxAge: 5 * 60,
      ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {})
    });

    const payload: Record<string, unknown> = { ok: true, step: 'otp' };
    if (process.env.NODE_ENV !== 'production') {
      payload.debugMfaToken = interimJwt;
    }
    return reply.send(payload);
  });

  app.post('/auth/admin/verify-otp', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const parsed = AdminOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const ip = req.ip ?? 'unknown';
    if (checkAdminOtpLimit(`ip:${ip}`)) {
      return reply.code(429).send({ error: 'rate_limited' });
    }

    // Validate the interim JWT from the mfa_pending cookie.
    // In non-production environments, allow a temporary header fallback
    // to reduce local browser cookie policy friction during OTP testing.
    const headerValue = req.headers['x-mfa-pending'];
    const debugHeaderToken = process.env.NODE_ENV === 'production'
      ? ''
      : (Array.isArray(headerValue) ? String(headerValue[0] || '') : String(headerValue || ''));
    const pendingToken = req.cookies?.mfa_pending || debugHeaderToken;
    if (!pendingToken) {
      return reply.code(401).send({ error: 'mfa_session_missing' });
    }

    let pendingPayload: { userId: string; role: string; awaitingMfa?: boolean };
    try {
      pendingPayload = await app.jwt.verify<{ userId: string; role: string; awaitingMfa?: boolean }>(pendingToken);
    } catch {
      return reply.code(401).send({ error: 'mfa_session_invalid' });
    }

    if (!pendingPayload.awaitingMfa || pendingPayload.role !== 'ADMIN') {
      return reply.code(401).send({ error: 'mfa_session_invalid' });
    }

    // Verify the OTP
    const tokenHash = hashToken(parsed.data.code);
    const result = await pool.query(
      `update email_otp_tokens
       set used_at = now()
       where token_hash = $1
         and user_id    = $2
         and used_at    is null
         and expires_at >= now()
       returning id`,
      [tokenHash, pendingPayload.userId]
    );

    if (Number(result.rowCount ?? 0) === 0) {
      return reply.code(401).send({ error: 'invalid_or_expired_code' });
    }

    // Issue the full session JWT
    const jwt = await issueTrackedSessionJwt(app, {
      userId: pendingPayload.userId,
      role:   'ADMIN',
    }, req);
    const csrfToken = setAuthCookies(reply, jwt);

    // Clear the interim cookie
    reply.clearCookie('mfa_pending', clearAuthCookieOptions());

    const adminBase = process.env.ADMIN_PORTAL_URL?.replace(/\/$/, '') ?? '';
    return reply.send({
      ok: true,
      csrfToken,
      redirectTo: adminBase ? `${adminBase}/` : '/admin/'
    });
  });

  // ── Google OAuth callback (tutor sign-in) ────────────────────────────────

  async function handleGoogleOAuthCallback(
    requestedRole: 'TUTOR' | 'STUDENT',
    oauthNamespace: OAuth2Namespace | undefined,
    req: any,
    reply: any
  ) {
    if (!oauthNamespace) {
      return reply.code(501).send({ error: 'google_oauth_not_configured' });
    }

    let token: { access_token: string };
    try {
      const result = await oauthNamespace.getAccessTokenFromAuthorizationCodeFlow(req);
      token = result.token as { access_token: string };
    } catch {
      return reply.code(400).send({ error: 'oauth_callback_failed' });
    }

    // Fetch the Google user profile
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });
    if (!profileRes.ok) {
      return reply.code(502).send({ error: 'google_profile_fetch_failed' });
    }
    const profile = await profileRes.json() as {
      id?: string;
      email?: string;
      verified_email?: boolean;
      hd?: string;
    };

    if (!profile.id || !profile.email) {
      return reply.code(400).send({ error: 'google_profile_incomplete' });
    }
    if (profile.verified_email !== true) {
      return reply.code(403).send({ error: 'google_email_not_verified' });
    }

    // Find user by google_id first, then fall back to email
    const googleEmail = normalizeEmail(profile.email);
    const allowedDomain = process.env.GOOGLE_ALLOWED_DOMAIN?.trim().toLowerCase();
    if (allowedDomain) {
      const emailDomain = googleEmail.split('@')[1] ?? '';
      const hostedDomain = String(profile.hd ?? '').trim().toLowerCase();
      if (emailDomain !== allowedDomain || (hostedDomain && hostedDomain !== allowedDomain)) {
        return reply.code(403).send({ error: 'google_domain_not_allowed' });
      }
    }
    const userRes = await pool.query(
      `select id, email, role, tutor_profile_id, student_id, is_active, google_id
       from users
       where google_id = $1 or email = $2
       order by (google_id = $1) desc
       limit 1`,
      [profile.id, googleEmail]
    );

    if (Number(userRes.rowCount ?? 0) === 0) {
      // Users must be pre-registered: Google OAuth is sign-in only, not sign-up.
      const loginUrl = portalLoginTarget(requestedRole);
      return reply.redirect(`${loginUrl}?error=account_not_found`);
    }

    const user = userRes.rows[0] as {
      id: string;
      email: string;
      role: 'ADMIN' | 'TUTOR' | 'STUDENT';
      tutor_profile_id: string | null;
      student_id: string | null;
      is_active: boolean;
      google_id: string | null;
    };

    if (!user.is_active) {
      return reply.code(403).send({ error: 'account_disabled' });
    }
    if (user.role !== requestedRole) {
      return reply.redirect(`${portalLoginTarget(requestedRole)}?error=wrong_role`);
    }
    if (requestedRole === 'TUTOR' && !user.tutor_profile_id) {
      return reply.code(500).send({ error: 'tutor_profile_missing' });
    }
    if (requestedRole === 'STUDENT' && !user.student_id) {
      return reply.code(500).send({ error: 'student_profile_missing' });
    }

    // Link google_id on first Google sign-in via email match
    if (!user.google_id) {
      await pool.query(
        `update users set google_id = $1 where id = $2`,
        [profile.id, user.id]
      );
    }

    const jwt = await issueTrackedSessionJwt(app, {
      userId: user.id,
      role: requestedRole,
      tutorId: user.tutor_profile_id ?? undefined,
      studentId: user.student_id ?? undefined
    }, req);
    setAuthCookies(reply, jwt);

    return reply.redirect(portalRedirectTarget(requestedRole));
  }

  app.get('/auth/google/callback', async (req, reply) => {
    return handleGoogleOAuthCallback('TUTOR', app.googleOAuth2, req, reply);
  });

  app.get('/auth/google/student/callback', async (req, reply) => {
    return handleGoogleOAuthCallback('STUDENT', app.googleStudentOAuth2, req, reply);
  });

  app.get('/auth/session', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    return reply.send({
      user: {
        userId: req.user.userId,
        role: req.user.role,
        tutorId: req.user.tutorId ?? null,
        studentId: req.user.studentId ?? null,
      },
      impersonation: req.impersonation
        ? {
            adminUserId: req.impersonation.adminUserId,
            tutorId: req.impersonation.tutorId,
            tutorUserId: req.impersonation.tutorUserId,
            impersonationId: req.impersonation.impersonationId,
            mode: req.impersonation.mode,
          }
        : null,
    });
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
      let studentId: string | null = null;

      try {
        await client.query('BEGIN');

        const existing = await client.query(
          `select id, role, tutor_profile_id, student_id from users where email = $1`,
          [email]
        );

        if (Number(existing.rowCount || 0) > 0) {
          const row = existing.rows[0] as { id: string; role: 'ADMIN' | 'TUTOR' | 'STUDENT'; tutor_profile_id: string | null; student_id: string | null };
          if (row.role !== role) {
            await client.query('ROLLBACK');
            return reply.code(409).send({ error: 'role_mismatch' });
          }
          userId = row.id;
          tutorId = row.tutor_profile_id;
          studentId = row.student_id;

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
          if (role === 'STUDENT' && !studentId) {
            const studentRes = await client.query(
              `insert into students (full_name, grade, is_active)
               values ($1, $2, true)
               returning id`,
              ['Test Student', '10']
            );
            studentId = studentRes.rows[0].id as string;
            await client.query(
              `update users set student_id = $1 where id = $2`,
              [studentId, userId]
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
        } else if (role === 'TUTOR') {
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
        } else {
          const studentRes = await client.query(
            `insert into students (full_name, grade, is_active)
             values ($1, $2, true)
             returning id`,
            ['Test Student', '10']
          );
          studentId = studentRes.rows[0].id as string;
          const userRes = await client.query(
            `insert into users (email, role, student_id)
             values ($1, 'STUDENT', $2)
             returning id`,
            [email, studentId]
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

      const jwt = await issueTrackedSessionJwt(app, {
        userId,
        role,
        tutorId: tutorId ?? undefined,
        studentId: studentId ?? undefined
      }, req);
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
    const passwordHash = await hashPassword(parsed.data.password);

    const res = await pool.query(
      `insert into users (email, role, password_hash, first_name, last_name)
       values ($1, 'ADMIN', $2, $3, $4)
       returning id, email, role`,
      [email, passwordHash, parsed.data.firstName, parsed.data.lastName]
    );

    return reply.code(201).send({ user: res.rows[0] });
  });
}
