alter table public.player_wallets
  add column if not exists cue_durability jsonb not null
  default '{"classic-maple": 40}'::jsonb;

alter table public.player_wallets
  drop constraint if exists player_wallets_cue_durability_object;

alter table public.player_wallets
  add constraint player_wallets_cue_durability_object
  check (jsonb_typeof(cue_durability) = 'object');
