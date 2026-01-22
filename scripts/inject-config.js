#!/usr/bin/env node
/**
 * ============================================================================
 * CONFIG INJECTION SCRIPT
 * ============================================================================
 * 
 * PURPOSE:
 * This script reads environment variables from .env file and injects them into
 * the CONFIG object in the built app-critical.js file. This enables environment-
 * specific builds (dev/staging/production) without hardcoding sensitive data.
 * 
 * HOW IT FITS IN THE SYSTEM:
 * - Runs during build process AFTER JS files are copied to dist/assets/
 * - Called by: npm run build:html (see package.json line 30)
 * - Sequence: prebuild → build:html → inject-config.js → build:assets
 * - Modifies dist/assets/app-critical.js with runtime configuration
 * 
 * RULES ENFORCED:
 * - Configuration centralized in .env file (single source of truth)
 * - Fallback to safe defaults if .env missing (fail-safe, not fail-fast)
 * - Same source code can produce different builds for different environments
 * 
 * DEPENDENCIES:
 * - dotenv: Loads .env file into process.env
 * - fs: Node.js file system module for reading/writing files
 * - path: Node.js path utilities for cross-platform file paths
 */

// ============================================================================
// IMPORTS
// ============================================================================

// Node.js built-in file system module - provides methods to interact with files
const fs = require('fs');

// Node.js built-in path module - handles cross-platform file paths (Windows/Unix)
const path = require('path');

// Load environment variables from .env file into process.env
// Must be called before accessing any process.env values
require('dotenv').config();

// ============================================================================
// PATH RESOLUTION
// ============================================================================

// Construct absolute path to dist/assets directory
// __dirname = directory containing this script (scripts/)
// '..' = go up one level to project root
// 'dist', 'assets' = navigate to dist/assets/
const distDir = path.join(__dirname, '..', 'dist');
const distAssetsDir = path.join(__dirname, '..', 'dist', 'assets');



// Construct absolute path to the target file to modify
// This is the built JavaScript file that will be deployed
const appCriticalPath = path.join(distAssetsDir, 'app-critical.js');
// ============================================================================
// VALIDATION: Check if target file exists
// ============================================================================

// Verify that app-critical.js has been copied to dist/assets/
// If not, either build order is wrong or build:assets hasn't run yet
if (!fs.existsSync(appCriticalPath)) {
  // WARNING (not error): File not found, but don't fail the build
  // This allows the script to run even if build order changes slightly
  console.warn('⚠️  Warning: app-critical.js not found in dist/assets/');
  console.warn('    Config injection skipped. Build may use hardcoded values.');
  
  // Exit with success code (0) to not break the build pipeline
  process.exit(0);
}

// ============================================================================
// FILE READING
// ============================================================================

// Read the entire content of app-critical.js as UTF-8 text
// Synchronous operation is appropriate here (build-time, not runtime)
let content = fs.readFileSync(appCriticalPath, 'utf8');

// ============================================================================
// CONFIGURATION PARSING
// ============================================================================

// Read countdown date from environment variable
// FORMAT: ISO 8601 (YYYY-MM-DDTHH:mm:ss) - e.g., "2026-02-15T17:00:00"
// FALLBACK: Default to Feb 15, 2026 at 5pm if not specified in .env
const countdownDateStr = process.env.COUNTDOWN_DATE || '2026-02-15T17:00:00';

// Parse ISO string into JavaScript Date object
// This allows us to extract year, month, day, hour, minute components
const countdownDate = new Date(countdownDateStr);

// ============================================================================
// CONFIG OBJECT CONSTRUCTION
// ============================================================================

// Build the replacement CONFIG object as a string
// This string will be injected into the JavaScript file
// 
// TEMPLATE LITERAL: Uses ${} to interpolate environment variables
// FALLBACK PATTERN: process.env.VAR || 'default' ensures build never fails
const errorMonitorEndpoint = process.env.ERROR_MONITOR_ENDPOINT || '';
const errorMonitorSampleRate = Number(process.env.ERROR_MONITOR_SAMPLE_RATE || 1);

const configReplacement = `  const CONFIG = {
    // WhatsApp contact number in format: country_code + number (no + or spaces)
    // Example: '27679327754' for South Africa number +27 67 932 7754
    // Used by: WhatsApp link generation in updateAllWhatsAppLinks()
    whatsappNumber: '${process.env.WHATSAPP_NUMBER || '27679327754'}',

    // Formspree form submission endpoint URL
    // Formspree is a form backend service that handles form submissions
    // Get your endpoint from: https://formspree.io/forms/YOUR_FORM_ID
    // Used by: Contact form submission in initForm()
    formspreeEndpoint: '${process.env.FORMSPREE_ENDPOINT || 'https://formspree.io/f/xreebzqa'}',

    // Primary contact email address for mailto: links and display
    // Used by: Email links, contact information sections
    email: '${process.env.CONTACT_EMAIL || 'projectodysseus10@gmail.com'}',

    // Countdown timer target date in JavaScript Date constructor format
    // IMPORTANT: JavaScript months are 0-indexed (0=Jan, 1=Feb, ..., 11=Dec)
    // getMonth() returns 0-11, so no adjustment needed when reconstructing
    // Used by: initCountdown() function to calculate days/hours/mins/secs remaining
    countdownDate: new Date(${countdownDate.getFullYear()}, ${countdownDate.getMonth()}, ${countdownDate.getDate()}, ${countdownDate.getHours()}, ${countdownDate.getMinutes()}, 0),
  };`;

// ============================================================================
// REGEX PATTERN MATCHING & REPLACEMENT
// ============================================================================

// Define regex pattern to find the CONFIG object in app-critical.js
// PATTERN BREAKDOWN:
// - var CONFIG = \{  : Matches "var CONFIG = {"
// - [\s\S]*?         : Matches any character (including newlines), non-greedy
// - \};              : Matches closing "};"
// 
// This captures the ENTIRE CONFIG object regardless of formatting/whitespace
const configPattern = /const CONFIG = \{[\s\S]*?\};/;

// Check if the pattern exists in the file content
if (configPattern.test(content)) {
  // REPLACE: Swap the original CONFIG object with our injected version
  content = content.replace(configPattern, configReplacement);
  
  // WRITE: Save the modified content back to the same file
  // This overwrites the original file with environment-specific config
  fs.writeFileSync(appCriticalPath, content, 'utf8');

  
  // FEEDBACK: Log success message to build output
  console.log('✅ Injected environment configuration into app-critical.js');
  console.log(`   - WhatsApp: ${process.env.WHATSAPP_NUMBER || '(default)'}`);
  console.log(`   - Formspree: ${process.env.FORMSPREE_ENDPOINT || '(default)'}`);
  console.log(`   - Email: ${process.env.CONTACT_EMAIL || '(default)'}`);
  console.log(`   - Countdown: ${countdownDateStr}`);
} else {
  // WARNING: Pattern not found - CONFIG object structure may have changed
  // This prevents silent failures where injection doesn't happen
  console.warn('⚠️  Warning: Could not find CONFIG object pattern in app-critical.js');
  console.warn('    The file structure may have changed. Check that CONFIG is defined as:');
  console.warn('    const CONFIG = { ... };');
}

// ============================================================================
// Inject error-monitor runtime config into built HTML
// ============================================================================

function escapeJsString(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '')
    .replace(/\n/g, '');
}

function injectErrorMonitorConfigIntoHtmlFile(filePath) {
  let html;
  try {
    html = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    console.warn(`⚠️  Warning: Could not read HTML file: ${filePath}`);
    return;
  }

  const replacement = `window.PO_ERROR_MONITOR = { endpoint: '${escapeJsString(errorMonitorEndpoint)}', sampleRate: ${errorMonitorSampleRate} };`;
  const pattern = /window\.PO_ERROR_MONITOR\s*=\s*\{[\s\S]*?\};/;

  if (pattern.test(html)) {
    html = html.replace(pattern, replacement);
  } else if (/<\/head>/i.test(html)) {
    // If the snippet isn't present, insert a minimal config block in <head>
    html = html.replace(
      /<\/head>/i,
      `  <script>\n    ${replacement}\n  </script>\n</head>`
    );
  } else {
    return;
  }

  try {
    fs.writeFileSync(filePath, html, 'utf8');
  } catch (e) {
    console.warn(`⚠️  Warning: Could not write HTML file: ${filePath}`);
  }
}

function injectErrorMonitorConfigIntoHtml() {
  if (!fs.existsSync(distDir)) {return;}

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
        injectErrorMonitorConfigIntoHtmlFile(full);
      }
    });
  }

  walk(distDir);
}

injectErrorMonitorConfigIntoHtml();

if (errorMonitorEndpoint) {
  console.log('✅ Injected ERROR_MONITOR_* config into dist HTML');
  console.log(`   - Error monitor endpoint: ${errorMonitorEndpoint}`);
  console.log(`   - Error monitor sample rate: ${errorMonitorSampleRate}`);
} else {
  console.log('ℹ️  ERROR_MONITOR_ENDPOINT not set; frontend error reporting will be disabled');
}


/**
 * ============================================================================
 * INTEGRATION WITH BUILD SYSTEM
 * ============================================================================
 * 
 * BUILD PIPELINE (package.json scripts):
 * 
 * 1. npm run clean
 *    → rimraf dist/ (remove old build)
 * 
 * 2. npm run prebuild  
 *    → mkdirp dist/assets (create directories)
 * 
 * 3. npm run build:html
 *    → cpy "*.html" dist/ (copy HTML files)
 *    → node scripts/inject-config.js ← YOU ARE HERE
 * 
 * 4. npm run build:assets
 *    → cpy "assets/*.js" dist/assets/ (copy JS, including already-modified app-critical.js)
 * 
 * 5. npm run build (parent command)
 *    → Runs all build:* commands in parallel
 * 
 * 6. Deploy dist/ to production
 *    → All config values injected and ready
 * 
 * ============================================================================
 * ENVIRONMENT-SPECIFIC BUILDS
 * ============================================================================
 * 
 * LOCAL DEVELOPMENT:
 * 1. Create .env from .env.example
 * 2. npm run build
 * 3. npm run serve
 * Result: Dev configuration with test values
 * 
 * CI/CD PRODUCTION:
 * 1. CI system provides environment variables (GitHub Secrets, Netlify Env Vars)
 * 2. npm run build (reads from system environment)
 * 3. Deploy dist/
 * Result: Production configuration with real values
 * 
 * STAGING ENVIRONMENT:
 * 1. Create .env.staging with staging values
 * 2. cp .env.staging .env && npm run build
 * 3. Deploy to staging server
 * Result: Staging configuration with test endpoints
 * 
 * ============================================================================
 * FALLBACK STRATEGY
 * ============================================================================
 * 
 * This script uses FAIL-SAFE approach (with defaults) rather than FAIL-FAST.
 * 
 * WHY: Allows builds to succeed even if .env is missing, using hardcoded defaults.
 * This is appropriate because:
 * 1. Config values are not security-sensitive (all end up in public JS)
 * 2. Defaults are valid working values
 * 3. Prevents broken builds during development
 * 
 * ALTERNATIVE: For stricter enforcement, could check for missing env vars and:
 *   if (!process.env.WHATSAPP_NUMBER) {
 *     console.error('ERROR: WHATSAPP_NUMBER not set!');
 *     process.exit(1);
 *   }
 * 
 * ============================================================================
 */
