# Pool V1.1 And V1.2 Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the playable pool MVP with a realistic wooden cue-stick shot experience, refined table/ball presentation, audio feedback, 15-ball practice, completion state, and local best stroke count.

**Architecture:** Keep Phaser as the rendering and physics host, but move pure gameplay math/state and generated rendering helpers out of `PoolScene.ts`. V1.1 lands visual and shot-feel refinements first; V1.2 then expands rack and practice state without adding competitive 8-ball rules.

**Tech Stack:** Vite, TypeScript, Phaser 3, Matter physics, Vitest, browser `localStorage`.

---

## File Structure

- Modify `src/game/constants.ts`: add 15-ball rack data, ball metadata, cue/power tuning, and refined physics constants.
- Modify `src/game/geometry.ts`: add rack layout and cue pullback helpers.
- Modify `src/game/state.ts`: add mode, completion, best-stroke, and storage-safe helpers.
- Create `src/game/audio.ts`: procedural Web Audio effects with safe no-op behavior.
- Create `src/game/rendering.ts`: Phaser graphics helpers for table, balls, and wooden cue rendering.
- Modify `src/game/PoolScene.ts`: orchestrate refined rendering, cue animation, audio, 15-ball rack, completion, and HUD.
- Modify `index.html`: add compact HUD fields for mode and best strokes.
- Modify `src/styles.css`: refine pool-hall page styling and HUD layout.
- Modify `src/game/geometry.test.ts`: add rack and cue pullback tests.
- Modify `src/game/state.test.ts`: add completion and best-score tests.

## Task 1: Add V1.2 Pure Gameplay Helpers

**Files:**
- Modify: `src/game/constants.ts`
- Modify: `src/game/geometry.ts`
- Modify: `src/game/state.ts`
- Modify: `src/game/geometry.test.ts`
- Modify: `src/game/state.test.ts`

- [ ] **Step 1: Write failing geometry tests**

Add to `src/game/geometry.test.ts`:

```ts
import { createTriangleRack, getCuePullback } from './geometry';

it('creates a non-overlapping 15-ball triangle rack', () => {
  const rack = createTriangleRack({ x: 740, y: 320 }, 15);

  expect(rack).toHaveLength(15);
  for (let i = 0; i < rack.length; i += 1) {
    for (let j = i + 1; j < rack.length; j += 1) {
      expect(Math.hypot(rack[i].x - rack[j].x, rack[i].y - rack[j].y)).toBeGreaterThan(BALL_RADIUS * 2);
    }
  }
});

it('maps shot power to cue pullback distance', () => {
  expect(getCuePullback(0)).toBe(28);
  expect(getCuePullback(0.5)).toBe(82);
  expect(getCuePullback(1)).toBe(136);
});
```

- [ ] **Step 2: Write failing state tests**

Add to `src/game/state.test.ts`:

```ts
import { completeRack, readBestStrokes, writeBestStrokes } from './state';

it('marks a rack complete and records a best stroke count', () => {
  const state = completeRack({ ...createGameState(0), strokes: 7 });

  expect(state.rackComplete).toBe(true);
  expect(state.bestStrokes).toBe(7);
  expect(state.message).toBe('Rack cleared in 7 strokes. Start a new rack when ready.');
});

it('keeps the lower best stroke count', () => {
  const storage = new Map<string, string>();
  const adapter = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  };

  writeBestStrokes(adapter, 9);
  writeBestStrokes(adapter, 12);
  expect(readBestStrokes(adapter)).toBe(9);
  writeBestStrokes(adapter, 6);
  expect(readBestStrokes(adapter)).toBe(6);
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npm test -- src/game/geometry.test.ts src/game/state.test.ts`

Expected: FAIL because `createTriangleRack`, `getCuePullback`, `completeRack`, `readBestStrokes`, and `writeBestStrokes` do not exist.

- [ ] **Step 4: Implement helper functions**

Update `src/game/constants.ts` with:

```ts
export const RACK_CENTER: Vector = {
  x: PLAY_AREA.left + (PLAY_AREA.right - PLAY_AREA.left) * 0.7,
  y: TABLE.height / 2,
};

export const CUE = {
  minPullback: 28,
  maxPullback: 136,
  strikeDurationMs: 120,
};

export const BALLS = Array.from({ length: 15 }, (_, index) => ({
  id: index + 1,
  color: BALL_COLORS[index % BALL_COLORS.length],
}));
```

Update `src/game/geometry.ts` with:

```ts
import { BALL_RADIUS, CUE, TABLE, type Vector } from './constants';

export function createTriangleRack(apex: Vector, count: number): Vector[] {
  const positions: Vector[] = [];
  const horizontalGap = BALL_RADIUS * 2.08;
  const verticalGap = BALL_RADIUS * 2.12;
  let ballIndex = 0;

  for (let row = 0; positions.length < count; row += 1) {
    for (let column = 0; column <= row && positions.length < count; column += 1) {
      positions.push({
        x: apex.x + row * horizontalGap,
        y: apex.y + (column - row / 2) * verticalGap,
      });
      ballIndex += 1;
    }
  }

  return positions;
}

export function getCuePullback(power: number): number {
  const clamped = Math.max(0, Math.min(power, 1));
  return Math.round(CUE.minPullback + (CUE.maxPullback - CUE.minPullback) * clamped);
}
```

Update `src/game/state.ts` with:

```ts
export type StorageAdapter = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const BEST_STROKES_KEY = 'pool.bestStrokes.clearTable';

export type PracticeMode = 'clear-table';

export type GameState = {
  score: number;
  strokes: number;
  remainingTargets: number;
  cueBallPocketed: boolean;
  rackComplete: boolean;
  mode: PracticeMode;
  bestStrokes: number | null;
  message: string;
};

export function readBestStrokes(storage: Pick<StorageAdapter, 'getItem'>): number | null {
  try {
    const value = storage.getItem(BEST_STROKES_KEY);
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function writeBestStrokes(storage: StorageAdapter, strokes: number): number | null {
  const previous = readBestStrokes(storage);
  const next = previous === null ? strokes : Math.min(previous, strokes);
  try {
    storage.setItem(BEST_STROKES_KEY, String(next));
  } catch {
    return previous;
  }
  return next;
}

export function completeRack(state: GameState, bestStrokes = state.bestStrokes): GameState {
  const nextBest = bestStrokes === null ? state.strokes : Math.min(bestStrokes, state.strokes);
  return {
    ...state,
    rackComplete: true,
    bestStrokes: nextBest,
    message: `Rack cleared in ${state.strokes} strokes. Start a new rack when ready.`,
  };
}
```

Update existing state constructors and transitions to set `rackComplete: false`, `mode: 'clear-table'`, and `bestStrokes`.

- [ ] **Step 5: Run tests**

Run: `npm test -- src/game/geometry.test.ts src/game/state.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit helpers**

```bash
git add src/game/constants.ts src/game/geometry.ts src/game/state.ts src/game/geometry.test.ts src/game/state.test.ts
git commit -m "feat: add practice refinement helpers"
```

## Task 2: Add Refined Rendering Helpers

**Files:**
- Create: `src/game/rendering.ts`
- Modify: `src/game/PoolScene.ts`

- [ ] **Step 1: Create rendering helper module**

Create `src/game/rendering.ts` with exported functions:

```ts
import Phaser from 'phaser';
import { BALL_RADIUS, PLAY_AREA, POCKETS, TABLE } from './constants';

export type BallTextureOptions = {
  key: string;
  fill: string;
  label?: string;
};

export function createBallTexture(scene: Phaser.Scene, options: BallTextureOptions): void {
  const size = BALL_RADIUS * 2 + 10;
  const graphics = scene.make.graphics({ x: 0, y: 0 });
  graphics.fillStyle(0x000000, 0.25);
  graphics.fillCircle(size / 2 + 2, size / 2 + 3, BALL_RADIUS);
  graphics.fillStyle(Phaser.Display.Color.HexStringToColor(options.fill).color, 1);
  graphics.fillCircle(size / 2, size / 2, BALL_RADIUS);
  graphics.fillStyle(0xffffff, 0.55);
  graphics.fillCircle(size / 2 - 5, size / 2 - 6, BALL_RADIUS * 0.32);
  if (options.label) {
    graphics.fillStyle(0xf6ead6, 0.95);
    graphics.fillCircle(size / 2, size / 2, BALL_RADIUS * 0.42);
    const text = scene.add.text(0, 0, options.label, {
      color: '#1c130d',
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      fontStyle: 'bold',
    });
    text.setOrigin(0.5);
    const texture = scene.textures.createCanvas(options.key, size, size);
    graphics.generateTexture(`${options.key}-base`, size, size);
    const canvas = texture?.getSourceImage() as HTMLCanvasElement | undefined;
    const context = canvas?.getContext('2d');
    const base = scene.textures.get(`${options.key}-base`).getSourceImage() as HTMLCanvasElement;
    context?.drawImage(base, 0, 0);
    context?.fillText(options.label, size / 2 - 3, size / 2 + 4);
    texture?.refresh();
    text.destroy();
    graphics.destroy();
    scene.textures.remove(`${options.key}-base`);
    return;
  }
  graphics.lineStyle(1, 0xffffff, 0.18);
  graphics.strokeCircle(size / 2, size / 2, BALL_RADIUS - 1);
  graphics.generateTexture(options.key, size, size);
  graphics.destroy();
}

export function drawPoolHall(scene: Phaser.Scene): void {
  const room = scene.add.graphics().setDepth(0);
  room.fillGradientStyle(0x21150f, 0x21150f, 0x090807, 0x090807, 1);
  room.fillRect(0, 0, TABLE.width, TABLE.height);
  room.fillStyle(0xe8b56c, 0.14);
  room.fillEllipse(TABLE.width / 2, 46, 560, 150);
}

export function drawRefinedTable(scene: Phaser.Scene): void {
  const table = scene.add.graphics().setDepth(1);
  table.fillStyle(0x1f120a, 1);
  table.fillRoundedRect(36, 38, TABLE.width - 72, TABLE.height - 76, 38);
  table.lineStyle(10, 0x080504, 0.9);
  table.strokeRoundedRect(36, 38, TABLE.width - 72, TABLE.height - 76, 38);

  table.fillGradientStyle(0x7b4925, 0x4b2815, 0x32180d, 0x6a3a1c, 1);
  table.fillRoundedRect(54, 56, TABLE.width - 108, TABLE.height - 112, 28);
  table.lineStyle(3, 0xd39a55, 0.35);
  table.strokeRoundedRect(62, 64, TABLE.width - 124, TABLE.height - 128, 22);

  table.fillStyle(0x0b6243, 1);
  table.fillRoundedRect(PLAY_AREA.left, PLAY_AREA.top, PLAY_AREA.right - PLAY_AREA.left, PLAY_AREA.bottom - PLAY_AREA.top, 16);

  table.fillStyle(0xffffff, 0.022);
  for (let y = PLAY_AREA.top + 12; y < PLAY_AREA.bottom; y += 12) {
    table.fillRect(PLAY_AREA.left + 12, y, PLAY_AREA.right - PLAY_AREA.left - 24, 1);
  }

  for (const pocket of POCKETS) {
    table.fillStyle(0x000000, 1);
    table.fillCircle(pocket.x, pocket.y, TABLE.pocketRadius + 4);
    table.lineStyle(4, 0x241108, 0.9);
    table.strokeCircle(pocket.x, pocket.y, TABLE.pocketRadius + 1);
  }
}

export function drawCueStick(graphics: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, pullback: number): void {
  graphics.clear();
  graphics.setDepth(6);
  graphics.save();
  graphics.translateCanvas(x, y);
  graphics.rotateCanvas(angle);
  graphics.lineStyle(10, 0x000000, 0.22);
  graphics.beginPath();
  graphics.moveTo(-pullback - 330, 8);
  graphics.lineTo(-pullback - 12, 2);
  graphics.strokePath();
  graphics.lineStyle(8, 0x6f421f, 1);
  graphics.beginPath();
  graphics.moveTo(-pullback - 330, 0);
  graphics.lineTo(-pullback - 34, 0);
  graphics.strokePath();
  graphics.lineStyle(4, 0xd7b071, 1);
  graphics.beginPath();
  graphics.moveTo(-pullback - 220, -1);
  graphics.lineTo(-pullback - 34, -1);
  graphics.strokePath();
  graphics.lineStyle(7, 0xd8d0bd, 1);
  graphics.beginPath();
  graphics.moveTo(-pullback - 34, 0);
  graphics.lineTo(-pullback - 16, 0);
  graphics.strokePath();
  graphics.lineStyle(6, 0x2b1a0f, 1);
  graphics.beginPath();
  graphics.moveTo(-pullback - 16, 0);
  graphics.lineTo(-pullback - 6, 0);
  graphics.strokePath();
  graphics.restore();
}
```

- [ ] **Step 2: Wire table and ball rendering helpers**

In `src/game/PoolScene.ts`, replace inline `createBallTexture`, `drawRoom`, and `drawTable` code with calls to `createBallTexture`, `drawPoolHall`, and `drawRefinedTable`.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Commit rendering split**

```bash
git add src/game/rendering.ts src/game/PoolScene.ts
git commit -m "style: refine pool rendering helpers"
```

## Task 3: Add Wooden Cue Stick And Strike Animation

**Files:**
- Modify: `src/game/PoolScene.ts`
- Modify: `src/game/geometry.ts`
- Modify: `src/game/constants.ts`

- [ ] **Step 1: Add cue graphics state**

In `PoolScene`, add a `cueGraphics` graphics object, a `strikeLocked` boolean, and a current cue direction cache. Render the cue during aim via `drawCueStick`.

- [ ] **Step 2: Delay impulse until strike animation completes**

Change `shootFromAim()` so releasing a valid shot:

```ts
this.strikeLocked = true;
this.tweens.addCounter({
  from: getCuePullback(power),
  to: 12,
  duration: CUE.strikeDurationMs,
  ease: 'Cubic.easeIn',
  onUpdate: (tween) => {
    drawCueStick(this.cueGraphics, cue.x, cue.y, cueAngle, tween.getValue());
  },
  onComplete: () => {
    this.cueGraphics.clear();
    this.applyCueImpulse(pull, dragDistance, power);
    this.strikeLocked = false;
  },
});
```

Extract the existing force application into `applyCueImpulse(pull, dragDistance, power)`.

- [ ] **Step 3: Keep input locked during strike animation**

Update `canAim()` to return false when `strikeLocked` is true.

- [ ] **Step 4: Run tests and build**

Run: `npm test && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit cue animation**

```bash
git add src/game/PoolScene.ts src/game/geometry.ts src/game/constants.ts
git commit -m "feat: add wooden cue strike animation"
```

## Task 4: Add Audio Feedback

**Files:**
- Create: `src/game/audio.ts`
- Modify: `src/game/PoolScene.ts`

- [ ] **Step 1: Create safe procedural audio**

Create `src/game/audio.ts`:

```ts
export type PoolSound = 'cue' | 'collision' | 'rail' | 'pocket';

export class PoolAudio {
  private context: AudioContext | null = null;
  private lastSoundAt = new Map<PoolSound, number>();

  unlock(): void {
    if (this.context) return;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    this.context = new AudioContextCtor();
  }

  play(sound: PoolSound): void {
    if (!this.context) return;
    const now = performance.now();
    const last = this.lastSoundAt.get(sound) ?? 0;
    if (now - last < 55) return;
    this.lastSoundAt.set(sound, now);

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.connect(gain);
    gain.connect(this.context.destination);

    const time = this.context.currentTime;
    const settings = {
      cue: { frequency: 150, gain: 0.12, duration: 0.055 },
      collision: { frequency: 420, gain: 0.045, duration: 0.035 },
      rail: { frequency: 230, gain: 0.04, duration: 0.04 },
      pocket: { frequency: 95, gain: 0.14, duration: 0.12 },
    }[sound];

    oscillator.frequency.setValueAtTime(settings.frequency, time);
    gain.gain.setValueAtTime(settings.gain, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + settings.duration);
    oscillator.start(time);
    oscillator.stop(time + settings.duration);
  }
}
```

Add `declare global { interface Window { webkitAudioContext?: typeof AudioContext; } }` if TypeScript requires it.

- [ ] **Step 2: Wire audio into scene**

In `PoolScene`, instantiate `PoolAudio`. On first pointer down, call `audio.unlock()`. Play `cue` when impulse is applied, `pocket` when a ball pockets, and `collision` on Matter collision events with throttling through `PoolAudio`.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Commit audio**

```bash
git add src/game/audio.ts src/game/PoolScene.ts
git commit -m "feat: add pool sound feedback"
```

## Task 5: Add 15-Ball Practice And Completion State

**Files:**
- Modify: `src/game/constants.ts`
- Modify: `src/game/PoolScene.ts`
- Modify: `src/game/state.ts`
- Modify: `index.html`
- Modify: `src/styles.css`

- [ ] **Step 1: Use 15 target balls**

Replace `TARGET_STARTS` usage with `createTriangleRack(RACK_CENTER, 15)` in scene setup. Create target ball textures using `BALLS` metadata and labels.

- [ ] **Step 2: Add best and mode HUD**

Update `index.html` HUD:

```html
<span id="mode">Clear Table</span>
<span id="score">Score 0</span>
<span id="strokes">Strokes 0</span>
<span id="best">Best --</span>
<span id="remaining">Balls 0</span>
<button id="restart" type="button">New Rack</button>
```

Update `updateHud()` to write `mode`, `best`, and completion message.

- [ ] **Step 3: Complete rack and persist best**

When `remainingTargets` becomes zero and the table settles, call `writeBestStrokes(window.localStorage, this.state.strokes)` and update state through `completeRack`.

- [ ] **Step 4: Keep restart/new rack simple**

Restart should create a new 15-ball rack and preserve loaded best stroke count.

- [ ] **Step 5: Run tests and build**

Run: `npm test && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit practice mode**

```bash
git add index.html src/styles.css src/game/constants.ts src/game/PoolScene.ts src/game/state.ts
git commit -m "feat: add clear-table practice mode"
```

## Task 6: Browser Smoke Verification

**Files:**
- No planned code changes unless smoke verification exposes a defect.

- [ ] **Step 1: Start dev server**

Run: `npm run dev -- --port 5173`

Expected: Vite serves `http://127.0.0.1:5173/`.

- [ ] **Step 2: Visual smoke**

Use a browser or headless Chrome screenshot to verify:

- refined table renders;
- balls render as 15-ball rack;
- wooden cue appears while aiming;
- HUD shows mode, strokes, best, remaining balls, and New Rack.

- [ ] **Step 3: Interaction smoke**

Verify:

- dragging from cue ball shows cue pullback;
- releasing triggers cue strike and cue ball movement;
- Restart/New Rack resets ball positions and strokes;
- no console errors appear during normal play.

- [ ] **Step 4: Final commands**

Run:

```bash
npm test
npm run build
git status --short
```

Expected: tests pass, build passes, and only intentional changes remain.

- [ ] **Step 5: Runtime cleanup**

Stop the Vite dev server and any browser helper processes started for smoke verification.
