#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(distDir)) {
  console.error('[check-dist-csp] Missing dist/ directory. Run npm run build first.');
  process.exit(1);
}

const rootHtmlFiles = fs
  .readdirSync(distDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
  .map((entry) => path.join(distDir, entry.name));

if (!rootHtmlFiles.length) {
  console.error('[check-dist-csp] No dist/*.html files found');
  process.exit(1);
}

const errors = [];
const cspComment = /<!--\s*CSP enforced via response headers\s*-->/i;
const inlineScriptPattern = /<script(?![^>]*\bsrc=)[^>]*>/i;
const inlineHandlerPattern = /\son[a-zA-Z]+\s*=/i;

for (const filePath of rootHtmlFiles) {
  const html = fs.readFileSync(filePath, 'utf8');
  const rel = path.relative(path.join(__dirname, '..'), filePath);

  if (!cspComment.test(html)) {
    errors.push(`${rel}: missing CSP header marker comment`);
  }
  if (inlineScriptPattern.test(html)) {
    errors.push(`${rel}: inline <script> found`);
  }
  if (inlineHandlerPattern.test(html)) {
    errors.push(`${rel}: inline event handler found`);
  }
}

if (errors.length) {
  console.error('[check-dist-csp] Failed');
  errors.forEach((err) => console.error(`- ${err}`));
  process.exit(1);
}

console.log('[check-dist-csp] OK: dist/*.html is CSP-compatible and marked for header-enforced CSP');
