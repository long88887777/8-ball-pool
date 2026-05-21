create or replace function public.settle_online_match(
  p_room_id text,
  p_winner_id uuid,
  p_reason text,
  p_started_at timestamptz,
  p_player1_strokes integer default null,
  p_player2_strokes integer default null,
  p_player1_cleared_table boolean default false,
  p_player2_cleared_table boolean default false
)
returns table(match_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_existing_match_id uuid;
  v_loser_id uuid;
  v_match_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_reason not in ('normal', 'disconnect', 'surrender') then
    raise exception 'invalid match reason: %', p_reason;
  end if;

  select *
    into v_room
    from public.rooms
   where id = p_room_id
   for update;

  if not found then
    raise exception 'room not found: %', p_room_id;
  end if;

  if v_room.guest_id is null then
    raise exception 'room has no guest: %', p_room_id;
  end if;

  if auth.uid() not in (v_room.host_id, v_room.guest_id) then
    raise exception 'not a room participant';
  end if;

  if p_winner_id not in (v_room.host_id, v_room.guest_id) then
    raise exception 'winner is not a room participant';
  end if;

  select id
    into v_existing_match_id
    from public.matches
   where room_id = p_room_id;

  if v_existing_match_id is not null then
    match_id := v_existing_match_id;
    return next;
    return;
  end if;

  v_loser_id := case
    when p_winner_id = v_room.host_id then v_room.guest_id
    else v_room.host_id
  end;

  insert into public.matches (
    room_id,
    player1_id,
    player2_id,
    winner_id,
    reason,
    started_at,
    player1_strokes,
    player2_strokes,
    player1_cleared_table,
    player2_cleared_table
  )
  values (
    p_room_id,
    v_room.host_id,
    v_room.guest_id,
    p_winner_id,
    p_reason,
    p_started_at,
    p_player1_strokes,
    p_player2_strokes,
    p_player1_cleared_table,
    p_player2_cleared_table
  )
  returning id into v_match_id;

  update public.profiles
     set wins = wins + 1
   where id = p_winner_id;

  update public.profiles
     set losses = losses + 1
   where id = v_loser_id;

  update public.rooms
     set status = 'finished'
   where id = p_room_id;

  match_id := v_match_id;
  return next;
end;
$$;

grant execute on function public.settle_online_match(
  text,
  uuid,
  text,
  timestamptz,
  integer,
  integer,
  boolean,
  boolean
) to authenticated;
