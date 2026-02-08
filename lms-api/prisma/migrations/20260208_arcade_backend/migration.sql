create table if not exists arcade_players (
  id uuid primary key default gen_random_uuid(),
  nickname text,
  created_at timestamptz not null default now()
);

create table if not exists arcade_games (
  id text primary key,
  title text not null
);

create table if not exists arcade_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references arcade_players(id) on delete cascade,
  game_id text not null references arcade_games(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists idx_arcade_sessions_player
  on arcade_sessions (player_id, started_at desc);

create index if not exists idx_arcade_sessions_game
  on arcade_sessions (game_id, started_at desc);

create table if not exists arcade_scores (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references arcade_players(id) on delete cascade,
  game_id text not null references arcade_games(id) on delete cascade,
  score int not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_arcade_scores_game
  on arcade_scores (game_id, score desc, created_at asc);

create index if not exists idx_arcade_scores_player
  on arcade_scores (player_id, created_at desc);

create table if not exists arcade_ad_impressions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references arcade_players(id) on delete cascade,
  placement text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_arcade_ad_impressions_player
  on arcade_ad_impressions (player_id, placement, created_at desc);

create table if not exists arcade_ad_rules (
  placement text primary key,
  cooldown_seconds int not null default 0,
  max_per_day int not null default 0
);
