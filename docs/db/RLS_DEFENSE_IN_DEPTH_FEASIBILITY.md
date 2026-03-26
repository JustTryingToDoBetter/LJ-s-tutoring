# RLS Defense-In-Depth Feasibility

## Objective

Assess whether PostgreSQL Row Level Security (RLS) should be introduced as a second-layer authorization control.

## Current State

- Authorization is currently enforced in API code paths.
- Shared DB role model is likely used by the API runtime.
- Audit and impersonation controls exist in application logic.

## Feasibility Summary

- Feasible for high-risk multi-tenant style tables where user/tutor ownership is explicit.
- Higher migration risk for cross-role admin operations, reporting queries, and bulk workflows.
- Requires consistent DB session context propagation from API (e.g., setting app.user_id and app.role).

## Candidate Tables For Pilot

- `sessions`
- `assignments`
- `students`
- `audit_log` (read restrictions only)

## Rollout Strategy

1. Pilot RLS on one read-heavy user-scoped table with deny-by-default.
2. Add explicit policies for role exceptions (admin, support, jobs).
3. Add integration tests proving both allow and deny paths.
4. Expand table-by-table with staged releases.

## Risks

- Unexpected query breakage for admin and reporting paths.
- Background jobs may fail without explicit policy allowances.
- Complexity of debugging mixed app-level and db-level authorization.

## Recommendation

Proceed with a pilot only after:

- Session context propagation is standardized in DB connections.
- A policy testing matrix exists for all roles.
- Operational playbook includes fast rollback for policy regressions.
