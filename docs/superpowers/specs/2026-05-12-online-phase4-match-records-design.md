# Phase 4: Online Match Records Design

## Overview

Add a `matches` table to Supabase and write one row per finished online game. Both players attempt the insert; `UNIQUE(room_id)` plus `ON CONFLICT DO NOTHING` deduplicates so whichever client gets there first wins. Scope ends at "table + insert"; query UI and Phase 5 disconnect fallback are out.

## Architecture

```
PoolScene (game-over path) ──► Supabase
                                ├── profiles  (existing: increment_profile_stat RPC)
                                ├── rooms     (existing: status='finished')
                                └── matches   (NEW: upsert one row, ON CONFLICT room_id DO NOTHING)
```

Every game-over path on each client calls `updateOnlineStats(won, reason)`. The function fans out three independent writes; matches is deduplicated by the unique room_id constraint, so symmetric calls from both clients produce exactly one row.

## Database Schema

### `public.matches`

| Column       | Type        | Notes                                              |
|--------------|-------------|----------------------------------------------------|
| id           | uuid PK     | `DEFAULT gen_random_uuid()`                        |
| room_id      | text UNIQUE | NOT NULL; FK semantics to `rooms.id` but no FK constraint (rooms may be cleaned up later) |
| player1_id   | uuid        | NOT NULL; FK → `profiles.id` ON DELETE CASCADE; semantically the **host** |
| player2_id   | uuid        | NOT NULL; FK → `profiles.id` ON DELETE CASCADE; semantically the **guest** |
| winner_id    | uuid        | Nullable; FK → `profiles.id`; equals player1_id or player2_id when set |
| reason       | text        | NOT NULL; CHECK in (`'normal'`, `'disconnect'`, `'surrender'`) |
| started_at   | timestamptz | NOT NULL; recorded when the local client enters online mode |
| finished_at  | timestamptz | NOT NULL; `DEFAULT now()`                          |

Indexes:

- `matches_player1_idx (player1_id, finished_at DESC)`
- `matches_player2_idx (player2_id, finished_at DESC)`

### Migration

```sql
CREATE TABLE public.matches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     text NOT NULL UNIQUE,
  player1_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  player2_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  winner_id   uuid REFERENCES public.profiles(id),
  reason      text NOT NULL CHECK (reason IN ('normal','disconnect','surrender')),
  started_at  timestamptz NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX matches_player1_idx ON public.matches (player1_id, finished_at DESC);
CREATE INDEX matches_player2_idx ON public.matches (player2_id, finished_at DESC);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can read own matches"
  ON public.matches FOR SELECT
  USING (auth.uid() IN (player1_id, player2_id));

CREATE POLICY "Players can insert own matches"
  ON public.matches FOR INSERT
  WITH CHECK (auth.uid() IN (player1_id, player2_id));
```

### RLS Summary

- SELECT: only the two participants.
- INSERT: only allowed if `auth.uid()` is one of player1_id / player2_id.
- No UPDATE / DELETE policy; rows are append-only.

## Code Changes

Single file touched: `src/game/PoolScene.ts`.

### 1. Track `matchStartedAt`

Add a class field and set it when the online session is initialized (the existing `initOnlineMode` / `setupOnlineMode` path, currently around line 1749):

```typescript
private matchStartedAt: number | null = null;
// ...
this.matchStartedAt = Date.now();
```

Reset to `null` in `cleanupOnlineMode` (around line 2274) so a stale value can't leak into the next match.

### 2. Cache local user id

`RoomInfo` does not currently include the local user id (`src/online/types.ts:14-20`). Cache it once at online init by calling `supabase.auth.getUser()` and storing on the scene:

```typescript
private myUserId: string | null = null;
// in initOnlineMode:
const { data } = await supabase.auth.getUser();
this.myUserId = data.user?.id ?? null;
```

`hostId` / `guestId` derive from `roomInfo.isHost` plus `myUserId` and `roomInfo.opponentId`. **No change to `RoomInfo` type.**

### 3. Extend `updateOnlineStats` signature

Current signature (`PoolScene.ts:2266`):

```typescript
private async updateOnlineStats(won: boolean): Promise<void>
```

New:

```typescript
private async updateOnlineStats(won: boolean, reason: 'normal' | 'disconnect' | 'surrender'): Promise<void>
```

New body:

```typescript
private async updateOnlineStats(won: boolean, reason: 'normal' | 'disconnect' | 'surrender'): Promise<void> {
  const stat = won ? 'wins' : 'losses';
  await supabase.rpc('increment_profile_stat', { stat_name: stat });

  if (this.roomInfo && this.myUserId && this.matchStartedAt) {
    const hostId  = this.roomInfo.isHost ? this.myUserId : this.roomInfo.opponentId;
    const guestId = this.roomInfo.isHost ? this.roomInfo.opponentId : this.myUserId;
    const winnerId = won ? this.myUserId : this.roomInfo.opponentId;

    await supabase.from('matches').upsert(
      {
        room_id:    this.roomInfo.roomId,
        player1_id: hostId,
        player2_id: guestId,
        winner_id:  winnerId,
        reason,
        started_at: new Date(this.matchStartedAt).toISOString(),
      },
      { onConflict: 'room_id', ignoreDuplicates: true }
    );

    await supabase.from('rooms').update({ status: 'finished' }).eq('id', this.roomInfo.roomId);
  }
}
```

### 4. Update all `updateOnlineStats` call sites

Today the function is called at 3 sites; **2 receive-side game-over paths are missing it** and must be added so the "both players write" guarantee actually holds.

| # | Line  | Path                                                       | New call                                              |
|---|-------|------------------------------------------------------------|-------------------------------------------------------|
| 1 | 1969  | I sent turn_end with gameOver=true (I or my opponent won)  | `updateOnlineStats(winner === myIndex, 'normal')`     |
| 2 | 2076  | I surrendered (`surrenderOnlineMatch`)                     | `void updateOnlineStats(false, 'surrender')`          |
| 3 | 2085  | I detected opponent disconnect (`handleOpponentDisconnect`)| `updateOnlineStats(true, 'disconnect')`               |
| 4 | 1803  | I received `game_over` message (opponent surrendered or claims I disconnected) — **NEW** | `void updateOnlineStats(iWin, msg.reason)` |
| 5 | 2022  | I received `turn_end` message with gameOver=true — **NEW** | `void updateOnlineStats(iWin, 'normal')`              |

Sites 4 and 5 are required for both-clients-write to hold; without them, only one side writes and `ON CONFLICT` never engages.

## Data Flow

```
Game ends
   │
   ├─► Player A's client: updateOnlineStats(wonA, reason)
   │     ├─ RPC increment_profile_stat (own profiles row)
   │     ├─ upsert matches  (UNIQUE room_id; A's row inserted)
   │     └─ update rooms.status='finished'  (idempotent)
   │
   └─► Player B's client: updateOnlineStats(wonB, reason)
         ├─ RPC increment_profile_stat (own profiles row)
         ├─ upsert matches  (UNIQUE room_id; B's insert silently dropped)
         └─ update rooms.status='finished'  (idempotent)

Net effect: 2 profiles updated, 1 matches row, rooms.status finished.
```

## Error Handling

- **`matches` insert rejected (network / RLS)**: log and continue. profiles increment and rooms update are independent and remain best-effort.
- **`matchStartedAt === null`**: skip the matches insert and `console.warn`. Should not happen because `initOnlineMode` always runs before any game-over path.
- **`myUserId === null`** (auth race): skip the matches insert with the same warn. profiles RPC still runs; if auth is broken it will fail anyway.
- **Both clients race the insert**: the second `upsert(..., { ignoreDuplicates: true })` returns success with 0 rows; no exception.

## Testing

- **Database / RLS test (live, via MCP)**:
  1. Insert one row as participant — succeeds.
  2. Insert with the same `room_id` again — `ON CONFLICT` swallows.
  3. SELECT as a third user not in `(player1_id, player2_id)` — RLS returns 0 rows.
- **Manual smoke test** (local): open two browsers, sign in as two accounts, play one online game to a normal finish, verify exactly one row exists in `matches` with the correct winner and reason. Repeat for `surrender` and simulated `disconnect`.

No automated test for `updateOnlineStats`. The function is pure I/O against Supabase and is exercised end-to-end by the smoke test; mocking the client would test the mock, not the behavior.

## Non-Goals

- No "my matches" history UI.
- No Phase 5 disconnect fallback (when both clients drop, no row is written; that is accepted).
- No `timeout` reason (no code path produces it today).
- No FK constraint between `matches.room_id` and `rooms.id` (rooms may be pruned later; matches survive).
- No write-side aggregation (win-rate, streaks, etc.) — derivable from the table when a UI is added.

## Out-of-Scope Risks Acknowledged

- A client that closes the browser exactly between simulation-end and `updateOnlineStats` writes nothing. Acceptable given Phase 4 scope and the symmetric write design (the other client almost always covers).
- If both clients close simultaneously, the match is lost. This is the Phase 5 problem and intentionally deferred.
