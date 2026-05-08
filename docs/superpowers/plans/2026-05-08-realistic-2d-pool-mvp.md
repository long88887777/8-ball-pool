# Realistic 2D Pool MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-playable realistic 2D pool practice MVP with drag aiming, power, physics, pocket scoring, cue-ball reset, restart, and a compact HUD.

**Architecture:** Use Vite with TypeScript and Phaser 3. Keep pure game math/state in small tested modules, then compose rendering, input, Matter physics, pocket detection, and HUD updates inside one Phaser scene.

**Tech Stack:** Vite, TypeScript, Phaser 3, Vitest, HTML/CSS.

---

## File Structure

- Create `package.json`: scripts and dependencies.
- Create `index.html`: root HTML shell.
- Create `src/main.ts`: Phaser bootstrapping.
- Create `src/styles.css`: page-level realistic pool-hall styling.
- Create `src/game/constants.ts`: table size, ball size, pockets, physics tuning, initial layout.
- Create `src/game/geometry.ts`: pocket distance, power clamping, readiness helpers.
- Create `src/game/state.ts`: score, strokes, remaining balls, messages.
- Create `src/game/PoolScene.ts`: Phaser scene for table, balls, input, pockets, and HUD events.
- Create `src/game/geometry.test.ts`: Vitest tests for geometry helpers.
- Create `src/game/state.test.ts`: Vitest tests for state helpers.
- Create `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`: TypeScript and test configuration.

## Task 1: Scaffold Vite Phaser App

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/styles.css`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`

- [ ] **Step 1: Create package and config files**

Create `package.json`:

```json
{
  "name": "realistic-2d-pool",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "preview": "vite preview --host 127.0.0.1"
  },
  "dependencies": {
    "phaser": "^3.90.0"
  },
  "devDependencies": {
    "@vitejs/plugin-basic-ssl": "^2.1.0",
    "typescript": "^5.9.3",
    "vite": "^7.1.12",
    "vitest": "^3.2.4"
  }
}
```

Create `tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": false,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

Create `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true,
    "types": ["vitest/globals"]
  },
  "include": ["vite.config.ts", "src"]
}
```

Create `vite.config.ts`:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
});
```

- [ ] **Step 2: Create HTML and initial bootstrap**

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Realistic 2D Pool</title>
  </head>
  <body>
    <main class="game-shell">
      <section class="game-header" aria-label="Game status">
        <div>
          <p class="eyebrow">Practice Table</p>
          <h1>Realistic 2D Pool</h1>
        </div>
        <div class="hud" aria-live="polite">
          <span id="score">Score 0</span>
          <span id="strokes">Strokes 0</span>
          <span id="remaining">Balls 0</span>
          <button id="restart" type="button">Restart</button>
        </div>
      </section>
      <section class="table-frame" aria-label="Playable pool table">
        <div id="game"></div>
      </section>
      <p id="message" class="message">Drag from the cue ball to aim. Release to shoot.</p>
    </main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Create `src/main.ts`:

```ts
import Phaser from 'phaser';
import './styles.css';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 1100,
  height: 640,
  backgroundColor: '#10100e',
  scene: [],
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

new Phaser.Game(config);
```

Create `src/styles.css`:

```css
:root {
  color: #f6eee0;
  background: #0e0c0a;
  font-family: Georgia, 'Times New Roman', serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background:
    radial-gradient(circle at 50% 0%, rgba(225, 174, 98, 0.22), transparent 34rem),
    linear-gradient(180deg, #1a1511 0%, #0d0b09 100%);
}

button {
  font: inherit;
}

.game-shell {
  width: min(1180px, calc(100vw - 32px));
  min-height: 100vh;
  margin: 0 auto;
  padding: 22px 0 24px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 14px;
}

.game-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 18px;
}

.eyebrow {
  margin: 0 0 4px;
  color: #c6a16d;
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: clamp(28px, 4vw, 46px);
  line-height: 1;
  font-weight: 600;
}

.hud {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 15px;
}

.hud span,
.hud button {
  min-height: 36px;
  padding: 8px 12px;
  border: 1px solid rgba(230, 199, 151, 0.28);
  border-radius: 6px;
  background: rgba(20, 15, 11, 0.68);
  color: #f5ead8;
}

.hud button {
  cursor: pointer;
}

.hud button:hover {
  background: rgba(80, 52, 27, 0.82);
}

.table-frame {
  min-height: 0;
  display: grid;
  place-items: center;
  border: 1px solid rgba(220, 173, 102, 0.18);
  background:
    radial-gradient(circle at 50% 16%, rgba(255, 214, 141, 0.18), transparent 34rem),
    rgba(5, 5, 4, 0.48);
  box-shadow: inset 0 0 80px rgba(0, 0, 0, 0.55);
}

#game {
  width: 100%;
  max-width: 1100px;
  aspect-ratio: 1100 / 640;
}

#game canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.message {
  margin: 0;
  min-height: 24px;
  color: #d7c6aa;
  text-align: center;
  font-size: 15px;
}

@media (max-width: 760px) {
  .game-header {
    align-items: start;
    flex-direction: column;
  }

  .hud {
    justify-content: flex-start;
  }
}
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`

Expected: dependencies install and `package-lock.json` is created.

- [ ] **Step 4: Build smoke check**

Run: `npm run build`

Expected: build succeeds even though no scene renders yet.

- [ ] **Step 5: Commit scaffold**

```bash
git add package.json package-lock.json index.html src/main.ts src/styles.css tsconfig.json tsconfig.node.json vite.config.ts
git commit -m "feat: scaffold phaser pool app"
```

## Task 2: Add Tested Game Helpers

**Files:**
- Create: `src/game/constants.ts`
- Create: `src/game/geometry.ts`
- Create: `src/game/state.ts`
- Create: `src/game/geometry.test.ts`
- Create: `src/game/state.test.ts`

- [ ] **Step 1: Write geometry tests first**

Create `src/game/geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BALL_RADIUS, POCKETS, TABLE } from './constants';
import { clampShotPower, isInPocket, isTableReady } from './geometry';

describe('geometry helpers', () => {
  it('detects a ball inside a pocket radius', () => {
    const pocket = POCKETS[0];
    expect(isInPocket({ x: pocket.x, y: pocket.y }, POCKETS)).toBe(true);
    expect(isInPocket({ x: pocket.x + BALL_RADIUS * 4, y: pocket.y }, POCKETS)).toBe(false);
  });

  it('clamps shot power from drag distance', () => {
    expect(clampShotPower(0)).toBe(0);
    expect(clampShotPower(90)).toBe(0.45);
    expect(clampShotPower(900)).toBe(1);
  });

  it('detects whether all balls are below the ready speed', () => {
    expect(isTableReady([0, 0.01, 0.03])).toBe(true);
    expect(isTableReady([0, TABLE.readySpeed + 0.01])).toBe(false);
  });
});
```

- [ ] **Step 2: Write state tests first**

Create `src/game/state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createGameState, pocketCueBall, pocketTargetBall, recordStroke, restartGame } from './state';

describe('game state helpers', () => {
  it('starts with score, strokes, and remaining targets', () => {
    const state = createGameState(6);
    expect(state).toMatchObject({
      score: 0,
      strokes: 0,
      remainingTargets: 6,
      cueBallPocketed: false,
    });
  });

  it('records strokes and target pockets', () => {
    let state = createGameState(2);
    state = recordStroke(state);
    state = pocketTargetBall(state);
    expect(state.score).toBe(100);
    expect(state.strokes).toBe(1);
    expect(state.remainingTargets).toBe(1);
  });

  it('handles cue-ball pocket penalty', () => {
    const state = pocketCueBall(createGameState(3));
    expect(state.cueBallPocketed).toBe(true);
    expect(state.strokes).toBe(1);
    expect(state.message).toBe('Cue ball pocketed. It will reset after the table stops.');
  });

  it('restarts with a fresh target count', () => {
    const state = restartGame(5);
    expect(state.score).toBe(0);
    expect(state.strokes).toBe(0);
    expect(state.remainingTargets).toBe(5);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`

Expected: FAIL because `constants`, `geometry`, and `state` modules do not exist yet.

- [ ] **Step 4: Implement constants**

Create `src/game/constants.ts`:

```ts
export type Vector = {
  x: number;
  y: number;
};

export const TABLE = {
  width: 1100,
  height: 640,
  rail: 74,
  cushion: 38,
  pocketRadius: 34,
  readySpeed: 0.045,
  minShotPower: 0.06,
  maxDragDistance: 200,
  maxImpulse: 0.052,
};

export const BALL_RADIUS = 15;

export const PLAY_AREA = {
  left: TABLE.rail,
  right: TABLE.width - TABLE.rail,
  top: TABLE.rail,
  bottom: TABLE.height - TABLE.rail,
};

export const POCKETS: Vector[] = [
  { x: PLAY_AREA.left + 4, y: PLAY_AREA.top + 4 },
  { x: TABLE.width / 2, y: PLAY_AREA.top - 4 },
  { x: PLAY_AREA.right - 4, y: PLAY_AREA.top + 4 },
  { x: PLAY_AREA.left + 4, y: PLAY_AREA.bottom - 4 },
  { x: TABLE.width / 2, y: PLAY_AREA.bottom + 4 },
  { x: PLAY_AREA.right - 4, y: PLAY_AREA.bottom - 4 },
];

export const CUE_START: Vector = {
  x: PLAY_AREA.left + (PLAY_AREA.right - PLAY_AREA.left) * 0.28,
  y: TABLE.height / 2,
};

export const TARGET_STARTS: Vector[] = [
  { x: PLAY_AREA.left + (PLAY_AREA.right - PLAY_AREA.left) * 0.68, y: TABLE.height / 2 },
  { x: PLAY_AREA.left + (PLAY_AREA.right - PLAY_AREA.left) * 0.72, y: TABLE.height / 2 - BALL_RADIUS * 1.1 },
  { x: PLAY_AREA.left + (PLAY_AREA.right - PLAY_AREA.left) * 0.72, y: TABLE.height / 2 + BALL_RADIUS * 1.1 },
  { x: PLAY_AREA.left + (PLAY_AREA.right - PLAY_AREA.left) * 0.76, y: TABLE.height / 2 - BALL_RADIUS * 2.2 },
  { x: PLAY_AREA.left + (PLAY_AREA.right - PLAY_AREA.left) * 0.76, y: TABLE.height / 2 },
  { x: PLAY_AREA.left + (PLAY_AREA.right - PLAY_AREA.left) * 0.76, y: TABLE.height / 2 + BALL_RADIUS * 2.2 },
];

export const BALL_COLORS = ['#d8b33f', '#2469b3', '#b52d27', '#5b2a83', '#d46b2c', '#1d7f5f'];
```

- [ ] **Step 5: Implement geometry helpers**

Create `src/game/geometry.ts`:

```ts
import { TABLE, type Vector } from './constants';

export function distance(a: Vector, b: Vector): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function isInPocket(point: Vector, pockets: Vector[]): boolean {
  return pockets.some((pocket) => distance(point, pocket) <= TABLE.pocketRadius);
}

export function clampShotPower(dragDistance: number): number {
  const normalized = Math.max(0, Math.min(dragDistance / TABLE.maxDragDistance, 1));
  return Number(normalized.toFixed(2));
}

export function isTableReady(speeds: number[]): boolean {
  return speeds.every((speed) => speed <= TABLE.readySpeed);
}
```

- [ ] **Step 6: Implement state helpers**

Create `src/game/state.ts`:

```ts
export type GameState = {
  score: number;
  strokes: number;
  remainingTargets: number;
  cueBallPocketed: boolean;
  message: string;
};

export function createGameState(targetCount: number): GameState {
  return {
    score: 0,
    strokes: 0,
    remainingTargets: targetCount,
    cueBallPocketed: false,
    message: 'Drag from the cue ball to aim. Release to shoot.',
  };
}

export function recordStroke(state: GameState): GameState {
  return {
    ...state,
    strokes: state.strokes + 1,
    message: 'Shot in motion.',
  };
}

export function pocketTargetBall(state: GameState): GameState {
  const remainingTargets = Math.max(0, state.remainingTargets - 1);
  return {
    ...state,
    score: state.score + 100,
    remainingTargets,
    message: remainingTargets === 0 ? 'Table cleared. Restart for another rack.' : 'Target ball pocketed.',
  };
}

export function pocketCueBall(state: GameState): GameState {
  return {
    ...state,
    strokes: state.strokes + 1,
    cueBallPocketed: true,
    message: 'Cue ball pocketed. It will reset after the table stops.',
  };
}

export function resetCueBall(state: GameState): GameState {
  return {
    ...state,
    cueBallPocketed: false,
    message: 'Cue ball reset. Drag from the cue ball to aim.',
  };
}

export function readyForNextShot(state: GameState): GameState {
  if (state.remainingTargets === 0) {
    return {
      ...state,
      message: 'Table cleared. Restart for another rack.',
    };
  }

  return {
    ...state,
    message: 'Drag from the cue ball to aim. Release to shoot.',
  };
}

export function restartGame(targetCount: number): GameState {
  return createGameState(targetCount);
}
```

- [ ] **Step 7: Run tests to verify helpers pass**

Run: `npm test`

Expected: PASS for geometry and state tests.

- [ ] **Step 8: Commit helpers**

```bash
git add src/game/constants.ts src/game/geometry.ts src/game/state.ts src/game/geometry.test.ts src/game/state.test.ts
git commit -m "feat: add pool game helpers"
```

## Task 3: Build Phaser Pool Scene

**Files:**
- Create: `src/game/PoolScene.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create the scene**

Create `src/game/PoolScene.ts`:

```ts
import Phaser from 'phaser';
import {
  BALL_COLORS,
  BALL_RADIUS,
  CUE_START,
  PLAY_AREA,
  POCKETS,
  TABLE,
  TARGET_STARTS,
  type Vector,
} from './constants';
import { clampShotPower, distance, isInPocket, isTableReady } from './geometry';
import {
  createGameState,
  pocketCueBall,
  pocketTargetBall,
  readyForNextShot,
  recordStroke,
  resetCueBall,
  restartGame,
  type GameState,
} from './state';

type BallKind = 'cue' | 'target';

type PoolBall = Phaser.Physics.Matter.Image & {
  ballKind: BallKind;
  pocketed?: boolean;
};

type AimState = {
  active: boolean;
  pointerId: number;
  start: Vector;
  current: Vector;
};

const DEPTH = {
  room: 0,
  table: 1,
  pocket: 2,
  rail: 3,
  ball: 4,
  aim: 5,
};

export class PoolScene extends Phaser.Scene {
  private cueBall!: PoolBall;
  private targetBalls: PoolBall[] = [];
  private aimLine!: Phaser.GameObjects.Graphics;
  private state: GameState = createGameState(TARGET_STARTS.length);
  private aimState: AimState | null = null;
  private wasMoving = false;

  constructor() {
    super('PoolScene');
  }

  create(): void {
    this.matter.world.setBounds(PLAY_AREA.left, PLAY_AREA.top, PLAY_AREA.right - PLAY_AREA.left, PLAY_AREA.bottom - PLAY_AREA.top, 32);
    this.createTextures();
    this.drawRoom();
    this.drawTable();
    this.createBalls();
    this.aimLine = this.add.graphics().setDepth(DEPTH.aim);
    this.bindInput();
    this.bindRestart();
    this.updateHud();
  }

  update(): void {
    this.applyRollingFriction();
    this.checkPockets();
    this.handleSettledTable();
    this.renderAim();
  }

  private createTextures(): void {
    this.createBallTexture('cue-ball', '#f8f0dd', '#ffffff');
    BALL_COLORS.forEach((color, index) => {
      this.createBallTexture(`target-ball-${index}`, color, '#fff2c8');
    });
  }

  private createBallTexture(key: string, fill: string, shine: string): void {
    const size = BALL_RADIUS * 2 + 8;
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0x000000, 0.22);
    graphics.fillCircle(size / 2 + 2, size / 2 + 3, BALL_RADIUS);
    graphics.fillStyle(Phaser.Display.Color.HexStringToColor(fill).color, 1);
    graphics.fillCircle(size / 2, size / 2, BALL_RADIUS);
    graphics.fillStyle(Phaser.Display.Color.HexStringToColor(shine).color, 0.55);
    graphics.fillCircle(size / 2 - 5, size / 2 - 6, BALL_RADIUS * 0.34);
    graphics.lineStyle(1, 0xffffff, 0.16);
    graphics.strokeCircle(size / 2, size / 2, BALL_RADIUS - 1);
    graphics.generateTexture(key, size, size);
    graphics.destroy();
  }

  private drawRoom(): void {
    const room = this.add.graphics().setDepth(DEPTH.room);
    room.fillGradientStyle(0x241914, 0x241914, 0x0e0b09, 0x0e0b09, 1);
    room.fillRect(0, 0, TABLE.width, TABLE.height);
    room.fillStyle(0xf3bd71, 0.13);
    room.fillEllipse(TABLE.width / 2, 44, 520, 150);
  }

  private drawTable(): void {
    const table = this.add.graphics().setDepth(DEPTH.table);
    table.fillStyle(0x25150d, 1);
    table.fillRoundedRect(44, 44, TABLE.width - 88, TABLE.height - 88, 34);
    table.lineStyle(8, 0x0d0805, 0.9);
    table.strokeRoundedRect(44, 44, TABLE.width - 88, TABLE.height - 88, 34);

    table.fillStyle(0x5b321b, 1);
    table.fillRoundedRect(56, 56, TABLE.width - 112, TABLE.height - 112, 26);
    table.lineStyle(3, 0xa66b35, 0.42);
    table.strokeRoundedRect(62, 62, TABLE.width - 124, TABLE.height - 124, 22);

    table.fillStyle(0x0b5c3e, 1);
    table.fillRoundedRect(PLAY_AREA.left, PLAY_AREA.top, PLAY_AREA.right - PLAY_AREA.left, PLAY_AREA.bottom - PLAY_AREA.top, 18);

    const cloth = this.add.graphics().setDepth(DEPTH.table + 0.1);
    cloth.fillStyle(0xffffff, 0.025);
    for (let y = PLAY_AREA.top + 20; y < PLAY_AREA.bottom; y += 18) {
      cloth.fillRect(PLAY_AREA.left + 8, y, PLAY_AREA.right - PLAY_AREA.left - 16, 1);
    }

    const pockets = this.add.graphics().setDepth(DEPTH.pocket);
    for (const pocket of POCKETS) {
      pockets.fillStyle(0x050403, 1);
      pockets.fillCircle(pocket.x, pocket.y, TABLE.pocketRadius);
      pockets.lineStyle(3, 0x160d08, 1);
      pockets.strokeCircle(pocket.x, pocket.y, TABLE.pocketRadius - 1);
    }
  }

  private createBalls(): void {
    this.targetBalls.forEach((ball) => ball.destroy());
    this.targetBalls = [];

    this.cueBall = this.createBall(CUE_START, 'cue-ball', 'cue');
    TARGET_STARTS.forEach((position, index) => {
      this.targetBalls.push(this.createBall(position, `target-ball-${index}`, 'target'));
    });
  }

  private createBall(position: Vector, texture: string, kind: BallKind): PoolBall {
    const ball = this.matter.add.image(position.x, position.y, texture, undefined, {
      shape: 'circle',
      circleRadius: BALL_RADIUS,
      restitution: 0.94,
      friction: 0.002,
      frictionAir: 0.012,
      frictionStatic: 0,
      density: 0.002,
    }) as PoolBall;

    ball.setDepth(DEPTH.ball);
    ball.setCircle(BALL_RADIUS);
    ball.setBounce(0.94);
    ball.setFriction(0.002, 0, 0.012);
    ball.setMass(1);
    ball.ballKind = kind;
    return ball;
  }

  private bindInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.canAim()) {
        return;
      }

      const point = { x: pointer.worldX, y: pointer.worldY };
      if (distance(point, this.cuePosition()) > BALL_RADIUS * 2.2) {
        return;
      }

      this.aimState = {
        active: true,
        pointerId: pointer.id,
        start: this.cuePosition(),
        current: point,
      };
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.aimState || pointer.id !== this.aimState.pointerId) {
        return;
      }

      this.aimState.current = { x: pointer.worldX, y: pointer.worldY };
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!this.aimState || pointer.id !== this.aimState.pointerId) {
        return;
      }

      this.shootFromAim();
    });
  }

  private bindRestart(): void {
    document.querySelector<HTMLButtonElement>('#restart')?.addEventListener('click', () => {
      this.restartRack();
    });
  }

  private canAim(): boolean {
    return !this.state.cueBallPocketed && this.state.remainingTargets > 0 && this.tableReady();
  }

  private cuePosition(): Vector {
    return { x: this.cueBall.x, y: this.cueBall.y };
  }

  private shootFromAim(): void {
    if (!this.aimState) {
      return;
    }

    const cue = this.cuePosition();
    const pull = {
      x: this.aimState.current.x - cue.x,
      y: this.aimState.current.y - cue.y,
    };
    const dragDistance = Math.hypot(pull.x, pull.y);
    const power = clampShotPower(dragDistance);
    this.aimState = null;
    this.aimLine.clear();

    if (power < TABLE.minShotPower || dragDistance === 0) {
      return;
    }

    const impulseScale = TABLE.maxImpulse * power;
    this.cueBall.applyForce({
      x: (-pull.x / dragDistance) * impulseScale,
      y: (-pull.y / dragDistance) * impulseScale,
    });
    this.state = recordStroke(this.state);
    this.wasMoving = true;
    this.updateHud();
  }

  private renderAim(): void {
    this.aimLine.clear();
    if (!this.aimState) {
      return;
    }

    const cue = this.cuePosition();
    const pull = {
      x: this.aimState.current.x - cue.x,
      y: this.aimState.current.y - cue.y,
    };
    const dragDistance = Math.hypot(pull.x, pull.y);
    const power = clampShotPower(dragDistance);

    if (dragDistance < 1) {
      return;
    }

    const direction = {
      x: -pull.x / dragDistance,
      y: -pull.y / dragDistance,
    };
    const guideLength = 120 + power * 190;
    const cueBack = 36 + power * 90;

    this.aimLine.lineStyle(3, 0xf6e7b4, 0.9);
    this.aimLine.beginPath();
    this.aimLine.moveTo(cue.x + direction.x * BALL_RADIUS, cue.y + direction.y * BALL_RADIUS);
    this.aimLine.lineTo(cue.x + direction.x * guideLength, cue.y + direction.y * guideLength);
    this.aimLine.strokePath();

    this.aimLine.lineStyle(7, 0x8a5a32, 0.95);
    this.aimLine.beginPath();
    this.aimLine.moveTo(cue.x - direction.x * (BALL_RADIUS + cueBack), cue.y - direction.y * (BALL_RADIUS + cueBack));
    this.aimLine.lineTo(cue.x - direction.x * (BALL_RADIUS + 8), cue.y - direction.y * (BALL_RADIUS + 8));
    this.aimLine.strokePath();

    this.aimLine.fillStyle(0xd9a441, 0.95);
    this.aimLine.fillRoundedRect(PLAY_AREA.left, PLAY_AREA.bottom + 24, power * 220, 10, 5);
  }

  private checkPockets(): void {
    for (const ball of this.activeBalls()) {
      if (ball.pocketed || !isInPocket({ x: ball.x, y: ball.y }, POCKETS)) {
        continue;
      }

      ball.pocketed = true;
      ball.setVisible(false);
      ball.setCollisionCategory(0);
      ball.setVelocity(0, 0);

      if (ball.ballKind === 'cue') {
        this.state = pocketCueBall(this.state);
      } else {
        this.state = pocketTargetBall(this.state);
      }
      this.updateHud();
    }
  }

  private handleSettledTable(): void {
    const moving = !this.tableReady();
    if (moving) {
      this.wasMoving = true;
      return;
    }

    if (!this.wasMoving) {
      return;
    }

    this.wasMoving = false;
    this.stopTinyDrift();

    if (this.state.cueBallPocketed) {
      this.resetCueBallBody();
      this.state = resetCueBall(this.state);
    } else {
      this.state = readyForNextShot(this.state);
    }
    this.updateHud();
  }

  private activeBalls(): PoolBall[] {
    return [this.cueBall, ...this.targetBalls].filter((ball) => !ball.pocketed);
  }

  private tableReady(): boolean {
    return isTableReady(this.activeBalls().map((ball) => Math.hypot(ball.body.velocity.x, ball.body.velocity.y)));
  }

  private applyRollingFriction(): void {
    for (const ball of this.activeBalls()) {
      const velocity = ball.body.velocity;
      const speed = Math.hypot(velocity.x, velocity.y);
      if (speed > 0 && speed < TABLE.readySpeed) {
        ball.setVelocity(0, 0);
      }
    }
  }

  private stopTinyDrift(): void {
    for (const ball of this.activeBalls()) {
      ball.setVelocity(0, 0);
      ball.setAngularVelocity(0);
    }
  }

  private resetCueBallBody(): void {
    this.cueBall.pocketed = false;
    this.cueBall.setVisible(true);
    this.cueBall.setCollisionCategory(1);
    this.cueBall.setPosition(CUE_START.x, CUE_START.y);
    this.cueBall.setVelocity(0, 0);
    this.cueBall.setAngularVelocity(0);
  }

  private restartRack(): void {
    this.aimState = null;
    this.aimLine?.clear();
    this.createBalls();
    this.state = restartGame(TARGET_STARTS.length);
    this.wasMoving = false;
    this.updateHud();
  }

  private updateHud(): void {
    const score = document.querySelector('#score');
    const strokes = document.querySelector('#strokes');
    const remaining = document.querySelector('#remaining');
    const message = document.querySelector('#message');

    if (score) score.textContent = `Score ${this.state.score}`;
    if (strokes) strokes.textContent = `Strokes ${this.state.strokes}`;
    if (remaining) remaining.textContent = `Balls ${this.state.remainingTargets}`;
    if (message) message.textContent = this.state.message;
  }
}
```

- [ ] **Step 2: Register the scene**

Modify `src/main.ts`:

```ts
import Phaser from 'phaser';
import { PoolScene } from './game/PoolScene';
import './styles.css';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 1100,
  height: 640,
  backgroundColor: '#10100e',
  scene: [PoolScene],
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

new Phaser.Game(config);
```

- [ ] **Step 3: Run build and tests**

Run: `npm test && npm run build`

Expected: tests pass and TypeScript build succeeds.

- [ ] **Step 4: Commit scene**

```bash
git add src/main.ts src/game/PoolScene.ts
git commit -m "feat: add playable pool scene"
```

## Task 4: Polish Realistic MVP Experience

**Files:**
- Modify: `src/styles.css`
- Modify: `src/game/PoolScene.ts`
- Modify: `index.html`

- [ ] **Step 1: Refine HUD wording and page labels**

Modify the HUD text in `index.html` to keep the app tool-like and concise:

```html
<main class="game-shell">
  <section class="game-header" aria-label="Game status">
    <div>
      <p class="eyebrow">Single Player Practice</p>
      <h1>Pool Hall</h1>
    </div>
    <div class="hud" aria-live="polite">
      <span id="score">Score 0</span>
      <span id="strokes">Strokes 0</span>
      <span id="remaining">Balls 0</span>
      <button id="restart" type="button">Restart</button>
    </div>
  </section>
  <section class="table-frame" aria-label="Playable pool table">
    <div id="game"></div>
  </section>
  <p id="message" class="message">Drag from the cue ball to aim. Release to shoot.</p>
</main>
```

- [ ] **Step 2: Add clearer aiming and pocket feedback**

In `src/game/PoolScene.ts`, update `checkPockets()` so target balls shrink visually before destruction is not required; instead, keep MVP stable by hiding and disabling bodies as already implemented. Add message updates through existing state helpers only.

No code change is needed if `checkPockets()` already hides balls, disables collision, and updates HUD.

- [ ] **Step 3: Make CSS responsive and realistic**

Confirm `src/styles.css` includes:

```css
.table-frame {
  min-height: 0;
  display: grid;
  place-items: center;
  border: 1px solid rgba(220, 173, 102, 0.18);
  background:
    radial-gradient(circle at 50% 16%, rgba(255, 214, 141, 0.18), transparent 34rem),
    rgba(5, 5, 4, 0.48);
  box-shadow: inset 0 0 80px rgba(0, 0, 0, 0.55);
}

#game {
  width: 100%;
  max-width: 1100px;
  aspect-ratio: 1100 / 640;
}
```

- [ ] **Step 4: Run visual smoke locally**

Run: `npm run dev -- --port 5173`

Open `http://127.0.0.1:5173` in the in-app browser or Chrome DevTools tool.

Expected:
- The page shows the realistic top-down table.
- HUD is visible and not overlapping the table.
- Dragging from the cue ball shows aim guide and cue.
- Releasing moves the cue ball.

- [ ] **Step 5: Commit polish**

```bash
git add index.html src/styles.css src/game/PoolScene.ts
git commit -m "style: polish realistic pool mvp"
```

## Task 5: Final Verification And Cleanup

**Files:**
- No planned file changes unless verification exposes a bug.

- [ ] **Step 1: Run tests**

Run: `npm test`

Expected: all Vitest tests pass.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: TypeScript and Vite build complete successfully.

- [ ] **Step 3: Run browser smoke check**

Run: `npm run dev -- --port 5173`

Open `http://127.0.0.1:5173` and verify:
- table renders nonblank;
- balls render inside rails;
- drag aim appears;
- shot moves balls;
- restart resets score, strokes, and ball positions.

- [ ] **Step 4: Stop helper process**

Stop the Vite dev server started for verification.

Expected: no task-scoped Vite or preview process remains running.

- [ ] **Step 5: Review git diff and status**

Run:

```bash
git status --short
git log --oneline -5
```

Expected: only intentional committed or clearly reported changes remain.
