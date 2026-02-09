import type { FastifyInstance } from 'fastify';
import type { DbClient, AuditContext, AuditLogWriter } from '../shared/types.js';
import type { CreateTutorInput, UpdateTutorInput, ImpersonateStartInput, ImpersonateStopInput, ImpersonationStartResult, TutorSummary } from './contracts.js';
import { safeAuditMeta } from '../../../lib/audit.js';
import { createImpersonationSession, normalizeTutorEmail } from './internal.js';
import { parsePagination } from '../../../lib/pagination.js';
import { validateSubjectList } from '../../../lib/caps.js';

export async function createTutor(
  client: DbClient,
  input: CreateTutorInput
) {
  const validation = validateSubjectList(input.qualifiedSubjects);
  if (validation.invalid.length) {
    return { error: 'invalid_subjects', invalidSubjects: validation.invalid } as const;
  }

  const email = normalizeTutorEmail(input.email);
  await client.query('BEGIN');
  try {
    const tutorRes = await client.query(
      `insert into tutor_profiles
       (full_name, phone, default_hourly_rate, active, status, qualification_band, qualified_subjects_json)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb)
       returning id, full_name, phone, default_hourly_rate, active, status, qualification_band, qualified_subjects_json`,
      [
        input.fullName,
        input.phone ?? null,
        input.defaultHourlyRate,
        input.active,
        input.status,
        input.qualificationBand,
        JSON.stringify(validation.normalized)
      ]
    );

    const tutorId = tutorRes.rows[0].id as string;

    const userRes = await client.query(
      `insert into users (email, role, tutor_profile_id)
       values ($1, 'TUTOR', $2)
       returning id, email, role, tutor_profile_id`,
      [email, tutorId]
    );

    await client.query('COMMIT');
    return { tutor: tutorRes.rows[0], user: userRes.rows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

export async function listTutors(
  client: DbClient,
  query: { page?: unknown; pageSize?: unknown; q?: string } = {}
): Promise<{ tutors: TutorSummary[]; items: TutorSummary[]; total: number; page: number; pageSize: number }> {
  const { page, pageSize, offset, limit } = parsePagination(query);
  const q = query.q?.trim();
  const filters: string[] = [];
  const params: any[] = [];

  if (q) {
    params.push(`%${q}%`);
    filters.push(`(t.full_name ilike $${params.length} or u.email ilike $${params.length})`);
  }

  const where = filters.length ? `where ${filters.join(' and ')}` : '';

  const res = await client.query(
    `select t.id, t.full_name, t.phone, t.default_hourly_rate, t.active, t.status,
            t.qualification_band, t.qualified_subjects_json, u.email
     from tutor_profiles t
     left join users u on u.tutor_profile_id = t.id
     ${where}
     order by t.full_name asc
     limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, limit, offset]
  );

  const totalRes = await client.query(
    `select count(*)
     from tutor_profiles t
     left join users u on u.tutor_profile_id = t.id
     ${where}`,
    params
  );

  const total = Number(totalRes.rows[0]?.count || 0);
  return { tutors: res.rows, items: res.rows, total, page, pageSize };
}

export async function updateTutor(
  client: DbClient,
  tutorId: string,
  input: UpdateTutorInput
) {
  const currentRes = await client.query(`select * from tutor_profiles where id = $1`, [tutorId]);
  if (currentRes.rowCount === 0) return null;
  const current = currentRes.rows[0];

  let normalizedSubjects = input.qualifiedSubjects;
  if (input.qualifiedSubjects) {
    const validation = validateSubjectList(input.qualifiedSubjects);
    if (validation.invalid.length) {
      return { error: 'invalid_subjects', invalidSubjects: validation.invalid } as const;
    }
    normalizedSubjects = validation.normalized;
  }

  const res = await client.query(
    `update tutor_profiles
     set full_name = $1,
         phone = $2,
         default_hourly_rate = $3,
         active = $4,
         status = $5,
         qualification_band = $6,
         qualified_subjects_json = $7::jsonb
     where id = $8
     returning id, full_name, phone, default_hourly_rate, active, status, qualification_band, qualified_subjects_json`,
    [
      input.fullName ?? current.full_name,
      input.phone ?? current.phone,
      input.defaultHourlyRate ?? current.default_hourly_rate,
      input.active ?? current.active,
      input.status ?? current.status,
      input.qualificationBand ?? current.qualification_band,
      normalizedSubjects ? JSON.stringify(normalizedSubjects) : current.qualified_subjects_json,
      tutorId
    ]
  );

  return res.rows[0];
}

export async function startImpersonation(
  app: FastifyInstance,
  client: DbClient,
  input: ImpersonateStartInput,
  context: AuditContext,
  sessionToken: string,
  audit: AuditLogWriter
): Promise<ImpersonationStartResult | null> {
  const tutorRes = await client.query(
    `select t.id as tutor_id, t.full_name, u.id as tutor_user_id, u.email
     from tutor_profiles t
     join users u on u.tutor_profile_id = t.id
     where t.id = $1`,
    [input.tutorId]
  );

  if (tutorRes.rowCount === 0) return null;
  const tutor = tutorRes.rows[0];

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const { impersonationId, sessionHash } = await createImpersonationSession(client, {
    adminId: context.adminId,
    tutorId: tutor.tutor_id,
    tutorUserId: tutor.tutor_user_id,
    sessionToken,
    expiresAt
  });

  const token = app.jwt.sign({
    adminUserId: context.adminId,
    tutorId: tutor.tutor_id,
    tutorUserId: tutor.tutor_user_id,
    impersonationId,
    sessionHash,
    mode: 'READ_ONLY'
  }, { expiresIn: '10m' });

  await audit(client, {
    actorUserId: context.adminId,
    actorRole: 'ADMIN',
    action: 'impersonation.start',
    entityType: 'tutor',
    entityId: tutor.tutor_id,
    meta: safeAuditMeta({ impersonationId, tutorName: tutor.full_name }),
    ip: context.ip,
    userAgent: context.userAgent,
    correlationId: context.correlationId
  });

  return {
    impersonationId,
    token,
    tutor: {
      id: tutor.tutor_id,
      name: tutor.full_name,
      email: tutor.email
    }
  };
}

export async function stopImpersonation(
  client: DbClient,
  input: ImpersonateStopInput,
  context: AuditContext,
  audit: AuditLogWriter
) {
  if (!input.impersonationId) return null;

  await client.query(
    `update impersonation_sessions
     set revoked_at = now(), revoked_by_user_id = $2
     where id = $1`,
    [input.impersonationId, context.adminId]
  );

  await audit(client, {
    actorUserId: context.adminId,
    actorRole: 'ADMIN',
    action: 'impersonation.stop',
    entityType: 'impersonation',
    entityId: input.impersonationId,
    meta: safeAuditMeta({ impersonationId: input.impersonationId }),
    ip: context.ip,
    userAgent: context.userAgent,
    correlationId: context.correlationId
  });

  return { ok: true, impersonationId: input.impersonationId };
}
