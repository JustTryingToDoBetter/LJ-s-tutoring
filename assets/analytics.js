/**
 * assets/analytics.js
 * Unified, fail-safe frontend telemetry bridge.
 *
 * Usage:
 *   <script src="/assets/analytics.js"></script>   // classic page script, exposes window.PO_ANALYTICS
 *   import { track } from '/assets/analytics.js';  // ES module: typed helper
 *
 * Config is driven by window.PO_ANALYTICS_CONFIG which is normally injected at
 * build time. Defaults keep the tracker a no-op so the page never breaks if a
 * backend endpoint is unreachable.
 */
(function () {
  'use strict';

  const DEFAULT_ENDPOINT = '/analytics/events';
  const STORAGE_KEY = 'po_analytics_correlation';

  function readConfig() {
    const cfg = (typeof window !== 'undefined' && window.PO_ANALYTICS_CONFIG) || {};
    return {
      enabled: cfg.enabled === true,
      endpoint: cfg.endpoint || DEFAULT_ENDPOINT,
      debug: cfg.debug === true,
    };
  }

  function generateId() {
    try {
      if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
    } catch {
      /* ignore */
    }
    return `po-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function correlationId() {
    if (typeof window === 'undefined') {return generateId();}
    try {
      const existing = window.sessionStorage?.getItem(STORAGE_KEY);
      if (existing) {return existing;}
      const fresh = generateId();
      window.sessionStorage?.setItem(STORAGE_KEY, fresh);
      return fresh;
    } catch {
      return generateId();
    }
  }

  function baseEnvelope(event, props) {
    return {
      event: String(event || ''),
      ts: new Date().toISOString(),
      correlationId: correlationId(),
      path: typeof window !== 'undefined' ? window.location.pathname : '',
      props: (props && typeof props === 'object') ? props : {},
    };
  }

  async function track(event, props) {
    const cfg = readConfig();
    const envelope = baseEnvelope(event, props);
    if (cfg.debug && typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.debug('[analytics]', envelope);
    }
    if (!cfg.enabled) {
      return { ok: false, reason: 'disabled', envelope };
    }
    if (typeof window === 'undefined' || typeof fetch !== 'function') {
      return { ok: false, reason: 'no_runtime', envelope };
    }
    try {
      const payload = JSON.stringify(envelope);
      const headers = { 'Content-Type': 'application/json', 'X-Request-Id': envelope.correlationId };
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const ok = navigator.sendBeacon(cfg.endpoint, new Blob([payload], { type: 'application/json' }));
        if (ok) {return { ok: true, via: 'beacon', envelope };}
      }
      await fetch(cfg.endpoint, {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
        headers,
        body: payload,
      });
      return { ok: true, via: 'fetch', envelope };
    } catch (_err) {
      return { ok: false, reason: 'transport_error', envelope };
    }
  }

  const api = { track, correlationId, readConfig };

  if (typeof window !== 'undefined') {
    window.PO_ANALYTICS = Object.assign({ enabled: false, note: 'Runtime gated by PO_ANALYTICS_CONFIG.enabled' }, api);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  // ES module named export (no-op when loaded as classic script).
  try {
    if (typeof globalThis !== 'undefined') {
      globalThis.__PO_ANALYTICS_API__ = api;
    }
  } catch {
    /* ignore */
  }
})();

// Re-export for ES module consumers. The IIFE above populates
// globalThis.__PO_ANALYTICS_API__ so module-mode callers get the same impl.
const __api = (typeof globalThis !== 'undefined' && globalThis.__PO_ANALYTICS_API__)
  || { track: async () => ({ ok: false, reason: 'no_runtime' }), correlationId: () => '', readConfig: () => ({ enabled: false }) };

export const track = __api.track;
export const correlationId = __api.correlationId;
export const readConfig = __api.readConfig;
export default __api;
