do $$
begin
  if exists (
    select 1 from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'role' and e.enumlabel = 'STUDENT'
  ) then
    null;
  else
    alter type role add value 'STUDENT';
  end if;
end $$;

alter table users
  add column if not exists student_id uuid;

alter table users
  drop constraint if exists users_student_id_fkey;

alter table users
  add constraint users_student_id_fkey
  foreign key (student_id)
  references students(id)
  on delete set null;

create unique index if not exists users_student_id_unique
  on users(student_id)
  where student_id is not null;

create table if not exists study_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  occurred_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz not null default now(),
  constraint study_activity_events_type_check
    check (type in ('practice_completed', 'session_attended', 'goal_completed', 'focus_session'))
);

create unique index if not exists study_activity_events_dedupe_unique
  on study_activity_events (user_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists study_activity_events_user_occurred_idx
  on study_activity_events (user_id, occurred_at desc);

create table if not exists study_streaks (
  user_id uuid primary key references users(id) on delete cascade,
  current int not null default 0,
  longest int not null default 0,
  last_credited_date date,
  xp int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_streaks_current_nonneg check (current >= 0),
  constraint study_streaks_longest_nonneg check (longest >= 0),
  constraint study_streaks_xp_nonneg check (xp >= 0)
);

create table if not exists weekly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  payload_json jsonb not null,
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint weekly_reports_week_order check (week_end >= week_start)
);

create unique index if not exists weekly_reports_user_week_unique
  on weekly_reports (user_id, week_start, week_end);

create index if not exists weekly_reports_user_created_idx
  on weekly_reports (user_id, created_at desc);

create table if not exists tutor_student_map (
  tutor_id uuid not null references tutor_profiles(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tutor_id, student_id)
);

create index if not exists tutor_student_map_student_idx
  on tutor_student_map (student_id, tutor_id);

insert into tutor_student_map (tutor_id, student_id)
select distinct a.tutor_id, a.student_id
from assignments a
where a.tutor_id is not null and a.student_id is not null
on conflict do nothing;
