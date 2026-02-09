
// assets/tutor-logging.js
// Minimal Tutor Logging UI for the static frontend.

function resolveApiBase() {
  const raw = window.__PO_API_BASE__;
  if (!raw || raw === "__PO_API_BASE__") {
    throw new Error("api_base_missing");
  }
  return String(raw).replace(/\/$/, "");
}

const API_BASE = resolveApiBase();

const els = {
  authCard: document.getElementById("authCard"),
  logCard: document.getElementById("logCard"),
  loginForm: document.getElementById("loginForm"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  loginMsg: document.getElementById("loginMsg"),
  logoutBtn: document.getElementById("logoutBtn"),
  studentSelect: document.getElementById("studentSelect"),
  logForm: document.getElementById("logForm"),
  startAt: document.getElementById("startAt"),
  endAt: document.getElementById("endAt"),
  notes: document.getElementById("notes"),
  notesCount: document.getElementById("notesCount"),
  logMsg: document.getElementById("logMsg"),
  sessionsList: document.getElementById("sessionsList"),
};

function containsHtmlTags(value) {
  return /<\/?[a-z][^>]*>/i.test(String(value || ""));
}

function setMsg(el, text, kind = "error") {
  el.textContent = text;
  el.classList.remove("hidden", "text-rose-300", "text-emerald-300");
  el.classList.add(kind === "ok" ? "text-emerald-300" : "text-rose-300");
}

function hideMsg(el) {
  el.classList.add("hidden");
  el.textContent = "";
}

function tokenGet() {
  return sessionStorage.getItem("lms_token") || "";
}
function tokenSet(t) {
  sessionStorage.setItem("lms_token", t);
}
function tokenClear() {
  sessionStorage.removeItem("lms_token");
}

async function api(path, opts = {}) {
  const headers = new Headers(opts.headers || {});
  headers.set("Content-Type", "application/json");
  const t = tokenGet();
  if (t) headers.set("Authorization", `Bearer ${t}`);

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(body?.error || `http_${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

function showLoggedIn() {
  els.authCard.classList.add("hidden");
  els.logCard.classList.remove("hidden");
}
function showLoggedOut() {
  els.logCard.classList.add("hidden");
  els.authCard.classList.remove("hidden");
}

function isoFromDatetimeLocal(value) {
  const d = new Date(value);
  return d.toISOString();
}

function renderStudents(students) {
  els.studentSelect.replaceChildren();
  for (const s of students) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.last_name}, ${s.first_name}${s.grade ? ` (Grade ${s.grade})` : ""}`;
    els.studentSelect.appendChild(opt);
  }
}

function renderSessions(sessions) {
  els.sessionsList.replaceChildren();
  if (!sessions.length) {
    const empty = document.createElement("div");
    empty.className = "text-sm text-slate-400";
    empty.textContent = "No sessions logged yet.";
    els.sessionsList.appendChild(empty);
    return;
  }

  for (const s of sessions) {
    const card = document.createElement("div");
    card.className = "rounded-xl border border-slate-800 bg-slate-950/30 p-3";

    const start = new Date(s.start_at);
    const end = new Date(s.end_at);
    const mins = Math.round((end - start) / 60000);

    const header = document.createElement("div");
    header.className = "flex items-start justify-between gap-3";

    const details = document.createElement("div");
    const title = document.createElement("div");
    title.className = "text-sm font-medium";
    title.textContent = `${s.student_last_name}, ${s.student_first_name}`;

    const meta = document.createElement("div");
    meta.className = "text-xs text-slate-400 mt-1";
    meta.textContent = `${start.toLocaleString()} → ${end.toLocaleString()} • ${mins} min`;

    details.append(title, meta);
    header.append(details);
    card.append(header);

    if (s.notes) {
      const notes = document.createElement("div");
      notes.className = "text-sm text-slate-200 mt-2 whitespace-pre-wrap";
      notes.textContent = s.notes;
      card.append(notes);
    }
    els.sessionsList.appendChild(card);
  }
}

async function refreshStudentsAndSessions() {
  const { students } = await api("/tutor/students");
  renderStudents(students);

  const { sessions } = await api("/tutor/sessions");
  renderSessions(sessions);
}

els.notes.addEventListener("input", () => {
  els.notesCount.textContent = `${els.notes.value.length} / 2000`;
});

els.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideMsg(els.loginMsg);

  try {
    const body = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: els.email.value, password: els.password.value }),
    });

    tokenSet(body.token);
    showLoggedIn();
    await refreshStudentsAndSessions();
  } catch {
    setMsg(els.loginMsg, "Login failed. Check your email/password.");
  }
});

els.logoutBtn.addEventListener("click", () => {
  tokenClear();
  showLoggedOut();
});

els.logForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideMsg(els.logMsg);

  if (containsHtmlTags(els.notes.value)) {
    setMsg(els.logMsg, "Please remove HTML tags from notes.");
    return;
  }

  try {
    await api("/tutor/sessions", {
      method: "POST",
      body: JSON.stringify({
        studentId: els.studentSelect.value,
        startAt: isoFromDatetimeLocal(els.startAt.value),
        endAt: isoFromDatetimeLocal(els.endAt.value),
        notes: els.notes.value.trim(),
      }),
    });

    setMsg(els.logMsg, "Session logged successfully.", "ok");
    els.notes.value = "";
    els.notesCount.textContent = "0 / 2000";

    const { sessions } = await api("/tutor/sessions");
    renderSessions(sessions);
  } catch (err) {
    if (err.status === 409 && err.body?.error === "overlapping_session") {
      setMsg(els.logMsg, "That session overlaps an existing one. Adjust the time range.");
    } else if (err.body?.error === "cannot_log_future_sessions") {
      setMsg(els.logMsg, "Future sessions cannot be logged.");
    } else if (err.body?.error === "student_not_assigned_to_tutor") {
      setMsg(els.logMsg, "You are not assigned to that student.");
    } else {
      setMsg(els.logMsg, "Could not log session. Please try again.");
    }
  }
});

(async () => {
  if (!tokenGet()) return;

  try {
    showLoggedIn();
    await refreshStudentsAndSessions();
  } catch {
    tokenClear();
    showLoggedOut();
  }
})();
