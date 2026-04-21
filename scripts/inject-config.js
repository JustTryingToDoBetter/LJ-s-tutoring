const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

function loadEnvFile(filePath) {
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override: false });
  }
}

const root = path.resolve(__dirname, '..');
loadEnvFile(path.resolve(root, '.env.local'));
loadEnvFile(path.resolve(root, '.env'));

/**
 * When running in a GitHub Codespace, `http://localhost:PORT` can't be
 * reached from the browser (the page is served via the forwarded-port URL).
 * Auto-rewrite loopback API bases to the Codespace forwarding URL so devs
 * don't have to manually update .env.local every session.
 */
function resolveApiBase(raw) {
  const codespaceName = process.env.CODESPACE_NAME;
  const forwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;

  if (!codespaceName || !forwardingDomain) {
    return raw; // not a Codespace — use as-is
  }

  // If the configured URL is a loopback address, translate it to the
  // Codespace forwarding URL so the browser can actually reach it.
  const loopbackPattern = /^https?:\/\/(localhost|127(?:\.\d{1,3}){3}):(\d+)/;
  const match = raw.match(loopbackPattern);
  if (match) {
    const port = match[2];
    return `https://${codespaceName}-${port}.${forwardingDomain}`;
  }

  return raw;
}

function assistantEnabled() {
  const raw = String(process.env.ASSISTANT_ENABLED ?? 'true').trim().toLowerCase();
  if (!raw) {return true;}
  return raw !== 'false' && raw !== '0' && raw !== 'off' && raw !== 'disabled';
}

function injectIntoFile(filePath, apiBase, enabled) {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  const source = fs.readFileSync(filePath, 'utf8');
  let updated = source.replace(
    /window\.__PO_API_BASE__\s*=\s*.*?;\s*$/m,
    `window.__PO_API_BASE__ = '${apiBase}';`,
  );
  // Strip any legacy access-key assignment so we never ship the secret again.
  updated = updated.replace(
    /^\s*window\.__ODIE_ACCESS_KEY__\s*=\s*.*?;\s*$/gm,
    '',
  );
  const flagLine = `window.__ODIE_ASSISTANT_ENABLED__ = ${enabled ? 'true' : 'false'};`;
  if (/window\.__ODIE_ASSISTANT_ENABLED__\s*=/.test(updated)) {
    updated = updated.replace(
      /window\.__ODIE_ASSISTANT_ENABLED__\s*=\s*.*?;\s*$/m,
      flagLine,
    );
  } else {
    updated = `${updated.trimEnd()}\n${flagLine}\n`;
  }
  fs.writeFileSync(filePath, updated);
  return true;
}

const rawApiBase = (process.env.PUBLIC_PO_API_BASE || process.env.API_BASE_URL || '').replace(/\/$/, '');
const apiBase = resolveApiBase(rawApiBase);
const enabled = assistantEnabled();

if (apiBase !== rawApiBase) {
  process.stdout.write(`Codespace detected — rewrote API base: ${rawApiBase} → ${apiBase}\n`);
}
if (process.env.PUBLIC_ODIE_ACCESS_KEY) {
  process.stderr.write(
    'WARN: PUBLIC_ODIE_ACCESS_KEY is set but no longer used — assistant access keys are never written to the browser bundle.\n',
  );
}

// Update dist/ (production build output)
const distConfigPath = path.resolve(root, 'dist', 'assets', 'portal-config.js');
if (injectIntoFile(distConfigPath, apiBase, enabled)) {
  process.stdout.write(`Injected config into ${distConfigPath}\n`);
} else {
  process.stdout.write('portal-config.js not found in dist/assets — skipping dist injection\n');
}

// Update assets/ (source, for dev-server-without-build)
const srcConfigPath = path.resolve(root, 'assets', 'portal-config.js');
if (injectIntoFile(srcConfigPath, apiBase, enabled)) {
  process.stdout.write(`Injected config into ${srcConfigPath}\n`);
}
