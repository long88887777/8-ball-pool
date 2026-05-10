# V4: AI Opponent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hard-difficulty AI opponent using MCTS + geometric simulation that plans 3-5 shot run-outs and strictly follows 8-ball rules.

**Architecture:** Six new files in `src/game/ai/` (types, fastPhysics, shotGenerator, evaluator, mcts, aiController) plus modifications to PoolScene, i18n, and index.html for integration and UI.

**Tech Stack:** TypeScript, Phaser 3, Vitest for testing

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/game/ai/types.ts` | AI type definitions |
| Create | `src/game/ai/fastPhysics.ts` | Lightweight physics simulator |
| Create | `src/game/ai/fastPhysics.test.ts` | Tests for fast physics |
| Create | `src/game/ai/shotGenerator.ts` | Shot candidate enumeration |
| Create | `src/game/ai/shotGenerator.test.ts` | Tests for shot generator |
| Create | `src/game/ai/evaluator.ts` | Table state scoring |
| Create | `src/game/ai/evaluator.test.ts` | Tests for evaluator |
| Create | `src/game/ai/mcts.ts` | Monte Carlo Tree Search |
| Create | `src/game/ai/mcts.test.ts` | Tests for MCTS |
| Create | `src/game/ai/aiController.ts` | AI turn lifecycle |
| Create | `src/game/ai/aiController.test.ts` | Tests for AI controller |
| Modify | `src/game/i18n.ts` | Add AI-related i18n keys |
| Modify | `src/game/PoolScene.ts` | Integrate AI controller |
| Modify | `index.html` | Add mode toggle button |

---

### Task 1: AI Type Definitions

**Files:**
- Create: `src/game/ai/types.ts`

- [ ] **Step 1: Create types file**

```typescript
// src/game/ai/types.ts
import type { Vector } from '../constants';
import type { BallGroup, PlayerIndex } from '../eightBallRules';

export type ShotType = 'pot' | 'safety';

export type ShotCandidate = {
  targetBallId: number;
  pocketIndex: number;
  direction: Vector;
  power: number;
  spin: Vector;
  type: ShotType;
  ghostBallPos: Vector;
};

export type TableState = {
  ballPositions: Map<number, Vector>;
  pocketedBallIds: number[];
  currentPlayer: PlayerIndex;
  playerGroups: [BallGroup | null, BallGroup | null];
};

export type FastSimResult = {
  ballPositions: Map<number, Vector>;
  pocketedBalls: number[];
  cueBallPocketed: boolean;
  firstContact: number | null;
  cushionAfterContact: boolean;
};

export type MCTSConfig = {
  timeBudgetMs: number;
  maxDepth: number;
  explorationConstant: number;
};

export type MCTSNode = {
  state: TableState;
  shot: ShotCandidate | null;
  parent: MCTSNode | null;
  children: MCTSNode[];
  visits: number;
  totalValue: number;
  untriedShots: ShotCandidate[];
};

export type AIDecision = {
  shot: ShotCandidate;
  placementPosition?: Vector;
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to `src/game/ai/types.ts`

- [ ] **Step 3: Commit**

```bash
git add src/game/ai/types.ts
git commit -m "feat(ai): add AI type definitions"
```

---

### Task 2: Fast Physics Simulator - Core

**Files:**
- Create: `src/game/ai/fastPhysics.ts`
- Create: `src/game/ai/fastPhysics.test.ts`

- [ ] **Step 1: Write failing tests for basic ball movement and friction**

```typescript
// src/game/ai/fastPhysics.test.ts
import { describe, it, expect } from 'vitest';
import { simulateShot } from './fastPhysics';
import type { Vector } from '../constants';

describe('fastPhysics', () => {
  describe('simulateShot', () => {
    it('moves cue ball in shot direction and comes to rest', () => {
      const balls = new Map<number, Vector>([[0, { x: 300, y: 320 }]]);
      const result = simulateShot(balls, { x: 1, y: 0 }, 0.5, { x: 0, y: 0 });
      expect(result.ballPositions.get(0)!.x).toBeGreaterThan(300);
      expect(result.cueBallPocketed).toBe(false);
      expect(result.pocketedBalls).toEqual([]);
    });

    it('detects ball-ball collision and transfers momentum', () => {
      const balls = new Map<number, Vector>([
        [0, { x: 200, y: 320 }],
        [1, { x: 400, y: 320 }],
      ]);
      const result = simulateShot(balls, { x: 1, y: 0 }, 0.7, { x: 0, y: 0 });
      expect(result.firstContact).toBe(1);
      const ball1Pos = result.ballPositions.get(1)!;
      expect(ball1Pos.x).toBeGreaterThan(400);
    });

    it('detects cue ball pocketed', () => {
      // Aim cue ball directly at a corner pocket
      const balls = new Map<number, Vector>([[0, { x: 150, y: 150 }]]);
      const pocketDir = { x: -1, y: -1 };
      const len = Math.hypot(pocketDir.x, pocketDir.y);
      const result = simulateShot(
        balls,
        { x: pocketDir.x / len, y: pocketDir.y / len },
        0.9,
        { x: 0, y: 0 },
      );
      expect(result.cueBallPocketed).toBe(true);
    });

    it('detects target ball pocketed', () => {
      // Place target ball near pocket, shoot cue ball at it
      const balls = new Map<number, Vector>([
        [0, { x: 200, y: 76 }],
        [1, { x: 76, y: 76 }],
      ]);
      const result = simulateShot(balls, { x: -1, y: 0 }, 0.6, { x: 0, y: 0 });
      expect(result.pocketedBalls).toContain(1);
    });

    it('detects cushion contact after first ball hit', () => {
      const balls = new Map<number, Vector>([
        [0, { x: 300, y: 320 }],
        [1, { x: 500, y: 320 }],
      ]);
      const result = simulateShot(balls, { x: 1, y: 0 }, 0.8, { x: 0, y: 0 });
      expect(result.cushionAfterContact).toBe(true);
    });

    it('returns all ball final positions', () => {
      const balls = new Map<number, Vector>([
        [0, { x: 200, y: 320 }],
        [1, { x: 400, y: 320 }],
        [2, { x: 600, y: 320 }],
      ]);
      const result = simulateShot(balls, { x: 1, y: 0 }, 0.5, { x: 0, y: 0 });
      expect(result.ballPositions.size).toBe(3);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/ai/fastPhysics.test.ts`
Expected: FAIL — module `./fastPhysics` not found

- [ ] **Step 3: Implement fastPhysics.ts**

```typescript
// src/game/ai/fastPhysics.ts
import { BALL_RADIUS, PLAY_AREA, POCKETS, TABLE, type Vector } from '../constants';
import type { FastSimResult } from './types';

const FRICTION = 0.985;
const COLLISION_ENERGY_LOSS = 0.92;
const CUSHION_ENERGY_LOSS = 0.78;
const MAX_STEPS = 300;
const DT = 0.016;
const SPEED_THRESHOLD = 0.3;
const SHOT_SPEED = 8.0 * 60;
const POCKET_CAPTURE_RADIUS = TABLE.pocketRadius + BALL_RADIUS * 0.5;

type SimBall = {
  id: number;
  pos: Vector;
  vel: Vector;
  pocketed: boolean;
};

export function simulateShot(
  balls: Map<number, Vector>,
  cueDirection: Vector,
  power: number,
  _spin: Vector,
): FastSimResult {
  const simBalls: SimBall[] = [];
  for (const [id, pos] of balls) {
    simBalls.push({ id, pos: { ...pos }, vel: { x: 0, y: 0 }, pocketed: false });
  }

  const cueBall = simBalls.find((b) => b.id === 0);
  if (cueBall) {
    const speed = SHOT_SPEED * power;
    cueBall.vel = { x: cueDirection.x * speed, y: cueDirection.y * speed };
  }

  let firstContact: number | null = null;
  let cushionAfterContact = false;
  const pocketedBalls: number[] = [];
  let cueBallPocketed = false;

  for (let step = 0; step < MAX_STEPS; step++) {
    let allStopped = true;

    for (const ball of simBalls) {
      if (ball.pocketed) continue;
      if (Math.hypot(ball.vel.x, ball.vel.y) > SPEED_THRESHOLD) {
        allStopped = false;
      }

      ball.pos.x += ball.vel.x * DT;
      ball.pos.y += ball.vel.y * DT;
      ball.vel.x *= FRICTION;
      ball.vel.y *= FRICTION;

      if (Math.hypot(ball.vel.x, ball.vel.y) < SPEED_THRESHOLD) {
        ball.vel.x = 0;
        ball.vel.y = 0;
      }
    }

    for (let i = 0; i < simBalls.length; i++) {
      for (let j = i + 1; j < simBalls.length; j++) {
        const a = simBalls[i];
        const b = simBalls[j];
        if (a.pocketed || b.pocketed) continue;
        const collision = resolveCollision(a, b);
        if (collision && firstContact === null) {
          if (a.id === 0) firstContact = b.id;
          else if (b.id === 0) firstContact = a.id;
        }
      }
    }

    for (const ball of simBalls) {
      if (ball.pocketed) continue;
      const hitCushion = resolveCushion(ball);
      if (hitCushion && firstContact !== null) {
        cushionAfterContact = true;
      }
    }

    for (const ball of simBalls) {
      if (ball.pocketed) continue;
      if (isInPocket(ball.pos)) {
        ball.pocketed = true;
        ball.vel = { x: 0, y: 0 };
        if (ball.id === 0) {
          cueBallPocketed = true;
        } else {
          pocketedBalls.push(ball.id);
        }
      }
    }

    if (allStopped && step > 0) break;
  }

  const ballPositions = new Map<number, Vector>();
  for (const ball of simBalls) {
    if (!ball.pocketed) {
      ballPositions.set(ball.id, ball.pos);
    }
  }

  return { ballPositions, pocketedBalls, cueBallPocketed, firstContact, cushionAfterContact };
}

function resolveCollision(a: SimBall, b: SimBall): boolean {
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  const dist = Math.hypot(dx, dy);
  const minDist = BALL_RADIUS * 2;

  if (dist >= minDist || dist === 0) return false;

  const nx = dx / dist;
  const ny = dy / dist;

  const relVelX = a.vel.x - b.vel.x;
  const relVelY = a.vel.y - b.vel.y;
  const relVelDotN = relVelX * nx + relVelY * ny;

  if (relVelDotN <= 0) return false;

  const impulse = relVelDotN * COLLISION_ENERGY_LOSS;
  a.vel.x -= impulse * nx;
  a.vel.y -= impulse * ny;
  b.vel.x += impulse * nx;
  b.vel.y += impulse * ny;

  const overlap = minDist - dist;
  a.pos.x -= (overlap / 2) * nx;
  a.pos.y -= (overlap / 2) * ny;
  b.pos.x += (overlap / 2) * nx;
  b.pos.y += (overlap / 2) * ny;

  return true;
}

function resolveCushion(ball: SimBall): boolean {
  let hit = false;
  const left = PLAY_AREA.left + BALL_RADIUS;
  const right = PLAY_AREA.right - BALL_RADIUS;
  const top = PLAY_AREA.top + BALL_RADIUS;
  const bottom = PLAY_AREA.bottom - BALL_RADIUS;

  if (ball.pos.x < left) {
    ball.pos.x = left;
    ball.vel.x = Math.abs(ball.vel.x) * CUSHION_ENERGY_LOSS;
    ball.vel.y *= CUSHION_ENERGY_LOSS;
    hit = true;
  } else if (ball.pos.x > right) {
    ball.pos.x = right;
    ball.vel.x = -Math.abs(ball.vel.x) * CUSHION_ENERGY_LOSS;
    ball.vel.y *= CUSHION_ENERGY_LOSS;
    hit = true;
  }

  if (ball.pos.y < top) {
    ball.pos.y = top;
    ball.vel.y = Math.abs(ball.vel.y) * CUSHION_ENERGY_LOSS;
    ball.vel.x *= CUSHION_ENERGY_LOSS;
    hit = true;
  } else if (ball.pos.y > bottom) {
    ball.pos.y = bottom;
    ball.vel.y = -Math.abs(ball.vel.y) * CUSHION_ENERGY_LOSS;
    ball.vel.x *= CUSHION_ENERGY_LOSS;
    hit = true;
  }

  return hit;
}

function isInPocket(pos: Vector): boolean {
  return POCKETS.some(
    (pocket) => Math.hypot(pos.x - pocket.x, pos.y - pocket.y) < POCKET_CAPTURE_RADIUS,
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/ai/fastPhysics.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/ai/fastPhysics.ts src/game/ai/fastPhysics.test.ts
git commit -m "feat(ai): add lightweight physics simulator for AI prediction"
```

---

### Task 3: Shot Generator

**Files:**
- Create: `src/game/ai/shotGenerator.ts`
- Create: `src/game/ai/shotGenerator.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/game/ai/shotGenerator.test.ts
import { describe, it, expect } from 'vitest';
import { generateShotCandidates, getAILegalTargets, isPathClear } from './shotGenerator';
import type { Vector } from '../constants';
import { POCKETS, PLAY_AREA, BALL_RADIUS } from '../constants';

describe('shotGenerator', () => {
  describe('getAILegalTargets', () => {
    it('returns solids when AI group is solids', () => {
      const pocketed: number[] = [];
      const targets = getAILegalTargets('solids', pocketed);
      expect(targets).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('returns stripes when AI group is stripes', () => {
      const pocketed: number[] = [];
      const targets = getAILegalTargets('stripes', pocketed);
      expect(targets).toEqual([9, 10, 11, 12, 13, 14, 15]);
    });

    it('returns 8-ball when all group balls pocketed', () => {
      const pocketed = [1, 2, 3, 4, 5, 6, 7];
      const targets = getAILegalTargets('solids', pocketed);
      expect(targets).toEqual([8]);
    });

    it('returns all non-8 balls when group is null', () => {
      const pocketed: number[] = [];
      const targets = getAILegalTargets(null, pocketed);
      expect(targets.length).toBe(14);
      expect(targets).not.toContain(8);
    });

    it('excludes already pocketed balls', () => {
      const pocketed = [1, 2, 3];
      const targets = getAILegalTargets('solids', pocketed);
      expect(targets).toEqual([4, 5, 6, 7]);
    });
  });

  describe('isPathClear', () => {
    it('returns true when no obstacles', () => {
      const from = { x: 200, y: 320 };
      const to = { x: 500, y: 320 };
      const obstacles: Vector[] = [];
      expect(isPathClear(from, to, obstacles)).toBe(true);
    });

    it('returns false when ball blocks path', () => {
      const from = { x: 200, y: 320 };
      const to = { x: 500, y: 320 };
      const obstacles: Vector[] = [{ x: 350, y: 320 }];
      expect(isPathClear(from, to, obstacles)).toBe(false);
    });

    it('returns true when ball is beside path', () => {
      const from = { x: 200, y: 320 };
      const to = { x: 500, y: 320 };
      const obstacles: Vector[] = [{ x: 350, y: 400 }];
      expect(isPathClear(from, to, obstacles)).toBe(true);
    });
  });

  describe('generateShotCandidates', () => {
    it('generates candidates for a simple table', () => {
      const ballPositions = new Map<number, Vector>([
        [0, { x: 250, y: 320 }],
        [1, { x: 500, y: 320 }],
      ]);
      const candidates = generateShotCandidates(
        ballPositions,
        'solids',
        [],
      );
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.every((c) => c.targetBallId === 1)).toBe(true);
    });

    it('generates safety candidates when no pot is available', () => {
      // Place ball behind another ball with no clear pocket path
      const ballPositions = new Map<number, Vector>([
        [0, { x: 200, y: 320 }],
        [1, { x: 550, y: 100 }],
        [9, { x: 500, y: 100 }],
      ]);
      const candidates = generateShotCandidates(
        ballPositions,
        'solids',
        [],
      );
      const safetyCandidates = candidates.filter((c) => c.type === 'safety');
      expect(safetyCandidates.length).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/ai/shotGenerator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement shotGenerator.ts**

```typescript
// src/game/ai/shotGenerator.ts
import { BALL_RADIUS, POCKETS, PLAY_AREA, type Vector } from '../constants';
import type { BallGroup } from '../eightBallRules';
import type { ShotCandidate } from './types';

const SOLIDS = [1, 2, 3, 4, 5, 6, 7];
const STRIPES = [9, 10, 11, 12, 13, 14, 15];
const POWER_VARIANTS = [0.4, 0.65, 0.9];
const SPIN_VARIANTS: Vector[] = [
  { x: 0, y: 0 },
  { x: 0, y: 0.7 },
  { x: 0, y: -0.7 },
];

export function getAILegalTargets(group: BallGroup | null, pocketedBallIds: number[]): number[] {
  if (group === null) {
    return [...SOLIDS, ...STRIPES].filter((id) => !pocketedBallIds.includes(id));
  }

  const groupBalls = group === 'solids' ? SOLIDS : STRIPES;
  const remaining = groupBalls.filter((id) => !pocketedBallIds.includes(id));

  if (remaining.length === 0) {
    return [8];
  }

  return remaining;
}

export function isPathClear(from: Vector, to: Vector, obstacles: Vector[]): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return true;

  const dirX = dx / len;
  const dirY = dy / len;

  for (const obs of obstacles) {
    const ox = obs.x - from.x;
    const oy = obs.y - from.y;
    const proj = ox * dirX + oy * dirY;

    if (proj < BALL_RADIUS || proj > len - BALL_RADIUS) continue;

    const perpX = ox - proj * dirX;
    const perpY = oy - proj * dirY;
    const perpDist = Math.hypot(perpX, perpY);

    if (perpDist < BALL_RADIUS * 2) return false;
  }

  return true;
}

export function generateShotCandidates(
  ballPositions: Map<number, Vector>,
  aiGroup: BallGroup | null,
  pocketedBallIds: number[],
): ShotCandidate[] {
  const cuePos = ballPositions.get(0);
  if (!cuePos) return [];

  const legalTargets = getAILegalTargets(aiGroup, pocketedBallIds);
  const candidates: ShotCandidate[] = [];

  const obstacles = Array.from(ballPositions.entries())
    .filter(([id]) => id !== 0)
    .map(([, pos]) => pos);

  for (const targetId of legalTargets) {
    const targetPos = ballPositions.get(targetId);
    if (!targetPos) continue;

    for (let pocketIndex = 0; pocketIndex < POCKETS.length; pocketIndex++) {
      const pocket = POCKETS[pocketIndex];

      const toPocketX = pocket.x - targetPos.x;
      const toPocketY = pocket.y - targetPos.y;
      const toPocketLen = Math.hypot(toPocketX, toPocketY);
      if (toPocketLen < 0.001) continue;

      const toPocketDir = { x: toPocketX / toPocketLen, y: toPocketY / toPocketLen };

      const ghostBallPos = {
        x: targetPos.x - toPocketDir.x * BALL_RADIUS * 2,
        y: targetPos.y - toPocketDir.y * BALL_RADIUS * 2,
      };

      if (!isOnTable(ghostBallPos)) continue;

      const targetObstacles = obstacles.filter(
        (o) => Math.hypot(o.x - targetPos.x, o.y - targetPos.y) > 0.1 &&
               Math.hypot(o.x - cuePos.x, o.y - cuePos.y) > 0.1,
      );

      if (!isPathClear(cuePos, ghostBallPos, targetObstacles)) continue;

      const ballToPocketObstacles = obstacles.filter(
        (o) => Math.hypot(o.x - targetPos.x, o.y - targetPos.y) > 0.1,
      );
      if (!isPathClear(targetPos, pocket, ballToPocketObstacles)) continue;

      const toGhostX = ghostBallPos.x - cuePos.x;
      const toGhostY = ghostBallPos.y - cuePos.y;
      const toGhostLen = Math.hypot(toGhostX, toGhostY);
      if (toGhostLen < 0.001) continue;

      const direction = { x: toGhostX / toGhostLen, y: toGhostY / toGhostLen };

      for (const power of POWER_VARIANTS) {
        for (const spin of SPIN_VARIANTS) {
          candidates.push({
            targetBallId: targetId,
            pocketIndex,
            direction,
            power,
            spin,
            type: 'pot',
            ghostBallPos,
          });
        }
      }
    }
  }

  if (candidates.length === 0) {
    const safetyCandidates = generateSafetyCandidates(cuePos, legalTargets, ballPositions, obstacles);
    return safetyCandidates;
  }

  return candidates;
}

function generateSafetyCandidates(
  cuePos: Vector,
  legalTargets: number[],
  ballPositions: Map<number, Vector>,
  obstacles: Vector[],
): ShotCandidate[] {
  const candidates: ShotCandidate[] = [];

  for (const targetId of legalTargets) {
    const targetPos = ballPositions.get(targetId);
    if (!targetPos) continue;

    const dx = targetPos.x - cuePos.x;
    const dy = targetPos.y - cuePos.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) continue;

    const direction = { x: dx / len, y: dy / len };

    if (!isPathClear(cuePos, targetPos, obstacles.filter(
      (o) => Math.hypot(o.x - targetPos.x, o.y - targetPos.y) > 0.1 &&
             Math.hypot(o.x - cuePos.x, o.y - cuePos.y) > 0.1,
    ))) continue;

    for (const power of [0.3, 0.5]) {
      candidates.push({
        targetBallId: targetId,
        pocketIndex: -1,
        direction,
        power,
        spin: { x: 0, y: 0 },
        type: 'safety',
        ghostBallPos: targetPos,
      });
    }
  }

  if (candidates.length === 0 && legalTargets.length > 0) {
    const targetPos = ballPositions.get(legalTargets[0]);
    if (targetPos) {
      const dx = targetPos.x - cuePos.x;
      const dy = targetPos.y - cuePos.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.001) {
        candidates.push({
          targetBallId: legalTargets[0],
          pocketIndex: -1,
          direction: { x: dx / len, y: dy / len },
          power: 0.3,
          spin: { x: 0, y: 0 },
          type: 'safety',
          ghostBallPos: targetPos,
        });
      }
    }
  }

  return candidates;
}

function isOnTable(pos: Vector): boolean {
  return (
    pos.x >= PLAY_AREA.left + BALL_RADIUS &&
    pos.x <= PLAY_AREA.right - BALL_RADIUS &&
    pos.y >= PLAY_AREA.top + BALL_RADIUS &&
    pos.y <= PLAY_AREA.bottom - BALL_RADIUS
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/ai/shotGenerator.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/ai/shotGenerator.ts src/game/ai/shotGenerator.test.ts
git commit -m "feat(ai): add shot candidate generator with obstruction detection"
```

---

### Task 4: Evaluator

**Files:**
- Create: `src/game/ai/evaluator.ts`
- Create: `src/game/ai/evaluator.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/game/ai/evaluator.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateState } from './evaluator';
import type { Vector } from '../constants';
import type { TableState, FastSimResult } from './types';

describe('evaluator', () => {
  const baseState: TableState = {
    ballPositions: new Map<number, Vector>([
      [0, { x: 300, y: 320 }],
      [1, { x: 500, y: 320 }],
    ]),
    pocketedBallIds: [],
    currentPlayer: 1,
    playerGroups: [null, 'solids'],
  };

  it('scores higher when own ball is pocketed', () => {
    const noPotsResult: FastSimResult = {
      ballPositions: new Map([[0, { x: 300, y: 320 }], [1, { x: 500, y: 320 }]]),
      pocketedBalls: [],
      cueBallPocketed: false,
      firstContact: 1,
      cushionAfterContact: true,
    };
    const potResult: FastSimResult = {
      ballPositions: new Map([[0, { x: 300, y: 320 }]]),
      pocketedBalls: [1],
      cueBallPocketed: false,
      firstContact: 1,
      cushionAfterContact: true,
    };
    const scoreNoPot = evaluateState(baseState, noPotsResult, 1, 'solids');
    const scorePot = evaluateState(baseState, potResult, 1, 'solids');
    expect(scorePot).toBeGreaterThan(scoreNoPot);
  });

  it('penalizes cue ball pocketed', () => {
    const cleanResult: FastSimResult = {
      ballPositions: new Map([[0, { x: 300, y: 320 }], [1, { x: 500, y: 320 }]]),
      pocketedBalls: [],
      cueBallPocketed: false,
      firstContact: 1,
      cushionAfterContact: true,
    };
    const foulResult: FastSimResult = {
      ballPositions: new Map([[1, { x: 500, y: 320 }]]),
      pocketedBalls: [],
      cueBallPocketed: true,
      firstContact: 1,
      cushionAfterContact: true,
    };
    const scoreClean = evaluateState(baseState, cleanResult, 1, 'solids');
    const scoreFoul = evaluateState(baseState, foulResult, 1, 'solids');
    expect(scoreFoul).toBeLessThan(scoreClean);
  });

  it('returns 1.0 for legal 8-ball pot (win)', () => {
    const winState: TableState = {
      ...baseState,
      ballPositions: new Map([[0, { x: 300, y: 320 }], [8, { x: 500, y: 320 }]]),
      pocketedBallIds: [1, 2, 3, 4, 5, 6, 7],
    };
    const winResult: FastSimResult = {
      ballPositions: new Map([[0, { x: 300, y: 320 }]]),
      pocketedBalls: [8],
      cueBallPocketed: false,
      firstContact: 8,
      cushionAfterContact: true,
    };
    const score = evaluateState(winState, winResult, 1, 'solids');
    expect(score).toBe(1.0);
  });

  it('returns 0.0 for illegal 8-ball pot (loss)', () => {
    const lossState: TableState = {
      ...baseState,
      ballPositions: new Map([[0, { x: 300, y: 320 }], [1, { x: 400, y: 320 }], [8, { x: 500, y: 320 }]]),
    };
    const lossResult: FastSimResult = {
      ballPositions: new Map([[0, { x: 300, y: 320 }], [1, { x: 400, y: 320 }]]),
      pocketedBalls: [8],
      cueBallPocketed: false,
      firstContact: 8,
      cushionAfterContact: true,
    };
    const score = evaluateState(lossState, lossResult, 1, 'solids');
    expect(score).toBe(0.0);
  });

  it('penalizes no first contact (foul)', () => {
    const foulResult: FastSimResult = {
      ballPositions: new Map([[0, { x: 300, y: 320 }], [1, { x: 500, y: 320 }]]),
      pocketedBalls: [],
      cueBallPocketed: false,
      firstContact: null,
      cushionAfterContact: false,
    };
    const score = evaluateState(baseState, foulResult, 1, 'solids');
    expect(score).toBeLessThan(0.3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/ai/evaluator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement evaluator.ts**

```typescript
// src/game/ai/evaluator.ts
import { BALL_RADIUS, POCKETS, PLAY_AREA, type Vector } from '../constants';
import type { BallGroup } from '../eightBallRules';
import type { PlayerIndex } from '../eightBallRules';
import type { FastSimResult, TableState } from './types';
import { isPathClear, getAILegalTargets } from './shotGenerator';

const SOLIDS = [1, 2, 3, 4, 5, 6, 7];
const STRIPES = [9, 10, 11, 12, 13, 14, 15];

const WEIGHT_POTTED = 0.35;
const WEIGHT_POSITION = 0.30;
const WEIGHT_CONNECTIVITY = 0.20;
const WEIGHT_SAFETY = 0.10;
const FOUL_PENALTY = 0.40;

export function evaluateState(
  stateBefore: TableState,
  simResult: FastSimResult,
  aiPlayer: PlayerIndex,
  aiGroup: BallGroup | null,
): number {
  const eightBallPotted = simResult.pocketedBalls.includes(8);

  if (eightBallPotted) {
    const groupBalls = aiGroup === 'solids' ? SOLIDS : aiGroup === 'stripes' ? STRIPES : [];
    const allGroupPocketed = groupBalls.length > 0 &&
      groupBalls.every((id) => stateBefore.pocketedBallIds.includes(id) || simResult.pocketedBalls.includes(id));

    if (allGroupPocketed && !simResult.cueBallPocketed) {
      return 1.0;
    }
    return 0.0;
  }

  const isFoul = detectFoul(simResult, aiGroup, stateBefore.pocketedBallIds);
  if (isFoul) {
    return Math.max(0, 0.2 - FOUL_PENALTY);
  }

  const pottedScore = computePottedScore(simResult, aiGroup);
  const positionScore = computePositionScore(simResult, aiGroup, stateBefore.pocketedBallIds);
  const connectivityScore = computeConnectivityScore(simResult, aiGroup, stateBefore.pocketedBallIds);
  const safetyScore = computeSafetyScore(simResult);

  const raw = pottedScore * WEIGHT_POTTED +
    positionScore * WEIGHT_POSITION +
    connectivityScore * WEIGHT_CONNECTIVITY +
    safetyScore * WEIGHT_SAFETY;

  return Math.max(0, Math.min(1, raw + 0.3));
}

function detectFoul(
  result: FastSimResult,
  aiGroup: BallGroup | null,
  pocketedBefore: number[],
): boolean {
  if (result.cueBallPocketed) return true;
  if (result.firstContact === null) return true;

  if (aiGroup !== null) {
    const groupBalls = aiGroup === 'solids' ? SOLIDS : STRIPES;
    const allGroupPocketed = groupBalls.every((id) => pocketedBefore.includes(id));

    if (allGroupPocketed) {
      if (result.firstContact !== 8) return true;
    } else {
      const firstContactGroup = SOLIDS.includes(result.firstContact) ? 'solids' :
        STRIPES.includes(result.firstContact) ? 'stripes' : 'eight';
      if (firstContactGroup !== aiGroup) return true;
    }
  }

  if (!result.cushionAfterContact && result.pocketedBalls.length === 0) return true;

  return false;
}

function computePottedScore(result: FastSimResult, aiGroup: BallGroup | null): number {
  if (aiGroup === null) {
    return result.pocketedBalls.length > 0 ? 1.0 : 0.0;
  }

  const groupBalls = aiGroup === 'solids' ? SOLIDS : STRIPES;
  const ownPotted = result.pocketedBalls.filter((id) => groupBalls.includes(id)).length;
  return Math.min(ownPotted / 2, 1.0);
}

function computePositionScore(
  result: FastSimResult,
  aiGroup: BallGroup | null,
  pocketedBefore: number[],
): number {
  const cuePos = result.ballPositions.get(0);
  if (!cuePos) return 0;

  const allPocketed = [...pocketedBefore, ...result.pocketedBalls];
  const remainingTargets = getAILegalTargets(aiGroup, allPocketed);

  let bestScore = 0;
  for (const targetId of remainingTargets) {
    const targetPos = result.ballPositions.get(targetId);
    if (!targetPos) continue;

    const dist = Math.hypot(cuePos.x - targetPos.x, cuePos.y - targetPos.y);
    const idealDist = BALL_RADIUS * 8;
    const distScore = 1 - Math.min(Math.abs(dist - idealDist) / (idealDist * 3), 1);

    for (const pocket of POCKETS) {
      const toPocketX = pocket.x - targetPos.x;
      const toPocketY = pocket.y - targetPos.y;
      const toPocketLen = Math.hypot(toPocketX, toPocketY);
      if (toPocketLen < 0.001) continue;

      const toCueX = cuePos.x - targetPos.x;
      const toCueY = cuePos.y - targetPos.y;
      const toCueLen = Math.hypot(toCueX, toCueY);
      if (toCueLen < 0.001) continue;

      const dot = (toPocketX * toCueX + toPocketY * toCueY) / (toPocketLen * toCueLen);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      const angleDeg = (angle * 180) / Math.PI;
      const angleScore = angleDeg >= 30 && angleDeg <= 60 ? 1.0 :
        angleDeg >= 15 && angleDeg <= 75 ? 0.7 : 0.3;

      const combined = distScore * 0.5 + angleScore * 0.5;
      if (combined > bestScore) bestScore = combined;
    }
  }

  return bestScore;
}

function computeConnectivityScore(
  result: FastSimResult,
  aiGroup: BallGroup | null,
  pocketedBefore: number[],
): number {
  const allPocketed = [...pocketedBefore, ...result.pocketedBalls];
  const remainingTargets = getAILegalTargets(aiGroup, allPocketed);
  if (remainingTargets.length === 0) return 1.0;

  const obstacles = Array.from(result.ballPositions.entries())
    .filter(([id]) => id !== 0)
    .map(([, pos]) => pos);

  let clearCount = 0;
  for (const targetId of remainingTargets) {
    const targetPos = result.ballPositions.get(targetId);
    if (!targetPos) continue;

    for (const pocket of POCKETS) {
      const targetObstacles = obstacles.filter(
        (o) => Math.hypot(o.x - targetPos.x, o.y - targetPos.y) > 0.1,
      );
      if (isPathClear(targetPos, pocket, targetObstacles)) {
        clearCount++;
        break;
      }
    }
  }

  return clearCount / remainingTargets.length;
}

function computeSafetyScore(result: FastSimResult): number {
  const cuePos = result.ballPositions.get(0);
  if (!cuePos) return 0;

  const distToNearestCushion = Math.min(
    cuePos.x - PLAY_AREA.left,
    PLAY_AREA.right - cuePos.x,
    cuePos.y - PLAY_AREA.top,
    PLAY_AREA.bottom - cuePos.y,
  );

  const cushionBonus = distToNearestCushion < BALL_RADIUS * 3 ? 0.3 : 0;
  const centerPenalty = distToNearestCushion > (PLAY_AREA.right - PLAY_AREA.left) / 4 ? -0.1 : 0;

  return Math.max(0, Math.min(1, 0.5 + cushionBonus + centerPenalty));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/ai/evaluator.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/ai/evaluator.ts src/game/ai/evaluator.test.ts
git commit -m "feat(ai): add table state evaluator with position and connectivity scoring"
```

---

### Task 5: MCTS Engine

**Files:**
- Create: `src/game/ai/mcts.ts`
- Create: `src/game/ai/mcts.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/game/ai/mcts.test.ts
import { describe, it, expect } from 'vitest';
import { mctsSearch, createRootNode, selectBestChild } from './mcts';
import type { Vector } from '../constants';
import type { TableState, MCTSConfig } from './types';

describe('mcts', () => {
  const simpleState: TableState = {
    ballPositions: new Map<number, Vector>([
      [0, { x: 250, y: 320 }],
      [1, { x: 500, y: 320 }],
      [9, { x: 600, y: 200 }],
    ]),
    pocketedBallIds: [],
    currentPlayer: 1,
    playerGroups: [null, 'solids'],
  };

  const config: MCTSConfig = {
    timeBudgetMs: 50,
    maxDepth: 3,
    explorationConstant: 1.41,
  };

  describe('createRootNode', () => {
    it('creates a root node with no parent and no shot', () => {
      const root = createRootNode(simpleState, 'solids', []);
      expect(root.parent).toBeNull();
      expect(root.shot).toBeNull();
      expect(root.visits).toBe(0);
      expect(root.totalValue).toBe(0);
      expect(root.untriedShots.length).toBeGreaterThan(0);
    });
  });

  describe('selectBestChild', () => {
    it('selects child with highest average value when visits are equal', () => {
      const root = createRootNode(simpleState, 'solids', []);
      root.visits = 10;
      root.children = [
        { ...root, visits: 5, totalValue: 4.0, children: [], untriedShots: [], parent: root },
        { ...root, visits: 5, totalValue: 2.0, children: [], untriedShots: [], parent: root },
      ];
      const best = selectBestChild(root);
      expect(best.totalValue / best.visits).toBe(0.8);
    });
  });

  describe('mctsSearch', () => {
    it('returns a valid shot candidate', () => {
      const result = mctsSearch(simpleState, 1, 'solids', [], config);
      expect(result).not.toBeNull();
      if (result) {
        expect(result.direction).toBeDefined();
        expect(result.power).toBeGreaterThan(0);
        expect(result.power).toBeLessThanOrEqual(1);
      }
    });

    it('completes within time budget', () => {
      const start = performance.now();
      mctsSearch(simpleState, 1, 'solids', [], config);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(config.timeBudgetMs + 50);
    });

    it('prefers potting shots over safety when pot is available', () => {
      const easyPotState: TableState = {
        ballPositions: new Map<number, Vector>([
          [0, { x: 200, y: 320 }],
          [1, { x: 120, y: 76 }],
        ]),
        pocketedBallIds: [],
        currentPlayer: 1,
        playerGroups: [null, 'solids'],
      };
      const result = mctsSearch(easyPotState, 1, 'solids', [], config);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('pot');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/ai/mcts.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement mcts.ts**

```typescript
// src/game/ai/mcts.ts
import type { BallGroup, PlayerIndex } from '../eightBallRules';
import type { Vector } from '../constants';
import type { MCTSConfig, MCTSNode, ShotCandidate, TableState } from './types';
import { generateShotCandidates } from './shotGenerator';
import { simulateShot } from './fastPhysics';
import { evaluateState } from './evaluator';

const DEFAULT_CONFIG: MCTSConfig = {
  timeBudgetMs: 150,
  maxDepth: 5,
  explorationConstant: 1.41,
};

export function mctsSearch(
  state: TableState,
  aiPlayer: PlayerIndex,
  aiGroup: BallGroup | null,
  pocketedBallIds: number[],
  config: MCTSConfig = DEFAULT_CONFIG,
): ShotCandidate | null {
  const root = createRootNode(state, aiGroup, pocketedBallIds);

  if (root.untriedShots.length === 0) return null;
  if (root.untriedShots.length === 1) return root.untriedShots[0];

  const deadline = performance.now() + config.timeBudgetMs;

  while (performance.now() < deadline) {
    let node = root;

    // Selection
    while (node.untriedShots.length === 0 && node.children.length > 0) {
      node = selectChild(node, config.explorationConstant);
    }

    // Expansion
    if (node.untriedShots.length > 0) {
      const shot = node.untriedShots.pop()!;
      const simResult = simulateShot(node.state.ballPositions, shot.direction, shot.power, shot.spin);

      const childState: TableState = {
        ballPositions: simResult.ballPositions,
        pocketedBallIds: [...node.state.pocketedBallIds, ...simResult.pocketedBalls],
        currentPlayer: aiPlayer,
        playerGroups: node.state.playerGroups,
      };

      const child: MCTSNode = {
        state: childState,
        shot,
        parent: node,
        children: [],
        visits: 0,
        totalValue: 0,
        untriedShots: [],
      };

      node.children.push(child);
      node = child;

      // Simulation (rollout)
      const value = rollout(node.state, aiPlayer, aiGroup, simResult, config.maxDepth - 1);

      // Backpropagation
      backpropagate(node, value);
    }
  }

  return selectBestChild(root).shot;
}

export function createRootNode(
  state: TableState,
  aiGroup: BallGroup | null,
  pocketedBallIds: number[],
): MCTSNode {
  const candidates = generateShotCandidates(state.ballPositions, aiGroup, pocketedBallIds);

  const sorted = candidates.sort((a, b) => {
    if (a.type === 'pot' && b.type !== 'pot') return -1;
    if (a.type !== 'pot' && b.type === 'pot') return 1;
    return 0;
  });

  return {
    state,
    shot: null,
    parent: null,
    children: [],
    visits: 0,
    totalValue: 0,
    untriedShots: sorted,
  };
}

function selectChild(node: MCTSNode, explorationConstant: number): MCTSNode {
  let best: MCTSNode | null = null;
  let bestUcb = -Infinity;

  for (const child of node.children) {
    if (child.visits === 0) return child;

    const exploitation = child.totalValue / child.visits;
    const exploration = explorationConstant * Math.sqrt(Math.log(node.visits) / child.visits);
    const ucb = exploitation + exploration;

    if (ucb > bestUcb) {
      bestUcb = ucb;
      best = child;
    }
  }

  return best ?? node.children[0];
}

export function selectBestChild(node: MCTSNode): MCTSNode {
  let best: MCTSNode | null = null;
  let bestValue = -Infinity;

  for (const child of node.children) {
    if (child.visits === 0) continue;
    const avgValue = child.totalValue / child.visits;
    if (avgValue > bestValue) {
      bestValue = avgValue;
      best = child;
    }
  }

  return best ?? node.children[0];
}

function rollout(
  state: TableState,
  aiPlayer: PlayerIndex,
  aiGroup: BallGroup | null,
  lastSimResult: FastSimResult,
  remainingDepth: number,
): number {
  const baseScore = evaluateState(state, lastSimResult, aiPlayer, aiGroup);

  if (remainingDepth <= 0) return baseScore;

  const ownBallsPotted = lastSimResult.pocketedBalls.filter((id) => {
    if (aiGroup === 'solids') return id >= 1 && id <= 7;
    if (aiGroup === 'stripes') return id >= 9 && id <= 15;
    return id !== 8 && id !== 0;
  });

  if (ownBallsPotted.length === 0 || lastSimResult.cueBallPocketed) {
    return baseScore;
  }

  const allPocketed = [...state.pocketedBallIds, ...lastSimResult.pocketedBalls];
  const candidates = generateShotCandidates(lastSimResult.ballPositions, aiGroup, allPocketed);

  if (candidates.length === 0) return baseScore;

  const randomShot = candidates[Math.floor(Math.random() * Math.min(candidates.length, 10))];
  const nextResult = simulateShot(
    lastSimResult.ballPositions,
    randomShot.direction,
    randomShot.power,
    randomShot.spin,
  );

  const nextState: TableState = {
    ballPositions: nextResult.ballPositions,
    pocketedBallIds: allPocketed,
    currentPlayer: aiPlayer,
    playerGroups: state.playerGroups,
  };

  const nextScore = rollout(nextState, aiPlayer, aiGroup, nextResult, remainingDepth - 1);
  return baseScore * 0.6 + nextScore * 0.4;
}

function backpropagate(node: MCTSNode | null, value: number): void {
  while (node !== null) {
    node.visits += 1;
    node.totalValue += value;
    node = node.parent;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/ai/mcts.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/ai/mcts.ts src/game/ai/mcts.test.ts
git commit -m "feat(ai): add MCTS engine with UCB1 selection and rollout"
```

---

### Task 6: AI Controller

**Files:**
- Create: `src/game/ai/aiController.ts`
- Create: `src/game/ai/aiController.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/game/ai/aiController.test.ts
import { describe, it, expect } from 'vitest';
import { AIController, computeBestPlacement } from './aiController';
import type { Vector } from '../constants';
import { PLAY_AREA, BALL_RADIUS } from '../constants';
import type { EightBallState } from '../eightBallRules';
import { createEightBallState } from '../eightBallRules';

describe('aiController', () => {
  describe('computeBestPlacement', () => {
    it('returns a position on the table surface', () => {
      const ballPositions = new Map<number, Vector>([
        [1, { x: 500, y: 320 }],
      ]);
      const pos = computeBestPlacement(ballPositions, 'solids', []);
      expect(pos.x).toBeGreaterThanOrEqual(PLAY_AREA.left + BALL_RADIUS);
      expect(pos.x).toBeLessThanOrEqual(PLAY_AREA.right - BALL_RADIUS);
      expect(pos.y).toBeGreaterThanOrEqual(PLAY_AREA.top + BALL_RADIUS);
      expect(pos.y).toBeLessThanOrEqual(PLAY_AREA.bottom - BALL_RADIUS);
    });

    it('does not overlap with existing balls', () => {
      const ballPositions = new Map<number, Vector>([
        [1, { x: 300, y: 320 }],
        [2, { x: 400, y: 320 }],
        [3, { x: 500, y: 320 }],
      ]);
      const pos = computeBestPlacement(ballPositions, 'solids', []);
      for (const [, ballPos] of ballPositions) {
        const dist = Math.hypot(pos.x - ballPos.x, pos.y - ballPos.y);
        expect(dist).toBeGreaterThanOrEqual(BALL_RADIUS * 2);
      }
    });
  });

  describe('AIController', () => {
    it('creates an instance with default config', () => {
      const controller = new AIController();
      expect(controller).toBeDefined();
    });

    it('computeDecision returns a valid shot', () => {
      const controller = new AIController();
      const ballPositions = new Map<number, Vector>([
        [0, { x: 250, y: 320 }],
        [1, { x: 500, y: 320 }],
      ]);
      const rules = createEightBallState();
      rules.currentPlayer = 1;
      rules.players[1].group = 'solids';

      const decision = controller.computeDecision(ballPositions, rules);
      expect(decision).not.toBeNull();
      if (decision) {
        expect(decision.shot.direction).toBeDefined();
        expect(decision.shot.power).toBeGreaterThan(0);
      }
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/ai/aiController.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement aiController.ts**

```typescript
// src/game/ai/aiController.ts
import { BALL_RADIUS, PLAY_AREA, POCKETS, type Vector } from '../constants';
import type { BallGroup, EightBallState, PlayerIndex } from '../eightBallRules';
import type { AIDecision, MCTSConfig, ShotCandidate, TableState } from './types';
import { mctsSearch } from './mcts';
import { generateShotCandidates } from './shotGenerator';
import { simulateShot } from './fastPhysics';
import { evaluateState } from './evaluator';

const PLACEMENT_GRID_SPACING = 30;
const PLACEMENT_MIN_BALL_DIST = BALL_RADIUS * 2 + 4;
const POCKET_SAFE_DIST = 50;

const DEFAULT_MCTS_CONFIG: MCTSConfig = {
  timeBudgetMs: 150,
  maxDepth: 5,
  explorationConstant: 1.41,
};

export class AIController {
  private config: MCTSConfig;

  constructor(config: MCTSConfig = DEFAULT_MCTS_CONFIG) {
    this.config = config;
  }

  computeDecision(
    ballPositions: Map<number, Vector>,
    rules: EightBallState,
  ): AIDecision | null {
    const aiPlayer: PlayerIndex = rules.currentPlayer;
    const aiGroup: BallGroup | null = rules.players[aiPlayer].group;

    const state: TableState = {
      ballPositions,
      pocketedBallIds: rules.pocketedBallIds,
      currentPlayer: aiPlayer,
      playerGroups: [rules.players[0].group, rules.players[1].group],
    };

    let placementPosition: Vector | undefined;
    let searchPositions = ballPositions;

    if (rules.cueBallInHand) {
      placementPosition = computeBestPlacement(ballPositions, aiGroup, rules.pocketedBallIds);
      searchPositions = new Map(ballPositions);
      searchPositions.set(0, placementPosition);
      state.ballPositions = searchPositions;
    }

    const shot = mctsSearch(state, aiPlayer, aiGroup, rules.pocketedBallIds, this.config);

    if (!shot) {
      const fallback = this.fallbackShot(searchPositions, aiGroup, rules.pocketedBallIds);
      if (!fallback) return null;
      return { shot: fallback, placementPosition };
    }

    return { shot, placementPosition };
  }

  private fallbackShot(
    ballPositions: Map<number, Vector>,
    aiGroup: BallGroup | null,
    pocketedBallIds: number[],
  ): ShotCandidate | null {
    const candidates = generateShotCandidates(ballPositions, aiGroup, pocketedBallIds);
    if (candidates.length === 0) return null;

    let best: ShotCandidate | null = null;
    let bestScore = -Infinity;

    for (const candidate of candidates.slice(0, 20)) {
      const result = simulateShot(ballPositions, candidate.direction, candidate.power, candidate.spin);
      const state: TableState = {
        ballPositions,
        pocketedBallIds,
        currentPlayer: 1,
        playerGroups: [null, aiGroup],
      };
      const score = evaluateState(state, result, 1, aiGroup);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    return best;
  }
}

export function computeBestPlacement(
  ballPositions: Map<number, Vector>,
  aiGroup: BallGroup | null,
  pocketedBallIds: number[],
): Vector {
  const gridPoints: Vector[] = [];

  for (let x = PLAY_AREA.left + BALL_RADIUS + PLACEMENT_GRID_SPACING;
       x < PLAY_AREA.right - BALL_RADIUS;
       x += PLACEMENT_GRID_SPACING) {
    for (let y = PLAY_AREA.top + BALL_RADIUS + PLACEMENT_GRID_SPACING;
         y < PLAY_AREA.bottom - BALL_RADIUS;
         y += PLACEMENT_GRID_SPACING) {
      gridPoints.push({ x, y });
    }
  }

  const validPoints = gridPoints.filter((point) => {
    for (const [id, pos] of ballPositions) {
      if (id === 0) continue;
      if (Math.hypot(point.x - pos.x, point.y - pos.y) < PLACEMENT_MIN_BALL_DIST) return false;
    }
    for (const pocket of POCKETS) {
      if (Math.hypot(point.x - pocket.x, point.y - pocket.y) < POCKET_SAFE_DIST) return false;
    }
    return true;
  });

  if (validPoints.length === 0) {
    return { x: (PLAY_AREA.left + PLAY_AREA.right) / 2, y: (PLAY_AREA.top + PLAY_AREA.bottom) / 2 };
  }

  let bestPoint = validPoints[0];
  let bestScore = -Infinity;

  for (const point of validPoints) {
    const testPositions = new Map(ballPositions);
    testPositions.set(0, point);
    const candidates = generateShotCandidates(testPositions, aiGroup, pocketedBallIds);
    const potCandidates = candidates.filter((c) => c.type === 'pot');

    let score = potCandidates.length * 0.1;

    if (potCandidates.length > 0) {
      const bestCandidate = potCandidates[0];
      const ghostDist = Math.hypot(
        point.x - bestCandidate.ghostBallPos.x,
        point.y - bestCandidate.ghostBallPos.y,
      );
      score += Math.max(0, 1 - ghostDist / 400);
    }

    if (score > bestScore) {
      bestScore = score;
      bestPoint = point;
    }
  }

  return bestPoint;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/ai/aiController.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/ai/aiController.ts src/game/ai/aiController.test.ts
git commit -m "feat(ai): add AI controller with MCTS decision-making and ball placement"
```

---

### Task 7: i18n Updates

**Files:**
- Modify: `src/game/i18n.ts`

- [ ] **Step 1: Write failing test for new i18n keys**

```typescript
// Add to src/game/i18n.test.ts
import { describe, it, expect } from 'vitest';
import { getCopy } from './i18n';

describe('i18n AI keys', () => {
  it('English copy has AI keys', () => {
    const copy = getCopy('en');
    expect(copy.ai.thinking).toBe('AI thinking...');
    expect(copy.ai.aiming).toBe('AI aiming...');
    expect(copy.ai.shooting).toBe('AI shooting');
    expect(copy.ai.playerName).toBe('AI');
    expect(copy.hud.modeLabel).toBe('Mode');
    expect(copy.hud.modePvp).toBe('PVP');
    expect(copy.hud.modeAi).toBe('VS AI');
  });

  it('Chinese copy has AI keys', () => {
    const copy = getCopy('zh');
    expect(copy.ai.thinking).toBe('AI 思考中...');
    expect(copy.ai.aiming).toBe('AI 瞄准中...');
    expect(copy.ai.shooting).toBe('AI 击球');
    expect(copy.ai.playerName).toBe('电脑');
    expect(copy.hud.modeLabel).toBe('模式');
    expect(copy.hud.modePvp).toBe('双人对战');
    expect(copy.hud.modeAi).toBe('人机对战');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/i18n.test.ts`
Expected: FAIL — property `ai` does not exist

- [ ] **Step 3: Add AI keys to i18n.ts**

Add to the `GameCopy` type:

```typescript
ai: {
  thinking: string;
  aiming: string;
  shooting: string;
  playerName: string;
};
```

Add `modeLabel`, `modePvp`, `modeAi` to the `hud` section of `GameCopy`.

Add to English copy:

```typescript
ai: {
  thinking: 'AI thinking...',
  aiming: 'AI aiming...',
  shooting: 'AI shooting',
  playerName: 'AI',
},
```

Add `modeLabel: 'Mode'`, `modePvp: 'PVP'`, `modeAi: 'VS AI'` to `hud` in English.

Add to Chinese copy:

```typescript
ai: {
  thinking: 'AI 思考中...',
  aiming: 'AI 瞄准中...',
  shooting: 'AI 击球',
  playerName: '电脑',
},
```

Add `modeLabel: '模式'`, `modePvp: '双人对战'`, `modeAi: '人机对战'` to `hud` in Chinese.

Update `eightBallMode` in English to support dynamic mode:
- English: keep `'Local 8-Ball'` for PVP, add logic in PoolScene to switch display
- Chinese: keep `'本地双人 8 球'` for PVP

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/i18n.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/i18n.ts src/game/i18n.test.ts
git commit -m "feat(ai): add AI-related i18n keys for both English and Chinese"
```

---

### Task 8: PoolScene Integration

**Files:**
- Modify: `src/game/PoolScene.ts`
- Modify: `index.html`

- [ ] **Step 1: Add mode toggle button to index.html**

Add after the restart button in the `.hud` section:

```html
<button id="mode-toggle" type="button">VS AI</button>
```

- [ ] **Step 2: Add AI state fields to PoolScene**

Add imports at top of `PoolScene.ts`:

```typescript
import { AIController } from './ai/aiController';
import type { AIDecision } from './ai/types';
```

Add new private fields:

```typescript
private gameMode: 'pvp' | 'ai' = 'ai';
private aiController = new AIController();
private aiThinking = false;
private aiDecision: AIDecision | null = null;
private modeToggleButton?: HTMLButtonElement;
private modeToggleHandler = (): void => {
  this.toggleGameMode();
};
```

- [ ] **Step 3: Add mode toggle binding in create()**

```typescript
private bindModeToggle(): void {
  this.modeToggleButton = document.querySelector<HTMLButtonElement>('#mode-toggle') ?? undefined;
  this.modeToggleButton?.addEventListener('click', this.modeToggleHandler);
}

private toggleGameMode(): void {
  this.gameMode = this.gameMode === 'ai' ? 'pvp' : 'ai';
  this.restartRack();
}
```

Call `this.bindModeToggle()` in `create()`.

Add cleanup in the SHUTDOWN event: `this.modeToggleButton?.removeEventListener('click', this.modeToggleHandler);`

- [ ] **Step 4: Modify canAim() to block during AI turn**

```typescript
private canAim(): boolean {
  return (
    !this.strikeLocked &&
    !this.cuePlacementState &&
    !this.rules.cueBallInHand &&
    !this.rules.gameOver &&
    !this.aiThinking &&
    !this.isAITurn() &&
    this.physicsEngine.isSettled()
  );
}
```

- [ ] **Step 5: Add AI turn detection and scheduling**

```typescript
private isAITurn(): boolean {
  return this.gameMode === 'ai' && this.rules.currentPlayer === 1;
}

private scheduleAITurn(): void {
  if (this.aiThinking || this.rules.gameOver) return;
  this.aiThinking = true;
  this.updateHud();

  setTimeout(() => {
    this.executeAITurn();
  }, 500);
}

private executeAITurn(): void {
  const ballPositions = this.getTableBallPositions();
  const decision = this.aiController.computeDecision(ballPositions, this.rules);

  if (!decision) {
    this.aiThinking = false;
    this.updateHud();
    return;
  }

  this.aiDecision = decision;

  if (decision.placementPosition) {
    this.physicsEngine.resetCueBall(decision.placementPosition);
    this.syncBallsFromPhysics(this.physicsEngine.getBalls());
    this.rules = clearEightBallBallInHand(this.rules);
  }

  this.updateHud();
  setTimeout(() => this.executeAIShot(decision), 800);
}

private executeAIShot(decision: AIDecision): void {
  const shot = decision.shot;
  const cue = this.cuePosition();
  const cueAngle = Math.atan2(shot.direction.y, shot.direction.x);

  this.strikeLocked = true;
  this.tweens.addCounter({
    from: getCuePullback(shot.power),
    to: 12,
    duration: CUE.strikeDurationMs,
    ease: 'Cubic.easeIn',
    onUpdate: (tween) => {
      drawCueStick(this.cueGraphics, cue.x, cue.y, cueAngle, tween.getValue() ?? 12);
    },
    onComplete: () => {
      this.cueGraphics.clear();
      this.physicsEngine.strikeCueBall({
        direction: shot.direction,
        power: shot.power,
        contactOffset: shot.spin,
      });
      this.wasMoving = true;
      this.audio.play('cue');
      this.strikeLocked = false;
      this.aiThinking = false;
      this.aiDecision = null;
    },
  });

  this.state = recordStroke(this.state);
  this.rules = startEightBallShot(this.rules);
  this.shotClockRemaining = SHOT_CLOCK_SECONDS;
  this.updateHud();
}

private getTableBallPositions(): Map<number, Vector> {
  const positions = new Map<number, Vector>();
  positions.set(0, { x: this.cueBall.x, y: this.cueBall.y });
  for (const ball of this.targetBalls) {
    if (!ball.pocketed) {
      positions.set(ball.ballId, { x: ball.x, y: ball.y });
    }
  }
  return positions;
}
```

- [ ] **Step 6: Modify handleSettledTable() to trigger AI**

Add at the end of `handleSettledTable()`, after `this.updateHud()`:

```typescript
if (!this.rules.gameOver && this.isAITurn() && !this.aiThinking) {
  this.scheduleAITurn();
}
```

- [ ] **Step 7: Update canPlaceBreakCueBall and canPlaceBallInHandCueBall**

Add `!this.isAITurn()` check to both methods:

```typescript
private canPlaceBreakCueBall(): boolean {
  return (
    !this.strikeLocked &&
    this.state.strokes === 0 &&
    !this.rules.cueBallInHand &&
    !this.rules.gameOver &&
    !this.isAITurn() &&
    this.physicsEngine.isSettled()
  );
}

private canPlaceBallInHandCueBall(): boolean {
  return !this.strikeLocked && this.rules.cueBallInHand && !this.rules.gameOver && !this.isAITurn() && this.physicsEngine.isSettled();
}
```

- [ ] **Step 8: Update updateHud() for AI mode**

In `updateHud()`, update player name and mode display:

```typescript
if (this.gameMode === 'ai') {
  if (playerTwoName) playerTwoName.textContent = copy.ai.playerName;
  if (mode) mode.textContent = copy.hud.modeAi;
}
if (this.modeToggleButton) {
  this.modeToggleButton.textContent = this.gameMode === 'ai' ? copy.hud.modePvp : copy.hud.modeAi;
}
```

Update message display for AI thinking state:

```typescript
if (this.aiThinking) {
  if (message) message.textContent = this.aiDecision ? copy.ai.aiming : copy.ai.thinking;
}
```

- [ ] **Step 9: Disable shot clock during AI turn**

Modify `shouldRunShotClock()`:

```typescript
private shouldRunShotClock(): boolean {
  return (
    !this.rules.gameOver &&
    !this.strikeLocked &&
    !this.isAITurn() &&
    this.physicsEngine.isSettled()
  );
}
```

- [ ] **Step 10: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 11: Commit**

```bash
git add src/game/PoolScene.ts index.html
git commit -m "feat(ai): integrate AI controller into PoolScene with mode toggle"
```

---

### Task 9: AI Aim Visualization

**Files:**
- Modify: `src/game/PoolScene.ts`

- [ ] **Step 1: Add AI aim rendering during aiming phase**

In `executeAITurn()`, after computing decision and before the 800ms timeout, render the aim line:

```typescript
private showAIAimLine(decision: AIDecision): void {
  const cue = this.cuePosition();
  const shot = decision.shot;

  const nearestHit = this.raycastNearestTargetBall(cue, shot.direction);
  if (nearestHit) {
    const prediction = predictCollisionDirections(cue, shot.direction, nearestHit.ballPos);
    if (prediction) {
      this.drawPredictedCollisionRoutes(cue, prediction, shot.power);
    }
  } else {
    const missEnd = projectRayToPlayArea(cue, shot.direction);
    this.aimLine.lineStyle(3, 0xf6e7b4, 0.42);
    this.aimLine.beginPath();
    this.aimLine.moveTo(cue.x + shot.direction.x * BALL_RADIUS, cue.y + shot.direction.y * BALL_RADIUS);
    this.aimLine.lineTo(missEnd.x, missEnd.y);
    this.aimLine.strokePath();
  }

  const cueAngle = Math.atan2(shot.direction.y, shot.direction.x);
  drawCueStick(this.cueGraphics, cue.x, cue.y, cueAngle, getCuePullback(shot.power));
}
```

Call `this.showAIAimLine(decision)` in `executeAITurn()` right before the `setTimeout`.

Clear aim line in `executeAIShot()` at the start: `this.aimLine.clear();`

- [ ] **Step 2: Verify visually in browser**

Run: `npm run dev`
Start a game in VS AI mode. Observe:
- AI shows aim line during its aiming phase (~800ms)
- Cue stick is visible pointing at target
- After shot executes, aim line clears

- [ ] **Step 3: Commit**

```bash
git add src/game/PoolScene.ts
git commit -m "feat(ai): add AI aim line visualization during aiming phase"
```

---

### Task 10: Final Integration Test and Polish

**Files:**
- Modify: `src/game/PoolScene.ts` (if needed)

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Manual testing in browser**

Run: `npm run dev`

Test checklist:
- [ ] Game starts in VS AI mode by default
- [ ] Player 1 breaks, AI (Player 2) takes turn after break resolves
- [ ] AI shows "AI thinking..." then "AI aiming..." messages
- [ ] AI aim line is visible during aiming phase
- [ ] AI executes shot with cue stick animation
- [ ] AI correctly follows 8-ball rules (hits own group first)
- [ ] AI handles ball-in-hand (places cue ball, then shoots)
- [ ] AI continues shooting when it pots own ball
- [ ] AI passes turn when it misses
- [ ] Mode toggle switches between PVP and VS AI
- [ ] Mode toggle restarts the game
- [ ] Game over screen works correctly when AI wins/loses
- [ ] Shot clock does not run during AI turn
- [ ] Language toggle updates AI-related text

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "feat(ai): complete V4 AI opponent with MCTS, full 8-ball rules, and UI feedback"
```
