#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const nodeModules = path.join(root, 'node_modules');
const lmsApiDir = path.join(root, 'lms-api');
const distDir = path.join(root, 'dist');

const errors = [];

function isIgnoredDir(dirPath) {
  if (dirPath === nodeModules || dirPath.startsWith(nodeModules + path.sep)) {return true;}
  const parts = dirPath.split(path.sep);
  if (parts.includes('node_modules')) {return true;}
  if (dirPath === lmsApiDir || dirPath.startsWith(lmsApiDir + path.sep)) {return true;}
  return false;
}

function walk(dirPath, onFile) {
  if (!fs.existsSync(dirPath)) {return;}
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (isIgnoredDir(fullPath)) {continue;}
      walk(fullPath, onFile);
    } else if (entry.isFile()) {
      onFile(fullPath);
    }
  }
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function checkCspUnsafeInline(html, filePath) {
  const cspMetaPattern = /<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*content=["']([\s\S]*?)["'][^>]*>/gi;
  let match;
  while ((match = cspMetaPattern.exec(html)) !== null) {
    const content = match[1];
    if (content.includes('unsafe-inline')) {
      errors.push(`CSP contains unsafe-inline in ${path.relative(root, filePath)}`);
      return;
    }
  }
}

function checkInlineScript(html, filePath) {
  const inlineScriptPattern = /<script(?![^>]*\bsrc=)[^>]*>/i;
  if (inlineScriptPattern.test(html)) {
    errors.push(`Inline <script> found in ${path.relative(root, filePath)}`);
  }
}

function checkInlineHandlers(html, filePath) {
  const inlineHandlerPattern = /\son[a-zA-Z]+\s*=/i;
  if (inlineHandlerPattern.test(html)) {
    errors.push(`Inline event handler found in ${path.relative(root, filePath)}`);
  }
}

function checkHtmlFiles() {
  walk(root, (filePath) => {
    if (!filePath.endsWith('.html')) {return;}
    if (filePath.startsWith(distDir + path.sep)) {return;}
    const html = read(filePath);
    checkCspUnsafeInline(html, filePath);
    checkInlineScript(html, filePath);
    checkInlineHandlers(html, filePath);
  });
}

function checkEnvFile() {
  const envPath = path.join(root, '.env');
  if (fs.existsSync(envPath)) {
    errors.push('Found .env file in repo root');
  }
}

function checkSwVersions() {
  if (!fs.existsSync(distDir)) {return;}
  const swPath = path.join(distDir, 'sw.js');
  const arcadePath = path.join(distDir, 'assets', 'sw-arcade.js');

  if (fs.existsSync(swPath)) {
    const content = read(swPath);
    if (content.includes('po-v-dev')) {
      errors.push('dist/sw.js still contains po-v-dev placeholder');
    }
  }

  if (fs.existsSync(arcadePath)) {
    const content = read(arcadePath);
    if (content.includes('po-arcade-dev')) {
      errors.push('dist/assets/sw-arcade.js still contains po-arcade-dev placeholder');
    }
  }
}

checkHtmlFiles();
checkEnvFile();
checkSwVersions();

if (errors.length) {
  console.error('Security check failed:');
  errors.forEach((msg) => console.error(`- ${msg}`));
  process.exit(1);
}

console.log('Security check passed.');
