import { apiGet, qs, setActiveNav, escapeHtml } from '/assets/portal-shared.js';

export async function initRetention() {
  setActiveNav('retention');
  const configEl = qs('#retentionConfig');
  const eligibleEl = qs('#retentionEligible');
  const latestEl = qs('#retentionLatest');
  const latestMeta = qs('#retentionLatestMeta');

  const data = await apiGet('/admin/retention/summary');
  const config = data.config || {};
  const cutoffs = data.cutoffs || {};
  const eligible = data.eligible || {};
  const latest = data.latestEvent || null;

  const configRows = [
    ['Sessions', `${config.sessionsYears} years`, cutoffs.sessionsBefore],
    ['Session history', `${config.sessionHistoryYears} years`, cutoffs.sessionHistoryBefore],
    ['Invoices', `${config.invoicesYears} years`, cutoffs.invoicesBefore],
    ['Audit log', `${config.auditYears} years`, cutoffs.auditBefore],
    ['Magic link tokens', `${config.magicLinkDays} days`, cutoffs.magicLinkBefore],
    ['Privacy requests', `${config.privacyRequestsYears} years`, cutoffs.privacyRequestsBefore]
  ];

  if (configEl) {
    configEl.innerHTML = configRows.map((row) => {
      const label = escapeHtml(row[0]);
      const value = escapeHtml(String(row[1] ?? ''));
      const cutoff = row[2] ? escapeHtml(new Date(row[2]).toISOString()) : '-';
      return `<div class="panel">
        <div><strong>${label}</strong></div>
        <div class="note">Retention: ${value}</div>
        <div class="note">Cutoff: ${cutoff}</div>
      </div>`;
    }).join('');
  }

  if (eligibleEl) {
    eligibleEl.innerHTML = [
      ['Magic link tokens', eligible.magicLinkTokens],
      ['Audit log entries', eligible.auditLogs],
      ['Session history entries', eligible.sessionHistory],
      ['Invoices', eligible.invoices],
      ['Sessions', eligible.sessions],
      ['Privacy requests', eligible.privacyRequests]
    ].map((row) => {
      const label = escapeHtml(row[0]);
      const count = Number(row[1] || 0);
      return `<div class="panel">
        <div><strong>${label}</strong></div>
        <div class="note">${count} eligible</div>
      </div>`;
    }).join('');
  }

  if (latestEl) {
    if (!latest) {
      latestEl.innerHTML = '<div class="note">No cleanup evidence recorded yet.</div>';
      if (latestMeta) latestMeta.textContent = '';
    } else {
      const summary = latest.summary || {};
      latestEl.innerHTML = [
        ['Magic link tokens deleted', summary.magicLinkTokensDeleted],
        ['Audit logs deleted', summary.auditLogsDeleted],
        ['Session history deleted', summary.sessionHistoryDeleted],
        ['Sessions deleted', summary.sessionsDeleted],
        ['Invoices deleted', summary.invoicesDeleted],
        ['Invoice lines deleted', summary.invoiceLinesDeleted],
        ['Adjustments deleted', summary.adjustmentsDeleted],
        ['Pay periods deleted', summary.payPeriodsDeleted],
        ['Tutors anonymized', summary.tutorsAnonymized],
        ['Students anonymized', summary.studentsAnonymized],
        ['Privacy requests deleted', summary.privacyRequestsDeleted]
      ].map((row) => {
        const label = escapeHtml(row[0]);
        const count = Number(row[1] || 0);
        return `<div class="panel">
          <div><strong>${label}</strong></div>
          <div class="note">${count} affected</div>
        </div>`;
      }).join('');

      const ranAt = latest.ranAt ? new Date(latest.ranAt).toLocaleString() : 'Unknown';
      if (latestMeta) {
        latestMeta.textContent = `Last run: ${ranAt} (event ${latest.id}).`;
      }
    }
  }
}
