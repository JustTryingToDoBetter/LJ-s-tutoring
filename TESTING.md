# Testing

This repo uses a test pyramid:
- Unit: JS helpers (Vitest).
- API integration: LMS API tests (Vitest + Postgres).
- E2E: Playwright for website, arcade, and portals.

## Prerequisites
- Node.js 20
- Postgres (local or Docker)
- `DATABASE_URL_TEST` set for LMS tests and UI E2E

Example Docker-backed local Postgres:
```
docker compose up -d db
export DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5433/lms_test
```

If you use the default compose setup, create the `lms_test` database before running tests.

## Run all tests
```
npm run test:all
```

## Individual suites
```
# Unit (frontend helpers)
npm run test:unit

# API integration (LMS)
npm run test:api

# LMS API E2E (Vitest)
npm run test:e2e:api

# UI E2E (Playwright)
npm run test:e2e
```

## Notes
- UI E2E uses Playwright with a local static server and LMS API server.
- LMS UI tests depend on the test-only login endpoint, enabled when `NODE_ENV=test`.
- UI E2E resets and seeds the test DB before running.

## Codespaces
Use the same commands as above. Make sure Postgres is available and `DATABASE_URL_TEST` is set.
