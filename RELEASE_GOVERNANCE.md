# Release Governance

## Release Gates (must pass)
1) Security scan pass
2) Performance budget pass (CLS/INP guardrails included)
3) Integration test pass
4) Rollback plan generated for this release

## How to Run Gates
- Security and lint: npm run lint
- Integration tests: npm run test:api
- API E2E tests: npm run test:e2e:api
- Lighthouse budgets: GitHub Actions -> Lighthouse CI
- Rollback plan: node scripts/generate-rollback-plan.js
- Validate rollback plan: node scripts/check-rollback-plan.js

## Deployment Safety
- Use canary for API changes affecting auth/payroll/arcade validation.
- Promote to full rollout after 30-60 minutes of error-free monitoring.

## Evidence
Attach the following to the release record:
- Lighthouse report artifact link
- QA report artifact link
- Integration test summary
- Rollback plan file path
- Release gates evidence JSON artifact (`releases/evidence/latest-release-gates.json`)

## CI/CD Enforcement Map
- App CI: `.github/workflows/app-ci.yml`
- Security stack (SAST, secrets, dependency policy): `.github/workflows/security-stack.yml`
- Release gates: `.github/workflows/release-gates.yml`
- Deploy orchestration: `.github/workflows/deploy-api.yml`
- DR restore verification: `.github/workflows/dr-restore-verify.yml`
- DB maintenance checks: `.github/workflows/db-maintenance.yml`
