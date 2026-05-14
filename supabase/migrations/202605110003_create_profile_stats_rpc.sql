create or replace function public.increment_profile_stat(stat_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if stat_name = 'wins' then
    update public.profiles set wins = wins + 1 where id = auth.uid();
  elsif stat_name = 'losses' then
    update public.profiles set losses = losses + 1 where id = auth.uid();
  else
    raise exception 'invalid stat name: %', stat_name;
  end if;
end;
$$;

grant execute on function public.increment_profile_stat(text) to authenticated;

