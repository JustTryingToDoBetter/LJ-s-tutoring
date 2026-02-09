import { getRetentionConfig, getRetentionCutoffs } from './retention.js';
import { anonymizeStudent, anonymizeTutor } from './privacy.js';

type Queryable = {
  query: (text: string, params?: any[]) => Promise<any>;
};

export type RetentionSummary = {
  magicLinkTokensDeleted: number;
  auditLogsDeleted: number;
  sessionHistoryDeleted: number;
  sessionsDeleted: number;
  invoiceLinesDeleted: number;
  invoicesDeleted: number;
  adjustmentsDeleted: number;
  payPeriodsDeleted: number;
  tutorsAnonymized: number;
  studentsAnonymized: number;
  privacyRequestsDeleted: number;
};

export type RetentionEvent = {
  id: string;
  ranAt: Date;
};

export async function runRetentionCleanup(client: Queryable, now = new Date()) {
  const config = getRetentionConfig();
  const cutoffs = getRetentionCutoffs(now);

  const summary: RetentionSummary = {
    magicLinkTokensDeleted: 0,
    auditLogsDeleted: 0,
    sessionHistoryDeleted: 0,
    sessionsDeleted: 0,
    invoiceLinesDeleted: 0,
    invoicesDeleted: 0,
    adjustmentsDeleted: 0,
    payPeriodsDeleted: 0,
    tutorsAnonymized: 0,
    studentsAnonymized: 0,
    privacyRequestsDeleted: 0
  };

  const magicRes = await client.query(
    `delete from magic_link_tokens where expires_at < $1 returning id`,
    [cutoffs.magicLinkBefore]
  );
  summary.magicLinkTokensDeleted = magicRes.rowCount ?? 0;

  const auditRes = await client.query(
    `delete from audit_log where created_at < $1 returning id`,
    [cutoffs.auditBefore]
  );
  summary.auditLogsDeleted = auditRes.rowCount ?? 0;

  const privacyRes = await client.query(
    `delete from privacy_requests where created_at < $1 returning id`,
    [cutoffs.privacyRequestsBefore]
  );
  summary.privacyRequestsDeleted = privacyRes.rowCount ?? 0;

  const historyRes = await client.query(
    `delete from session_history where created_at < $1 returning id`,
    [cutoffs.sessionHistoryBefore]
  );
  summary.sessionHistoryDeleted = historyRes.rowCount ?? 0;

  const oldInvoiceLinesRes = await client.query(
    `delete from invoice_lines
     where invoice_id in (
       select id from invoices where period_end < $1::date
     ) returning id`,
    [cutoffs.invoicesBefore]
  );
  summary.invoiceLinesDeleted = oldInvoiceLinesRes.rowCount ?? 0;

  const oldInvoicesRes = await client.query(
    `delete from invoices where period_end < $1::date returning id`,
    [cutoffs.invoicesBefore]
  );
  summary.invoicesDeleted = oldInvoicesRes.rowCount ?? 0;

  const adjustmentsRes = await client.query(
    `delete from adjustments
     where created_at < $1
       and id not in (select adjustment_id from invoice_lines where adjustment_id is not null)
     returning id`,
    [cutoffs.invoicesBefore]
  );
  summary.adjustmentsDeleted = adjustmentsRes.rowCount ?? 0;

  const payPeriodsRes = await client.query(
    `delete from pay_periods
     where period_end_date < $1::date
       and id not in (select pay_period_id from adjustments)
     returning id`,
    [cutoffs.invoicesBefore]
  );
  summary.payPeriodsDeleted = payPeriodsRes.rowCount ?? 0;

  const sessionsRes = await client.query(
    `delete from sessions
     where date < $1::date
       and id not in (select session_id from invoice_lines where session_id is not null)
     returning id`,
    [cutoffs.sessionsBefore]
  );
  summary.sessionsDeleted = sessionsRes.rowCount ?? 0;

  const tutorCandidates = await client.query(
    `select t.id
     from tutor_profiles t
     left join sessions s on s.tutor_id = t.id
     left join invoices i on i.tutor_id = t.id
     group by t.id
     having max(coalesce(s.date, '1900-01-01'::date)) < $1::date
        and max(coalesce(i.period_end, '1900-01-01'::date)) < $2::date`,
    [cutoffs.sessionsBefore, cutoffs.invoicesBefore]
  );

  for (const row of tutorCandidates.rows) {
    await anonymizeTutor(client, row.id);
    summary.tutorsAnonymized += 1;
  }

  const studentCandidates = await client.query(
    `select st.id
     from students st
     left join sessions s on s.student_id = st.id
     group by st.id
     having max(coalesce(s.date, '1900-01-01'::date)) < $1::date`,
    [cutoffs.sessionsBefore]
  );

  for (const row of studentCandidates.rows) {
    await anonymizeStudent(client, row.id);
    summary.studentsAnonymized += 1;
  }

  const eventRes = await client.query(
    `insert into retention_events (config_json, cutoffs_json, summary_json)
     values ($1::jsonb, $2::jsonb, $3::jsonb)
     returning id, ran_at`,
    [JSON.stringify(config), JSON.stringify(cutoffs), JSON.stringify(summary)]
  );

  const event: RetentionEvent = {
    id: eventRes.rows[0].id,
    ranAt: eventRes.rows[0].ran_at
  };

  return { config, cutoffs, summary, event };
}
