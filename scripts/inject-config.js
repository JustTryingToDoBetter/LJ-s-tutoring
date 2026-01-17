#!/usr/bin/env node
/**
 * inject-config.js
 * 
 * Reads environment variables from .env file and injects them into
 * the CONFIG object in app-critical.js after HTML files are copied.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const distAssetsDir = path.join(__dirname, '..', 'dist', 'assets');
const appCriticalPath = path.join(distAssetsDir, 'app-critical.js');

// Check if the file exists
if (!fs.existsSync(appCriticalPath)) {
  console.warn('Warning: app-critical.js not found in dist/assets/');
  process.exit(0);
}

// Read the file
let content = fs.readFileSync(appCriticalPath, 'utf8');

// Parse countdown date from env
const countdownDateStr = process.env.COUNTDOWN_DATE || '2026-02-15T17:00:00';
const countdownDate = new Date(countdownDateStr);

// Build the replacement CONFIG object
const configReplacement = `  var CONFIG = {
    // WhatsApp number (country code, no + or spaces)
    whatsappNumber: '${process.env.WHATSAPP_NUMBER || '27679327754'}',

    // Formspree endpoint
    formspreeEndpoint: '${process.env.FORMSPREE_ENDPOINT || 'https://formspree.io/f/xreebzqa'}',

    // Contact email
    email: '${process.env.CONTACT_EMAIL || 'projectodysseus10@gmail.com'}',

    // Countdown target date (YYYY, Month-1, Day, Hour, Min)
    // Month is 0-indexed: January = 0, February = 1, etc.
    countdownDate: new Date(${countdownDate.getFullYear()}, ${countdownDate.getMonth()}, ${countdownDate.getDate()}, ${countdownDate.getHours()}, ${countdownDate.getMinutes()}, 0),
  };`;

// Replace the CONFIG object (match the original pattern)
const configPattern = /var CONFIG = \{[\s\S]*?\};/;
if (configPattern.test(content)) {
  content = content.replace(configPattern, configReplacement);
  fs.writeFileSync(appCriticalPath, content, 'utf8');
  console.log('✓ Injected environment configuration into app-critical.js');
} else {
  console.warn('Warning: Could not find CONFIG object pattern in app-critical.js');
}
