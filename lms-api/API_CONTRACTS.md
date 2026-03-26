# API Contract Validation

This API uses runtime schemas and contract tests as the contract source of truth.

## Contract Sources

- Request and response schemas in `src/lib/schemas.ts` and domain contract modules.
- Contract tests in `tests/contracts/*.contract.test.ts`.

## Validation Commands

```bash
npm run test:contracts --prefix lms-api
```

## CI Enforcement

- `contracts` job in `.github/workflows/app-ci.yml` executes contract tests.
- Contract changes must ship with updated tests.

## Change Policy

- Backward-compatible changes: add optional fields and non-breaking enum values.
- Breaking changes: require explicit versioning and migration notes in release documentation.
