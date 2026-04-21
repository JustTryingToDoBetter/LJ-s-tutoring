# Future LMS Security Blueprint

This document defines minimum guardrails for the authenticated `/admin`,
`/tutor`, and student LMS experiences. The previous revision claimed edge
`404` responses for internal routes; that is not how the current Netlify
deployment behaves, so this revision reconciles the documented model with
what is actually shipped.

## 1) Route Protection Baseline (Current)

What is actually enforced at the edge today (see `netlify.toml`):

- `/admin/*` and `/tutor/*` receive `X-Robots-Tag: noindex, nofollow,
  noarchive, nosnippet` and `Cache-Control: no-store` response headers.
- `/robots.txt` disallows internal routes.
- The static layer does **not** return hard `404`s for `/admin`, `/tutor`, or
  `/api`. Access control is instead enforced in the browser by role-specific
  auth guards, and in the backend by server-side authentication + RBAC on
  every sensitive route.

Authentication boundary:

- All `/api/...` routes requiring a session cookie are behind Fastify
  `authenticate` + `requireAuth` + `requireRole(...)` hooks.
- Protected HTML pages (`/dashboard/`, `/dashboard/community/`, `/reports/`,
  `/tutor/**`, `/admin/**`) include the corresponding `auth-guard.js`
  immediately after `portal-config.js` and before the domain script so that
  guards execute before any sensitive data fetches.

### Rationale for the reconciliation

- Edge `404`s require per-route rewrites that were never wired up; leaving
  the claim in the blueprint created a false sense of defence-in-depth.
- The real protection is the server-side RBAC layer which is exercised by
  the test suite, so the blueprint now matches the code and tests.
- If edge-layer hard blocking is later desired, it should be added as a
  Netlify rewrite shim and the blueprint updated at the same time.

## 2) Authentication + Session Model

Cookie-based session auth, no browser token storage for auth secrets:

- `Set-Cookie` flags: `HttpOnly`, `Secure` (prod), `SameSite=Lax`.
- Session IDs are random, high entropy, server-side stored, and rotated on
  login / privilege escalation.
- Idle + absolute timeouts required.
- Revocation endpoints and global sign-out required.

### AI assistant (Odie) specifics

- The browser bundle **never** contains an Odie access key. `portal-config.js`
  now only carries a public API base URL and a feature flag.
- Assistant endpoints authenticate via the existing session cookie (STUDENT
  / TUTOR / ADMIN). The legacy `X-Odie-Access-Key` header is only honoured
  when `ODIE_ALLOW_ACCESS_KEY_FALLBACK=true` (used, e.g., for the public
  marketing page).
- When `ASSISTANT_ENABLED=false`, all `/assistant/*` endpoints return
  `503 assistant_disabled` and the in-browser widget hides itself via the
  `window.__ODIE_ASSISTANT_ENABLED__` flag.

### CSRF Strategy

- Enforce CSRF token on state-changing requests (`POST/PUT/PATCH/DELETE`).
- Validate `Origin`/`Referer` for same-site requests.
- Bind CSRF token to user session.

## 3) RBAC Model

Roles:

- `student`: own profile/content only.
- `tutor`: assigned students/sessions/content only.
- `admin`: full operational access.

Rules:

- Deny-by-default authorization middleware.
- Every route declares required role(s).
- Object-level checks required (ownership/assignment constraints).

## 4) Audit Logging Plan

Audit logs are mandatory for sensitive operations. Minimum fields:
`actorUserId`, `actorRole`, `action`, `entityType`, `entityId`, `before`,
`after`, `requestId`, `ip`, `userAgent`, `timestamp`.

In addition to audit logs, the `analytics.event` structured-log channel
carries product-domain telemetry (`dashboard_viewed`,
`study_activity.logged`, `report_generated`, `report_viewed`,
`community.room.created`, `community.room.joined`,
`community.message.posted`, etc.) with the request id preserved.

## 5) File Upload Security Blueprint

Required controls before enabling uploads:

- Allowlist MIME + extension validation (both required).
- File size limits by type.
- Store outside public web root.
- Virus/malware scanning hook before publish.
- Signed URL access with short TTL for downloads.
- Filename randomization and metadata stripping where applicable.

## 6) Required TODOs Before LMS Go-Live

- [x] Implement session service with secure cookie policy and rotation.
- [x] Add CSRF middleware for all state-changing routes.
- [x] Implement centralized RBAC + object-level authorization checks.
- [x] Add immutable audit log pipeline + retention policy enforcement.
- [x] Remove browser-distributed Odie access key; put assistant behind
      session auth + feature flag.
- [x] Ensure every protected HTML page loads its role auth-guard before any
      sensitive data fetch.
- [ ] Add upload gateway with MIME/extension/size validation and scanning.
- [ ] Decide whether to enforce hard edge `404`s for internal routes via
      Netlify rewrites, or keep the current server-side enforcement only.
- [ ] Add security integration tests for authz bypass, CSRF, and upload
      abuse cases.
