# Testing

This repo uses a test pyramid:
- Unit: Frontend helper tests (Node test runner).
- API integration: LMS API tests (Vitest + Postgres).
- E2E: LMS API E2E tests (Vitest).

## Prerequisites
- Node.js 20
- Postgres (local or Docker)
- `DATABASE_URL_TEST` set for LMS tests

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

# Browser E2E (Playwright)
npx playwright install --with-deps chromium
npm run test:e2e:web
```

## Notes
- LMS API E2E uses the test-only login endpoint enabled when `NODE_ENV=test`.
- API E2E resets and seeds the test DB before running.
- Browser E2E also uses the test-only login endpoint for deterministic role-based portal access.

## Codespaces
Use the same commands as above. Make sure Postgres is available and `DATABASE_URL_TEST` is set.
