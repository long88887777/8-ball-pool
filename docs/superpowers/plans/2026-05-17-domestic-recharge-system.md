# Domestic Recharge System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase R1 recharge foundation: mock domestic recharge orders, backend-confirmed coin grants, append-only recharge ledger entries, and a restrained in-game recharge dialog.

**Architecture:** Supabase owns the money-sensitive path. A migration adds recharge packages, recharge orders, wallet ledger rows, and a service-only `confirm_recharge_order` RPC. Two JWT-protected Edge Functions create mock-channel orders and confirm mock payments through the RPC. The browser displays packages and order state, but never directly grants recharge coins.

**Tech Stack:** TypeScript, Vite, Phaser 3, Vitest, Supabase JS v2, Supabase Edge Functions, Postgres SQL.

**Spec:** [docs/superpowers/specs/2026-05-17-domestic-recharge-system-design.md](../specs/2026-05-17-domestic-recharge-system-design.md)

---

## Scope Notes

- This plan implements Phase R1 only: mock payment flow over a real order and ledger model.
- Real WeChat Pay, Alipay, overseas aggregators, refunds, and admin tools are out of scope.
- Existing gameplay coin rewards remain on the current wallet path. Full wallet hardening is a later phase.
- This implementation happens in the current workspace because there are existing uncommitted project changes that affect shared UI files; creating a worktree would hide those changes and increase merge risk.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/202605170002_create_recharge_system.sql` | Create | Tables, RLS, package seeds, and service-only `confirm_recharge_order` RPC |
| `supabase/config.toml` | Modify | Register `create-recharge-order` and `mock-pay-recharge-order` Edge Functions |
| `supabase/functions/create-recharge-order/index.ts` | Create | Authenticated order creation for active mock-channel packages |
| `supabase/functions/mock-pay-recharge-order/index.ts` | Create | Test-only mock payment confirmation through the RPC |
| `src/game/recharge.ts` | Create | Typed client helpers and response sanitizers for packages and orders |
| `src/game/recharge.test.ts` | Create | TDD coverage for recharge helper behavior |
| `index.html` | Modify | Add recharge button and dialog markup |
| `src/game/PoolScene.ts` | Modify | Bind recharge UI, call helpers, refresh wallet after paid mock order |
| `src/styles.css` | Modify | Restrained product-grade recharge dialog styles |
| `supabase/README.md` | Modify | Document function deployment and mock-payment secret |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/202605170002_create_recharge_system.sql`

- [ ] **Step 1: Create the migration**

Add `supabase/migrations/202605170002_create_recharge_system.sql`:

```sql
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
```

- [ ] **Step 2: Review migration syntax**

Run:

```bash
rg -n "recharge_packages|recharge_orders|wallet_ledger|confirm_recharge_order" supabase/migrations/202605170002_create_recharge_system.sql
```

Expected: all four key objects appear.

- [ ] **Step 3: Commit migration**

```bash
git add supabase/migrations/202605170002_create_recharge_system.sql
git commit -m "feat(recharge): add order and wallet ledger schema"
```

---

## Task 2: Edge Function Config

**Files:**
- Modify: `supabase/config.toml`

- [ ] **Step 1: Add function entries**

Append to `supabase/config.toml`:

```toml

[functions.create-recharge-order]
verify_jwt = true

[functions.mock-pay-recharge-order]
verify_jwt = true
```

- [ ] **Step 2: Verify config entries**

Run:

```bash
rg -n "create-recharge-order|mock-pay-recharge-order" supabase/config.toml
```

Expected: both function names appear under `[functions.*]` blocks.

- [ ] **Step 3: Commit config**

```bash
git add supabase/config.toml
git commit -m "chore(recharge): register recharge edge functions"
```

---

## Task 3: Create `create-recharge-order` Edge Function

**Files:**
- Create: `supabase/functions/create-recharge-order/index.ts`

- [ ] **Step 1: Create function file**

Add `supabase/functions/create-recharge-order/index.ts`:

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RechargePackageRow = {
  id: string;
  title: string;
  amount_cents: number;
  currency: string;
  coin_amount: number;
  bonus_coins: number;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return json({}, 200);
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "No authorization header" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Missing Supabase function environment" }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return json({ error: "Invalid token" }, 401);
  }

  const body = await readJson(req);
  const packageId = typeof body.packageId === "string" ? body.packageId : "";
  const channel = typeof body.channel === "string" ? body.channel : "mock";
  if (!packageId) {
    return json({ error: "Missing packageId" }, 400);
  }
  if (channel !== "mock") {
    return json({ error: "Only mock recharge channel is enabled" }, 400);
  }

  const { data: pkg, error: packageError } = await adminClient
    .from("recharge_packages")
    .select("id, title, amount_cents, currency, coin_amount, bonus_coins")
    .eq("id", packageId)
    .eq("active", true)
    .maybeSingle<RechargePackageRow>();

  if (packageError) {
    return json({ error: packageError.message }, 500);
  }
  if (!pkg) {
    return json({ error: "Recharge package not found" }, 404);
  }

  const { data: order, error: orderError } = await adminClient
    .from("recharge_orders")
    .insert({
      user_id: user.id,
      package_id: pkg.id,
      amount_cents: pkg.amount_cents,
      currency: pkg.currency,
      coin_amount: pkg.coin_amount,
      channel,
      status: "pending",
    })
    .select("id, status, expires_at, created_at")
    .single();

  if (orderError) {
    return json({ error: orderError.message }, 500);
  }

  return json({
    order: {
      id: order.id,
      status: order.status,
      channel,
      expiresAt: order.expires_at,
      createdAt: order.created_at,
      package: {
        id: pkg.id,
        title: pkg.title,
        amountCents: pkg.amount_cents,
        currency: pkg.currency,
        coinAmount: pkg.coin_amount,
        bonusCoins: pkg.bonus_coins,
      },
    },
  });
});

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const value = await req.json();
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 2: Check expected function names**

Run:

```bash
rg -n "createClient|recharge_packages|recharge_orders|Only mock" supabase/functions/create-recharge-order/index.ts
```

Expected: all searched terms appear.

- [ ] **Step 3: Commit function**

```bash
git add supabase/functions/create-recharge-order/index.ts
git commit -m "feat(recharge): create mock recharge orders"
```

---

## Task 4: Create `mock-pay-recharge-order` Edge Function

**Files:**
- Create: `supabase/functions/mock-pay-recharge-order/index.ts`

- [ ] **Step 1: Create function file**

Add `supabase/functions/mock-pay-recharge-order/index.ts`:

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RechargeOrderRow = {
  id: string;
  user_id: string;
  channel: string;
  status: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return json({}, 200);
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (Deno.env.get("ALLOW_MOCK_PAYMENTS") !== "true") {
    return json({ error: "Mock payments are disabled" }, 403);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "No authorization header" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Missing Supabase function environment" }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return json({ error: "Invalid token" }, 401);
  }

  const body = await readJson(req);
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  if (!orderId) {
    return json({ error: "Missing orderId" }, 400);
  }

  const { data: order, error: orderError } = await adminClient
    .from("recharge_orders")
    .select("id, user_id, channel, status")
    .eq("id", orderId)
    .maybeSingle<RechargeOrderRow>();

  if (orderError) {
    return json({ error: orderError.message }, 500);
  }
  if (!order || order.user_id !== user.id) {
    return json({ error: "Recharge order not found" }, 404);
  }
  if (order.channel !== "mock") {
    return json({ error: "Order is not a mock payment order" }, 400);
  }

  const providerTradeNo = `mock_${order.id}`;
  const { data, error } = await adminClient.rpc("confirm_recharge_order", {
    order_id: order.id,
    provider_trade_no: providerTradeNo,
    provider_payload: {
      channel: "mock",
      confirmedBy: "mock-pay-recharge-order",
      confirmedAt: new Date().toISOString(),
    },
  });

  if (error) {
    return json({ error: error.message }, 400);
  }

  const result = Array.isArray(data) ? data[0] : data;
  return json({
    order: {
      id: result.order_id,
      status: result.status,
      paidAt: result.paid_at,
    },
    wallet: {
      coins: result.balance_after,
    },
    grantedCoins: result.granted_coins,
  });
});

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const value = await req.json();
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 2: Check expected function names**

Run:

```bash
rg -n "ALLOW_MOCK_PAYMENTS|confirm_recharge_order|providerTradeNo|recharge_orders" supabase/functions/mock-pay-recharge-order/index.ts
```

Expected: all searched terms appear.

- [ ] **Step 3: Commit function**

```bash
git add supabase/functions/mock-pay-recharge-order/index.ts
git commit -m "feat(recharge): confirm mock recharge payments"
```

---

## Task 5: TDD Recharge Client Helpers

**Files:**
- Create: `src/game/recharge.test.ts`
- Create: `src/game/recharge.ts`

- [ ] **Step 1: Write failing tests**

Create `src/game/recharge.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import {
  formatCny,
  selectDefaultRechargePackage,
  sanitizeRechargePackageRows,
  sanitizeRechargeOrders,
  createRechargeOrder,
  mockPayRechargeOrder,
  type RechargePackage,
} from './recharge';

describe('recharge helpers', () => {
  it('sanitizes active packages and sorts them by sort order', () => {
    const packages = sanitizeRechargePackageRows([
      {
        id: 'coins_2000',
        title: '2000 金币',
        amount_cents: 1800,
        currency: 'CNY',
        coin_amount: 2000,
        bonus_coins: 200,
        sort_order: 20,
      },
      {
        id: 'bad',
        title: 'Bad',
        amount_cents: -1,
        currency: 'CNY',
        coin_amount: 0,
        bonus_coins: 0,
        sort_order: 1,
      },
      {
        id: 'coins_600',
        title: '600 金币',
        amount_cents: 600,
        currency: 'CNY',
        coin_amount: 600,
        bonus_coins: 0,
        sort_order: 10,
      },
    ]);

    expect(packages.map((item) => item.id)).toEqual(['coins_600', 'coins_2000']);
    expect(packages[1].bonusCoins).toBe(200);
  });

  it('formats CNY package amounts for display', () => {
    expect(formatCny(600, 'CNY')).toBe('¥6');
    expect(formatCny(1888, 'CNY')).toBe('¥18.88');
  });

  it('selects the first package when current selection is unavailable', () => {
    const packages: RechargePackage[] = [
      { id: 'coins_600', title: '600 金币', amountCents: 600, currency: 'CNY', coinAmount: 600, bonusCoins: 0, sortOrder: 10 },
      { id: 'coins_2000', title: '2000 金币', amountCents: 1800, currency: 'CNY', coinAmount: 2000, bonusCoins: 200, sortOrder: 20 },
    ];

    expect(selectDefaultRechargePackage(packages, null)).toBe('coins_600');
    expect(selectDefaultRechargePackage(packages, 'coins_2000')).toBe('coins_2000');
    expect(selectDefaultRechargePackage(packages, 'missing')).toBe('coins_600');
  });

  it('sanitizes recent recharge orders', () => {
    const orders = sanitizeRechargeOrders([
      {
        id: 'order-1',
        package_id: 'coins_600',
        amount_cents: 600,
        currency: 'CNY',
        coin_amount: 600,
        channel: 'mock',
        status: 'paid',
        created_at: '2026-05-17T10:00:00.000Z',
        expires_at: '2026-05-17T10:30:00.000Z',
        paid_at: '2026-05-17T10:01:00.000Z',
      },
      { id: '', status: 'paid' },
    ]);

    expect(orders).toEqual([
      {
        id: 'order-1',
        packageId: 'coins_600',
        amountCents: 600,
        currency: 'CNY',
        coinAmount: 600,
        channel: 'mock',
        status: 'paid',
        createdAt: '2026-05-17T10:00:00.000Z',
        expiresAt: '2026-05-17T10:30:00.000Z',
        paidAt: '2026-05-17T10:01:00.000Z',
      },
    ]);
  });

  it('invokes create and mock payment functions with stable payloads', async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce({
        data: {
          order: {
            id: 'order-1',
            status: 'pending',
            channel: 'mock',
            expiresAt: '2026-05-17T10:30:00.000Z',
            createdAt: '2026-05-17T10:00:00.000Z',
            package: {
              id: 'coins_600',
              title: '600 金币',
              amountCents: 600,
              currency: 'CNY',
              coinAmount: 600,
              bonusCoins: 0,
            },
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          order: { id: 'order-1', status: 'paid', paidAt: '2026-05-17T10:01:00.000Z' },
          wallet: { coins: 860 },
          grantedCoins: 600,
        },
        error: null,
      });
    const supabase = { functions: { invoke } };

    const created = await createRechargeOrder(supabase, 'coins_600');
    const paid = await mockPayRechargeOrder(supabase, 'order-1');

    expect(created.order.id).toBe('order-1');
    expect(paid.wallet.coins).toBe(860);
    expect(invoke).toHaveBeenNthCalledWith(1, 'create-recharge-order', {
      body: { packageId: 'coins_600', channel: 'mock' },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'mock-pay-recharge-order', {
      body: { orderId: 'order-1' },
    });
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npx vitest run src/game/recharge.test.ts
```

Expected: fails because `src/game/recharge.ts` does not exist.

- [ ] **Step 3: Implement helper module**

Create `src/game/recharge.ts`:

```typescript
export type RechargePackage = {
  id: string;
  title: string;
  amountCents: number;
  currency: string;
  coinAmount: number;
  bonusCoins: number;
  sortOrder: number;
};

export type RechargeOrderStatus = 'pending' | 'paid' | 'failed' | 'expired';

export type RechargeOrder = {
  id: string;
  packageId: string;
  amountCents: number;
  currency: string;
  coinAmount: number;
  channel: string;
  status: RechargeOrderStatus;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
};

export type CreatedRechargeOrder = {
  id: string;
  status: RechargeOrderStatus;
  channel: string;
  expiresAt: string;
  createdAt: string;
  package: Omit<RechargePackage, 'sortOrder'>;
};

export type CreateRechargeOrderResult = {
  order: CreatedRechargeOrder;
};

export type MockPayRechargeResult = {
  order: {
    id: string;
    status: 'paid';
    paidAt: string;
  };
  wallet: {
    coins: number;
  };
  grantedCoins: number;
};

type SupabaseRechargeClient = {
  from(table: string): {
    select(columns: string): {
      order(column: string, options?: { ascending?: boolean }): PromiseLike<{ data: unknown; error: unknown }>;
      eq(column: string, value: unknown): {
        order(column: string, options?: { ascending?: boolean }): PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
  functions: {
    invoke(name: string, options?: { body?: Record<string, unknown> }): PromiseLike<{ data: unknown; error: unknown }>;
  };
};

type PackageRow = {
  id?: unknown;
  title?: unknown;
  amount_cents?: unknown;
  currency?: unknown;
  coin_amount?: unknown;
  bonus_coins?: unknown;
  sort_order?: unknown;
};

type OrderRow = {
  id?: unknown;
  package_id?: unknown;
  amount_cents?: unknown;
  currency?: unknown;
  coin_amount?: unknown;
  channel?: unknown;
  status?: unknown;
  created_at?: unknown;
  expires_at?: unknown;
  paid_at?: unknown;
};

export async function fetchRechargePackages(supabase: SupabaseRechargeClient): Promise<RechargePackage[]> {
  const { data, error } = await supabase
    .from('recharge_packages')
    .select('id, title, amount_cents, currency, coin_amount, bonus_coins, sort_order')
    .order('sort_order', { ascending: true });
  if (error) throw toError(error);
  return sanitizeRechargePackageRows(Array.isArray(data) ? data : []);
}

export async function fetchRecentRechargeOrders(supabase: SupabaseRechargeClient): Promise<RechargeOrder[]> {
  const { data, error } = await supabase
    .from('recharge_orders')
    .select('id, package_id, amount_cents, currency, coin_amount, channel, status, created_at, expires_at, paid_at')
    .order('created_at', { ascending: false });
  if (error) throw toError(error);
  return sanitizeRechargeOrders(Array.isArray(data) ? data : []);
}

export async function createRechargeOrder(
  supabase: Pick<SupabaseRechargeClient, 'functions'>,
  packageId: string,
): Promise<CreateRechargeOrderResult> {
  const { data, error } = await supabase.functions.invoke('create-recharge-order', {
    body: { packageId, channel: 'mock' },
  });
  if (error) throw toError(error);
  return sanitizeCreateRechargeOrderResult(data);
}

export async function mockPayRechargeOrder(
  supabase: Pick<SupabaseRechargeClient, 'functions'>,
  orderId: string,
): Promise<MockPayRechargeResult> {
  const { data, error } = await supabase.functions.invoke('mock-pay-recharge-order', {
    body: { orderId },
  });
  if (error) throw toError(error);
  return sanitizeMockPayRechargeResult(data);
}

export function sanitizeRechargePackageRows(rows: unknown[]): RechargePackage[] {
  return rows
    .map((row) => sanitizeRechargePackageRow(row as PackageRow))
    .filter((row): row is RechargePackage => row !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function sanitizeRechargeOrders(rows: unknown[]): RechargeOrder[] {
  return rows
    .map((row) => sanitizeRechargeOrder(row as OrderRow))
    .filter((row): row is RechargeOrder => row !== null);
}

export function selectDefaultRechargePackage(packages: RechargePackage[], currentId: string | null): string | null {
  if (currentId && packages.some((item) => item.id === currentId)) {
    return currentId;
  }
  return packages[0]?.id ?? null;
}

export function formatCny(amountCents: number, currency: string): string {
  const amount = amountCents / 100;
  const formatted = Number.isInteger(amount)
    ? String(amount)
    : amount.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return currency === 'CNY' ? `¥${formatted}` : `${formatted} ${currency}`;
}

function sanitizeRechargePackageRow(row: PackageRow): RechargePackage | null {
  const id = asString(row.id);
  const title = asString(row.title);
  const amountCents = asPositiveInteger(row.amount_cents);
  const currency = asString(row.currency) || 'CNY';
  const coinAmount = asPositiveInteger(row.coin_amount);
  const bonusCoins = asNonNegativeInteger(row.bonus_coins);
  const sortOrder = asInteger(row.sort_order);
  if (!id || !title || amountCents === null || coinAmount === null) {
    return null;
  }
  return {
    id,
    title,
    amountCents,
    currency,
    coinAmount,
    bonusCoins: bonusCoins ?? 0,
    sortOrder: sortOrder ?? 0,
  };
}

function sanitizeRechargeOrder(row: OrderRow): RechargeOrder | null {
  const id = asString(row.id);
  const packageId = asString(row.package_id);
  const amountCents = asPositiveInteger(row.amount_cents);
  const currency = asString(row.currency) || 'CNY';
  const coinAmount = asPositiveInteger(row.coin_amount);
  const channel = asString(row.channel);
  const status = asOrderStatus(row.status);
  const createdAt = asString(row.created_at);
  const expiresAt = asString(row.expires_at);
  const paidAt = asString(row.paid_at) || null;
  if (!id || !packageId || amountCents === null || coinAmount === null || !channel || !status || !createdAt || !expiresAt) {
    return null;
  }
  return { id, packageId, amountCents, currency, coinAmount, channel, status, createdAt, expiresAt, paidAt };
}

function sanitizeCreateRechargeOrderResult(value: unknown): CreateRechargeOrderResult {
  const root = value as { order?: unknown };
  const order = root.order as { package?: unknown } & Record<string, unknown>;
  if (!order || typeof order !== 'object') throw new Error('Invalid recharge order response');
  const pkg = order.package as Record<string, unknown> | undefined;
  const id = asString(order.id);
  const status = asOrderStatus(order.status);
  const channel = asString(order.channel);
  const expiresAt = asString(order.expiresAt);
  const createdAt = asString(order.createdAt);
  const packageId = asString(pkg?.id);
  const title = asString(pkg?.title);
  const amountCents = asPositiveInteger(pkg?.amountCents);
  const currency = asString(pkg?.currency) || 'CNY';
  const coinAmount = asPositiveInteger(pkg?.coinAmount);
  const bonusCoins = asNonNegativeInteger(pkg?.bonusCoins);
  if (!id || !status || !channel || !expiresAt || !createdAt || !packageId || !title || amountCents === null || coinAmount === null) {
    throw new Error('Invalid recharge order response');
  }
  return {
    order: {
      id,
      status,
      channel,
      expiresAt,
      createdAt,
      package: {
        id: packageId,
        title,
        amountCents,
        currency,
        coinAmount,
        bonusCoins: bonusCoins ?? 0,
      },
    },
  };
}

function sanitizeMockPayRechargeResult(value: unknown): MockPayRechargeResult {
  const root = value as { order?: unknown; wallet?: unknown; grantedCoins?: unknown };
  const order = root.order as Record<string, unknown> | undefined;
  const wallet = root.wallet as Record<string, unknown> | undefined;
  const id = asString(order?.id);
  const status = asOrderStatus(order?.status);
  const paidAt = asString(order?.paidAt);
  const coins = asNonNegativeInteger(wallet?.coins);
  const grantedCoins = asPositiveInteger(root.grantedCoins);
  if (!id || status !== 'paid' || !paidAt || coins === null || grantedCoins === null) {
    throw new Error('Invalid mock payment response');
  }
  return {
    order: { id, status, paidAt },
    wallet: { coins },
    grantedCoins,
  };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : null;
}

function asPositiveInteger(value: unknown): number | null {
  const integer = asInteger(value);
  return integer !== null && integer > 0 ? integer : null;
}

function asNonNegativeInteger(value: unknown): number | null {
  const integer = asInteger(value);
  return integer !== null && integer >= 0 ? integer : null;
}

function asOrderStatus(value: unknown): RechargeOrderStatus | null {
  return value === 'pending' || value === 'paid' || value === 'failed' || value === 'expired'
    ? value
    : null;
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (value && typeof value === 'object' && 'message' in value && typeof value.message === 'string') {
    return new Error(value.message);
  }
  return new Error('Recharge request failed');
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run src/game/recharge.test.ts
```

Expected: all tests in `src/game/recharge.test.ts` pass.

- [ ] **Step 5: Commit helper module**

```bash
git add src/game/recharge.ts src/game/recharge.test.ts
git commit -m "feat(recharge): add typed recharge client helpers"
```

---

## Task 6: Recharge Markup

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add recharge button to HUD**

Find:

```html
<span id="coin-balance" class="coin-balance">金币 260</span>
<button id="daily-checkin" type="button">每日签到 +180</button>
```

Replace with:

```html
<span id="coin-balance" class="coin-balance">金币 260</span>
<button id="recharge-open" type="button">充值</button>
<button id="daily-checkin" type="button">每日签到 +180</button>
```

- [ ] **Step 2: Add recharge dialog after cue shop section**

Find the closing `</section>` for `id="cue-shop"` and insert this immediately after it:

```html
      <section id="recharge-panel" class="recharge-overlay" hidden>
        <div class="recharge-dialog">
          <div class="recharge-header">
            <div>
              <p class="eyebrow">Coin Recharge</p>
              <h2>金币充值</h2>
            </div>
            <button id="recharge-close" class="recharge-close" type="button" aria-label="Close recharge">&times;</button>
          </div>
          <div class="recharge-summary">
            <span>当前余额</span>
            <strong id="recharge-balance">金币 260</strong>
          </div>
          <div id="recharge-packages" class="recharge-packages" role="listbox" aria-label="Recharge packages"></div>
          <div class="recharge-channel">
            <span>支付方式</span>
            <strong>测试支付</strong>
          </div>
          <div id="recharge-order" class="recharge-order" hidden></div>
          <p id="recharge-feedback" class="recharge-feedback" aria-live="polite"></p>
          <div class="recharge-actions">
            <button id="recharge-create" type="button">创建订单</button>
            <button id="recharge-mock-pay" type="button" class="secondary" hidden>完成测试支付</button>
          </div>
        </div>
      </section>
```

- [ ] **Step 3: Verify IDs**

Run:

```bash
rg -n "recharge-open|recharge-panel|recharge-packages|recharge-mock-pay" index.html
```

Expected: all four IDs appear.

- [ ] **Step 4: Commit markup**

```bash
git add index.html
git commit -m "feat(recharge): add recharge dialog markup"
```

---

## Task 7: Bind Recharge UI In `PoolScene`

**Files:**
- Modify: `src/game/PoolScene.ts`

- [ ] **Step 1: Add imports**

After the existing economy import block, add:

```typescript
import {
  createRechargeOrder,
  fetchRechargePackages,
  fetchRecentRechargeOrders,
  formatCny,
  mockPayRechargeOrder,
  selectDefaultRechargePackage,
  type CreatedRechargeOrder,
  type RechargeOrder,
  type RechargePackage,
} from './recharge';
```

- [ ] **Step 2: Add class fields**

Near the existing economy UI fields, add:

```typescript
  private rechargeButton?: HTMLButtonElement;
  private rechargeOverlay?: HTMLElement;
  private rechargeCloseButton?: HTMLButtonElement;
  private rechargePackagesEl?: HTMLElement;
  private rechargeBalanceEl?: HTMLElement;
  private rechargeOrderEl?: HTMLElement;
  private rechargeFeedbackEl?: HTMLElement;
  private rechargeCreateButton?: HTMLButtonElement;
  private rechargeMockPayButton?: HTMLButtonElement;
  private rechargePackages: RechargePackage[] = [];
  private rechargeOrders: RechargeOrder[] = [];
  private selectedRechargePackageId: string | null = null;
  private pendingRechargeOrder: CreatedRechargeOrder | null = null;
  private rechargeBusy = false;
```

- [ ] **Step 3: Add handlers**

Near the existing `cueShopOpenHandler` and `cueShopCloseHandler`, add:

```typescript
  private rechargeOpenHandler = (): void => {
    this.showRechargePanel();
  };
  private rechargeCloseHandler = (): void => {
    this.hideRechargePanel();
  };
  private rechargePackageClickHandler = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>('[data-recharge-package-id]');
    if (!button) return;
    this.selectedRechargePackageId = button.dataset.rechargePackageId ?? null;
    this.pendingRechargeOrder = null;
    this.renderRechargePanel();
  };
  private rechargeCreateHandler = (): void => {
    void this.createSelectedRechargeOrder();
  };
  private rechargeMockPayHandler = (): void => {
    void this.completeMockRechargePayment();
  };
```

- [ ] **Step 4: Extend `bindEconomyUI`**

Inside `bindEconomyUI`, after cue shop queries, add:

```typescript
    this.rechargeButton = document.querySelector<HTMLButtonElement>('#recharge-open') ?? undefined;
    this.rechargeOverlay = document.querySelector<HTMLElement>('#recharge-panel') ?? undefined;
    this.rechargeCloseButton = document.querySelector<HTMLButtonElement>('#recharge-close') ?? undefined;
    this.rechargePackagesEl = document.querySelector<HTMLElement>('#recharge-packages') ?? undefined;
    this.rechargeBalanceEl = document.querySelector<HTMLElement>('#recharge-balance') ?? undefined;
    this.rechargeOrderEl = document.querySelector<HTMLElement>('#recharge-order') ?? undefined;
    this.rechargeFeedbackEl = document.querySelector<HTMLElement>('#recharge-feedback') ?? undefined;
    this.rechargeCreateButton = document.querySelector<HTMLButtonElement>('#recharge-create') ?? undefined;
    this.rechargeMockPayButton = document.querySelector<HTMLButtonElement>('#recharge-mock-pay') ?? undefined;
```

Then add listeners after cue shop listeners:

```typescript
    this.rechargeButton?.addEventListener('click', this.rechargeOpenHandler);
    this.rechargeCloseButton?.addEventListener('click', this.rechargeCloseHandler);
    this.rechargePackagesEl?.addEventListener('click', this.rechargePackageClickHandler);
    this.rechargeCreateButton?.addEventListener('click', this.rechargeCreateHandler);
    this.rechargeMockPayButton?.addEventListener('click', this.rechargeMockPayHandler);
```

After `this.renderCueShop();`, add:

```typescript
    this.renderRechargePanel();
```

- [ ] **Step 5: Extend `unbindEconomyUI`**

Inside `unbindEconomyUI`, add:

```typescript
    this.rechargeButton?.removeEventListener('click', this.rechargeOpenHandler);
    this.rechargeCloseButton?.removeEventListener('click', this.rechargeCloseHandler);
    this.rechargePackagesEl?.removeEventListener('click', this.rechargePackageClickHandler);
    this.rechargeCreateButton?.removeEventListener('click', this.rechargeCreateHandler);
    this.rechargeMockPayButton?.removeEventListener('click', this.rechargeMockPayHandler);
```

- [ ] **Step 6: Refresh recharge panel after wallet load**

In `loadPlayerWallet`, after `this.renderCueShop();`, add:

```typescript
    this.renderRechargePanel();
```

- [ ] **Step 7: Add recharge methods**

Add these methods near `showCueShop` / `hideCueShop`:

```typescript
  private showRechargePanel(): void {
    if (this.rechargeOverlay) {
      this.rechargeOverlay.hidden = false;
    }
    void this.loadRechargeData();
  }

  private hideRechargePanel(): void {
    if (this.rechargeOverlay) {
      this.rechargeOverlay.hidden = true;
    }
  }

  private async loadRechargeData(): Promise<void> {
    this.setRechargeBusy(true);
    this.setRechargeFeedback('正在加载充值档位...');
    try {
      const [packages, orders] = await Promise.all([
        fetchRechargePackages(this.supabaseClient),
        fetchRecentRechargeOrders(this.supabaseClient),
      ]);
      this.rechargePackages = packages;
      this.rechargeOrders = orders;
      this.selectedRechargePackageId = selectDefaultRechargePackage(packages, this.selectedRechargePackageId);
      this.setRechargeFeedback(packages.length > 0 ? '' : '暂无可用充值档位。');
    } catch (error) {
      this.setRechargeFeedback(error instanceof Error ? error.message : '充值信息加载失败。');
    } finally {
      this.setRechargeBusy(false);
      this.renderRechargePanel();
    }
  }

  private async createSelectedRechargeOrder(): Promise<void> {
    if (!this.selectedRechargePackageId || this.rechargeBusy) return;
    this.setRechargeBusy(true);
    this.setRechargeFeedback('正在创建订单...');
    try {
      const result = await createRechargeOrder(this.supabaseClient, this.selectedRechargePackageId);
      this.pendingRechargeOrder = result.order;
      this.setRechargeFeedback('订单已创建，请完成测试支付。');
    } catch (error) {
      this.setRechargeFeedback(error instanceof Error ? error.message : '订单创建失败。');
    } finally {
      this.setRechargeBusy(false);
      this.renderRechargePanel();
    }
  }

  private async completeMockRechargePayment(): Promise<void> {
    if (!this.pendingRechargeOrder || this.rechargeBusy) return;
    this.setRechargeBusy(true);
    this.setRechargeFeedback('正在确认测试支付...');
    try {
      const result = await mockPayRechargeOrder(this.supabaseClient, this.pendingRechargeOrder.id);
      await this.loadPlayerWallet();
      this.pendingRechargeOrder = null;
      this.rechargeOrders = await fetchRecentRechargeOrders(this.supabaseClient);
      this.setRechargeFeedback(`充值成功，到账 ${result.grantedCoins} 金币。`);
    } catch (error) {
      this.setRechargeFeedback(error instanceof Error ? error.message : '测试支付确认失败。');
    } finally {
      this.setRechargeBusy(false);
      this.renderRechargePanel();
    }
  }

  private setRechargeBusy(busy: boolean): void {
    this.rechargeBusy = busy;
    if (this.rechargeCreateButton) this.rechargeCreateButton.disabled = busy || !this.selectedRechargePackageId;
    if (this.rechargeMockPayButton) this.rechargeMockPayButton.disabled = busy || !this.pendingRechargeOrder;
  }

  private setRechargeFeedback(message: string): void {
    if (this.rechargeFeedbackEl) {
      this.rechargeFeedbackEl.textContent = message;
    }
  }

  private renderRechargePanel(): void {
    if (this.rechargeBalanceEl) {
      this.rechargeBalanceEl.textContent = `金币 ${this.wallet.coins}`;
    }
    if (this.rechargePackagesEl) {
      this.rechargePackagesEl.replaceChildren(...this.rechargePackages.map((item) => this.createRechargePackageButton(item)));
    }
    if (this.rechargeOrderEl) {
      if (this.pendingRechargeOrder) {
        this.rechargeOrderEl.hidden = false;
        this.rechargeOrderEl.textContent = `待支付订单 ${this.pendingRechargeOrder.id.slice(0, 8)} · ${formatCny(this.pendingRechargeOrder.package.amountCents, this.pendingRechargeOrder.package.currency)}`;
      } else {
        const latest = this.rechargeOrders[0];
        this.rechargeOrderEl.hidden = !latest;
        this.rechargeOrderEl.textContent = latest
          ? `最近订单 ${latest.status === 'paid' ? '已支付' : latest.status} · ${latest.coinAmount} 金币`
          : '';
      }
    }
    if (this.rechargeCreateButton) {
      this.rechargeCreateButton.disabled = this.rechargeBusy || !this.selectedRechargePackageId;
    }
    if (this.rechargeMockPayButton) {
      this.rechargeMockPayButton.hidden = !this.pendingRechargeOrder;
      this.rechargeMockPayButton.disabled = this.rechargeBusy || !this.pendingRechargeOrder;
    }
  }

  private createRechargePackageButton(item: RechargePackage): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `recharge-package${item.id === this.selectedRechargePackageId ? ' is-selected' : ''}`;
    button.dataset.rechargePackageId = item.id;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(item.id === this.selectedRechargePackageId));

    const title = document.createElement('strong');
    title.textContent = item.title;
    const price = document.createElement('span');
    price.textContent = formatCny(item.amountCents, item.currency);
    const bonus = document.createElement('small');
    bonus.textContent = item.bonusCoins > 0 ? `含赠送 ${item.bonusCoins} 金币` : '基础档位';

    button.append(title, price, bonus);
    return button;
  }
```

- [ ] **Step 8: Typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: zero TypeScript errors.

- [ ] **Step 9: Commit UI binding**

```bash
git add src/game/PoolScene.ts
git commit -m "feat(recharge): bind recharge flow in PoolScene"
```

---

## Task 8: Recharge Styles

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add styles after cue shop styles**

Append after `.cue-shop-feedback`:

```css
.recharge-overlay {
  position: fixed;
  inset: 0;
  z-index: 25;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(248, 248, 247, 0.82);
  backdrop-filter: blur(10px);
}

.recharge-overlay[hidden] {
  display: none;
}

.recharge-dialog {
  width: min(520px, 100%);
  max-height: min(720px, calc(100vh - 40px));
  overflow: auto;
  border: 1px solid rgba(29, 29, 31, 0.1);
  border-radius: 14px;
  padding: 22px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.12);
}

.recharge-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.recharge-header h2 {
  margin: 0;
  color: #1d1d1f;
  font-size: 24px;
}

.recharge-close {
  width: 36px;
  height: 36px;
  border: 1px solid rgba(29, 29, 31, 0.1);
  border-radius: 8px;
  background: #f5f5f7;
  color: #3a3a3c;
  cursor: pointer;
  font-size: 24px;
  line-height: 1;
}

.recharge-summary,
.recharge-channel,
.recharge-order {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px solid rgba(29, 29, 31, 0.08);
  border-radius: 10px;
  background: #f7f7f8;
  color: #3a3a3c;
}

.recharge-summary span,
.recharge-channel span {
  color: #6e6e73;
  font-size: 13px;
}

.recharge-packages {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.recharge-package {
  min-height: 104px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid rgba(29, 29, 31, 0.1);
  border-radius: 10px;
  padding: 12px;
  background: #fff;
  color: #1d1d1f;
  cursor: pointer;
  text-align: left;
}

.recharge-package.is-selected {
  border-color: #2469b3;
  box-shadow: 0 0 0 2px rgba(36, 105, 179, 0.14);
}

.recharge-package span {
  color: #2469b3;
  font-weight: 700;
}

.recharge-package small {
  color: #6e6e73;
  font-size: 12px;
}

.recharge-feedback {
  min-height: 20px;
  margin: 12px 0 0;
  color: #2469b3;
  font-size: 13px;
  font-weight: 600;
}

.recharge-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.recharge-actions button {
  flex: 1;
  min-height: 40px;
  border: 1px solid #1d1d1f;
  border-radius: 8px;
  background: #1d1d1f;
  color: #fff;
  cursor: pointer;
  font-weight: 650;
}

.recharge-actions button.secondary {
  border-color: rgba(36, 105, 179, 0.25);
  background: #eef5ff;
  color: #1f5f9e;
}

.recharge-actions button:disabled {
  cursor: default;
  border-color: rgba(29, 29, 31, 0.08);
  background: rgba(29, 29, 31, 0.08);
  color: #8e8e93;
}

@media (max-width: 620px) {
  .recharge-packages {
    grid-template-columns: 1fr;
  }

  .recharge-actions {
    flex-direction: column;
  }
}
```

- [ ] **Step 2: Run CSS-related smoke check**

Run:

```bash
rg -n "recharge-overlay|recharge-package|recharge-actions" src/styles.css
```

Expected: all selectors appear.

- [ ] **Step 3: Commit styles**

```bash
git add src/styles.css
git commit -m "style(recharge): add restrained recharge dialog styles"
```

---

## Task 9: Supabase README

**Files:**
- Modify: `supabase/README.md`

- [ ] **Step 1: Update resources and deploy docs**

Add the two recharge functions to the Resources section and deploy section:

```markdown
- `functions/create-recharge-order/` creates authenticated mock-channel recharge orders.
- `functions/mock-pay-recharge-order/` confirms test-only mock payments through the recharge RPC.
```

Add deploy commands:

```bash
supabase functions deploy create-recharge-order
supabase functions deploy mock-pay-recharge-order
```

Add environment note:

```text
ALLOW_MOCK_PAYMENTS=true
```

Clarify that the mock payment secret is for local/staging only and must be disabled for public production.

- [ ] **Step 2: Verify README mentions mock payment secret**

Run:

```bash
rg -n "create-recharge-order|mock-pay-recharge-order|ALLOW_MOCK_PAYMENTS" supabase/README.md
```

Expected: all terms appear.

- [ ] **Step 3: Commit docs**

```bash
git add supabase/README.md
git commit -m "docs(recharge): document recharge function deployment"
```

---

## Task 10: Verification

**Files:** none

- [ ] **Step 1: Run focused recharge tests**

```bash
npx vitest run src/game/recharge.test.ts
```

Expected: recharge helper tests pass.

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: all repository tests pass.

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Expected: TypeScript build and Vite build complete successfully.

- [ ] **Step 4: Optional browser smoke**

If a dev server is needed for visual verification:

```bash
npm run dev -- --port 5173
```

Open the app, sign in, open the recharge dialog, and verify the dialog renders with disabled/enabled states. Stop the dev server before handoff unless it is intentionally left running for user testing.

---

## Self-Review

Spec coverage:

- Data model: Task 1 covers packages, orders, ledger, RLS, seeds, RPC.
- Backend functions: Tasks 2-4 cover function config and both Edge Functions.
- Frontend helper module: Task 5 covers typed helpers and tests.
- UI: Tasks 6-8 cover markup, `PoolScene.ts` binding, and restrained styles.
- Documentation: Task 9 covers Supabase deploy and mock-payment secret.
- Verification: Task 10 covers focused tests, full tests, build, and optional browser smoke.

Placeholder scan:

- No TBD/TODO placeholders.
- All code-changing steps include concrete code blocks or exact edits.
- Each command includes expected output or expected result.

Type consistency:

- Package fields map from snake_case database rows to camelCase frontend types.
- `CreatedRechargeOrder` uses nested `package`, matching Edge Function response.
- `MockPayRechargeResult` matches `mock-pay-recharge-order` response.

Known risk:

- This plan intentionally does not deploy or apply Supabase migrations from this environment. Deployment requires linked Supabase credentials and should be run by the project owner when ready.
