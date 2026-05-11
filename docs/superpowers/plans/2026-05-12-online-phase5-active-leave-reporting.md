# Phase 5: Online Active Leave Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 当本端玩家关标签 / 刷新 / 浏览器后退 / 点应用内「返回」按钮离开对局时，对方在 < 1 秒内进入结算画面，而不是现在这样要等 30 秒心跳超时。

**Architecture:** 新增一个薄模块 `leaveReporter.ts` 封装 `pagehide` + `beforeunload` 事件监听（带去重）。`PoolScene.initOnlineMode` 创建它，触发时调 `reportOnlineLeave()` 发 `game_over(disconnect, winner=opponentIndex)`。应用内「返回」按钮路径已走 Phaser `SHUTDOWN` 事件，复用现有 handler 在 `cleanupOnlineMode` 之前也调一次 `reportOnlineLeave()`，覆盖所有路径。30 秒心跳兜底不改，作为消息发不出时的 degrade 行为。

**Tech Stack:** TypeScript 5.9, Vitest 3.2（node 环境，不用 jsdom — 用注入的 EventTarget）, Phaser 3.90, Supabase Realtime。

**Spec:** [docs/superpowers/specs/2026-05-12-online-phase5-active-leave-reporting-design.md](../specs/2026-05-12-online-phase5-active-leave-reporting-design.md)

### Refinements vs spec

Spec 提到「jsdom 下 dispatchEvent」测 leaveReporter。项目未装 jsdom；本 plan 改为向 `createLeaveReporter` 注入一个 `EventTarget`（Node 18+ 原生），测试里用 `new EventTarget()` + `dispatchEvent(new Event('pagehide'))`，零新依赖。生产代码默认用 `window`。

Spec 提到「Scene 在 `startOnlineGame()` 挂一次 SHUTDOWN 监听」。实际 PoolScene 已在 create 方法内（`src/game/PoolScene.ts` 约第 266 行）有 SHUTDOWN handler 并在末尾调 `cleanupOnlineMode()`。refinement：`reportOnlineLeave()` 调用放在 SHUTDOWN handler **现有的 `cleanupOnlineMode()` 之前**即可，无需新增 `once`。

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/online/leaveReporter.ts` | Create | `pagehide` + `beforeunload` 事件封装 + 去重 + dispose |
| `src/online/leaveReporter.test.ts` | Create | leaveReporter 5 个单元测试 |
| `src/game/PoolScene.ts` | Modify | 新增 `leaveReporter` 字段 + `reportOnlineLeave()` 方法；在 `initOnlineMode` 创建 reporter；在 SHUTDOWN handler 的 `cleanupOnlineMode` 前调用 `reportOnlineLeave`；在 `cleanupOnlineMode` 里 dispose reporter |
| `src/game/PoolScene.online.test.ts` | Modify | 扩展 `ShotHandlerHarness`，新增 4 个 `reportOnlineLeave` 测试 |

无 DB 迁移、无 Edge Function、无新 npm 依赖。

---

## Task 1: Create leaveReporter module (TDD)

**Files:**
- Create: `src/online/leaveReporter.ts`
- Test:   `src/online/leaveReporter.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/online/leaveReporter.test.ts` with this exact content:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createLeaveReporter } from './leaveReporter';

describe('createLeaveReporter', () => {
  it('calls onLeave when pagehide fires', () => {
    const target = new EventTarget();
    const onLeave = vi.fn();
    createLeaveReporter({ onLeave, target });

    target.dispatchEvent(new Event('pagehide'));

    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('calls onLeave when beforeunload fires', () => {
    const target = new EventTarget();
    const onLeave = vi.fn();
    createLeaveReporter({ onLeave, target });

    target.dispatchEvent(new Event('beforeunload'));

    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('only calls onLeave once even if pagehide then beforeunload both fire', () => {
    const target = new EventTarget();
    const onLeave = vi.fn();
    createLeaveReporter({ onLeave, target });

    target.dispatchEvent(new Event('pagehide'));
    target.dispatchEvent(new Event('beforeunload'));

    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('does not call onLeave after dispose', () => {
    const target = new EventTarget();
    const onLeave = vi.fn();
    const reporter = createLeaveReporter({ onLeave, target });

    reporter.dispose();
    target.dispatchEvent(new Event('pagehide'));
    target.dispatchEvent(new Event('beforeunload'));

    expect(onLeave).not.toHaveBeenCalled();
  });

  it('dispose is idempotent', () => {
    const target = new EventTarget();
    const onLeave = vi.fn();
    const reporter = createLeaveReporter({ onLeave, target });

    reporter.dispose();
    expect(() => reporter.dispose()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/online/leaveReporter.test.ts`

Expected: FAIL with `Cannot find module './leaveReporter'` or `createLeaveReporter is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/online/leaveReporter.ts` with this exact content:

```ts
export interface LeaveReporter {
  dispose(): void;
}

export interface LeaveReporterOptions {
  onLeave: () => void;
  target?: EventTarget;
}

export function createLeaveReporter(opts: LeaveReporterOptions): LeaveReporter {
  const target: EventTarget = opts.target ?? window;
  let fired = false;
  let disposed = false;

  const handler = (): void => {
    if (fired || disposed) return;
    fired = true;
    try {
      opts.onLeave();
    } catch {
      // swallow; page is unloading, logging is unreliable
    }
  };

  target.addEventListener('pagehide', handler);
  target.addEventListener('beforeunload', handler);

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      target.removeEventListener('pagehide', handler);
      target.removeEventListener('beforeunload', handler);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/online/leaveReporter.test.ts`

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/online/leaveReporter.ts src/online/leaveReporter.test.ts
git commit -m "feat(online): add leaveReporter for pagehide/beforeunload dedup"
```

---

## Task 2: Add reportOnlineLeave method with guards (TDD)

**Files:**
- Modify: `src/game/PoolScene.ts` — add private method `reportOnlineLeave()`
- Test:   `src/game/PoolScene.online.test.ts` — extend harness type, add 4 cases

- [ ] **Step 1: Extend the harness type**

Open `src/game/PoolScene.online.test.ts`. In the `ShotHandlerHarness` type (around line 22), add this field alongside the other method fields (e.g., after `restartHandler: () => void;`):

```ts
  reportOnlineLeave: () => void;
```

No changes to `createOnlineSceneHarness()` body — `reportOnlineLeave` is a real method on PoolScene, tests will call it directly via `scene.reportOnlineLeave()`.

- [ ] **Step 2: Add 4 failing test cases**

At the end of the existing `describe('PoolScene online turn state', ...)` block (the closing `});` is currently around line 187), add this **nested** describe block **inside** it, right before its closing `});`:

```ts
  describe('reportOnlineLeave', () => {
    it('sends game_over(disconnect, winner=opponentIndex) when in-game', () => {
      const scene = createOnlineSceneHarness();
      const send = vi.fn();
      scene.onlineChannel = { send };
      scene.onlineState = transitionToMyTurn(scene.onlineState);

      scene.reportOnlineLeave();

      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith({
        type: 'game_over',
        reason: 'disconnect',
        winner: 1,
      });
      expect(scene.onlineState.phase).toBe('game_over');
    });

    it('is a no-op when phase is already game_over', () => {
      const scene = createOnlineSceneHarness();
      const send = vi.fn();
      scene.onlineChannel = { send };
      scene.onlineState = {
        ...scene.onlineState,
        phase: 'game_over',
      };

      scene.reportOnlineLeave();

      expect(send).not.toHaveBeenCalled();
    });

    it('is a no-op when roomInfo is null (local mode)', () => {
      const scene = createOnlineSceneHarness();
      const send = vi.fn();
      scene.onlineChannel = { send };
      scene.roomInfo = null;

      expect(() => scene.reportOnlineLeave()).not.toThrow();
      expect(send).not.toHaveBeenCalled();
    });

    it('is a no-op when onlineChannel is null', () => {
      const scene = createOnlineSceneHarness();
      scene.onlineChannel = null;

      expect(() => scene.reportOnlineLeave()).not.toThrow();
    });
  });
```

Note: `scene.roomInfo.isHost` is `true` in the harness, so `myIndex = 0` and `opponentIndex = 1`. That's why the first test expects `winner: 1`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/game/PoolScene.online.test.ts`

Expected: 4 new tests FAIL with `scene.reportOnlineLeave is not a function`.

- [ ] **Step 4: Implement `reportOnlineLeave` on PoolScene**

Open `src/game/PoolScene.ts`. Locate `handleOpponentDisconnect` (around line 2083 — search for `private handleOpponentDisconnect()`). Add `reportOnlineLeave` as a new private method **right before** `handleOpponentDisconnect`:

```ts
  private reportOnlineLeave(): void {
    if (!this.roomInfo) return;
    if (!this.onlineChannel) return;
    if (!this.onlineState || this.onlineState.phase === 'game_over') return;

    const myIndex: 0 | 1 = this.roomInfo.isHost ? 0 : 1;
    const opponentIndex: 0 | 1 = myIndex === 0 ? 1 : 0;

    try {
      this.onlineChannel.send({
        type: 'game_over',
        reason: 'disconnect',
        winner: opponentIndex,
      });
    } catch {
      // unloading; WS may be torn down. 30s heartbeat timeout is the fallback.
    }
    this.onlineState = transitionToGameOver(this.onlineState, opponentIndex, 'disconnect');
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/game/PoolScene.online.test.ts`

Expected: All existing tests + 4 new tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/PoolScene.ts src/game/PoolScene.online.test.ts
git commit -m "feat(online): add reportOnlineLeave method with idempotent guards"
```

---

## Task 3: Wire leaveReporter into PoolScene lifecycle

**Files:**
- Modify: `src/game/PoolScene.ts` — import, field, `initOnlineMode` wiring, SHUTDOWN hook, cleanup dispose

No new unit tests — this is pure wiring. Logic is already covered by Task 1 (leaveReporter) + Task 2 (reportOnlineLeave). End-to-end behavior verified in Task 5 manual scenarios.

- [ ] **Step 1: Add the import**

Open `src/game/PoolScene.ts`. Find the existing imports from `'../online/...'` (search for `from '../online/`). Add this line next to the others:

```ts
import { createLeaveReporter, type LeaveReporter } from '../online/leaveReporter';
```

- [ ] **Step 2: Add the class field**

Find the field `private matchStartedAt: number | null = null;` (around line 200 — search for `matchStartedAt: number`). Add the new field on the line right after it:

```ts
  private matchStartedAt: number | null = null;
  private leaveReporter: LeaveReporter | null = null;
```

- [ ] **Step 3: Create leaveReporter in `initOnlineMode`**

Find `private initOnlineMode(): void` (around line 1749). Current end of method:

```ts
    this.onlineChannel = new GameChannel();
    this.onlineChannel.join({
      roomId: this.roomInfo.roomId,
      userId: this.roomInfo.isHost ? 'host' : 'guest',
      callbacks: {
        onMessage: (msg) => this.handleOnlineMessage(msg),
        onPresence: (event) => this.handleOnlinePresence(event),
      },
    });
  }
```

Add the leaveReporter creation after the `join(...)` call, **still inside** the method:

```ts
    this.onlineChannel = new GameChannel();
    this.onlineChannel.join({
      roomId: this.roomInfo.roomId,
      userId: this.roomInfo.isHost ? 'host' : 'guest',
      callbacks: {
        onMessage: (msg) => this.handleOnlineMessage(msg),
        onPresence: (event) => this.handleOnlinePresence(event),
      },
    });
    this.leaveReporter = createLeaveReporter({
      onLeave: () => this.reportOnlineLeave(),
    });
  }
```

- [ ] **Step 4: Trigger reportOnlineLeave in the existing SHUTDOWN handler BEFORE cleanup**

Find the existing SHUTDOWN handler in `PoolScene.create()` (around line 266). Current code:

```ts
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.restartButton?.removeEventListener('click', this.restartHandler);
      this.languageButton?.removeEventListener('click', this.languageHandler);
      this.victoryRestartButton?.removeEventListener('click', this.victoryRestartHandler);
      this.challengeBtn?.removeEventListener('click', this.challengeBtnHandler);
      document.querySelector<HTMLButtonElement>('#rematch-request')?.removeEventListener('click', this.rematchRequestHandler);
      document.querySelector<HTMLButtonElement>('#rematch-leave')?.removeEventListener('click', this.rematchLeaveHandler);
      document.querySelector<HTMLButtonElement>('#rematch-cancel')?.removeEventListener('click', this.rematchCancelHandler);
      document.querySelector<HTMLButtonElement>('#rematch-accept')?.removeEventListener('click', this.rematchAcceptHandler);
      document.querySelector<HTMLButtonElement>('#rematch-decline')?.removeEventListener('click', this.rematchDeclineHandler);
      if (this.rematchCountdownTimer) {
        clearInterval(this.rematchCountdownTimer);
        this.rematchCountdownTimer = null;
      }
      this.unbindSpinControl();
      this.unbindChatUI();
      this.cleanupOnlineMode();
    });
```

Insert `this.reportOnlineLeave();` as the **first** statement inside the arrow body:

```ts
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.reportOnlineLeave();
      this.restartButton?.removeEventListener('click', this.restartHandler);
      // ... everything else unchanged ...
      this.cleanupOnlineMode();
    });
```

Order matters: `reportOnlineLeave()` must run **before** `cleanupOnlineMode()` because cleanup nulls `onlineChannel`, and reportOnlineLeave needs the channel to send.

- [ ] **Step 5: Dispose leaveReporter in `cleanupOnlineMode`**

Find `private cleanupOnlineMode(): void` (around line 2304). Current start:

```ts
  private cleanupOnlineMode(): void {
    if (this.onlineChannel) {
      this.onlineChannel.leave();
      this.onlineChannel = null;
    }
    this.onlineState = null;
    this.matchStartedAt = null;
    this.pendingResult = null;
```

Add the `leaveReporter` dispose block right after the `onlineChannel` null-out:

```ts
  private cleanupOnlineMode(): void {
    if (this.onlineChannel) {
      this.onlineChannel.leave();
      this.onlineChannel = null;
    }
    if (this.leaveReporter) {
      this.leaveReporter.dispose();
      this.leaveReporter = null;
    }
    this.onlineState = null;
    this.matchStartedAt = null;
    this.pendingResult = null;
```

- [ ] **Step 6: Run all tests to verify zero regression**

Run: `npm test`

Expected: Everything PASS. No existing test should break.

- [ ] **Step 7: Run build to verify TypeScript compiles**

Run: `npm run build`

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add src/game/PoolScene.ts
git commit -m "feat(online): wire leaveReporter into PoolScene lifecycle"
```

---

## Task 4: Final build + regression verification

**Files:** None (verification only).

- [ ] **Step 1: Full test run**

Run: `npm test`

Expected: All tests PASS. Zero regressions vs pre-Task-1 baseline.

- [ ] **Step 2: Full build**

Run: `npm run build`

Expected: Build succeeds, no TS errors, no new warnings.

- [ ] **Step 3: If any step 1-2 fails, stop and diagnose**

Do not proceed to manual verification until the build and test suite are green. Per CLAUDE.md 铁律 B: 发现上游假设有误 → 回到最早受影响的任务重来，不就地修补。

---

## Task 5: Manual verification (browser)

**Files:** None (browser testing).

**Setup:** open two Chrome/Edge windows (or one Chrome + one Firefox). Log into account A in one, account B in the other. Both enter the online matchmaking queue and get paired into a match.

- [ ] **Scenario 1: Close tab**

Steps:
1. Start the match; play at least one stroke so both clients are in steady-state.
2. On A: close the browser tab.
3. On B: verify the victory screen appears in **< 1 second** with text "Opponent disconnected".

- [ ] **Scenario 2: Refresh**

Steps:
1. Start a fresh match.
2. On A: press F5.
3. On B: victory screen appears < 1 second with "Opponent disconnected".

- [ ] **Scenario 3: App-internal back button**

Steps:
1. Start a fresh match.
2. On A: click the in-app "← back" button (header `#btn-back`).
3. On B: victory screen appears < 1 second with "Opponent disconnected".

- [ ] **Scenario 4: Heartbeat fallback (regression)**

Steps:
1. Start a fresh match.
2. On A: open DevTools → Network → throttling → **Offline**.
3. On A: close the tab.
4. On B: verify **no** game_over arrives immediately; wait ~30s. Victory screen should appear with "Opponent disconnected" (heartbeat-timeout path still works).

- [ ] **Scenario 5: Already ended (idempotency)**

Steps:
1. Start a fresh match. Play until one side wins normally (sink the 8-ball).
2. Victory screen shows on both sides.
3. On A (on the victory screen): close the tab.
4. On B: verify no console error, no duplicate messages, no state corruption. Victory screen stays as-is.

- [ ] **If any scenario fails**

- Check Supabase Realtime channel frames in DevTools → Network → WS to see whether `game_over(disconnect)` was actually sent.
- Re-check spec acceptance criteria.
- Return to the relevant task.

---

## Self-Review

**Spec coverage check:**
- Goal (< 1s leave reporting) → Task 5 scenarios 1-3
- Trigger source `pagehide` → Task 1 test case 1 + Task 3 step 3 (wiring)
- Trigger source `beforeunload` → Task 1 test case 2 + Task 3 step 3 (wiring)
- Trigger source Phaser `SHUTDOWN` (app-internal back) → Task 3 step 4 + Task 5 scenario 3
- Preconditions (roomInfo / onlineChannel / phase) → Task 2 cases 7, 8, 9
- Winner = opponentIndex → Task 2 case 6
- Two-layer idempotency → Task 1 case 3 (leaveReporter dedup) + Task 2 case 7 (phase guard)
- `try/catch` around `channel.send` → Task 2 step 4
- No `updateOnlineStats` call from `reportOnlineLeave` → Task 2 step 4 (method body intentionally omits it)
- 30s heartbeat fallback unchanged → Task 5 scenario 4 (regression)
- Acceptance criteria → Task 5 scenarios + Task 4 build

All spec sections have a concrete task. Nothing missing.

**Placeholder scan:** no TBD / TODO / "handle edge cases" / "similar to Task N". All code shown in full.

**Type consistency:**
- `LeaveReporter` / `LeaveReporterOptions` / `createLeaveReporter` — identical names in Task 1 and Task 3.
- `reportOnlineLeave` (no args, returns `void`) — same signature in Task 2 and Task 3.
- `transitionToGameOver(state, winner, reason)` — matches existing `src/online/onlineState.ts:49`.
- `GameOverMessage { type: 'game_over'; reason: 'disconnect' | 'surrender'; winner: 0 | 1 }` — matches existing `src/online/types.ts:75`.
- Harness `reportOnlineLeave: () => void` in Task 2 step 1 matches the private method signature added in Task 2 step 4.

Plan is self-consistent.
