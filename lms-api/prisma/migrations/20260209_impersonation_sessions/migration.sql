create table if not exists impersonation_sessions (
  id uuid primary key,
  admin_user_id uuid not null references users(id) on delete cascade,
  tutor_id uuid not null references tutor_profiles(id) on delete cascade,
  tutor_user_id uuid not null references users(id) on delete cascade,
  session_hash text not null,
  mode text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_impersonation_sessions_admin
  on impersonation_sessions (admin_user_id, created_at desc);

create index if not exists idx_impersonation_sessions_tutor
  on impersonation_sessions (tutor_id, created_at desc);

create index if not exists idx_impersonation_sessions_expires
  on impersonation_sessions (expires_at);
