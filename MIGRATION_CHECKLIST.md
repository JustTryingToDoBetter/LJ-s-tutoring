# Next Migration Checklist

Status legend: ✅ migrated to Next route, 🟡 parity route scaffolded in Next, 🔁 redirected, ⏳ legacy static fallback.

## Public / Marketing

- ✅ `/` -> `web/app/(public)/page.tsx`
- ✅ `/about` -> `web/app/(public)/about/page.tsx`
- ✅ `/pricing` -> `web/app/(public)/pricing/page.tsx`
- ✅ `/privacy` -> `web/app/privacy/page.tsx`
- ✅ `/terms` -> `web/app/terms/page.tsx`
- ✅ `/guides` -> `web/app/guides/page.tsx`
- ✅ `/guides/matric-maths-mistakes-guide` -> `web/app/guides/[slug]/page.tsx`
- 🔁 `/privacy.html`, `/terms.html`, `/guides/matric-maths-mistakes-guide.html` -> Next redirects in `web/next.config.mjs`

## Student

- ✅ `/dashboard` -> `web/app/(app)/dashboard/page.tsx`
- ✅ `/reports` -> `web/app/(app)/reports/page.tsx`
- ✅ `/reports/[id]` -> `web/app/(app)/reports/[id]/page.tsx`
- ✅ `/community` -> `web/app/(app)/community/page.tsx`
- ✅ `/vault` -> `web/app/(app)/vault/page.tsx`
- ✅ `/assistant` -> `web/app/(app)/assistant/page.tsx`
- ✅ `/parent` -> `web/app/(app)/parent/page.tsx`
- 🔁 `/dashboard/index.html`, `/dashboard/community/index.html`, `/reports/index.html`, `/reports/view/index.html` -> Next redirects

## Tutor

- ✅ `/tutor/dashboard` -> `web/app/(app)/tutor/dashboard/page.tsx`
- ✅ `/tutor/reports` -> `web/app/(app)/tutor/reports/page.tsx`
- ✅ `/tutor/risk` -> `web/app/(app)/tutor/risk/page.tsx`
- 🔁 `/tutor/index.html`, `/tutor-dashboard.html`, `/tutor/reports/index.html`, `/tutor/risk/index.html` -> Next redirects

## Admin

- ✅ `/admin` -> `web/app/admin/page.tsx`
- 🟡 `/admin/:section` -> `web/app/admin/[section]/page.tsx`
  - `tutors`, `students`, `assignments`, `approvals`, `payroll`, `reconciliation`, `retention`, `audit`, `privacy-requests`, `ops-runbook`
- 🔁 `/admin/index.html`, `/admin/*.html` -> Next redirects

## Auth + RBAC + Cache

- ✅ Middleware protects `/admin`, `/dashboard`, `/reports`, `/assistant`, `/vault`, `/parent`, `/community`, `/tutor`
- ✅ Unauthenticated users are redirected to `/login`
- ✅ Protected responses set `Cache-Control: private, no-store, max-age=0`
- ✅ Session cookie remains HttpOnly from `lms-api`

## Legacy JS logic port status

- ✅ Core Next auth/session flow uses `web/app/api/auth/*` and `web/lib/server-auth.ts`
- 🟡 Legacy admin/tutor/student page logic is in static modules under `assets/` and should be progressively moved into typed React modules per route
- 🟡 Legacy consent analytics (`assets/analytics.js`) remains reference implementation; Next equivalent should be completed as a dedicated client component in a follow-up PR

## Redirect map source

- Maintained in `web/next.config.mjs`.
