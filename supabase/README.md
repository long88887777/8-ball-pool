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
```

The frontend also needs these Vercel environment variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

