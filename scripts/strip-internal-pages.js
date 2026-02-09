#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const isProd = process.env.NODE_ENV === 'production' || process.env.PROD_BUILD === 'true';
if (!isProd) {
  process.exit(0);
}

const distDir = path.join(__dirname, '..', 'dist');
const targets = [
  path.join(distDir, 'admin'),
  path.join(distDir, 'tutor'),
  path.join(distDir, 'tutor-dashboard.html'),
  path.join(distDir, 'assets', 'admin'),
  path.join(distDir, 'assets', 'tutor')
];

let removed = 0;
for (const target of targets) {
  if (!fs.existsSync(target)) continue;
  fs.rmSync(target, { recursive: true, force: true });
  removed += 1;
}

if (removed > 0) {
  console.log(`[strip-internal-pages] Removed ${removed} internal path(s) from prod build`);
}
