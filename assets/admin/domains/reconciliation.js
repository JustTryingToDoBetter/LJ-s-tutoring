import { apiGet, qs, formatMoney, setActiveNav, escapeHtml, renderSkeletonCards, renderStateCard } from '/assets/portal-shared.js';

export async function initReconciliation() {
  setActiveNav('reconciliation');
  const form = qs('#reconForm');
  const status = qs('#reconStatus');
  const report = qs('#reconReport');
  const adjustmentsEl = qs('#reconAdjustments');

  const renderList = (title, items, renderItem) => {
    const content = items.length
      ? items.map(renderItem).join('')
      : '<div class="note">None found.</div>';
    return `<div class="panel">
      <div><strong>${title}</strong></div>
      <div style="margin-top:8px;">${content}</div>
    </div>`;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    report.innerHTML = '';
    adjustmentsEl.innerHTML = '';
    const weekStart = qs('#reconWeek').value;
    renderSkeletonCards(report, 4);
    renderSkeletonCards(adjustmentsEl, 1);

    try {
      const [integrity, adjustments] = await Promise.all([
        apiGet(`/admin/integrity/pay-period/${weekStart}`),
        apiGet(`/admin/pay-periods/${weekStart}/adjustments`)
      ]);

      status.textContent = `Week status: ${integrity.payPeriod?.status || 'OPEN'}`;

      report.innerHTML = [
        renderList('Overlapping sessions', integrity.overlaps, (row) =>
          `<div class="note">${escapeHtml(row.session_id)} overlaps ${escapeHtml(row.overlap_id)} (${escapeHtml(row.date)} ${escapeHtml(row.start_time)}-${escapeHtml(row.end_time)})</div>`
        ),
        renderList('Outside assignment window', integrity.outsideAssignmentWindow, (row) =>
          `<div class="note">${escapeHtml(row.id)} on ${escapeHtml(row.date)} ${escapeHtml(row.start_time)}-${escapeHtml(row.end_time)}</div>`
        ),
        renderList('Approved sessions missing invoice lines', integrity.missingInvoiceLines, (row) =>
          `<div class="note">${escapeHtml(row.id)} on ${escapeHtml(row.date)}</div>`
        ),
        renderList('Invoice totals mismatched', integrity.invoiceTotalMismatches, (row) =>
          `<div class="note">${escapeHtml(row.invoice_number)} total ${formatMoney(row.total_amount)} vs lines ${formatMoney(row.line_total)}</div>`
        ),
        renderList('Pending submitted sessions', integrity.pendingSubmissions, (row) =>
          `<div class="note">${escapeHtml(row.tutor_name)}: ${row.pending}</div>`
        ),
        renderList('Duplicate sessions', integrity.duplicateSessions, (row) =>
          `<div class="note">${escapeHtml(row.tutor_id)} / ${escapeHtml(row.student_id)} on ${escapeHtml(row.date)} ${escapeHtml(row.start_time)}-${escapeHtml(row.end_time)} (x${row.count})</div>`
        )
      ].join('');

      const adjustmentItems = adjustments.adjustments || [];
      adjustmentsEl.innerHTML = renderList('Adjustments', adjustmentItems, (row) => {
        const voided = row.voided_at ? ' (voided)' : '';
        return `<div class="note">${escapeHtml(row.tutor_name)}: ${escapeHtml(row.type)} ${formatMoney(row.signed_amount)} - ${escapeHtml(row.reason)}${voided}</div>`;
      });
    } catch (err) {
      status.textContent = 'Reconciliation check failed.';
      renderStateCard(report, {
        variant: 'error',
        title: 'Unable to run integrity checks',
        description: err?.message || 'Try again.'
      });
      renderStateCard(adjustmentsEl, {
        variant: 'error',
        title: 'Unable to load adjustments',
        description: 'Try again.'
      });
    }
  });

}
