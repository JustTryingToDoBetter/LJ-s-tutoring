const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('portal-config.js does not ship a hard-coded Odie access key', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'assets', 'portal-config.js'),
    'utf8',
  );
  assert.ok(
    !/window\.__ODIE_ACCESS_KEY__/.test(src),
    'portal-config.js must not expose window.__ODIE_ACCESS_KEY__ to the browser',
  );
  // Paranoia: no long hex-looking secrets in the file.
  assert.ok(
    !/[a-f0-9]{32,}/i.test(src),
    'portal-config.js must not contain embedded hex secrets',
  );
});

test('portal-config.js exposes an assistant feature flag', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'assets', 'portal-config.js'),
    'utf8',
  );
  assert.ok(
    /window\.__ODIE_ASSISTANT_ENABLED__\s*=/.test(src),
    'portal-config.js must export window.__ODIE_ASSISTANT_ENABLED__',
  );
});

test('inject-config.js strips any legacy Odie key assignment instead of rewriting it', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'scripts', 'inject-config.js'),
    'utf8',
  );
  assert.ok(
    !/window\.__ODIE_ACCESS_KEY__\s*=\s*['"]\$\{/.test(src),
    'inject-config.js must not template a real Odie access key into portal-config.js',
  );
  assert.ok(
    /__ODIE_ASSISTANT_ENABLED__/.test(src),
    'inject-config.js must write the assistant feature flag instead',
  );
});

test('student reports page includes the student auth-guard', () => {
  const html = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'reports', 'index.html'),
    'utf8',
  );
  const configIdx = html.indexOf('portal-config.js');
  const guardIdx = html.indexOf('student/auth-guard.js');
  const scriptIdx = html.indexOf('student/reports.js');
  assert.ok(configIdx !== -1, 'reports/index.html must load portal-config.js');
  assert.ok(guardIdx !== -1, 'reports/index.html must load the student auth-guard');
  assert.ok(
    configIdx < guardIdx && guardIdx < scriptIdx,
    'auth-guard must load after portal-config and before the page script',
  );
});
