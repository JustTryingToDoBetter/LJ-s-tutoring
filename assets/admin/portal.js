import { apiGet, apiPost, qs, setActiveNav, escapeHtml } from '/assets/portal-shared.js';
import { initTutors } from '/assets/admin/domains/tutors.js';
import { initStudents } from '/assets/admin/domains/students.js';
import { initAssignments } from '/assets/admin/domains/assignments.js';
import { initApprovals } from '/assets/admin/domains/approvals.js';
import { initPayroll } from '/assets/admin/domains/payroll.js';
import { initReconciliation } from '/assets/admin/domains/reconciliation.js';
import { initRetention } from '/assets/admin/domains/retention.js';

async function initDashboard() {
  setActiveNav('dashboard');
  const counts = await apiGet('/admin/dashboard');
  qs('#countTutors').textContent = counts.tutors;
  qs('#countStudents').textContent = counts.students;
  qs('#countSessions').textContent = counts.sessions.reduce((acc, row) => acc + Number(row.count), 0);
}



async function initAudit() {
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
    total: 0,
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
      const entity = item.entityType ? `${item.entityType}:${item.entityId || 'n/a'}` : '—';
      return `<tr>
          <td>${escapeHtml(new Date(item.createdAt).toLocaleString())}</td>
          <td><strong>${escapeHtml(item.action)}</strong></td>
          <td>${escapeHtml(entity)}</td>
          <td class="note">${escapeHtml(actor)}</td>
          <td class="note">${escapeHtml(item.correlationId || '—')}</td>
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

async function initPrivacyRequests() {
  setActiveNav('privacy-requests');
  const form = qs('#privacyRequestForm');
  const requestMsg = qs('#requestMsg');
  const closeForm = qs('#privacyCloseForm');
  const closeMsg = qs('#closeMsg');
  const list = qs('#privacyRequestList');
  const filterStatus = qs('#filterStatus');
  const refreshBtn = qs('#refreshRequests');

  const load = async () => {
    const params = new URLSearchParams();
    if (filterStatus?.value) params.set('status', filterStatus.value);
    const data = await apiGet(`/admin/privacy-requests?${params.toString()}`);
    if (!list) return;
    if (!data.requests?.length) {
      list.innerHTML = '<div class="note">No privacy requests found.</div>';
      return;
    }

    list.innerHTML = data.requests.map((item) => {
      const status = escapeHtml(item.status);
      const type = escapeHtml(item.request_type);
      const subjectType = escapeHtml(item.subject_type);
      const createdAt = new Date(item.created_at).toLocaleString();
      const outcome = item.outcome ? escapeHtml(item.outcome) : '—';
      const reason = item.reason ? escapeHtml(item.reason) : '—';
      return `<div class="panel">
        <div><strong>${type}</strong> • ${subjectType}</div>
        <div class="note">ID: ${escapeHtml(item.id)}</div>
        <div class="note">Subject ID: ${escapeHtml(item.subject_id)}</div>
        <div class="note">Status: ${status} • Outcome: ${outcome}</div>
        <div class="note">Created: ${escapeHtml(createdAt)}</div>
        <div class="note">Reason: ${reason}</div>
        <div class="split" style="margin-top:10px; gap:10px;">
          <button class="button secondary" type="button" data-export-request="${escapeHtml(item.id)}">Export JSON</button>
          <button class="button secondary" type="button" data-close-request="${escapeHtml(item.id)}">Close</button>
        </div>
      </div>`;
    }).join('');
  };

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (requestMsg) requestMsg.textContent = '';
    const payload = {
      requestType: qs('#requestType').value,
      subjectType: qs('#subjectType').value,
      subjectId: qs('#subjectId').value.trim(),
      reason: qs('#requestReason').value.trim() || undefined
    };
    try {
      await apiPost('/admin/privacy-requests', payload);
      form.reset();
      if (requestMsg) requestMsg.textContent = 'Request created.';
      await load();
    } catch (err) {
      if (requestMsg) requestMsg.textContent = err.message || 'Unable to create request.';
    }
  });

  closeForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (closeMsg) closeMsg.textContent = '';
    const requestId = qs('#closeRequestId').value.trim();
    if (!requestId) return;
    let correctionPayload = undefined;
    const rawCorrection = qs('#correctionJson').value.trim();
    if (rawCorrection) {
      try {
        correctionPayload = JSON.parse(rawCorrection);
      } catch {
        if (closeMsg) closeMsg.textContent = 'Correction JSON is invalid.';
        return;
      }
    }

    const payload = {
      outcome: qs('#closeOutcome').value || undefined,
      note: qs('#closeNote').value.trim() || undefined,
      correction: correctionPayload
    };

    try {
      await apiPost(`/admin/privacy-requests/${requestId}/close`, payload);
      closeForm.reset();
      if (closeMsg) closeMsg.textContent = 'Request closed.';
      await load();
    } catch (err) {
      if (closeMsg) closeMsg.textContent = err.message || 'Unable to close request.';
    }
  });

  list?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.exportRequest) {
      window.open(`/admin/privacy-requests/${target.dataset.exportRequest}/export`, '_blank');
    }
    if (target.dataset.closeRequest) {
      qs('#closeRequestId').value = target.dataset.closeRequest;
      qs('#closeRequestId').focus();
    }
  });

  filterStatus?.addEventListener('change', load);
  refreshBtn?.addEventListener('click', load);

  await load();
}

const page = document.body.dataset.page;

if (page === 'dashboard') initDashboard();
if (page === 'tutors') initTutors();
if (page === 'students') initStudents();
if (page === 'assignments') initAssignments();
if (page === 'approvals') initApprovals();
if (page === 'payroll') initPayroll();
if (page === 'audit') initAudit();
if (page === 'reconciliation') initReconciliation();
if (page === 'retention') initRetention();
if (page === 'privacy-requests') initPrivacyRequests();
