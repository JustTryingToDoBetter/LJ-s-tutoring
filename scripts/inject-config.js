#!/usr/bin/env node
/**
 * ============================================================================
 * CONFIG INJECTION SCRIPT
 * ============================================================================
 *
 * PURPOSE:
 * Reads environment variables from .env and injects them into the CONFIG object
 * in the built app-critical.js file. Also injects PO_ERROR_MONITOR config into
 * built HTML files.
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
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

function listHtmlFiles(dir) {
  /** @type {string[]} */
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const it of items) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) out.push(...listHtmlFiles(p));
    else if (it.isFile() && p.endsWith('.html')) out.push(p);
  }
  return out;
}

function injectErrorMonitorConfigIntoHtml() {
  const endpoint = escapeJsString(errorMonitorEndpoint);
  const sampleRate = clamp01(errorMonitorSampleRate);

  const files = listHtmlFiles(distDir);
  if (!files.length) return;

  const assignPattern = /window\.PO_ERROR_MONITOR\s*=\s*\{[\s\S]*?\};/g;
  const replacement = `window.PO_ERROR_MONITOR = { endpoint: '${endpoint}', sampleRate: ${sampleRate} };`;

  let touched = 0;
  for (const f of files) {
    const html = fs.readFileSync(f, 'utf8');
    if (!assignPattern.test(html)) continue;

    const next = html.replace(assignPattern, replacement);
    if (next !== html) {
      fs.writeFileSync(f, next, 'utf8');
      touched++;
    }
  }

  if (touched) {
    console.log(`✅ Injected PO_ERROR_MONITOR config into ${touched} HTML file(s)`);
  }
}

injectErrorMonitorConfigIntoHtml();

