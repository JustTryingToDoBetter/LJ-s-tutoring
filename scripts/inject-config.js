const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const distConfigPath = path.resolve(__dirname, '..', 'dist', 'assets', 'portal-config.js');
if (!fs.existsSync(distConfigPath)) {
  console.warn('portal-config.js not found in dist/assets');
  process.exit(0);
}

const apiBase = (process.env.PUBLIC_PO_API_BASE || process.env.API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const odieAccessKey = (process.env.PUBLIC_ODIE_ACCESS_KEY || '').trim();
const source = fs.readFileSync(distConfigPath, 'utf8');
const withApiBase = source.replace(/window\.__PO_API_BASE__\s*=\s*.*?;\s*$/m, `window.__PO_API_BASE__ = ${JSON.stringify(apiBase)};`);
const withOdieKey = withApiBase.replace(/window\.__ODIE_ACCESS_KEY__\s*=\s*.*?;\s*$/m, `window.__ODIE_ACCESS_KEY__ = ${JSON.stringify(odieAccessKey)};`);
fs.writeFileSync(distConfigPath, withOdieKey);
process.stdout.write(`Injected PUBLIC_PO_API_BASE into ${distConfigPath}\n`);
