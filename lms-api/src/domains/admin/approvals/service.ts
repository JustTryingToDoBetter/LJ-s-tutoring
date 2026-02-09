import type { DbClient, AuditContext, AuditLogWriter } from '../shared/types.js';
import type { AdminSessionsQuery, BulkApproveInput, BulkRejectInput, RejectInput } from './contracts.js';
import { safeAuditMeta } from '../../../lib/audit.js';
import { computeDiffs, normalizeJson, isDateLocked } from './internal.js';

export async function listSessions(client: DbClient, query: AdminSessionsQuery) {
  const {
    status,
    from,
    to,
    tutorId,
    studentId,
    q,
    sort,
    order,
    page,
    pageSize
  } = query;

  const baseParams: any[] = [];
  const baseFilters: string[] = [];

  if (from) {
    baseParams.push(from);
    baseFilters.push(`s.date >= $${baseParams.length}::date`);
  }
  if (to) {
    baseParams.push(to);
    baseFilters.push(`s.date <= $${baseParams.length}::date`);
  }
  if (tutorId) {
    baseParams.push(tutorId);
    baseFilters.push(`s.tutor_id = $${baseParams.length}`);
  }
  if (studentId) {
    baseParams.push(studentId);
    baseFilters.push(`s.student_id = $${baseParams.length}`);
  }
  if (q) {
    baseParams.push(`%${q}%`);
    baseFilters.push(`(t.full_name ilike $${baseParams.length} or st.full_name ilike $${baseParams.length} or coalesce(s.notes, '') ilike $${baseParams.length})`);
  }

  const buildWhere = (includeStatus: boolean) => {
    const params = [...baseParams];
    const filters = [...baseFilters];
    if (includeStatus && status) {
      params.push(status);
      filters.push(`s.status = $${params.length}`);
    }
    return {
      params,
      where: filters.length ? `where ${filters.join(' and ')}` : ''
    };
  };

  const sortColumn = (() => {
    switch (sort) {
      case 'createdAt':
        return 's.created_at';
      case 'tutor':
        return 't.full_name';
      case 'student':
        return 'st.full_name';
      case 'date':
      default:
        return 's.date';
    }
  })();
  const orderSql = order === 'asc' ? 'asc' : 'desc';
  const offset = (page - 1) * pageSize;

  const listQuery = buildWhere(true);
  const listParams = [...listQuery.params, pageSize, offset];
  const listRes = await client.query(
    `select s.id, s.date, s.start_time, s.end_time, s.duration_minutes, s.status,
            s.created_at, s.notes, s.mode,
            t.full_name as tutor_name,
            st.full_name as student_name,
            a.subject,
            coalesce(a.rate_override, t.default_hourly_rate) as rate
     from sessions s
     join tutor_profiles t on t.id = s.tutor_id
     join students st on st.id = s.student_id
     join assignments a on a.id = s.assignment_id
     ${listQuery.where}
     order by ${sortColumn} ${orderSql}, s.date desc, s.start_time desc
     limit $${listQuery.params.length + 1}
     offset $${listQuery.params.length + 2}`,
    listParams
  );

  const totalRes = await client.query(
    `select count(*)
     from sessions s
     join tutor_profiles t on t.id = s.tutor_id
     join students st on st.id = s.student_id
     ${listQuery.where}`,
    listQuery.params
  );

  const aggQuery = buildWhere(false);
  const aggRes = await client.query(
    `select
      count(*) filter (where s.status = 'DRAFT') as draft_count,
      count(*) filter (where s.status = 'SUBMITTED') as submitted_count,
      count(*) filter (where s.status = 'APPROVED') as approved_count,
      count(*) filter (where s.status = 'REJECTED') as rejected_count,
      coalesce(sum(case when s.status = 'SUBMITTED' then s.duration_minutes else 0 end), 0) as submitted_minutes,
      coalesce(sum(case when s.status = 'APPROVED' then s.duration_minutes else 0 end), 0) as approved_minutes,
      coalesce(sum(case when s.status = 'REJECTED' then s.duration_minutes else 0 end), 0) as rejected_minutes,
      coalesce(sum(s.duration_minutes), 0) as total_minutes
     from sessions s
     join tutor_profiles t on t.id = s.tutor_id
     join students st on st.id = s.student_id
     ${aggQuery.where}`,
    aggQuery.params
  );

  const agg = aggRes.rows[0];

  return {
    items: listRes.rows,
    total: Number(totalRes.rows[0].count),
    page,
    pageSize,
    aggregates: {
      countsByStatus: {
        DRAFT: Number(agg.draft_count),
        SUBMITTED: Number(agg.submitted_count),
        APPROVED: Number(agg.approved_count),
        REJECTED: Number(agg.rejected_count)
      },
      totalMinutes: Number(agg.total_minutes),
      totalMinutesSubmitted: Number(agg.submitted_minutes),
      totalMinutesApproved: Number(agg.approved_minutes),
      totalMinutesRejected: Number(agg.rejected_minutes)
    }
  };
}

export async function getSessionHistory(client: DbClient, sessionId: string) {
  const res = await client.query(
    `select h.id, h.change_type, h.before_json, h.after_json, h.created_at,
            u.id as actor_id, u.email as actor_email, u.role as actor_role,
            t.full_name as actor_name
     from session_history h
     left join users u on u.id = h.changed_by_user_id
     left join tutor_profiles t on t.id = u.tutor_profile_id
     where h.session_id = $1
     order by h.created_at desc`,
    [sessionId]
  );

  return res.rows.map((row) => ({
    id: row.id,
    changeType: row.change_type,
    createdAt: row.created_at,
    actor: row.actor_id ? {
      id: row.actor_id,
      email: row.actor_email,
      role: row.actor_role,
      name: row.actor_name
    } : null,
    beforeJson: normalizeJson(row.before_json),
    afterJson: normalizeJson(row.after_json),
    diffs: computeDiffs(row.before_json, row.after_json)
  }));
}

export async function approveSession(
  client: DbClient,
  sessionId: string,
  adminId: string,
  context: AuditContext,
  audit: AuditLogWriter
) {
  const currentRes = await client.query(`select * from sessions where id = $1`, [sessionId]);
  if (currentRes.rowCount === 0) return { error: 'session_not_found' } as const;
  const current = currentRes.rows[0];
  const tutorRes = await client.query(
    `select active, status from tutor_profiles where id = $1`,
    [current.tutor_id]
  );
  if (tutorRes.rowCount === 0) return { error: 'tutor_not_found' } as const;
  const tutor = tutorRes.rows[0];
  if (!tutor.active || tutor.status !== 'ACTIVE') return { error: 'tutor_not_active' } as const;
  if (await isDateLocked(client, current.date)) {
    return { error: 'pay_period_locked' } as const;
  }
  if (current.status !== 'SUBMITTED') return { error: 'only_submitted_approvable' } as const;

  const updatedRes = await client.query(
    `update sessions
     set status = 'APPROVED', approved_at = now(), approved_by = $1
     where id = $2
     returning *`,
    [adminId, sessionId]
  );

  await client.query(
    `insert into session_history (session_id, changed_by_user_id, change_type, before_json, after_json)
     values ($1, $2, 'approve', $3, $4)`,
    [sessionId, adminId, current, updatedRes.rows[0]]
  );

  await audit(client, {
    actorUserId: adminId,
    actorRole: 'ADMIN',
    action: 'session.approve',
    entityType: 'session',
    entityId: sessionId,
    meta: safeAuditMeta({ status: 'APPROVED' }),
    ip: context.ip,
    userAgent: context.userAgent,
    correlationId: context.correlationId
  });

  return { session: updatedRes.rows[0] } as const;
}

export async function rejectSession(
  client: DbClient,
  sessionId: string,
  input: RejectInput,
  adminId: string,
  context: AuditContext,
  audit: AuditLogWriter
) {
  const currentRes = await client.query(`select * from sessions where id = $1`, [sessionId]);
  if (currentRes.rowCount === 0) return { error: 'session_not_found' } as const;
  const current = currentRes.rows[0];
  if (await isDateLocked(client, current.date)) {
    return { error: 'pay_period_locked' } as const;
  }
  if (current.status !== 'SUBMITTED') return { error: 'only_submitted_rejectable' } as const;

  const updatedRes = await client.query(
    `update sessions
     set status = 'REJECTED'
     where id = $1
     returning *`,
    [sessionId]
  );

  await client.query(
    `insert into session_history (session_id, changed_by_user_id, change_type, before_json, after_json)
     values ($1, $2, 'reject', $3, $4)`,
    [
      sessionId,
      adminId,
      current,
      { ...updatedRes.rows[0], reject_reason: input.reason ?? null }
    ]
  );

  await audit(client, {
    actorUserId: adminId,
    actorRole: 'ADMIN',
    action: 'session.reject',
    entityType: 'session',
    entityId: sessionId,
    meta: safeAuditMeta({ status: 'REJECTED', reason: input.reason ?? null }),
    ip: context.ip,
    userAgent: context.userAgent,
    correlationId: context.correlationId
  });

  return { session: updatedRes.rows[0] } as const;
}

export async function bulkApprove(
  client: DbClient,
  input: BulkApproveInput,
  adminId: string,
  context: AuditContext,
  audit: AuditLogWriter
) {
  await client.query('BEGIN');
  try {
    const res = await client.query(
      `select * from sessions where id = any($1::uuid[])`,
      [input.sessionIds]
    );
    const sessionById = new Map(res.rows.map((row) => [row.id, row]));

    const tutorIds = Array.from(new Set(res.rows.map((row) => row.tutor_id)));
    const tutorRes = tutorIds.length
      ? await client.query(
          `select id, active, status
           from tutor_profiles
           where id = any($1::uuid[])`,
          [tutorIds]
        )
      : { rows: [] };
    const tutorById = new Map(tutorRes.rows.map((row: any) => [row.id, row]));

    const results: Array<{ sessionId: string; status: string; reason?: string }> = [];

    for (const sessionId of input.sessionIds) {
      const current = sessionById.get(sessionId);
      if (!current) {
        results.push({ sessionId, status: 'error', reason: 'not_found' });
        continue;
      }
      const tutor = tutorById.get(current.tutor_id);
      if (!tutor || !tutor.active || tutor.status !== 'ACTIVE') {
        results.push({ sessionId, status: 'error', reason: 'tutor_not_active' });
        continue;
      }
      if (await isDateLocked(client, current.date)) {
        results.push({ sessionId, status: 'error', reason: 'pay_period_locked' });
        continue;
      }
      if (current.status !== 'SUBMITTED') {
        results.push({ sessionId, status: 'skipped', reason: 'status_not_submitted' });
        continue;
      }

      const updatedRes = await client.query(
        `update sessions
         set status = 'APPROVED', approved_at = now(), approved_by = $1
         where id = $2
         returning *`,
        [adminId, sessionId]
      );

      await client.query(
        `insert into session_history (session_id, changed_by_user_id, change_type, before_json, after_json)
         values ($1, $2, 'approve', $3, $4)`,
        [sessionId, adminId, current, updatedRes.rows[0]]
      );

      await audit(client, {
        actorUserId: adminId,
        actorRole: 'ADMIN',
        action: 'session.approve',
        entityType: 'session',
        entityId: sessionId,
        meta: safeAuditMeta({ status: 'APPROVED', bulk: true }),
        ip: context.ip,
        userAgent: context.userAgent,
        correlationId: context.correlationId
      });

      results.push({ sessionId, status: 'approved' });
    }

    await client.query('COMMIT');
    return { results } as const;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

export async function bulkReject(
  client: DbClient,
  input: BulkRejectInput,
  adminId: string,
  context: AuditContext,
  audit: AuditLogWriter
) {
  await client.query('BEGIN');
  try {
    const res = await client.query(
      `select * from sessions where id = any($1::uuid[])`,
      [input.sessionIds]
    );
    const sessionById = new Map(res.rows.map((row) => [row.id, row]));

    const results: Array<{ sessionId: string; status: string; reason?: string }> = [];

    for (const sessionId of input.sessionIds) {
      const current = sessionById.get(sessionId);
      if (!current) {
        results.push({ sessionId, status: 'error', reason: 'not_found' });
        continue;
      }
      if (await isDateLocked(client, current.date)) {
        results.push({ sessionId, status: 'error', reason: 'pay_period_locked' });
        continue;
      }
      if (current.status !== 'SUBMITTED') {
        results.push({ sessionId, status: 'skipped', reason: 'status_not_submitted' });
        continue;
      }

      const updatedRes = await client.query(
        `update sessions
         set status = 'REJECTED'
         where id = $1
         returning *`,
        [sessionId]
      );

      await client.query(
        `insert into session_history (session_id, changed_by_user_id, change_type, before_json, after_json)
         values ($1, $2, 'reject', $3, $4)`,
        [
          sessionId,
          adminId,
          current,
          { ...updatedRes.rows[0], reject_reason: input.reason ?? null }
        ]
      );

      await audit(client, {
        actorUserId: adminId,
        actorRole: 'ADMIN',
        action: 'session.reject',
        entityType: 'session',
        entityId: sessionId,
        meta: safeAuditMeta({ status: 'REJECTED', reason: input.reason ?? null, bulk: true }),
        ip: context.ip,
        userAgent: context.userAgent,
        correlationId: context.correlationId
      });

      results.push({ sessionId, status: 'rejected' });
    }

    await client.query('COMMIT');
    return { results } as const;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}
