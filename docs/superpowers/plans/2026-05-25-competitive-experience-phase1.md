# Competitive Experience Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first competitive-experience slice: online rematch records, lightweight match history, stronger controls, human-like AI profiles, and clearer localization/menu hierarchy.

**Architecture:** Use additive changes around existing boundaries. Online rematch identity is handled with `game_seq` in Supabase and an `onlineGameSeq` scene field. Match history is a pure model stored inside existing `recentMatches` JSON. Controls and AI behavior are introduced through small typed helpers consumed by `PoolScene` and `AIController`.

**Tech Stack:** TypeScript, Phaser 3, Vitest, Supabase SQL migrations/RPC, Vite.

---

## File Structure

| Path | Responsibility |
| ---- | -------------- |
| `supabase/migrations/202605250001_add_match_game_sequence.sql` | Add per-room game sequence to match records and update settlement RPC |
| `src/online/types.ts` | Add optional `gameSeq` to `RematchStartMessage` |
| `src/game/PoolScene.ts` | Track `onlineGameSeq`, reset match state on rematch, capture shot history, apply settings copy |
| `src/game/PoolScene.online.test.ts` | Cover rematch sequence and settlement payloads |
| `src/game/matchHistory.ts` | Pure model for shot history and recent match compatibility |
| `src/game/matchHistory.test.ts` | Unit tests for history model and sanitization |
| `src/game/growth/stats.ts` | Permit optional `ruleset` and `shotHistory` in recent records |
| `src/game/growth/stats.test.ts` | Keep old records valid and new records retained |
| `src/game/shotControl.ts` | Aim-control settings and step helpers |
| `src/game/shotControl.test.ts` | Unit tests for control settings |
| `src/game/ai/difficulty.ts` | Extend difficulty profiles with personality fields |
| `src/game/ai/difficulty.test.ts` | Unit tests for profile values |
| `src/game/ai/aiController.ts` | Bias candidate choice using profile values |
| `src/game/ai/aiController.test.ts` | Verify safety/risk behavior |
| `src/game/i18n.ts` | Add shell/settings/history copy keys |
| `src/main.ts` | Apply menu shell copy and render history/settings UI |
| `index.html` | Add settings/history panels and reduce menu primary/secondary clutter |
| `src/styles.css` | Style the new panels without disrupting table layout |

---

## Task 1: Database Match Sequence

**Files:**
- Create: `supabase/migrations/202605250001_add_match_game_sequence.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/202605250001_add_match_game_sequence.sql`:

```sql
alter table public.matches
  add column if not exists game_seq integer not null default 1;

drop index if exists matches_room_id_key;
alter table public.matches
  drop constraint if exists matches_room_id_key;

create unique index if not exists matches_room_game_seq_key
  on public.matches (room_id, game_seq);

create index if not exists matches_room_finished_idx
  on public.matches (room_id, game_seq, finished_at desc);

create or replace function public.settle_online_match(
  p_room_id text,
  p_winner_id uuid,
  p_reason text,
  p_started_at timestamptz,
  p_player1_strokes integer default null,
  p_player2_strokes integer default null,
  p_player1_cleared_table boolean default false,
  p_player2_cleared_table boolean default false,
  p_game_seq integer default 1
)
returns table(match_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_existing_match_id uuid;
  v_loser_id uuid;
  v_match_id uuid;
  v_game_seq integer := greatest(1, coalesce(p_game_seq, 1));
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_reason not in ('normal', 'disconnect', 'surrender') then
    raise exception 'invalid match reason: %', p_reason;
  end if;

  select *
    into v_room
    from public.rooms
   where id = p_room_id
   for update;

  if not found then
    raise exception 'room not found: %', p_room_id;
  end if;

  if v_room.guest_id is null then
    raise exception 'room has no guest: %', p_room_id;
  end if;

  if auth.uid() not in (v_room.host_id, v_room.guest_id) then
    raise exception 'not a room participant';
  end if;

  if p_winner_id not in (v_room.host_id, v_room.guest_id) then
    raise exception 'winner is not a room participant';
  end if;

  select id
    into v_existing_match_id
    from public.matches
   where room_id = p_room_id
     and game_seq = v_game_seq;

  if v_existing_match_id is not null then
    match_id := v_existing_match_id;
    return next;
    return;
  end if;

  v_loser_id := case
    when p_winner_id = v_room.host_id then v_room.guest_id
    else v_room.host_id
  end;

  insert into public.matches (
    room_id,
    game_seq,
    player1_id,
    player2_id,
    winner_id,
    reason,
    started_at,
    player1_strokes,
    player2_strokes,
    player1_cleared_table,
    player2_cleared_table
  )
  values (
    p_room_id,
    v_game_seq,
    v_room.host_id,
    v_room.guest_id,
    p_winner_id,
    p_reason,
    p_started_at,
    p_player1_strokes,
    p_player2_strokes,
    p_player1_cleared_table,
    p_player2_cleared_table
  )
  returning id into v_match_id;

  update public.profiles
     set wins = wins + 1
   where id = p_winner_id;

  update public.profiles
     set losses = losses + 1
   where id = v_loser_id;

  update public.rooms
     set status = 'finished'
   where id = p_room_id;

  match_id := v_match_id;
  return next;
end;
$$;

grant execute on function public.settle_online_match(
  text,
  uuid,
  text,
  timestamptz,
  integer,
  integer,
  boolean,
  boolean,
  integer
) to authenticated;
```

- [ ] **Step 2: Static migration check**

Run: `rg -n "game_seq|matches_room_game_seq_key|p_game_seq" supabase/migrations/202605250001_add_match_game_sequence.sql`

Expected: matches for the new column, unique index, and RPC parameter.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/202605250001_add_match_game_sequence.sql
git commit -m "feat(online): add per-room match sequence"
```

---

## Task 2: Online Rematch Sequence State

**Files:**
- Modify: `src/online/types.ts`
- Modify: `src/game/PoolScene.ts`
- Test: `src/game/PoolScene.online.test.ts`

- [ ] **Step 1: Write failing tests**

In `src/game/PoolScene.online.test.ts`, extend `ShotHandlerHarness` with `onlineGameSeq: number` and add tests:

```ts
it('starts rematches with the next online game sequence', () => {
  const scene = createOnlineSceneHarness();
  scene.onlineChannel = { send: vi.fn() };
  scene.onlineGameSeq = 1;

  scene.startRematchCountdown();

  expect(scene.onlineChannel.send).toHaveBeenCalledWith(expect.objectContaining({
    type: 'rematch_start',
    gameSeq: 2,
  }));
});

it('resets online match tracking when a rematch begins', () => {
  const scene = createOnlineSceneHarness();
  scene.onlineGameSeq = 1;
  scene.matchStartedAt = 1000;
  scene.currentMatchId = 'match-1';

  scene.performRematch(0, 2);

  expect(scene.onlineGameSeq).toBe(2);
  expect(scene.currentMatchId).toBeNull();
  expect(scene.matchStartedAt).not.toBe(1000);
  expect(scene.matchStartedAt).toEqual(expect.any(Number));
});

it('settles online stats with the current game sequence', async () => {
  const scene = createOnlineSceneHarness();
  scene.onlineGameSeq = 3;
  scene.matchStartedAt = 1000;
  scene.supabaseClient = {
    rpc: vi.fn(async () => ({ data: [{ match_id: 'match-3' }], error: null })),
    from: vi.fn(),
  };

  await scene.updateOnlineStats(true, 'normal');

  expect(scene.supabaseClient.rpc).toHaveBeenCalledWith('settle_online_match', expect.objectContaining({
    p_room_id: 'room-1',
    p_game_seq: 3,
  }));
});
```

- [ ] **Step 2: Run the targeted tests and observe failure**

Run: `npx vitest run src/game/PoolScene.online.test.ts`

Expected: FAIL because `onlineGameSeq`, `gameSeq`, and the new `performRematch` parameter do not exist yet.

- [ ] **Step 3: Implement the type change**

In `src/online/types.ts`, change `RematchStartMessage`:

```ts
export type RematchStartMessage = MessageBase & {
  type: 'rematch_start';
  startAt: number;
  breaker: 0 | 1;
  gameSeq?: number;
};
```

- [ ] **Step 4: Implement PoolScene sequence tracking**

In `PoolScene`, add:

```ts
private onlineGameSeq = 1;
```

Update rematch handlers:

```ts
private startRematchCountdown(): void {
  if (!this.onlineChannel) return;
  const breaker: 0 | 1 = this.lastGameLoser ?? 0;
  const startAt = Date.now() + 3500;
  const gameSeq = this.onlineGameSeq + 1;
  this.onlineChannel.send({ type: 'rematch_start', startAt, breaker, gameSeq });
  this.beginRematchCountdown(startAt, breaker, gameSeq);
}

private beginRematchCountdown(startAt: number, breaker: 0 | 1, gameSeq = this.onlineGameSeq + 1): void {
  // existing body, but call performRematch(breaker, gameSeq)
}

private performRematch(breaker: 0 | 1, gameSeq = this.onlineGameSeq + 1): void {
  this.onlineGameSeq = Math.max(1, Math.floor(gameSeq));
  this.matchStartedAt = Date.now();
  this.currentMatchId = null;
  // existing restart/rematch body continues
}
```

When handling `rematch_start`, pass `msg.gameSeq ?? this.onlineGameSeq + 1`.

In `updateOnlineStats`, add `p_game_seq: this.onlineGameSeq` to the RPC payload and `game_seq: this.onlineGameSeq` to fallback upsert. Change fallback conflict target to `room_id,game_seq`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/game/PoolScene.online.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/online/types.ts src/game/PoolScene.ts src/game/PoolScene.online.test.ts
git commit -m "feat(online): track rematch game sequence"
```

---

## Task 3: Match History Model

**Files:**
- Create: `src/game/matchHistory.ts`
- Create: `src/game/matchHistory.test.ts`
- Modify: `src/game/growth/stats.ts`
- Test: `src/game/growth/stats.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/game/matchHistory.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { appendShotHistoryEntry, sanitizeShotHistory, type ShotHistoryEntry } from './matchHistory';

describe('match history', () => {
  const entry: ShotHistoryEntry = {
    playerIndex: 0,
    ruleset: 'eight-ball',
    powerPercent: 62,
    spin: { x: 0.2, y: -0.1 },
    pocketedBallIds: [3],
    foulReason: null,
    message: '玩家一 合法进球',
  };

  it('sanitizes valid shot entries and drops malformed rows', () => {
    expect(sanitizeShotHistory([entry, { playerIndex: 8 }])).toEqual([entry]);
  });

  it('caps stored shot history to the newest 80 shots', () => {
    const result = Array.from({ length: 85 }, (_, index) => ({
      ...entry,
      powerPercent: index,
    })).reduce((history, item) => appendShotHistoryEntry(history, item), [] as ShotHistoryEntry[]);

    expect(result).toHaveLength(80);
    expect(result[0].powerPercent).toBe(5);
    expect(result.at(-1)?.powerPercent).toBe(84);
  });
});
```

Add to `src/game/growth/stats.test.ts`:

```ts
it('keeps optional ruleset and shot history on recent matches', () => {
  const stats = applyMatchToStats(createDefaultPlayerStats(), {
    matchId: 'match-history',
    playedAt: '2026-05-25T10:00:00.000Z',
    mode: 'online',
    opponentName: 'Mina',
    won: true,
    strokes: 3,
    clearedTable: true,
    ruleset: 'eight-ball',
    shotHistory: [{
      playerIndex: 0,
      ruleset: 'eight-ball',
      powerPercent: 70,
      spin: { x: 0, y: 0 },
      pocketedBallIds: [1],
      foulReason: null,
      message: 'legal pot',
    }],
  });

  expect(stats.recentMatches[0].ruleset).toBe('eight-ball');
  expect(stats.recentMatches[0].shotHistory).toHaveLength(1);
});
```

- [ ] **Step 2: Run tests and observe failure**

Run: `npx vitest run src/game/matchHistory.test.ts src/game/growth/stats.test.ts`

Expected: FAIL because `matchHistory.ts` and optional fields do not exist.

- [ ] **Step 3: Implement history helpers**

Create `src/game/matchHistory.ts` with exported `ShotHistoryEntry`, `MAX_SHOT_HISTORY_ENTRIES = 80`, `sanitizeShotHistory`, and `appendShotHistoryEntry`. Clamp `powerPercent` to integer 0-100, allow only player `0 | 1`, ruleset `eight-ball | nine-ball`, finite spin values in `[-1, 1]`, integer ball ids 1-15, and string/null foul reason.

- [ ] **Step 4: Update growth stats types**

In `src/game/growth/stats.ts`, import `ShotHistoryEntry`, extend `RecentMatchRecord` and `MatchResultInput` with:

```ts
ruleset?: GameRuleset;
shotHistory?: ShotHistoryEntry[];
```

Update `isRecentMatchRecord` and `sanitizePlayerStats` to preserve optional fields through `sanitizeShotHistory`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/game/matchHistory.test.ts src/game/growth/stats.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/matchHistory.ts src/game/matchHistory.test.ts src/game/growth/stats.ts src/game/growth/stats.test.ts
git commit -m "feat(history): add lightweight match history model"
```

---

## Task 4: Capture Shot History In PoolScene

**Files:**
- Modify: `src/game/PoolScene.ts`
- Test: `src/game/PoolScene.online.test.ts`

- [ ] **Step 1: Write failing test**

Add harness fields `currentShotHistory`, `pendingShotHistoryEntry`, and `appendResolvedShotHistoryEntry`. Test:

```ts
it('attaches shot history to growth match records', () => {
  const scene = createOnlineSceneHarness();
  scene.currentShotHistory = [{
    playerIndex: 0,
    ruleset: 'eight-ball',
    powerPercent: 50,
    spin: { x: 0, y: 0 },
    pocketedBallIds: [1],
    foulReason: null,
    message: 'legal pot',
  }];
  scene.playerStats = createDefaultPlayerStats();
  scene.matchGrowthSettled = false;

  scene.settleGrowthForMatch(true, 'normal');

  expect(scene.playerStats.recentMatches[0].shotHistory).toEqual(scene.currentShotHistory);
});
```

- [ ] **Step 2: Run test and observe failure**

Run: `npx vitest run src/game/PoolScene.online.test.ts`

Expected: FAIL because PoolScene does not include shot history in growth records.

- [ ] **Step 3: Implement shot-history fields**

In `PoolScene.ts`, add:

```ts
private currentShotHistory: ShotHistoryEntry[] = [];
private pendingShotHistoryEntry: ShotHistoryEntry | null = null;
```

When a shot is launched locally or received from online opponent, create a pending entry with shooter, ruleset, power percent, and spin. When the shot resolves, fill pocketed ball ids, foul reason, and current message text, then append through `appendShotHistoryEntry`.

In `restartRack` and `performRematch`, reset `currentShotHistory = []` and `pendingShotHistoryEntry = null`.

In `settleGrowthForMatch`, include:

```ts
ruleset: this.gameRuleset,
shotHistory: this.currentShotHistory,
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/game/PoolScene.online.test.ts src/game/growth/stats.test.ts src/game/matchHistory.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/PoolScene.ts src/game/PoolScene.online.test.ts
git commit -m "feat(history): capture shot summaries in matches"
```

---

## Task 5: Aim Control Settings

**Files:**
- Modify: `src/game/shotControl.ts`
- Modify: `src/game/shotControl.test.ts`
- Modify: `src/game/PoolScene.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/game/shotControl.test.ts`:

```ts
import { createDefaultAimControlSettings, resolveAimControlStep } from './shotControl';

it('resolves aim control steps from sensitivity and shift state', () => {
  expect(resolveAimControlStep(createDefaultAimControlSettings(), false)).toMatchObject({
    powerStep: 5,
  });
  expect(resolveAimControlStep({ sensitivity: 'fine', powerStep: 4, powerLocked: false }, false).rotationStepRadians)
    .toBeLessThan(resolveAimControlStep({ sensitivity: 'fast', powerStep: 4, powerLocked: false }, false).rotationStepRadians);
  expect(resolveAimControlStep({ sensitivity: 'normal', powerStep: 5, powerLocked: false }, true).powerStep).toBe(15);
});
```

- [ ] **Step 2: Run test and observe failure**

Run: `npx vitest run src/game/shotControl.test.ts`

Expected: FAIL because helpers do not exist.

- [ ] **Step 3: Implement helpers**

In `shotControl.ts`, add:

```ts
export type AimSensitivity = 'fine' | 'normal' | 'fast';

export type AimControlSettings = {
  sensitivity: AimSensitivity;
  powerStep: number;
  powerLocked: boolean;
};

export function createDefaultAimControlSettings(): AimControlSettings {
  return { sensitivity: 'normal', powerStep: 5, powerLocked: false };
}

export function resolveAimControlStep(settings: AimControlSettings, fastModifier: boolean) {
  const baseRotation = settings.sensitivity === 'fine'
    ? (0.2 * Math.PI) / 180
    : settings.sensitivity === 'fast'
      ? (0.7 * Math.PI) / 180
      : (0.35 * Math.PI) / 180;
  const multiplier = fastModifier ? 3 : 1;
  return {
    rotationStepRadians: baseRotation * multiplier,
    powerStep: Math.max(1, Math.floor(settings.powerStep)) * multiplier,
  };
}
```

- [ ] **Step 4: Wire PoolScene keyboard aiming**

Replace hardcoded `AIM_FINE_ROTATION_STEP`, `AIM_FAST_ROTATION_STEP`, and `AIM_POWER_STEP` usage with `resolveAimControlStep(this.aimControlSettings, event.shiftKey)`. If `powerLocked` is true, ignore ArrowUp/ArrowDown and keep current drag distance.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/game/shotControl.test.ts src/game/PoolScene.hud.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/shotControl.ts src/game/shotControl.test.ts src/game/PoolScene.ts
git commit -m "feat(controls): add aim control settings"
```

---

## Task 6: AI Human-Like Profiles

**Files:**
- Modify: `src/game/ai/difficulty.ts`
- Modify: `src/game/ai/difficulty.test.ts`
- Modify: `src/game/ai/aiController.ts`
- Modify: `src/game/ai/aiController.test.ts`

- [ ] **Step 1: Write failing profile tests**

Add to `difficulty.test.ts`:

```ts
it('exposes personality traits for each difficulty', () => {
  const easy = getAIDifficultyProfile('easy');
  const normal = getAIDifficultyProfile('normal');
  const hard = getAIDifficultyProfile('hard');

  expect(easy.safetyBias).toBeGreaterThan(hard.safetyBias);
  expect(hard.riskTolerance).toBeGreaterThan(normal.riskTolerance);
  expect(hard.aimErrorRadians).toBeGreaterThan(0);
  expect(normal.tempoMs).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test and observe failure**

Run: `npx vitest run src/game/ai/difficulty.test.ts`

Expected: FAIL because profile fields do not exist and hard has zero aim error.

- [ ] **Step 3: Implement profile fields**

Extend `AIDifficultyProfile`:

```ts
safetyBias: number;
riskTolerance: number;
tempoMs: number;
```

Set profiles:

- easy: high safety bias, low risk, visible error, slower tempo
- normal: balanced
- hard: high risk, lower safety bias, tiny non-zero aim/power/spin error, shorter tempo

- [ ] **Step 4: Bias candidate scoring in AIController**

Where candidates are compared, use:

```ts
const profile = getAIDifficultyProfile(this.difficulty);
const typeBias = candidate.type === 'safety'
  ? profile.safetyBias
  : candidate.type === 'pot'
    ? profile.riskTolerance
    : 0;
const score = baseScore + typeBias;
```

Keep legacy constructor behavior by defaulting to `hard`-like config when only raw MCTS config is passed.

- [ ] **Step 5: Run AI tests**

Run: `npx vitest run src/game/ai/difficulty.test.ts src/game/ai/aiController.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/ai/difficulty.ts src/game/ai/difficulty.test.ts src/game/ai/aiController.ts src/game/ai/aiController.test.ts
git commit -m "feat(ai): add human-like difficulty profiles"
```

---

## Task 7: History And Settings UI

**Files:**
- Modify: `index.html`
- Modify: `src/main.ts`
- Modify: `src/game/i18n.ts`
- Modify: `src/styles.css`
- Test: `src/game/i18n.test.ts`, `src/main.test.ts`

- [ ] **Step 1: Write failing i18n tests**

Add copy expectations to `src/game/i18n.test.ts`:

```ts
expect(copy.shell.settings).toBe('设置');
expect(copy.shell.history).toBe('对局历史');
expect(copy.shell.secondaryActions).toBe('更多');
```

Also verify English keys.

- [ ] **Step 2: Add shell copy keys**

In `i18n.ts`, add:

```ts
shell: {
  settings: string;
  history: string;
  secondaryActions: string;
  controls: string;
  sensitivity: string;
  powerStep: string;
  powerLock: string;
}
```

Populate English and Chinese copy.

- [ ] **Step 3: Update HTML structure**

In `index.html`, keep primary mode buttons in `.menu-buttons`. Move progress, cue shop, recharge, settings, and history into a `.menu-secondary-actions` block below the growth overview.

Add hidden overlays:

```html
<section id="history-panel" class="history-panel-overlay" hidden>
  <div class="history-panel-dialog">
    <div class="history-panel-header">
      <h2 id="history-title">对局历史</h2>
      <button id="history-close" type="button" aria-label="Close">&times;</button>
    </div>
    <ul id="history-list" class="history-list"></ul>
    <div id="history-detail" class="history-detail" hidden></div>
  </div>
</section>

<section id="settings-panel" class="settings-panel-overlay" hidden>
  <div class="settings-panel-dialog">
    <div class="settings-panel-header">
      <h2 id="settings-title">设置</h2>
      <button id="settings-close" type="button" aria-label="Close">&times;</button>
    </div>
    <label>
      <span id="settings-sensitivity-label">瞄准灵敏度</span>
      <select id="settings-sensitivity">
        <option value="fine">精细</option>
        <option value="normal">标准</option>
        <option value="fast">快速</option>
      </select>
    </label>
    <label>
      <span id="settings-power-step-label">力度步进</span>
      <input id="settings-power-step" type="number" min="1" max="20" value="5" />
    </label>
    <label>
      <input id="settings-power-lock" type="checkbox" />
      <span id="settings-power-lock-label">锁定力度</span>
    </label>
  </div>
</section>
```

- [ ] **Step 4: Render history in main.ts**

Add `showHistoryPanel`, `hideHistoryPanel`, and `renderHistoryPanel(stats)`. Display recent match rows and a detail panel with shot history when present. Use old-record fallback text when `shotHistory` is absent.

- [ ] **Step 5: Render settings and persist controls**

Add settings listeners in `main.ts`. Persist settings in localStorage under `pool.aimControlSettings.v1` and pass them into new games through Phaser registry:

```ts
game.registry.set('aimControlSettings', readAimControlSettings());
```

In `PoolScene.create/init`, read the registry value and use it for keyboard controls.

- [ ] **Step 6: Add CSS**

Style `.menu-secondary-actions`, `.history-panel-overlay`, `.settings-panel-overlay`, and dialogs in the same restrained modal style as growth/cue shop panels.

- [ ] **Step 7: Run tests and build**

Run: `npx vitest run src/game/i18n.test.ts src/main.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add index.html src/main.ts src/game/i18n.ts src/styles.css src/game/i18n.test.ts src/main.test.ts
git commit -m "feat(ui): add history and control settings panels"
```

---

## Task 8: Full Verification

**Files:**
- No source edits unless verification exposes failures.

- [ ] **Step 1: Run full tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Manual browser smoke**

Run dev server: `npm run dev -- --port 5173`

Open: `http://127.0.0.1:5173`

Smoke checks:

- Main menu primary actions still start games.
- Settings opens/closes and persists aim settings.
- History opens/closes and shows recent-match empty state.
- AI mode starts and AI still takes a turn.
- Online code compiles; manual two-account online rematch requires Supabase environment and should be checked when credentials are available.

- [ ] **Step 4: Runtime cleanup**

Stop the dev server started in Step 3 unless leaving it running for user testing and explicitly report URL/PID.

- [ ] **Step 5: Final status**

Report changed areas, verification evidence, and any manual checks that could not be completed locally.
