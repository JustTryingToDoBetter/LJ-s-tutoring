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

function injectIntoFile(filePath, apiBase, odieAccessKey) {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  const source = fs.readFileSync(filePath, 'utf8');
  const withApiBase = source.replace(
    /window\.__PO_API_BASE__\s*=\s*.*?;\s*$/m,
    `window.__PO_API_BASE__ = '${apiBase}';`,
  );
  const withOdieKey = withApiBase.replace(
    /window\.__ODIE_ACCESS_KEY__\s*=\s*.*?;\s*$/m,
    `window.__ODIE_ACCESS_KEY__ = '${odieAccessKey}';`,
  );
  fs.writeFileSync(filePath, withOdieKey);
  return true;
}

const rawApiBase = (process.env.PUBLIC_PO_API_BASE || process.env.API_BASE_URL || '').replace(/\/$/, '');
const apiBase = resolveApiBase(rawApiBase);
const odieAccessKey = (process.env.PUBLIC_ODIE_ACCESS_KEY || '').trim();

if (apiBase !== rawApiBase) {
  process.stdout.write(`Codespace detected — rewrote API base: ${rawApiBase} → ${apiBase}\n`);
}

// Update dist/ (production build output)
const distConfigPath = path.resolve(root, 'dist', 'assets', 'portal-config.js');
if (injectIntoFile(distConfigPath, apiBase, odieAccessKey)) {
  process.stdout.write(`Injected config into ${distConfigPath}\n`);
} else {
  process.stdout.write('portal-config.js not found in dist/assets — skipping dist injection\n');
}

// Update assets/ (source, for dev-server-without-build)
const srcConfigPath = path.resolve(root, 'assets', 'portal-config.js');
if (injectIntoFile(srcConfigPath, apiBase, odieAccessKey)) {
  process.stdout.write(`Injected config into ${srcConfigPath}\n`);
}
