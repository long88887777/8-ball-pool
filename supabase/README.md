# Supabase backend

This directory keeps the backend resources that the frontend expects from
Supabase under version control.

Project ref:

```text
auymwlpzwtpsnaaemnut
```

## Resources

- `migrations/` contains database tables, policies, triggers, and RPC functions.
- `functions/match-players/` contains the Edge Function called by
  `supabase.functions.invoke('match-players')`.
- `functions/create-recharge-order/` creates authenticated mock-channel
  recharge orders.
- `functions/mock-pay-recharge-order/` confirms test-only mock payments through
  the recharge RPC.

## Deploy

Install and authenticate the Supabase CLI, then link the project:

```bash
supabase login
supabase link --project-ref auymwlpzwtpsnaaemnut
```

Apply database migrations:

```bash
supabase db push
```

Deploy the matchmaking Edge Function:

```bash
supabase functions deploy match-players
supabase functions deploy create-recharge-order
supabase functions deploy mock-pay-recharge-order
```

The frontend also needs these Vercel environment variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Mock recharge payments also require this Supabase function secret in local or
staging environments:

```text
ALLOW_MOCK_PAYMENTS=true
```

Disable `ALLOW_MOCK_PAYMENTS` for public production unless the mock channel is
intentionally hidden from players and used only by trusted testers.
