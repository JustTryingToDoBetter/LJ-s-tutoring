import { apiGet, apiPost, apiPatch, qs, renderStatus, formatMoney, setActiveNav, escapeHtml } from '/assets/portal-shared.js';
import { initTutors } from '/assets/admin/domains/tutors.js';

async function initDashboard() {
  setActiveNav('dashboard');
  const counts = await apiGet('/admin/dashboard');
  qs('#countTutors').textContent = counts.tutors;
  qs('#countStudents').textContent = counts.students;
  qs('#countSessions').textContent = counts.sessions.reduce((acc, row) => acc + Number(row.count), 0);
}


async function initStudents() {
  setActiveNav('students');
  const list = qs('#studentList');
  const form = qs('#studentForm');

  const load = async () => {
    const data = await apiGet('/admin/students');
    list.innerHTML = data.students
      .map((s) => `<div class="panel">
          <div><strong>${escapeHtml(s.full_name)}</strong> (${escapeHtml(s.grade || 'N/A')})</div>
          <div class="note">${escapeHtml(s.guardian_name || 'No guardian')} | ${s.active ? 'Active' : 'Inactive'}</div>
        </div>`)
      .join('');
  };

  await load();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      fullName: qs('#studentName').value,
      grade: qs('#studentGrade').value || undefined,
      guardianName: qs('#guardianName').value || undefined,
      guardianPhone: qs('#guardianPhone').value || undefined,
      notes: qs('#studentNotes').value || undefined,
      active: qs('#studentActive').checked
    };
    await apiPost('/admin/students', payload);
    form.reset();
    await load();
  });
}

async function initAssignments() {
  setActiveNav('assignments');
  const list = qs('#assignmentList');
  const form = qs('#assignmentForm');

  const [tutors, students] = await Promise.all([
    apiGet('/admin/tutors'),
    apiGet('/admin/students')
  ]);

  qs('#assignmentTutor').innerHTML = tutors.tutors.map((t) => `<option value="${t.id}">${escapeHtml(t.full_name)}</option>`).join('');
  qs('#assignmentStudent').innerHTML = students.students.map((s) => `<option value="${s.id}">${escapeHtml(s.full_name)}</option>`).join('');

  const load = async () => {
    const data = await apiGet('/admin/assignments');
    list.innerHTML = data.assignments
      .map((a) => `<div class="panel">
          <div><strong>${escapeHtml(a.subject)}</strong> - ${escapeHtml(a.student_name)}</div>
          <div class="note">Tutor: ${escapeHtml(a.tutor_name)} | ${escapeHtml(a.start_date)} to ${escapeHtml(a.end_date || 'open-ended')}</div>
        </div>`)
      .join('');
  };

  await load();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const allowedDays = Array.from(document.querySelectorAll('input[name="allowedDay"]:checked')).map((i) => Number(i.value));
    const payload = {
      tutorId: qs('#assignmentTutor').value,
      studentId: qs('#assignmentStudent').value,
      subject: qs('#assignmentSubject').value,
      startDate: qs('#assignmentStart').value,
      endDate: qs('#assignmentEnd').value || null,
      rateOverride: qs('#assignmentRate').value ? Number(qs('#assignmentRate').value) : null,
      allowedDays,
      allowedTimeRanges: [
        { start: qs('#rangeStart').value, end: qs('#rangeEnd').value }
      ]
    };
    await apiPost('/admin/assignments', payload);
    form.reset();
    await load();
  });
}

async function initApprovals() {
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
      ? `${minutes} minutes • ${formatMoney(payout)}`
      : `${minutes} minutes • Rate unavailable`;
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
      const notes = s.notes ? escapeHtml(s.notes) : '—';
      const actionDisabled = s.status !== 'SUBMITTED' ? 'disabled' : '';
      const schedule = `${escapeHtml(s.date)} ${escapeHtml(s.start_time)}-${escapeHtml(s.end_time)}`;
      const duration = `${Number(s.duration_minutes || 0)} min`;
      const subject = s.subject ? escapeHtml(s.subject) : 'Session';
      return `<tr data-id="${s.id}">
          <td><input type="checkbox" data-select="${s.id}" ${checked}></td>
          <td>
            <div><strong>${escapeHtml(s.tutor_name)}</strong> → ${escapeHtml(s.student_name)}</div>
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
    const params = new URLSearchParams();
    if (statusFilter?.value) params.set('status', statusFilter.value);
    if (fromDate?.value) params.set('from', fromDate.value);
    if (toDate?.value) params.set('to', toDate.value);
    if (searchInput?.value?.trim()) params.set('q', searchInput.value.trim());
    if (sortBy?.value) params.set('sort', sortBy.value);
    if (sortOrder?.value) params.set('order', sortOrder.value);
    params.set('page', String(state.page));
    params.set('pageSize', String(state.pageSize));

    const data = await apiGet(`/admin/sessions?${params.toString()}`);
    state.sessions = data.items || [];
    state.aggregates = data.aggregates || null;
    state.total = Number(data.total || 0);
    state.selected = new Set();
    renderTable();
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
      ? `${session.tutor_name} → ${session.student_name} • ${session.date} ${session.start_time}-${session.end_time}`
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
      await apiPost(`/admin/sessions/${target.dataset.approve}/approve`);
      await load();
    }
    if (target.dataset.reject) {
      const reason = prompt('Reason for rejection?') || undefined;
      await apiPost(`/admin/sessions/${target.dataset.reject}/reject`, { reason });
      await load();
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

async function initPayroll() {
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

async function initReconciliation() {
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
  });
}

async function initRetention() {
  setActiveNav('retention');
  const configEl = qs('#retentionConfig');
  const eligibleEl = qs('#retentionEligible');

  const data = await apiGet('/admin/retention/summary');
  const config = data.config || {};
  const cutoffs = data.cutoffs || {};
  const eligible = data.eligible || {};

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
      const cutoff = row[2] ? escapeHtml(new Date(row[2]).toISOString()) : '—';
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
