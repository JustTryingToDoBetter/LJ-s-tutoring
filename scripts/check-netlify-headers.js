#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const netlifyPath = path.join(__dirname, '..', 'netlify.toml');

if (!fs.existsSync(netlifyPath)) {
  console.error('[check-netlify-headers] Missing netlify.toml');
  process.exit(1);
}

const content = fs.readFileSync(netlifyPath, 'utf8');

const requiredHeaderChecks = [
  {
    name: 'Strict-Transport-Security',
    pattern: /Strict-Transport-Security\s*=\s*"[^"]*max-age=31536000[^"]*"/,
  },
  {
    name: 'Content-Security-Policy',
    pattern: /Content-Security-Policy\s*=\s*"[^"]*default-src 'self';[^"]*"/,
  },
  {
    name: 'X-Content-Type-Options',
    pattern: /X-Content-Type-Options\s*=\s*"nosniff"/,
  },
  {
    name: 'Referrer-Policy',
    pattern: /Referrer-Policy\s*=\s*"strict-origin-when-cross-origin"/,
  },
  {
    name: 'Permissions-Policy',
    pattern: /Permissions-Policy\s*=\s*"[^"]+"/,
  },
  {
    name: 'X-Frame-Options',
    pattern: /X-Frame-Options\s*=\s*"DENY"/,
  },
  {
    name: 'CSP frame-ancestors',
    pattern: /Content-Security-Policy\s*=\s*"[^"]*frame-ancestors 'none';[^"]*"/,
  },
];

const errors = [];
for (const check of requiredHeaderChecks) {
  if (!check.pattern.test(content)) {
    errors.push(`Missing or invalid header requirement: ${check.name}`);
  }
}

const requiredRoutePolicies = [
  '/admin',
  '/admin/*',
  '/tutor',
  '/tutor/*',
  '/api',
  '/api/*',
];

for (const route of requiredRoutePolicies) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const robotsPattern = new RegExp(`for\\s*=\\s*"${escaped}"[\\s\\S]*?X-Robots-Tag\\s*=\\s*"noindex, nofollow, noarchive, nosnippet"`);
  const noStorePattern = new RegExp(`for\\s*=\\s*"${escaped}"[\\s\\S]*?Cache-Control\\s*=\\s*"no-store"`);
  if (!robotsPattern.test(content)) {
    errors.push(`Missing noindex policy for route: ${route}`);
  }
  if (!noStorePattern.test(content)) {
    errors.push(`Missing no-store policy for route: ${route}`);
  }
}

if (errors.length) {
  console.error('[check-netlify-headers] Failed');
  errors.forEach((err) => console.error(`- ${err}`));
  process.exit(1);
}

console.log('[check-netlify-headers] OK: required security headers and route policies are configured');
