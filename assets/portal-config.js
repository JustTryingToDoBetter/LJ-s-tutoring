// This file is rewritten by `npm run inject:config` during builds.
// Keep a safe placeholder in-repo so production defaults can fall back to `/api`.
window.__PO_API_BASE__ = '/api';
// Assistant access keys are never shipped to the browser. The Odie endpoints
// use server-side authentication (session cookie + role check) and a feature
// flag. Leaving a public placeholder here so legacy code paths fail safely
// instead of sending a real secret.
window.__ODIE_ASSISTANT_ENABLED__ = true;
// Analytics transport: fail-safe no-op by default. Flip `enabled` to true in
// the deployed config when a backend analytics endpoint is available.
window.PO_ANALYTICS_CONFIG = window.PO_ANALYTICS_CONFIG || {
  enabled: false,
  endpoint: '/analytics/events',
  debug: false,
};
