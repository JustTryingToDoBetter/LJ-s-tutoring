-- 002_assignments_and_audit.sql

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- 1) Time-bounded assignments
alter table tutor_student_assignments
  add column if not exists valid_from timestamptz not null default now(),
  add column if not exists valid_to timestamptz;

alter table tutor_student_assignments
  add constraint tsa_valid_range check (valid_to is null or valid_to > valid_from);

create index if not exists idx_tsa_tutor_student_valid
  on tutor_student_assignments (tutor_id, student_id, valid_from, valid_to)
  where is_active = true;

-- 2) Append-only session audit log (source of truth)
create table if not exists tutoring_session_log (
  event_id uuid primary key default gen_random_uuid(),
  logical_session_id uuid not null,
  version int not null,
  action text not null check (action in ('create','amend','void')),

  tutor_id uuid not null references tutors(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,

  start_at timestamptz not null,
  end_at timestamptz not null,
  notes text,

  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint tsl_end_after_start check (end_at > start_at),
  constraint tsl_not_in_future check (start_at <= now() and end_at <= now()),
  constraint tsl_unique_version unique (logical_session_id, version)
);

create index if not exists idx_tsl_tutor_created
  on tutoring_session_log (tutor_id, created_at desc);

-- 3) Current snapshot (mutable projection from log)
create table if not exists tutoring_session_current (
  logical_session_id uuid primary key,

  tutor_id uuid not null references tutors(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,

  start_at timestamptz not null,
  end_at timestamptz not null,
  notes text,

  status text not null check (status in ('active','void')),
  current_version int not null,
  current_event_id uuid not null references tutoring_session_log(event_id) on delete restrict,

  updated_at timestamptz not null default now(),

  constraint tsc_end_after_start check (end_at > start_at),
  constraint tsc_not_in_future check (start_at <= now() and end_at <= now())
);

create index if not exists idx_tsc_tutor_start
  on tutoring_session_current (tutor_id, start_at desc);

create index if not exists idx_tsc_student_start
  on tutoring_session_current (student_id, start_at desc);

-- Overlap prevention on current active sessions (race-safe)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tsc_no_overlap_per_tutor') then
    alter table tutoring_session_current
      add constraint tsc_no_overlap_per_tutor
      exclude using gist (
        tutor_id with =,
        tstzrange(start_at, end_at, '[)') with &&
      )
      where (status = 'active');
  end if;
end $$;
