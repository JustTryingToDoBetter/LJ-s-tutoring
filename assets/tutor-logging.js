
// assets/tutor-logging.js
// Minimal Tutor Logging UI for the static frontend.

const API_BASE = (window.__PO_API_BASE__ || "http://localhost:3001").replace(/\/$/, "");

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
  els.studentSelect.innerHTML = "";
  for (const s of students) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.last_name}, ${s.first_name}${s.grade ? ` (Grade ${s.grade})` : ""}`;
    els.studentSelect.appendChild(opt);
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderSessions(sessions) {
  els.sessionsList.innerHTML = "";
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

    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-sm font-medium">${s.student_last_name}, ${s.student_first_name}</div>
          <div class="text-xs text-slate-400 mt-1">${start.toLocaleString()} → ${end.toLocaleString()} • ${mins} min</div>
        </div>
      </div>
      ${s.notes ? `<div class="text-sm text-slate-200 mt-2 whitespace-pre-wrap">${escapeHtml(s.notes)}</div>` : ""}
    `;
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

  try {
    await api("/tutor/sessions", {
      method: "POST",
      body: JSON.stringify({
        studentId: els.studentSelect.value,
        startAt: isoFromDatetimeLocal(els.startAt.value),
        endAt: isoFromDatetimeLocal(els.endAt.value),
        notes: els.notes.value,
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
