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
import { requireAuth, requireRole } from '../lib/rbac.js';
import { getPayPeriodRange, getPayPeriodStart } from '../lib/pay-periods.js';
import { isWithinAssignmentWindow } from '../lib/scheduling.js';
import { safeAuditMeta, writeAuditLog } from '../lib/audit.js';
import { getRetentionConfig, getRetentionCutoffs } from '../lib/retention.js';
import { anonymizeStudent, anonymizeTutor, exportStudentData, exportTutorData } from '../lib/privacy.js';


function toDateString(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getSignedAmount(type: string, amount: number) {
  return type === 'PENALTY' ? -Math.abs(amount) : Math.abs(amount);
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

  const fieldLabels: Record<string, string> = {
    date: 'Date',
    start_time: 'Start time',
    end_time: 'End time',
    duration_minutes: 'Duration',
    status: 'Status',
    mode: 'Mode',
    location: 'Location',
    notes: 'Notes',
    assignment_id: 'Assignment',
    tutor_id: 'Tutor',
    student_id: 'Student',
    approved_by: 'Approved by',
    approved_at: 'Approved at',
    submitted_at: 'Submitted at',
    created_at: 'Created at',
    reject_reason: 'Reject reason'
  };

  const importantFields = new Set([
    'status',
    'date',
    'start_time',
    'end_time',
    'assignment_id',
    'student_id',
    'tutor_id',
    'approved_by'
  ]);

  const orderedFields = [
    'status',
    'date',
    'start_time',
    'end_time',
    'duration_minutes',
    'assignment_id',
    'student_id',
    'tutor_id',
    'mode',
    'location',
    'notes',
    'approved_by',
    'approved_at',
    'submitted_at',
    'created_at',
    'reject_reason'
  ];

  const stableStringify = (value: any): string => {
    if (value === undefined) return 'null';
    if (value == null) return '';
    if (Array.isArray(value)) return JSON.stringify(value.map((item) => JSON.parse(stableStringify(item) || 'null')));
    if (typeof value === 'object') {
      const keys = Object.keys(value).sort();
      const normalized: Record<string, any> = {};
      for (const key of keys) {
        normalized[key] = JSON.parse(stableStringify(value[key]) || 'null');
      }
      return JSON.stringify(normalized);
    }
    return JSON.stringify(value);
  };

  const normalizeDateValue = (value: any) => {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
      const asDate = new Date(value);
      if (!Number.isNaN(asDate.getTime())) return asDate.toISOString().slice(0, 10);
    }
    return value;
  };

  const normalizeTimeValue = (value: any) => {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(11, 16);
    if (typeof value === 'string') {
      const match = value.match(/^(\d{2}:\d{2})/);
      if (match) return match[1];
    }
    return value;
  };

  const normalizeComparable = (field: string, value: any) => {
    if (value == null) return null;
    if (field === 'date' || field.endsWith('_date')) return normalizeDateValue(value);
    if (field === 'start_time' || field === 'end_time') return normalizeTimeValue(value);
    if (field.endsWith('_at')) {
      if (value instanceof Date) return value.toISOString();
      if (typeof value === 'string') return value;
    }
    if (typeof value === 'number') return Number(value);
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value) || typeof value === 'object') return stableStringify(value);
    return value;
  };

  const summarizeComplex = (value: any) => {
    if (value == null) return '—';
    if (Array.isArray(value)) {
      if (value.length <= 3) return JSON.stringify(value);
      return `${value.length} items`;
    }
    if (typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length === 0) return '{}';
      const preview = keys.slice(0, 3).join(', ');
      const more = keys.length > 3 ? ` (+${keys.length - 3})` : '';
      return `Keys: ${preview}${more}`;
    }
    return String(value);
  };

  const formatDisplay = (field: string, value: any) => {
    if (value == null || value === '') return '—';
    if (field === 'date' || field.endsWith('_date')) return String(normalizeDateValue(value));
    if (field === 'start_time' || field === 'end_time') return String(normalizeTimeValue(value));
    if (field === 'duration_minutes') return `${Number(value)} min`;
    if (Array.isArray(value) || typeof value === 'object') return summarizeComplex(value);
    return String(value);
  };

  const toLabel = (field: string) => {
    if (fieldLabels[field]) return fieldLabels[field];
    return field
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const computeDiffs = (beforeRaw: any, afterRaw: any) => {
    const before = normalizeJson(beforeRaw) ?? {};
    const after = normalizeJson(afterRaw) ?? {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

    const known = orderedFields.filter((key) => keys.has(key));
    const rest = Array.from(keys)
      .filter((key) => !orderedFields.includes(key))
      .sort();

    const diffs = [] as Array<{
      field: string;
      label: string;
      before: string;
      after: string;
      important: boolean;
    }>;

    for (const field of [...known, ...rest]) {
      const beforeValue = before[field];
      const afterValue = after[field];
      const normBefore = normalizeComparable(field, beforeValue);
      const normAfter = normalizeComparable(field, afterValue);
      if (normBefore === normAfter) continue;

      diffs.push({
        field,
        label: toLabel(field),
        before: formatDisplay(field, beforeValue),
        after: formatDisplay(field, afterValue),
        important: importantFields.has(field)
      });
    }

    return diffs;
  };

  const getOrCreatePayPeriod = async (client: any, weekStart: string, weekEnd: string) => {
    await client.query(
      `insert into pay_periods (period_start_date, period_end_date, status)
       values ($1::date, $2::date, 'OPEN')
       on conflict (period_start_date) do nothing`,
      [weekStart, weekEnd]
    );

    const res = await client.query(
      `select id, status, period_start_date, period_end_date
       from pay_periods where period_start_date = $1::date`,
      [weekStart]
    );
    return res.rows[0] as { id: string; status: string; period_start_date: Date; period_end_date: Date } | undefined;
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

  const isDateLocked = async (client: any, dateValue: Date) => {
    const weekStart = getPayPeriodStart(toDateString(dateValue));
    const res = await client.query(
      `select status from pay_periods where period_start_date = $1::date`,
      [weekStart]
    );
    return res.rowCount > 0 && res.rows[0].status === 'LOCKED';
  };

  const generateInvoicesForWeek = async (client: any, weekStart: string, weekEnd: string) => {
    const payPeriod = await getOrCreatePayPeriod(client, weekStart, weekEnd);
    const periodId = payPeriod?.id;

    const tutorRes = await client.query(
      `select distinct t.id as tutor_id, t.full_name, t.default_hourly_rate
       from tutor_profiles t
       where exists (
         select 1 from sessions s
         where s.tutor_id = t.id
           and s.status = 'APPROVED'
           and s.date between $1::date and $2::date
       )
       or exists (
         select 1 from adjustments a
         where a.tutor_id = t.id
           and a.pay_period_id = $3
           and a.status = 'APPROVED'
           and a.voided_at is null
       )`,
      [weekStart, weekEnd, periodId]
    );

    const invoices: Array<{ id: string; invoice_number: string; total_amount: number }> = [];

    for (const tutor of tutorRes.rows) {
      const linesRes = await client.query(
        `select s.id, s.duration_minutes, s.date, s.start_time, s.end_time,
                coalesce(a.rate_override, $3) as rate,
                st.full_name as student_name, a.subject
         from sessions s
         join assignments a on a.id = s.assignment_id
         join students st on st.id = s.student_id
         where s.tutor_id = $1
           and s.status = 'APPROVED'
           and s.date between $2::date and $4::date
         order by s.date asc, s.start_time asc`,
        [tutor.tutor_id, weekStart, tutor.default_hourly_rate, weekEnd]
      );

      const adjustmentsRes = await client.query(
        `select a.id, a.type, a.amount, a.reason, a.related_session_id
         from adjustments a
         where a.tutor_id = $1
           and a.pay_period_id = $2
           and a.status = 'APPROVED'
           and a.voided_at is null
         order by a.created_at asc`,
        [tutor.tutor_id, periodId]
      );

      if (linesRes.rowCount === 0 && adjustmentsRes.rowCount === 0) continue;

      const invoiceNumber = `INV-${weekStart.replaceAll('-', '')}-${String(tutor.tutor_id).slice(0, 8)}`;
      let totalAmount = 0;

      const sessionLines = linesRes.rows.map((line: any) => {
        const amount = (Number(line.duration_minutes) / 60) * Number(line.rate);
        totalAmount += amount;
        return {
          sessionId: line.id,
          lineType: 'SESSION',
          adjustmentId: null,
          description: `${line.subject} - ${line.student_name} (${line.date.toISOString().slice(0, 10)} ${line.start_time}-${line.end_time})`,
          minutes: line.duration_minutes,
          rate: Number(line.rate),
          amount
        };
      });

      const adjustmentLines = adjustmentsRes.rows.map((adj: any) => {
        const signedAmount = getSignedAmount(adj.type, Number(adj.amount));
        totalAmount += signedAmount;
        return {
          sessionId: null,
          lineType: 'ADJUSTMENT',
          adjustmentId: adj.id,
          description: `Adjustment (${adj.type}): ${adj.reason}`,
          minutes: 0,
          rate: 0,
          amount: signedAmount
        };
      });

      const invoiceRes = await client.query(
        `insert into invoices (tutor_id, period_start, period_end, invoice_number, total_amount, status)
         values ($1, $2::date, $3::date, $4, $5, 'ISSUED')
         returning id, invoice_number, total_amount`,
        [tutor.tutor_id, weekStart, weekEnd, invoiceNumber, totalAmount]
      );

      const invoiceId = invoiceRes.rows[0].id as string;
      const allLines = [...sessionLines, ...adjustmentLines];

      for (const line of allLines) {
        await client.query(
          `insert into invoice_lines (invoice_id, session_id, adjustment_id, line_type, description, minutes, rate, amount)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [invoiceId, line.sessionId, line.adjustmentId, line.lineType, line.description, line.minutes, line.rate, line.amount]
        );
      }

      invoices.push(invoiceRes.rows[0]);
    }

    return invoices;
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

    return reply.send({
      config,
      cutoffs,
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
      return reply.code(201).send(result);
    } catch (err: any) {
      if (err?.code === '23505') return reply.code(409).send({ error: 'email_already_exists' });
      req.log?.error?.(err);
      return reply.code(500).send({ error: 'internal_error' });
    } finally {
      client.release();
    }
  });

  app.get('/admin/tutors', async (_req, reply) => {
    const result = await listTutors(pool);
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
    return reply.send({ tutor: updated });
  });

  app.post('/admin/students', async (req, reply) => {
    const parsed = CreateStudentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const res = await pool.query(
      `insert into students (full_name, grade, guardian_name, guardian_phone, notes, is_active)
       values ($1, $2, $3, $4, $5, $6)
       returning id, full_name, grade, guardian_name, guardian_phone, notes, is_active as active`,
      [
        parsed.data.fullName,
        parsed.data.grade ?? null,
        parsed.data.guardianName ?? null,
        parsed.data.guardianPhone ?? null,
        parsed.data.notes ?? null,
        parsed.data.active
      ]
    );

    return reply.code(201).send({ student: res.rows[0] });
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

  app.get('/admin/privacy-requests', async (req, reply) => {
    const parsed = PrivacyRequestQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

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
      `select * from privacy_requests ${where} order by created_at desc`,
      params
    );
    return reply.send({ requests: res.rows });
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

  app.get('/admin/students', async (_req, reply) => {
    const res = await pool.query(
      `select id, full_name, grade, guardian_name, guardian_phone, notes, is_active as active
       from students
       order by full_name asc`
    );
    return reply.send({ students: res.rows });
  });

  app.patch('/admin/students/:id', async (req, reply) => {
    const studentId = (req.params as { id: string }).id;
    const parsed = UpdateStudentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const currentRes = await pool.query(`select * from students where id = $1`, [studentId]);
    if (currentRes.rowCount === 0) return reply.code(404).send({ error: 'student_not_found' });
    const current = currentRes.rows[0];

    const res = await pool.query(
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
        parsed.data.fullName ?? current.full_name,
        parsed.data.grade ?? current.grade,
        parsed.data.guardianName ?? current.guardian_name,
        parsed.data.guardianPhone ?? current.guardian_phone,
        parsed.data.notes ?? current.notes,
        parsed.data.active ?? current.active,
        studentId
      ]
    );

    return reply.send({ student: res.rows[0] });
  });

  app.post('/admin/assignments', async (req, reply) => {
    const parsed = AssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const [tutorRes, studentRes] = await Promise.all([
      pool.query(`select 1 from tutor_profiles where id = $1`, [parsed.data.tutorId]),
      pool.query(`select 1 from students where id = $1`, [parsed.data.studentId])
    ]);

    if (tutorRes.rowCount === 0) return reply.code(404).send({ error: 'tutor_not_found' });
    if (studentRes.rowCount === 0) return reply.code(404).send({ error: 'student_not_found' });

    const res = await pool.query(
      `insert into assignments
       (tutor_id, student_id, subject, start_date, end_date, rate_override, allowed_days_json, allowed_time_ranges_json, active)
       values ($1, $2, $3, $4::date, $5::date, $6, $7::jsonb, $8::jsonb, $9)
       returning *`,
      [
        parsed.data.tutorId,
        parsed.data.studentId,
        parsed.data.subject,
        parsed.data.startDate,
        parsed.data.endDate ?? null,
        parsed.data.rateOverride ?? null,
        JSON.stringify(parsed.data.allowedDays),
        JSON.stringify(parsed.data.allowedTimeRanges),
        parsed.data.active
      ]
    );

    return reply.code(201).send({ assignment: res.rows[0] });
  });

  app.get('/admin/assignments', async (_req, reply) => {
    const res = await pool.query(
      `select a.*, t.full_name as tutor_name, s.full_name as student_name
       from assignments a
       join tutor_profiles t on t.id = a.tutor_id
       join students s on s.id = a.student_id
       order by a.start_date desc`
    );
    return reply.send({ assignments: res.rows });
  });

  app.patch('/admin/assignments/:id', async (req, reply) => {
    const assignmentId = (req.params as { id: string }).id;
    const parsed = UpdateAssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const currentRes = await pool.query(`select * from assignments where id = $1`, [assignmentId]);
    if (currentRes.rowCount === 0) return reply.code(404).send({ error: 'assignment_not_found' });
    const current = currentRes.rows[0];

    const res = await pool.query(
      `update assignments
       set subject = $1,
           start_date = $2::date,
           end_date = $3::date,
           rate_override = $4,
           allowed_days_json = $5::jsonb,
           allowed_time_ranges_json = $6::jsonb,
           active = $7
       where id = $8
       returning *`,
      [
        parsed.data.subject ?? current.subject,
        parsed.data.startDate ?? current.start_date,
        parsed.data.endDate ?? current.end_date,
        parsed.data.rateOverride ?? current.rate_override,
        parsed.data.allowedDays ? JSON.stringify(parsed.data.allowedDays) : normalizeJson(current.allowed_days_json),
        parsed.data.allowedTimeRanges ? JSON.stringify(parsed.data.allowedTimeRanges) : normalizeJson(current.allowed_time_ranges_json),
        parsed.data.active ?? current.active,
        assignmentId
      ]
    );

    return reply.send({ assignment: res.rows[0] });
  });

  app.get('/admin/sessions', async (req, reply) => {
    const parsed = AdminSessionsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

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
    } = parsed.data;

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
    const listRes = await pool.query(
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

    const totalRes = await pool.query(
      `select count(*)
       from sessions s
       join tutor_profiles t on t.id = s.tutor_id
       join students st on st.id = s.student_id
       ${listQuery.where}`,
      listQuery.params
    );

    const aggQuery = buildWhere(false);
    const aggRes = await pool.query(
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

    return reply.send({
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
    });
  });

  app.get('/admin/sessions/:id/history', async (req, reply) => {
    const params = IdParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }

    const sessionId = params.data.id;
    const res = await pool.query(
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

    const history = res.rows.map((row) => ({
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

  app.post('/admin/sessions/bulk-approve', async (req, reply) => {
    const parsed = BulkApproveSessionsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const { sessionIds } = parsed.data;
    const adminId = req.user!.userId;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query(
        `select * from sessions where id = any($1::uuid[])`,
        [sessionIds]
      );
      const sessionById = new Map(res.rows.map((row) => [row.id, row]));

      const results: Array<{ sessionId: string; status: string; reason?: string }> = [];

      for (const sessionId of sessionIds) {
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

        await logAuditSafe(client, {
          actorUserId: adminId,
          actorRole: 'ADMIN',
          action: 'session.approve',
          entityType: 'session',
          entityId: sessionId,
          meta: safeAuditMeta({ status: 'APPROVED', bulk: true }),
          ip: req.ip,
          userAgent: req.headers['user-agent'] as string | undefined,
          correlationId: req.id,
        });

        results.push({ sessionId, status: 'approved' });
      }

      await client.query('COMMIT');
      return reply.send({ results });
    } catch (err: any) {
      await client.query('ROLLBACK');
      req.log?.error?.(err);
      return reply.code(500).send({ error: 'internal_error' });
    } finally {
      client.release();
    }
  });

  app.post('/admin/sessions/bulk-reject', async (req, reply) => {
    const parsed = BulkRejectSessionsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const { sessionIds, reason } = parsed.data;
    const adminId = req.user!.userId;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query(
        `select * from sessions where id = any($1::uuid[])`,
        [sessionIds]
      );
      const sessionById = new Map(res.rows.map((row) => [row.id, row]));

      const results: Array<{ sessionId: string; status: string; reason?: string }> = [];

      for (const sessionId of sessionIds) {
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
            { ...updatedRes.rows[0], reject_reason: reason ?? null }
          ]
        );

        await logAuditSafe(client, {
          actorUserId: adminId,
          actorRole: 'ADMIN',
          action: 'session.reject',
          entityType: 'session',
          entityId: sessionId,
          meta: safeAuditMeta({ status: 'REJECTED', reason: reason ?? null, bulk: true }),
          ip: req.ip,
          userAgent: req.headers['user-agent'] as string | undefined,
          correlationId: req.id,
        });

        results.push({ sessionId, status: 'rejected' });
      }

      await client.query('COMMIT');
      return reply.send({ results });
    } catch (err: any) {
      await client.query('ROLLBACK');
      req.log?.error?.(err);
      return reply.code(500).send({ error: 'internal_error' });
    } finally {
      client.release();
    }
  });

  app.post('/admin/sessions/:id/approve', async (req, reply) => {
    const params = IdParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }
    const sessionId = params.data.id;
    const adminId = req.user!.userId;

    const currentRes = await pool.query(`select * from sessions where id = $1`, [sessionId]);
    if (currentRes.rowCount === 0) return reply.code(404).send({ error: 'session_not_found' });
    const current = currentRes.rows[0];
    if (await isDateLocked(pool, current.date)) {
      return reply.code(409).send({ error: 'pay_period_locked' });
    }
    if (current.status !== 'SUBMITTED') return reply.code(409).send({ error: 'only_submitted_approvable' });

    const updatedRes = await pool.query(
      `update sessions
       set status = 'APPROVED', approved_at = now(), approved_by = $1
       where id = $2
       returning *`,
      [adminId, sessionId]
    );

    await pool.query(
      `insert into session_history (session_id, changed_by_user_id, change_type, before_json, after_json)
       values ($1, $2, 'approve', $3, $4)`,
      [sessionId, adminId, current, updatedRes.rows[0]]
    );

    await logAuditSafe(pool, {
      actorUserId: adminId,
      actorRole: 'ADMIN',
      action: 'session.approve',
      entityType: 'session',
      entityId: sessionId,
      meta: safeAuditMeta({ status: 'APPROVED' }),
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      correlationId: req.id,
    });

    return reply.send({ session: updatedRes.rows[0] });
  });

  app.post('/admin/sessions/:id/reject', async (req, reply) => {
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

    const currentRes = await pool.query(`select * from sessions where id = $1`, [sessionId]);
    if (currentRes.rowCount === 0) return reply.code(404).send({ error: 'session_not_found' });
    const current = currentRes.rows[0];
    if (await isDateLocked(pool, current.date)) {
      return reply.code(409).send({ error: 'pay_period_locked' });
    }
    if (current.status !== 'SUBMITTED') return reply.code(409).send({ error: 'only_submitted_rejectable' });

    const updatedRes = await pool.query(
      `update sessions
       set status = 'REJECTED'
       where id = $1
       returning *`,
      [sessionId]
    );

    await pool.query(
      `insert into session_history (session_id, changed_by_user_id, change_type, before_json, after_json)
       values ($1, $2, 'reject', $3, $4)`,
      [
        sessionId,
        adminId,
        current,
        { ...updatedRes.rows[0], reject_reason: parsed.data.reason ?? null }
      ]
    );

    await logAuditSafe(pool, {
      actorUserId: adminId,
      actorRole: 'ADMIN',
      action: 'session.reject',
      entityType: 'session',
      entityId: sessionId,
      meta: safeAuditMeta({ status: 'REJECTED', reason: parsed.data.reason ?? null }),
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      correlationId: req.id,
    });

    return reply.send({ session: updatedRes.rows[0] });
  });

  app.post('/admin/payroll/generate-week', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    const parsed = PayrollGenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const weekStart = parsed.data.weekStart;
    const range = getPayPeriodRange(weekStart);

    const existing = await pool.query(
      `select 1 from invoices where period_start = $1::date`,
      [weekStart]
    );
    if ((existing.rowCount ?? 0) > 0) return reply.code(409).send({ error: 'invoices_already_generated' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const payPeriod = await getOrCreatePayPeriod(client, weekStart, range.end);
      if (payPeriod?.status === 'LOCKED') {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'pay_period_locked' });
      }

      const invoices = await generateInvoicesForWeek(client, weekStart, range.end);

      await client.query('COMMIT');
      return reply.send({ invoices });
    } catch (err: any) {
      await client.query('ROLLBACK');
      req.log?.error?.(err);
      return reply.code(500).send({ error: 'internal_error' });
    } finally {
      client.release();
    }
  });

  app.post('/admin/pay-periods/:weekStart/lock', {
    config: {
      rateLimit: {
        max: 10,
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
    const adminId = req.user!.userId;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const payPeriod = await getOrCreatePayPeriod(client, weekStart, range.end);
      if (!payPeriod) {
        await client.query('ROLLBACK');
        return reply.code(500).send({ error: 'internal_error' });
      }
      if (payPeriod.status === 'LOCKED') {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'pay_period_locked' });
      }

      const pendingRes = await client.query(
        `select count(*) as pending
         from sessions
         where status = 'SUBMITTED'
           and date between $1::date and $2::date`,
        [weekStart, range.end]
      );
      if (Number(pendingRes.rows[0].pending) > 0) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'pending_sessions' });
      }

      const invoicesRes = await client.query(
        `select 1 from invoices where period_start = $1::date limit 1`,
        [weekStart]
      );
      if ((invoicesRes.rowCount ?? 0) === 0) {
        await generateInvoicesForWeek(client, weekStart, range.end);
      }

      const lockedRes = await client.query(
        `update pay_periods
         set status = 'LOCKED', locked_at = now(), locked_by_user_id = $2
         where period_start_date = $1::date
         returning id, status, locked_at, locked_by_user_id`,
        [weekStart, adminId]
      );

      await client.query('COMMIT');
      return reply.send({ payPeriod: lockedRes.rows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK');
      req.log?.error?.(err);
      return reply.code(500).send({ error: 'internal_error' });
    } finally {
      client.release();
    }
  });

  app.post('/admin/pay-periods/:weekStart/adjustments', {
    config: {
      rateLimit: {
        max: 10,
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

    const range = getPayPeriodRange(weekStart);
    const adminId = req.user!.userId;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const tutorRes = await client.query(`select 1 from tutor_profiles where id = $1`, [parsed.data.tutorId]);
      if (tutorRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'tutor_not_found' });
      }

      if (parsed.data.relatedSessionId) {
        const sessionRes = await client.query(
          `select 1 from sessions
           where id = $1 and tutor_id = $2
             and date between $3::date and $4::date`,
          [parsed.data.relatedSessionId, parsed.data.tutorId, weekStart, range.end]
        );
        if (sessionRes.rowCount === 0) {
          await client.query('ROLLBACK');
          return reply.code(400).send({ error: 'related_session_invalid' });
        }
      }

      const payPeriod = await getOrCreatePayPeriod(client, weekStart, range.end);
      if (!payPeriod) {
        await client.query('ROLLBACK');
        return reply.code(500).send({ error: 'internal_error' });
      }

      const res = await client.query(
        `insert into adjustments
         (tutor_id, pay_period_id, type, amount, reason, status, created_by_user_id, approved_by_user_id, approved_at, related_session_id)
         values ($1, $2, $3, $4, $5, 'APPROVED', $6, $6, now(), $7)
         returning *`,
        [
          parsed.data.tutorId,
          payPeriod.id,
          parsed.data.type,
          parsed.data.amount,
          parsed.data.reason,
          adminId,
          parsed.data.relatedSessionId ?? null
        ]
      );

      await client.query('COMMIT');
      const adjustment = res.rows[0];
      return reply.code(201).send({
        adjustment: {
          ...adjustment,
          signed_amount: getSignedAmount(adjustment.type, Number(adjustment.amount))
        }
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
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

    const res = await pool.query(
      `select a.*, t.full_name as tutor_name
       from adjustments a
       join pay_periods p on p.id = a.pay_period_id
       join tutor_profiles t on t.id = a.tutor_id
       where p.period_start_date = $1::date
       order by a.created_at asc`,
      [weekStart]
    );

    const adjustments = res.rows.map((row) => ({
      ...row,
      signed_amount: getSignedAmount(row.type, Number(row.amount))
    }));

    return reply.send({ adjustments });
  });

  app.delete('/admin/adjustments/:id', async (req, reply) => {
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
    const reason = parsed.data.reason ?? 'deleted_by_admin';

    const res = await pool.query(
      `select a.id, p.status
       from adjustments a
       join pay_periods p on p.id = a.pay_period_id
       where a.id = $1`,
      [adjustmentId]
    );

    if (res.rowCount === 0) return reply.code(404).send({ error: 'adjustment_not_found' });
    if (res.rows[0].status === 'LOCKED') return reply.code(409).send({ error: 'pay_period_locked' });

    const updateRes = await pool.query(
      `update adjustments
       set voided_at = now(), voided_by_user_id = $2, void_reason = $3
       where id = $1 and voided_at is null
       returning id, voided_at, voided_by_user_id`,
      [adjustmentId, adminId, reason]
    );

    if (updateRes.rowCount === 0) return reply.code(409).send({ error: 'adjustment_already_voided' });
    return reply.send({ adjustment: updateRes.rows[0] });
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
