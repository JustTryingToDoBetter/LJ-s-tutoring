const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadAnalytics(win) {
  const src = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'assets', 'analytics.js'),
    'utf8',
  );
  // Drop the ES-module tail, which uses `export`/`import.meta`, and just run
  // the IIFE that installs window.PO_ANALYTICS.
  const iifeOnly = src.split('\n// Re-export')[0];
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', 'globalThis', 'navigator', 'console', iifeOnly);
  fn(win, win, undefined, console);
  return win.PO_ANALYTICS;
}

function fakeWindow({ enabled = false } = {}) {
  return {
    PO_ANALYTICS_CONFIG: { enabled, endpoint: '/analytics/events' },
    location: { pathname: '/dashboard/' },
    sessionStorage: (function () {
      let value = null;
      return {
        getItem: () => value,
        setItem: (_k, v) => { value = v; },
      };
    }()),
    crypto: { randomUUID: () => 'fixed-correlation-id' },
  };
}

function withStubbedGlobals(stubs, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(stubs)) {
    saved[k] = globalThis[k];
    globalThis[k] = v;
  }
  return Promise.resolve(fn()).finally(() => {
    for (const k of Object.keys(stubs)) {
      if (saved[k] === undefined) delete globalThis[k];
      else globalThis[k] = saved[k];
    }
  });
}

test('track() is a fail-safe no-op when analytics is disabled', async () => {
  const fetchCalls = [];
  const win = fakeWindow({ enabled: false });
  const api = loadAnalytics(win);
  await withStubbedGlobals(
    { fetch: async (...args) => { fetchCalls.push(args); return { ok: true }; } },
    async () => {
      const result = await api.track('dashboard.viewed', { foo: 1 });
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'disabled');
      assert.equal(fetchCalls.length, 0);
    },
  );
});

test('track() posts a structured envelope when enabled', async () => {
  const fetchCalls = [];
  const win = fakeWindow({ enabled: true });
  const api = loadAnalytics(win);
  await withStubbedGlobals(
    {
      fetch: async (url, init) => { fetchCalls.push({ url, init }); return { ok: true }; },
      // Force the fetch path by neutralising any ambient navigator.sendBeacon.
      navigator: { sendBeacon: undefined },
    },
    async () => {
      const result = await api.track('community.room.created', { roomId: 'r-1' });
      assert.equal(result.ok, true);
      assert.equal(fetchCalls.length, 1);
      const call = fetchCalls[0];
      assert.equal(call.url, '/analytics/events');
      assert.equal(call.init.method, 'POST');
      const payload = JSON.parse(call.init.body);
      assert.equal(payload.event, 'community.room.created');
      assert.equal(payload.correlationId, 'fixed-correlation-id');
      assert.equal(payload.props.roomId, 'r-1');
      assert.ok(payload.ts);
      assert.equal(call.init.headers['X-Request-Id'], 'fixed-correlation-id');
    },
  );
});

test('track() swallows transport errors so pages never crash', async () => {
  const win = fakeWindow({ enabled: true });
  const api = loadAnalytics(win);
  await withStubbedGlobals(
    {
      fetch: async () => { throw new Error('network down'); },
      navigator: { sendBeacon: undefined },
    },
    async () => {
      const result = await api.track('report.generated', {});
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'transport_error');
    },
  );
});
