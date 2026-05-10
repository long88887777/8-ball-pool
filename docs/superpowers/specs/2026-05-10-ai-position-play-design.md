# AI Position Play (Single-Step) Design

## Goal

Give the AI intentional cue ball position play: after potting a ball, the cue ball should end up in a position that makes the next shot easy. Currently the AI blindly tries 5 spin presets and picks the best result. This upgrade uses tangent-line physics to derive spin direction/magnitude, then validates via forward simulation.

## Approach: A+C Hybrid

- **A (Zone-based evaluation):** Calculate an "ideal zone" for the cue ball based on the next target ball, score shots by proximity to that zone.
- **C (Tangent-line physics):** After collision, the cue ball naturally travels along the tangent. Use this to derive what spin (follow/draw/side) is needed to steer toward the ideal zone.

Forward simulation (fastPhysics) remains the final arbiter — the tangent calculation only narrows the search space.

## Algorithm

### Step 1: Identify Next Target

For each confirmed-pot candidate (current target + pocket), find the best "next ball" to play:

```
nextTargets = legalTargets - currentTarget
for each nextTarget:
  for each pocket:
    compute ghostBall position
    score = f(distance from ideal cue position, angle quality, path clearance)
pick highest-scoring (nextTarget, pocket) pair
```

The ideal cue position for the next shot is on the ghost ball approach line, 120-200px behind the ghost ball.

### Step 2: Compute Ideal Zone

```
idealZone = ghostBall(nextTarget, bestPocket) + approachDir * idealDistance
idealDistance = 150px (center of 120-200 range)
```

The zone is a circle of radius ~50px around this point. Closer = better score.

### Step 3: Tangent Line Analysis

After cue ball hits the current target ball:

```
collisionNormal = normalize(targetPos - cuePos)  // at ghost ball contact
tangentDir = cueDirection - dot(cueDirection, collisionNormal) * collisionNormal
// tangentDir is the natural post-collision cue ball direction (no spin)
```

### Step 4: Derive Spin

```
idealDir = normalize(idealZone - ghostBallPos)  // where we WANT the cue ball to go
naturalDir = tangentDir  // where it WOULD go without spin

// Decompose the correction needed into follow/draw and side components
shotAxis = cueDirection (normalized)
perpAxis = rotate90(shotAxis)

correction = idealDir - naturalDir
followComponent = dot(correction, shotAxis)  // positive = follow, negative = draw
sideComponent = dot(correction, perpAxis)    // positive = right english, negative = left

spin.y = clamp(followComponent / maxCorrection, -1, 1)
spin.x = clamp(sideComponent / maxCorrection, -1, 1)
```

`maxCorrection` is calibrated to the spin model in fastPhysics (spinBase = speed * 0.22).

### Step 5: Generate Fine-Grained Candidates

For each (target, pocket) with a valid pot path:

```
baseSpinY, baseSpinX = derived from Step 4
// Generate variants around the derived spin
spinVariants = [
  {x: baseSpinX, y: baseSpinY},                    // exact derived
  {x: baseSpinX * 0.5, y: baseSpinY * 0.5},        // half strength
  {x: baseSpinX * 1.3, y: baseSpinY * 1.3},        // overshoot
  {x: baseSpinX, y: baseSpinY * 0.7},              // less follow/draw
  {x: baseSpinX * 0.7, y: baseSpinY},              // less side
  {x: 0, y: 0},                                     // natural (baseline)
]

// Fine power search: 8-10 steps in the viable range
powerMin = max(0.2, totalDist / 1200)
powerMax = min(0.85, totalDist / 500)
powerSteps = linspace(powerMin, powerMax, 8)
```

Total candidates per (target, pocket): ~48-60, all physically informed.

### Step 6: Evaluate via Simulation

```
for each candidate:
  simResult = simulateShot(positions, direction, power, spin)
  if no pot: skip
  if cue pocketed: skip
  
  cueEndPos = simResult.ballPositions.get(0)
  distToIdeal = distance(cueEndPos, idealZone)
  
  positionScore = 1.0 - clamp(distToIdeal / maxAcceptableDist, 0, 1)
  // Also factor in: next shot angle quality, path clearance, scratch risk
  
  totalScore = potWeight * potScore + positionWeight * positionScore
```

## Scoring Weights (Updated)

| Factor | Weight | Notes |
|--------|--------|-------|
| Pot confirmed | 0.35 | Must pot to score at all |
| Position quality | 0.35 | Distance + angle to next shot |
| Safety (no scratch risk) | 0.15 | Cue ball away from pockets |
| Connectivity | 0.15 | Clear paths to multiple targets |

Position weight increases from current 0.30 to 0.35, reflecting that position play is now a primary objective.

## File Changes

| File | Change |
|------|--------|
| `src/game/ai/shotGenerator.ts` | Add `generatePositionAwareShots()` function |
| `src/game/ai/evaluator.ts` | Add `computeIdealZone()` and `scorePositionPlay()` functions |
| `src/game/ai/aiController.ts` | Replace `findBestConfirmedPot` logic to use position-aware candidates first |
| `src/game/ai/types.ts` | Add `PositionTarget` type |

## What Does NOT Change

- `fastPhysics.ts` — spin model already supports continuous values [0, 1]
- MCTS engine — position play only applies to confirmed-pot path
- Kick shots / cluster breaks — keep existing logic
- Safety shots — keep existing logic

## PositionTarget Type

```typescript
type PositionTarget = {
  ballId: number;
  pocketIndex: number;
  idealZone: Vector;
  zoneRadius: number;
  shotQuality: number; // how easy the next shot would be from idealZone
};
```

## Performance Budget

- Current: ~20 candidates per (target, pocket), 5 spins x 3-4 powers
- New: ~50 candidates per (target, pocket), 6 spins x 8 powers
- But: only generate position-aware candidates for top 3-5 (target, pocket) combos that already have confirmed pot paths
- Net: ~150-250 total simulations for position play (vs current ~100)
- Time budget: stays within 200ms MCTS limit since position play runs BEFORE MCTS (replaces the simple confirmed-pot search)

## Fallback

If no position-aware candidate produces a pot, fall back to the existing `generateShotCandidates()` with 5 spin presets. The position play system is an enhancement, not a replacement.

## Success Criteria

1. AI pots a ball AND cue ball ends within 50px of ideal zone in >60% of shots where a clear next target exists
2. AI does not regress on pot success rate (still pots when it could before)
3. No performance regression (decision time stays under 300ms)
