import type { DbClient } from '../shared/types.js';

export function getSignedAmount(type: string, amount: number) {
  return type === 'PENALTY' ? -Math.abs(amount) : Math.abs(amount);
}

export async function getOrCreatePayPeriod(client: DbClient, weekStart: string, weekEnd: string) {
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
}

export async function generateInvoicesForWeek(client: DbClient, weekStart: string, weekEnd: string) {
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
}
