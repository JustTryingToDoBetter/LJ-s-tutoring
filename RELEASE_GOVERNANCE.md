# Release Governance

## Release Gates (must pass)
1) Security scan pass
2) Performance budget pass (CLS/INP guardrails included)
3) Integration test pass
4) Rollback plan generated for this release

## How to Run Gates
- Security and lint: npm run lint
- Integration tests: npm run test:api
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
