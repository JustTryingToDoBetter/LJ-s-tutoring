create table if not exists auth_event_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  ip text,
  user_agent text,
  device_hash text,
  country text,
  success boolean not null default false,
  risk_score integer not null default 0,
  flags_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_auth_event_log_user
  on auth_event_log (user_id, created_at desc);

create index if not exists idx_auth_event_log_ip
  on auth_event_log (ip, created_at desc);
