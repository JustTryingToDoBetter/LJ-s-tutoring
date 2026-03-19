const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

const copyTargets = [
  'index.html',
  'login.html',
  'privacy.html',
  'terms.html',
  'favicon.svg',
  'robots.txt',
  'sitemap.xml',
  'assets',
  'dashboard',
  'reports',
  'guides',
  'tutor',
  'admin',
  'images',
];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const target of copyTargets) {
  const source = path.join(root, target);
  if (!fs.existsSync(source)) {
    continue;
  }
  const destination = path.join(dist, target);
  fs.cpSync(source, destination, { recursive: true });
}

process.stdout.write('Static site copied to dist/.\n');
