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

const distDir = path.join(__dirname, '..', 'dist');
const distAssetsDir = path.join(distDir, 'assets');
const appCriticalPath = path.join(distAssetsDir, 'app-critical.js');

if (!fs.existsSync(appCriticalPath)) {
  console.warn('⚠️  Warning: app-critical.js not found in dist/assets/');
  console.warn('    Config injection skipped. Build may use hardcoded values.');
  process.exit(0);
}

let content = fs.readFileSync(appCriticalPath, 'utf8');

const countdownDateStr = process.env.COUNTDOWN_DATE || '2026-02-15T17:00:00';
const countdownDate = new Date(countdownDateStr);

const errorMonitorEndpoint = process.env.ERROR_MONITOR_ENDPOINT || '';
const errorMonitorSampleRate = Number(process.env.ERROR_MONITOR_SAMPLE_RATE || 1);
const portalApiBase = process.env.PO_API_BASE || '';

const configReplacement = `  const CONFIG = {
    whatsappNumber: '${process.env.WHATSAPP_NUMBER || '27679327754'}',
    formspreeEndpoint: '${process.env.FORMSPREE_ENDPOINT || 'https://formspree.io/f/xreebzqa'}',
    email: '${process.env.CONTACT_EMAIL || 'projectodysseus10@gmail.com'}',
    countdownDate: new Date(${countdownDate.getFullYear()}, ${countdownDate.getMonth()}, ${countdownDate.getDate()}, ${countdownDate.getHours()}, ${countdownDate.getMinutes()}, 0),
  };`;

const configPattern = /const CONFIG = \{[\s\S]*?\};/;
if (configPattern.test(content)) {
  content = content.replace(configPattern, configReplacement);
  fs.writeFileSync(appCriticalPath, content, 'utf8');

  console.log('✅ Injected environment configuration into app-critical.js');
  console.log(`   - WhatsApp: ${process.env.WHATSAPP_NUMBER || '(default)'}`);
  console.log(`   - Formspree: ${process.env.FORMSPREE_ENDPOINT || '(default)'}`);
  console.log(`   - Email: ${process.env.CONTACT_EMAIL || '(default)'}`);
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

