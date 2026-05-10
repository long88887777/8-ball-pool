# AI Position Play (Single-Step) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the AI intentional single-step cue ball position play using tangent-line physics to derive spin, validated by forward simulation.

**Architecture:** A+C hybrid — compute ideal zone for next shot, use collision tangent to derive spin direction/magnitude, generate fine-grained candidates around that spin, evaluate via fastPhysics simulation.

**Tech Stack:** TypeScript, Vitest, existing fastPhysics engine

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/game/ai/types.ts` | Add `PositionTarget` type |
| `src/game/ai/positionPlay.ts` (new) | Core position play logic: ideal zone computation, tangent analysis, spin derivation, candidate generation |
| `src/game/ai/positionPlay.test.ts` (new) | Unit tests for position play module |
| `src/game/ai/evaluator.ts` | Add `scorePositionPlay()` function |
| `src/game/ai/aiController.ts` | Integrate position-aware shot selection into `findBestConfirmedPot` |
| `src/game/ai/aiController.test.ts` | Add integration test verifying position play behavior |

---

## Task 1: Add PositionTarget Type

**Files:**
- Modify: `src/game/ai/types.ts`

- [ ] **Step 1: Add PositionTarget type to types.ts**

Add after the `AIDecision` type at end of file:

```typescript
export type PositionTarget = {
  ballId: number;
  pocketIndex: number;
  idealZone: Vector;
  zoneRadius: number;
  shotQuality: number;
};
```

- [ ] **Step 2: Run build to verify no type errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/game/ai/types.ts
git commit -m "feat(ai): add PositionTarget type for position play"
```

---

## Task 2: Implement Core Position Play — computeNextTarget

**Files:**
- Create: `src/game/ai/positionPlay.ts`
- Create: `src/game/ai/positionPlay.test.ts`

- [ ] **Step 1: Write failing test for `computeNextTarget`**

Create `src/game/ai/positionPlay.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeNextTarget } from './positionPlay';
import { POCKETS, BALL_RADIUS } from '../constants';
import type { Vector } from '../constants';

describe('positionPlay', () => {
  describe('computeNextTarget', () => {
    it('finds the easiest next ball+pocket combination', () => {
      const ballPositions = new Map<number, Vector>([
        [0, { x: 300, y: 320 }],
        [1, { x: 500, y: 320 }],
        [2, { x: 700, y: 200 }],
        [3, { x: 200, y: 500 }],
      ]);

      const result = computeNextTarget(ballPositions, 1, [1, 2, 3], []);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.ballId).not.toBe(1);
        expect(result.pocketIndex).toBeGreaterThanOrEqual(0);
        expect(result.idealZone).toBeDefined();
        expect(result.shotQuality).toBeGreaterThan(0);
      }
    });

    it('returns null when no next targets available', () => {
      const ballPositions = new Map<number, Vector>([
        [0, { x: 300, y: 320 }],
        [1, { x: 500, y: 320 }],
      ]);
      const result = computeNextTarget(ballPositions, 1, [1], []);
      expect(result).toBeNull();
    });

    it('excludes pocketed balls from consideration', () => {
      const ballPositions = new Map<number, Vector>([
        [0, { x: 300, y: 320 }],
        [1, { x: 500, y: 320 }],
        [2, { x: 700, y: 200 }],
      ]);
      const result = computeNextTarget(ballPositions, 1, [1, 2], [2]);
      expect(result).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/ai/positionPlay.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `computeNextTarget`**

Create `src/game/ai/positionPlay.ts`:

```typescript
import { BALL_RADIUS, POCKETS, type Vector } from '../constants';
import type { PositionTarget, ShotCandidate } from './types';
import { isPathClear, isOnTable } from './shotGenerator';

const IDEAL_DISTANCE = 150;
const ZONE_RADIUS = 50;
const MAX_CORRECTION = 1.5;

export function computeNextTarget(
  ballPositions: Map<number, Vector>,
  currentTargetId: number,
  legalTargets: number[],
  pocketedBallIds: number[],
): PositionTarget | null {
  const nextTargets = legalTargets.filter(
    (id) => id !== currentTargetId && !pocketedBallIds.includes(id),
  );
  if (nextTargets.length === 0) return null;

  const obstacles: Vector[] = [];
  for (const [id, pos] of ballPositions) {
    if (id !== 0) obstacles.push(pos);
  }

  let best: PositionTarget | null = null;
  let bestQuality = -Infinity;

  for (const nextId of nextTargets) {
    const nextPos = ballPositions.get(nextId);
    if (!nextPos) continue;

    for (let pi = 0; pi < POCKETS.length; pi++) {
      const pocket = POCKETS[pi];
      const toPocketX = pocket.x - nextPos.x;
      const toPocketY = pocket.y - nextPos.y;
      const toPocketLen = Math.hypot(toPocketX, toPocketY);
      if (toPocketLen < 1) continue;

      const toPocketDir = { x: toPocketX / toPocketLen, y: toPocketY / toPocketLen };
      const ghostBall = {
        x: nextPos.x - toPocketDir.x * BALL_RADIUS * 2,
        y: nextPos.y - toPocketDir.y * BALL_RADIUS * 2,
      };

      if (!isOnTable(ghostBall)) continue;

      const ballToPocketObs = obstacles.filter(
        (o) => Math.hypot(o.x - nextPos.x, o.y - nextPos.y) > 0.1,
      );
      if (!isPathClear(nextPos, pocket, ballToPocketObs)) continue;

      const approachDir = { x: -toPocketDir.x, y: -toPocketDir.y };
      const idealZone = {
        x: ghostBall.x + approachDir.x * IDEAL_DISTANCE,
        y: ghostBall.y + approachDir.y * IDEAL_DISTANCE,
      };

      if (!isOnTable(idealZone)) continue;

      const distScore = toPocketLen < 400 ? 1 - toPocketLen / 800 : 0.3;
      const quality = distScore;

      if (quality > bestQuality) {
        bestQuality = quality;
        best = {
          ballId: nextId,
          pocketIndex: pi,
          idealZone,
          zoneRadius: ZONE_RADIUS,
          shotQuality: quality,
        };
      }
    }
  }

  return best;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/ai/positionPlay.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/ai/positionPlay.ts src/game/ai/positionPlay.test.ts
git commit -m "feat(ai): add computeNextTarget for position play"
```

---

## Task 3: Implement Tangent Analysis and Spin Derivation

**Files:**
- Modify: `src/game/ai/positionPlay.ts`
- Modify: `src/game/ai/positionPlay.test.ts`

- [ ] **Step 1: Write failing test for `deriveSpin`**

Add to `positionPlay.test.ts`:

```typescript
import { computeNextTarget, deriveSpin } from './positionPlay';

// ... inside describe('positionPlay') ...

  describe('deriveSpin', () => {
    it('returns follow spin when ideal zone is ahead along shot direction', () => {
      const cuePos = { x: 200, y: 320 };
      const ghostBallPos = { x: 400, y: 320 };
      const shotDirection = { x: 1, y: 0 };
      const idealZone = { x: 600, y: 320 };

      const spin = deriveSpin(cuePos, ghostBallPos, shotDirection, idealZone);
      expect(spin.y).toBeGreaterThan(0);
    });

    it('returns draw spin when ideal zone is behind collision point', () => {
      const cuePos = { x: 200, y: 320 };
      const ghostBallPos = { x: 400, y: 320 };
      const shotDirection = { x: 1, y: 0 };
      const idealZone = { x: 250, y: 320 };

      const spin = deriveSpin(cuePos, ghostBallPos, shotDirection, idealZone);
      expect(spin.y).toBeLessThan(0);
    });

    it('returns side spin when ideal zone is perpendicular', () => {
      const cuePos = { x: 200, y: 320 };
      const ghostBallPos = { x: 400, y: 320 };
      const shotDirection = { x: 1, y: 0 };
      const idealZone = { x: 400, y: 150 };

      const spin = deriveSpin(cuePos, ghostBallPos, shotDirection, idealZone);
      expect(Math.abs(spin.x)).toBeGreaterThan(0.1);
    });

    it('clamps spin values to [-1, 1]', () => {
      const cuePos = { x: 200, y: 320 };
      const ghostBallPos = { x: 400, y: 320 };
      const shotDirection = { x: 1, y: 0 };
      const idealZone = { x: 100, y: 100 };

      const spin = deriveSpin(cuePos, ghostBallPos, shotDirection, idealZone);
      expect(spin.x).toBeGreaterThanOrEqual(-1);
      expect(spin.x).toBeLessThanOrEqual(1);
      expect(spin.y).toBeGreaterThanOrEqual(-1);
      expect(spin.y).toBeLessThanOrEqual(1);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/ai/positionPlay.test.ts`
Expected: FAIL — deriveSpin not exported

- [ ] **Step 3: Implement `deriveSpin`**

Add to `positionPlay.ts`:

```typescript
export function deriveSpin(
  cuePos: Vector,
  ghostBallPos: Vector,
  shotDirection: Vector,
  idealZone: Vector,
): Vector {
  const dx = ghostBallPos.x - cuePos.x;
  const dy = ghostBallPos.y - cuePos.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return { x: 0, y: 0 };

  const collisionNormal = { x: dx / len, y: dy / len };

  // Natural post-collision direction (tangent component)
  const dot = shotDirection.x * collisionNormal.x + shotDirection.y * collisionNormal.y;
  const tangentX = shotDirection.x - dot * collisionNormal.x;
  const tangentY = shotDirection.y - dot * collisionNormal.y;
  const tangentLen = Math.hypot(tangentX, tangentY);

  let naturalDir: Vector;
  if (tangentLen < 0.001) {
    naturalDir = { x: 0, y: 0 };
  } else {
    naturalDir = { x: tangentX / tangentLen, y: tangentY / tangentLen };
  }

  // Desired direction: from ghost ball to ideal zone
  const toIdealX = idealZone.x - ghostBallPos.x;
  const toIdealY = idealZone.y - ghostBallPos.y;
  const toIdealLen = Math.hypot(toIdealX, toIdealY);
  if (toIdealLen < 1) return { x: 0, y: 0 };

  const idealDir = { x: toIdealX / toIdealLen, y: toIdealY / toIdealLen };

  // Correction needed
  const correctionX = idealDir.x - naturalDir.x;
  const correctionY = idealDir.y - naturalDir.y;

  // Decompose into follow/draw and side
  const followComponent = correctionX * shotDirection.x + correctionY * shotDirection.y;
  const perpX = -shotDirection.y;
  const perpY = shotDirection.x;
  const sideComponent = correctionX * perpX + correctionY * perpY;

  const spinY = Math.max(-1, Math.min(1, followComponent / MAX_CORRECTION));
  const spinX = Math.max(-1, Math.min(1, sideComponent / MAX_CORRECTION));

  return { x: spinX, y: spinY };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/game/ai/positionPlay.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/ai/positionPlay.ts src/game/ai/positionPlay.test.ts
git commit -m "feat(ai): add deriveSpin with tangent-line analysis"
```

---

## Task 4: Implement Position-Aware Shot Generation

**Files:**
- Modify: `src/game/ai/positionPlay.ts`
- Modify: `src/game/ai/positionPlay.test.ts`

- [ ] **Step 1: Write failing test for `generatePositionAwareShots`**

Add to `positionPlay.test.ts`:

```typescript
import { computeNextTarget, deriveSpin, generatePositionAwareShots } from './positionPlay';

// ... inside describe('positionPlay') ...

  describe('generatePositionAwareShots', () => {
    it('generates candidates with derived spin for a pottable ball', () => {
      const pocket = POCKETS[1];
      const targetPos = { x: pocket.x, y: pocket.y + 100 };
      const ballPositions = new Map<number, Vector>([
        [0, { x: 300, y: 320 }],
        [1, targetPos],
        [2, { x: 700, y: 200 }],
      ]);

      const candidates = generatePositionAwareShots(
        ballPositions, 1, 1, [1, 2], [],
      );

      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.length).toBeLessThanOrEqual(80);
      const uniqueSpinY = new Set(candidates.map((c) => c.spin.y.toFixed(2)));
      expect(uniqueSpinY.size).toBeGreaterThan(2);
    });

    it('includes baseline no-spin candidate', () => {
      const pocket = POCKETS[1];
      const targetPos = { x: pocket.x, y: pocket.y + 100 };
      const ballPositions = new Map<number, Vector>([
        [0, { x: 300, y: 320 }],
        [1, targetPos],
        [2, { x: 700, y: 200 }],
      ]);

      const candidates = generatePositionAwareShots(
        ballPositions, 1, 1, [1, 2], [],
      );

      const noSpin = candidates.filter(
        (c) => Math.abs(c.spin.x) < 0.01 && Math.abs(c.spin.y) < 0.01,
      );
      expect(noSpin.length).toBeGreaterThan(0);
    });

    it('uses fallback spins when no next target exists', () => {
      const pocket = POCKETS[1];
      const targetPos = { x: pocket.x, y: pocket.y + 100 };
      const ballPositions = new Map<number, Vector>([
        [0, { x: 300, y: 320 }],
        [1, targetPos],
      ]);

      const candidates = generatePositionAwareShots(
        ballPositions, 1, 1, [1], [],
      );

      expect(candidates.length).toBeGreaterThan(0);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/ai/positionPlay.test.ts`
Expected: FAIL — generatePositionAwareShots not exported

- [ ] **Step 3: Implement `generatePositionAwareShots`**

Add to `positionPlay.ts`:

```typescript
const FALLBACK_SPINS: Vector[] = [
  { x: 0, y: 0 },
  { x: 0, y: 0.7 },
  { x: 0, y: -0.7 },
  { x: -0.5, y: 0 },
  { x: 0.5, y: 0 },
];

export function generatePositionAwareShots(
  ballPositions: Map<number, Vector>,
  targetBallId: number,
  pocketIndex: number,
  legalTargets: number[],
  pocketedBallIds: number[],
): ShotCandidate[] {
  const cuePos = ballPositions.get(0);
  const targetPos = ballPositions.get(targetBallId);
  if (!cuePos || !targetPos) return [];

  const pocket = POCKETS[pocketIndex];
  const toPocketX = pocket.x - targetPos.x;
  const toPocketY = pocket.y - targetPos.y;
  const toPocketLen = Math.hypot(toPocketX, toPocketY);
  if (toPocketLen < 1) return [];

  const toPocketDir = { x: toPocketX / toPocketLen, y: toPocketY / toPocketLen };
  const ghostBallPos = {
    x: targetPos.x - toPocketDir.x * BALL_RADIUS * 2,
    y: targetPos.y - toPocketDir.y * BALL_RADIUS * 2,
  };

  const toGhostX = ghostBallPos.x - cuePos.x;
  const toGhostY = ghostBallPos.y - cuePos.y;
  const toGhostLen = Math.hypot(toGhostX, toGhostY);
  if (toGhostLen < 1) return [];

  const direction = { x: toGhostX / toGhostLen, y: toGhostY / toGhostLen };

  const nextTarget = computeNextTarget(
    ballPositions, targetBallId, legalTargets, pocketedBallIds,
  );

  let spinVariants: Vector[];
  if (nextTarget) {
    const baseSpin = deriveSpin(cuePos, ghostBallPos, direction, nextTarget.idealZone);
    spinVariants = [
      baseSpin,
      { x: baseSpin.x * 0.5, y: baseSpin.y * 0.5 },
      { x: clampSpin(baseSpin.x * 1.3), y: clampSpin(baseSpin.y * 1.3) },
      { x: baseSpin.x, y: baseSpin.y * 0.7 },
      { x: baseSpin.x * 0.7, y: baseSpin.y },
      { x: 0, y: 0 },
    ];
  } else {
    spinVariants = FALLBACK_SPINS;
  }

  const totalDist = toGhostLen + toPocketLen;
  const powerMin = Math.max(0.2, totalDist / 1200);
  const powerMax = Math.min(0.85, totalDist / 500);
  const powerSteps = 8;
  const powers: number[] = [];
  for (let i = 0; i < powerSteps; i++) {
    powers.push(powerMin + (powerMax - powerMin) * (i / (powerSteps - 1)));
  }

  const candidates: ShotCandidate[] = [];
  for (const spin of spinVariants) {
    for (const power of powers) {
      candidates.push({
        targetBallId,
        pocketIndex,
        direction,
        power,
        spin: { x: spin.x, y: spin.y },
        type: 'pot',
        ghostBallPos,
      });
    }
  }

  return candidates;
}

function clampSpin(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/game/ai/positionPlay.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/ai/positionPlay.ts src/game/ai/positionPlay.test.ts
git commit -m "feat(ai): add generatePositionAwareShots with fine-grained spin/power"
```

---

## Task 5: Add Position Play Scoring to Evaluator

**Files:**
- Modify: `src/game/ai/evaluator.ts`

- [ ] **Step 1: Add `scorePositionPlay` function**

Add to `evaluator.ts` after the existing `scorePosition` function:

```typescript
export function scorePositionPlay(
  simResult: FastSimResult,
  idealZone: Vector | null,
  zoneRadius: number,
): number {
  if (!idealZone) return 0.5;

  const cuePos = simResult.ballPositions.get(0);
  if (!cuePos) return 0;

  const dist = Math.hypot(cuePos.x - idealZone.x, cuePos.y - idealZone.y);

  if (dist <= zoneRadius) return 1.0;

  const maxAcceptable = 300;
  return Math.max(0, 1.0 - (dist - zoneRadius) / maxAcceptable);
}
```

- [ ] **Step 2: Run build to verify no type errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/game/ai/evaluator.ts
git commit -m "feat(ai): add scorePositionPlay to evaluator"
```

---

## Task 6: Integrate Position Play into AIController

**Files:**
- Modify: `src/game/ai/aiController.ts`

- [ ] **Step 1: Import position play functions**

Add to imports at top of `aiController.ts`:

```typescript
import { generatePositionAwareShots, computeNextTarget } from './positionPlay';
import { scorePositionPlay } from './evaluator';
```

- [ ] **Step 2: Replace `findBestConfirmedPot` with position-aware version**

Replace the `findBestConfirmedPot` method body:

```typescript
  private findBestConfirmedPot(
    state: TableState,
    aiPlayer: PlayerIndex,
    aiGroup: BallGroup | null,
    pocketedBallIds: number[],
  ): ShotCandidate | null {
    const candidates = generateShotCandidates(state.ballPositions, aiGroup, pocketedBallIds);
    const potCandidates = candidates.filter((c) => c.type === 'pot');
    if (potCandidates.length === 0) return null;

    // Phase 1: Find which (target, pocket) combos actually pot
    const confirmedPots: { targetBallId: number; pocketIndex: number }[] = [];
    for (const candidate of potCandidates) {
      const simResult = simulateShot(
        state.ballPositions,
        candidate.direction,
        candidate.power,
        candidate.spin,
      );
      if (simResult.pocketedBalls.length > 0 && !simResult.cueBallPocketed) {
        const key = `${candidate.targetBallId}-${candidate.pocketIndex}`;
        if (!confirmedPots.some((p) => `${p.targetBallId}-${p.pocketIndex}` === key)) {
          confirmedPots.push({
            targetBallId: candidate.targetBallId,
            pocketIndex: candidate.pocketIndex,
          });
        }
      }
    }

    if (confirmedPots.length === 0) return null;

    // Phase 2: Generate position-aware candidates for confirmed pots
    const legalTargets = getAILegalTargets(aiGroup, pocketedBallIds);
    let bestShot: ShotCandidate | null = null;
    let bestScore = -Infinity;

    for (const { targetBallId, pocketIndex } of confirmedPots.slice(0, 5)) {
      const positionCandidates = generatePositionAwareShots(
        state.ballPositions,
        targetBallId,
        pocketIndex,
        legalTargets,
        pocketedBallIds,
      );

      const nextTarget = computeNextTarget(
        state.ballPositions,
        targetBallId,
        legalTargets,
        pocketedBallIds,
      );
      const idealZone = nextTarget ? nextTarget.idealZone : null;
      const zoneRadius = nextTarget ? nextTarget.zoneRadius : 50;

      for (const candidate of positionCandidates) {
        const simResult = simulateShot(
          state.ballPositions,
          candidate.direction,
          candidate.power,
          candidate.spin,
        );

        if (simResult.pocketedBalls.length === 0) continue;
        if (simResult.cueBallPocketed) continue;

        const baseScore = evaluateState(state, simResult, aiPlayer, aiGroup);
        const posScore = scorePositionPlay(simResult, idealZone, zoneRadius);
        const powerPenalty = candidate.power * 0.05;

        const score = baseScore * 0.6 + posScore * 0.35 - powerPenalty;

        if (score > bestScore) {
          bestScore = score;
          bestShot = candidate;
        }
      }
    }

    return bestShot;
  }
```

- [ ] **Step 3: Run build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/game/ai/aiController.ts
git commit -m "feat(ai): integrate position play into findBestConfirmedPot"
```

---

## Task 7: Add Integration Test for Position Play

**Files:**
- Modify: `src/game/ai/aiController.test.ts`

- [ ] **Step 1: Add test verifying position play steers cue ball toward next target**

Add to `aiController.test.ts` inside the `AIController` describe block:

```typescript
    it('AI uses position play to steer cue ball toward next target', () => {
      const controller = new AIController({ timeBudgetMs: 100, maxDepth: 2, explorationConstant: 1.41 });
      const pocket = POCKETS[1]; // top-middle
      const ballPositions = new Map<number, Vector>([
        [0, { x: 300, y: 400 }],
        [9, { x: pocket.x, y: pocket.y + 120 }],  // easy pot into top-middle
        [10, { x: 800, y: 200 }],                   // next target on right side
      ]);
      const rules = createEightBallState();
      rules.currentPlayer = 1;
      rules.players[1].group = 'stripes';

      const decision = controller.computeDecision(ballPositions, rules);
      expect(decision).not.toBeNull();

      const sim = simulateShot(
        ballPositions,
        decision!.shot.direction,
        decision!.shot.power,
        decision!.shot.spin,
      );

      // Must pot the target
      expect(sim.pocketedBalls).toContain(9);
      expect(sim.cueBallPocketed).toBe(false);

      // Cue ball should end up closer to ball 10's side of the table
      const cueEnd = sim.ballPositions.get(0)!;
      const distToNext = Math.hypot(cueEnd.x - 800, cueEnd.y - 200);
      // Should be within reasonable range (not stuck on left side)
      expect(distToNext).toBeLessThan(500);
    });

    it('AI position play does not sacrifice pot accuracy', () => {
      const controller = new AIController({ timeBudgetMs: 100, maxDepth: 2, explorationConstant: 1.41 });
      // Run 5 different table setups and verify pot rate stays high
      const setups = [
        new Map<number, Vector>([[0, { x: 265, y: 320 }], [9, { x: 550, y: 150 }], [10, { x: 700, y: 400 }]]),
        new Map<number, Vector>([[0, { x: 400, y: 400 }], [9, { x: 600, y: 200 }], [10, { x: 300, y: 150 }]]),
        new Map<number, Vector>([[0, { x: 300, y: 300 }], [9, { x: 500, y: 300 }], [10, { x: 800, y: 300 }]]),
      ];

      let potCount = 0;
      for (const positions of setups) {
        const rules = createEightBallState();
        rules.currentPlayer = 1;
        rules.players[1].group = 'stripes';

        const decision = controller.computeDecision(positions, rules);
        if (!decision) continue;

        const sim = simulateShot(
          positions,
          decision.shot.direction,
          decision.shot.power,
          decision.shot.spin,
        );
        if (sim.pocketedBalls.length > 0 && !sim.cueBallPocketed) {
          potCount++;
        }
      }

      // At least 2 out of 3 should pot successfully
      expect(potCount).toBeGreaterThanOrEqual(2);
    });
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/game/ai/aiController.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/game/ai/aiController.test.ts
git commit -m "test(ai): add integration tests for position play"
```

---

## Task 8: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Manual verification in dev server**

Run: `npm run dev`

Verify in browser:
1. Start a game against AI
2. Observe AI shots — after potting, cue ball should move toward the next target area
3. AI should still pot balls at similar or better rate than before
4. No visible performance lag in AI decision time

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(ai): address position play integration issues"
```
