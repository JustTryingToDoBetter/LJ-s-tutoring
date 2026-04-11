# API Gateway (P4 Future-Proofing)

This folder contains an optional Nginx edge gateway for the LMS API.

## What It Centralizes

- Edge rate limiting:
  - General traffic: `20 requests/second` per IP
  - Auth endpoints (`/auth/*`): `5 requests/second` per IP
- Edge auth gate:
  - `/health` and `/ready` remain public
   - Other routes require `X-Gateway-Key` (enforced by default in this template)

## Important

The gateway key is loaded from `GATEWAY_SHARED_KEY` at container startup.
Set a high-entropy value before exposing the gateway publicly.

## Secret Wiring

1. Add `GATEWAY_SHARED_KEY` as a GitHub Actions secret.
2. Add `GATEWAY_SHARED_KEY` as a DigitalOcean App Platform secret.
3. If your deploy command includes `docker-compose.gateway.yml`, make sure it exports `GATEWAY_SHARED_KEY` in the deployment runtime environment.

## Run With Production API

From repository root:

1. Ensure `.env` has production API settings (`DATABASE_URL`, `COOKIE_SECRET`, `JWT_SECRET`, `PUBLIC_BASE_URL`) and `GATEWAY_SHARED_KEY`.
2. Start API + gateway:

   `docker compose -f docker-compose.prod.yml -f docker-compose.gateway.yml up -d --build`

3. Check gateway health:

   `curl -fsS http://localhost:8080/health`

4. Check an authenticated route through gateway:

   `curl -fsS -H "X-Gateway-Key: ${GATEWAY_SHARED_KEY}" http://localhost:8080/metrics`

5. Stop:

   `docker compose -f docker-compose.prod.yml -f docker-compose.gateway.yml down`

## Cloudflare Alternative

If you choose Cloudflare Workers instead of Nginx, keep the same policy model:

- Public: `/health`, `/ready`
- Auth + rate limiting: all other API routes
- Forward `X-Forwarded-For`, `X-Request-Id`, and `Authorization` headers
