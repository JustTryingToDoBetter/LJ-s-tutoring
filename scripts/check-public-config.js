#!/usr/bin/env node
/* eslint-disable no-console */

const path = require('path');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '..', '.env');
const loaded = dotenv.config({ path: envPath });
const parsedEnv = loaded.parsed || {};

const legacyPublicKeys = [
  'WHATSAPP_NUMBER',
  'FORMSPREE_ENDPOINT',
  'CONTACT_EMAIL',
  'COUNTDOWN_DATE',
  'ERROR_MONITOR_ENDPOINT',
  'ERROR_MONITOR_SAMPLE_RATE',
  'PO_API_BASE',
];

const requiredPublicPrefix = /^PUBLIC_[A-Z0-9_]+$/;
const secretLikeKey = /(SECRET|TOKEN|PRIVATE|API_KEY|PASSWORD|DATABASE_URL|COOKIE)/i;

const errors = [];

for (const legacyKey of legacyPublicKeys) {
  if (Object.prototype.hasOwnProperty.call(parsedEnv, legacyKey)) {
    errors.push(`Legacy public key "${legacyKey}" is not allowed. Rename it to PUBLIC_${legacyKey}.`);
  }
}

for (const key of Object.keys(parsedEnv)) {
  if (!requiredPublicPrefix.test(key)) {continue;}
  if (secretLikeKey.test(key)) {
    errors.push(`Secret-like key "${key}" is not allowed in public config.`);
  }
}

if (errors.length) {
  console.error('[check-public-config] Failed');
  errors.forEach((err) => console.error(`- ${err}`));
  process.exit(1);
}

console.log('[check-public-config] OK: PUBLIC_* config namespace is enforced and secret-like public keys are blocked');
