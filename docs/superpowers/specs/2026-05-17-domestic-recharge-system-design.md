# Domestic Recharge System Design

## Overview

Add a recharge foundation for the pool game that can support real domestic payments later without letting the browser mint paid coins. The first implementation uses a mock payment channel to prove the full order, callback, wallet, and UI flow. Real WeChat Pay and Alipay adapters are deferred until merchant credentials, HTTPS callback domains, and provider configuration are available.

This is a Level 3 change because it introduces billing-like behavior, database schema, backend functions, wallet mutation rules, and user-facing purchase flow.

## Product Direction

The first player-facing slice is deliberately narrow:

- A signed-in player opens a recharge dialog from the coin balance area.
- The player chooses one active coin package.
- The player creates a pending recharge order.
- In development/test mode, the player completes the order through a mock payment action.
- The backend confirms the order, records a wallet ledger entry, adds coins, and returns the refreshed wallet.

The UI should use a product-grade Apple/Stripe/GitHub baseline: restrained, professional, trustworthy, calm, and precise. Avoid decorative payment surfaces, card pileups, warm palette overuse, or anything that makes a payment flow feel unserious.

## Goals

- Create a shared order and ledger model for all future payment channels.
- Ensure paid coin grants are confirmed by backend code, not direct frontend wallet edits.
- Provide a working mock recharge flow that can be tested locally and in staging.
- Keep real WeChat Pay, Alipay, and overseas aggregation as adapters on top of the same order model.
- Preserve the current game economy behavior while avoiding broad rewrites in the first slice.

## Non-Goals

- No real WeChat Pay or Alipay launch in this slice.
- No overseas aggregator integration, Visa, PayPal, Apple Pay, or Google Pay in this slice.
- No admin console, refund console, invoice flow, tax handling, or real-money reporting.
- No conversion of every existing coin mutation to server-only ledger mutation yet.
- No guest checkout. Recharging requires an authenticated Supabase user.

## Important Security Boundary

Phase 1 protects the recharge path: paid coins are granted only by a backend confirmation function. It does not fully harden the whole game economy because existing local rewards, match settlement, and cue purchases still use the current client wallet write path.

Before any real-money launch, a follow-up wallet-hardening phase must remove direct client wallet updates, move all coin mutations through server-side RPC/functions, and make `wallet_ledger` the source of truth for every coin change.

## Roadmap Position

This work starts a new monetization phase after the existing account, wallet, and online systems. It should be delivered as:

1. Phase R1: Mock domestic recharge foundation.
2. Phase R2: Wallet hardening for all coin mutations.
3. Phase R3: Real WeChat Pay and Alipay provider adapters.
4. Phase R4: Overseas payment aggregator evaluation and adapter.

Only Phase R1 is in scope for the first implementation.

## User Workflows

### Recharge Success

1. Player is signed in.
2. Player clicks the recharge button near the coin balance.
3. The recharge dialog lists active packages, such as CNY 6 for 600 coins.
4. Player selects a package and creates an order.
5. The mock channel shows a pending order state.
6. Player completes mock payment.
7. Backend confirms the order exactly once.
8. Wallet balance refreshes and the dialog shows success.

### Authentication Required

If no Supabase user is signed in, the recharge dialog should ask the player to sign in before recharging. It must not create guest recharge orders.

### Duplicate Confirmation

If the mock completion endpoint is called twice for the same order, the second call returns the already-paid result without adding coins again.

### Expired Or Invalid Order

If an order is expired, missing, not owned by the user, or already failed, the function returns a clear error and does not mutate the wallet.

## Data Model

### `public.recharge_packages`

Authoritative package definitions. The frontend may display packages, but it must not decide price or coin amount.

| Column | Type | Notes |
|---|---|---|
| id | text primary key | Stable package id such as `coins_600` |
| title | text | Display title |
| amount_cents | integer | CNY cents, check `> 0` |
| currency | text | First slice uses `CNY` |
| coin_amount | integer | Granted coins, check `> 0` |
| bonus_coins | integer | Included bonus, default `0` |
| sort_order | integer | UI ordering |
| active | boolean | Only active packages can be purchased |
| created_at | timestamptz | Default `now()` |
| updated_at | timestamptz | Default `now()` |

Seeded packages:

- `coins_600`: CNY 6.00, 600 coins.
- `coins_2000`: CNY 18.00, 2000 coins.
- `coins_3800`: CNY 30.00, 3800 coins.

### `public.recharge_orders`

One row per purchase attempt.

| Column | Type | Notes |
|---|---|---|
| id | uuid primary key | Default `gen_random_uuid()` |
| user_id | uuid | References `auth.users(id)` |
| package_id | text | References `recharge_packages(id)` |
| amount_cents | integer | Copied from package at creation time |
| currency | text | Copied from package at creation time |
| coin_amount | integer | Copied from package total at creation time |
| channel | text | `mock`, later `wechat`, `alipay`, `aggregator` |
| status | text | `pending`, `paid`, `failed`, `expired` |
| provider_trade_no | text | Provider payment id, unique when present |
| provider_payload | jsonb | Sanitized callback/debug payload |
| error_message | text | Optional final failure reason |
| created_at | timestamptz | Default `now()` |
| expires_at | timestamptz | Default `now() + interval '30 minutes'` |
| paid_at | timestamptz | Nullable |
| updated_at | timestamptz | Default `now()` |

RLS:

- Players can read their own orders.
- No client insert, update, or delete policy.
- Edge Functions use the service role to create and confirm orders.

### `public.wallet_ledger`

Append-only wallet movement history. Phase R1 writes recharge credits. Later wallet-hardening work should migrate all rewards, match settlements, and purchases into this table.

| Column | Type | Notes |
|---|---|---|
| id | uuid primary key | Default `gen_random_uuid()` |
| user_id | uuid | References `auth.users(id)` |
| delta_coins | integer | Positive for credits, negative for debits |
| balance_after | integer | Wallet balance after the movement |
| reason | text | `recharge`, later `daily_check_in`, `match_win`, `cue_purchase`, etc. |
| source_type | text | `recharge_order` for Phase R1 |
| source_id | uuid | Source row id |
| metadata | jsonb | Small contextual object |
| created_at | timestamptz | Default `now()` |

Constraints:

- `delta_coins <> 0`
- Unique `(source_type, source_id)` for idempotency.

RLS:

- Players can read their own ledger rows.
- No client insert, update, or delete policy.

## Backend Functions

### SQL RPC: `confirm_recharge_order`

Service-only RPC used by payment callbacks and the mock payment function.

Behavior:

1. Lock the `recharge_orders` row by id.
2. Reject missing, expired, failed, or non-pending orders.
3. If the order is already paid, return the current wallet without inserting another ledger row.
4. Mark the order paid with `provider_trade_no`, `provider_payload`, and `paid_at`.
5. Upsert a `player_wallets` row if missing.
6. Add `coin_amount` to `player_wallets.coins`.
7. Insert one `wallet_ledger` row with `source_type = 'recharge_order'`.
8. Return order status, wallet balance, and granted coins.

The function must revoke execute from `public`, `anon`, and `authenticated`. Edge Functions call it with the Supabase service role.

### Edge Function: `create-recharge-order`

JWT required.

Input:

```json
{ "packageId": "coins_600", "channel": "mock" }
```

Behavior:

- Verify the authenticated user.
- Load the active package from `recharge_packages`.
- Allow only `mock` for Phase R1.
- Insert a pending `recharge_orders` row using copied price and coin values.
- Return the order id, package summary, status, and expiration time.

### Edge Function: `mock-pay-recharge-order`

JWT required. Enabled only when `ALLOW_MOCK_PAYMENTS=true`.

Input:

```json
{ "orderId": "uuid" }
```

Behavior:

- Verify the authenticated user.
- Verify the order belongs to the user and uses `channel = 'mock'`.
- Call `confirm_recharge_order` with a generated mock provider trade number.
- Return paid status, granted coins, and wallet balance.

### Real Provider Adapters Later

Future `wechat` and `alipay` callbacks should call the same `confirm_recharge_order` RPC after provider-specific verification:

- Signature verification.
- Merchant id/app id validation.
- Amount and currency match.
- Provider trade number uniqueness.
- Callback replay tolerance through idempotent order confirmation.

## Frontend Changes

### HTML

Add a recharge button near the existing coin balance and a single recharge dialog. The dialog should include:

- Current balance.
- Package list.
- Channel area showing only the mock channel in Phase R1.
- Create order button.
- Pending order state.
- Mock complete payment button when enabled.
- Success/error feedback.

### TypeScript

Add a focused recharge client module instead of growing `PoolScene.ts` with payment details:

- `src/game/recharge.ts`: package/order types, fetch packages, create order, mock pay, read own recent orders, sanitize helpers.
- `src/game/recharge.test.ts`: tests for package sanitization, order response handling, and mock payment state helpers.

`PoolScene.ts` owns UI binding and wallet refresh because it already owns the economy HUD.

### Styling

Add restrained CSS near the existing economy/shop styles. Use stable dimensions, explicit disabled/loading states, and no decorative payment theme.

## Error Handling

- Missing auth: show sign-in-required feedback and do not call create order.
- No active packages: show an empty state.
- Function error: keep the selected package, clear loading state, show a concise error.
- Paid order but wallet refresh fails: show paid success with granted coins and retry wallet refresh.
- Duplicate mock payment click: keep the button disabled while request is inflight; backend idempotency still protects balance.

## Configuration

Supabase function config:

```toml
[functions.create-recharge-order]
verify_jwt = true

[functions.mock-pay-recharge-order]
verify_jwt = true
```

Function secrets:

- `ALLOW_MOCK_PAYMENTS=true` for local/staging test only.
- Real provider secrets are deferred and must never be committed.

## Testing And Verification

Automated:

- `src/game/recharge.test.ts` for client-side recharge data handling.
- Existing `src/game/economy.test.ts` remains green.
- `npm test`
- `npm run build`

Database/function verification:

- Apply migration locally or to the linked Supabase project.
- Verify seeded packages exist.
- Create a mock order as an authenticated user.
- Complete the mock order.
- Confirm `player_wallets.coins` increases once.
- Confirm exactly one `wallet_ledger` row exists for the order.
- Call mock payment a second time and confirm the balance does not increase again.

Manual UI smoke:

- Sign in.
- Open recharge dialog.
- Select `coins_600`.
- Create order.
- Complete mock payment.
- Confirm HUD and shop balances update.
- Reopen the dialog and confirm recent order status is paid.

## Rollout And Rollback

Phase R1 is safe to ship only as a mock/test recharge feature. If deployed publicly before real provider integration, hide the recharge entry unless mock payments are intended for that environment.

Rollback:

- Hide the recharge button in the frontend.
- Disable `ALLOW_MOCK_PAYMENTS`.
- Leave database tables in place; they are additive and do not affect existing gameplay.

## Open Decisions

- Real domestic payment provider account, merchant ids, callback domains, and signing keys are not available yet.
- Whether the game will use official WeChat/Alipay direct integration or a domestic aggregator is deferred.
- Wallet hardening is required before enabling real-money payments for public players.

## Spec Self-Review

- Placeholder scan: no TBD/TODO placeholders remain.
- Scope check: this spec covers Phase R1 only. Real channels, overseas payment, and full wallet hardening are explicitly deferred.
- Consistency check: every paid coin grant flows through `confirm_recharge_order`; frontend never grants recharge coins directly.
- Ambiguity check: mock payments are test-only and must be disabled outside intended environments.
