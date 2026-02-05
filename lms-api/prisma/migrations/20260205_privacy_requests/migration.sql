do $$
begin
  if not exists (select 1 from pg_type where typname = 'privacy_request_type') then
    create type privacy_request_type as enum ('ACCESS', 'CORRECTION', 'DELETION');
  end if;
  if not exists (select 1 from pg_type where typname = 'privacy_request_status') then
    create type privacy_request_status as enum ('OPEN', 'CLOSED');
  end if;
  if not exists (select 1 from pg_type where typname = 'privacy_request_outcome') then
    create type privacy_request_outcome as enum ('FULFILLED', 'REJECTED', 'ANONYMIZED', 'DELETED', 'CORRECTED');
  end if;
  if not exists (select 1 from pg_type where typname = 'privacy_subject_type') then
    create type privacy_subject_type as enum ('TUTOR', 'STUDENT');
  end if;
end $$;

create table if not exists privacy_requests (
  id uuid primary key default gen_random_uuid(),
  request_type privacy_request_type not null,
  subject_type privacy_subject_type not null,
  subject_id uuid not null,
  reason text,
  status privacy_request_status not null default 'OPEN',
  outcome privacy_request_outcome,
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by_user_id uuid references users(id) on delete set null,
  close_note text
);

create index if not exists idx_privacy_requests_status
  on privacy_requests (status, created_at desc);

create index if not exists idx_privacy_requests_subject
  on privacy_requests (subject_type, subject_id);
