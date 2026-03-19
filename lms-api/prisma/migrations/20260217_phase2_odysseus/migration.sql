do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_tier') then
    create type user_tier as enum ('BASIC', 'PREMIUM');
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'role' and e.enumlabel = 'PARENT'
  ) then
    null;
  else
    alter type role add value 'PARENT';
  end if;
end $$;

create table if not exists parent_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  full_name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table users
  add column if not exists parent_profile_id uuid,
  add column if not exists tier user_tier not null default 'BASIC';

alter table users
  drop constraint if exists users_parent_profile_fk;

alter table users
  add constraint users_parent_profile_fk
  foreign key (parent_profile_id)
  references parent_profiles(id)
  on delete set null;

create unique index if not exists users_parent_profile_id_unique
  on users(parent_profile_id)
  where parent_profile_id is not null;

create table if not exists parent_student_links (
  id uuid primary key default gen_random_uuid(),
  parent_profile_id uuid not null references parent_profiles(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  relationship text,
  created_at timestamptz not null default now(),
  unique (parent_profile_id, student_id)
);

create index if not exists parent_student_links_parent_idx
  on parent_student_links(parent_profile_id, created_at desc);

create index if not exists parent_student_links_student_idx
  on parent_student_links(student_id, created_at desc);

create table if not exists parent_invites (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  email text not null,
  relationship text,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by_parent_profile_id uuid references parent_profiles(id) on delete set null,
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists parent_invites_student_idx
  on parent_invites(student_id, created_at desc);

create index if not exists parent_invites_email_idx
  on parent_invites(email, created_at desc);

create table if not exists vault_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text,
  body_markdown text not null,
  minimum_tier user_tier not null default 'BASIC',
  is_published boolean not null default true,
  is_public_preview boolean not null default false,
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vault_resources_category_idx
  on vault_resources(category, created_at desc);

create index if not exists vault_resources_published_idx
  on vault_resources(is_published, minimum_tier, created_at desc);

create table if not exists vault_assets (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references vault_resources(id) on delete cascade,
  file_name text not null,
  mime_type text not null,
  content_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists vault_assets_resource_idx
  on vault_assets(resource_id, created_at desc);

create table if not exists vault_access_rules (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references vault_resources(id) on delete cascade,
  role role not null,
  is_allowed boolean not null default true,
  unique (resource_id, role)
);

create index if not exists vault_access_rules_role_idx
  on vault_access_rules(role, resource_id);

create table if not exists assistant_threads (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users(id) on delete cascade,
  owner_role role not null,
  student_id uuid references students(id) on delete set null,
  tutor_id uuid references tutor_profiles(id) on delete set null,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assistant_threads_owner_idx
  on assistant_threads(owner_user_id, created_at desc);

create table if not exists assistant_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references assistant_threads(id) on delete cascade,
  author text not null check (author in ('user', 'assistant', 'system')),
  content text not null,
  model text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists assistant_messages_thread_idx
  on assistant_messages(thread_id, created_at asc);

create table if not exists assistant_citations (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references assistant_messages(id) on delete cascade,
  resource_id uuid not null references vault_resources(id) on delete cascade,
  snippet text,
  confidence numeric(5, 4),
  created_at timestamptz not null default now()
);

create index if not exists assistant_citations_message_idx
  on assistant_citations(message_id);

create index if not exists assistant_citations_resource_idx
  on assistant_citations(resource_id);
