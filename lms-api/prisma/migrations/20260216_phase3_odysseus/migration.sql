create table if not exists student_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  score_date date not null,
  risk_score int not null check (risk_score between 0 and 100),
  momentum_score int not null check (momentum_score between 0 and 100),
  reasons_json jsonb not null default '[]'::jsonb,
  metrics_json jsonb not null default '{}'::jsonb,
  recommended_actions_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, score_date)
);

create index if not exists student_score_snapshots_user_date_idx
  on student_score_snapshots (user_id, score_date desc);

create table if not exists community_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  nickname text not null,
  privacy_settings_json jsonb not null default '{"leaderboardOptIn":false,"showFullName":false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_profiles_nickname_len check (char_length(trim(nickname)) between 2 and 40)
);

create table if not exists study_rooms (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  grade text,
  created_by uuid not null references users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists study_rooms_subject_grade_created_idx
  on study_rooms (subject, grade, created_at desc);

create table if not exists study_room_members (
  room_id uuid not null references study_rooms(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists study_room_members_user_joined_idx
  on study_room_members (user_id, joined_at desc);

create table if not exists study_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references study_rooms(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  content text not null,
  moderation_state text not null default 'VISIBLE',
  created_at timestamptz not null default now(),
  constraint study_room_messages_state_check
    check (moderation_state in ('VISIBLE', 'FLAGGED', 'HIDDEN', 'DELETED')),
  constraint study_room_messages_content_len check (char_length(trim(content)) between 1 and 2000)
);

create index if not exists study_room_messages_room_created_idx
  on study_room_messages (room_id, created_at desc);

create index if not exists study_room_messages_user_created_idx
  on study_room_messages (user_id, created_at desc);

create table if not exists study_room_pinned_resources (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references study_rooms(id) on delete cascade,
  title text not null,
  url text not null,
  created_by uuid not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint study_room_resource_title_len check (char_length(trim(title)) between 1 and 120)
);

create index if not exists study_room_resources_room_created_idx
  on study_room_pinned_resources (room_id, created_at desc);

create table if not exists challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null,
  grade text,
  week_start date not null,
  week_end date not null,
  xp_reward int not null check (xp_reward between 1 and 500),
  created_by uuid not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint challenges_week_order check (week_end >= week_start)
);

create index if not exists challenges_week_idx
  on challenges (week_start, week_end);

create index if not exists challenges_subject_grade_created_idx
  on challenges (subject, grade, created_at desc);

create table if not exists challenge_submissions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  content text not null,
  score int,
  feedback text,
  created_at timestamptz not null default now(),
  constraint challenge_submissions_score_check check (score is null or score between 0 and 100),
  constraint challenge_submissions_content_len check (char_length(trim(content)) between 1 and 4000),
  unique (challenge_id, user_id)
);

create index if not exists challenge_submissions_challenge_created_idx
  on challenge_submissions (challenge_id, created_at desc);

create index if not exists challenge_submissions_user_created_idx
  on challenge_submissions (user_id, created_at desc);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  subject text not null,
  topic text not null,
  title text not null,
  body text not null,
  status text not null default 'OPEN',
  moderation_state text not null default 'VISIBLE',
  created_at timestamptz not null default now(),
  constraint questions_status_check check (status in ('OPEN', 'RESOLVED', 'CLOSED')),
  constraint questions_state_check check (moderation_state in ('VISIBLE', 'FLAGGED', 'HIDDEN', 'DELETED')),
  constraint questions_title_len check (char_length(trim(title)) between 4 and 180),
  constraint questions_body_len check (char_length(trim(body)) between 8 and 5000)
);

create index if not exists questions_subject_topic_created_idx
  on questions (subject, topic, created_at desc);

create index if not exists questions_status_created_idx
  on questions (status, created_at desc);

create table if not exists answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  body text not null,
  is_verified boolean not null default false,
  verified_by uuid references users(id) on delete set null,
  moderation_state text not null default 'VISIBLE',
  created_at timestamptz not null default now(),
  constraint answers_state_check check (moderation_state in ('VISIBLE', 'FLAGGED', 'HIDDEN', 'DELETED')),
  constraint answers_body_len check (char_length(trim(body)) between 2 and 5000)
);

create index if not exists answers_question_created_idx
  on answers (question_id, created_at desc);

create index if not exists answers_user_created_idx
  on answers (user_id, created_at desc);

create table if not exists community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references users(id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint community_reports_target_type_check check (target_type in ('QUESTION', 'ANSWER', 'ROOM_MESSAGE')),
  constraint community_reports_reason_len check (char_length(trim(reason)) between 4 and 1000)
);

create index if not exists community_reports_target_idx
  on community_reports (target_type, target_id, created_at desc);

create index if not exists community_reports_reporter_idx
  on community_reports (reporter_id, created_at desc);

create table if not exists community_blocks (
  blocker_user_id uuid not null references users(id) on delete cascade,
  blocked_user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  constraint community_blocks_not_self check (blocker_user_id <> blocked_user_id)
);

create index if not exists community_blocks_blocked_idx
  on community_blocks (blocked_user_id, blocker_user_id);

create table if not exists career_goal_selections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  goal_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, goal_id)
);

create index if not exists career_goal_selections_goal_idx
  on career_goal_selections (goal_id, created_at desc);

create table if not exists career_progress_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  goal_id text not null,
  alignment_score int not null check (alignment_score between 0 and 100),
  reasons_json jsonb not null default '[]'::jsonb,
  metrics_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists career_progress_snapshots_user_goal_created_idx
  on career_progress_snapshots (user_id, goal_id, created_at desc);
