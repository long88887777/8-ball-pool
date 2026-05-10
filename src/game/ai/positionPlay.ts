import { BALL_RADIUS, POCKETS, type Vector } from '../constants';
import type { PositionTarget, ShotCandidate } from './types';
import { isPathClear, isOnTable } from './shotGenerator';

const IDEAL_DISTANCE = 150;
const ZONE_RADIUS = 50;
const MAX_CORRECTION = 1.2;
const SPIN_BASE_FACTOR = 0.22;
const SPIN_SIDE_FACTOR = 0.6;

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
    const baseSpin = deriveSpin(cuePos, ghostBallPos, direction, nextTarget.idealZone, targetPos);
    spinVariants = [
      baseSpin,
      { x: baseSpin.x * 0.6, y: baseSpin.y * 0.6 },
      { x: clampSpin(baseSpin.x * 1.4), y: clampSpin(baseSpin.y * 1.4) },
      { x: baseSpin.x * 0.3, y: baseSpin.y * 1.2 },
      { x: baseSpin.x * 1.2, y: baseSpin.y * 0.3 },
      { x: 0, y: 0 },
      { x: clampSpin(baseSpin.x * 0.8), y: clampSpin(baseSpin.y * 1.5) },
      { x: clampSpin(baseSpin.x * 1.5), y: clampSpin(baseSpin.y * 0.8) },
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

export function deriveSpin(
  cuePos: Vector,
  ghostBallPos: Vector,
  shotDirection: Vector,
  idealZone: Vector,
  targetPos?: Vector,
): Vector {
  // Collision normal: from ghost ball to target ball center (the actual contact normal)
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

  // Natural post-collision cue ball direction (tangent component of incoming velocity)
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

  // Desired direction: from ghost ball to ideal zone
  const toIdealX = idealZone.x - ghostBallPos.x;
  const toIdealY = idealZone.y - ghostBallPos.y;
  const toIdealLen = Math.hypot(toIdealX, toIdealY);
  if (toIdealLen < 1) return { x: 0, y: 0 };

  const idealDir = { x: toIdealX / toIdealLen, y: toIdealY / toIdealLen };

  // Correction vector: how much we need to deviate from natural path
  const correctionX = idealDir.x - naturalDir.x;
  const correctionY = idealDir.y - naturalDir.y;

  // Decompose into follow/draw (along shot axis) and side english (perpendicular)
  const followComponent = correctionX * shotDirection.x + correctionY * shotDirection.y;
  const perpX = -shotDirection.y;
  const perpY = shotDirection.x;
  const sideComponent = correctionX * perpX + correctionY * perpY;

  // Apply compensation: side spin is weaker in fastPhysics (0.6x factor)
  const sideCompensated = sideComponent / SPIN_SIDE_FACTOR;

  let spinY = Math.max(-1, Math.min(1, followComponent / MAX_CORRECTION));
  let spinX = Math.max(-1, Math.min(1, sideCompensated / MAX_CORRECTION));

  // Boost spin values for thin cuts where natural direction is strong
  // (the cue ball has more tangent velocity, needs more spin to overcome)
  const cutAngle = Math.acos(Math.min(1, Math.abs(dot)));
  if (cutAngle > 0.3) {
    const boost = 1 + cutAngle * 0.4;
    spinY = clampSpin(spinY * boost);
    spinX = clampSpin(spinX * boost);
  }

  return { x: spinX, y: spinY };
}
