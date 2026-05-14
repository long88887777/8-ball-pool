create table if not exists public.matchmaking_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references public.profiles(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'matched')),
  matched_with uuid references public.profiles(id),
  room_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id text primary key,
  host_id uuid not null references public.profiles(id) on delete cascade,
  guest_id uuid references public.profiles(id),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  created_at timestamptz not null default now()
);

alter table public.matchmaking_queue enable row level security;

drop policy if exists "Users can view own queue entries" on public.matchmaking_queue;
create policy "Users can view own queue entries"
  on public.matchmaking_queue for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own queue entries" on public.matchmaking_queue;
create policy "Users can insert own queue entries"
  on public.matchmaking_queue for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own queue entries" on public.matchmaking_queue;
create policy "Users can delete own queue entries"
  on public.matchmaking_queue for delete
  to authenticated
  using (auth.uid() = user_id);

alter table public.rooms enable row level security;

drop policy if exists "Authenticated users can view all rooms" on public.rooms;
create policy "Authenticated users can view all rooms"
  on public.rooms for select
  to authenticated
  using (true);

drop policy if exists "Users can create rooms as host" on public.rooms;
create policy "Users can create rooms as host"
  on public.rooms for insert
  to authenticated
  with check (auth.uid() = host_id);

drop policy if exists "Users can join rooms as guest" on public.rooms;
create policy "Users can join rooms as guest"
  on public.rooms for update
  to authenticated
  using (guest_id is null and auth.uid() <> host_id)
  with check (auth.uid() = guest_id);

drop policy if exists "Participants can finish rooms" on public.rooms;
create policy "Participants can finish rooms"
  on public.rooms for update
  to authenticated
  using (auth.uid() in (host_id, guest_id))
  with check (auth.uid() in (host_id, guest_id));

drop policy if exists "Host can delete own room" on public.rooms;
create policy "Host can delete own room"
  on public.rooms for delete
  to authenticated
  using (auth.uid() = host_id);

create or replace function public.match_find_opponent(current_user_id uuid)
returns table(id uuid, user_id uuid)
language plpgsql
security definer
as $$
begin
  return query
  select mq.id, mq.user_id
  from public.matchmaking_queue mq
  where mq.status = 'waiting' and mq.user_id <> current_user_id
  order by mq.created_at asc
  limit 1
  for update skip locked;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.matchmaking_queue;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.rooms;
exception
  when duplicate_object then null;
end;
$$;

