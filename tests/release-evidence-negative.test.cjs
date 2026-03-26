const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const evidencePath = path.join(root, 'releases', 'evidence', 'latest-release-gates.json');
const collectPath = path.join(root, 'scripts', 'collect-release-evidence.js');
const validatePath = path.join(root, 'scripts', 'validate-release-evidence.js');

function runValidator() {
  return spawnSync(process.execPath, [validatePath], {
    cwd: root,
    stdio: 'pipe',
    encoding: 'utf8'
  });
}

test('validator fails when a required gate is missing', () => {
  spawnSync(process.execPath, [collectPath], { cwd: root, stdio: 'pipe' });
  const original = fs.readFileSync(evidencePath, 'utf8');

  try {
    const parsed = JSON.parse(original);
    parsed.gates = parsed.gates.filter((g) => g.name !== 'performance_budgets');
    fs.writeFileSync(evidencePath, JSON.stringify(parsed, null, 2), 'utf8');

    const result = runValidator();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /Missing required gate evidence: performance_budgets/);
  } finally {
    fs.writeFileSync(evidencePath, original, 'utf8');
  }
});

test('validator fails when required evidence file is missing', () => {
  spawnSync(process.execPath, [collectPath], { cwd: root, stdio: 'pipe' });
  const original = fs.readFileSync(evidencePath, 'utf8');

  try {
    fs.unlinkSync(evidencePath);
    const result = runValidator();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /Missing release evidence file/);
  } finally {
    fs.writeFileSync(evidencePath, original, 'utf8');
  }
});

test('validator fails when a required gate is not passed', () => {
  spawnSync(process.execPath, [collectPath], { cwd: root, stdio: 'pipe' });
  const original = fs.readFileSync(evidencePath, 'utf8');

  try {
    const parsed = JSON.parse(original);
    const gate = parsed.gates.find((g) => g.name === 'build');
    gate.status = 'failed';
    fs.writeFileSync(evidencePath, JSON.stringify(parsed, null, 2), 'utf8');

    const result = runValidator();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /Gate not marked passed: build/);
  } finally {
    fs.writeFileSync(evidencePath, original, 'utf8');
  }
});

test('validator fails when evidence is invalid JSON', () => {
  spawnSync(process.execPath, [collectPath], { cwd: root, stdio: 'pipe' });
  const original = fs.readFileSync(evidencePath, 'utf8');

  try {
    fs.writeFileSync(evidencePath, '{invalid-json', 'utf8');
    const result = runValidator();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /not valid JSON/i);
  } finally {
    fs.writeFileSync(evidencePath, original, 'utf8');
  }
});
