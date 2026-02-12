# Public Client Config (Safe to Expose)

These values are injected into client-side JavaScript during build and are visible to anyone who loads the site. Do NOT place secrets here.

## Injected Client Config (Public)

- `PUBLIC_WHATSAPP_NUMBER` - Public contact number (no plus sign).
- `PUBLIC_FORMSPREE_ENDPOINT` - Public form endpoint. Treat as public and rotate if abused.
- `PUBLIC_CONTACT_EMAIL` - Public contact email address.
- `PUBLIC_COUNTDOWN_DATE` - Public countdown date string.
- `PUBLIC_ERROR_MONITOR_ENDPOINT` - Public endpoint for client error monitoring (if enabled).
- `PUBLIC_ERROR_MONITOR_SAMPLE_RATE` - Sampling value between 0 and 1.
- `PUBLIC_PO_API_BASE` - Public LMS/API base URL for admin/tutor portals.

Build guardrails enforce this namespace:

- Only `PUBLIC_*` keys are allowed for client configuration injection.
- Legacy keys without `PUBLIC_` fail the build.
- Secret-like names (e.g. containing `SECRET`, `TOKEN`, `PRIVATE`, `API_KEY`) are blocked in the `PUBLIC_*` namespace.

## Server-Only Secrets (Never Public)

These must remain server-side only and must NOT be injected into the client:

- `DATABASE_URL`
- `COOKIE_SECRET`
- `EMAIL_PROVIDER_KEY`
- Any API keys, auth tokens, or private credentials

## DigitalOcean App Platform

Set public client values in the App Platform environment variables for the static site.
Set server secrets only in the backend service environment variables.

## Rotation Guidance

If `FORMSPREE_ENDPOINT` or `ERROR_MONITOR_ENDPOINT` are abused, rotate them and update the App Platform env values.
