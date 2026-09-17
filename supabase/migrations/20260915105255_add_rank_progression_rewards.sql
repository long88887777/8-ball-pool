alter table public.player_stats
  alter column rank_points set default 0,
  add column if not exists ai_rank_points_earned_date date,
  add column if not exists ai_rank_points_earned integer not null default 0
    check (ai_rank_points_earned between 0 and 100);

alter table public.player_wallets
  add column if not exists rank_reward_claims text[] not null default '{}';

alter table public.player_wallets
  drop constraint if exists player_wallets_rank_reward_claims_valid;

alter table public.player_wallets
  add constraint player_wallets_rank_reward_claims_valid
  check (rank_reward_claims <@ array['C-', 'B-', 'A-', 'S', 'SS', 'SSS']::text[]);
