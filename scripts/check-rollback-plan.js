#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const planPath = path.join(root, 'releases', 'rollback', 'latest.md');

if (!fs.existsSync(planPath)) {
  console.error('Rollback plan missing: releases/rollback/latest.md');
  process.exit(1);
}

const stat = fs.statSync(planPath);
const ageDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);

if (ageDays > 30) {
  console.error('Rollback plan is older than 30 days. Regenerate before release.');
  process.exit(1);
}

const content = fs.readFileSync(planPath, 'utf8').trim();
if (content.length < 120) {
  console.error('Rollback plan is too short. Fill in the template.');
  process.exit(1);
}

console.log('Rollback plan check passed.');
