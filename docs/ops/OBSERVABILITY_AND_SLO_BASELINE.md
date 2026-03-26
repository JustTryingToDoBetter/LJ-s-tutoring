# Observability And SLO Baseline

## Metrics Endpoint

- API exposes Prometheus text metrics at `GET /metrics`.
- Initial counters:
  - `po_requests_total`
  - `po_requests_slow_total`
  - `po_requests_error_total`

## Suggested Alert Rules

- High error rate: 5xx ratio > 2% over 5m.
- Latency degradation: slow request ratio > 10% over 5m.
- Availability: `/ready` failure for 3 consecutive checks.

See `docs/ops/ALERT_RESPONSE_MATRIX.md` for first-response playbooks and escalation policy.

## Monitoring As Code Assets

- Prometheus alert rules: `ops/monitoring/prometheus/alerts.yml`
- Grafana dashboard: `ops/monitoring/grafana/api-overview.dashboard.json`
- Validation command: `npm run validate:monitoring`

The validation command is enforced in CI (`.github/workflows/app-ci.yml`) to prevent alert/dashboard drift.

## Suggested SLOs

- API availability: 99.9% monthly.
- Request success rate: >= 99.5% monthly.
- P95 request latency: <= 500ms for core API paths.

## Dashboards

- Service health: request volume, 5xx, readiness state.
- Performance: slow request trend and latency percentiles.
- Security posture: logout-all events, origin_not_allowed errors.

## CI/CD Hooks

- Security gates: `.github/workflows/security-stack.yml`.
- Release gates: `.github/workflows/release-gates.yml`.
- Deploy preflight: `.github/workflows/deploy-api.yml`.
- DR checks: `.github/workflows/dr-restore-verify.yml`.
- DB health checks: `.github/workflows/db-maintenance.yml`.

## DB Maintenance Policy

- Command: `npm run db:maintenance:check --prefix lms-api`
- Strict mode command: `npm run db:maintenance:check:strict --prefix lms-api`
- Thresholds are configurable through `DB_MAINTENANCE_*` environment variables.
- In local Docker, `pg_stat_statements` is preloaded via `docker-compose.yml`.
