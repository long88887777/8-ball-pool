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
  if (remaining.length === 0) return [8];
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
    return generateSafetyCandidates(cuePos, legalTargets, ballPositions, obstacles);
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

    const pathObstacles = obstacles.filter(
      (o) => Math.hypot(o.x - targetPos.x, o.y - targetPos.y) > 0.1 &&
             Math.hypot(o.x - cuePos.x, o.y - cuePos.y) > 0.1,
    );
    if (!isPathClear(cuePos, targetPos, pathObstacles)) continue;

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
