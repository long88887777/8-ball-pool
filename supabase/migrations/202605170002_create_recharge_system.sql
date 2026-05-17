create table if not exists public.recharge_packages (
  id text primary key,
  title text not null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'CNY',
  coin_amount integer not null check (coin_amount > 0),
  bonus_coins integer not null default 0 check (bonus_coins >= 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recharge_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  package_id text not null references public.recharge_packages(id),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'CNY',
  coin_amount integer not null check (coin_amount > 0),
  channel text not null check (channel in ('mock', 'wechat', 'alipay', 'aggregator')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired')),
  provider_trade_no text unique,
  provider_payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists recharge_orders_user_created_idx
  on public.recharge_orders (user_id, created_at desc);
create index if not exists recharge_orders_status_expires_idx
  on public.recharge_orders (status, expires_at);

create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta_coins integer not null check (delta_coins <> 0),
  balance_after integer not null check (balance_after >= 0),
  reason text not null check (reason in ('recharge', 'daily_check_in', 'match_win', 'match_loss', 'daily_task', 'cue_purchase', 'admin_adjustment')),
  source_type text not null,
  source_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint wallet_ledger_source_unique unique (source_type, source_id)
);

create index if not exists wallet_ledger_user_created_idx
  on public.wallet_ledger (user_id, created_at desc);

insert into public.recharge_packages (id, title, amount_cents, currency, coin_amount, bonus_coins, sort_order, active)
values
  ('coins_600', '600 金币', 600, 'CNY', 600, 0, 10, true),
  ('coins_2000', '2000 金币', 1800, 'CNY', 2000, 200, 20, true),
  ('coins_3800', '3800 金币', 3000, 'CNY', 3800, 800, 30, true)
on conflict (id) do update set
  title = excluded.title,
  amount_cents = excluded.amount_cents,
  currency = excluded.currency,
  coin_amount = excluded.coin_amount,
  bonus_coins = excluded.bonus_coins,
  sort_order = excluded.sort_order,
  active = excluded.active,
  updated_at = now();

alter table public.recharge_packages enable row level security;
alter table public.recharge_orders enable row level security;
alter table public.wallet_ledger enable row level security;

drop policy if exists "Anyone can read active recharge packages" on public.recharge_packages;
create policy "Anyone can read active recharge packages"
  on public.recharge_packages for select
  to anon, authenticated
  using (active = true);

drop policy if exists "Users can read own recharge orders" on public.recharge_orders;
create policy "Users can read own recharge orders"
  on public.recharge_orders for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read own wallet ledger" on public.wallet_ledger;
create policy "Users can read own wallet ledger"
  on public.wallet_ledger for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.confirm_recharge_order(
  order_id uuid,
  provider_trade_no text,
  provider_payload jsonb default '{}'::jsonb
)
returns table (
  order_id uuid,
  status text,
  granted_coins integer,
  balance_after integer,
  paid_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_order public.recharge_orders%rowtype;
  wallet_after integer;
begin
  select *
    into locked_order
    from public.recharge_orders
   where id = confirm_recharge_order.order_id
   for update;

  if not found then
    raise exception 'recharge_order_not_found';
  end if;

  if locked_order.status = 'paid' then
    select coins into wallet_after
      from public.player_wallets
     where user_id = locked_order.user_id;

    return query
      select locked_order.id, locked_order.status, locked_order.coin_amount, coalesce(wallet_after, 0), locked_order.paid_at;
    return;
  end if;

  if locked_order.status <> 'pending' then
    raise exception 'recharge_order_not_pending';
  end if;

  if locked_order.expires_at <= now() then
    update public.recharge_orders
       set status = 'expired',
           error_message = 'Order expired before payment confirmation.',
           updated_at = now()
     where id = locked_order.id;
    raise exception 'recharge_order_expired';
  end if;

  insert into public.player_wallets (
    user_id,
    coins,
    last_check_in_date,
    unlocked_cue_ids,
    equipped_cue_id,
    updated_at
  )
  values (
    locked_order.user_id,
    260,
    null,
    array['classic-maple'],
    'classic-maple',
    now()
  )
  on conflict (user_id) do nothing;

  update public.player_wallets
     set coins = coins + locked_order.coin_amount,
         updated_at = now()
   where user_id = locked_order.user_id
   returning coins into wallet_after;

  update public.recharge_orders
     set status = 'paid',
         provider_trade_no = confirm_recharge_order.provider_trade_no,
         provider_payload = coalesce(confirm_recharge_order.provider_payload, '{}'::jsonb),
         paid_at = now(),
         updated_at = now()
   where id = locked_order.id
   returning public.recharge_orders.paid_at into locked_order.paid_at;

  insert into public.wallet_ledger (
    user_id,
    delta_coins,
    balance_after,
    reason,
    source_type,
    source_id,
    metadata
  )
  values (
    locked_order.user_id,
    locked_order.coin_amount,
    wallet_after,
    'recharge',
    'recharge_order',
    locked_order.id,
    jsonb_build_object(
      'package_id', locked_order.package_id,
      'channel', locked_order.channel,
      'amount_cents', locked_order.amount_cents,
      'currency', locked_order.currency
    )
  )
  on conflict (source_type, source_id) do nothing;

  return query
    select locked_order.id, 'paid'::text, locked_order.coin_amount, wallet_after, locked_order.paid_at;
end;
$$;

revoke all on function public.confirm_recharge_order(uuid, text, jsonb) from public;
revoke all on function public.confirm_recharge_order(uuid, text, jsonb) from anon;
revoke all on function public.confirm_recharge_order(uuid, text, jsonb) from authenticated;
