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

The template currently uses a placeholder gateway key (`change_me_before_enable`).
Change this before exposing the gateway publicly.

## Run With Production API

From repository root:

1. Ensure `.env` has production API settings (`DATABASE_URL`, `COOKIE_SECRET`, `JWT_SECRET`, `PUBLIC_BASE_URL`).
2. Start API + gateway:

   `docker compose -f docker-compose.prod.yml -f docker-compose.gateway.yml up -d --build`

3. Check gateway health:

   `curl -fsS http://localhost:8080/health`

4. Check an authenticated route through gateway:

   `curl -fsS -H "X-Gateway-Key: change_me_before_enable" http://localhost:8080/ready`

5. Stop:

   `docker compose -f docker-compose.prod.yml -f docker-compose.gateway.yml down`

## Cloudflare Alternative

If you choose Cloudflare Workers instead of Nginx, keep the same policy model:

- Public: `/health`, `/ready`
- Auth + rate limiting: all other API routes
- Forward `X-Forwarded-For`, `X-Request-Id`, and `Authorization` headers
