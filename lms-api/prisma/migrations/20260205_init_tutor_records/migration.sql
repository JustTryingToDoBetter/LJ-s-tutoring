create extension if not exists pgcrypto;
create extension if not exists btree_gist;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'role') then
    create type role as enum ('ADMIN', 'TUTOR');
  end if;
  if not exists (select 1 from pg_type where typname = 'session_status') then
    create type session_status as enum ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');
  end if;
  if not exists (select 1 from pg_type where typname = 'invoice_status') then
    create type invoice_status as enum ('DRAFT', 'ISSUED', 'PAID');
  end if;
end $$;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role role not null,
  tutor_profile_id uuid,
  password_hash text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table users
  add column if not exists tutor_profile_id uuid,
  add column if not exists password_hash text,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table users
  alter column password_hash drop not null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'users' and column_name = 'role' and data_type = 'text'
  ) then
    alter table users drop constraint if exists users_role_check;
    update users set role = upper(role) where role in ('admin', 'tutor');
    alter table users alter column role type role using role::role;
  end if;
end $$;

create table if not exists magic_link_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

create unique index if not exists idx_magic_link_tokens_token_hash
  on magic_link_tokens (token_hash);

create table if not exists tutor_profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  default_hourly_rate numeric(10, 2) not null,
  active boolean not null default true
);

do $$
begin
  if exists (select 1 from pg_class where relname = 'tutors') then
    insert into tutor_profiles (id, full_name, phone, default_hourly_rate, active)
    select t.id, concat_ws(' ', t.first_name, t.last_name), t.phone, 0, true
    from tutors t
    on conflict (id) do nothing;

    update users u
    set tutor_profile_id = t.id
    from tutors t
    where t.user_id = u.id and u.tutor_profile_id is null;
  end if;
end $$;

alter table users
  add constraint users_tutor_profile_fk
  foreign key (tutor_profile_id) references tutor_profiles(id) on delete set null;

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  grade text,
  guardian_name text,
  guardian_phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table students
  add column if not exists full_name text,
  add column if not exists guardian_name text,
  add column if not exists guardian_phone text,
  add column if not exists notes text;

update students
set full_name = concat_ws(' ', first_name, last_name)
where full_name is null;

alter table students
  alter column full_name set not null;

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references tutor_profiles(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  subject text not null,
  start_date date not null,
  end_date date,
  rate_override numeric(10, 2),
  allowed_days_json jsonb not null default '[]'::jsonb,
  allowed_time_ranges_json jsonb not null default '[]'::jsonb,
  active boolean not null default true
);

create index if not exists idx_assignments_tutor_student
  on assignments (tutor_id, student_id);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references tutor_profiles(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  assignment_id uuid not null references assignments(id) on delete restrict,
  date date not null,
  start_time time not null,
  end_time time not null,
  duration_minutes int not null,
  mode text not null,
  location text,
  notes text,
  status session_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references users(id) on delete set null,
  constraint sessions_end_after_start check (end_time > start_time),
  constraint sessions_duration_positive check (duration_minutes > 0)
);

create index if not exists idx_sessions_tutor_date
  on sessions (tutor_id, date);

create table if not exists session_history (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  changed_by_user_id uuid references users(id) on delete set null,
  change_type text not null,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_session_history_session
  on session_history (session_id);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references tutor_profiles(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  invoice_number text not null,
  total_amount numeric(12, 2) not null,
  status invoice_status not null default 'DRAFT',
  created_at timestamptz not null default now()
);

create unique index if not exists idx_invoices_number
  on invoices (invoice_number);

create index if not exists idx_invoices_tutor_period
  on invoices (tutor_id, period_start);

create table if not exists invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete restrict,
  description text not null,
  minutes int not null,
  rate numeric(10, 2) not null,
  amount numeric(12, 2) not null
);

create index if not exists idx_invoice_lines_invoice
  on invoice_lines (invoice_id);

create index if not exists idx_invoice_lines_session
  on invoice_lines (session_id);

do $$
begin
  if exists (select 1 from pg_class where relname = 'sessions')
     and not exists (select 1 from pg_constraint where conname = 'sessions_no_overlap_per_tutor') then
    alter table sessions
      add constraint sessions_no_overlap_per_tutor
      exclude using gist (
        tutor_id with =,
        tsrange((date + start_time), (date + end_time), '[)') with &&
      );
  end if;
end $$;
