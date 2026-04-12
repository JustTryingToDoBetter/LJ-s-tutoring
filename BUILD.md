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
- run_command: `npm run start`

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
	- optional `DIGITAL_APP_NAME` (or `DIGITALOCEAN_APP_NAME`, default `project-odysseus`) to auto-resolve app ID if ID is stale/missing
	- optional `DOCTL_VERSION` (defaults to `1.154.0`)
	- optional workflow input `sync_app_spec` (defaults to `false`; when `true`, `.do/app.yaml` is applied before deployment)

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
