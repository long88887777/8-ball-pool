alter table public.player_wallets
  add column if not exists ai_coin_earned_date date,
  add column if not exists ai_coins_earned integer not null default 0;

alter table public.player_wallets
  drop constraint if exists player_wallets_ai_coins_earned_range;

alter table public.player_wallets
  add constraint player_wallets_ai_coins_earned_range
  check (ai_coins_earned between 0 and 300);
