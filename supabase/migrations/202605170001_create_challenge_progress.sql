create table if not exists public.challenge_progress (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  levels jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.challenge_progress enable row level security;

drop policy if exists "Users can read own challenge progress" on public.challenge_progress;
create policy "Users can read own challenge progress"
  on public.challenge_progress for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own challenge progress" on public.challenge_progress;
create policy "Users can insert own challenge progress"
  on public.challenge_progress for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own challenge progress" on public.challenge_progress;
create policy "Users can update own challenge progress"
  on public.challenge_progress for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
