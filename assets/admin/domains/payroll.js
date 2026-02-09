import { apiGet, apiPost, qs, formatMoney, setActiveNav, escapeHtml } from '/assets/portal-shared.js';

export async function initPayroll() {
  setActiveNav('payroll');
  const form = qs('#payrollForm');
  const list = qs('#payrollList');
  const lockBtn = qs('#lockWeek');
  const adjustmentForm = qs('#adjustmentForm');
  const adjustmentList = qs('#adjustmentList');
  const adjustmentTutor = qs('#adjustTutor');

  if (adjustmentTutor) {
    const tutors = await apiGet('/admin/tutors');
    adjustmentTutor.innerHTML = tutors.tutors
      .map((t) => `<option value="${t.id}">${escapeHtml(t.full_name)}</option>`)
      .join('');
  }

  const loadAdjustments = async (weekStart) => {
    if (!adjustmentList || !weekStart) return;
    const data = await apiGet(`/admin/pay-periods/${weekStart}/adjustments`);
    adjustmentList.innerHTML = data.adjustments.length
      ? data.adjustments.map((adj) => {
        const voided = adj.voided_at ? ' (voided)' : '';
        return `<div class="panel">
                  <div><strong>${escapeHtml(adj.tutor_name)}</strong> ${escapeHtml(adj.type)}${voided}</div>
                  <div class="note">${formatMoney(adj.signed_amount)} - ${escapeHtml(adj.reason)}</div>
                </div>`;
      }).join('')
      : '<div class="note">No adjustments yet.</div>';
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const weekStart = qs('#weekStart').value;
    const res = await apiPost('/admin/payroll/generate-week', { weekStart });
    list.innerHTML = res.invoices.length
      ? res.invoices.map((inv) => `<div class="panel">
          <div><strong>${escapeHtml(inv.invoice_number)}</strong></div>
          <div>${formatMoney(inv.total_amount)}</div>
        </div>`).join('')
      : '<div class="note">No invoices generated.</div>';

    qs('#payrollCsv').href = `/admin/payroll/week/${weekStart}.csv`;
  });

  lockBtn?.addEventListener('click', async () => {
    const weekStart = qs('#weekStart').value;
    if (!weekStart) return;
    await apiPost(`/admin/pay-periods/${weekStart}/lock`);
    alert(`Week ${weekStart} locked.`);
  });

  if (adjustmentForm) {
    adjustmentForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const weekStart = qs('#adjustWeek').value;
      const payload = {
        tutorId: qs('#adjustTutor').value,
        type: qs('#adjustType').value,
        amount: Number(qs('#adjustAmount').value),
        reason: qs('#adjustReason').value,
        relatedSessionId: qs('#adjustSession').value || undefined
      };
      await apiPost(`/admin/pay-periods/${weekStart}/adjustments`, payload);
      adjustmentForm.reset();
      await loadAdjustments(weekStart);
    });

    const weekInput = qs('#adjustWeek');
    weekInput.addEventListener('change', () => loadAdjustments(weekInput.value));
  }
}
