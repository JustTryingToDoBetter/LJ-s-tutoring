type Queryable = {
  query: (text: string, params?: any[]) => Promise<any>;
};

export async function buildPayrollCsv(client: Queryable, weekStart: string) {
  const res = await client.query(
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

  return [header, ...lines].join('\n');
}
