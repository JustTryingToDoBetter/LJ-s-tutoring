import { apiGet, apiPost, qs, formatMoney, setActiveNav, escapeHtml, renderSkeletonCards, renderStateCard } from '/assets/portal-shared.js';

export async function initPayroll() {
  setActiveNav('payroll');
  const form = qs('#payrollForm');
  const list = qs('#payrollList');
  const lockBtn = qs('#lockWeek');
  const jobStatus = qs('#payrollJobStatus');
  const csvStatus = qs('#payrollCsvStatus');
  const adjustmentForm = qs('#adjustmentForm');
  const adjustmentList = qs('#adjustmentList');
  const adjustmentTutor = qs('#adjustTutor');
  const payrollCsv = qs('#payrollCsv');

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const waitForJob = async (jobId, { onUpdate } = {}) => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const data = await apiGet(`/admin/jobs/${jobId}`);
      const job = data.job;
      if (onUpdate) {onUpdate(job);}
      if (job.status === 'COMPLETED') return job;
      if (job.status === 'FAILED') throw new Error(job.error || 'job_failed');
      await sleep(2000);
    }
    throw new Error('job_timeout');
  };

  if (adjustmentTutor) {
    const tutors = await apiGet('/admin/tutors');
    adjustmentTutor.innerHTML = tutors.tutors
      .map((t) => `<option value="${t.id}">${escapeHtml(t.full_name)}</option>`)
      .join('');
  }

  const loadAdjustments = async (weekStart) => {
    if (!adjustmentList || !weekStart) return;
    renderSkeletonCards(adjustmentList, 2);
    try {
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
    } catch (err) {
      renderStateCard(adjustmentList, {
        variant: 'error',
        title: 'Unable to load adjustments',
        description: err?.message || 'Try again in a moment.'
      });
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const weekStart = qs('#weekStart').value;
    renderSkeletonCards(list, 3);
    try {
      if (jobStatus) jobStatus.textContent = 'Queued invoice generation...';
      const res = await apiPost('/admin/jobs/payroll-generate', { weekStart });
      const job = await waitForJob(res.jobId, {
        onUpdate: (jobUpdate) => {
          if (jobStatus) jobStatus.textContent = `Job ${jobUpdate.status.toLowerCase()}...`;
        }
      });
      const invoices = job.result?.invoices || [];
      if (invoices.length) {
        list.innerHTML = invoices.map((inv) => `<div class="panel">
            <div><strong>${escapeHtml(inv.invoice_number)}</strong></div>
            <div>${formatMoney(inv.total_amount)}</div>
          </div>`).join('');
      } else {
        renderStateCard(list, {
          variant: 'empty',
          title: 'No invoices generated',
          description: 'No approved sessions were available for that week.'
        });
      }
      if (jobStatus) jobStatus.textContent = 'Invoice generation complete.';
    } catch (err) {
      if (jobStatus) jobStatus.textContent = `Invoice generation failed: ${err.message}`;
      renderStateCard(list, {
        variant: 'error',
        title: 'Invoice generation failed',
        description: err?.message || 'Try again.'
      });
    }
  });

  lockBtn?.addEventListener('click', async () => {
    const weekStart = qs('#weekStart').value;
    if (!weekStart) return;
    if (!window.confirm(`Lock week ${weekStart}? This prevents further edits.`)) {
      return;
    }
    await apiPost(`/admin/pay-periods/${weekStart}/lock`);
    if (jobStatus) {
      jobStatus.textContent = `Week ${weekStart} locked.`;
    }
  });

  payrollCsv?.addEventListener('click', async (event) => {
    event.preventDefault();
    const weekStart = qs('#weekStart').value;
    if (!weekStart) return;
    if (csvStatus) csvStatus.textContent = 'Preparing CSV export...';
    payrollCsv.style.pointerEvents = 'none';
    try {
      const jobRes = await apiPost('/admin/jobs/payroll-csv', { weekStart });
      const job = await waitForJob(jobRes.jobId, {
        onUpdate: (jobUpdate) => {
          if (csvStatus) csvStatus.textContent = `Export ${jobUpdate.status.toLowerCase()}...`;
        }
      });
      if (csvStatus) csvStatus.textContent = 'CSV ready. Downloading...';
      window.location.href = `/admin/jobs/${job.id}/download`;
      if (csvStatus) csvStatus.textContent = 'CSV download started.';
    } catch (err) {
      if (csvStatus) csvStatus.textContent = `CSV export failed: ${err.message}`;
    } finally {
      payrollCsv.style.pointerEvents = '';
    }
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
      try {
        await apiPost(`/admin/pay-periods/${weekStart}/adjustments`, payload);
        adjustmentForm.reset();
        await loadAdjustments(weekStart);
      } catch (err) {
        renderStateCard(adjustmentList, {
          variant: 'error',
          title: 'Could not save adjustment',
          description: err?.message || 'Try again.'
        });
      }
    });

    const weekInput = qs('#adjustWeek');
    weekInput.addEventListener('change', () => loadAdjustments(weekInput.value));
  }
}
