create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users(id) on delete set null,
  actor_role text,
  action text not null,
  entity_type text,
  entity_id text,
  meta_json jsonb,
  ip text,
  user_agent text,
  correlation_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_created_at
  on audit_log (created_at desc);

create index if not exists idx_audit_log_actor
  on audit_log (actor_user_id, created_at desc);

create index if not exists idx_audit_log_entity
  on audit_log (entity_type, entity_id);
