alter table public.player_wallets
  add column if not exists check_in_dates text[] not null default '{}'::text[],
  add column if not exists makeup_cards integer not null default 0,
  add column if not exists makeup_match_progress smallint not null default 0,
  add column if not exists last_makeup_date date,
  add column if not exists monthly_makeup_counts jsonb not null default '{}'::jsonb,
  add column if not exists check_in_reward_claims text[] not null default '{}'::text[];

alter table public.player_wallets
  drop constraint if exists player_wallets_makeup_cards_nonnegative,
  drop constraint if exists player_wallets_makeup_match_progress_range,
  drop constraint if exists player_wallets_monthly_makeup_counts_object;

alter table public.player_wallets
  add constraint player_wallets_makeup_cards_nonnegative
    check (makeup_cards >= 0),
  add constraint player_wallets_makeup_match_progress_range
    check (makeup_match_progress between 0 and 2),
  add constraint player_wallets_monthly_makeup_counts_object
    check (jsonb_typeof(monthly_makeup_counts) = 'object');

update public.player_wallets
   set check_in_dates = array[last_check_in_date::text]
 where last_check_in_date is not null
   and cardinality(check_in_dates) = 0;
