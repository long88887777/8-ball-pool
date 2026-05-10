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
