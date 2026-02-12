import { apiGet, apiPost, qs, renderStatus, formatMoney, setActiveNav, escapeHtml } from '/assets/portal-shared.js';

export async function initApprovals() {
  setActiveNav('approvals');
  const list = qs('#approvalList');
  const selectAll = qs('#selectAll');
  const searchInput = qs('#searchInput');
  const statusFilter = qs('#statusFilter');
  const sortBy = qs('#sortBy');
  const sortOrder = qs('#sortOrder');
  const fromDate = qs('#fromDate');
  const toDate = qs('#toDate');
  const pageSize = qs('#pageSize');
  const applyFilters = qs('#applyFilters');
  const resetFilters = qs('#resetFilters');
  const prevPage = qs('#prevPage');
  const nextPage = qs('#nextPage');
  const pageMeta = qs('#pageMeta');
  const selectionSummary = qs('#selectionSummary');
  const selectionMeta = qs('#selectionMeta');
  const aggregateSummary = qs('#aggregateSummary');
  const aggregateMeta = qs('#aggregateMeta');
  const bulkApprove = qs('#bulkApprove');
  const bulkReject = qs('#bulkReject');
  const bulkResult = qs('#bulkResult');
  const bulkDialog = qs('#bulkDialog');
  const bulkDialogTitle = qs('#bulkDialogTitle');
  const bulkDialogSummary = qs('#bulkDialogSummary');
  const bulkReasonField = qs('#bulkReasonField');
  const bulkReason = qs('#bulkReason');
  const bulkCancel = qs('#bulkCancel');
  const bulkConfirm = qs('#bulkConfirm');
  const historyDialog = qs('#historyDialog');
  const historyTitle = qs('#historyTitle');
  const historySubtitle = qs('#historySubtitle');
  const historyContent = qs('#historyContent');
  const historyClose = qs('#historyClose');

  const state = {
    sessions: [],
    selected: new Set(),
    aggregates: null,
    total: 0,
    page: 1,
    pageSize: Number(pageSize?.value || 25),
    preset: 'this-week'
  };

  const toDateString = (value) => value.toISOString().slice(0, 10);
  const debounce = (fn, wait = 300) => {
    let timer;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), wait);
    };
  };

  const getWeekRange = (sourceDate) => {
    const date = new Date(sourceDate.getFullYear(), sourceDate.getMonth(), sourceDate.getDate());
    const day = date.getDay();
    const diff = (day + 6) % 7;
    const start = new Date(date);
    start.setDate(date.getDate() - diff);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  };

  const setPreset = (preset) => {
    state.preset = preset;
    document.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.preset === preset);
    });
  };

  const applyPreset = (preset) => {
    const now = new Date();
    if (preset === 'this-week') {
      const range = getWeekRange(now);
      fromDate.value = toDateString(range.start);
      toDate.value = toDateString(range.end);
    } else if (preset === 'last-week') {
      const range = getWeekRange(now);
      range.start.setDate(range.start.getDate() - 7);
      range.end.setDate(range.end.getDate() - 7);
      fromDate.value = toDateString(range.start);
      toDate.value = toDateString(range.end);
    }
  };

  const updateSelectionMeta = () => {
    const selectedSessions = state.sessions.filter((s) => state.selected.has(s.id));
    const count = selectedSessions.length;
    let minutes = 0;
    let payout = 0;
    let payoutKnown = true;

    for (const session of selectedSessions) {
      const duration = Number(session.duration_minutes || 0);
      minutes += duration;
      if (session.rate == null) {
        payoutKnown = false;
      } else {
        payout += (duration / 60) * Number(session.rate);
      }
    }

    selectionSummary.textContent = `${count} session${count === 1 ? '' : 's'}`;
    selectionMeta.textContent = payoutKnown
      ? `${minutes} minutes - ${formatMoney(payout)}`
      : `${minutes} minutes - Rate unavailable`;
    if (bulkApprove) bulkApprove.disabled = count === 0;
    if (bulkReject) bulkReject.disabled = count === 0;
  };

  const updateAggregates = () => {
    if (!state.aggregates) return;
    const submitted = state.aggregates.countsByStatus?.SUBMITTED ?? 0;
    const submittedMinutes = state.aggregates.totalMinutesSubmitted ?? 0;
    aggregateSummary.textContent = `${submitted} submitted`;
    aggregateMeta.textContent = `${submittedMinutes} minutes submitted`;
  };

  const updatePageMeta = () => {
    const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
    pageMeta.textContent = `Page ${state.page} of ${totalPages} (${state.total} total)`;
    prevPage.disabled = state.page <= 1;
    nextPage.disabled = state.page >= totalPages;
  };

  const renderTable = () => {
    if (!list) return;
    if (!state.sessions.length) {
      list.innerHTML = '<tr><td colspan="6" class="note">No sessions found for this filter.</td></tr>';
      updateSelectionMeta();
      updateAggregates();
      updatePageMeta();
      return;
    }

    const rows = state.sessions.map((s) => {
      const checked = state.selected.has(s.id) ? 'checked' : '';
      const notes = s.notes ? escapeHtml(s.notes) : '-';
      const actionDisabled = s.status !== 'SUBMITTED' ? 'disabled' : '';
      const schedule = `${escapeHtml(s.date)} ${escapeHtml(s.start_time)}-${escapeHtml(s.end_time)}`;
      const duration = `${Number(s.duration_minutes || 0)} min`;
      const subject = s.subject ? escapeHtml(s.subject) : 'Session';
      return `<tr data-id="${s.id}">
          <td><input type="checkbox" data-select="${s.id}" ${checked}></td>
          <td>
            <div><strong>${escapeHtml(s.tutor_name)}</strong> -> ${escapeHtml(s.student_name)}</div>
            <div class="note">${subject}</div>
          </td>
          <td>
            <div>${schedule}</div>
            <div class="note">${duration}</div>
          </td>
          <td class="note">${notes}</td>
          <td>${renderStatus(s.status)}</td>
          <td>
            <div class="split" style="gap:8px; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));">
              <button class="button" data-approve="${s.id}" ${actionDisabled}>Approve</button>
              <button class="button secondary" data-reject="${s.id}" ${actionDisabled}>Reject</button>
              <button class="button secondary" data-history="${s.id}">History</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    list.innerHTML = rows;
    updateSelectionMeta();
    updateAggregates();
    updatePageMeta();
    if (selectAll) {
      selectAll.checked = state.sessions.length > 0 && state.sessions.every((s) => state.selected.has(s.id));
    }
  };

  const load = async () => {
    if (bulkResult) bulkResult.textContent = '';
    if (list) {
      list.innerHTML = '<tr><td colspan="6" class="note">Loading sessions...</td></tr>';
    }
    const params = new URLSearchParams();
    if (statusFilter?.value) params.set('status', statusFilter.value);
    if (fromDate?.value) params.set('from', fromDate.value);
    if (toDate?.value) params.set('to', toDate.value);
    if (searchInput?.value?.trim()) params.set('q', searchInput.value.trim());
    if (sortBy?.value) params.set('sort', sortBy.value);
    if (sortOrder?.value) params.set('order', sortOrder.value);
    params.set('page', String(state.page));
    params.set('pageSize', String(state.pageSize));

    try {
      const data = await apiGet(`/admin/sessions?${params.toString()}`);
      state.sessions = data.items || [];
      state.aggregates = data.aggregates || null;
      state.total = Number(data.total || 0);
      state.selected = new Set();
      renderTable();
    } catch (err) {
      state.sessions = [];
      state.total = 0;
      if (list) {
        list.innerHTML = `<tr><td colspan="6" class="note">Failed to load sessions: ${escapeHtml(err?.message || 'request_failed')}</td></tr>`;
      }
      updateSelectionMeta();
      updatePageMeta();
      if (bulkResult) {
        bulkResult.textContent = 'Unable to refresh approval queue.';
      }
    }
  };

  const openBulkDialog = (action) => {
    const selectedSessions = state.sessions.filter((s) => state.selected.has(s.id));
    if (!selectedSessions.length) return;

    const count = selectedSessions.length;
    const minutes = selectedSessions.reduce((acc, s) => acc + Number(s.duration_minutes || 0), 0);
    bulkDialog.dataset.action = action;
    bulkDialogTitle.textContent = action === 'approve' ? 'Confirm bulk approval' : 'Confirm bulk rejection';
    bulkDialogSummary.textContent = `You are about to ${action} ${count} session${count === 1 ? '' : 's'} (${minutes} minutes).`;
    bulkReasonField.style.display = action === 'reject' ? 'grid' : 'none';
    if (bulkReason) bulkReason.value = '';
    bulkDialog.showModal();
  };

  const runBulkAction = async () => {
    const action = bulkDialog.dataset.action;
    if (!action) return;
    const sessionIds = Array.from(state.selected);
    if (!sessionIds.length) return;

    try {
      if (action === 'approve') {
        const res = await apiPost('/admin/sessions/bulk-approve', { sessionIds });
        const approved = res.results.filter((r) => r.status === 'approved').length;
        const skipped = res.results.filter((r) => r.status === 'skipped').length;
        const errored = res.results.filter((r) => r.status === 'error').length;
        bulkResult.textContent = `Approved ${approved}. Skipped ${skipped}. Errors ${errored}.`;
      } else {
        const reason = bulkReason?.value?.trim() || undefined;
        const res = await apiPost('/admin/sessions/bulk-reject', { sessionIds, reason });
        const rejected = res.results.filter((r) => r.status === 'rejected').length;
        const skipped = res.results.filter((r) => r.status === 'skipped').length;
        const errored = res.results.filter((r) => r.status === 'error').length;
        bulkResult.textContent = `Rejected ${rejected}. Skipped ${skipped}. Errors ${errored}.`;
      }
      bulkDialog.close();
      await load();
    } catch (err) {
      bulkResult.textContent = `Bulk action failed: ${err.message}`;
    }
  };

  const formatDateTime = (value) => {
    if (!value) return 'Unknown time';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  };

  const renderHistory = (entries) => {
    if (!historyContent) return;
    if (!entries.length) {
      historyContent.innerHTML = '<div class="note">No history available for this session.</div>';
      return;
    }

    historyContent.innerHTML = entries.map((entry) => {
      const actor = entry.actor ? (entry.actor.name || entry.actor.email || entry.actor.role) : 'System';
      const actorMeta = entry.actor?.email && entry.actor.name ? ` (${escapeHtml(entry.actor.email)})` : '';
      const diffs = entry.diffs || [];
      const diffRows = diffs.length
        ? diffs.map((diff) => `<tr class="${diff.important ? 'history-diff-important' : ''}">
              <td>${escapeHtml(diff.label)}</td>
              <td class="note">${escapeHtml(diff.before)}</td>
              <td class="note">${escapeHtml(diff.after)}</td>
            </tr>`).join('')
        : '<tr><td colspan="3" class="note">No field changes captured.</td></tr>';

      const rawId = `history-raw-${entry.id}`;
      const rawPayload = JSON.stringify({ before: entry.beforeJson, after: entry.afterJson }, null, 2);
      return `<div class="history-entry">
          <div class="history-entry-header">
            <div>
              <div><strong>${escapeHtml(entry.changeType)}</strong> by ${escapeHtml(actor)}${actorMeta}</div>
              <div class="note">${formatDateTime(entry.createdAt)}</div>
            </div>
            <span class="pill">${escapeHtml(entry.changeType)}</span>
          </div>
          <table class="table history-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Before</th>
                <th>After</th>
              </tr>
            </thead>
            <tbody>
              ${diffRows}
            </tbody>
          </table>
          <details style="margin-top:10px;">
            <summary class="note">Raw JSON (copy)</summary>
            <div class="split" style="margin-top:8px; align-items:center;">
              <button class="button secondary" type="button" data-copy="${rawId}">Copy JSON</button>
              <span class="note">Before and after payload</span>
            </div>
            <pre id="${rawId}" class="history-raw">${escapeHtml(rawPayload)}</pre>
          </details>
        </div>`;
    }).join('');

    historyContent.querySelectorAll('button[data-copy]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const targetId = btn.dataset.copy;
        const target = document.getElementById(targetId);
        if (!target) return;
        const text = target.textContent || '';
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        }
      });
    });
  };

  const openHistory = async (sessionId) => {
    if (!historyDialog) return;
    const session = state.sessions.find((item) => item.id === sessionId);
    const subtitle = session
      ? `${session.tutor_name} -> ${session.student_name} - ${session.date} ${session.start_time}-${session.end_time}`
      : 'Session history details.';
    if (historyTitle) historyTitle.textContent = 'Session history';
    if (historySubtitle) historySubtitle.textContent = subtitle;
    if (historyContent) historyContent.innerHTML = '<div class="note">Loading history...</div>';
    historyDialog.showModal();

    try {
      const data = await apiGet(`/admin/sessions/${sessionId}/history`);
      renderHistory(data.history || []);
    } catch (err) {
      if (historyContent) historyContent.innerHTML = `<div class="note">Failed to load history: ${err.message}</div>`;
    }
  };

  applyPreset('this-week');
  setPreset('this-week');

  document.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      setPreset(preset);
      if (preset !== 'custom') applyPreset(preset);
      state.page = 1;
      load();
    });
  });

  fromDate?.addEventListener('change', () => setPreset('custom'));
  toDate?.addEventListener('change', () => setPreset('custom'));

  searchInput?.addEventListener('input', debounce(() => {
    state.page = 1;
    load();
  }, 350));

  applyFilters?.addEventListener('click', () => {
    state.page = 1;
    load();
  });

  resetFilters?.addEventListener('click', () => {
    searchInput.value = '';
    statusFilter.value = 'SUBMITTED';
    sortBy.value = 'date';
    sortOrder.value = 'desc';
    pageSize.value = '25';
    state.pageSize = 25;
    setPreset('this-week');
    applyPreset('this-week');
    state.page = 1;
    load();
  });

  pageSize?.addEventListener('change', () => {
    state.pageSize = Number(pageSize.value || 25);
    state.page = 1;
    load();
  });

  prevPage?.addEventListener('click', () => {
    if (state.page > 1) {
      state.page -= 1;
      load();
    }
  });

  nextPage?.addEventListener('click', () => {
    state.page += 1;
    load();
  });

  selectAll?.addEventListener('change', () => {
    if (selectAll.checked) {
      state.sessions.forEach((s) => state.selected.add(s.id));
    } else {
      state.selected.clear();
    }
    renderTable();
  });

  list?.addEventListener('change', (event) => {
    const target = event.target;
    if (target && target.matches('input[data-select]')) {
      const id = target.dataset.select;
      if (target.checked) {
        state.selected.add(id);
      } else {
        state.selected.delete(id);
      }
      updateSelectionMeta();
      if (selectAll) {
        selectAll.checked = state.sessions.length > 0 && state.sessions.every((s) => state.selected.has(s.id));
      }
    }
  });

  list?.addEventListener('click', async (event) => {
    const target = event.target;
    if (!target || !target.dataset) return;
    if (target.dataset.approve) {
      try {
        await apiPost(`/admin/sessions/${target.dataset.approve}/approve`);
        if (bulkResult) {bulkResult.textContent = 'Session approved.';}
        await load();
      } catch (err) {
        if (bulkResult) {bulkResult.textContent = `Approval failed: ${err?.message || 'request_failed'}`;}
      }
    }
    if (target.dataset.reject) {
      const confirmed = window.confirm('Reject this session?');
      if (!confirmed) {return;}
      const reason = prompt('Reason for rejection?') || undefined;
      try {
        await apiPost(`/admin/sessions/${target.dataset.reject}/reject`, { reason });
        if (bulkResult) {bulkResult.textContent = 'Session rejected.';}
        await load();
      } catch (err) {
        if (bulkResult) {bulkResult.textContent = `Rejection failed: ${err?.message || 'request_failed'}`;}
      }
    }
    if (target.dataset.history) {
      await openHistory(target.dataset.history);
    }
  });

  bulkApprove?.addEventListener('click', () => openBulkDialog('approve'));
  bulkReject?.addEventListener('click', () => openBulkDialog('reject'));
  bulkCancel?.addEventListener('click', () => bulkDialog.close());
  bulkConfirm?.addEventListener('click', runBulkAction);
  historyClose?.addEventListener('click', () => historyDialog.close());

  await load();
}
