#!/usr/bin/env node
/**
 * ============================================================================
 * CONFIG INJECTION SCRIPT
 * ============================================================================
 *
 * PURPOSE:
 * This script reads environment variables from .env file and injects them into
 * the CONFIG object in the built app-critical.js file. This enables environment-
 * specific builds (dev/staging/production) without hardcoding sensitive data.
 * 
 * HOW IT FITS IN THE SYSTEM:
 * - Runs during build process AFTER JS files are copied to dist/assets/
 * - Called by: npm run inject:config (part of npm run build)
 * - Sequence: prebuild → build:* (copy/compile) → inject:config
 * - Modifies dist/assets/app-critical.js (CONFIG) and built HTML (PO_ERROR_MONITOR)
 * 
 * RULES ENFORCED:
 * - Configuration centralized in .env file (single source of truth)
 * - Fallback to safe defaults if .env missing (fail-safe, not fail-fast)
 * - Same source code can produce different builds for different environments
 * 
 * DEPENDENCIES:
 * - dotenv: Loads .env file into process.env
 * - fs: Node.js file system module for reading/writing files
 * - path: Node.js path utilities for cross-platform file paths
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

// ============================================================================
// Inject error-monitor config into built HTML
// ============================================================================

function escapeJsString(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '')
    .replace(/\n/g, '');
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

function clamp01(n) {
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

function listHtmlFiles(dir) {
  /** @type {string[]} */
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const it of items) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) out.push(...listHtmlFiles(p));
    else if (it.isFile() && p.endsWith('.html')) out.push(p);
  }
  return out;
}

function injectErrorMonitorConfigIntoHtml() {
  const endpoint = escapeJsString(errorMonitorEndpoint);
  const sampleRate = clamp01(errorMonitorSampleRate);

  const files = listHtmlFiles(distDir);
  if (!files.length) return;

  const assignPattern = /window\.PO_ERROR_MONITOR\s*=\s*\{[\s\S]*?\};/g;
  const replacement = `window.PO_ERROR_MONITOR = { endpoint: '${endpoint}', sampleRate: ${sampleRate} };`;
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

  let touched = 0;
  for (const f of files) {
    const html = fs.readFileSync(f, 'utf8');
    if (!assignPattern.test(html)) continue;

    const next = html.replace(assignPattern, replacement);
    if (next !== html) {
      fs.writeFileSync(f, next, 'utf8');
      touched++;
    }
  }

  if (touched) {
    console.log(`✅ Injected PO_ERROR_MONITOR config into ${touched} HTML file(s)`);
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
}

injectErrorMonitorConfigIntoHtml();
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
