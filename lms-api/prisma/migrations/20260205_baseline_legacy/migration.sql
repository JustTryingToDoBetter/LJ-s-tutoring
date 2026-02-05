-- Baseline legacy schema for existing production DBs.
-- Uses idempotent statements to avoid failing on already-migrated databases.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('admin', 'tutor')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tutors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  grade text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tutor_student_assignments (
  tutor_id uuid not null references tutors(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  is_active boolean not null default true,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  primary key (tutor_id, student_id),
  constraint tsa_unassigned_after_assigned
    check (unassigned_at is null or unassigned_at >= assigned_at),
  constraint tsa_valid_range
    check (valid_to is null or valid_to > valid_from)
);

create index if not exists idx_tsa_tutor_active
  on tutor_student_assignments (tutor_id) where is_active = true;

create index if not exists idx_tsa_tutor_student_valid
  on tutor_student_assignments (tutor_id, student_id, valid_from, valid_to)
  where is_active = true;

create table if not exists tutoring_sessions (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references tutors(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint ts_end_after_start check (end_at > start_at),
  constraint ts_not_in_future check (start_at <= now() and end_at <= now())
);

create index if not exists idx_sessions_tutor_start
  on tutoring_sessions (tutor_id, start_at desc);

create index if not exists idx_sessions_student_start
  on tutoring_sessions (student_id, start_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ts_no_overlap_per_tutor'
  ) then
    alter table tutoring_sessions
      add constraint ts_no_overlap_per_tutor
      exclude using gist (
        tutor_id with =,
        tstzrange(start_at, end_at, '[)') with &&
      );
  end if;
end $$;

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
