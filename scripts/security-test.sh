#!/usr/bin/env bash
set -euo pipefail

root_dir=$(cd "$(dirname "$0")/.." && pwd)
cd "$root_dir/lms-api"

echo "Running security tests (RBAC, CSRF, magic link reuse, rate limits)..."
npm test

echo "Security tests completed."

if [[ -n "${API_BASE:-}" ]]; then
  echo "Checking response headers from ${API_BASE}/health"
  curl -sI "${API_BASE}/health" | grep -E "X-Content-Type-Options|X-Frame-Options|Referrer-Policy|Permissions-Policy" || true
fi
