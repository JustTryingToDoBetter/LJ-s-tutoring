create table if not exists retention_events (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  config_json jsonb not null,
  cutoffs_json jsonb not null,
  summary_json jsonb not null
);

create index if not exists idx_retention_events_ran_at
  on retention_events (ran_at desc);
