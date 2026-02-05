import { apiGet, apiPost, apiPatch, qs, renderStatus, formatMoney, setActiveNav, showBanner, setText, escapeHtml } from '/assets/portal-shared.js';

const DB_NAME = 'tutor-offline';
const STORE = 'drafts';

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

async function getDrafts() {
  const db = await openDb();
  if (!db) {
    return JSON.parse(localStorage.getItem('drafts') || '[]');
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
    const existing = JSON.parse(localStorage.getItem('drafts') || '[]');
    existing.push(draft);
    localStorage.setItem('drafts', JSON.stringify(existing));
    return;
  }
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(draft);
}

async function clearDrafts() {
  const db = await openDb();
  if (!db) {
    localStorage.removeItem('drafts');
    return;
  }
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).clear();
}

async function syncDrafts() {
  const drafts = await getDrafts();
  if (!drafts.length) return { synced: 0 };

  let synced = 0;
  for (const draft of drafts) {
    try {
      await apiPost('/tutor/sessions', draft.payload);
      synced += 1;
    } catch {
      break;
    }
  }
  if (synced === drafts.length) await clearDrafts();
  return { synced };
}

function listenOnlineSync() {
  const syncBtn = qs('#syncDraftsBtn');
  if (!syncBtn) return;

  const refreshBanner = async () => {
    const drafts = await getDrafts();
    showBanner('#syncBanner', drafts.length > 0 && navigator.onLine);
    setText('#syncCount', String(drafts.length));
  };

  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    const result = await syncDrafts();
    syncBtn.disabled = false;
    await refreshBanner();
    if (result.synced > 0) alert(`Synced ${result.synced} draft(s).`);
  });

  window.addEventListener('online', refreshBanner);
  window.addEventListener('offline', refreshBanner);
  refreshBanner();
}

async function initLogin() {
  setActiveNav('login');
  const form = qs('#loginForm');
  const msg = qs('#loginMsg');
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
  sessionsEl.innerHTML = sessions.sessions.length
    ? sessions.sessions.map((s) => `<div class="panel">${escapeHtml(s.student_name)} ${renderStatus(s.status)}</div>`).join('')
    : '<div class="note">No sessions logged today.</div>';

  const assignments = await apiGet('/tutor/assignments');
  upcomingEl.innerHTML = assignments.assignments.length
    ? assignments.assignments.slice(0, 3).map((a) => `<div class="panel">${escapeHtml(a.subject)} with ${escapeHtml(a.full_name)}</div>`).join('')
    : '<div class="note">No active assignments yet.</div>';
}

async function initAssignments() {
  setActiveNav('assignments');
  const list = qs('#assignmentList');
  const data = await apiGet('/tutor/assignments');
  list.innerHTML = data.assignments
    .map((a) => `<div class="panel">
        <div><strong>${escapeHtml(a.subject)}</strong> - ${escapeHtml(a.full_name)}</div>
        <div class="note">${escapeHtml(a.start_date)} to ${escapeHtml(a.end_date || 'open-ended')}</div>
      </div>`)
    .join('');
}

async function initPayroll() {
  setActiveNav('payroll');
  const list = qs('#payrollList');
  const data = await apiGet('/tutor/payroll/weeks');
  list.innerHTML = data.weeks.length
    ? data.weeks.map((w) => {
        const adjustments = (w.adjustments || [])
          .map((adj) => `<div class="note">${escapeHtml(adj.type)}: ${formatMoney(adj.signed_amount)} - ${escapeHtml(adj.reason)}</div>`)
          .join('');
        return `<div class="panel">
          <div class="split"><strong>${escapeHtml(w.week_start)}</strong> ${renderStatus(w.status)}</div>
          <div>${w.total_minutes} mins</div>
          <div>${formatMoney(w.total_amount)}</div>
          ${adjustments ? `<div style="margin-top:8px;">${adjustments}</div>` : ''}
        </div>`;
      }).join('')
    : '<div class="note">No approved sessions yet.</div>';
}

async function initInvoices() {
  setActiveNav('invoices');
  const list = qs('#invoiceList');
  const data = await apiGet('/tutor/invoices');
  list.innerHTML = data.invoices.length
    ? data.invoices.map((inv) => `<div class="panel">
        <div><strong>${escapeHtml(inv.invoice_number)}</strong></div>
        <div>${escapeHtml(inv.period_start)} to ${escapeHtml(inv.period_end)}</div>
        <div>${formatMoney(inv.total_amount)}</div>
        <div class="note"><a href="/tutor/invoices/${inv.id}" target="_blank">HTML</a> | <a href="/tutor/invoices/${inv.id}.pdf">PDF</a></div>
      </div>`).join('')
    : '<div class="note">No invoices yet.</div>';
}

async function initSessions() {
  setActiveNav('sessions');
  listenOnlineSync();

  const assignmentSelect = qs('#assignmentSelect');
  const studentLabel = qs('#studentLabel');
  const list = qs('#sessionsList');
  const form = qs('#sessionForm');
  const msg = qs('#sessionMsg');
  const timerLabel = qs('#timerLabel');
  const startBtn = qs('#startTimer');
  const stopBtn = qs('#stopTimer');

  let timerStart = null;
  let timerInterval = null;

  const assignments = await apiGet('/tutor/assignments');
  assignmentSelect.innerHTML = assignments.assignments
    .map((a) => `<option value="${a.id}" data-student="${escapeHtml(a.full_name)}" data-student-id="${a.student_id}">${escapeHtml(a.subject)} - ${escapeHtml(a.full_name)}</option>`)
    .join('');

  assignmentSelect.addEventListener('change', () => {
    const option = assignmentSelect.selectedOptions[0];
    studentLabel.textContent = option?.dataset?.student || '--';
  });
  assignmentSelect.dispatchEvent(new Event('change'));

  const loadSessions = async () => {
    const data = await apiGet('/tutor/sessions');
    list.innerHTML = data.sessions.length
      ? data.sessions.map((s) => `<div class="panel">
          <div><strong>${escapeHtml(s.student_name)}</strong> ${renderStatus(s.status)}</div>
          <div class="note">${escapeHtml(s.date)} ${escapeHtml(s.start_time)}-${escapeHtml(s.end_time)} (${s.duration_minutes} mins)</div>
        </div>`).join('')
      : '<div class="note">No sessions logged yet.</div>';
  };

  await loadSessions();

  startBtn?.addEventListener('click', () => {
    timerStart = new Date();
    qs('#startTime').value = timerStart.toISOString().slice(11, 16);
    timerLabel.textContent = 'Timer running...';
    stopBtn.disabled = false;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      const diff = Math.floor((Date.now() - timerStart.getTime()) / 60000);
      timerLabel.textContent = `Timer running: ${diff} min`;
    }, 1000 * 10);
  });

  stopBtn?.addEventListener('click', () => {
    if (!timerStart) return;
    const end = new Date();
    qs('#endTime').value = end.toISOString().slice(11, 16);
    timerLabel.textContent = 'Timer stopped.';
    stopBtn.disabled = true;
    if (timerInterval) clearInterval(timerInterval);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    msg.textContent = '';

    const idempotencyKey = crypto.randomUUID();
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
      idempotencyKey
    };

    try {
      if (!navigator.onLine) {
        throw new Error('offline');
      }
      await apiPost('/tutor/sessions', payload);
      msg.textContent = 'Draft saved.';
      form.reset();
      await loadSessions();
    } catch (err) {
      await saveDraft({ id: crypto.randomUUID(), payload, createdAt: Date.now() });
      msg.textContent = 'Offline: draft saved locally.';
      listenOnlineSync();
    }
  });
}

const page = document.body.dataset.page;

if (page === 'login') initLogin();
if (page === 'home') initTutorHome();
if (page === 'sessions') initSessions();
if (page === 'assignments') initAssignments();
if (page === 'payroll') initPayroll();
if (page === 'invoices') initInvoices();
