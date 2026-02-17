# Next Web Deployment (DigitalOcean + Cloudflare)

This guide deploys the new Next.js App Router app in `web/` while keeping `lms-api/` as the system of record for auth, RBAC, and domain APIs.

## 1) Architecture

- `web` runs as a Node.js web service (DigitalOcean App Platform or Droplet).
- `lms-api` runs as a separate Node.js API service with Postgres.
- Cloudflare sits in front of both and handles TLS, CDN, and cache policy.

## 2) Required environment variables

Set on the `web` service:

- `API_BASE_URL=https://api.your-domain.com`
- `NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.com`

Set on the `lms-api` service (existing):

- `DATABASE_URL=...`
- `COOKIE_SECRET=...`
- `PUBLIC_BASE_URL=https://api.your-domain.com`
- `SCORE_CRON_TOKEN=...`

Set on API service for role-based portal redirects:

- `ADMIN_PORTAL_URL=https://admin.your-domain.com`
- `TUTOR_PORTAL_URL=https://tutor.your-domain.com`
- `STUDENT_PORTAL_URL=https://student.your-domain.com`
- `CORS_ORIGIN=https://admin.your-domain.com,https://tutor.your-domain.com,https://student.your-domain.com`

## 2.1) Subdomain wiring (DigitalOcean)

- Point `admin.your-domain.com`, `tutor.your-domain.com`, `student.your-domain.com` to your web/static origin.
- Point `api.your-domain.com` to `lms-api` origin.
- Add rewrites on the web/static origin:
  - `admin.*` host root `/` -> `/admin/`
  - `tutor.*` host root `/` -> `/tutor/dashboard/`
  - `student.*` host root `/` -> `/dashboard/`
- Keep API calls targeting `https://api.your-domain.com` via `PUBLIC_PO_API_BASE`.

## 3) Build and run commands

For `web` service:

- Build: `npm install && npm run build`
- Run: `npm run start`
- HTTP port: `3000`

For `lms-api` service:

- Build: `npm ci --prefix lms-api`
- Run: `npm run start --prefix lms-api`
- HTTP port: `3001`

## 4) Cloudflare cache policy

Apply two rules:

1. Public pages (`/`, `/pricing`, `/about`) may be cached at edge.
2. Authenticated surfaces must not be cached:
   - `/dashboard*`
   - `/reports*`
   - `/assistant*`
   - `/vault*`
   - `/parent*`
   - `/community*`
   - `/tutor*`
   - `/api/auth/*`

Expected response header on private/authenticated routes:

- `Cache-Control: private, no-store, max-age=0`

## 5) Session and security requirements

- Session cookies remain HttpOnly and issued by `lms-api`.
- CSRF protections remain enforced by `lms-api` for state-changing actions.
- Next middleware guards protected routes and redirects anonymous users to `/login`.
- Keep strict transport security and CSP on edge/origin as currently configured.

## 6) Post-deploy smoke checks

- Anonymous request to `/dashboard` returns redirect to `/login`.
- `/api/auth/session` includes `Cache-Control: private, no-store, max-age=0`.
- Login sets session cookie and routes by role:
  - Student -> `/dashboard`
  - Tutor/Admin -> `/tutor/dashboard`

## 7) Rollout strategy (low risk)

1. Deploy `web` behind a subdomain first (e.g. `next.your-domain.com`).
2. Validate auth/session/cache behavior and parity routes.
3. Cut selected routes at Cloudflare to new `web` origin.
4. Keep static legacy routes available during phased cutover.
5. Roll back by pointing routes back to legacy static origin.
