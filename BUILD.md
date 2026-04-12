# Build

## Static site build

`npm run build:static` copies the static site source into `dist/`.

Copied paths:

- `index.html`
- `login.html`
- `privacy.html`
- `terms.html`
- `sw.js`
- `assets/`
- `dashboard/`
- `reports/`
- `guides/`
- `tutor/`
- `admin/`
- `images/`
- `favicon.svg`
- `robots.txt`
- `sitemap.xml`

## API build

`npm run build:api` installs API dependencies inside `lms-api/` and compiles TypeScript.

This script is safe to run from the repository root in CI/deploy contexts where only root dependencies were installed.

## DigitalOcean App Platform

Recommended component settings:

Static site component:

- source_dir: repository root
- build_command: `npm ci && npm run build`
- output_dir: `dist`

API service component:

- source_dir: `lms-api`
- build_command: `npm ci && npm run build`
- run_command: `npm run prisma:migrate:safe && npm start`

Migration startup note:

- `prisma:migrate:safe` runs `prisma migrate deploy`, and if it detects Prisma `P3009` for allowlisted failed migrations (default: `20260205_audit_log`), it resolves them as rolled back and retries deploy once.
- You can override the allowlist with `PRISMA_AUTO_RESOLVE_MIGRATIONS` (comma-separated migration names).

If your API component must build from repository root, use `npm run build:api` as the build command instead of `npm run build`.

Routing note:

- The app spec in `.do/app.yaml` uses component routes: `website` serves `/` and `api` serves `/api`.
- The static site sets `PUBLIC_PO_API_BASE=/api` so browser calls land on the API prefix.
- Without this route setup, API endpoints can return static-site 404 pages.

### GitHub Deploy Workflow Inputs

The workflow in `.github/workflows/deploy-api.yml` reads deploy settings from GitHub Secrets or GitHub Variables.

Required names:

- `API_DEPLOY_COMMAND` (set either an executable shell command or `production`)
- `API_ROLLBACK_COMMAND` (required when rollback mode is used)
- `HEALTHCHECK_URL` (base URL used for post-deploy `/ready` check; with current routes use `https://projectodysseus.live/api`)
- `GATEWAY_SHARED_KEY` (required when deploy command uses `docker-compose.gateway.yml`)

Special case supported by workflow:

- If `API_DEPLOY_COMMAND=production`, the workflow performs a DigitalOcean deployment using:
	- `DIGITAL_ACCESS_TOKEN` (or `DIGITALOCEAN_ACCESS_TOKEN`)
	- `DIGITAL_APP_ID` (or `DIGITALOCEAN_APP_ID`) when available
	- optional `DIGITAL_APP_NAME` (or `DIGITALOCEAN_APP_NAME`, default `projectodysseus`) to auto-resolve app ID if ID is stale/missing
	- optional `DOCTL_VERSION` (defaults to `1.154.0`)
	- optional `DO_DEPLOY_MAX_CHECKS` (defaults to `120`) and `DO_DEPLOY_POLL_SECONDS` (defaults to `10`) for deployment phase polling
	- optional workflow input `sync_app_spec` (defaults to `false`; when `true`, `.do/app.yaml` is applied before deployment)

Resolver behavior:

- The workflow resolves app IDs by exact name match first, then by normalized name match (for example `project-odysseus` vs `projectodysseus`).
- If only one app is visible to the token context, the workflow auto-selects it.
- On deployment timeout or terminal failure, the workflow now prints deployment details plus recent `deploy` and `run` logs from App Platform for faster root-cause diagnosis.
- Before creating a deployment, the workflow checks that the live app spec contains required API env keys (`DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECRET`) and that an API route exists on `/api`.
- When `sync_app_spec=true`, the workflow retries `/api` route detection to allow for App Platform propagation lag and warns (instead of immediate failure) if the route is not instantly visible.

Health check default:

- If `HEALTHCHECK_URL` is not set in secrets/variables, the workflow defaults to `https://projectodysseus.live/api` and checks `/ready` there.

Example `API_DEPLOY_COMMAND` formats:

- `./scripts/deploy-api.sh`
- `doctl apps create-deployment <app-id> --wait`

## Public config injection

`npm run inject:config` rewrites `dist/assets/portal-config.js` so the static site knows which API base URL to call.

It reads local env files with `.env.local` precedence over `.env`.

Supported env vars, in priority order:

1. `PUBLIC_PO_API_BASE`
2. `API_BASE_URL`
3. fallback empty string (`""`) to allow same-origin calls in production; local host fallback is handled by runtime client logic.
