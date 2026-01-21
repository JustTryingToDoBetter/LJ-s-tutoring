(function () {
  "use strict";

  const DEFAULTS = {
    endpoint: "", // set in HTML: window.PO_ERROR_MONITOR.endpoint
    sampleRate: 1,
    timeoutMs: 4000,
    dedupeWindowMs: 30000,
  };

  const cfg = (() => {
    const c = (window && window.PO_ERROR_MONITOR) || {};
    return {
      endpoint: typeof c.endpoint === "string" ? c.endpoint : DEFAULTS.endpoint,
      sampleRate:
        typeof c.sampleRate === "number" && isFinite(c.sampleRate)
          ? Math.max(0, Math.min(1, c.sampleRate))
          : DEFAULTS.sampleRate,
    };
  })();

  function shouldSend() {
    if (!cfg.endpoint) return false;
    if (cfg.sampleRate >= 1) return true;
    if (cfg.sampleRate <= 0) return false;
    return Math.random() < cfg.sampleRate;
  }

  function nowIso() {
    try { return new Date().toISOString(); } catch { return ""; }
  }

  function short(s, n) {
    s = String(s || "");
    return s.length > n ? s.slice(0, n) + "…" : s;
  }

  function hash32(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h.toString(16);
  }

  const lastSeen = new Map();
  function dedup(key) {
    const t = Date.now();
    const prev = lastSeen.get(key);
    if (prev && t - prev < DEFAULTS.dedupeWindowMs) return true;
    lastSeen.set(key, t);
    // prune
    if (lastSeen.size > 100) {
      const first = lastSeen.keys().next().value;
      lastSeen.delete(first);
    }
    return false;
  }

  function context() {
    const loc = window.location;
    const nav = window.navigator;
    return {
      url: loc?.href || "",
      path: loc?.pathname || "",
      referrer: document?.referrer || "",
      userAgent: nav?.userAgent || "",
      language: nav?.language || "",
      viewport: { w: window.innerWidth || 0, h: window.innerHeight || 0, dpr: window.devicePixelRatio || 1 },
    };
  }

  function normalizeError(e) {
    if (!e) return { name: "", message: "Unknown error", stack: "" };
    return {
      name: short(e.name || "", 120),
      message: short(e.message || String(e), 600),
      stack: short(e.stack || "", 2000),
    };
  }

  function post(payload) {
    if (!shouldSend()) return;

    const body = JSON.stringify(payload);

    // best effort, never break the page
    try {
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {} }, DEFAULTS.timeoutMs) : null;

      fetch(cfg.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        signal: ctrl ? ctrl.signal : undefined,
      }).catch(() => {}).finally(() => {
        if (timer) clearTimeout(timer);
      });
    } catch {}
  }

  function capture(type, data, fingerprintParts) {
    const payload = {
      v: 1,
      ts: nowIso(),
      type,
      ctx: context(),
      ...data,
    };

    const fp = hash32([type, ...(fingerprintParts || [])].join("|"));
    payload.fingerprint = fp;

    if (dedup(fp)) return;
    post(payload);
  }

  window.addEventListener("error", function (event) {
    try {
      const err = normalizeError(event?.error);
      const src = short(event?.filename || "", 400);
      const line = typeof event?.lineno === "number" ? event.lineno : null;
      const col = typeof event?.colno === "number" ? event.colno : null;

      capture(
        "error",
        { error: err, source: { file: src, line, col } },
        [err.name, err.message, src, String(line), String(col)]
      );
    } catch {}
  });

  window.addEventListener("unhandledrejection", function (event) {
    try {
      const err = normalizeError(event?.reason);
      capture("unhandledrejection", { error: err }, [err.name, err.message]);
    } catch {}
  });
})();
