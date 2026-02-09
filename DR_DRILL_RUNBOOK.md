# Disaster Recovery Drill Runbook

Frequency: Monthly

## 1) Database Restore Verification
1) Provision a clean Postgres instance.
2) Restore the latest production backup.
3) Run migrations: npm run migrate --prefix lms-api
4) Verify /ready returns ok.

## 2) Session Integrity Verification
1) Run a sample arcade session (start, score, end).
2) Verify session token validation accepts only signed tokens.
3) Confirm scores appear only when validated.

## 3) Audit Continuity Verification
1) Export audit log from admin console.
2) Check that audit_log records exist for last 24 hours.

## 4) Evidence Logging
- Record timestamps, operator, and outcome.
- Attach logs/screenshots to the DR logbook.

## Rollback Procedure
1) Activate read-only mode for API.
2) Restore DB snapshot to last known good.
3) Re-run migrations.
4) Re-enable API and confirm health endpoints.
