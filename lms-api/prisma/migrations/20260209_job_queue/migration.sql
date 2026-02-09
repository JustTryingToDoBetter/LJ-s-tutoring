create table if not exists job_queue (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  status text not null default 'PENDING',
  payload_json jsonb not null,
  result_json jsonb,
  error_text text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists idx_job_queue_status
  on job_queue (status, created_at asc);
