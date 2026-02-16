import { pool } from '../../src/db/pool.js';
import { generateMagicToken, hashToken } from '../../src/lib/security.js';

type TutorInput = {
  email: string;
  fullName: string;
  defaultHourlyRate?: number;
  phone?: string | null;
};

type StudentInput = {
  fullName: string;
  grade?: string | null;
};

type AssignmentInput = {
  tutorId: string;
  studentId: string;
  subject: string;
  startDate: string;
  endDate?: string | null;
  allowedDays?: number[];
  allowedTimeRanges?: Array<{ start: string; end: string }>;
  rateOverride?: number | null;
};

type PayPeriodInput = {
  weekStart: string;
  weekEnd: string;
  status?: 'OPEN' | 'LOCKED';
};

type AdjustmentInput = {
  tutorId: string;
  payPeriodId: string;
  type: 'BONUS' | 'CORRECTION' | 'PENALTY';
  amount: number;
  reason: string;
  createdByUserId: string;
  approvedByUserId?: string | null;
  relatedSessionId?: string | null;
};

function uniquifyEmail(email: string) {
  const value = String(email || '').trim();
  const at = value.indexOf('@');
  const local = at > 0 ? value.slice(0, at) : (value || 'user');
  const domain = at > 0 ? value.slice(at + 1) : 'example.com';
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${local}+${suffix}@${domain}`;
}

export async function createAdmin(email = 'admin@example.com') {
  const uniqueEmail = uniquifyEmail(email);
  const res = await pool.query(
    `insert into users (email, role)
     values ($1, 'ADMIN')
     returning id, email, role`,
    [uniqueEmail]
  );
  return res.rows[0] as { id: string; email: string; role: 'ADMIN' };
}

export async function createTutor(input: TutorInput) {
  const uniqueEmail = uniquifyEmail(input.email);
  const tutorRes = await pool.query(
    `insert into tutor_profiles (full_name, phone, default_hourly_rate, active)
     values ($1, $2, $3, true)
     returning id, full_name, phone, default_hourly_rate`,
    [input.fullName, input.phone ?? null, input.defaultHourlyRate ?? 250]
  );

  const tutor = tutorRes.rows[0];

  const userRes = await pool.query(
    `insert into users (email, role, tutor_profile_id)
     values ($1, 'TUTOR', $2)
     returning id, email, role, tutor_profile_id`,
    [uniqueEmail, tutor.id]
  );

  return { tutor, user: userRes.rows[0] };
}

export async function createStudent(input: StudentInput) {
  const res = await pool.query(
    `insert into students (full_name, grade, is_active)
     values ($1, $2, true)
     returning id, full_name, grade`,
    [input.fullName, input.grade ?? null]
  );
  return res.rows[0] as { id: string; full_name: string; grade: string | null };
}

export async function createAssignment(input: AssignmentInput) {
  const res = await pool.query(
    `insert into assignments
     (tutor_id, student_id, subject, start_date, end_date, rate_override, allowed_days_json, allowed_time_ranges_json, active)
     values ($1, $2, $3, $4::date, $5::date, $6, $7::jsonb, $8::jsonb, true)
     returning *`,
    [
      input.tutorId,
      input.studentId,
      input.subject,
      input.startDate,
      input.endDate ?? null,
      input.rateOverride ?? null,
      JSON.stringify(input.allowedDays ?? []),
      JSON.stringify(input.allowedTimeRanges ?? [])
    ]
  );
  return res.rows[0];
}

export async function createPayPeriod(input: PayPeriodInput) {
  const res = await pool.query(
    `insert into pay_periods (period_start_date, period_end_date, status)
     values ($1::date, $2::date, $3)
     returning *`,
    [input.weekStart, input.weekEnd, input.status ?? 'OPEN']
  );
  return res.rows[0];
}

export async function createAdjustment(input: AdjustmentInput) {
  const res = await pool.query(
    `insert into adjustments
     (tutor_id, pay_period_id, type, amount, reason, status, created_by_user_id, approved_by_user_id, approved_at, related_session_id)
     values ($1, $2, $3, $4, $5, 'APPROVED', $6, $7, now(), $8)
     returning *`,
    [
      input.tutorId,
      input.payPeriodId,
      input.type,
      input.amount,
      input.reason,
      input.createdByUserId,
      input.approvedByUserId ?? input.createdByUserId,
      input.relatedSessionId ?? null
    ]
  );
  return res.rows[0];
}

export async function issueMagicToken(userId: string) {
  const token = generateMagicToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await pool.query(
    `insert into magic_link_tokens (user_id, token_hash, expires_at)
     values ($1, $2, $3::timestamptz)`,
    [userId, tokenHash, expiresAt.toISOString()]
  );

  return token;
}

export async function loginWithMagicToken(app: any, token: string) {
  const res = await app.inject({
    method: 'GET',
    url: `/auth/verify?token=${token}`
  });

  const cookieHeader = res.headers['set-cookie'];
  const rawCookies = Array.isArray(cookieHeader)
    ? cookieHeader
    : cookieHeader
      ? [cookieHeader]
      : [];

  const cookies = new Map<string, string>();
  for (const raw of rawCookies) {
    const pair = raw.split(';')[0];
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const name = pair.slice(0, idx);
    const value = pair.slice(idx + 1);
    cookies.set(name, value);
  }

  const sessionValue = cookies.get('session');
  const csrfValue = cookies.get('csrf');
  const cookieParts = [
    sessionValue ? `session=${sessionValue}` : null,
    csrfValue ? `csrf=${csrfValue}` : null
  ].filter(Boolean) as string[];

  const cookie = cookieParts.join('; ');
  const headers = {
    cookie,
    ...(csrfValue ? { 'x-csrf-token': csrfValue } : {})
  };

  return { response: res, cookie, csrfToken: csrfValue, headers };
}
