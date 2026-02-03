-- 001_init.sql
-- Core auth + RBAC + tutor logging tables.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create table if not exists schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);

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
  primary key (tutor_id, student_id),
  constraint tsa_unassigned_after_assigned
    check (unassigned_at is null or unassigned_at >= assigned_at)
);

create index if not exists idx_tsa_tutor_active
  on tutor_student_assignments (tutor_id) where is_active = true;

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
