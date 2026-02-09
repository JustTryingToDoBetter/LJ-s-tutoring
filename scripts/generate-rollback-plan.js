#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const templatePath = path.join(root, 'releases', 'rollback', 'ROLLBACK_PLAN_TEMPLATE.md');
const outPath = path.join(root, 'releases', 'rollback', 'latest.md');

if (!fs.existsSync(templatePath)) {
  console.error('Missing rollback template');
  process.exit(1);
}

const template = fs.readFileSync(templatePath, 'utf8');
const today = new Date().toISOString().slice(0, 10);
const content = template
  .replace('<release-id>', `release-${today}`)
  .replace('<yyyy-mm-dd>', today)
  .replace('<name>', 'TBD');

fs.writeFileSync(outPath, content, 'utf8');
console.log(`Generated rollback plan: ${path.relative(root, outPath)}`);
