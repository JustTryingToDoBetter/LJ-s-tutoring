/* arcade-error-boundary.js
   Captures runtime errors + unhandled promise rejections and shows a recoverable UI.
*/

export function installArcadeErrorBoundary({ mountEl, onRecover } = {}) {
  if (!mountEl) throw new Error("installArcadeErrorBoundary: mountEl required");

  const state = {
    lastError: null,
    lastRejection: null,
    ring: [],
    ringMax: 40,
  };

  // Lightweight console capture (optional but useful)
  const original = {
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    log: console.log.bind(console),
  };

  function pushRing(level, args) {
    const entry = {
      t: new Date().toISOString(),
      level,
      msg: args.map(a => (typeof a === "string" ? a : safeStringify(a))).join(" "),
    };
    state.ring.push(entry);
    if (state.ring.length > state.ringMax) state.ring.shift();
  }

  console.error = (...args) => { pushRing("error", args); original.error(...args); };
  console.warn  = (...args) => { pushRing("warn", args);  original.warn(...args);  };
  console.log   = (...args) => { pushRing("log", args);   original.log(...args);   };

  function safeStringify(v) {
    try { return JSON.stringify(v); } catch { return String(v); }
  }

  async function getSWStatus() {
    try {
      if (!("serviceWorker" in navigator)) return { supported: false };
      const reg = await navigator.serviceWorker.getRegistration();
      return {
        supported: true,
        controller: !!navigator.serviceWorker.controller,
        scope: reg?.scope || null,
        waiting: !!reg?.waiting,
        installing: !!reg?.installing,
        active: !!reg?.active,
      };
    } catch (e) {
      return { supported: true, error: String(e) };
    }
  }

  async function buildReport(kind, err) {
    const sw = await getSWStatus();
    return {
      kind,
      time: new Date().toISOString(),
      location: String(location.href),
      ua: navigator.userAgent,
      viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
      online: navigator.onLine,
      sw,
      error: normalizeError(err),
      recentLogs: state.ring.slice(-25),
    };
  }

  function normalizeError(err) {
    if (!err) return null;
    if (err instanceof Error) {
      return { name: err.name, message: err.message, stack: err.stack || null };
    }
    return { message: String(err) };
  }

  function renderCrashUI(report) {
    // Minimal styling; inherits your design system colors
    mountEl.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "po-crash";

    wrap.style.padding = "16px";
    wrap.style.borderRadius = "16px";
    wrap.style.border = "1px solid rgba(255,255,255,.12)";
    wrap.style.background = "rgba(20,20,24,.72)";
    wrap.style.color = "white";
    wrap.style.maxWidth = "720px";
    wrap.style.margin = "24px auto";

    const title = document.createElement("div");
    title.textContent = "Something broke in the arcade";
    title.style.fontWeight = "800";
    title.style.fontSize = "16px";

    const sub = document.createElement("div");
    sub.textContent = "You can recover without losing the whole site.";
    sub.style.opacity = ".85";
    sub.style.marginTop = "6px";
    sub.style.fontSize = "13px";

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.flexWrap = "wrap";
    actions.style.gap = "10px";
    actions.style.marginTop = "14px";

    const btn = (label, fn, primary = false) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cursor = "pointer";
      b.style.borderRadius = "12px";
      b.style.padding = "10px 12px";
      b.style.fontWeight = "800";
      b.style.fontSize = "12px";
      b.style.border = "1px solid rgba(255,255,255,.18)";
      b.style.background = primary ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.10)";
      b.style.color = "white";
      b.addEventListener("click", fn);
      return b;
    };

    const pre = document.createElement("pre");
    pre.style.marginTop = "14px";
    pre.style.padding = "12px";
    pre.style.borderRadius = "12px";
    pre.style.background = "rgba(0,0,0,.35)";
    pre.style.overflow = "auto";
    pre.style.fontSize = "11px";
    pre.textContent = JSON.stringify(report, null, 2);

    actions.append(
      btn("Reload game", () => onRecover?.("reload"), true),
      btn("Back to arcade", () => onRecover?.("back")),
      btn("Copy report", async () => {
        try {
          await navigator.clipboard.writeText(pre.textContent);
        } catch {
          // fallback: select text
          const r = document.createRange();
          r.selectNodeContents(pre);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
        }
      }),
      btn("Hard refresh (clear caches)", async () => {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.filter(k => k.startsWith("po-")).map(k => caches.delete(k)));
        } catch {}
        location.reload();
      })
    );

    wrap.append(title, sub, actions, pre);
    mountEl.appendChild(wrap);
  }

  async function handle(kind, err) {
    const report = await buildReport(kind, err);
    renderCrashUI(report);
  }

  // Attach listeners
  const onErr = (e) => {
    state.lastError = e.error || e.message;
    handle("error", e.error || e.message);
  };
  const onRej = (e) => {
    state.lastRejection = e.reason;
    handle("unhandledrejection", e.reason);
  };

  window.addEventListener("error", onErr);
  window.addEventListener("unhandledrejection", onRej);

  return {
    uninstall() {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
      console.error = original.error;
      console.warn = original.warn;
      console.log = original.log;
    },
    triggerTestCrash() {
      Promise.reject(new Error("Test rejection"));
    },
  };
}