#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const filePath = path.join(root, 'releases', 'evidence', 'latest-release-gates.json');

if (!fs.existsSync(filePath)) {
  console.error('Missing release evidence file: releases/evidence/latest-release-gates.json');
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
} catch (error) {
  console.error('Release evidence is not valid JSON');
  process.exit(1);
}

const requiredTopLevel = ['schemaVersion', 'generatedAt', 'releaseId', 'ci', 'gates', 'artifacts'];
for (const key of requiredTopLevel) {
  if (!(key in parsed)) {
    console.error(`Missing required field: ${key}`);
    process.exit(1);
  }
}

const requiredGates = [
  'rollback_plan',
  'security_lint',
  'dependency_audit_prod',
  'integration_tests',
  'build',
  'performance_budgets'
];

const gateMap = new Map((parsed.gates || []).map((g) => [g.name, g.status]));
for (const gate of requiredGates) {
  if (!gateMap.has(gate)) {
    console.error(`Missing required gate evidence: ${gate}`);
    process.exit(1);
  }
  if (gateMap.get(gate) !== 'passed') {
    console.error(`Gate not marked passed: ${gate}`);
    process.exit(1);
  }
}

console.log('release_evidence_validation_passed');
