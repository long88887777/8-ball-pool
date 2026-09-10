alter table public.player_wallets
  add column if not exists challenge_reward_claimed boolean not null default false;
