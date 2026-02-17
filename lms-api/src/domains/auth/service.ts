import type { Pool, PoolClient } from 'pg';
import { sendMagicLink } from '../../lib/email.js';
import { hashToken, generateMagicToken, normalizeEmail } from '../../lib/security.js';

export type AuthDbClient = Pool | PoolClient;

type UserRole = 'ADMIN' | 'TUTOR' | 'STUDENT';

type AuthUserRow = {
  id: string;
  role: UserRole;
  tutor_profile_id: string | null;
  student_id: string | null;
  is_active: boolean;
  password_hash: string | null;
};

type VerifyRateLimiter = (key: string) => boolean;

type MagicLinkRequestRateLimiter = (key: string) => boolean;

type VerifyRequestContext = {
  ip?: string;
  userAgent?: string;
  acceptLanguage?: string;
  countryCode?: string | null;
  correlationId?: string;
};

type VerifySuccess = {
  ok: true;
  jwt: string;
  userId: string;
  role: UserRole;
  tutorId?: string;
  studentId?: string;
  redirectTo: string;
};

type VerifyErrorCode =
  | 'missing_token'
  | 'rate_limited'
  | 'invalid_token'
  | 'token_used'
  | 'token_expired'
  | 'account_disabled'
  | 'tutor_profile_missing'
  | 'student_profile_missing';

type VerifyFailure = {
  ok: false;
  status: number;
  error: VerifyErrorCode;
};

type VerifyMagicLinkResult = VerifySuccess | VerifyFailure;

type RiskFlags = {
  newDevice: boolean;
  geoAnomaly: boolean;
  rapidRetries: boolean;
};

type VerifyMagicLinkDeps = {
  checkVerifyLimit: VerifyRateLimiter;
  signJwt: (payload: { userId: string; role: UserRole; tutorId?: string; studentId?: string }) => Promise<string> | string;
  writeRiskAudit?: (entry: {
    actorUserId: string;
    actorRole: UserRole;
    riskScore: number;
    flags: RiskFlags;
    country: string | null;
    ip: string;
    userAgent: string | null;
    correlationId?: string;
  }) => Promise<void>;
  onInternalError?: (err: unknown, context: string) => void;
};

type RequestMagicLinkResult =
  | { ok: true }
  | { ok: false; status: 429; error: 'rate_limited' };

type RequestMagicLinkDeps = {
  checkRequestLimit: MagicLinkRequestRateLimiter;
  baseUrl?: string;
  sendMagicLinkFn?: (params: { to: string; link: string }) => Promise<void>;
};

function normalizeBaseUrl(url: string | undefined, fallbackPath: string) {
  if (!url) {
    return fallbackPath;
  }
  return String(url).replace(/\/$/, '');
}

function roleRedirectTarget(role: UserRole) {
  if (role === 'ADMIN') {
    const adminBase = normalizeBaseUrl(process.env.ADMIN_PORTAL_URL, '');
    return adminBase ? `${adminBase}/` : '/admin';
  }
  if (role === 'TUTOR') {
    const tutorBase = normalizeBaseUrl(process.env.TUTOR_PORTAL_URL, '');
    return tutorBase ? `${tutorBase}/dashboard/` : '/tutor';
  }
  const studentBase = normalizeBaseUrl(process.env.STUDENT_PORTAL_URL, '');
  return studentBase ? `${studentBase}/dashboard/` : '/dashboard';
}

function computeDeviceHash(userAgent: string, acceptLanguage: string) {
  return hashToken(`${userAgent}|${acceptLanguage}`);
}

async function countRecentFailures(client: AuthDbClient, ip: string, from: Date) {
  const res = await client.query(
    `select count(*) as count
     from auth_event_log
     where ip = $1
       and success = false
       and created_at >= $2::timestamptz`,
    [ip, from.toISOString()]
  );
  return Number(res.rows[0]?.count || 0);
}

async function computeRiskScore(
  client: AuthDbClient,
  userId: string | null,
  ip: string,
  context: VerifyRequestContext
) {
  const now = new Date();
  const userAgent = context.userAgent ?? '';
  const acceptLanguage = context.acceptLanguage ?? '';
  const deviceHash = computeDeviceHash(userAgent, acceptLanguage);
  const country = context.countryCode ?? null;
  const flags: RiskFlags = {
    newDevice: false,
    geoAnomaly: false,
    rapidRetries: false
  };

  if (userId) {
    const lastRes = await client.query(
      `select device_hash, country
       from auth_event_log
       where user_id = $1 and success = true
       order by created_at desc
       limit 1`,
      [userId]
    );

    if (Number(lastRes.rowCount || 0) > 0) {
      const last = lastRes.rows[0] as { device_hash: string | null; country: string | null };
      if (last.device_hash && last.device_hash !== deviceHash) {
        flags.newDevice = true;
      }
      if (country && last.country && last.country !== country) {
        flags.geoAnomaly = true;
      }
    }
  }

  const recentFailures = await countRecentFailures(client, ip, now);
  if (recentFailures >= 4) {
    flags.rapidRetries = true;
  }

  let score = 0;
  if (flags.newDevice) score += 20;
  if (flags.geoAnomaly) score += 30;
  if (flags.rapidRetries) score += 40;

  return { score, flags, deviceHash, country };
}

async function writeAuthEvent(
  client: AuthDbClient,
  entry: {
    userId: string | null;
    ip: string;
    userAgent: string | null;
    deviceHash: string;
    country: string | null;
    success: boolean;
    riskScore: number;
    flags: Record<string, unknown>;
  },
  onInternalError?: (err: unknown, context: string) => void
) {
  try {
    await client.query(
      `insert into auth_event_log
       (user_id, ip, user_agent, device_hash, country, success, risk_score, flags_json)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        entry.userId,
        entry.ip,
        entry.userAgent,
        entry.deviceHash,
        entry.country,
        entry.success,
        entry.riskScore,
        JSON.stringify(entry.flags)
      ]
    );
  } catch (err) {
    onInternalError?.(err, 'auth_event_log_write_failed');
  }
}

export async function requestMagicLink(
  client: AuthDbClient,
  input: { email: string },
  deps: RequestMagicLinkDeps
): Promise<RequestMagicLinkResult> {
  const email = normalizeEmail(input.email);
  const emailKey = `email:${email}`;
  if (deps.checkRequestLimit(emailKey)) {
    return { ok: false, status: 429, error: 'rate_limited' };
  }

  const userRes = await client.query(
    `select id, role, tutor_profile_id, student_id, is_active
     from users
     where email = $1`,
    [email]
  );

  if (Number(userRes.rowCount || 0) === 0) {
    return { ok: true };
  }

  const user = userRes.rows[0] as AuthUserRow;
  if (!user.is_active) {
    return { ok: true };
  }

  const rawToken = generateMagicToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await client.query(
    `insert into magic_link_tokens (user_id, token_hash, expires_at)
     values ($1, $2, $3::timestamptz)`,
    [user.id, tokenHash, expiresAt.toISOString()]
  );

  const baseUrl = deps.baseUrl ?? process.env.PUBLIC_BASE_URL ?? 'http://localhost:3001';
  const link = `${baseUrl}/auth/verify?token=${rawToken}`;
  const sendLink = deps.sendMagicLinkFn ?? sendMagicLink;
  await sendLink({ to: email, link });

  return { ok: true };
}

export async function verifyMagicLink(
  client: AuthDbClient,
  input: { token?: string },
  context: VerifyRequestContext,
  deps: VerifyMagicLinkDeps
): Promise<VerifyMagicLinkResult> {
  const token = input.token;
  if (!token) {
    return { ok: false, status: 400, error: 'missing_token' };
  }

  const ip = context.ip ?? 'unknown';
  if (deps.checkVerifyLimit(ip)) {
    return { ok: false, status: 429, error: 'rate_limited' };
  }

  const tokenHash = hashToken(token);
  const consumeRes = await client.query(
    `update magic_link_tokens
     set used_at = now()
     where token_hash = $1
       and used_at is null
       and expires_at >= now()
     returning id, user_id`,
    [tokenHash]
  );

  if (Number(consumeRes.rowCount || 0) === 0) {
    const statusRes = await client.query(
      `select used_at, expires_at
       from magic_link_tokens
       where token_hash = $1`,
      [tokenHash]
    );

    const risk = await computeRiskScore(client, null, ip, context);
    const failureReason = Number(statusRes.rowCount || 0) === 0
      ? 'invalid_token'
      : (statusRes.rows[0].used_at ? 'token_used' : 'token_expired');

    await writeAuthEvent(client, {
      userId: null,
      ip,
      userAgent: context.userAgent ?? null,
      deviceHash: risk.deviceHash,
      country: risk.country,
      success: false,
      riskScore: risk.score,
      flags: { ...risk.flags, failureReason }
    }, deps.onInternalError);

    if (Number(statusRes.rowCount || 0) === 0) {
      return { ok: false, status: 400, error: 'invalid_token' };
    }

    const statusRow = statusRes.rows[0] as { used_at: Date | null; expires_at: Date };
    if (statusRow.used_at) {
      return { ok: false, status: 400, error: 'token_used' };
    }
    return { ok: false, status: 400, error: 'token_expired' };
  }

  const rowRes = await client.query(
    `select u.id as user_id, u.role, u.tutor_profile_id, u.student_id, u.is_active
     from users u
     where u.id = $1`,
    [consumeRes.rows[0].user_id]
  );

  if (Number(rowRes.rowCount || 0) === 0) {
    return { ok: false, status: 400, error: 'invalid_token' };
  }

  const row = rowRes.rows[0] as {
    user_id: string;
    role: UserRole;
    tutor_profile_id: string | null;
    student_id: string | null;
    is_active: boolean;
  };

  if (!row.is_active) {
    return { ok: false, status: 403, error: 'account_disabled' };
  }

  if (row.role === 'TUTOR' && !row.tutor_profile_id) {
    return { ok: false, status: 500, error: 'tutor_profile_missing' };
  }
  if (row.role === 'STUDENT' && !row.student_id) {
    return { ok: false, status: 500, error: 'student_profile_missing' };
  }

  const risk = await computeRiskScore(client, row.user_id, ip, context);

  await writeAuthEvent(client, {
    userId: row.user_id,
    ip,
    userAgent: context.userAgent ?? null,
    deviceHash: risk.deviceHash,
    country: risk.country,
    success: true,
    riskScore: risk.score,
    flags: risk.flags
  }, deps.onInternalError);

  if (risk.score >= 50 || risk.flags.newDevice || risk.flags.geoAnomaly || risk.flags.rapidRetries) {
    try {
      await deps.writeRiskAudit?.({
        actorUserId: row.user_id,
        actorRole: row.role,
        riskScore: risk.score,
        flags: risk.flags,
        country: risk.country,
        ip,
        userAgent: context.userAgent ?? null,
        correlationId: context.correlationId
      });
    } catch (err) {
      deps.onInternalError?.(err, 'auth_risk_audit_failed');
    }
  }

  const jwt = await deps.signJwt({
    userId: row.user_id,
    role: row.role,
    tutorId: row.tutor_profile_id ?? undefined,
    studentId: row.student_id ?? undefined
  });

  return {
    ok: true,
    jwt,
    userId: row.user_id,
    role: row.role,
    tutorId: row.tutor_profile_id ?? undefined,
    studentId: row.student_id ?? undefined,
    redirectTo: roleRedirectTarget(row.role)
  };
}

export async function findUserByEmail(client: AuthDbClient, email: string) {
  const normalized = normalizeEmail(email);
  const res = await client.query(
    `select id, email, role, tutor_profile_id, student_id, password_hash, is_active
     from users
     where email = $1`,
    [normalized]
  );

  if (Number(res.rowCount || 0) === 0) {
    return null;
  }

  return res.rows[0] as AuthUserRow;
}
