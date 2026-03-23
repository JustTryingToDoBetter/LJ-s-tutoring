-- Migration: 20260323_auth_subdomain
-- Adds fields needed for subdomain auth:
--   - google_id on users (for Google OAuth)
--   - first_name, last_name on users (admin name stored at user level)
--   - email_otp_tokens table (admin MFA via email OTP)

-- Add Google OAuth and name fields to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_id   TEXT,
  ADD COLUMN IF NOT EXISTS first_name  TEXT,
  ADD COLUMN IF NOT EXISTS last_name   TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_key ON users (google_id)
  WHERE google_id IS NOT NULL;

-- Email OTP tokens (used for admin 2-step login)
CREATE TABLE IF NOT EXISTS email_otp_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_otp_tokens_token_hash_key ON email_otp_tokens (token_hash);
CREATE INDEX        IF NOT EXISTS email_otp_tokens_token_hash_idx  ON email_otp_tokens (token_hash);
