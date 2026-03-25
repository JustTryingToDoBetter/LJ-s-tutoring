# DoD Closure Report - 2026-03-25

## Scope
This artifact maps the highest-impact production gaps to implemented controls, executable evidence, and residual risks.

## Gap Closure Matrix

| Gap | Implementation | Evidence | Residual Risk |
|---|---|---|---|
| CI/CD enforcement drift and missing gates | Consolidated enforcement in core workflows and release governance map | [.github/workflows/app-ci.yml](.github/workflows/app-ci.yml), [.github/workflows/security-stack.yml](.github/workflows/security-stack.yml), [.github/workflows/release-gates.yml](.github/workflows/release-gates.yml), [RELEASE_GOVERNANCE.md](RELEASE_GOVERNANCE.md) | Medium: branch protection and required-check policy must still be enforced in GitHub settings |
| Release evidence not machine-validated | Release evidence collector and validator introduced; negative-path checks added | [scripts/collect-release-evidence.js](scripts/collect-release-evidence.js), [scripts/validate-release-evidence.js](scripts/validate-release-evidence.js), [tests/release-evidence.test.cjs](tests/release-evidence.test.cjs), [tests/release-evidence-negative.test.cjs](tests/release-evidence-negative.test.cjs), [releases/evidence/latest-release-gates.json](releases/evidence/latest-release-gates.json) | Low: evidence contents are self-reported by current gate script and do not yet attest external services |
| Session lifecycle and revocation gaps | Server-side session tracking and revoke/logout-all pathways with auth checks on each request | [lms-api/src/routes/auth.ts](lms-api/src/routes/auth.ts), [lms-api/src/plugins/auth.ts](lms-api/src/plugins/auth.ts), [lms-api/prisma/migrations/20260325_session_lifecycle/migration.sql](lms-api/prisma/migrations/20260325_session_lifecycle/migration.sql), [lms-api/tests/auth-and-rbac.test.ts](lms-api/tests/auth-and-rbac.test.ts) | Low: no dedicated test yet for cross-tab UX behavior during forced logout |
| Cross-origin state-changing hardening incomplete | Same-origin enforcement for mutating requests in addition to CSRF token checks | [lms-api/src/app.ts](lms-api/src/app.ts), [lms-api/tests/auth-and-rbac.test.ts](lms-api/tests/auth-and-rbac.test.ts) | Low: allow-list drift risk remains if environment origin config is mismanaged |
| Audit/session history tamper resistance | Immutable triggers and controlled retention bypass semantics for deletes | [lms-api/prisma/migrations/20260325_audit_immutability/migration.sql](lms-api/prisma/migrations/20260325_audit_immutability/migration.sql), [lms-api/src/lib/retention-cleanup.ts](lms-api/src/lib/retention-cleanup.ts), [lms-api/tests/audit-immutability.test.ts](lms-api/tests/audit-immutability.test.ts) | Low: DB superuser access can still bypass controls; requires platform-level least privilege |
| Migration race/safety concerns | Advisory lock around migration execution | [lms-api/src/db/migrate.ts](lms-api/src/db/migrate.ts) | Low: lock key collision risk is minimal but non-zero across unrelated apps sharing same DB cluster |
| Schema change governance missing | Risky DDL scanner with explicit override policy | [lms-api/scripts/check-schema-governance.ts](lms-api/scripts/check-schema-governance.ts), [.github/workflows/app-ci.yml](.github/workflows/app-ci.yml) | Medium: static pattern scanner cannot capture all semantic migration risks |
| DR restore verification not automated | Restore verification script + scheduled workflow + runbook evidence requirement | [lms-api/scripts/restore-verify.ts](lms-api/scripts/restore-verify.ts), [.github/workflows/dr-restore-verify.yml](.github/workflows/dr-restore-verify.yml), [DR_DRILL_RUNBOOK.md](DR_DRILL_RUNBOOK.md), [docs/db/PITR_STRATEGY_AND_RESTORE_VERIFICATION.md](docs/db/PITR_STRATEGY_AND_RESTORE_VERIFICATION.md) | Medium: periodic drill execution and evidence discipline remain operational dependencies |
| DB maintenance posture under-defined | DB maintenance checks with thresholds and strict mode plus scheduled workflow | [lms-api/scripts/check-db-maintenance.ts](lms-api/scripts/check-db-maintenance.ts), [.github/workflows/db-maintenance.yml](.github/workflows/db-maintenance.yml), [docker-compose.yml](docker-compose.yml) | Medium: signal quality depends on pg_stat_statements availability and baseline tuning |
| Observability docs existed but no enforceable assets | Monitoring-as-code alert rules, Grafana dashboard JSON, CI validator | [ops/monitoring/prometheus/alerts.yml](ops/monitoring/prometheus/alerts.yml), [ops/monitoring/grafana/api-overview.dashboard.json](ops/monitoring/grafana/api-overview.dashboard.json), [scripts/validate-monitoring-assets.js](scripts/validate-monitoring-assets.js), [docs/ops/OBSERVABILITY_AND_SLO_BASELINE.md](docs/ops/OBSERVABILITY_AND_SLO_BASELINE.md) | Medium: rules/dashboard files are validated structurally, not yet smoke-tested against a live telemetry stack |
| Browser E2E coverage for critical role flows absent | Playwright suite for auth guards, login UX, money flow, and reject flow | [playwright.config.ts](playwright.config.ts), [tests/e2e-web/portals-auth-flow.spec.ts](tests/e2e-web/portals-auth-flow.spec.ts), [tests/e2e-web/money-flow-journey.spec.ts](tests/e2e-web/money-flow-journey.spec.ts), [tests/e2e-web/reject-flow-journey.spec.ts](tests/e2e-web/reject-flow-journey.spec.ts), [.github/workflows/app-ci.yml](.github/workflows/app-ci.yml) | Low: UI coverage is strong for critical flows but not exhaustive for all admin/tutor edge states |

## Evidence Snapshot (Latest Local Runs)
- `npm run validate:monitoring` -> `monitoring_assets_validation_passed`
- `npm run test:e2e:web` -> `11 passed`
- `npm run test --prefix lms-api -- tests/audit-immutability.test.ts` -> `2 passed`
- `node --test tests/release-evidence-negative.test.cjs` -> `4 passed`

## Remaining Items (Not Closed)
- Monitoring live-stack validation: run synthetic alert fire drills and verify pager/escalation routing end-to-end.
- Governance completion artifact sign-off: attach workflow run IDs and release artifact links for final release board approval.

## 30-60-90 Follow-Through
- 30 days: add live telemetry smoke test workflow (query Prometheus/Grafana APIs for dashboard and rule health).
- 60 days: enforce branch protection with required checks mapped to all release gates.
- 90 days: expand browser E2E to locked-period and forced-logout cross-tab edge cases.
