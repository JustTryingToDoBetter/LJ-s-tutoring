# Public Client Config (Safe to Expose)

These values are injected into client-side JavaScript during build and are visible to anyone who loads the site. Do NOT place secrets here.

## Injected Client Config (Public)

- `WHATSAPP_NUMBER` - Public contact number (no plus sign).
- `FORMSPREE_ENDPOINT` - Public form endpoint. Treat as public and rotate if abused.
- `CONTACT_EMAIL` - Public contact email address.
- `COUNTDOWN_DATE` - Public countdown date string.
- `ERROR_MONITOR_ENDPOINT` - Public endpoint for client error monitoring (if enabled).
- `ERROR_MONITOR_SAMPLE_RATE` - Sampling value between 0 and 1.
- `PO_API_BASE` - Public LMS/API base URL for admin/tutor portals.

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
