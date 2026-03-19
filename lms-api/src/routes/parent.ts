import type { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole } from '../lib/rbac.js';
import { IdParamSchema, ParentInviteAcceptSchema, ParentInviteCreateSchema } from '../lib/schemas.js';
import { generateMagicToken, hashToken, normalizeEmail } from '../lib/security.js';

function setPrivateNoStore(reply: FastifyReply) {
  reply.header('Cache-Control', 'private, no-store, max-age=0');
  reply.header('Pragma', 'no-cache');
}

async function resolveParentProfileId(userId: string, providedParentId?: string) {
  if (providedParentId) return providedParentId;
  const res = await pool.query(
    `select parent_profile_id
     from users
     where id = $1`,
    [userId]
  );
  return (res.rows[0]?.parent_profile_id as string | null) ?? null;
}

async function userCanInviteParent(userId: string, role: string, studentId: string, tutorId?: string) {
  if (role === 'ADMIN') return true;
  if (role !== 'TUTOR' || !tutorId) return false;

  const assignmentRes = await pool.query(
    `select 1
     from assignments
     where tutor_id = $1
       and student_id = $2
       and active = true
     limit 1`,
    [tutorId, studentId]
  );
  return Number(assignmentRes.rowCount || 0) > 0;
}

export async function parentRoutes(app: FastifyInstance) {
  app.post('/parent/invites', {
    preHandler: [app.authenticate, requireAuth],
  }, async (req, reply) => {
    const parsed = ParentInviteCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const canInvite = await userCanInviteParent(
      req.user!.userId,
      req.user!.role,
      parsed.data.studentId,
      req.user?.tutorId
    );

    if (!canInvite) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const token = generateMagicToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const inviteRes = await pool.query(
      `insert into parent_invites
       (student_id, email, relationship, token_hash, expires_at, created_by_user_id)
       values ($1, $2, $3, $4, $5::timestamptz, $6)
       returning id, student_id, email, relationship, expires_at, created_at`,
      [
        parsed.data.studentId,
        normalizeEmail(parsed.data.email),
        parsed.data.relationship ?? null,
        tokenHash,
        expiresAt.toISOString(),
        req.user!.userId
      ]
    );

    return reply.code(201).send({
      invite: inviteRes.rows[0],
      inviteToken: token
    });
  });

  app.post('/parent/invites/accept', {
    preHandler: [app.authenticate, requireAuth, requireRole('PARENT')],
  }, async (req, reply) => {
    const parsed = ParentInviteAcceptSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const parentProfileId = await resolveParentProfileId(req.user!.userId, req.user?.parentId);
    if (!parentProfileId) {
      return reply.code(404).send({ error: 'parent_profile_not_found' });
    }

    const tokenHash = hashToken(parsed.data.token);

    const inviteRes = await pool.query(
      `select id, student_id, accepted_at, expires_at
       from parent_invites
       where token_hash = $1
       limit 1`,
      [tokenHash]
    );

    if (Number(inviteRes.rowCount || 0) === 0) {
      return reply.code(404).send({ error: 'invite_not_found' });
    }

    const invite = inviteRes.rows[0] as {
      id: string;
      student_id: string;
      accepted_at: Date | null;
      expires_at: Date;
    };

    if (invite.accepted_at) {
      return reply.code(409).send({ error: 'invite_already_accepted' });
    }
    if (invite.expires_at.getTime() <= Date.now()) {
      return reply.code(410).send({ error: 'invite_expired' });
    }

    await pool.query(
      `insert into parent_student_links (parent_profile_id, student_id)
       values ($1, $2)
       on conflict (parent_profile_id, student_id) do nothing`,
      [parentProfileId, invite.student_id]
    );

    await pool.query(
      `update parent_invites
       set accepted_at = now(),
           accepted_by_parent_profile_id = $2
       where id = $1`,
      [invite.id, parentProfileId]
    );

    return reply.send({ ok: true, studentId: invite.student_id });
  });

  app.get('/parent/students', {
    preHandler: [app.authenticate, requireAuth, requireRole('PARENT')],
  }, async (req, reply) => {
    setPrivateNoStore(reply);

    const parentProfileId = await resolveParentProfileId(req.user!.userId, req.user?.parentId);
    if (!parentProfileId) {
      return reply.code(404).send({ error: 'parent_profile_not_found' });
    }

    const res = await pool.query(
      `select s.id,
              s.full_name,
              s.grade,
              psl.relationship,
              wr.id as latest_report_id,
              wr.week_start as latest_report_week_start,
              wr.week_end as latest_report_week_end,
              wr.created_at as latest_report_created_at
       from parent_student_links psl
       join students s on s.id = psl.student_id
       left join users u on u.student_id = s.id
       left join lateral (
         select wr1.id, wr1.week_start, wr1.week_end, wr1.created_at
         from weekly_reports wr1
         where wr1.user_id = u.id
         order by wr1.created_at desc
         limit 1
       ) wr on true
       where psl.parent_profile_id = $1
       order by s.full_name asc`,
      [parentProfileId]
    );

    return reply.send({ items: res.rows });
  });

  app.get('/parent/students/:id', {
    preHandler: [app.authenticate, requireAuth, requireRole('PARENT')],
  }, async (req, reply) => {
    setPrivateNoStore(reply);
    const params = IdParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }

    const parentProfileId = await resolveParentProfileId(req.user!.userId, req.user?.parentId);
    if (!parentProfileId) {
      return reply.code(404).send({ error: 'parent_profile_not_found' });
    }

    const accessRes = await pool.query(
      `select s.id, s.full_name, s.grade, psl.relationship
       from parent_student_links psl
       join students s on s.id = psl.student_id
       where psl.parent_profile_id = $1
         and psl.student_id = $2
       limit 1`,
      [parentProfileId, params.data.id]
    );

    if (Number(accessRes.rowCount || 0) === 0) {
      return reply.code(404).send({ error: 'student_not_found' });
    }

    const student = accessRes.rows[0];

    const reportRes = await pool.query(
      `select wr.id, wr.week_start, wr.week_end, wr.payload_json, wr.created_at
       from users u
       join weekly_reports wr on wr.user_id = u.id
       where u.student_id = $1
       order by wr.created_at desc
       limit 1`,
      [params.data.id]
    );

    const sessionsRes = await pool.query(
      `select count(*) filter (where s.status = 'APPROVED')::int as approved_sessions,
              coalesce(sum(s.duration_minutes) filter (where s.status = 'APPROVED'), 0)::int as approved_minutes,
              max(s.date) as last_session_date
       from sessions s
       where s.student_id = $1`,
      [params.data.id]
    );

    return reply.send({
      student,
      latestReport: reportRes.rows[0] ?? null,
      sessionSummary: sessionsRes.rows[0] ?? { approved_sessions: 0, approved_minutes: 0, last_session_date: null }
    });
  });

  app.get('/parent', {
    preHandler: [app.authenticate, requireAuth, requireRole('PARENT')],
  }, async (req, reply) => {
    setPrivateNoStore(reply);

    const parentProfileId = await resolveParentProfileId(req.user!.userId, req.user?.parentId);
    if (!parentProfileId) {
      return reply.code(404).send({ error: 'parent_profile_not_found' });
    }

    const statsRes = await pool.query(
      `select count(*)::int as linked_students
       from parent_student_links
       where parent_profile_id = $1`,
      [parentProfileId]
    );

    const reportsRes = await pool.query(
      `select count(*)::int as reports_this_month
       from parent_student_links psl
       join users u on u.student_id = psl.student_id
       join weekly_reports wr on wr.user_id = u.id
       where psl.parent_profile_id = $1
         and wr.created_at >= date_trunc('month', now())`,
      [parentProfileId]
    );

    return reply.send({
      overview: {
        linkedStudents: Number(statsRes.rows[0]?.linked_students || 0),
        reportsThisMonth: Number(reportsRes.rows[0]?.reports_this_month || 0)
      }
    });
  });
}
