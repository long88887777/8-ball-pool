create table if not exists public.match_audit_logs (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  player_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'network_status',
      'presence_lost',
      'disconnect_protection_started',
      'disconnect_forfeit',
      'surrender_sent',
      'surrender_received',
      'game_over_received',
      'shot_sent',
      'shot_received',
      'snapshot_ignored',
      'sync_anomaly',
      'turn_end_sent',
      'turn_end_received',
      'result_sent',
      'result_received'
    )
  ),
  reason text,
  phase text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists match_audit_logs_room_created_idx
  on public.match_audit_logs (room_id, created_at desc);

create index if not exists match_audit_logs_match_created_idx
  on public.match_audit_logs (match_id, created_at desc)
  where match_id is not null;

create index if not exists match_audit_logs_player_created_idx
  on public.match_audit_logs (player_id, created_at desc);

alter table public.match_audit_logs enable row level security;

drop policy if exists "Players can read own room audit logs" on public.match_audit_logs;
create policy "Players can read own room audit logs"
  on public.match_audit_logs for select
  to authenticated
  using (
    auth.uid() = player_id
    or exists (
      select 1
      from public.rooms r
      where r.id = match_audit_logs.room_id
        and auth.uid() in (r.host_id, r.guest_id)
    )
  );

drop policy if exists "Players can insert own room audit logs" on public.match_audit_logs;
create policy "Players can insert own room audit logs"
  on public.match_audit_logs for insert
  to authenticated
  with check (
    auth.uid() = player_id
    and exists (
      select 1
      from public.rooms r
      where r.id = room_id
        and auth.uid() in (r.host_id, r.guest_id)
    )
  );
