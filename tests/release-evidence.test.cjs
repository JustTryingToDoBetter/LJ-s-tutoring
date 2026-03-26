const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const evidencePath = path.join(root, 'releases', 'evidence', 'latest-release-gates.json');

test('release evidence collector + validator produce valid schema', () => {
  execFileSync(process.execPath, [path.join(root, 'scripts', 'collect-release-evidence.js')], {
    cwd: root,
    stdio: 'pipe',
  });

  assert.equal(fs.existsSync(evidencePath), true);

  execFileSync(process.execPath, [path.join(root, 'scripts', 'validate-release-evidence.js')], {
    cwd: root,
    stdio: 'pipe',
  });

  const parsed = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  assert.equal(parsed.schemaVersion, '1.0');
  assert.equal(Array.isArray(parsed.gates), true);
  assert.ok(parsed.gates.length >= 6);
});
