create extension if not exists pgcrypto;

alter table arcade_sessions
  add column if not exists client_fingerprint_hash text;

alter table arcade_scores
  add column if not exists session_id uuid references arcade_sessions(id) on delete set null,
  add column if not exists is_validated boolean not null default false;

create index if not exists idx_arcade_scores_session
  on arcade_scores (session_id, created_at desc);

create index if not exists idx_arcade_scores_validated
  on arcade_scores (is_validated, game_id, created_at desc);

create table if not exists arcade_session_tokens (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references arcade_sessions(id) on delete cascade,
  nonce text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  client_fingerprint_hash text,
  revoked_at timestamptz,
  token_version int not null default 1
);

create unique index if not exists idx_arcade_session_tokens_session_nonce
  on arcade_session_tokens (session_id, nonce);

create index if not exists idx_arcade_session_tokens_expires
  on arcade_session_tokens (expires_at);

create table if not exists arcade_score_validations (
  id uuid primary key default gen_random_uuid(),
  score_id uuid references arcade_scores(id) on delete cascade,
  session_id uuid references arcade_sessions(id) on delete set null,
  player_id uuid references arcade_players(id) on delete set null,
  game_id text not null,
  risk_score int not null default 0,
  reason_code text,
  validator text,
  telemetry_json jsonb,
  validated_at timestamptz not null default now()
);

create index if not exists idx_arcade_score_validations_session
  on arcade_score_validations (session_id, validated_at desc);

create index if not exists idx_arcade_score_validations_game
  on arcade_score_validations (game_id, validated_at desc);

create table if not exists arcade_score_quarantine (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references arcade_sessions(id) on delete set null,
  player_id uuid references arcade_players(id) on delete set null,
  game_id text not null,
  score int not null,
  payload_json jsonb not null,
  telemetry_json jsonb,
  risk_score int not null default 0,
  reason_code text,
  created_at timestamptz not null default now()
);

create index if not exists idx_arcade_score_quarantine_session
  on arcade_score_quarantine (session_id, created_at desc);

create table if not exists arcade_gameplay_events (
  event_id uuid primary key,
  event_type text not null,
  occurred_at timestamptz not null,
  session_id uuid references arcade_sessions(id) on delete set null,
  user_id uuid references arcade_players(id) on delete set null,
  anon_id text,
  source text,
  dedupe_key text not null unique,
  payload_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_arcade_gameplay_events_session
  on arcade_gameplay_events (session_id, occurred_at desc);

create index if not exists idx_arcade_gameplay_events_type
  on arcade_gameplay_events (event_type, occurred_at desc);

create table if not exists arcade_ad_events (
  event_id uuid primary key,
  event_type text not null,
  occurred_at timestamptz not null,
  session_id uuid references arcade_sessions(id) on delete set null,
  user_id uuid references arcade_players(id) on delete set null,
  anon_id text,
  source text,
  dedupe_key text not null unique,
  placement text,
  provider text,
  creative_id text,
  variant_id text,
  payload_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_arcade_ad_events_session
  on arcade_ad_events (session_id, occurred_at desc);

create index if not exists idx_arcade_ad_events_type
  on arcade_ad_events (event_type, occurred_at desc);

create index if not exists idx_arcade_ad_events_placement
  on arcade_ad_events (placement, occurred_at desc);

create table if not exists arcade_ad_providers (
  provider text primary key,
  allowed_origins jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists arcade_ad_blocklist (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  creative_id text not null,
  reason text not null,
  blocked_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seen_count int not null default 1,
  unique (provider, creative_id)
);

create table if not exists arcade_reconciliation_reports (
  id uuid primary key default gen_random_uuid(),
  report_json jsonb not null,
  created_at timestamptz not null default now()
);

alter table job_queue
  add column if not exists attempts int not null default 0,
  add column if not exists max_attempts int not null default 3,
  add column if not exists dead_lettered_at timestamptz;

create index if not exists idx_job_queue_attempts
  on job_queue (status, attempts, created_at asc);

create materialized view if not exists arcade_ad_analytics_daily as
  select
    date_trunc('day', occurred_at) as day,
    event_type,
    placement,
    provider,
    variant_id,
    count(*) as total
  from arcade_ad_events
  group by 1, 2, 3, 4, 5;

create unique index if not exists idx_arcade_ad_analytics_daily_unique
  on arcade_ad_analytics_daily (day, event_type, placement, provider, variant_id);

create index if not exists idx_arcade_ad_analytics_daily
  on arcade_ad_analytics_daily (day desc, event_type, placement);

create materialized view if not exists arcade_gameplay_analytics_daily as
  select
    date_trunc('day', occurred_at) as day,
    event_type,
    count(*) as total
  from arcade_gameplay_events
  group by 1, 2;

create unique index if not exists idx_arcade_gameplay_analytics_daily_unique
  on arcade_gameplay_analytics_daily (day, event_type);

create index if not exists idx_arcade_gameplay_analytics_daily
  on arcade_gameplay_analytics_daily (day desc, event_type);
