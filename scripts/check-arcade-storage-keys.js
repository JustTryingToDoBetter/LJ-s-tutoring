#!/usr/bin/env node
/**
 * Sanity check: the Arcade "best today" stat key must be consistent between
 * the arcade shell (reader) and at least one game (writer).
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const files = [
  path.join(repoRoot, 'assets', 'arcade.js'),
  path.join(repoRoot, 'assets', 'games', 'quickmath.js'),
];

const KEY = 'po_arcade_best_today';

let ok = true;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  if (!src.includes(KEY)) {
    console.error(`[check-arcade-storage-keys] Missing key "${KEY}" in ${path.relative(repoRoot, f)}`);
    ok = false;
  }
}

if (!ok) {process.exit(1);}
console.log(`[check-arcade-storage-keys] OK (${KEY})`);

