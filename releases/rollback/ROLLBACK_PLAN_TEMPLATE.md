# Rollback Plan

Release: <release-id>
Date: <yyyy-mm-dd>
Owner: <name>

## Scope
- Components affected
- Database migrations
- External dependencies

## Rollback Steps
1) Pause deployments and alert stakeholders.
2) Revert API deployment to last known good build.
3) Roll back database migrations if needed.
4) Validate health endpoints and critical workflows.

## Validation Checklist
- /health OK
- /ready OK
- Arcade session token validation OK
- Payroll approvals OK

## Risks
- Data loss window
- Cached clients

## Communication
- Incident channel
- Status page update
