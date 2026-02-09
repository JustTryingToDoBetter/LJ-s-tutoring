#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const isProd = process.env.NODE_ENV === 'production' || process.env.PROD_BUILD === 'true';
if (!isProd) {
  process.exit(0);
}

const distAssetsDir = path.join(__dirname, '..', 'dist', 'assets');
const portalConfigPath = path.join(distAssetsDir, 'portal-config.js');

if (!fs.existsSync(portalConfigPath)) {
  console.error('[check-prod-config] Missing dist/assets/portal-config.js');
  process.exit(1);
}

const content = fs.readFileSync(portalConfigPath, 'utf8');
const match = content.match(/window\.__PO_API_BASE__\s*=\s*['"]([^'"]*)['"]/);
const value = match ? match[1] : '';

if (!value || value === '__PO_API_BASE__') {
  console.error('[check-prod-config] PO_API_BASE is missing or not injected');
  process.exit(1);
}

if (value.includes('localhost') || value.includes('127.0.0.1')) {
  console.error('[check-prod-config] PO_API_BASE must not reference localhost in production');
  process.exit(1);
}

if (value.startsWith('http://')) {
  console.error('[check-prod-config] PO_API_BASE must use https:// in production');
  process.exit(1);
}

if (!value.startsWith('https://')) {
  console.error('[check-prod-config] PO_API_BASE must be an https:// URL');
  process.exit(1);
}

console.log('[check-prod-config] OK: PO_API_BASE is production-safe');
