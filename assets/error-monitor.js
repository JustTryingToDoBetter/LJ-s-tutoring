/**
 * Project Odysseus – Lightweight Frontend Error Monitoring
 *
 * Captures:
 * - window 'error'
 * - window 'unhandledrejection'
 *
 * Sends JSON to a configurable endpoint (free option: Cloudflare Worker).
 *
 * Configure in HTML <head> (before this script loads):
 *   window.PO_ERROR_MONITOR = {
 *     endpoint: 'https://your-worker.workers.dev/api/errors',
 *     sampleRate: 1
 *   };
 */

(function () {
  'use strict';

  const DEFAULTS = {
    endpoint: '',
    sampleRate: 1,
    timeoutMs: 4000,
    maxDedupe: 64,
  };

  function safeGetConfig() {
    const cfg = (window && window.PO_ERROR_MONITOR) || {};
    const endpoint = typeof cfg.endpoint === 'string' ? cfg.endpoint : DEFAULTS.endpoint;
    const sampleRate =
      typeof cfg.sampleRate === 'number' && isFinite(cfg.sampleRate)
        ? Math.max(0, Math.min(1, cfg.sampleRate))
        : DEFAULTS.sampleRate;
    return { endpoint, sampleRate };
  }

  function nowIso() {
    try {
      return new Date().toISOString();
    } catch (_) {
      return '';
    }
  }

  function shortString(value, maxLen) {
    const s = String(value || '');
    return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
  }

  function getPageContext() {
    const loc = window.location;
    const nav = window.navigator;

    return {
      url: loc && loc.href ? loc.href : '',
      path: loc && loc.pathname ? loc.pathname : '',
      referrer: document && document.referrer ? document.referrer : '',
      userAgent: nav && nav.userAgent ? nav.userAgent : '',
      language: nav && nav.language ? nav.language : '',
      viewport: {
        w: window.innerWidth || 0,
        h: window.innerHeight || 0,
        dpr: window.devicePixelRatio || 1,
      },
    };
  }

  // Tiny non-cryptographic hash for dedupe keys
  function hash32(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h.toString(16);
  }

  const dedupe = new Map();
  function seenRecently(key) {
    const t = Date.now();
    const prev = dedupe.get(key);
    // 30s window for burst dedupe
    if (prev && t - prev < 30000) {return true;}
    dedupe.set(key, t);
    // prune
    if (dedupe.size > DEFAULTS.maxDedupe) {
      const firstKey = dedupe.keys().next().value;
      dedupe.delete(firstKey);
    }
    return false;
  }

  function shouldSend(sampleRate) {
    if (sampleRate >= 1) {return true;}
    if (sampleRate <= 0) {return false;}
    return Math.random() < sampleRate;
  }

  function send(payload) {
    const cfg = safeGetConfig();
    if (!cfg.endpoint) {return;}
    if (!shouldSend(cfg.sampleRate)) {return;}

    const body = JSON.stringify(payload);

    // Prefer sendBeacon (non-blocking, survives unload). Fallback to fetch.
    try {
      if (navigator && typeof navigator.sendBeacon === 'function') {
        const ok = navigator.sendBeacon(cfg.endpoint, new Blob([body], { type: 'application/json' }));
        if (ok) {return;}
      }
    } catch (_) {
      // ignore
      void 0;
    }

    try {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctrl
        ? setTimeout(function () {
            try {
              ctrl.abort();
            } catch (_) {
              // ignore
              void 0;
            }
          }, DEFAULTS.timeoutMs)
        : null;

      fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
        signal: ctrl ? ctrl.signal : undefined,
      }).catch(function () {
        // swallow errors – monitoring must never crash the page
      }).finally(function () {
        if (timer) {clearTimeout(timer);}
      });
    } catch (_) {
      // ignore
      void 0;
    }
  }

  function normalizeError(err) {
    if (!err) {return { message: 'Unknown error', name: '', stack: '' };}
    const name = err.name ? String(err.name) : '';
    const message = err.message ? String(err.message) : String(err);
    const stack = err.stack ? String(err.stack) : '';
    return {
      name: shortString(name, 120),
      message: shortString(message, 600),
      stack: shortString(stack, 2000),
    };
  }

  function capture(type, data) {
    const ctx = getPageContext();
    const base = {
      v: 1,
      ts: nowIso(),
      type: type,
      ctx: ctx,
    };

    const payload = Object.assign(base, data);
    const key = hash32(type + '|' + (data && data.fingerprint ? data.fingerprint : JSON.stringify(data || {})));
    if (seenRecently(key)) {return;}
    send(payload);
  }

  window.addEventListener('error', function (event) {
    try {
      const err = normalizeError(event && event.error);
      const src = event && event.filename ? String(event.filename) : '';
      const line = event && typeof event.lineno === 'number' ? event.lineno : null;
      const col = event && typeof event.colno === 'number' ? event.colno : null;

      capture('error', {
        fingerprint: [err.name, err.message, src, line, col].join('|'),
        error: err,
        source: { file: shortString(src, 400), line: line, col: col },
      });
    } catch (_) {
      // ignore
      void 0;
    }
  });

  window.addEventListener('unhandledrejection', function (event) {
    try {
      const reason = event ? event.reason : null;
      const err = normalizeError(reason);
      capture('unhandledrejection', {
        fingerprint: [err.name, err.message].join('|'),
        error: err,
      });
    } catch (_) {
      // ignore
      void 0;
    }
  });
})();
