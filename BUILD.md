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

## Public config injection

`npm run inject:config` rewrites `dist/assets/portal-config.js` so the static site knows which API base URL to call.

Supported env vars, in priority order:

1. `PUBLIC_PO_API_BASE`
2. `API_BASE_URL`
3. fallback empty string (`""`) to allow same-origin calls in production; local host fallback is handled by runtime client logic.
