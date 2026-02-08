import { apiGet, apiPost, apiPatch, qs, renderStatusEl, formatMoney, setActiveNav, showBanner, setText, escapeHtml, getImpersonationMeta, clearImpersonationContext, createEl, clearChildren } from '/assets/portal-shared.js';

const DB_NAME = 'tutor-offline';
const STORE = 'drafts';
const TIMER_KEY = 'tutorTimerState';
const DRAFTS_KEY = 'drafts';
const OFFLINE_STATUS = 'OFFLINE_DRAFT';
const ASSIGNMENTS_CACHE_KEY = 'tutorAssignmentsCache';
const RECENT_STUDENTS_KEY = 'tutorRecentStudents';
const ASSIGNMENTS_TTL = 5 * 60 * 1000;
const SESSIONS_CACHE_KEY = 'tutorSessionsCache';
const SESSIONS_TTL = 2 * 60 * 1000;

const toast = (() => {
  let timer = null;
  return (message) => {
    const el = qs('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      el.classList.remove('show');
    }, 2500);
  };
})();

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readAssignmentsCache() {
  try {
    const raw = localStorage.getItem(ASSIGNMENTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data || !parsed?.ts) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readSessionsCache() {
  try {
    const raw = localStorage.getItem(SESSIONS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data || !parsed?.ts) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionsCache(data) {
  localStorage.setItem(SESSIONS_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
}

function writeAssignmentsCache(data) {
  localStorage.setItem(ASSIGNMENTS_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
}

function readRecentStudents() {
  try {
    const raw = localStorage.getItem(RECENT_STUDENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecentStudents(list) {
  localStorage.setItem(RECENT_STUDENTS_KEY, JSON.stringify(list.slice(0, 10)));
}

async function getDrafts() {
  const db = await openDb();
  if (!db) {
    return JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]');
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveDraft(draft) {
  const db = await openDb();
  if (!db) {
    const existing = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]');
    const next = existing.filter((item) => item.id !== draft.id);
    next.push(draft);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
    return;
  }
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(draft);
}

async function deleteDrafts(ids) {
  if (!ids.length) return;
  const db = await openDb();
  if (!db) {
    const existing = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]');
    const filtered = existing.filter((item) => !ids.includes(item.id));
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(filtered));
    return;
  }
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  ids.forEach((id) => store.delete(id));
}

async function clearDrafts() {
  const db = await openDb();
  if (!db) {
    localStorage.removeItem(DRAFTS_KEY);
    return;
  }
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).clear();
}

async function syncDrafts() {
  const drafts = await getDrafts();
  if (!drafts.length) return { synced: 0, deduped: 0, failed: 0 };

  let synced = 0;
  let deduped = 0;
  let failed = 0;
  const syncedIds = [];

  for (const draft of drafts) {
    try {
      const res = await apiPost('/tutor/sessions', draft.payload);
      if (res?.deduped) {
        deduped += 1;
      } else {
        synced += 1;
      }
      syncedIds.push(draft.id);
    } catch {
      failed += 1;
      break;
    }
  }

  if (syncedIds.length) {
    await deleteDrafts(syncedIds);
  }

  return { synced, deduped, failed };
}

function listenOnlineSync() {
  const syncBtn = qs('#syncDraftsBtn');
  const syncCard = qs('#syncCard');
  const syncMsg = qs('#syncMsg');
  if (!syncBtn || !syncCard) return;

  const updateSyncUI = async () => {
    const drafts = await getDrafts();
    syncBtn.disabled = !navigator.onLine || drafts.length === 0;
    syncCard.classList.toggle('show', drafts.length > 0);
    setText('#syncCount', String(drafts.length));
  };

  const runSync = async () => {
    if (!navigator.onLine) return;
    syncBtn.disabled = true;
    const result = await syncDrafts();
    await updateSyncUI();
    syncBtn.disabled = !navigator.onLine;
    if (result.synced || result.deduped) {
      toast(`${result.synced} synced, ${result.deduped} already synced.`);
      if (syncMsg) syncMsg.textContent = 'Drafts synced. They remain as server drafts.';
      document.dispatchEvent(new CustomEvent('drafts-synced'));
    }
    if (result.failed) {
      if (syncMsg) syncMsg.textContent = 'Some drafts could not sync yet. Try again later.';
    }
  };

  syncBtn.addEventListener('click', runSync);
  window.addEventListener('online', async () => {
    await updateSyncUI();
    await runSync();
  });
  window.addEventListener('offline', updateSyncUI);
  updateSyncUI().then(() => {
    if (navigator.onLine) runSync();
  });
}

function initImpersonationBanner() {
  const meta = getImpersonationMeta();
  if (!meta) return;

  showBanner('#impersonationBanner', true);
  setText('#impersonationName', meta.tutorName || 'Tutor');

  const exitBtn = qs('#exitImpersonation');
  exitBtn?.addEventListener('click', async () => {
    try {
      await apiPost('/admin/impersonate/stop', { impersonationId: meta.impersonationId });
    } catch {
      // Ignore stop errors, still clear local state.
    }
    clearImpersonationContext();
    window.location.href = '/admin/tutors.html';
  });
}

async function initLogin() {
  setActiveNav('login');
  const form = qs('#loginForm');
  const msg = qs('#loginMsg');
  const banner = qs('#impersonationBanner');
  if (banner) banner.remove();
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    msg.textContent = '';

    const idempotencyKey = crypto.randomUUID();
    try {
      const email = qs('#email').value.trim();
      await apiPost('/auth/request-link', { email });
      msg.textContent = 'Magic link sent. Check your inbox.';
    } catch (err) {
      msg.textContent = err.message || 'Unable to send link.';
    }
  });
}

async function initTutorHome() {
  setActiveNav('home');
  const nameEl = qs('#tutorName');
  const sessionsEl = qs('#todaySessions');
  const upcomingEl = qs('#upcomingAssignments');

  const me = await apiGet('/tutor/me');
  nameEl.textContent = me.me.full_name;

  const today = new Date().toISOString().slice(0, 10);
  const sessions = await apiGet(`/tutor/sessions?from=${today}&to=${today}`);
  clearChildren(sessionsEl);
  if (sessions.sessions.length) {
    const frag = document.createDocumentFragment();
    sessions.sessions.forEach((s) => {
      const panel = createEl('div', { className: 'panel' });
      panel.append(createEl('span', { text: s.student_name }), document.createTextNode(' '), renderStatusEl(s.status));
      frag.append(panel);
    });
    sessionsEl.append(frag);
  } else {
    sessionsEl.append(createEl('div', { className: 'note', text: 'No sessions logged today.' }));
  }

  const assignments = await apiGet('/tutor/assignments');
  clearChildren(upcomingEl);
  if (assignments.assignments.length) {
    const frag = document.createDocumentFragment();
    assignments.assignments.slice(0, 3).forEach((a) => {
      const panel = createEl('div', { className: 'panel' });
      panel.append(
        createEl('span', { text: a.subject }),
        document.createTextNode(' with '),
        createEl('span', { text: a.full_name })
      );
      frag.append(panel);
    });
    upcomingEl.append(frag);
  } else {
    upcomingEl.append(createEl('div', { className: 'note', text: 'No active assignments yet.' }));
  }
}

async function initAssignments() {
  setActiveNav('assignments');
  const list = qs('#assignmentList');
  const data = await apiGet('/tutor/assignments');
  clearChildren(list);
  const frag = document.createDocumentFragment();
  data.assignments.forEach((a) => {
    const panel = createEl('div', { className: 'panel' });
    const title = createEl('div');
    const subject = createEl('strong', { text: a.subject });
    title.append(subject, document.createTextNode(' - '), createEl('span', { text: a.full_name }));
    const note = createEl('div', { className: 'note', text: `${a.start_date} to ${a.end_date || 'open-ended'}` });
    panel.append(title, note);
    frag.append(panel);
  });
  list.append(frag);
}

async function initPayroll() {
  setActiveNav('payroll');
  const list = qs('#payrollList');
  const data = await apiGet('/tutor/payroll/weeks');
  clearChildren(list);
  if (!data.weeks.length) {
    list.append(createEl('div', { className: 'note', text: 'No approved sessions yet.' }));
    return;
  }
  const frag = document.createDocumentFragment();
  data.weeks.forEach((w) => {
    const panel = createEl('div', { className: 'panel' });
    const split = createEl('div', { className: 'split' });
    split.append(createEl('strong', { text: w.week_start }), document.createTextNode(' '), renderStatusEl(w.status));
    panel.append(split);
    panel.append(createEl('div', { text: `${w.total_minutes} mins` }));
    panel.append(createEl('div', { text: formatMoney(w.total_amount) }));

    const adjustments = (w.adjustments || []);
    if (adjustments.length) {
      const wrap = createEl('div', { attrs: { style: 'margin-top:8px;' } });
      adjustments.forEach((adj) => {
        wrap.append(createEl('div', { className: 'note', text: `${adj.type}: ${formatMoney(adj.signed_amount)} - ${adj.reason}` }));
      });
      panel.append(wrap);
    }

    frag.append(panel);
  });
  list.append(frag);
}

async function initInvoices() {
  setActiveNav('invoices');
  const list = qs('#invoiceList');
  const data = await apiGet('/tutor/invoices');
  clearChildren(list);
  if (!data.invoices.length) {
    list.append(createEl('div', { className: 'note', text: 'No invoices yet.' }));
    return;
  }
  const frag = document.createDocumentFragment();
  data.invoices.forEach((inv) => {
    const panel = createEl('div', { className: 'panel' });
    const title = createEl('div');
    title.append(createEl('strong', { text: inv.invoice_number }));
    panel.append(title);
    panel.append(createEl('div', { text: `${inv.period_start} to ${inv.period_end}` }));
    panel.append(createEl('div', { text: formatMoney(inv.total_amount) }));
    const note = createEl('div', { className: 'note' });
    const htmlLink = createEl('a', { attrs: { href: `/tutor/invoices/${inv.id}`, target: '_blank' } , text: 'HTML' });
    const pdfLink = createEl('a', { attrs: { href: `/tutor/invoices/${inv.id}.pdf` }, text: 'PDF' });
    note.append(htmlLink, document.createTextNode(' | '), pdfLink);
    panel.append(note);
    frag.append(panel);
  });
  list.append(frag);
}

async function initSessions() {
  setActiveNav('sessions');
  listenOnlineSync();

  const assignmentSelect = qs('#assignmentSelect');
  const studentLabel = qs('#studentLabel');
  const list = qs('#sessionsList');
  const form = qs('#sessionForm');
  const msg = qs('#sessionMsg');
  const offlineBanner = qs('#offlineBanner');
  const saveDraftBtn = qs('#saveDraftBtn');
  const offlineHelper = qs('#offlineHelper');
  const timeError = qs('#timeError');
  const pickerBtn = qs('#studentPickerBtn');
  const picker = qs('#studentPicker');
  const pickerOverlay = qs('#studentPickerOverlay');
  const closePickerBtn = qs('#closeStudentPicker');
  const searchInput = qs('#studentSearch');
  const subjectFilter = qs('#subjectFilter');
  const recentContainer = qs('#recentStudents');
  const pickerList = qs('#studentPickerList');
  const timerLabel = qs('#timerLabel');
  const startBtn = qs('#startTimer');
  const stopBtn = qs('#stopTimer');
  const timerState = qs('#timerState');
  const resumeBanner = qs('#resumeBanner');
  const resumeBtn = qs('#resumeTimerBtn');
  const discardBtn = qs('#discardTimerBtn');

  let timerStart = null;
  let timerInterval = null;
  let latestDrafts = [];
  const assignmentIndex = new Map();
  let editingDraftId = null;
  let assignmentsList = [];
  const perfStart = performance.now();

  const formatTimeLocal = (date) => date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const formatDateLocal = (date) => date.toLocaleDateString('en-CA');

  const loadTimerState = () => {
    try {
      return JSON.parse(localStorage.getItem(TIMER_KEY) || 'null');
    } catch {
      return null;
    }
  };

  const saveTimerState = (state) => {
    localStorage.setItem(TIMER_KEY, JSON.stringify(state));
  };

  const clearTimerState = () => {
    localStorage.removeItem(TIMER_KEY);
  };

  const updateTimerStatus = (state, label) => {
    if (!timerState) return;
    timerState.textContent = state;
    timerState.classList.toggle('running', state === 'Running');
    timerState.classList.toggle('paused', state === 'Paused');
    timerLabel.textContent = label;
  };

  const getDraftFromForm = () => {
    const selected = assignmentSelect.selectedOptions[0];
    return {
      assignmentId: assignmentSelect.value,
      studentId: selected?.dataset?.studentId || '',
      date: qs('#date').value,
      startTime: qs('#startTime').value,
      endTime: qs('#endTime').value,
      mode: qs('#mode').value,
      location: qs('#location').value,
      notes: qs('#notes').value
    };
  };

  const applyDraftToForm = (draft) => {
    if (!draft) return;
    if (draft.assignmentId) assignmentSelect.value = draft.assignmentId;
    assignmentSelect.dispatchEvent(new Event('change'));
    if (draft.date) qs('#date').value = draft.date;
    if (draft.startTime) qs('#startTime').value = draft.startTime;
    if (draft.endTime) qs('#endTime').value = draft.endTime;
    if (draft.mode) qs('#mode').value = draft.mode;
    if (draft.location) qs('#location').value = draft.location;
    if (draft.notes) qs('#notes').value = draft.notes;
  };

  const renderAssignments = (assignments) => {
    assignmentsList = assignments;
    assignmentIndex.clear();
    assignmentSelect.innerHTML = assignmentsList
      .map((a) => `<option value="${a.id}" data-student="${escapeHtml(a.full_name)}" data-student-id="${a.student_id}" data-subject="${escapeHtml(a.subject)}">${escapeHtml(a.subject)} - ${escapeHtml(a.full_name)}</option>`)
      .join('');
    assignmentsList.forEach((a) => {
      assignmentIndex.set(a.id, {
        studentName: a.full_name,
        subject: a.subject,
        studentId: a.student_id
      });
    });

    if (subjectFilter) {
      const subjects = Array.from(new Set(assignmentsList.map((a) => a.subject))).sort();
      subjectFilter.innerHTML = '<option value="">All subjects</option>';
      subjects.forEach((subject) => {
        const option = document.createElement('option');
        option.value = subject;
        option.textContent = subject;
        subjectFilter.appendChild(option);
      });
    }
  };

  const loadAssignments = async () => {
    const cached = readAssignmentsCache();
    const now = Date.now();
    const isFresh = cached?.ts && (now - cached.ts) < ASSIGNMENTS_TTL;

    if (cached?.data?.assignments?.length) {
      renderAssignments(cached.data.assignments);
      if (isFresh) return;
    }

    try {
      const fresh = await apiGet('/tutor/assignments');
      if (fresh?.assignments?.length) {
        renderAssignments(fresh.assignments);
        writeAssignmentsCache(fresh);
      }
    } catch {
      // Prefer cached assignments on failure.
    }
  };

  await loadAssignments();

  const updateRecentStudents = (assignmentId) => {
    const assignment = assignmentIndex.get(assignmentId);
    if (!assignment) return;
    const existing = readRecentStudents().filter((item) => item.studentId !== assignment.studentId);
    const next = [{
      studentId: assignment.studentId,
      studentName: assignment.studentName,
      assignmentId,
      subject: assignment.subject,
      lastUsed: Date.now()
    }, ...existing].slice(0, 8);
    writeRecentStudents(next);
  };

  const updateStudentLabel = () => {
    const option = assignmentSelect.selectedOptions[0];
    const studentName = option?.dataset?.student || '--';
    const subject = option?.dataset?.subject || '';
    studentLabel.textContent = studentName;
    if (pickerBtn) {
      pickerBtn.textContent = studentName === '--' ? 'Choose student' : `${studentName} • ${subject}`;
    }
    if (option?.value) updateRecentStudents(option.value);
  };

  assignmentSelect.addEventListener('change', updateStudentLabel);
  assignmentSelect.dispatchEvent(new Event('change'));

  const storedTimer = loadTimerState();
  if (storedTimer?.running) {
    applyDraftToForm(storedTimer.draft);
    if (storedTimer.startedAt) {
      qs('#startTime').value = formatTimeLocal(new Date(storedTimer.startedAt));
    }
    showBanner('#resumeBanner', true);
    updateTimerStatus('Paused', 'Timer paused. Resume to continue.');
  } else {
    updateTimerStatus('Stopped', 'Timer idle.');
  }

  const updateConnectivityUI = () => {
    const offline = !navigator.onLine;
    if (offlineBanner) showBanner('#offlineBanner', offline);
    if (saveDraftBtn) saveDraftBtn.textContent = offline ? 'Save draft offline' : 'Save draft';
    if (offlineHelper) offlineHelper.style.display = offline ? 'block' : 'none';
    list?.querySelectorAll('[data-submit-session]').forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) return;
      button.disabled = offline;
      button.setAttribute('aria-disabled', offline ? 'true' : 'false');
      button.title = offline ? 'Submit disabled while offline.' : '';
    });
  };

  const setTimeError = (message) => {
    if (timeError) timeError.textContent = message || '';
    const isError = Boolean(message);
    qs('#startTime')?.setAttribute('aria-invalid', isError ? 'true' : 'false');
    qs('#endTime')?.setAttribute('aria-invalid', isError ? 'true' : 'false');
  };

  const renderRecentChips = () => {
    if (!recentContainer) return;
    const recents = readRecentStudents().sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    if (!recents.length) {
      recentContainer.innerHTML = '<div class="note">No recent students yet.</div>';
      return;
    }
    recentContainer.innerHTML = recents
      .map((item) => `<button type="button" class="chip" data-assignment-id="${item.assignmentId}">${escapeHtml(item.studentName)} • ${escapeHtml(item.subject)}</button>`)
      .join('');
  };

  const getFilteredAssignments = () => {
    const query = (searchInput?.value || '').trim().toLowerCase();
    const subject = subjectFilter?.value || '';
    return assignmentsList.filter((assignment) => {
      const matchesName = assignment.full_name.toLowerCase().includes(query);
      const matchesSubject = subject ? assignment.subject === subject : true;
      return matchesName && matchesSubject;
    });
  };

  const renderPickerList = () => {
    if (!pickerList) return;
    const filtered = getFilteredAssignments();
    if (!filtered.length) {
      pickerList.innerHTML = '<div class="note">No students match your search.</div>';
      return;
    }
    pickerList.innerHTML = filtered
      .map((assignment) => `<button type="button" class="picker-item" data-assignment-id="${assignment.id}">
        <div class="picker-item-title">${escapeHtml(assignment.full_name)}</div>
        <div class="picker-item-subtitle">${escapeHtml(assignment.subject)}</div>
      </button>`)
      .join('');
  };

  const openPicker = () => {
    if (!picker || !pickerOverlay) return;
    pickerOverlay.hidden = false;
    picker.classList.add('open');
    picker.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    renderRecentChips();
    renderPickerList();
    setTimeout(() => searchInput?.focus(), 50);
  };

  const closePicker = () => {
    if (!picker || !pickerOverlay) return;
    picker.classList.remove('open');
    picker.setAttribute('aria-hidden', 'true');
    pickerOverlay.hidden = true;
    document.body.style.overflow = '';
  };

  const selectAssignment = (assignmentId) => {
    if (!assignmentId) return;
    assignmentSelect.value = assignmentId;
    assignmentSelect.dispatchEvent(new Event('change'));
    closePicker();
  };

  const renderSessions = (data, drafts) => {
    latestDrafts = drafts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const offlineCards = latestDrafts.map((draft) => {
      const payload = draft.payload || draft;
      const assignment = assignmentIndex.get(payload.assignmentId) || {};
      const studentName = assignment.studentName || 'Student';
      const subject = assignment.subject || 'Assignment';
      return `<div class="panel">
          <div><strong>${escapeHtml(studentName)}</strong> ${renderStatus(OFFLINE_STATUS)}</div>
          <div class="note">${escapeHtml(payload.date || '')} ${escapeHtml(payload.startTime || '')}-${escapeHtml(payload.endTime || '')}</div>
          <div class="note">${escapeHtml(subject)} • Offline draft stored on this device.</div>
          <div class="session-actions">
            <button type="button" class="button secondary" data-edit-draft="${draft.id}">Edit draft</button>
          </div>
        </div>`;
    });

    const serverCards = data.sessions.map((s) => {
      const actions = s.status === 'DRAFT'
        ? `<div class="session-actions">
            <button type="button" class="button secondary" data-submit-session="${s.id}">Submit</button>
          </div>`
        : '';
      return `<div class="panel">
          <div><strong>${escapeHtml(s.student_name)}</strong> ${renderStatus(s.status)}</div>
          <div class="note">${escapeHtml(s.date)} ${escapeHtml(s.start_time)}-${escapeHtml(s.end_time)} (${s.duration_minutes} mins)</div>
          ${actions}
        </div>`;
    });

    const combined = [...offlineCards, ...serverCards];
    list.innerHTML = combined.length ? combined.join('') : '<div class="note">No sessions logged yet.</div>';
    updateConnectivityUI();
  };

  const loadSessions = async ({ preferCache } = {}) => {
    const drafts = await getDrafts();
    const cached = readSessionsCache();
    const isFresh = cached?.ts && (Date.now() - cached.ts) < SESSIONS_TTL;

    if (preferCache && cached?.data?.sessions?.length) {
      renderSessions(cached.data, drafts);
      if (isFresh || !navigator.onLine) return;
    }

    const data = await apiGet('/tutor/sessions');
    writeSessionsCache(data);
    renderSessions(data, drafts);
  };

  await loadSessions({ preferCache: true });
  updateConnectivityUI();
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    const elapsed = Math.round(perfStart ? performance.now() - perfStart : 0);
    console.info(`[perf] sessions TTI ${elapsed}ms`);
  }

  pickerBtn?.addEventListener('click', openPicker);
  closePickerBtn?.addEventListener('click', closePicker);
  pickerOverlay?.addEventListener('click', closePicker);
  searchInput?.addEventListener('input', renderPickerList);
  subjectFilter?.addEventListener('change', renderPickerList);
  recentContainer?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    selectAssignment(target.dataset.assignmentId);
  });
  pickerList?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('[data-assignment-id]');
    if (button instanceof HTMLButtonElement) {
      selectAssignment(button.dataset.assignmentId);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && picker?.classList.contains('open')) {
      closePicker();
    }
  });

  document.addEventListener('drafts-synced', loadSessions);

  window.addEventListener('online', async () => {
    updateConnectivityUI();
    await loadSessions({ preferCache: true });
  });
  window.addEventListener('offline', updateConnectivityUI);

  startBtn?.addEventListener('click', () => {
    timerStart = new Date();
    const dateEl = qs('#date');
    if (!dateEl.value) dateEl.value = formatDateLocal(timerStart);
    qs('#startTime').value = formatTimeLocal(timerStart);
    qs('#endTime').value = '';
    updateTimerStatus('Running', 'Timer running...');
    stopBtn.disabled = false;
    startBtn.disabled = true;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      const diff = Math.floor((Date.now() - timerStart.getTime()) / 60000);
      timerLabel.textContent = `Timer running: ${diff} min`;
    }, 1000);
    saveTimerState({
      running: true,
      startedAt: timerStart.getTime(),
      draft: getDraftFromForm()
    });
  });

  stopBtn?.addEventListener('click', () => {
    if (!timerStart) return;
    const end = new Date();
    qs('#endTime').value = formatTimeLocal(end);
    const diff = Math.max(1, Math.floor((end.getTime() - timerStart.getTime()) / 60000));
    updateTimerStatus('Stopped', `Timer stopped. Duration ${diff} min.`);
    stopBtn.disabled = true;
    startBtn.disabled = false;
    if (timerInterval) clearInterval(timerInterval);
    timerStart = null;
    clearTimerState();
  });

  resumeBtn?.addEventListener('click', () => {
    const state = loadTimerState();
    if (!state?.startedAt) return;
    timerStart = new Date(state.startedAt);
    showBanner('#resumeBanner', false);
    stopBtn.disabled = false;
    startBtn.disabled = true;
    updateTimerStatus('Running', 'Timer running...');
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      const diff = Math.floor((Date.now() - timerStart.getTime()) / 60000);
      timerLabel.textContent = `Timer running: ${diff} min`;
    }, 1000);
    saveTimerState({
      running: true,
      startedAt: timerStart.getTime(),
      draft: getDraftFromForm()
    });
  });

  discardBtn?.addEventListener('click', () => {
    clearTimerState();
    showBanner('#resumeBanner', false);
    updateTimerStatus('Stopped', 'Timer idle.');
    startBtn.disabled = false;
    stopBtn.disabled = true;
  });

  ['#assignmentSelect', '#date', '#mode', '#location', '#notes', '#startTime', '#endTime'].forEach((selector) => {
    const el = qs(selector);
    el?.addEventListener('input', () => {
      if (selector === '#startTime' || selector === '#endTime') {
        setTimeError('');
      }
      const state = loadTimerState();
      if (state?.running) {
        saveTimerState({
          ...state,
          draft: getDraftFromForm()
        });
      }
    });
  });

  window.addEventListener('beforeunload', (event) => {
    const state = loadTimerState();
    if (state?.running || timerStart) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    msg.textContent = '';
    setTimeError('');

    const draftKey = editingDraftId || crypto.randomUUID();
    const selected = assignmentSelect.selectedOptions[0];
    const payload = {
      assignmentId: assignmentSelect.value,
      studentId: selected.dataset.studentId,
      date: qs('#date').value,
      startTime: qs('#startTime').value,
      endTime: qs('#endTime').value,
      mode: qs('#mode').value,
      location: qs('#location').value,
      notes: qs('#notes').value,
      idempotencyKey: draftKey
    };

    if (payload.startTime && payload.endTime && payload.startTime >= payload.endTime) {
      setTimeError('End time must be after the start time.');
      return;
    }

    try {
      if (!navigator.onLine) {
        throw new Error('offline');
      }
      await apiPost('/tutor/sessions', payload);
      msg.textContent = 'Draft saved.';
      form.reset();
      editingDraftId = null;
      updateTimerStatus('Stopped', 'Timer idle.');
      clearTimerState();
      await loadSessions();
    } catch (err) {
      if (!navigator.onLine) {
        await saveDraft({
          id: draftKey,
          payload: { ...payload, idempotencyKey: draftKey },
          createdAt: Date.now(),
          status: OFFLINE_STATUS
        });
        editingDraftId = draftKey;
        msg.textContent = 'Offline: draft saved locally.';
        await loadSessions();
        listenOnlineSync();
      } else {
        msg.textContent = err.message || 'Unable to save draft.';
      }
    }
  });

  list?.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const submitBtn = target.closest('[data-submit-session]');
    if (submitBtn instanceof HTMLButtonElement) {
      if (!navigator.onLine) return;
      submitBtn.disabled = true;
      try {
        await apiPost(`/tutor/sessions/${submitBtn.dataset.submitSession}/submit`);
        toast('Draft submitted.');
        await loadSessions();
      } catch (err) {
        msg.textContent = err.message || 'Unable to submit draft.';
      } finally {
        submitBtn.disabled = false;
      }
    }

    const editBtn = target.closest('[data-edit-draft]');
    if (editBtn instanceof HTMLButtonElement) {
      const draft = latestDrafts.find((item) => item.id === editBtn.dataset.editDraft);
      if (!draft) return;
      applyDraftToForm(draft.payload || draft);
      editingDraftId = draft.id;
      msg.textContent = 'Offline draft loaded. Edit and save when ready.';
    }
  });

  qs('.tag-row')?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const tag = target.dataset.tag;
    if (!tag) return;
    const notes = qs('#notes');
    const prefix = notes.value.trim().length ? `${notes.value.trim()}\n` : '';
    notes.value = `${prefix}${tag}: `;
    notes.focus();
    if (loadTimerState()?.running) {
      saveTimerState({
        running: true,
        startedAt: timerStart?.getTime() || Date.now(),
        draft: getDraftFromForm()
      });
    }
  });
}

const page = document.body.dataset.page;

initImpersonationBanner();

if (page === 'login') initLogin();
if (page === 'home') initTutorHome();
if (page === 'sessions') initSessions();
if (page === 'assignments') initAssignments();
if (page === 'payroll') initPayroll();
if (page === 'invoices') initInvoices();
