#!/usr/bin/env node
/* eslint-disable no-console */

const https = require('https');
const fs = require('fs');
const path = require('path');

const target = process.env.CSP_CHECK_URL || 'https://projectodysseus.live/';
const expectedPath = path.join(__dirname, 'expected-csp.txt');

if (!fs.existsSync(expectedPath)) {
  console.error('[check-live-csp] Missing expected-csp.txt');
  process.exit(1);
}

const expected = fs.readFileSync(expectedPath, 'utf8').trim();

function normalize(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

https.get(target, (res) => {
  const header = res.headers['content-security-policy'];
  if (!header) {
    console.error('[check-live-csp] Missing Content-Security-Policy header');
    process.exit(1);
  }

  const actual = normalize(header);
  const expectedNormalized = normalize(expected);
  if (actual !== expectedNormalized) {
    console.error('[check-live-csp] CSP drift detected');
    console.error('Expected:', expectedNormalized);
    console.error('Actual:', actual);
    process.exit(1);
  }

  console.log('[check-live-csp] OK: CSP matches expected policy');
}).on('error', (err) => {
  console.error('[check-live-csp] Request failed');
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
