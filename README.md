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

## Docker Postgres

If you do not have Postgres installed locally, use the bundled Docker setup.

```bash
docker compose up -d db
```

That starts Postgres 16 on `localhost:5433` with the defaults from `.env.example`:

```env
POSTGRES_PASSWORD=postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/lms
```

To run the API and Postgres together in Docker:

```bash
docker compose up api db
```

The API container waits for Postgres to become healthy before starting migrations.

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

The API bootstrap loads environment variables from the repository root `.env` and from `lms-api/.env`.
For local `npm start`, make sure `DATABASE_URL`, `COOKIE_SECRET`, `JWT_SECRET`, and `GROQ_API_KEY` are set before starting the API.

See `.env.example` for the canonical local setup.

### Assistant API

The student dashboard now uses the assistant layer at:

- `POST /assistant/chat`
- `POST /assistant/document`

Both endpoints expect an authenticated session and a CSRF token when called from the browser.

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
docker compose up -d db # Start only Postgres in Docker
docker compose up api db # Run API + Postgres in Docker
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
