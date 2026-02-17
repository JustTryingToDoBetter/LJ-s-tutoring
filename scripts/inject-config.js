#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * ============================================================================
 * CONFIG INJECTION SCRIPT
 * ============================================================================
 *
 * PURPOSE:
 * Reads environment variables from .env and injects them into the CONFIG object
 * in the built app-critical.js file. Also injects PO_ERROR_MONITOR config into
 * the dedicated error-monitor-config.js asset.
 *
 * HOW IT FITS IN THE SYSTEM:
 * - Runs during build AFTER assets are copied to dist/
 * - Called by: npm run inject:config (part of npm run build)
 * - Sequence: prebuild → build:* (copy/compile) → inject:config
 */

const fs = require('fs');
const path = require('path');

require('dotenv').config();

const LEGACY_PUBLIC_KEYS = [
  'WHATSAPP_NUMBER',
  'FORMSPREE_ENDPOINT',
  'CONTACT_EMAIL',
  'COUNTDOWN_DATE',
  'ERROR_MONITOR_ENDPOINT',
  'ERROR_MONITOR_SAMPLE_RATE',
  'PO_API_BASE',
];

const PUBLIC_KEYS = {
  whatsappNumber: 'PUBLIC_WHATSAPP_NUMBER',
  formspreeEndpoint: 'PUBLIC_FORMSPREE_ENDPOINT',
  contactEmail: 'PUBLIC_CONTACT_EMAIL',
  countdownDate: 'PUBLIC_COUNTDOWN_DATE',
  errorMonitorEndpoint: 'PUBLIC_ERROR_MONITOR_ENDPOINT',
  errorMonitorSampleRate: 'PUBLIC_ERROR_MONITOR_SAMPLE_RATE',
  portalApiBase: 'PUBLIC_PO_API_BASE',
};

function enforcePublicConfigOnly() {
  const errors = [];
  const secretLikePublicKey = /(SECRET|TOKEN|PRIVATE|API_KEY|PASSWORD|DATABASE_URL|COOKIE)/i;

  LEGACY_PUBLIC_KEYS.forEach((legacyKey) => {
    if (Object.prototype.hasOwnProperty.call(process.env, legacyKey)) {
      errors.push(`Legacy key ${legacyKey} is not allowed. Use PUBLIC_${legacyKey}.`);
    }
  });

  Object.keys(process.env).forEach((key) => {
    if (!key.startsWith('PUBLIC_')) {return;}
    if (secretLikePublicKey.test(key)) {
      errors.push(`Secret-like key ${key} is not allowed in public config.`);
    }
  });

  if (errors.length) {
    console.error('❌ Public config validation failed.');
    errors.forEach((err) => console.error(`   - ${err}`));
    process.exit(1);
  }
}

enforcePublicConfigOnly();

const distDir = path.join(__dirname, '..', 'dist');
const distAssetsDir = path.join(distDir, 'assets');
const appCriticalPath = path.join(distAssetsDir, 'app-critical.js');

if (!fs.existsSync(appCriticalPath)) {
  console.warn('⚠️  Warning: app-critical.js not found in dist/assets/');
  console.warn('    Config injection skipped. Build may use hardcoded values.');
  process.exit(0);
}

let content = fs.readFileSync(appCriticalPath, 'utf8');

const countdownDateStr = process.env[PUBLIC_KEYS.countdownDate] || '2026-02-15T17:00:00';
const countdownDate = new Date(countdownDateStr);

const errorMonitorEndpoint = process.env[PUBLIC_KEYS.errorMonitorEndpoint] || '';
const errorMonitorSampleRate = Number(process.env[PUBLIC_KEYS.errorMonitorSampleRate] || 1);
const portalApiBase = process.env[PUBLIC_KEYS.portalApiBase] || '';

if (portalApiBase && !/^https?:\/\//i.test(portalApiBase)) {
  console.error('❌ PUBLIC_PO_API_BASE must be an absolute http(s) URL.');
  process.exit(1);
}

const configReplacement = `  const CONFIG = {
  whatsappNumber: '${process.env[PUBLIC_KEYS.whatsappNumber] || '27679327754'}',
  formspreeEndpoint: '${process.env[PUBLIC_KEYS.formspreeEndpoint] || 'https://formspree.io/f/xreebzqa'}',
  email: '${process.env[PUBLIC_KEYS.contactEmail] || 'projectodysseus10@gmail.com'}',
    countdownDate: new Date(${countdownDate.getFullYear()}, ${countdownDate.getMonth()}, ${countdownDate.getDate()}, ${countdownDate.getHours()}, ${countdownDate.getMinutes()}, 0),
  };`;

const configPattern = /const CONFIG = \{[\s\S]*?\};/;
if (configPattern.test(content)) {
  content = content.replace(configPattern, configReplacement);
  fs.writeFileSync(appCriticalPath, content, 'utf8');

  console.log('✅ Injected environment configuration into app-critical.js');
  console.log(`   - WhatsApp: ${process.env[PUBLIC_KEYS.whatsappNumber] || '(default)'}`);
  console.log(`   - Formspree: ${process.env[PUBLIC_KEYS.formspreeEndpoint] || '(default)'}`);
  console.log(`   - Email: ${process.env[PUBLIC_KEYS.contactEmail] || '(default)'}`);
  console.log(`   - Countdown: ${countdownDateStr}`);
} else {
  console.warn('⚠️  Warning: Could not find CONFIG object pattern in app-critical.js');
  console.warn('    Expected: const CONFIG = { ... };');
}

function escapeJsString(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '')
    .replace(/\n/g, '');
}

function clamp01(n) {
  if (!Number.isFinite(n)) {return 1;}
  return Math.max(0, Math.min(1, n));
}

function injectErrorMonitorConfigAsset() {
  const endpoint = escapeJsString(errorMonitorEndpoint);
  const sampleRate = clamp01(errorMonitorSampleRate);
  const assetPath = path.join(distAssetsDir, 'error-monitor-config.js');

  if (!fs.existsSync(assetPath)) {
    console.warn('⚠️  Warning: error-monitor-config.js not found in dist/assets/');
    console.warn('    Error monitor config injection skipped.');
    return;
  }

  const assignPattern = /window\.PO_ERROR_MONITOR\s*=\s*\{[\s\S]*?\};/g;
  const replacement = `window.PO_ERROR_MONITOR = { endpoint: '${endpoint}', sampleRate: ${sampleRate} };`;

  const content = fs.readFileSync(assetPath, 'utf8');
  const next = content.replace(assignPattern, replacement);
  if (next !== content) {
    fs.writeFileSync(assetPath, next, 'utf8');
    console.log('✅ Injected PO_ERROR_MONITOR config into error-monitor-config.js');
  }
}

injectErrorMonitorConfigAsset();

function injectPortalConfig() {
  const assetPath = path.join(distAssetsDir, 'portal-config.js');
  if (!fs.existsSync(assetPath)) {
    console.warn('⚠️  Warning: portal-config.js not found in dist/assets/');
    console.warn('    Portal config injection skipped.');
    return;
  }

  const content = fs.readFileSync(assetPath, 'utf8');
  const replacement = `window.__PO_API_BASE__ = '${escapeJsString(portalApiBase)}';`;
  const next = content.replace(/window\.__PO_API_BASE__\s*=\s*['"][^'"]*['"];?/, replacement);
  if (next !== content) {
    fs.writeFileSync(assetPath, next, 'utf8');
    console.log('✅ Injected PO_API_BASE into portal-config.js');
  } else {
    console.warn('⚠️  Warning: Could not find PO_API_BASE assignment in portal-config.js');
  }
}

injectPortalConfig();

