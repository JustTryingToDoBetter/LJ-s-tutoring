import { pool } from '../db/pool.js';

type Queryable = {
  query: (text: string, params?: any[]) => Promise<any>;
};

export async function exportTutorData(client: Queryable, tutorId: string) {
  const tutorRes = await client.query(
    `select t.id, t.full_name, t.phone, t.default_hourly_rate, t.active
     from tutor_profiles t
     where t.id = $1`,
    [tutorId]
  );

  const userRes = await client.query(
    `select id, email, role, is_active, created_at
     from users where tutor_profile_id = $1`,
    [tutorId]
  );

  const assignmentsRes = await client.query(
    `select * from assignments where tutor_id = $1 order by start_date desc`,
    [tutorId]
  );

  const sessionsRes = await client.query(
    `select * from sessions where tutor_id = $1 order by date desc, start_time desc`,
    [tutorId]
  );

  const sessionIds = sessionsRes.rows.map((row) => row.id);
  const historyRes = sessionIds.length
    ? await client.query(
        `select * from session_history where session_id = any($1::uuid[]) order by created_at desc`,
        [sessionIds]
      )
    : { rows: [] };

  const invoicesRes = await client.query(
    `select * from invoices where tutor_id = $1 order by period_start desc`,
    [tutorId]
  );

  const invoiceIds = invoicesRes.rows.map((row) => row.id);
  const invoiceLinesRes = invoiceIds.length
    ? await client.query(
        `select * from invoice_lines where invoice_id = any($1::uuid[]) order by id asc`,
        [invoiceIds]
      )
    : { rows: [] };

  const adjustmentsRes = await client.query(
    `select * from adjustments where tutor_id = $1 order by created_at desc`,
    [tutorId]
  );

  return {
    tutorProfile: tutorRes.rows[0] ?? null,
    user: userRes.rows[0] ?? null,
    assignments: assignmentsRes.rows,
    sessions: sessionsRes.rows,
    sessionHistory: historyRes.rows,
    invoices: invoicesRes.rows,
    invoiceLines: invoiceLinesRes.rows,
    adjustments: adjustmentsRes.rows
  };
}

export async function exportStudentData(client: Queryable, studentId: string) {
  const studentRes = await client.query(
    `select * from students where id = $1`,
    [studentId]
  );

  const assignmentsRes = await client.query(
    `select * from assignments where student_id = $1 order by start_date desc`,
    [studentId]
  );

  const sessionsRes = await client.query(
    `select * from sessions where student_id = $1 order by date desc, start_time desc`,
    [studentId]
  );

  const sessionIds = sessionsRes.rows.map((row) => row.id);
  const historyRes = sessionIds.length
    ? await client.query(
        `select * from session_history where session_id = any($1::uuid[]) order by created_at desc`,
        [sessionIds]
      )
    : { rows: [] };

  return {
    student: studentRes.rows[0] ?? null,
    assignments: assignmentsRes.rows,
    sessions: sessionsRes.rows,
    sessionHistory: historyRes.rows
  };
}

export async function anonymizeTutor(client: Queryable, tutorId: string) {
  const anonymizedEmail = `anonymized+${tutorId}@example.invalid`;

  await client.query(
    `update tutor_profiles
     set full_name = 'Anonymized Tutor', phone = null, active = false
     where id = $1`,
    [tutorId]
  );

  await client.query(
    `update users
     set email = $1, is_active = false
     where tutor_profile_id = $2`,
    [anonymizedEmail, tutorId]
  );

  await client.query(
    `update sessions
     set notes = null, location = null
     where tutor_id = $1`,
    [tutorId]
  );

  await client.query(
    `update session_history
     set before_json = case when before_json is null then null else before_json - 'notes' - 'location' end,
         after_json = case when after_json is null then null else after_json - 'notes' - 'location' end
     where session_id in (select id from sessions where tutor_id = $1)`,
    [tutorId]
  );

  await client.query(
    `update invoice_lines
     set description = 'Session (anonymized)'
     where session_id in (select id from sessions where tutor_id = $1)
       and line_type = 'SESSION'`,
    [tutorId]
  );
}

export async function anonymizeStudent(client: Queryable, studentId: string) {
  await client.query(
    `update students
     set full_name = 'Anonymized Student', grade = null, guardian_name = null,
         guardian_phone = null, notes = null, is_active = false
     where id = $1`,
    [studentId]
  );

  await client.query(
    `update sessions
     set notes = null, location = null
     where student_id = $1`,
    [studentId]
  );

  await client.query(
    `update session_history
     set before_json = case when before_json is null then null else before_json - 'notes' - 'location' end,
         after_json = case when after_json is null then null else after_json - 'notes' - 'location' end
     where session_id in (select id from sessions where student_id = $1)`,
    [studentId]
  );

  await client.query(
    `update invoice_lines
     set description = 'Session (anonymized)'
     where session_id in (select id from sessions where student_id = $1)
       and line_type = 'SESSION'`,
    [studentId]
  );
}

export async function withDb<T>(fn: (client: Queryable) => Promise<T>) {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
