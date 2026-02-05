import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole, requireTutorSelfScope } from '../lib/rbac.js';
import { CreateSessionSchema, DateRangeQuerySchema, IdParamSchema, TutorSessionsQuerySchema, UpdateSessionSchema } from '../lib/schemas.js';
import { durationMinutes, isWithinAssignmentWindow } from '../lib/scheduling.js';
import { buildInvoicePdf, renderInvoiceHtml } from '../lib/invoices.js';
import { getPayPeriodStart } from '../lib/pay-periods.js';

export async function tutorRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireRole('TUTOR'));

  const normalizeJson = (value: any, fallback: any) => {
    if (value == null) return fallback;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return fallback;
      }
    }
    return value;
  };

  const toDateString = (value: Date) => value.toISOString().slice(0, 10);

  const isDateLocked = async (dateValue: string) => {
    const weekStart = getPayPeriodStart(dateValue);
    const res = await pool.query(
      `select status from pay_periods where period_start_date = $1::date`,
      [weekStart]
    );
    return res.rowCount > 0 && res.rows[0].status === 'LOCKED';
  };

  const getSignedAmount = (type: string, amount: number) =>
    type === 'PENALTY' ? -Math.abs(amount) : Math.abs(amount);

  app.get('/tutor/me', async (req, reply) => {
    const userId = req.user!.userId;
    const res = await pool.query(
      `select u.id, u.email, u.role, t.id as tutor_id, t.full_name, t.phone, t.default_hourly_rate, t.active
       from users u
       join tutor_profiles t on t.id = u.tutor_profile_id
       where u.id = $1`,
      [userId]
    );

    if (res.rowCount === 0) return reply.code(404).send({ error: 'user_not_found' });
    return reply.send({ me: res.rows[0] });
  });

  app.get('/tutor/assignments', async (req, reply) => {
    const tutorId = req.user!.tutorId!;
    const res = await pool.query(
      `select a.id, a.subject, a.start_date, a.end_date, a.rate_override, a.allowed_days_json, a.allowed_time_ranges_json, a.active,
              s.id as student_id, s.full_name, s.grade
       from assignments a
       join students s on s.id = a.student_id
       where a.tutor_id = $1
       order by a.start_date desc`,
      [tutorId]
    );

    return reply.send({ assignments: res.rows });
  });

  app.get('/tutor/students', async (req, reply) => {
    const tutorId = req.user!.tutorId!;
    const res = await pool.query(
      `select distinct s.id, s.full_name, s.grade, s.active
       from assignments a
       join students s on s.id = a.student_id
       where a.tutor_id = $1 and a.active = true and s.active = true
       order by s.full_name asc`,
      [tutorId]
    );

    return reply.send({ students: res.rows });
  });

  app.get('/tutor/sessions', async (req, reply) => {
    const tutorId = req.user!.tutorId!;
    const parsed = TutorSessionsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const { from, to, status } = parsed.data;

    const params: any[] = [tutorId];
    const filters: string[] = ['s.tutor_id = $1'];

    if (from) {
      params.push(from);
      filters.push(`s.date >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      filters.push(`s.date <= $${params.length}::date`);
    }
    if (status) {
      params.push(status);
      filters.push(`s.status = $${params.length}`);
    }

    const res = await pool.query(
      `select s.id, s.assignment_id, s.student_id, s.date, s.start_time, s.end_time, s.duration_minutes, s.mode, s.location,
              s.notes, s.status, s.created_at, s.submitted_at, s.approved_at,
              st.full_name as student_name
       from sessions s
       join students st on st.id = s.student_id
       where ${filters.join(' and ')}
       order by s.date desc, s.start_time desc`,
      params
    );

    return reply.send({ sessions: res.rows });
  });

  app.post('/tutor/sessions', async (req, reply) => {
    const tutorId = req.user!.tutorId!;
    const parsed = CreateSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const { assignmentId, studentId, date, startTime, endTime, mode, location, notes, idempotencyKey } = parsed.data;

    const assignmentRes = await pool.query(
      `select id, tutor_id, student_id, start_date, end_date, allowed_days_json, allowed_time_ranges_json, active
       from assignments
       where id = $1`,
      [assignmentId]
    );

    if (assignmentRes.rowCount === 0) return reply.code(404).send({ error: 'assignment_not_found' });
    const assignment = assignmentRes.rows[0];
    if (!requireTutorSelfScope(req, reply, assignment.tutor_id)) return reply;
    if (assignment.student_id !== studentId) return reply.code(400).send({ error: 'student_mismatch' });
    if (!assignment.active) return reply.code(409).send({ error: 'assignment_inactive' });

    if (await isDateLocked(date)) return reply.code(409).send({ error: 'pay_period_locked' });

    const allowedDays = normalizeJson(assignment.allowed_days_json, []);
    const allowedTimeRanges = normalizeJson(assignment.allowed_time_ranges_json, []);

    const okWindow = isWithinAssignmentWindow(date, startTime, endTime, {
      startDate: new Date(assignment.start_date).toISOString().slice(0, 10),
      endDate: assignment.end_date ? new Date(assignment.end_date).toISOString().slice(0, 10) : null,
      allowedDays,
      allowedTimeRanges
    });

    if (!okWindow) return reply.code(400).send({ error: 'outside_assignment_window' });

    const minutes = durationMinutes(startTime, endTime);
    if (minutes <= 0) return reply.code(400).send({ error: 'invalid_duration_minutes' });

    const overlap = await pool.query(
      `select 1 from sessions
       where tutor_id = $1 and date = $2::date
       and not (end_time <= $3::time or start_time >= $4::time)
       limit 1`,
      [tutorId, date, startTime, endTime]
    );

    if (overlap.rowCount > 0) return reply.code(409).send({ error: 'overlapping_session' });

    if (idempotencyKey) {
      const existingRes = await pool.query(
        `select * from sessions where tutor_id = $1 and sync_key = $2 limit 1`,
        [tutorId, idempotencyKey]
      );
      if (existingRes.rowCount > 0) {
        return reply.send({ session: existingRes.rows[0], deduped: true });
      }
    }

    const res = await pool.query(
      `insert into sessions
       (tutor_id, student_id, assignment_id, date, start_time, end_time, duration_minutes, mode, location, notes, status, sync_key)
       values ($1, $2, $3, $4::date, $5::time, $6::time, $7, $8, $9, $10, 'DRAFT', $11)
       returning *`,
      [tutorId, studentId, assignmentId, date, startTime, endTime, minutes, mode, location ?? null, notes ?? null, idempotencyKey ?? null]
    );

    return reply.code(201).send({ session: res.rows[0] });
  });

  app.patch('/tutor/sessions/:id', async (req, reply) => {
    const tutorId = req.user!.tutorId!;
    const params = IdParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }
    const sessionId = params.data.id;

    const parsed = UpdateSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const currentRes = await pool.query(
      `select * from sessions where id = $1 and tutor_id = $2`,
      [sessionId, tutorId]
    );

    if (currentRes.rowCount === 0) return reply.code(404).send({ error: 'session_not_found' });
    const current = currentRes.rows[0];
    if (current.status !== 'DRAFT') return reply.code(409).send({ error: 'only_draft_editable' });

    const date = parsed.data.date ?? new Date(current.date).toISOString().slice(0, 10);
    const startTime = parsed.data.startTime ?? current.start_time;
    const endTime = parsed.data.endTime ?? current.end_time;
    const minutes = durationMinutes(startTime, endTime);
    if (minutes <= 0) return reply.code(400).send({ error: 'invalid_duration_minutes' });

    if (await isDateLocked(date)) return reply.code(409).send({ error: 'pay_period_locked' });

    const assignmentRes = await pool.query(
      `select start_date, end_date, allowed_days_json, allowed_time_ranges_json, active
       from assignments where id = $1`,
      [current.assignment_id]
    );

    if (assignmentRes.rowCount === 0) return reply.code(404).send({ error: 'assignment_not_found' });
    const assignment = assignmentRes.rows[0];
    if (!assignment.active) return reply.code(409).send({ error: 'assignment_inactive' });

    const okWindow = isWithinAssignmentWindow(date, startTime, endTime, {
      startDate: new Date(assignment.start_date).toISOString().slice(0, 10),
      endDate: assignment.end_date ? new Date(assignment.end_date).toISOString().slice(0, 10) : null,
      allowedDays: normalizeJson(assignment.allowed_days_json, []),
      allowedTimeRanges: normalizeJson(assignment.allowed_time_ranges_json, [])
    });

    if (!okWindow) return reply.code(400).send({ error: 'outside_assignment_window' });

    const overlap = await pool.query(
      `select 1 from sessions
       where tutor_id = $1 and date = $2::date and id <> $3
       and not (end_time <= $4::time or start_time >= $5::time)
       limit 1`,
      [tutorId, date, sessionId, startTime, endTime]
    );

    if (overlap.rowCount > 0) return reply.code(409).send({ error: 'overlapping_session' });

    const beforeJson = { ...current };

    const updatedRes = await pool.query(
      `update sessions
       set date = $1::date,
           start_time = $2::time,
           end_time = $3::time,
           duration_minutes = $4,
           mode = $5,
           location = $6,
           notes = $7
       where id = $8
       returning *`,
      [
        date,
        startTime,
        endTime,
        minutes,
        parsed.data.mode ?? current.mode,
        parsed.data.location ?? current.location,
        parsed.data.notes ?? current.notes,
        sessionId
      ]
    );

    const afterJson = { ...updatedRes.rows[0] };
    await pool.query(
      `insert into session_history (session_id, changed_by_user_id, change_type, before_json, after_json)
       values ($1, $2, 'edit', $3, $4)`,
      [sessionId, req.user!.userId, beforeJson, afterJson]
    );

    return reply.send({ session: updatedRes.rows[0] });
  });

  app.post('/tutor/sessions/:id/submit', async (req, reply) => {
    const tutorId = req.user!.tutorId!;
    const params = IdParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }
    const sessionId = params.data.id;

    const currentRes = await pool.query(
      `select * from sessions where id = $1 and tutor_id = $2`,
      [sessionId, tutorId]
    );

    if (currentRes.rowCount === 0) return reply.code(404).send({ error: 'session_not_found' });
    const current = currentRes.rows[0];
    if (current.status !== 'DRAFT') return reply.code(409).send({ error: 'only_draft_submittable' });

    if (await isDateLocked(toDateString(current.date))) {
      return reply.code(409).send({ error: 'pay_period_locked' });
    }

    const updatedRes = await pool.query(
      `update sessions
       set status = 'SUBMITTED', submitted_at = now()
       where id = $1
       returning *`,
      [sessionId]
    );

    await pool.query(
      `insert into session_history (session_id, changed_by_user_id, change_type, before_json, after_json)
       values ($1, $2, 'submit', $3, $4)`,
      [sessionId, req.user!.userId, current, updatedRes.rows[0]]
    );

    return reply.send({ session: updatedRes.rows[0] });
  });

  app.get('/tutor/payroll/weeks', async (req, reply) => {
    const tutorId = req.user!.tutorId!;
    const parsed = DateRangeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const { from, to } = parsed.data;

    const params: any[] = [tutorId];
    const filters: string[] = [`s.tutor_id = $1`, `s.status = 'APPROVED'`];

    if (from) {
      params.push(from);
      filters.push(`s.date >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      filters.push(`s.date <= $${params.length}::date`);
    }

    const sessionRes = await pool.query(
      `select date_trunc('week', s.date)::date as week_start,
              sum(s.duration_minutes) as total_minutes,
              sum((s.duration_minutes / 60.0) * coalesce(a.rate_override, t.default_hourly_rate)) as total_amount
       from sessions s
       join assignments a on a.id = s.assignment_id
       join tutor_profiles t on t.id = s.tutor_id
       where ${filters.join(' and ')}
       group by 1
       order by 1 desc`,
      params
    );

    const adjParams: any[] = [tutorId];
    const adjFilters: string[] = ['a.tutor_id = $1', `a.status = 'APPROVED'`, 'a.voided_at is null'];
    if (from) {
      adjParams.push(from);
      adjFilters.push(`p.period_start_date >= $${adjParams.length}::date`);
    }
    if (to) {
      adjParams.push(to);
      adjFilters.push(`p.period_start_date <= $${adjParams.length}::date`);
    }

    const adjustmentRes = await pool.query(
      `select p.period_start_date as week_start, a.type, a.amount, a.reason
       from adjustments a
       join pay_periods p on p.id = a.pay_period_id
       where ${adjFilters.join(' and ')}`,
      adjParams
    );

    const weeks = new Map<string, {
      week_start: string;
      total_minutes: number;
      total_amount: number;
      adjustments: Array<{ type: string; amount: number; reason: string; signed_amount: number }>;
      status: string;
    }>();

    for (const row of sessionRes.rows) {
      const weekStart = toDateString(row.week_start);
      weeks.set(weekStart, {
        week_start: weekStart,
        total_minutes: Number(row.total_minutes ?? 0),
        total_amount: Number(row.total_amount ?? 0),
        adjustments: [],
        status: 'OPEN'
      });
    }

    for (const row of adjustmentRes.rows) {
      const weekStart = toDateString(row.week_start);
      const signedAmount = getSignedAmount(row.type, Number(row.amount));
      const existing = weeks.get(weekStart) ?? {
        week_start: weekStart,
        total_minutes: 0,
        total_amount: 0,
        adjustments: [],
        status: 'OPEN'
      };

      existing.adjustments.push({
        type: row.type,
        amount: Number(row.amount),
        reason: row.reason,
        signed_amount: signedAmount
      });
      existing.total_amount += signedAmount;
      weeks.set(weekStart, existing);
    }

    const weekStarts = Array.from(weeks.keys());
    if (weekStarts.length > 0) {
      const statusRes = await pool.query(
        `select period_start_date, status from pay_periods
         where period_start_date = any($1::date[])`,
        [weekStarts]
      );

      for (const row of statusRes.rows) {
        const weekStart = toDateString(row.period_start_date);
        const entry = weeks.get(weekStart);
        if (entry) entry.status = row.status;
      }
    }

    const response = Array.from(weeks.values()).sort((a, b) => b.week_start.localeCompare(a.week_start));
    return reply.send({ weeks: response });
  });

  app.get('/tutor/invoices', async (req, reply) => {
    const tutorId = req.user!.tutorId!;
    const parsed = DateRangeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const { from, to } = parsed.data;

    const params: any[] = [tutorId];
    const filters: string[] = ['i.tutor_id = $1'];

    if (from) {
      params.push(from);
      filters.push(`i.period_start >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      filters.push(`i.period_end <= $${params.length}::date`);
    }

    const res = await pool.query(
      `select i.id, i.period_start, i.period_end, i.invoice_number, i.total_amount, i.status, i.created_at
       from invoices i
       where ${filters.join(' and ')}
       order by i.period_start desc`,
      params
    );

    return reply.send({ invoices: res.rows });
  });

  app.get('/tutor/invoices/:id', async (req, reply) => {
    const tutorId = req.user!.tutorId!;
    const params = IdParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }
    const invoiceId = params.data.id;

    const invoiceRes = await pool.query(
      `select i.id, i.invoice_number, i.period_start, i.period_end, i.total_amount,
              t.full_name
       from invoices i
       join tutor_profiles t on t.id = i.tutor_id
       where i.id = $1 and i.tutor_id = $2`,
      [invoiceId, tutorId]
    );

    if (invoiceRes.rowCount === 0) return reply.code(404).send({ error: 'invoice_not_found' });
    const invoice = invoiceRes.rows[0];

    const linesRes = await pool.query(
      `select description, minutes, rate, amount
       from invoice_lines
       where invoice_id = $1
       order by id asc`,
      [invoiceId]
    );

    const html = renderInvoiceHtml({
      invoiceNumber: invoice.invoice_number,
      tutorName: invoice.full_name,
      periodStart: invoice.period_start.toISOString().slice(0, 10),
      periodEnd: invoice.period_end.toISOString().slice(0, 10),
      totalAmount: String(invoice.total_amount),
      lines: linesRes.rows.map((line) => ({
        description: line.description,
        minutes: line.minutes,
        rate: String(line.rate),
        amount: String(line.amount)
      }))
    });

    return reply.type('text/html').send(html);
  });

  app.get('/tutor/invoices/:id.pdf', async (req, reply) => {
    const tutorId = req.user!.tutorId!;
    const params = IdParamSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_request', details: params.error.flatten() });
    }
    const invoiceId = params.data.id;

    const invoiceRes = await pool.query(
      `select i.id, i.invoice_number, i.period_start, i.period_end, i.total_amount,
              t.full_name
       from invoices i
       join tutor_profiles t on t.id = i.tutor_id
       where i.id = $1 and i.tutor_id = $2`,
      [invoiceId, tutorId]
    );

    if (invoiceRes.rowCount === 0) return reply.code(404).send({ error: 'invoice_not_found' });
    const invoice = invoiceRes.rows[0];

    const linesRes = await pool.query(
      `select description, minutes, rate, amount
       from invoice_lines
       where invoice_id = $1
       order by id asc`,
      [invoiceId]
    );

    const doc = buildInvoicePdf({
      invoiceNumber: invoice.invoice_number,
      tutorName: invoice.full_name,
      periodStart: invoice.period_start.toISOString().slice(0, 10),
      periodEnd: invoice.period_end.toISOString().slice(0, 10),
      totalAmount: String(invoice.total_amount),
      lines: linesRes.rows.map((line) => ({
        description: line.description,
        minutes: line.minutes,
        rate: String(line.rate),
        amount: String(line.amount)
      }))
    });

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
    doc.pipe(reply.raw);
    doc.end();
    return reply;
  });
}
