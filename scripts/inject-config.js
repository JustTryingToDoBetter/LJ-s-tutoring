const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const distConfigPath = path.resolve(__dirname, '..', 'dist', 'assets', 'portal-config.js');
if (!fs.existsSync(distConfigPath)) {
  console.warn('portal-config.js not found in dist/assets');
  process.exit(0);
}

const apiBase = (process.env.PUBLIC_PO_API_BASE || process.env.API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const source = fs.readFileSync(distConfigPath, 'utf8');
fs.writeFileSync(distConfigPath, source.replace('__PO_API_BASE__', apiBase));
process.stdout.write(`Injected PUBLIC_PO_API_BASE into ${distConfigPath}\n`);
