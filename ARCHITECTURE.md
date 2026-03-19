# Architecture

## Current shape

Project Odysseus is intentionally simple:

- a static front-end served from `dist/`
- one Fastify backend in `lms-api/`
- one Postgres database

The browser pages call the API directly using `PUBLIC_PO_API_BASE`.

## Why this architecture

- static pages keep deployment simple and domain-friendly
- the API keeps auth, RBAC, reporting, payroll, community, and scoring in one place
- the codebase avoids framework/runtime overhead in the front-end

## Front-end folders

- `assets/` contains shared CSS and browser modules
- `dashboard/`, `reports/`, `tutor/`, `admin/`, and `guides/` contain the HTML pages
- root HTML files are the public pages (`index.html`, `login.html`, `privacy.html`, `terms.html`)

## Back-end folders

- `lms-api/src/routes/` exposes the Fastify HTTP surface
- `lms-api/src/lib/` contains shared backend helpers
- `lms-api/src/domains/` contains backend domain modules

## Build flow

1. `scripts/build-static.js` copies static sources into `dist/`
2. `scripts/inject-config.js` injects the public API base into `dist/assets/portal-config.js`
3. `lms-api` builds separately with TypeScript
