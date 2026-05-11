# Phase 4: Online Match Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `public.matches` table to Supabase and have both clients write one row per finished online 8-ball game (deduplicated by `UNIQUE(room_id)`).

**Architecture:** New table + RLS. Single application file touched (`src/game/PoolScene.ts`). Local user id is fetched once in `main.ts` and passed through Phaser registry as part of `roomInfo`, so PoolScene reads it synchronously without any auth race. Five call sites of `updateOnlineStats` are updated (3 existing + 2 new) so both clients attempt the insert at game-over.

**Tech Stack:** TypeScript, Supabase JS v2, Postgres (Supabase managed), Vitest, Phaser 3.

**Spec:** [docs/superpowers/specs/2026-05-12-online-phase4-match-records-design.md](../specs/2026-05-12-online-phase4-match-records-design.md)

### Refinement vs spec

Spec §Code Changes §2 proposes caching `myUserId` inside `PoolScene.initOnlineMode` by calling `supabase.auth.getUser()`. This plan refines that: thread `myUserId` through `RoomInfo` from `matchmaking.ts` (where it is already in scope) into PoolScene. PoolScene reads it synchronously. Behavior identical, race window eliminated.

`RoomInfo` therefore gains one new field: `myUserId: string`. This is a minor extension (3 lines: type def + populate at every literal in matchmaking.ts).

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| Supabase migration `create_matches_table` | Create (applied via MCP) | New `public.matches` table + indexes + RLS |
| `src/online/types.ts` | Modify | Add `myUserId: string` to `RoomInfo` |
| `src/online/matchmaking.ts` | Modify | Populate `myUserId` when constructing `RoomInfo` |
| `src/game/PoolScene.ts` | Modify | Track `matchStartedAt`, extend `updateOnlineStats` signature, add 2 new call sites, reset state in `cleanupOnlineMode` |

No new files. No automated unit test (per spec — the function is pure I/O against Supabase; smoke test is the verification).

---

## Task 1: Database Migration

**Files:**
- Apply: Supabase migration `create_matches_table` (project `auymwlpzwtpsnaaemnut`)

- [ ] **Step 1: Apply the migration via MCP**

Use the Supabase MCP tool `apply_migration` with these exact arguments:

- `project_id`: `auymwlpzwtpsnaaemnut`
- `name`: `create_matches_table`
- `query`:

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

- [ ] **Step 2: Verify the table exists**

Use Supabase MCP tool `list_tables` with `project_id=auymwlpzwtpsnaaemnut`, `schemas=["public"]`. Confirm `public.matches` is present with `rls_enabled: true` and `rows: 0`.

- [ ] **Step 3: Verify schema details via execute_sql**

Use Supabase MCP tool `execute_sql` with `project_id=auymwlpzwtpsnaaemnut`:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'matches'
ORDER BY ordinal_position;
```

Expected: 8 rows matching the spec table. `id` has `gen_random_uuid()` default; `finished_at` has `now()` default; `winner_id` is nullable; others NOT NULL.

- [ ] **Step 4: Seed one synthetic row to verify the schema accepts a valid INSERT**

Use Supabase MCP `execute_sql`:

```sql
WITH ids AS (SELECT id FROM public.profiles LIMIT 2)
INSERT INTO public.matches (room_id, player1_id, player2_id, winner_id, reason, started_at)
SELECT 'TEST00',
       (SELECT id FROM ids LIMIT 1),
       (SELECT id FROM ids OFFSET 1 LIMIT 1),
       (SELECT id FROM ids LIMIT 1),
       'normal',
       now() - interval '5 minutes';
```

Then verify:

```sql
SELECT room_id, reason FROM public.matches WHERE room_id = 'TEST00';
```

Expected: 1 row with `reason = 'normal'`. (Note: MCP `execute_sql` runs as service role and bypasses RLS, so this only checks the schema, not the policy. Full RLS verification is in Task 6 from the client side.)

- [ ] **Step 5: Verify ON CONFLICT (room_id) DO NOTHING semantics**

```sql
WITH ids AS (SELECT id FROM public.profiles LIMIT 2)
INSERT INTO public.matches (room_id, player1_id, player2_id, winner_id, reason, started_at)
SELECT 'TEST00',
       (SELECT id FROM ids LIMIT 1),
       (SELECT id FROM ids OFFSET 1 LIMIT 1),
       (SELECT id FROM ids OFFSET 1 LIMIT 1),
       'surrender',
       now()
ON CONFLICT (room_id) DO NOTHING;
```

Then:

```sql
SELECT room_id, reason, winner_id FROM public.matches WHERE room_id = 'TEST00';
```

Expected: still 1 row with `reason = 'normal'` (unchanged from Step 4) — the second insert was silently dropped.

- [ ] **Step 6: Clean up the test row**

```sql
DELETE FROM public.matches WHERE room_id = 'TEST00';
```

Verify with `SELECT count(*) FROM public.matches` → 0.

- [ ] **Step 7: No git commit (migration is server-side state)**

Migrations are tracked in Supabase, not in this repo. Proceed to Task 2.

---

## Task 2: Extend `RoomInfo` type with `myUserId`

**Files:**
- Modify: `src/online/types.ts:14-20`

- [ ] **Step 1: Add the field**

Open `src/online/types.ts`. Replace the `RoomInfo` interface (currently lines 14-20):

```typescript
export interface RoomInfo {
  roomId: string;
  opponentId: string;
  isHost: boolean;
  myNickname: string;
  opponentNickname: string;
}
```

with:

```typescript
export interface RoomInfo {
  roomId: string;
  opponentId: string;
  isHost: boolean;
  myNickname: string;
  opponentNickname: string;
  myUserId: string;
}
```

- [ ] **Step 2: Run typecheck — expect failures at construction sites**

```bash
npx tsc --noEmit
```

Expected: TypeScript errors in `src/online/matchmaking.ts` because each `RoomInfo` literal is missing `myUserId`. **Do not fix yet — Task 3 covers this.** Note the file:line of each error.

- [ ] **Step 3: Commit the type change alone**

```bash
git add src/online/types.ts
git commit -m "feat(online): add myUserId field to RoomInfo type"
```

(Yes, this commit leaves the project in a broken-typecheck state. That is acceptable mid-task because Task 3 follows immediately and the commit history is clearer this way. If you prefer a green-tree commit policy, combine Task 2 and Task 3 into a single commit at the end of Task 3 instead.)

---

## Task 3: Populate `myUserId` in matchmaking flow

**Files:**
- Modify: `src/online/matchmaking.ts` (every `RoomInfo` construction site)

- [ ] **Step 1: Locate all `RoomInfo` construction sites**

```bash
grep -n "myNickname:" src/online/matchmaking.ts
```

Each matched line is part of a `RoomInfo` literal — these are the only places to patch.

- [ ] **Step 2: Confirm `myUserId` (or equivalent local) is in scope**

```bash
grep -n -E "myUserId|userId|user\.id" src/online/matchmaking.ts | head -20
```

Look for the local variable that already holds the current user's auth id near each `RoomInfo` literal. The signature `onMatchSuccess(callback, myUserId, info)` at line 254 already has `myUserId` as a parameter, so any literal constructed inside or downstream of that function has direct access. For literals outside that function, trace the same `myUserId` upward; if a different local name is used (e.g. `currentUserId`), use that.

If no local user id is available at some literal, fetch it once at the top of that function:

```typescript
const { data: { user } } = await supabase.auth.getUser();
const myUserId = user?.id ?? '';
if (!myUserId) return;  // bail rather than construct an invalid RoomInfo
```

(Prefer threading from above when possible to avoid the extra call.)

- [ ] **Step 3: Add `myUserId` to each `RoomInfo` literal**

For each literal of the shape:

```typescript
{
  roomId,
  opponentId: ...,
  isHost: ...,
  myNickname: ...,
  opponentNickname: ...,
}
```

add the field (using property shorthand if the local is named `myUserId`):

```typescript
{
  roomId,
  opponentId: ...,
  isHost: ...,
  myNickname: ...,
  opponentNickname: ...,
  myUserId,
}
```

- [ ] **Step 4: Typecheck — expect zero errors**

```bash
npx tsc --noEmit
```

Expected: zero errors. If any error remains, find the un-patched literal and repeat Step 3.

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: existing test suite passes unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/online/matchmaking.ts
git commit -m "feat(online): populate myUserId in RoomInfo at match success"
```

---

## Task 4: Track `matchStartedAt` in PoolScene

**Files:**
- Modify: `src/game/PoolScene.ts` (class field, `initOnlineMode`, `cleanupOnlineMode`)

- [ ] **Step 1: Add the class field**

Open `src/game/PoolScene.ts`. Find the existing block of online fields (currently lines 197-199):

```typescript
  private onlineChannel: GameChannel | null = null;
  private onlineState: OnlineState | null = null;
  private roomInfo: RoomInfo | null = null;
```

Add a new field directly after `roomInfo`:

```typescript
  private onlineChannel: GameChannel | null = null;
  private onlineState: OnlineState | null = null;
  private roomInfo: RoomInfo | null = null;
  private matchStartedAt: number | null = null;
```

- [ ] **Step 2: Set the timestamp at the top of `initOnlineMode`**

Find `initOnlineMode` (currently starts at line 1748). The current body opens with:

```typescript
  private initOnlineMode(): void {
    if (!this.roomInfo) return;
    this.onlineState = createOnlineState({
```

Insert `this.matchStartedAt = Date.now();` right after the guard:

```typescript
  private initOnlineMode(): void {
    if (!this.roomInfo) return;
    this.matchStartedAt = Date.now();
    this.onlineState = createOnlineState({
```

- [ ] **Step 3: Reset the field in `cleanupOnlineMode`**

Find `cleanupOnlineMode` (currently starts at line 2274). The current body resets `onlineState`, `pendingResult`, `pendingTurnEnd`. Add `this.matchStartedAt = null;` next to those resets:

```typescript
  private cleanupOnlineMode(): void {
    if (this.onlineChannel) {
      this.onlineChannel.leave();
      this.onlineChannel = null;
    }
    this.onlineState = null;
    this.matchStartedAt = null;
    this.pendingResult = null;
    this.pendingTurnEnd = null;
    // ... (rest unchanged)
```

- [ ] **Step 4: Typecheck and run tests**

```bash
npx tsc --noEmit
npm test
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/PoolScene.ts
git commit -m "feat(online): track matchStartedAt in PoolScene for history records"
```

---

## Task 5: Extend `updateOnlineStats` + update call sites

**Files:**
- Modify: `src/game/PoolScene.ts` (function body at line 2266; call sites at lines 1803, 1969, 2022, 2076, 2085)

- [ ] **Step 1: Rewrite the function body**

Find `updateOnlineStats` (currently starts at line 2266):

```typescript
  private async updateOnlineStats(won: boolean): Promise<void> {
    const stat = won ? 'wins' : 'losses';
    await supabase.rpc('increment_profile_stat', { stat_name: stat });
    if (this.roomInfo) {
      await supabase.from('rooms').update({ status: 'finished' }).eq('id', this.roomInfo.roomId);
    }
  }
```

Replace with:

```typescript
  private async updateOnlineStats(
    won: boolean,
    reason: 'normal' | 'disconnect' | 'surrender',
  ): Promise<void> {
    const stat = won ? 'wins' : 'losses';
    await supabase.rpc('increment_profile_stat', { stat_name: stat });

    if (!this.roomInfo) return;

    if (this.matchStartedAt !== null) {
      const myUserId = this.roomInfo.myUserId;
      const opponentId = this.roomInfo.opponentId;
      const hostId = this.roomInfo.isHost ? myUserId : opponentId;
      const guestId = this.roomInfo.isHost ? opponentId : myUserId;
      const winnerId = won ? myUserId : opponentId;

      await supabase.from('matches').upsert(
        {
          room_id: this.roomInfo.roomId,
          player1_id: hostId,
          player2_id: guestId,
          winner_id: winnerId,
          reason,
          started_at: new Date(this.matchStartedAt).toISOString(),
        },
        { onConflict: 'room_id', ignoreDuplicates: true },
      );
    } else {
      console.warn('updateOnlineStats: matchStartedAt is null; skipping matches insert');
    }

    await supabase.from('rooms').update({ status: 'finished' }).eq('id', this.roomInfo.roomId);
  }
```

- [ ] **Step 2: Update call site at line ~1969 (I sent turn_end with gameOver=true)**

Find:

```typescript
      this.updateOnlineStats(winner === myIndex);
```

Replace with:

```typescript
      void this.updateOnlineStats(winner === myIndex, 'normal');
```

- [ ] **Step 3: Update call site at line ~2076 (`surrenderOnlineMatch`)**

Find:

```typescript
    void this.updateOnlineStats(false);
```

Replace with:

```typescript
    void this.updateOnlineStats(false, 'surrender');
```

- [ ] **Step 4: Update call site at line ~2085 (`handleOpponentDisconnect`)**

Find:

```typescript
    this.updateOnlineStats(true);
```

Replace with:

```typescript
    void this.updateOnlineStats(true, 'disconnect');
```

- [ ] **Step 5: Add NEW call site after the `game_over` message handler (~ line 1803)**

Find the existing handler:

```typescript
    if (msg.type === 'game_over') {
      const myIndex = this.roomInfo!.isHost ? 0 : 1;
      const iWin = msg.winner === myIndex;
      this.onlineState = transitionToGameOver(this.onlineState, msg.winner, msg.reason);
      this.showOnlineGameOver(iWin, msg.reason);
      return;
    }
```

Insert one line before `return;`:

```typescript
    if (msg.type === 'game_over') {
      const myIndex = this.roomInfo!.isHost ? 0 : 1;
      const iWin = msg.winner === myIndex;
      this.onlineState = transitionToGameOver(this.onlineState, msg.winner, msg.reason);
      this.showOnlineGameOver(iWin, msg.reason);
      void this.updateOnlineStats(iWin, msg.reason);
      return;
    }
```

- [ ] **Step 6: Add NEW call site after the `turn_end` message handler when `gameOver === true` (~ line 2022)**

Find the existing block:

```typescript
      if (msg.gameOver) {
        const myIndex = this.roomInfo!.isHost ? 0 : 1;
        const iWin = msg.winner === myIndex;
        this.onlineState = transitionToGameOver(this.onlineState, msg.winner ?? 0, 'normal');
        this.showOnlineGameOver(iWin, 'normal');
        return;
      }
```

Insert one line before `return;`:

```typescript
      if (msg.gameOver) {
        const myIndex = this.roomInfo!.isHost ? 0 : 1;
        const iWin = msg.winner === myIndex;
        this.onlineState = transitionToGameOver(this.onlineState, msg.winner ?? 0, 'normal');
        this.showOnlineGameOver(iWin, 'normal');
        void this.updateOnlineStats(iWin, 'normal');
        return;
      }
```

- [ ] **Step 7: Verify all call sites are correctly updated**

```bash
grep -n "updateOnlineStats" src/game/PoolScene.ts
```

Expected: exactly 6 lines — 1 function definition + 5 call sites, every call passing two arguments. Line numbers will shift slightly from the inserted code; the **count of 6** and the **two-arg form** of every call are what matters. A single-argument call surviving means a site was missed.

- [ ] **Step 8: Typecheck, test, build**

```bash
npx tsc --noEmit
npm test
npm run build
```

Expected: all three succeed.

- [ ] **Step 9: Commit**

```bash
git add src/game/PoolScene.ts
git commit -m "feat(online): write match records on game over (Phase 4)"
```

---

## Task 6: Manual smoke test (in browser, two sessions)

**Files:** none

This task is per-spec verification — automated tests do not cover Supabase end-to-end.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Wait for the local Vite URL to print.

- [ ] **Step 2: Open two browser sessions, sign in as different accounts**

Open the URL in two different browsers (or one regular + one private/incognito window). Sign in as account A in window 1, account B in window 2. Both profiles must already exist in `public.profiles` (sign up if needed).

- [ ] **Step 3: Play one online game to a normal finish**

In window 1: "Online Battle" → "Create Room". Copy the 6-digit code. In window 2: "Online Battle" → "Join Room" → paste the code. Play a complete 8-ball game until someone wins by legally pocketing the 8 (or by the opponent illegally pocketing the 8). Wait for both clients to show the victory/loss overlay.

- [ ] **Step 4: Verify exactly one matches row was written**

Use Supabase MCP `execute_sql` with `project_id=auymwlpzwtpsnaaemnut`:

```sql
SELECT
  room_id, player1_id, player2_id, winner_id, reason,
  finished_at - started_at AS duration
FROM public.matches
ORDER BY finished_at DESC
LIMIT 5;
```

Expected: top row is the just-finished game. `room_id` matches the displayed room code. `player1_id` is account A's id (host). `player2_id` is account B's id (guest). `winner_id` is the actual winner. `reason = 'normal'`. `duration` is positive and roughly the play time.

- [ ] **Step 5: Repeat for `surrender`**

Start a fresh online game between the same two accounts. Mid-game, click "Surrender" / "Leave" in one window. Wait for both sides to register game over. Re-run the SELECT from Step 4. Verify a new top row with `reason = 'surrender'` and `winner_id` equal to the surviving player.

- [ ] **Step 6: Verify ON CONFLICT deduplication actually engaged**

```sql
SELECT room_id, count(*)
FROM public.matches
GROUP BY room_id
HAVING count(*) > 1;
```

Expected: zero rows. Each `room_id` appears exactly once even though both clients attempted to insert.

- [ ] **Step 7: Verify RLS denies a non-participant SELECT (server-side simulation)**

If your Supabase MCP allows setting JWT claims for `execute_sql`, pick any third profile id that has not participated in the test games:

```sql
SELECT id FROM public.profiles
WHERE id NOT IN (
  SELECT player1_id FROM public.matches WHERE reason IN ('normal','surrender')
  UNION
  SELECT player2_id FROM public.matches WHERE reason IN ('normal','surrender')
)
LIMIT 1;
```

Then run as that user:

```sql
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '<third-profile-uuid>';
SELECT count(*) FROM public.matches;
RESET ROLE;
```

Expected: `0`. (RLS filters all rows because the third user is not in `(player1_id, player2_id)`.)

If your MCP setup does not support `SET LOCAL ROLE`, skip this step — the policy is verified at creation time in Task 1, and any policy syntax error would have failed the migration.

- [ ] **Step 8: Stop the dev server**

Ctrl-C the dev server.

- [ ] **Step 9: Final verification — print summary**

```sql
SELECT
  reason,
  count(*) AS games,
  count(DISTINCT room_id) AS distinct_rooms
FROM public.matches
GROUP BY reason
ORDER BY reason;
```

Expected: at least one row each for `normal` and `surrender`, with `games = distinct_rooms` (no duplicates by room_id).

---

## Self-Review

Cross-checking the plan against the spec:

| Spec section | Plan task | Covered? |
|---|---|---|
| §Database Schema (table + indexes + RLS) | Task 1 | yes |
| §Code Changes §1 (`matchStartedAt`) | Task 4 | yes |
| §Code Changes §2 (cache local user id) | Tasks 2–3 (refined to threading via `RoomInfo`) | yes — refinement noted at plan top |
| §Code Changes §3 (extend signature) | Task 5 Step 1 | yes |
| §Code Changes §4 (5 call sites) | Task 5 Steps 2–7 | yes |
| §Error Handling (`matchStartedAt === null`) | Task 5 Step 1 (`else` branch with `console.warn`) | yes |
| §Error Handling (`myUserId === null`) | N/A — refinement removes this branch by passing `myUserId` synchronously through `RoomInfo` | yes (handled by design) |
| §Testing (DB + RLS) | Task 1 Steps 2–6; Task 6 Steps 6–7 | yes |
| §Testing (manual smoke) | Task 6 Steps 1–5 | yes |
| §Non-Goals | No tasks (intentionally out of scope) | n/a |

Placeholder scan: no TBD/TODO, no "implement later", no "similar to Task N", no untyped references. Every code step shows the actual code; every command shows exact invocation and expected output.

Type consistency: `RoomInfo.myUserId` is `string` (Task 2) and consumed as `string` (Task 5 Step 1). The literal `'normal' | 'disconnect' | 'surrender'` is identical at function signature, every call site, and the table CHECK constraint.

Spec coverage gaps: none.
