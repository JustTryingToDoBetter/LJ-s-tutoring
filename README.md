# Project Odysseus

Static site + LMS API monorepo.

## What this repo now contains

- Static HTML/CSS/JS pages at the repository root for the public site and portal shells.
- `lms-api/` for the Fastify + Postgres backend.
- Simple build scripts that copy the static site into `dist/` and inject the public API base.

## Quick start

```bash
npm install
cp .env.example .env
npm run build
npm run start
```

### Local URLs

- Static site: `http://localhost:8080`
- API: `http://localhost:3001`
- Login: `http://localhost:8080/login.html`
- Student dashboard: `http://localhost:8080/dashboard/`
- Tutor dashboard: `http://localhost:8080/tutor/dashboard/`

## Environment variables

### Public client config

Only safe public values should be exposed to browser code.

```env
PUBLIC_PO_API_BASE=http://localhost:3001
```

`PUBLIC_PO_API_BASE` is injected into `dist/assets/portal-config.js` during the static build.

### API config

See `lms-api/README` equivalent docs in `lms-api/package.json` scripts and `.env.example` for backend setup.

## Scripts

```bash
npm run build        # Build static site + API
npm run build:static # Copy static source files to dist/
npm run inject:config
npm run serve        # Serve dist/ on port 8080
npm run dev          # Serve static site + run API dev server
npm run start        # Serve static site + run API prod server
npm run lint         # Lint JS and validate HTML
npm run test         # Run API tests
```

## Static site structure

```text
index.html
login.html
privacy.html
terms.html
assets/
  portal.css
  portal-config.js
  common.js
  student/
  tutor/
  admin/
dashboard/
reports/
guides/
tutor/
admin/
lms-api/
```
