import { apiGet, apiPost, qs, setActiveNav, escapeHtml, renderSkeletonCards, renderStateCard } from '/assets/portal-shared.js';

export async function initPrivacyRequests() {
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
    if (!list) return;
    renderSkeletonCards(list, 3);
    let data;
    try {
      data = await apiGet(`/admin/privacy-requests?${params.toString()}`);
    } catch (err) {
      renderStateCard(list, {
        variant: 'error',
        title: 'Unable to load privacy requests',
        description: err?.message || 'Try again.'
      });
      return;
    }
    if (!data.requests?.length) {
      renderStateCard(list, {
        variant: 'empty',
        title: 'No privacy requests found',
        description: 'Try a different status filter or create a new request.'
      });
      return;
    }

    list.innerHTML = data.requests.map((item) => {
      const status = escapeHtml(item.status);
      const type = escapeHtml(item.request_type);
      const subjectType = escapeHtml(item.subject_type);
      const createdAt = new Date(item.created_at).toLocaleString();
      const outcome = item.outcome ? escapeHtml(item.outcome) : '-';
      const reason = item.reason ? escapeHtml(item.reason) : '-';
      return `<div class="panel">
        <div><strong>${type}</strong> - ${subjectType}</div>
        <div class="note">ID: ${escapeHtml(item.id)}</div>
        <div class="note">Subject ID: ${escapeHtml(item.subject_id)}</div>
        <div class="note">Status: ${status} - Outcome: ${outcome}</div>
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
    if (requestMsg) {
      requestMsg.textContent = '';
      requestMsg.className = 'form-feedback';
    }
    const payload = {
      requestType: qs('#requestType').value,
      subjectType: qs('#subjectType').value,
      subjectId: qs('#subjectId').value.trim(),
      reason: qs('#requestReason').value.trim() || undefined
    };
    try {
      await apiPost('/admin/privacy-requests', payload);
      form.reset();
      if (requestMsg) {
        requestMsg.textContent = 'Request created.';
        requestMsg.classList.add('success');
      }
      await load();
    } catch (err) {
      if (requestMsg) {
        requestMsg.textContent = err.message || 'Unable to create request.';
        requestMsg.classList.add('error');
      }
    }
  });

  closeForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (closeMsg) {
      closeMsg.textContent = '';
      closeMsg.className = 'form-feedback';
    }
    const requestId = qs('#closeRequestId').value.trim();
    if (!requestId) return;
    let correctionPayload = undefined;
    const rawCorrection = qs('#correctionJson').value.trim();
    if (rawCorrection) {
      try {
        correctionPayload = JSON.parse(rawCorrection);
      } catch {
        if (closeMsg) {
          closeMsg.textContent = 'Correction JSON is invalid.';
          closeMsg.classList.add('error');
        }
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
      if (closeMsg) {
        closeMsg.textContent = 'Request closed.';
        closeMsg.classList.add('success');
      }
      await load();
    } catch (err) {
      if (closeMsg) {
        closeMsg.textContent = err.message || 'Unable to close request.';
        closeMsg.classList.add('error');
      }
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
