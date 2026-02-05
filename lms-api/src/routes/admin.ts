import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { normalizeEmail } from '../lib/security.js';
import {
  AssignmentSchema,
  CreateStudentSchema,
  CreateTutorSchema,
  AdjustmentCreateSchema,
  PayrollGenerateSchema,
  RejectSessionSchema,
  UpdateAssignmentSchema,
  UpdateStudentSchema,
  UpdateTutorSchema
} from '../lib/schemas.js';
import { requireAdmin } from '../lib/rbac.js';
import { getPayPeriodRange, getPayPeriodStart } from '../lib/pay-periods.js';
import { isWithinAssignmentWindow } from '../lib/scheduling.js';

const weekStartPattern = /^\d{4}-\d{2}-\d{2}$/;

function toDateString(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getSignedAmount(type: string, amount: number) {
  return type === 'PENALTY' ? -Math.abs(amount) : Math.abs(amount);
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireAdmin);

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

  const ensureWeekStart = (value: string) => (weekStartPattern.test(value) ? value : null);

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
      pool.query(`select count(*) from students where active = true`),
      pool.query(`select status, count(*) from sessions group by status`)
    ]);

    return reply.send({
      tutors: Number(tutors.rows[0].count),
      students: Number(students.rows[0].count),
      sessions: sessions.rows
    });
  });

  app.post('/admin/tutors', async (req, reply) => {
    const parsed = CreateTutorSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const email = normalizeEmail(parsed.data.email);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const tutorRes = await client.query(
        `insert into tutor_profiles (full_name, phone, default_hourly_rate, active)
         values ($1, $2, $3, $4)
         returning id, full_name, phone, default_hourly_rate, active`,
        [parsed.data.fullName, parsed.data.phone ?? null, parsed.data.defaultHourlyRate, parsed.data.active]
      );

      const tutorId = tutorRes.rows[0].id as string;

      const userRes = await client.query(
        `insert into users (email, role, tutor_profile_id)
         values ($1, 'TUTOR', $2)
         returning id, email, role, tutor_profile_id`,
        [email, tutorId]
      );

      await client.query('COMMIT');
      return reply.code(201).send({ tutor: tutorRes.rows[0], user: userRes.rows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err?.code === '23505') return reply.code(409).send({ error: 'email_already_exists' });
      req.log?.error?.(err);
      return reply.code(500).send({ error: 'internal_error' });
    } finally {
      client.release();
    }
  });

  app.get('/admin/tutors', async (_req, reply) => {
    const res = await pool.query(
      `select t.id, t.full_name, t.phone, t.default_hourly_rate, t.active, u.email
       from tutor_profiles t
       left join users u on u.tutor_profile_id = t.id
       order by t.full_name asc`
    );
    return reply.send({ tutors: res.rows });
  });

  app.patch('/admin/tutors/:id', async (req, reply) => {
    const tutorId = (req.params as { id: string }).id;
    const parsed = UpdateTutorSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const currentRes = await pool.query(`select * from tutor_profiles where id = $1`, [tutorId]);
    if (currentRes.rowCount === 0) return reply.code(404).send({ error: 'tutor_not_found' });
    const current = currentRes.rows[0];

    const res = await pool.query(
      `update tutor_profiles
       set full_name = $1,
           phone = $2,
           default_hourly_rate = $3,
           active = $4
       where id = $5
       returning id, full_name, phone, default_hourly_rate, active`,
      [
        parsed.data.fullName ?? current.full_name,
        parsed.data.phone ?? current.phone,
        parsed.data.defaultHourlyRate ?? current.default_hourly_rate,
        parsed.data.active ?? current.active,
        tutorId
      ]
    );

    return reply.send({ tutor: res.rows[0] });
  });

  app.post('/admin/students', async (req, reply) => {
    const parsed = CreateStudentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const res = await pool.query(
      `insert into students (full_name, grade, guardian_name, guardian_phone, notes, active)
       values ($1, $2, $3, $4, $5, $6)
       returning id, full_name, grade, guardian_name, guardian_phone, notes, active`,
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

  app.get('/admin/students', async (_req, reply) => {
    const res = await pool.query(
      `select id, full_name, grade, guardian_name, guardian_phone, notes, active
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
           active = $6
       where id = $7
       returning id, full_name, grade, guardian_name, guardian_phone, notes, active`,
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
    const { status, from, to } = req.query as { status?: string; from?: string; to?: string };

    const params: any[] = [];
    const filters: string[] = [];

    if (status) {
      params.push(status);
      filters.push(`s.status = $${params.length}`);
    }
    if (from) {
      params.push(from);
      filters.push(`s.date >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      filters.push(`s.date <= $${params.length}::date`);
    }

    const where = filters.length ? `where ${filters.join(' and ')}` : '';
    const res = await pool.query(
      `select s.*, t.full_name as tutor_name, st.full_name as student_name
       from sessions s
       join tutor_profiles t on t.id = s.tutor_id
       join students st on st.id = s.student_id
       ${where}
       order by s.date desc, s.start_time desc`,
      params
    );

    return reply.send({ sessions: res.rows });
  });

  app.post('/admin/sessions/:id/approve', async (req, reply) => {
    const sessionId = (req.params as { id: string }).id;
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

    return reply.send({ session: updatedRes.rows[0] });
  });

  app.post('/admin/sessions/:id/reject', async (req, reply) => {
    const sessionId = (req.params as { id: string }).id;
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

    return reply.send({ session: updatedRes.rows[0] });
  });

  app.post('/admin/payroll/generate-week', async (req, reply) => {
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

  app.post('/admin/pay-periods/:weekStart/lock', async (req, reply) => {
    const weekStartParam = (req.params as { weekStart: string }).weekStart;
    const weekStart = ensureWeekStart(weekStartParam);
    if (!weekStart) return reply.code(400).send({ error: 'invalid_week_start' });

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

  app.post('/admin/pay-periods/:weekStart/adjustments', async (req, reply) => {
    const weekStartParam = (req.params as { weekStart: string }).weekStart;
    const weekStart = ensureWeekStart(weekStartParam);
    if (!weekStart) return reply.code(400).send({ error: 'invalid_week_start' });

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
    const weekStartParam = (req.params as { weekStart: string }).weekStart;
    const weekStart = ensureWeekStart(weekStartParam);
    if (!weekStart) return reply.code(400).send({ error: 'invalid_week_start' });

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
    const adjustmentId = (req.params as { id: string }).id;
    const adminId = req.user!.userId;
    const reason = (req.body as { reason?: string } | undefined)?.reason ?? 'deleted_by_admin';

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

  app.get('/admin/payroll/week/:weekStart.csv', async (req, reply) => {
    const weekStart = (req.params as { weekStart: string }).weekStart;

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

  app.get('/admin/integrity/pay-period/:weekStart', async (req, reply) => {
    const weekStartParam = (req.params as { weekStart: string }).weekStart;
    const weekStart = ensureWeekStart(weekStartParam);
    if (!weekStart) return reply.code(400).send({ error: 'invalid_week_start' });

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
    const invoiceId = (req.params as { id: string }).id;
    const res = await pool.query(
      `update invoices set status = 'PAID' where id = $1 returning id, status`,
      [invoiceId]
    );
    if (res.rowCount === 0) return reply.code(404).send({ error: 'invoice_not_found' });
    return reply.send({ invoice: res.rows[0] });
  });
}
