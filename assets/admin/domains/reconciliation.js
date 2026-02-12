import { apiGet, apiPost, qs, formatMoney, setActiveNav, escapeHtml, renderSkeletonCards, renderStateCard } from '/assets/portal-shared.js';

export async function initReconciliation() {
  setActiveNav('reconciliation');
  const form = qs('#reconForm');
  const status = qs('#reconStatus');
  const report = qs('#reconReport');
  const adjustmentsEl = qs('#reconAdjustments');
  const arcadeRun = qs('#arcadeReconRun');
  const arcadeStatus = qs('#arcadeReconStatus');
  const arcadeReport = qs('#arcadeReconReport');
  const arcadeMetricsForm = qs('#arcadeMetricsForm');
  const arcadeMetricsReport = qs('#arcadeMetricsReport');

  const renderList = (title, items, renderItem) => {
    const content = items.length
      ? items.map(renderItem).join('')
      : '<div class="note">None found.</div>';
    return `<div class="panel">
      <div><strong>${title}</strong></div>
      <div style="margin-top:8px;">${content}</div>
    </div>`;
  };

  const renderArcadeReport = (data) => {
    if (!arcadeReport) return;
    if (!data) {
      arcadeReport.innerHTML = '<div class="note">No arcade report available.</div>';
      return;
    }

    arcadeReport.innerHTML = [
      renderList('Impressions per session', data.impressionsPerSession || [], (row) =>
        `<div class="note">${escapeHtml(row.session_id)}: ${escapeHtml(row.impressions)}</div>`
      ),
      renderList('Rewards per validated session', data.rewardsPerValidatedSession || [], (row) =>
        `<div class="note">${escapeHtml(row.session_id)}: ${escapeHtml(row.rewards)}</div>`
      ),
      renderList('Clicks without impressions', data.clicksWithoutImpressions || [], (row) =>
        `<div class="note">${escapeHtml(row.session_id)}: ${escapeHtml(row.clicks)}</div>`
      ),
      renderList('Scores without validation', data.scoresWithoutValidation || [], (row) =>
        `<div class="note">${escapeHtml(row.score_id)} (session ${escapeHtml(row.session_id || 'unknown')})</div>`
      )
    ].join('');
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

  if (arcadeRun && arcadeStatus && arcadeReport) {
    arcadeRun.addEventListener('click', async () => {
      arcadeStatus.textContent = 'Running arcade checks...';
      renderSkeletonCards(arcadeReport, 3);
      try {
        const result = await apiPost('/admin/arcade/reconciliation/run');
        arcadeStatus.textContent = `Arcade report generated at ${result.createdAt}`;
        renderArcadeReport(result.report);
      } catch (err) {
        arcadeStatus.textContent = 'Arcade report failed.';
        renderStateCard(arcadeReport, {
          variant: 'error',
          title: 'Arcade reconciliation failed',
          description: err?.message || 'Try again.'
        });
      }
    });

    try {
      const latest = await apiGet('/admin/arcade/reconciliation/latest');
      if (latest?.report) {
        arcadeStatus.textContent = `Arcade report generated at ${latest.createdAt}`;
        renderArcadeReport(latest.report);
      }
    } catch {
      arcadeStatus.textContent = 'Arcade report unavailable.';
    }
  }

  if (arcadeMetricsForm && arcadeMetricsReport) {
    arcadeMetricsForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      renderSkeletonCards(arcadeMetricsReport, 2);

      const from = qs('#arcadeMetricsFrom')?.value || '';
      const to = qs('#arcadeMetricsTo')?.value || '';
      const query = new URLSearchParams();
      if (from) query.set('from', from);
      if (to) query.set('to', to);

      let data;
      try {
        data = await apiGet(`/admin/arcade/metrics?${query.toString()}`);
      } catch (err) {
        renderStateCard(arcadeMetricsReport, {
          variant: 'error',
          title: 'Unable to load arcade metrics',
          description: err?.message || 'Try again.'
        });
        return;
      }

      const experiments = data.experiments || [];
      const funnel = data.funnel || {};

      const experimentRows = experiments.length
        ? experiments.map((row) =>
          `<div class="note">${escapeHtml(row.variant_id)} / ${escapeHtml(row.placement)} / ${escapeHtml(row.provider)}: ${escapeHtml(row.impressions)} impressions, ${escapeHtml(row.clicks)} clicks, ${escapeHtml(row.rewards)} rewards</div>`
        ).join('')
        : '<div class="note">No experiment data.</div>';

      arcadeMetricsReport.innerHTML = [
        `<div class="panel">
          <div><strong>Experiment breakdown</strong></div>
          <div style="margin-top:8px;">${experimentRows}</div>
        </div>`,
        `<div class="panel">
          <div><strong>Engagement funnel</strong></div>
          <div style="margin-top:8px;">
            <div class="note">Sessions started: ${escapeHtml(funnel.sessions_started || 0)}</div>
            <div class="note">Sessions ended: ${escapeHtml(funnel.sessions_ended || 0)}</div>
            <div class="note">Scores submitted: ${escapeHtml(funnel.scores_submitted || 0)}</div>
            <div class="note">Scores validated: ${escapeHtml(funnel.scores_validated || 0)}</div>
          </div>
        </div>`
      ].join('');
    });
  }
}
