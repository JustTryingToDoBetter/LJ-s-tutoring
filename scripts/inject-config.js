#!/usr/bin/env node
/**
 * ============================================================================
 * CONFIG INJECTION SCRIPT
 * ============================================================================
 *
 * PURPOSE:
 * - Inject env vars into dist/assets/app-critical.js at build time (Node).
 * - Contains a browser-only error monitor snippet; MUST NOT execute in Node.
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Paths
const distAssetsDir = path.join(__dirname, "..", "dist", "assets");
const appCriticalPath = path.join(distAssetsDir, "app-critical.js");

// Validate target exists
if (!fs.existsSync(appCriticalPath)) {
  console.warn("⚠️  Warning: app-critical.js not found in dist/assets/");
  console.warn("    Config injection skipped. Build may use hardcoded values.");
  process.exit(0);
}

// Read file
let content = fs.readFileSync(appCriticalPath, "utf8");

// Countdown
const countdownDateStr = process.env.COUNTDOWN_DATE || "2026-02-15T17:00:00";
const countdownDate = new Date(countdownDateStr);

// Build CONFIG replacement
const configReplacement = `  const CONFIG = {
    whatsappNumber: '${process.env.WHATSAPP_NUMBER || "27679327754"}',
    formspreeEndpoint: '${process.env.FORMSPREE_ENDPOINT || "https://formspree.io/f/xreebzqa"}',
    email: '${process.env.CONTACT_EMAIL || "projectodysseus10@gmail.com"}',
    countdownDate: new Date(${countdownDate.getFullYear()}, ${countdownDate.getMonth()}, ${countdownDate.getDate()}, ${countdownDate.getHours()}, ${countdownDate.getMinutes()}, 0),
  };`;

// Replace CONFIG
const configPattern = /const CONFIG = \{[\s\S]*?\};/;
if (configPattern.test(content)) {
  content = content.replace(configPattern, configReplacement);
  fs.writeFileSync(appCriticalPath, content, "utf8");

  console.log("✅ Injected environment configuration into app-critical.js");
  console.log(`   - WhatsApp: ${process.env.WHATSAPP_NUMBER || "(default)"}`);
  console.log(`   - Formspree: ${process.env.FORMSPREE_ENDPOINT || "(default)"}`);
  console.log(`   - Email: ${process.env.CONTACT_EMAIL || "(default)"}`);
  console.log(`   - Countdown: ${countdownDateStr}`);
} else {
  console.warn("⚠️  Warning: Could not find CONFIG object pattern in app-critical.js");
  console.warn("    Expected: const CONFIG = { ... };");
}

/**
 * ============================================================================
 * Browser-only Error Monitor Snippet
 * ============================================================================
 * This block is SAFE in Node because it bails immediately unless it’s a browser.
 * (It’s fine for it to exist in the script file; it just must not execute.)
 */
(function () {
  "use strict";

  // ✅ Critical guard: never run in Node/build.
  const isBrowser =
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    typeof globalThis !== "undefined" &&
    typeof globalThis.addEventListener === "function";

  if (!isBrowser) return;

  const DEFAULTS = {
    endpoint: "",
    sampleRate: 1,
    timeoutMs: 4000,
    dedupeWindowMs: 30000,
  };

  const cfg = (() => {
    const c = globalThis.PO_ERROR_MONITOR || {};
    return {
      endpoint: typeof c.endpoint === "string" ? c.endpoint : DEFAULTS.endpoint,
      sampleRate:
        typeof c.sampleRate === "number" && Number.isFinite(c.sampleRate)
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
    if (lastSeen.size > 100) {
      const first = lastSeen.keys().next().value;
      lastSeen.delete(first);
    }
    return false;
  }

  function context() {
    const loc = globalThis.location;
    const nav = globalThis.navigator;
    return {
      url: loc?.href || "",
      path: loc?.pathname || "",
      referrer: document.referrer || "",
      userAgent: nav?.userAgent || "",
      language: nav?.language || "",
      viewport: {
        w: globalThis.innerWidth || 0,
        h: globalThis.innerHeight || 0,
        dpr: globalThis.devicePixelRatio || 1,
      },
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
    try {
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctrl
        ? setTimeout(() => { try { ctrl.abort(); } catch {} }, DEFAULTS.timeoutMs)
        : null;

      fetch(cfg.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        signal: ctrl ? ctrl.signal : undefined,
      })
        .catch(() => {})
        .finally(() => { if (timer) clearTimeout(timer); });
    } catch {}
  }

  function capture(type, data, fingerprintParts) {
    const payload = { v: 1, ts: nowIso(), type, ctx: context(), ...data };
    const fp = hash32([type, ...(fingerprintParts || [])].join("|"));
    payload.fingerprint = fp;
    if (dedup(fp)) return;
    post(payload);
  }

  globalThis.addEventListener("error", function (event) {
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

  globalThis.addEventListener("unhandledrejection", function (event) {
    try {
      const err = normalizeError(event?.reason);
      capture("unhandledrejection", { error: err }, [err.name, err.message]);
    } catch {}
  });
})();
