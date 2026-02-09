import type { FastifyInstance } from 'fastify';
import type { DbClient, AuditContext, AuditLogWriter } from '../shared/types.js';
import type { CreateTutorInput, UpdateTutorInput, ImpersonateStartInput, ImpersonateStopInput, ImpersonationStartResult, TutorSummary } from './contracts.js';
import { safeAuditMeta } from '../../../lib/audit.js';
import { createImpersonationSession, normalizeTutorEmail } from './internal.js';

export async function createTutor(
  client: DbClient,
  input: CreateTutorInput
) {
  const email = normalizeTutorEmail(input.email);
  await client.query('BEGIN');
  try {
    const tutorRes = await client.query(
      `insert into tutor_profiles (full_name, phone, default_hourly_rate, active)
       values ($1, $2, $3, $4)
       returning id, full_name, phone, default_hourly_rate, active`,
      [input.fullName, input.phone ?? null, input.defaultHourlyRate, input.active]
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

export async function listTutors(client: DbClient): Promise<{ tutors: TutorSummary[] }> {
  const res = await client.query(
    `select t.id, t.full_name, t.phone, t.default_hourly_rate, t.active, u.email
     from tutor_profiles t
     left join users u on u.tutor_profile_id = t.id
     order by t.full_name asc`
  );
  return { tutors: res.rows };
}

export async function updateTutor(
  client: DbClient,
  tutorId: string,
  input: UpdateTutorInput
) {
  const currentRes = await client.query(`select * from tutor_profiles where id = $1`, [tutorId]);
  if (currentRes.rowCount === 0) return null;
  const current = currentRes.rows[0];

  const res = await client.query(
    `update tutor_profiles
     set full_name = $1,
         phone = $2,
         default_hourly_rate = $3,
         active = $4
     where id = $5
     returning id, full_name, phone, default_hourly_rate, active`,
    [
      input.fullName ?? current.full_name,
      input.phone ?? current.phone,
      input.defaultHourlyRate ?? current.default_hourly_rate,
      input.active ?? current.active,
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
