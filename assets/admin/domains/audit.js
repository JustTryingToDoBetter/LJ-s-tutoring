import { apiGet, qs, setActiveNav, escapeHtml } from '/assets/portal-shared.js';

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
    const params = buildParams();
    const data = await apiGet(`/admin/audit?${params.toString()}`);
    state.total = Number(data.total || 0);
    renderRows(data.items || []);
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
    window.location.href = `/admin/audit/export.csv?${params.toString()}`;
  });

  await load();
}
