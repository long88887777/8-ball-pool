create table if not exists public.player_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  coins integer not null default 260 check (coins >= 0),
  last_check_in_date date,
  unlocked_cue_ids text[] not null default array['classic-maple'],
  equipped_cue_id text not null default 'classic-maple',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_wallets_default_cue_unlocked check ('classic-maple' = any(unlocked_cue_ids)),
  constraint player_wallets_equipped_cue_unlocked check (equipped_cue_id = any(unlocked_cue_ids))
);

alter table public.player_wallets enable row level security;

drop policy if exists "Users can read own wallet" on public.player_wallets;
create policy "Users can read own wallet"
  on public.player_wallets for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own wallet" on public.player_wallets;
create policy "Users can insert own wallet"
  on public.player_wallets for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own wallet" on public.player_wallets;
create policy "Users can update own wallet"
  on public.player_wallets for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

