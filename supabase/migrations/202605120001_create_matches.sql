create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  room_id text not null unique,
  player1_id uuid not null references public.profiles(id) on delete cascade,
  player2_id uuid not null references public.profiles(id) on delete cascade,
  winner_id uuid references public.profiles(id),
  reason text not null check (reason in ('normal', 'disconnect', 'surrender')),
  started_at timestamptz not null,
  finished_at timestamptz not null default now()
);

create index if not exists matches_player1_idx on public.matches (player1_id, finished_at desc);
create index if not exists matches_player2_idx on public.matches (player2_id, finished_at desc);

alter table public.matches enable row level security;

drop policy if exists "Players can read own matches" on public.matches;
create policy "Players can read own matches"
  on public.matches for select
  to authenticated
  using (auth.uid() in (player1_id, player2_id));

drop policy if exists "Players can insert own matches" on public.matches;
create policy "Players can insert own matches"
  on public.matches for insert
  to authenticated
  with check (auth.uid() in (player1_id, player2_id));

