alter table public.matchmaking_queue
  add column if not exists game_ruleset text not null default 'eight-ball'
  check (game_ruleset in ('eight-ball', 'nine-ball'));

alter table public.rooms
  add column if not exists game_ruleset text not null default 'eight-ball'
  check (game_ruleset in ('eight-ball', 'nine-ball'));

create or replace function public.match_find_opponent(
  current_user_id uuid,
  desired_ruleset text default 'eight-ball'
)
returns table(id uuid, user_id uuid)
language plpgsql
security definer
as $$
begin
  return query
  select mq.id, mq.user_id
  from public.matchmaking_queue mq
  where mq.status = 'waiting'
    and mq.user_id <> current_user_id
    and mq.game_ruleset = desired_ruleset
  order by mq.created_at asc
  limit 1
  for update skip locked;
end;
$$;
