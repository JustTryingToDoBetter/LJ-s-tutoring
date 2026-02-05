import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { normalizeEmail } from '../lib/security.js';
import {
  AssignmentSchema,
  CreateStudentSchema,
  CreateTutorSchema,
  PayrollGenerateSchema,
  RejectSessionSchema,
  UpdateAssignmentSchema,
  UpdateStudentSchema,
  UpdateTutorSchema
} from '../lib/schemas.js';
import { requireAdmin } from '../lib/rbac.js';

function addDays(start: Date, days: number) {
  const d = new Date(start);
  d.setDate(d.getDate() + days);
  return d;
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

    const weekStart = new Date(parsed.data.weekStart + 'T00:00:00Z');
    const weekEnd = addDays(weekStart, 6);

    const existing = await pool.query(
      `select 1 from invoices where period_start = $1::date`,
      [parsed.data.weekStart]
    );
    if ((existing.rowCount ?? 0) > 0) return reply.code(409).send({ error: 'invoices_already_generated' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const tutorsRes = await client.query(
        `select distinct s.tutor_id, t.full_name, t.default_hourly_rate
         from sessions s
         join tutor_profiles t on t.id = s.tutor_id
         where s.status = 'APPROVED'
           and s.date between $1::date and $2::date`,
        [parsed.data.weekStart, weekEnd.toISOString().slice(0, 10)]
      );

      const invoices = [] as any[];

      for (const tutor of tutorsRes.rows) {
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
          [tutor.tutor_id, parsed.data.weekStart, tutor.default_hourly_rate, weekEnd.toISOString().slice(0, 10)]
        );

        if (linesRes.rowCount === 0) continue;

        const invoiceNumber = `INV-${parsed.data.weekStart.replaceAll('-', '')}-${String(tutor.tutor_id).slice(0, 8)}`;
        let totalAmount = 0;

        const lineValues = linesRes.rows.map((line: any) => {
          const amount = (Number(line.duration_minutes) / 60) * Number(line.rate);
          totalAmount += amount;
          return {
            sessionId: line.id,
            description: `${line.subject} - ${line.student_name} (${line.date.toISOString().slice(0, 10)} ${line.start_time}-${line.end_time})`,
            minutes: line.duration_minutes,
            rate: Number(line.rate),
            amount
          };
        });

        const invoiceRes = await client.query(
          `insert into invoices (tutor_id, period_start, period_end, invoice_number, total_amount, status)
           values ($1, $2::date, $3::date, $4, $5, 'ISSUED')
           returning id, invoice_number, total_amount`,
          [tutor.tutor_id, parsed.data.weekStart, weekEnd.toISOString().slice(0, 10), invoiceNumber, totalAmount]
        );

        const invoiceId = invoiceRes.rows[0].id as string;

        for (const line of lineValues) {
          await client.query(
            `insert into invoice_lines (invoice_id, session_id, description, minutes, rate, amount)
             values ($1, $2, $3, $4, $5, $6)`,
            [invoiceId, line.sessionId, line.description, line.minutes, line.rate, line.amount]
          );
        }

        invoices.push(invoiceRes.rows[0]);
      }

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

  app.get('/admin/payroll/week/:weekStart.csv', async (req, reply) => {
    const weekStart = (req.params as { weekStart: string }).weekStart;
    const weekEnd = addDays(new Date(weekStart + 'T00:00:00Z'), 6).toISOString().slice(0, 10);

    const res = await pool.query(
      `select i.invoice_number, i.period_start, i.period_end, i.total_amount,
              t.full_name as tutor_name,
              l.session_id, l.description, l.minutes, l.rate, l.amount
       from invoices i
       join tutor_profiles t on t.id = i.tutor_id
       join invoice_lines l on l.invoice_id = i.id
       where i.period_start = $1::date
       order by t.full_name asc, i.invoice_number asc`,
      [weekStart]
    );

    const header = 'invoice_number,period_start,period_end,tutor_name,session_id,description,minutes,rate,amount,total_amount';
    const lines = res.rows.map((row) => {
      const safe = (value: any) => String(value ?? '').replaceAll('"', '""');
      return [
        row.invoice_number,
        row.period_start.toISOString().slice(0, 10),
        row.period_end.toISOString().slice(0, 10),
        safe(row.tutor_name),
        row.session_id,
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
