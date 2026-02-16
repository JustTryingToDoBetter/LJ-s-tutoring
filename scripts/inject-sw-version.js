#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const distDir = path.join(__dirname, '..', 'dist');

function getBuildId() {
  if (process.env.BUILD_ID) {
    return String(process.env.BUILD_ID).trim();
  }
  try {
    const out = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    if (out) {return out;}
  } catch (_) {
    // ignore
  }
  return String(Date.now());
}

function isGitDirty() {
  try {
    execSync('git diff --quiet', { stdio: ['ignore', 'ignore', 'ignore'] });
    execSync('git diff --cached --quiet', { stdio: ['ignore', 'ignore', 'ignore'] });
    return false;
  } catch (_) {
    return true;
  }
}

function sanitizeId(value) {
  const cleaned = String(value).replace(/[^a-zA-Z0-9._-]/g, '');
  return cleaned || 'dev';
}

function replaceConst(content, name, value) {
  const pattern = new RegExp(`const\\s+${name}\\s*=\\s*['"][^'"]+['"]\\s*;`);
  if (!pattern.test(content)) {return { changed: false, next: content };}
  const next = content.replace(pattern, `const ${name} = "${value}";`);
  return { changed: next !== content, next };
}

function updateFile(filePath, updater) {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  Warning: ${path.basename(filePath)} not found in dist`);
    return false;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const next = updater(content);
  if (next !== content) {
    fs.writeFileSync(filePath, next, 'utf8');
    return true;
  }
  return false;
}

const baseId = getBuildId();
const dirtySuffix = isGitDirty() ? `-dirty-${Date.now()}` : '';
const buildId = sanitizeId(`${baseId}${dirtySuffix}`);
const swVersion = `po-v${buildId}`;

const swPath = path.join(distDir, 'sw.js');

const swChanged = updateFile(swPath, (content) => {
  const res = replaceConst(content, 'VERSION', swVersion);
  return res.next;
});

if (swChanged) {
  console.log(`✅ Injected SW VERSION: ${swVersion}`);
} else {
  console.warn('⚠️  Warning: SW VERSION not updated');
}
