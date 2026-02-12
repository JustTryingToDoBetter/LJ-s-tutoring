import { apiGet, apiPost, qs, setActiveNav, escapeHtml } from '/assets/portal-shared.js';

export async function initAudit() {
  setActiveNav('audit');
  const list = qs('#auditList');
  const fromInput = qs('#auditFrom');
  const toInput = qs('#auditTo');
  const actorInput = qs('#auditActor');
  const entityTypeInput = qs('#auditEntityType');
  const entityIdInput = qs('#auditEntityId');
  const pageSizeInput = qs('#auditPageSize');
  const applyBtn = qs('#auditApply');
  const resetBtn = qs('#auditReset');
  const exportBtn = qs('#auditExport');
  const exportStatus = qs('#auditExportStatus');
  const prevBtn = qs('#auditPrev');
  const nextBtn = qs('#auditNext');
  const pageMeta = qs('#auditPageMeta');

  const state = {
    page: 1,
    pageSize: Number(pageSizeInput?.value || 25),
    total: 0
  };

  const buildParams = () => {
    const params = new URLSearchParams();
    if (fromInput?.value) params.set('from', fromInput.value);
    if (toInput?.value) params.set('to', toInput.value);
    if (actorInput?.value) params.set('actorId', actorInput.value.trim());
    if (entityTypeInput?.value) params.set('entityType', entityTypeInput.value.trim());
    if (entityIdInput?.value) params.set('entityId', entityIdInput.value.trim());
    params.set('page', String(state.page));
    params.set('pageSize', String(state.pageSize));
    return params;
  };

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

  const updatePageMeta = () => {
    const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
    pageMeta.textContent = `Page ${state.page} of ${totalPages} (${state.total} total)`;
    prevBtn.disabled = state.page <= 1;
    nextBtn.disabled = state.page >= totalPages;
  };

  const renderRows = (items) => {
    if (!items.length) {
      list.innerHTML = '<tr><td colspan="5" class="note">No audit entries found.</td></tr>';
      updatePageMeta();
      return;
    }

    list.innerHTML = items.map((item) => {
      const actor = item.actor ? `${item.actor.email || 'User'} (${item.actor.role || 'role'})` : 'System';
      const entity = item.entityType ? `${item.entityType}:${item.entityId || 'n/a'}` : '-';
      const correlationId = item.correlationId || '-';
      return `<tr>
          <td>${escapeHtml(new Date(item.createdAt).toLocaleString())}</td>
          <td><strong>${escapeHtml(item.action)}</strong></td>
          <td>${escapeHtml(entity)}</td>
          <td class="note">${escapeHtml(actor)}</td>
          <td class="note">${escapeHtml(correlationId)}</td>
        </tr>`;
    }).join('');

    updatePageMeta();
  };

  const load = async () => {
    if (list) {
      list.innerHTML = '<tr><td colspan="5" class="note">Loading audit entries...</td></tr>';
    }
    const params = buildParams();
    try {
      const data = await apiGet(`/admin/audit?${params.toString()}`);
      state.total = Number(data.total || 0);
      renderRows(data.items || []);
    } catch (err) {
      state.total = 0;
      if (list) {
        list.innerHTML = `<tr><td colspan="5" class="note">Failed to load audit entries: ${escapeHtml(err?.message || 'request_failed')}</td></tr>`;
      }
      updatePageMeta();
    }
  };

  applyBtn?.addEventListener('click', () => {
    state.page = 1;
    load();
  });

  resetBtn?.addEventListener('click', () => {
    fromInput.value = '';
    toInput.value = '';
    actorInput.value = '';
    entityTypeInput.value = '';
    entityIdInput.value = '';
    pageSizeInput.value = '25';
    state.pageSize = 25;
    state.page = 1;
    load();
  });

  pageSizeInput?.addEventListener('change', () => {
    state.pageSize = Number(pageSizeInput.value || 25);
    state.page = 1;
    load();
  });

  prevBtn?.addEventListener('click', () => {
    if (state.page > 1) {
      state.page -= 1;
      load();
    }
  });

  nextBtn?.addEventListener('click', () => {
    state.page += 1;
    load();
  });

  exportBtn?.addEventListener('click', () => {
    const params = buildParams();
    params.delete('page');
    params.delete('pageSize');
    const payload = Object.fromEntries(params.entries());
    if (exportStatus) exportStatus.textContent = 'Queued export...';
    exportBtn.disabled = true;
    apiPost('/admin/jobs/audit-export', payload)
      .then((res) => waitForJob(res.jobId, {
        onUpdate: (jobUpdate) => {
          if (exportStatus) exportStatus.textContent = `Export ${jobUpdate.status.toLowerCase()}...`;
        }
      }))
      .then((job) => {
        if (exportStatus) exportStatus.textContent = 'Export ready. Downloading...';
        window.location.href = `/admin/jobs/${job.id}/download`;
        if (exportStatus) exportStatus.textContent = 'Download started.';
      })
      .catch((err) => {
        if (exportStatus) exportStatus.textContent = `Export failed: ${err?.message || 'request_failed'}`;
      })
      .finally(() => {
        exportBtn.disabled = false;
      });
  });

  await load();
}
