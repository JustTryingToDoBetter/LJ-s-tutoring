#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Build-time JS parse check for injected files.
 * Fails with a clear error if the generated JS is invalid.
 */

const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'dist', 'assets', 'app-critical.js');

if (!fs.existsSync(target)) {
  console.error(`[check-built-js] Missing file: ${target}`);
  process.exit(1);
}

const code = fs.readFileSync(target, 'utf8');

try {
  // Parse-only: does not execute the code body.
  // eslint-disable-next-line no-new-func
  new Function(code);
  console.log('[check-built-js] OK: app-critical.js parses');
} catch (err) {
  console.error('[check-built-js] Syntax error in dist/assets/app-critical.js');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}

