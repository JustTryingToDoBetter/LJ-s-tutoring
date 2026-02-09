import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import {
  createTutor,
  listTutors,
  updateTutor,
  startImpersonation,
  stopImpersonation
} from '../domains/admin/tutors/index.js';
import {
  createStudent,
  listStudents,
  updateStudent
} from '../domains/admin/students/index.js';
import {
  createAssignment,
  listAssignments,
  updateAssignment
} from '../domains/admin/assignments/index.js';
import {
  listSessions,
  getSessionHistory,
  bulkApprove,
  bulkReject,
  approveSession,
  rejectSession
} from '../domains/admin/approvals/index.js';
import {
  generatePayrollWeek,
  lockPayPeriod,
  createAdjustment,
  listAdjustments,
  deleteAdjustment
} from '../domains/admin/payroll/index.js';
import {
  AdminSessionsQuerySchema,
  AssignmentSchema,
  AuditLogQuerySchema,
  PrivacyRequestCreateSchema,
  PrivacyRequestQuerySchema,
  PrivacyRequestCloseSchema,
  BulkApproveSessionsSchema,
  BulkRejectSessionsSchema,
  CreateStudentSchema,
  CreateTutorSchema,
  DeleteAdjustmentSchema,
  DateRangeQuerySchema,
  ImpersonateStartSchema,
  ImpersonateStopSchema,
  AdjustmentCreateSchema,
  IdParamSchema,
  PayrollGenerateSchema,
  RejectSessionSchema,
  WeekStartParamSchema,
  UpdateAssignmentSchema,
  UpdateStudentSchema,
  UpdateTutorSchema
} from '../lib/schemas.js';
import {
  buildArcadeReconciliationReport,
  getLatestArcadeReconciliationReport,
  persistArcadeReconciliationReport
} from '../domains/arcade/reconciliation.js';
import { getArcadeExperimentMetrics, getArcadeFunnelMetrics } from '../domains/arcade/analytics.js';
import { requireAuth, requireRole } from '../lib/rbac.js';
import { getPayPeriodRange, getPayPeriodStart } from '../lib/pay-periods.js';
import { isWithinAssignmentWindow } from '../lib/scheduling.js';
import { safeAuditMeta, writeAuditLog } from '../lib/audit.js';
import { getRetentionConfig, getRetentionCutoffs } from '../lib/retention.js';
import { anonymizeStudent, anonymizeTutor, exportStudentData, exportTutorData } from '../lib/privacy.js';
import { PII_CLASSIFICATION_MAP } from '../lib/data-classification.js';
import { parsePagination } from '../lib/pagination.js';
import { enqueueJob, getJob } from '../lib/job-queue.js';


function toDateString(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireRole('ADMIN'));

  const impersonationCookieOptions = () => {
    const isProd = process.env.NODE_ENV === 'production';
    return {
      httpOnly: true,
      sameSite: 'strict' as const,
      secure: isProd,
      path: '/',
      maxAge: 60 * 10
    };
  };

  const normalizeJson = (value: any) => {
    if (value == null) return null;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  };

  const logAuditSafe = async (client: any, entry: Parameters<typeof writeAuditLog>[1]) => {
    try {
      await writeAuditLog(client, entry);
    } catch (err) {
      app.log?.error?.(err);
    }
  };

  const shouldLogAlert = async (action: string, adminId: string, windowMinutes: number) => {
    const res = await pool.query(
      `select 1
       from audit_log
       where actor_user_id = $1
         and action = $2
         and created_at >= now() - ($3 * interval '1 minute')
       limit 1`,
      [adminId, action, windowMinutes]
    );
    return res.rowCount === 0;
  };

  const maybeLogAlert = async (action: string, adminId: string, windowMinutes: number, meta: any, context: any) => {
    try {
      const ok = await shouldLogAlert(action, adminId, windowMinutes);
      if (!ok) return;
      await logAuditSafe(pool, {
        actorUserId: adminId,
        actorRole: 'ADMIN',
        action,
        entityType: 'alert',
        entityId: adminId,
        meta: safeAuditMeta(meta),
        ip: context.ip,
        userAgent: context.userAgent,
        correlationId: context.correlationId,
      });
    } catch (err) {
      app.log?.error?.(err);
    }
  };

  const checkApprovalAlerts = async (adminId: string, context: any) => {
    const ratioRes = await pool.query(
      `select
        count(*) filter (where change_type = 'approve') as approvals,
        count(*) filter (where change_type = 'reject') as rejections
       from session_history
       where changed_by_user_id = $1
         and created_at >= now() - interval '1 hour'`,
      [adminId]
    );
    const approvals = Number(ratioRes.rows[0]?.approvals || 0);
    const rejections = Number(ratioRes.rows[0]?.rejections || 0);
    const total = approvals + rejections;
    if (total >= 20) {
      const rejectionRatio = total > 0 ? rejections / total : 0;
      if (rejectionRatio >= 0.8 || rejectionRatio <= 0.05) {
        await maybeLogAlert('alert.approval_ratio', adminId, 60, {
          approvals,
          rejections,
          total,
          rejectionRatio,
          windowMinutes: 60
        }, context);
      }
    }

    const overrideRes = await pool.query(
      `select count(*) as count
       from session_history
       where changed_by_user_id = $1
         and change_type in ('approve', 'reject')
         and created_at >= now() - interval '10 minutes'`,
      [adminId]
    );
    const overrideCount = Number(overrideRes.rows[0]?.count || 0);
    if (overrideCount >= 30) {
      await maybeLogAlert('alert.admin_override_spike', adminId, 10, {
        approvalsAndRejections: overrideCount,
        windowMinutes: 10
      }, context);
    }
  };

  const checkPayrollAdjustmentAlerts = async (adminId: string, context: any) => {
    const res = await pool.query(
      `select
        count(*) filter (where created_by_user_id = $1 and created_at >= now() - interval '1 hour') as created_count,
        count(*) filter (where voided_by_user_id = $1 and voided_at >= now() - interval '1 hour') as voided_count
       from adjustments`,
      [adminId]
    );
    const createdCount = Number(res.rows[0]?.created_count || 0);
    const voidedCount = Number(res.rows[0]?.voided_count || 0);
    const total = createdCount + voidedCount;
    if (total >= 5) {
      await maybeLogAlert('alert.payroll_adjustment_spike', adminId, 60, {
        createdCount,
        voidedCount,
        total,
        windowMinutes: 60
      }, context);
    }
  };

  const buildAuditFilters = (data: {
    from?: string;
    to?: string;
    actorId?: string;
    entityType?: string;
    entityId?: string;
  }) => {
    const params: any[] = [];
    const filters: string[] = [];
    if (data.from) {
      params.push(data.from);
      filters.push(`a.created_at >= $${params.length}::timestamptz`);
    }
    if (data.to) {
      params.push(`${data.to} 23:59:59`);
      filters.push(`a.created_at <= $${params.length}::timestamptz`);
    }
    if (data.actorId) {
      params.push(data.actorId);
      filters.push(`a.actor_user_id = $${params.length}`);
    }
    if (data.entityType) {
      params.push(data.entityType);
      filters.push(`a.entity_type = $${params.length}`);
    }
    if (data.entityId) {
      params.push(data.entityId);
      filters.push(`a.entity_id = $${params.length}`);
    }

    return {
      params,
      where: filters.length ? `where ${filters.join(' and ')}` : ''
    };
  };


  const applyTutorCorrection = async (client: any, tutorId: string, payload: any) => {
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
        payload.fullName ?? current.full_name,
        payload.phone ?? current.phone,
        payload.defaultHourlyRate ?? current.default_hourly_rate,
        payload.active ?? current.active,
        tutorId
      ]
    );
    return res.rows[0];
  };

  const applyStudentCorrection = async (client: any, studentId: string, payload: any) => {
    const currentRes = await client.query(`select * from students where id = $1`, [studentId]);
    if (currentRes.rowCount === 0) return null;
    const current = currentRes.rows[0];

    const res = await client.query(
      `update students
       set full_name = $1,
           grade = $2,
           guardian_name = $3,
           guardian_phone = $4,
           notes = $5,
           is_active = $6
       where id = $7
       returning id, full_name, grade, guardian_name, guardian_phone, notes, is_active as active`,
      [
        payload.fullName ?? current.full_name,
        payload.grade ?? current.grade,
        payload.guardianName ?? current.guardian_name,
        payload.guardianPhone ?? current.guardian_phone,
        payload.notes ?? current.notes,
        payload.active ?? current.is_active,
        studentId
      ]
    );
    return res.rows[0];
  };

  const canDeleteTutor = async (client: any, tutorId: string) => {
    const cutoffs = getRetentionCutoffs(new Date());
    const recentSession = await client.query(
      `select 1 from sessions where tutor_id = $1 and date >= $2::date limit 1`,
      [tutorId, cutoffs.sessionsBefore]
    );
    if (recentSession.rowCount > 0) return false;

    const recentInvoice = await client.query(
      `select 1 from invoices where tutor_id = $1 and period_end >= $2::date limit 1`,
      [tutorId, cutoffs.invoicesBefore]
    );
    if (recentInvoice.rowCount > 0) return false;

    const invoiceLine = await client.query(
      `select 1
       from invoice_lines l
       join sessions s on s.id = l.session_id
       where s.tutor_id = $1
       limit 1`,
      [tutorId]
    );
    return invoiceLine.rowCount === 0;
  };

  const canDeleteStudent = async (client: any, studentId: string) => {
    const cutoffs = getRetentionCutoffs(new Date());
    const recentSession = await client.query(
      `select 1 from sessions where student_id = $1 and date >= $2::date limit 1`,
      [studentId, cutoffs.sessionsBefore]
    );
    if (recentSession.rowCount > 0) return false;

    const invoiceLine = await client.query(
      `select 1
       from invoice_lines l
       join sessions s on s.id = l.session_id
       where s.student_id = $1
       limit 1`,
      [studentId]
    );
    return invoiceLine.rowCount === 0;
  };


  app.get('/admin/dashboard', async (_req, reply) => {
    const [tutors, students, sessions] = await Promise.all([
      pool.query(`select count(*) from tutor_profiles where active = true`),
      pool.query(`select count(*) from students where is_active = true`),
      pool.query(`select status, count(*) from sessions group by status`)
    ]);

    return reply.send({
      tutors: Number(tutors.rows[0].count),
      students: Number(students.rows[0].count),
      sessions: sessions.rows
    });
  });

  app.get('/admin/retention/summary', async (_req, reply) => {
    const cutoffs = getRetentionCutoffs(new Date());
    const config = getRetentionConfig();

    const [
      magicLinkRes,
      auditRes,
      historyRes,
      invoiceRes,
      sessionRes,
      requestRes
    ] = await Promise.all([
      pool.query(`select count(*) as count from magic_link_tokens where expires_at < $1`, [cutoffs.magicLinkBefore]),
      pool.query(`select count(*) as count from audit_log where created_at < $1`, [cutoffs.auditBefore]),
      pool.query(`select count(*) as count from session_history where created_at < $1`, [cutoffs.sessionHistoryBefore]),
      pool.query(`select count(*) as count from invoices where period_end < $1::date`, [cutoffs.invoicesBefore]),
      pool.query(`select count(*) as count from sessions where date < $1::date`, [cutoffs.sessionsBefore]),
      pool.query(`select count(*) as count from privacy_requests where created_at < $1`, [cutoffs.privacyRequestsBefore])
    ]);

    const latestEventRes = await pool.query(
      `select id, ran_at, summary_json
       from retention_events
       order by ran_at desc
       limit 1`
    );
    const latestEvent = latestEventRes.rowCount
      ? {
          id: latestEventRes.rows[0].id,
          ranAt: latestEventRes.rows[0].ran_at,
          summary: latestEventRes.rows[0].summary_json
        }
      : null;

    return reply.send({
      config,
      cutoffs,
      latestEvent,
      eligible: {
        magicLinkTokens: Number(magicLinkRes.rows[0].count),
        auditLogs: Number(auditRes.rows[0].count),
        sessionHistory: Number(historyRes.rows[0].count),
        invoices: Number(invoiceRes.rows[0].count),
        sessions: Number(sessionRes.rows[0].count),
        privacyRequests: Number(requestRes.rows[0].count)
      }
    });
  });

  app.post('/admin/tutors', async (req, reply) => {
    const parsed = CreateTutorSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const client = await pool.connect();
    try {
      const result = await createTutor(client, parsed.data);
      if ('error' in result) {
        return reply.code(409).send({ error: result.error, invalidSubjects: result.invalidSubjects });
      }
      return reply.code(201).send(result);
    } catch (err: any) {
      if (err?.code === '23505') return reply.code(409).send({ error: 'email_already_exists' });
      req.log?.error?.(err);
      return reply.code(500).send({ error: 'internal_error' });
    } finally {
      client.release();
    }
  });

  app.get('/admin/tutors', async (req, reply) => {
    const result = await listTutors(pool, req.query as any);
    return reply.send(result);
  });

  app.patch('/admin/tutors/:id', async (req, reply) => {
    const tutorId = (req.params as { id: string }).id;
    const parsed = UpdateTutorSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const updated = await updateTutor(pool, tutorId, parsed.data);
    if (!updated) return reply.code(404).send({ error: 'tutor_not_found' });
    if ('error' in updated) {
      return reply.code(409).send({ error: updated.error, invalidSubjects: updated.invalidSubjects });
    }
    return reply.send({ tutor: updated });
  });

  app.post('/admin/students', async (req, reply) => {
    const parsed = CreateStudentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const student = await createStudent(pool, parsed.data);
    return reply.code(201).send({ student });
  });

  app.post('/admin/privacy-requests', async (req, reply) => {
    const parsed = PrivacyRequestCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const adminId = req.user!.userId;
    const res = await pool.query(
      `insert into privacy_requests
       (request_type, subject_type, subject_id, reason, status, created_by_user_id)
       values ($1, $2, $3, $4, 'OPEN', $5)
       returning *`,
      [
        parsed.data.requestType,
        parsed.data.subjectType,
        parsed.data.subjectId,
        parsed.data.reason ?? null,
        adminId
      ]
    );

    await logAuditSafe(pool, {
      actorUserId: adminId,
      actorRole: 'ADMIN',
      action: 'privacy_request.create',
      entityType: 'privacy_request',
      entityId: res.rows[0].id,
      meta: safeAuditMeta({
        requestType: parsed.data.requestType,
        subjectType: parsed.data.subjectType,
        subjectId: parsed.data.subjectId
      }),
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      correlationId: req.id,
    });

    return reply.code(201).send({ request: res.rows[0] });
  });

  app.get('/admin/data-classification', async (_req, reply) => {
    return reply.send({ classifications: PII_CLASSIFICATION_MAP });
  });

  app.get('/admin/privacy-requests', async (req, reply) => {
    const parsed = PrivacyRequestQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const { page, pageSize, offset, limit } = parsePagination(req.query as any, { pageSize: 200 });
    const params: any[] = [];
    const filters: string[] = [];
    if (parsed.data.status) {
      params.push(parsed.data.status);
      filters.push(`status = $${params.length}`);
    }
    if (parsed.data.subjectType) {
      params.push(parsed.data.subjectType);
      filters.push(`subject_type = $${params.length}`);
    }
    if (parsed.data.subjectId) {
      params.push(parsed.data.subjectId);
      filters.push(`subject_id = $${params.length}`);
    }

    const where = filters.length ? `where ${filters.join(' and ')}` : '';
    const res = await pool.query(
      `select * from privacy_requests ${where}
       order by created_at desc
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limit, offset]
    );

    const totalRes = await pool.query(
      `select count(*) from privacy_requests ${where}`,
      params
    );

    const total = Number(totalRes.rows[0]?.count || 0);
    return reply.send({
      requests: res.rows,
      items: res.rows,
      total,
      page,
      pageSize
    });
  });

  app.get('/admin/privacy-requests/:id/export', async (req, reply) => {
    const params = IdParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }
    const requestId = params.data.id;

    const res = await pool.query(
      `select * from privacy_requests where id = $1`,
      [requestId]
    );
    if (res.rowCount === 0) return reply.code(404).send({ error: 'privacy_request_not_found' });

    const request = res.rows[0];
    let payload: any = null;
    if (request.subject_type === 'TUTOR') {
      payload = await exportTutorData(pool, request.subject_id);
    } else {
      payload = await exportStudentData(pool, request.subject_id);
    }

    return reply.send({
      request: {
        id: request.id,
        requestType: request.request_type,
        subjectType: request.subject_type,
        subjectId: request.subject_id,
        createdAt: request.created_at
      },
      data: payload
    });
  });

  app.post('/admin/privacy-requests/:id/close', async (req, reply) => {
    const params = IdParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }
    const parsed = PrivacyRequestCloseSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const requestId = params.data.id;
    const adminId = req.user!.userId;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const requestRes = await client.query(`select * from privacy_requests where id = $1`, [requestId]);
      if (requestRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'privacy_request_not_found' });
      }
      const request = requestRes.rows[0];
      if (request.status === 'CLOSED') {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'privacy_request_closed' });
      }

      let outcome = parsed.data.outcome ?? null;

      if (request.request_type === 'CORRECTION') {
        if (request.subject_type === 'TUTOR' && parsed.data.correction?.tutor) {
          const updated = await applyTutorCorrection(client, request.subject_id, parsed.data.correction.tutor);
          if (!updated) {
            await client.query('ROLLBACK');
            return reply.code(404).send({ error: 'tutor_not_found' });
          }
        }

        if (request.subject_type === 'STUDENT' && parsed.data.correction?.student) {
          const updated = await applyStudentCorrection(client, request.subject_id, parsed.data.correction.student);
          if (!updated) {
            await client.query('ROLLBACK');
            return reply.code(404).send({ error: 'student_not_found' });
          }
        }

        outcome = outcome ?? 'CORRECTED';
      }

      if (request.request_type === 'DELETION') {
        if (request.subject_type === 'TUTOR') {
          const okToDelete = await canDeleteTutor(client, request.subject_id);
          if (okToDelete) {
            await client.query(`delete from session_history where session_id in (select id from sessions where tutor_id = $1)`, [request.subject_id]);
            await client.query(`delete from sessions where tutor_id = $1`, [request.subject_id]);
            await client.query(`delete from assignments where tutor_id = $1`, [request.subject_id]);
            await client.query(`delete from invoice_lines where invoice_id in (select id from invoices where tutor_id = $1)`, [request.subject_id]);
            await client.query(`delete from invoices where tutor_id = $1`, [request.subject_id]);
            await client.query(`delete from adjustments where tutor_id = $1`, [request.subject_id]);
            await client.query(`delete from users where tutor_profile_id = $1`, [request.subject_id]);
            await client.query(`delete from tutor_profiles where id = $1`, [request.subject_id]);
            outcome = outcome ?? 'DELETED';
          } else {
            await anonymizeTutor(client, request.subject_id);
            outcome = outcome ?? 'ANONYMIZED';
          }
        } else {
          const okToDelete = await canDeleteStudent(client, request.subject_id);
          if (okToDelete) {
            await client.query(`delete from session_history where session_id in (select id from sessions where student_id = $1)`, [request.subject_id]);
            await client.query(`delete from sessions where student_id = $1`, [request.subject_id]);
            await client.query(`delete from assignments where student_id = $1`, [request.subject_id]);
            await client.query(`delete from students where id = $1`, [request.subject_id]);
            outcome = outcome ?? 'DELETED';
          } else {
            await anonymizeStudent(client, request.subject_id);
            outcome = outcome ?? 'ANONYMIZED';
          }
        }
      }

      if (request.request_type === 'ACCESS' && !outcome) {
        outcome = 'FULFILLED';
      }

      const updatedRes = await client.query(
        `update privacy_requests
         set status = 'CLOSED', outcome = $1, closed_at = now(), closed_by_user_id = $2, close_note = $3
         where id = $4
         returning *`,
        [outcome, adminId, parsed.data.note ?? null, requestId]
      );

      await logAuditSafe(client, {
        actorUserId: adminId,
        actorRole: 'ADMIN',
        action: 'privacy_request.close',
        entityType: 'privacy_request',
        entityId: requestId,
        meta: safeAuditMeta({
          outcome,
          requestType: request.request_type,
          subjectType: request.subject_type,
          subjectId: request.subject_id
        }),
        ip: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
        correlationId: req.id,
      });

      await client.query('COMMIT');
      return reply.send({ request: updatedRes.rows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK');
      req.log?.error?.(err);
      return reply.code(500).send({ error: 'internal_error' });
    } finally {
      client.release();
    }
  });

  app.get('/admin/students', async (req, reply) => {
    const result = await listStudents(pool, req.query as any);
    return reply.send(result);
  });

  app.patch('/admin/students/:id', async (req, reply) => {
    const studentId = (req.params as { id: string }).id;
    const parsed = UpdateStudentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const updated = await updateStudent(pool, studentId, parsed.data);
    if (!updated) return reply.code(404).send({ error: 'student_not_found' });
    return reply.send({ student: updated });
  });

  app.post('/admin/assignments', async (req, reply) => {
    const parsed = AssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const result = await createAssignment(pool, parsed.data);
    if ('error' in result) {
      if (result.error === 'tutor_not_found' || result.error === 'student_not_found') {
        return reply.code(404).send({ error: result.error });
      }
      return reply.code(409).send({ error: result.error });
    }
    return reply.code(201).send({ assignment: result.assignment });
  });

  app.get('/admin/assignments', async (req, reply) => {
    const result = await listAssignments(pool, req.query as any);
    return reply.send(result);
  });

  app.patch('/admin/assignments/:id', async (req, reply) => {
    const assignmentId = (req.params as { id: string }).id;
    const parsed = UpdateAssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const updated = await updateAssignment(pool, assignmentId, parsed.data);
    if (!updated) return reply.code(404).send({ error: 'assignment_not_found' });
    if ('error' in updated) {
      if (updated.error === 'tutor_not_found' || updated.error === 'student_not_found') {
        return reply.code(404).send({ error: updated.error });
      }
      return reply.code(409).send({ error: updated.error });
    }
    return reply.send({ assignment: updated });
  });

  app.get('/admin/sessions', async (req, reply) => {
    const parsed = AdminSessionsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const result = await listSessions(pool, parsed.data);
    return reply.send(result);
  });

  app.get('/admin/sessions/:id/history', async (req, reply) => {
    const params = IdParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }

    const sessionId = params.data.id;
    const history = await getSessionHistory(pool, sessionId);
    return reply.send({ history });
  });

  app.post('/admin/impersonate/start', async (req, reply) => {
    const parsed = ImpersonateStartSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const sessionToken = req.cookies?.session;
    if (!sessionToken) return reply.code(401).send({ error: 'unauthorized' });

    const result = await startImpersonation(
      app,
      pool,
      parsed.data,
      {
        adminId: req.user!.userId,
        ip: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
        correlationId: req.id
      },
      sessionToken,
      logAuditSafe
    );

    if (!result) return reply.code(404).send({ error: 'tutor_not_found' });

    reply.setCookie('impersonation', result.token, impersonationCookieOptions());
    return reply.send({
      impersonationId: result.impersonationId,
      tutor: result.tutor
    });
  });

  app.post('/admin/impersonate/stop', async (req, reply) => {
    const parsed = ImpersonateStopSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    let impersonationId = parsed.data.impersonationId ?? null;
    if (!impersonationId && req.cookies?.impersonation) {
      try {
        const decoded = await app.jwt.verify<{ impersonationId: string }>(req.cookies.impersonation);
        impersonationId = decoded.impersonationId;
      } catch {
        impersonationId = null;
      }
    }

    if (impersonationId) {
      await stopImpersonation(
        pool,
        { impersonationId },
        {
          adminId: req.user!.userId,
          ip: req.ip,
          userAgent: req.headers['user-agent'] as string | undefined,
          correlationId: req.id
        },
        logAuditSafe
      );
    }

    reply.clearCookie('impersonation', { path: '/' });

    return reply.send({ ok: true });
  });

  app.get('/admin/audit', async (req, reply) => {
    const parsed = AuditLogQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const { from, to, actorId, entityType, entityId, page, pageSize } = parsed.data;
    const { where, params } = buildAuditFilters({ from, to, actorId, entityType, entityId });
    const offset = (page - 1) * pageSize;

    const listRes = await pool.query(
      `select a.id, a.action, a.entity_type, a.entity_id, a.meta_json, a.ip, a.user_agent,
              a.correlation_id, a.created_at, a.actor_user_id,
              u.email as actor_email, u.role as actor_role
       from audit_log a
       left join users u on u.id = a.actor_user_id
       ${where}
       order by a.created_at desc
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    const totalRes = await pool.query(
      `select count(*)
       from audit_log a
       ${where}`,
      params
    );

    const items = listRes.rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      meta: row.meta_json,
      ip: row.ip,
      userAgent: row.user_agent,
      correlationId: row.correlation_id,
      createdAt: row.created_at,
      actor: row.actor_user_id ? {
        id: row.actor_user_id,
        email: row.actor_email,
        role: row.actor_role
      } : null
    }));

    return reply.send({
      items,
      total: Number(totalRes.rows[0].count),
      page,
      pageSize
    });
  });

  app.get('/admin/audit/export.csv', async (req, reply) => {
    const parsed = AuditLogQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const { from, to, actorId, entityType, entityId } = parsed.data;
    const { where, params } = buildAuditFilters({ from, to, actorId, entityType, entityId });

    const csvValue = (value: any) => {
      if (value == null) return '';
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      const escaped = text.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="audit-export.csv"');

    reply.raw.write('timestamp,action,entity_type,entity_id,actor_id,actor_email,actor_role,ip,user_agent,correlation_id,meta\n');

    const pageSize = 500;
    let page = 1;

    while (true) {
      const offset = (page - 1) * pageSize;
      const rows = await pool.query(
        `select a.action, a.entity_type, a.entity_id, a.meta_json, a.ip, a.user_agent,
                a.correlation_id, a.created_at, a.actor_user_id,
                u.email as actor_email, u.role as actor_role
         from audit_log a
         left join users u on u.id = a.actor_user_id
         ${where}
         order by a.created_at desc
         limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, pageSize, offset]
      );

      if (rows.rowCount === 0) break;

      for (const row of rows.rows) {
        const line = [
          csvValue(row.created_at?.toISOString?.() ?? row.created_at),
          csvValue(row.action),
          csvValue(row.entity_type),
          csvValue(row.entity_id),
          csvValue(row.actor_user_id),
          csvValue(row.actor_email),
          csvValue(row.actor_role),
          csvValue(row.ip),
          csvValue(row.user_agent),
          csvValue(row.correlation_id),
          csvValue(row.meta_json)
        ].join(',');
        reply.raw.write(`${line}\n`);
      }

      page += 1;
    }

    reply.raw.end();
  });

  app.post('/admin/jobs/audit-export', async (req, reply) => {
    const parsed = AuditLogQuerySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const adminId = req.user!.userId;
    const job = await enqueueJob(pool, 'audit_export_csv', {
      filters: parsed.data,
      adminId
    });

    await logAuditSafe(pool, {
      actorUserId: adminId,
      actorRole: 'ADMIN',
      action: 'job.enqueue',
      entityType: 'job',
      entityId: job.id,
      meta: safeAuditMeta({ jobType: job.job_type }),
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      correlationId: req.id,
    });

    return reply.code(202).send({ jobId: job.id, status: job.status });
  });

  app.post('/admin/jobs/payroll-generate', async (req, reply) => {
    const parsed = PayrollGenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const adminId = req.user!.userId;
    const job = await enqueueJob(pool, 'payroll_generate', {
      weekStart: parsed.data.weekStart,
      adminId
    });

    await logAuditSafe(pool, {
      actorUserId: adminId,
      actorRole: 'ADMIN',
      action: 'job.enqueue',
      entityType: 'job',
      entityId: job.id,
      meta: safeAuditMeta({ jobType: job.job_type, weekStart: parsed.data.weekStart }),
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      correlationId: req.id,
    });

    return reply.code(202).send({ jobId: job.id, status: job.status });
  });

  app.post('/admin/jobs/payroll-csv', async (req, reply) => {
    const parsed = WeekStartParamSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_week_start' });
    }

    const adminId = req.user!.userId;
    const job = await enqueueJob(pool, 'payroll_week_csv', {
      weekStart: parsed.data.weekStart,
      adminId
    });

    await logAuditSafe(pool, {
      actorUserId: adminId,
      actorRole: 'ADMIN',
      action: 'job.enqueue',
      entityType: 'job',
      entityId: job.id,
      meta: safeAuditMeta({ jobType: job.job_type, weekStart: parsed.data.weekStart }),
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      correlationId: req.id,
    });

    return reply.code(202).send({ jobId: job.id, status: job.status });
  });

  app.get('/admin/jobs/:id', async (req, reply) => {
    const params = IdParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }

    const job = await getJob(pool, params.data.id);
    if (!job) return reply.code(404).send({ error: 'job_not_found' });

    return reply.send({
      job: {
        id: job.id,
        status: job.status,
        jobType: job.job_type,
        createdAt: job.created_at,
        startedAt: job.started_at,
        finishedAt: job.finished_at,
        attempts: job.attempts,
        maxAttempts: job.max_attempts,
        deadLetteredAt: job.dead_lettered_at,
        result: job.result_json ?? null,
        error: job.error_text ?? null
      }
    });
  });

  app.get('/admin/jobs/:id/download', async (req, reply) => {
    const params = IdParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }

    const job = await getJob(pool, params.data.id);
    if (!job) return reply.code(404).send({ error: 'job_not_found' });
    if (job.status !== 'COMPLETED') return reply.code(409).send({ error: 'job_not_ready' });

    const result = job.result_json || {};
    if (!result.csv) return reply.code(404).send({ error: 'job_result_missing' });

    reply.header('Content-Type', result.contentType || 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="${result.filename || 'export.csv'}"`);
    return reply.send(result.csv);
  });

  app.get('/admin/arcade/reconciliation/latest', async (_req, reply) => {
    const latest = await getLatestArcadeReconciliationReport(pool);
    return reply.send({ report: latest?.report_json ?? null, createdAt: latest?.created_at ?? null });
  });

  app.post('/admin/arcade/reconciliation/run', async (_req, reply) => {
    const report = await buildArcadeReconciliationReport(pool);
    const record = await persistArcadeReconciliationReport(pool, report);
    return reply.send({ ok: true, report, createdAt: record.created_at });
  });

  app.get('/admin/arcade/metrics', async (req, reply) => {
    const parsed = DateRangeQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const range = { from: parsed.data.from ?? null, to: parsed.data.to ?? null };
    const [experiments, funnel] = await Promise.all([
      getArcadeExperimentMetrics(pool, range),
      getArcadeFunnelMetrics(pool, range),
    ]);

    return reply.send({ experiments, funnel });
  });

  app.post('/admin/sessions/bulk-approve', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    const parsed = BulkApproveSessionsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const { sessionIds } = parsed.data;
    const adminId = req.user!.userId;
    const client = await pool.connect();
    try {
      const result = await bulkApprove(
        client,
        { sessionIds },
        adminId,
        { ip: req.ip, userAgent: req.headers['user-agent'] as string | undefined, correlationId: req.id },
        logAuditSafe
      );
      await checkApprovalAlerts(adminId, {
        ip: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
        correlationId: req.id
      });
      return reply.send(result);
    } catch (err: any) {
      req.log?.error?.(err);
      return reply.code(500).send({ error: 'internal_error' });
    } finally {
      client.release();
    }
  });

  app.post('/admin/sessions/bulk-reject', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    const parsed = BulkRejectSessionsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const { sessionIds, reason } = parsed.data;
    const adminId = req.user!.userId;
    const client = await pool.connect();
    try {
      const result = await bulkReject(
        client,
        { sessionIds, reason },
        adminId,
        { ip: req.ip, userAgent: req.headers['user-agent'] as string | undefined, correlationId: req.id },
        logAuditSafe
      );
      await checkApprovalAlerts(adminId, {
        ip: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
        correlationId: req.id
      });
      return reply.send(result);
    } catch (err: any) {
      req.log?.error?.(err);
      return reply.code(500).send({ error: 'internal_error' });
    } finally {
      client.release();
    }
  });

  app.post('/admin/sessions/:id/approve', {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    const params = IdParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }
    const sessionId = params.data.id;
    const adminId = req.user!.userId;
    const result = await approveSession(
      pool,
      sessionId,
      adminId,
      { ip: req.ip, userAgent: req.headers['user-agent'] as string | undefined, correlationId: req.id },
      logAuditSafe
    );
    if ('error' in result) {
      if (result.error === 'session_not_found') return reply.code(404).send({ error: result.error });
      return reply.code(409).send({ error: result.error });
    }
    await checkApprovalAlerts(adminId, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      correlationId: req.id
    });
    return reply.send(result);
  });

  app.post('/admin/sessions/:id/reject', {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    const params = IdParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }
    const sessionId = params.data.id;
    const adminId = req.user!.userId;
    const parsed = RejectSessionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const result = await rejectSession(
      pool,
      sessionId,
      parsed.data,
      adminId,
      { ip: req.ip, userAgent: req.headers['user-agent'] as string | undefined, correlationId: req.id },
      logAuditSafe
    );
    if ('error' in result) {
      if (result.error === 'session_not_found') return reply.code(404).send({ error: result.error });
      return reply.code(409).send({ error: result.error });
    }
    await checkApprovalAlerts(adminId, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      correlationId: req.id
    });
    return reply.send(result);
  });

  app.post('/admin/payroll/generate-week', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    const parsed = PayrollGenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const client = await pool.connect();
    try {
      const result = await generatePayrollWeek(
        client,
        parsed.data,
        req.user!.userId,
        { ip: req.ip, userAgent: req.headers['user-agent'] as string | undefined, correlationId: req.id },
        logAuditSafe
      );
      if ('error' in result) {
        return reply.code(409).send({ error: result.error });
      }
      return reply.send(result);
    } catch (err: any) {
      req.log?.error?.(err);
      return reply.code(500).send({ error: 'internal_error' });
    } finally {
      client.release();
    }
  });

  app.post('/admin/pay-periods/:weekStart/lock', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    const params = WeekStartParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_week_start' });
    }
    const weekStart = params.data.weekStart;
    const adminId = req.user!.userId;

    const client = await pool.connect();
    try {
      const result = await lockPayPeriod(
        client,
        weekStart,
        adminId,
        { ip: req.ip, userAgent: req.headers['user-agent'] as string | undefined, correlationId: req.id },
        logAuditSafe
      );
      if ('error' in result) {
        if (result.error === 'internal_error') {
          return reply.code(500).send({ error: result.error });
        }
        return reply.code(409).send({ error: result.error });
      }
      return reply.send(result);
    } catch (err: any) {
      req.log?.error?.(err);
      return reply.code(500).send({ error: 'internal_error' });
    } finally {
      client.release();
    }
  });

  app.post('/admin/pay-periods/:weekStart/adjustments', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    const params = WeekStartParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_week_start' });
    }
    const weekStart = params.data.weekStart;
    const parsed = AdjustmentCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const adminId = req.user!.userId;

    const client = await pool.connect();
    try {
      const result = await createAdjustment(
        client,
        weekStart,
        parsed.data,
        adminId,
        { ip: req.ip, userAgent: req.headers['user-agent'] as string | undefined, correlationId: req.id },
        logAuditSafe
      );
      if ('error' in result) {
        if (result.error === 'tutor_not_found') return reply.code(404).send({ error: result.error });
        if (result.error === 'related_session_invalid') return reply.code(400).send({ error: result.error });
        if (result.error === 'internal_error') return reply.code(500).send({ error: result.error });
      }
      await checkPayrollAdjustmentAlerts(adminId, {
        ip: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
        correlationId: req.id
      });
      return reply.code(201).send(result);
    } catch (err: any) {
      req.log?.error?.(err);
      return reply.code(500).send({ error: 'internal_error' });
    } finally {
      client.release();
    }
  });

  app.get('/admin/pay-periods/:weekStart/adjustments', async (req, reply) => {
    const params = WeekStartParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_week_start' });
    }
    const weekStart = params.data.weekStart;
    const result = await listAdjustments(pool, weekStart);
    return reply.send(result);
  });

  app.delete('/admin/adjustments/:id', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    const params = IdParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }
    const parsed = DeleteAdjustmentSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const adjustmentId = params.data.id;
    const adminId = req.user!.userId;
    const result = await deleteAdjustment(
      pool,
      adjustmentId,
      parsed.data,
      adminId,
      { ip: req.ip, userAgent: req.headers['user-agent'] as string | undefined, correlationId: req.id },
      logAuditSafe
    );
    if ('error' in result) {
      if (result.error === 'adjustment_not_found') return reply.code(404).send({ error: result.error });
      return reply.code(409).send({ error: result.error });
    }
    await checkPayrollAdjustmentAlerts(adminId, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      correlationId: req.id
    });
    return reply.send(result);
  });

  app.get('/admin/payroll/week/:weekStart.csv', {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    const params = WeekStartParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_week_start' });
    }
    const weekStart = params.data.weekStart;

    const res = await pool.query(
      `select i.invoice_number, i.period_start, i.period_end, i.total_amount,
              t.full_name as tutor_name,
              l.session_id, l.adjustment_id, l.line_type, l.description, l.minutes, l.rate, l.amount
       from invoices i
       join tutor_profiles t on t.id = i.tutor_id
       join invoice_lines l on l.invoice_id = i.id
       where i.period_start = $1::date
       order by t.full_name asc, i.invoice_number asc`,
      [weekStart]
    );

    const header = 'invoice_number,period_start,period_end,tutor_name,session_id,adjustment_id,line_type,description,minutes,rate,amount,total_amount';
    const lines = res.rows.map((row) => {
      const safe = (value: any) => String(value ?? '').replaceAll('"', '""');
      return [
        row.invoice_number,
        row.period_start.toISOString().slice(0, 10),
        row.period_end.toISOString().slice(0, 10),
        safe(row.tutor_name),
        row.session_id ?? '',
        row.adjustment_id ?? '',
        row.line_type,
        safe(row.description),
        row.minutes,
        row.rate,
        row.amount,
        row.total_amount
      ].join(',');
    });

    const csv = [header, ...lines].join('\n');
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="payroll-${weekStart}.csv"`);
    return reply.send(csv);
  });

  app.get('/admin/integrity/pay-period/:weekStart', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    const params = WeekStartParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_week_start' });
    }
    const weekStart = params.data.weekStart;

    const range = getPayPeriodRange(weekStart);

    const payPeriodRes = await pool.query(
      `select id, status from pay_periods where period_start_date = $1::date`,
      [weekStart]
    );

    const overlappingRes = await pool.query(
      `select s1.id as session_id, s1.tutor_id, s1.student_id, s1.date, s1.start_time, s1.end_time,
              s2.id as overlap_id
       from sessions s1
       join sessions s2
         on s1.tutor_id = s2.tutor_id
        and s1.id < s2.id
        and s1.date = s2.date
        and not (s1.end_time <= s2.start_time or s1.start_time >= s2.end_time)
       where s1.date between $1::date and $2::date`,
      [weekStart, range.end]
    );

    const assignmentRes = await pool.query(
      `select s.id, s.tutor_id, s.student_id, s.date, s.start_time, s.end_time,
              a.start_date, a.end_date, a.allowed_days_json, a.allowed_time_ranges_json
       from sessions s
       join assignments a on a.id = s.assignment_id
       where s.date between $1::date and $2::date`,
      [weekStart, range.end]
    );

    const outsideAssignment = assignmentRes.rows.filter((row) => {
      const date = toDateString(row.date);
      const allowedDays = normalizeJson(row.allowed_days_json) ?? [];
      const allowedTimeRanges = normalizeJson(row.allowed_time_ranges_json) ?? [];
      return !isWithinAssignmentWindow(date, row.start_time, row.end_time, {
        startDate: toDateString(row.start_date),
        endDate: row.end_date ? toDateString(row.end_date) : null,
        allowedDays,
        allowedTimeRanges
      });
    });

    const missingInvoiceLinesRes = await pool.query(
      `select s.id, s.tutor_id, s.date
       from sessions s
       left join invoice_lines l
         on l.session_id = s.id and l.line_type = 'SESSION'
       where s.status = 'APPROVED'
         and s.date between $1::date and $2::date
         and l.id is null`,
      [weekStart, range.end]
    );

    const invoiceMismatchRes = await pool.query(
      `select i.id, i.invoice_number, i.total_amount,
              coalesce(sum(l.amount), 0) as line_total
       from invoices i
       left join invoice_lines l on l.invoice_id = i.id
       where i.period_start = $1::date
       group by i.id
       having i.total_amount <> coalesce(sum(l.amount), 0)`,
      [weekStart]
    );

    const pendingRes = await pool.query(
      `select s.tutor_id, t.full_name as tutor_name, count(*) as pending
       from sessions s
       join tutor_profiles t on t.id = s.tutor_id
       where s.status = 'SUBMITTED'
         and s.date between $1::date and $2::date
       group by s.tutor_id, t.full_name
       order by t.full_name asc`,
      [weekStart, range.end]
    );

    const duplicateRes = await pool.query(
      `select tutor_id, student_id, date, start_time, end_time, count(*) as count
       from sessions
       where date between $1::date and $2::date
       group by tutor_id, student_id, date, start_time, end_time
       having count(*) > 1
       order by date asc`,
      [weekStart, range.end]
    );

    return reply.send({
      payPeriod: payPeriodRes.rows[0] ?? { status: 'OPEN' },
      overlaps: overlappingRes.rows,
      outsideAssignmentWindow: outsideAssignment,
      missingInvoiceLines: missingInvoiceLinesRes.rows,
      invoiceTotalMismatches: invoiceMismatchRes.rows,
      pendingSubmissions: pendingRes.rows,
      duplicateSessions: duplicateRes.rows
    });
  });

  app.post('/admin/invoices/:id/mark-paid', async (req, reply) => {
    const params = IdParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }
    const invoiceId = params.data.id;
    const res = await pool.query(
      `update invoices set status = 'PAID' where id = $1 returning id, status`,
      [invoiceId]
    );
    if (res.rowCount === 0) return reply.code(404).send({ error: 'invoice_not_found' });
    return reply.send({ invoice: res.rows[0] });
  });
}
