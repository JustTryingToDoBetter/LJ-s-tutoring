# Build

## Static site build

`npm run build:static` copies the static site source into `dist/`.

Copied paths:

- `index.html`
- `login.html`
- `privacy.html`
- `terms.html`
- `sw.js`
- `assets/`
- `dashboard/`
- `reports/`
- `guides/`
- `tutor/`
- `admin/`
- `images/`
- `favicon.svg`
- `robots.txt`
- `sitemap.xml`

## API build

`npm run build:api` installs API dependencies inside `lms-api/` and compiles TypeScript.

This script is safe to run from the repository root in CI/deploy contexts where only root dependencies were installed.

## DigitalOcean App Platform

Recommended component settings:

Static site component:

- source_dir: repository root
- build_command: `npm ci && npm run build`
- output_dir: `dist`

API service component:

- source_dir: `lms-api`
- build_command: `npm ci && npm run build`
- run_command: `npm run start`

If your API component must build from repository root, use `npm run build:api` as the build command instead of `npm run build`.

## Public config injection

`npm run inject:config` rewrites `dist/assets/portal-config.js` so the static site knows which API base URL to call.

It reads local env files with `.env.local` precedence over `.env`.

Supported env vars, in priority order:

1. `PUBLIC_PO_API_BASE`
2. `API_BASE_URL`
3. fallback empty string (`""`) to allow same-origin calls in production; local host fallback is handled by runtime client logic.
