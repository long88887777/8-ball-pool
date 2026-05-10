import { BALL_RADIUS, POCKETS, type Vector } from '../constants';
import type { PositionTarget } from './types';
import { isPathClear, isOnTable } from './shotGenerator';

const IDEAL_DISTANCE = 150;
const ZONE_RADIUS = 50;

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
