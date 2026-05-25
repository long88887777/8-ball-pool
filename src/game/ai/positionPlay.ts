import { BALL_RADIUS, POCKETS, type Vector } from '../constants';
import type { GameRuleset } from '../gameRules';
import type { PositionTarget, ShotCandidate } from './types';
import { isPathClear, isOnTable } from './shotGenerator';

const IDEAL_DISTANCE = 150;
const ZONE_RADIUS = 50;
const MAX_RECOMMENDED_SPIN_MAGNITUDE = 0.85;
const FUTURE_ROUTE_DECAY = 0.7;

export function computeNextTarget(
  ballPositions: Map<number, Vector>,
  currentTargetId: number,
  legalTargets: number[],
  pocketedBallIds: number[],
  ruleset: GameRuleset = 'eight-ball',
): PositionTarget | null {
  const nextTargets = legalTargets.filter(
    (id) => id !== currentTargetId && !pocketedBallIds.includes(id),
  );
  if (ruleset === 'nine-ball' && nextTargets.length > 1) {
    nextTargets.sort((a, b) => a - b);
  }
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

export function scoreFuturePotRoute(
  ballPositions: Map<number, Vector>,
  legalTargets: number[],
  pocketedBallIds: number[],
  ruleset: GameRuleset = 'eight-ball',
  depth = 2,
): number {
  const cuePos = ballPositions.get(0);
  if (!cuePos || depth <= 0) return 0;

  const remainingTargets = legalTargets.filter((id) => !pocketedBallIds.includes(id));
  if (remainingTargets.length === 0) return 0.5;

  let best = 0;
  for (const targetId of remainingTargets) {
    const targetPos = ballPositions.get(targetId);
    if (!targetPos) continue;

    for (let pocketIndex = 0; pocketIndex < POCKETS.length; pocketIndex++) {
      const shotQuality = estimatePotQuality(ballPositions, cuePos, targetPos, pocketIndex);
      if (shotQuality <= 0) continue;

      const nextTargets = remainingTargets.filter((id) => id !== targetId);
      let futureScore = 0;
      if (depth > 1 && nextTargets.length > 0) {
        const nextTarget = computeNextTarget(
          ballPositions,
          targetId,
          remainingTargets,
          pocketedBallIds,
          ruleset,
        );
        if (nextTarget) {
          const nextPositions = new Map(ballPositions);
          nextPositions.delete(targetId);
          nextPositions.set(0, nextTarget.idealZone);
          futureScore = scoreFuturePotRoute(
            nextPositions,
            nextTargets,
            [...pocketedBallIds, targetId],
            ruleset,
            depth - 1,
          );
        }
      }

      best = Math.max(best, shotQuality * 0.75 + futureScore * FUTURE_ROUTE_DECAY * 0.25);
    }
  }

  return Math.max(0, Math.min(1, best));
}

const FALLBACK_SPINS: Vector[] = [
  { x: 0, y: 0 },
  { x: 0, y: 0.7 },
  { x: 0, y: -0.7 },
  { x: -0.5, y: 0 },
  { x: 0.5, y: 0 },
];

function estimatePotQuality(
  ballPositions: Map<number, Vector>,
  cuePos: Vector,
  targetPos: Vector,
  pocketIndex: number,
): number {
  const pocket = POCKETS[pocketIndex];
  const toPocketX = pocket.x - targetPos.x;
  const toPocketY = pocket.y - targetPos.y;
  const toPocketLen = Math.hypot(toPocketX, toPocketY);
  if (toPocketLen < 1) return 0;

  const toPocketDir = { x: toPocketX / toPocketLen, y: toPocketY / toPocketLen };
  const ghostBall = {
    x: targetPos.x - toPocketDir.x * BALL_RADIUS * 2,
    y: targetPos.y - toPocketDir.y * BALL_RADIUS * 2,
  };
  if (!isOnTable(ghostBall)) return 0;

  const obstacles = Array.from(ballPositions.entries())
    .filter(([, pos]) => (
      Math.hypot(pos.x - cuePos.x, pos.y - cuePos.y) > 0.1 &&
      Math.hypot(pos.x - targetPos.x, pos.y - targetPos.y) > 0.1
    ))
    .map(([, pos]) => pos);

  if (!isPathClear(cuePos, ghostBall, obstacles)) return 0;

  const ballToPocketObstacles = Array.from(ballPositions.entries())
    .filter(([, pos]) => Math.hypot(pos.x - targetPos.x, pos.y - targetPos.y) > 0.1)
    .map(([, pos]) => pos);
  if (!isPathClear(targetPos, pocket, ballToPocketObstacles)) return 0;

  const cueDist = Math.hypot(ghostBall.x - cuePos.x, ghostBall.y - cuePos.y);
  const totalDist = cueDist + toPocketLen;
  const distScore = Math.max(0.15, 1 - totalDist / 1200);
  const approachAngle = Math.atan2(ghostBall.y - cuePos.y, ghostBall.x - cuePos.x);
  const objectLineAngle = Math.atan2(toPocketDir.y, toPocketDir.x);
  let angleDiff = Math.abs(approachAngle - objectLineAngle);
  if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
  const cutScore = Math.max(0, 1 - angleDiff / (Math.PI * 0.7));

  return Math.max(0, Math.min(1, distScore * 0.45 + cutScore * 0.55));
}

export function generatePositionAwareShots(
  ballPositions: Map<number, Vector>,
  targetBallId: number,
  pocketIndex: number,
  legalTargets: number[],
  pocketedBallIds: number[],
  ruleset: GameRuleset = 'eight-ball',
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
    ballPositions, targetBallId, legalTargets, pocketedBallIds, ruleset,
  );

  let spinVariants: Vector[];
  if (nextTarget) {
    const baseSpin = limitSpinMagnitude(
      deriveSpin(cuePos, ghostBallPos, direction, nextTarget.idealZone, targetPos),
      MAX_RECOMMENDED_SPIN_MAGNITUDE,
    );
    spinVariants = [
      baseSpin,
      limitSpinMagnitude({ x: baseSpin.x * 0.8, y: baseSpin.y * 0.8 }, MAX_RECOMMENDED_SPIN_MAGNITUDE),
      limitSpinMagnitude({ x: baseSpin.x * 0.6, y: baseSpin.y * 0.6 }, MAX_RECOMMENDED_SPIN_MAGNITUDE),
      limitSpinMagnitude({ x: baseSpin.x * 0.35, y: baseSpin.y * 0.35 }, MAX_RECOMMENDED_SPIN_MAGNITUDE),
      limitSpinMagnitude({ x: baseSpin.x * 0.75, y: baseSpin.y * 0.55 }, MAX_RECOMMENDED_SPIN_MAGNITUDE),
      limitSpinMagnitude({ x: baseSpin.x * 0.55, y: baseSpin.y * 0.75 }, MAX_RECOMMENDED_SPIN_MAGNITUDE),
      { x: 0, y: 0 },
    ];
  } else {
    spinVariants = FALLBACK_SPINS;
  }

  const totalDist = toGhostLen + toPocketLen;
  const basePowerMin = Math.max(0.2, totalDist / 1200);
  const basePowerMax = Math.min(0.85, totalDist / 500);

  // Adjust power range based on spin intent
  let powerMin: number;
  let powerMax: number;
  if (nextTarget) {
    const baseSpin = spinVariants[0];
    if (baseSpin.y > 0.3) {
      // Follow: need more power for spin to take effect
      powerMin = Math.max(basePowerMin, 0.35);
      powerMax = Math.min(0.9, basePowerMax + 0.15);
    } else if (baseSpin.y < -0.3) {
      // Draw: moderate power, too much kills the backspin effect
      powerMin = Math.max(basePowerMin, 0.25);
      powerMax = Math.min(0.7, basePowerMax + 0.05);
    } else {
      powerMin = basePowerMin;
      powerMax = basePowerMax;
    }
  } else {
    powerMin = basePowerMin;
    powerMax = basePowerMax;
  }

  const powerSteps = 10;
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

function limitSpinMagnitude(spin: Vector, maxMagnitude: number): Vector {
  const magnitude = Math.hypot(spin.x, spin.y);
  if (magnitude <= maxMagnitude || magnitude < 0.001) {
    return { x: clampSpin(spin.x), y: clampSpin(spin.y) };
  }

  const scale = maxMagnitude / magnitude;
  return {
    x: clampSpin(spin.x * scale),
    y: clampSpin(spin.y * scale),
  };
}

export function deriveSpin(
  cuePos: Vector,
  ghostBallPos: Vector,
  shotDirection: Vector,
  idealZone: Vector,
  targetPos?: Vector,
): Vector {
  let collisionNormal: Vector;
  if (targetPos) {
    const nx = targetPos.x - ghostBallPos.x;
    const ny = targetPos.y - ghostBallPos.y;
    const nLen = Math.hypot(nx, ny);
    if (nLen < 0.001) {
      collisionNormal = { x: shotDirection.x, y: shotDirection.y };
    } else {
      collisionNormal = { x: nx / nLen, y: ny / nLen };
    }
  } else {
    const dx = ghostBallPos.x - cuePos.x;
    const dy = ghostBallPos.y - cuePos.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return { x: 0, y: 0 };
    collisionNormal = { x: dx / len, y: dy / len };
  }

  const dot = shotDirection.x * collisionNormal.x + shotDirection.y * collisionNormal.y;
  const tangentX = shotDirection.x - dot * collisionNormal.x;
  const tangentY = shotDirection.y - dot * collisionNormal.y;
  const tangentLen = Math.hypot(tangentX, tangentY);

  let naturalDir: Vector;
  if (tangentLen < 0.001) {
    // Head-on collision: cue ball stops (no natural direction)
    naturalDir = { x: 0, y: 0 };
  } else {
    naturalDir = { x: tangentX / tangentLen, y: tangentY / tangentLen };
  }

  const toIdealX = idealZone.x - ghostBallPos.x;
  const toIdealY = idealZone.y - ghostBallPos.y;
  const toIdealLen = Math.hypot(toIdealX, toIdealY);
  if (toIdealLen < 1) return { x: 0, y: 0 };

  const idealDir = { x: toIdealX / toIdealLen, y: toIdealY / toIdealLen };

  const correctionX = idealDir.x - naturalDir.x;
  const correctionY = idealDir.y - naturalDir.y;

  const followComponent = correctionX * shotDirection.x + correctionY * shotDirection.y;
  const perpX = -shotDirection.y;
  const perpY = shotDirection.x;
  const sideComponent = correctionX * perpX + correctionY * perpY;

  const sideCompensated = sideComponent / 0.6;

  let spinY = Math.max(-1, Math.min(1, followComponent / 1.2));
  let spinX = Math.max(-1, Math.min(1, sideCompensated / 1.2));

  const cutAngle = Math.acos(Math.min(1, Math.abs(dot)));
  if (cutAngle > 0.3) {
    const boost = 1 + cutAngle * 0.4;
    spinY = clampSpin(spinY * boost);
    spinX = clampSpin(spinX * boost);
  }

  return limitSpinMagnitude({ x: spinX, y: spinY }, MAX_RECOMMENDED_SPIN_MAGNITUDE);
}
