# Future LMS Security Blueprint

This document defines minimum guardrails for launching authenticated `/admin`, `/tutor`, and student LMS experiences.

## 1) Route Protection Baseline (Now)

Current static guardrails (already enforced):

- `/admin`, `/admin/*`, `/tutor`, `/tutor/*`, `/api`, `/api/*` return `404` at the edge until auth is live.
- Robots disallow internal routes.
- Netlify headers set `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store` for reserved internal routes.

## 2) Authentication + Session Model (Decision)

Use cookie-based session auth (no browser token storage for auth):

- `Set-Cookie` flags: `HttpOnly`, `Secure`, `SameSite=Lax` (or `Strict` for admin-only surfaces).
- Session IDs are random, high entropy, server-side stored, and rotated on login/privilege escalation.
- Idle timeout + absolute timeout required.
- Refresh/session rotation required on suspicious activity or password/magic-link events.
- Revocation endpoints and global sign-out required.

### CSRF Strategy

- Enforce CSRF token on state-changing requests (`POST/PUT/PATCH/DELETE`).
- Validate `Origin`/`Referer` for same-site requests.
- Bind CSRF token to user session.

## 3) RBAC Model (Decision)

Roles:

- `student`: own profile/content only.
- `tutor`: assigned students/sessions/content only.
- `admin`: full operational access.

Rules:

- Deny-by-default authorization middleware.
- Every route declares required role(s).
- Object-level checks required (ownership/assignment constraints).

## 4) Audit Logging Plan

Audit logs are mandatory for sensitive operations:

- Grade/content changes.
- Tutor assignment updates.
- Payroll/invoice approval changes.
- Role changes and login/session events.

Minimum fields:

- `actorUserId`, `actorRole`, `action`, `entityType`, `entityId`, `before`, `after`, `requestId`, `ip`, `userAgent`, `timestamp`.

Controls:

- Append-only store for audit records.
- Retention policy + protected access path for investigators/admin only.

## 5) File Upload Security Blueprint

Required controls before enabling uploads:

- Allowlist MIME + extension validation (both required).
- File size limits by type.
- Store outside public web root.
- Virus/malware scanning hook before publish.
- Signed URL access with short TTL for downloads.
- Filename randomization and metadata stripping where applicable.

## 6) Required TODOs Before LMS Go-Live

- [ ] Implement session service with secure cookie policy and rotation.
- [ ] Add CSRF middleware for all state-changing routes.
- [ ] Implement centralized RBAC + object-level authorization checks.
- [ ] Add immutable audit log pipeline + retention policy enforcement.
- [ ] Add upload gateway with MIME/extension/size validation and scanning.
- [ ] Add security integration tests for authz bypass, CSRF, and upload abuse cases.
