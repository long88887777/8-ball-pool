create table if not exists public.player_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  total_games integer not null default 0 check (total_games >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  best_streak integer not null default 0 check (best_streak >= 0),
  clearances integer not null default 0 check (clearances >= 0),
  total_strokes integer not null default 0 check (total_strokes >= 0),
  best_single_game_strokes integer check (best_single_game_strokes is null or best_single_game_strokes >= 0),
  rank_points integer not null default 1000 check (rank_points >= 0),
  recent_matches jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_stats_totals_match check (total_games >= wins + losses)
);

alter table public.player_stats enable row level security;

drop policy if exists "Users can read own player stats" on public.player_stats;
create policy "Users can read own player stats"
  on public.player_stats for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own player stats" on public.player_stats;
create policy "Users can insert own player stats"
  on public.player_stats for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own player stats" on public.player_stats;
create policy "Users can update own player stats"
  on public.player_stats for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.daily_tasks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_date date not null,
  tasks jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, task_date)
);

alter table public.daily_tasks enable row level security;

drop policy if exists "Users can read own daily tasks" on public.daily_tasks;
create policy "Users can read own daily tasks"
  on public.daily_tasks for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own daily tasks" on public.daily_tasks;
create policy "Users can insert own daily tasks"
  on public.daily_tasks for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own daily tasks" on public.daily_tasks;
create policy "Users can update own daily tasks"
  on public.daily_tasks for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.matches
  add column if not exists player1_strokes integer check (player1_strokes is null or player1_strokes >= 0),
  add column if not exists player2_strokes integer check (player2_strokes is null or player2_strokes >= 0),
  add column if not exists player1_cleared_table boolean not null default false,
  add column if not exists player2_cleared_table boolean not null default false;
