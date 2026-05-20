import { BALL_RADIUS, POCKETS, PLAY_AREA, type Vector } from '../constants';
import type { BallGroup } from '../eightBallRules';
import type { GameRuleset } from '../gameRules';
import type { ShotCandidate } from './types';

const SOLIDS = [1, 2, 3, 4, 5, 6, 7];
const STRIPES = [9, 10, 11, 12, 13, 14, 15];
const NINE_BALLS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const SPIN_VARIANTS: Vector[] = [
  { x: 0, y: 0 },
  { x: 0, y: 0.7 },
  { x: 0, y: -0.7 },
  { x: -0.5, y: 0 },
  { x: 0.5, y: 0 },
];
const CLUSTER_RADIUS = BALL_RADIUS * 5;

export function getAILegalTargets(
  group: BallGroup | null,
  pocketedBallIds: number[],
  ruleset: GameRuleset = 'eight-ball',
): number[] {
  if (ruleset === 'nine-ball') {
    const next = NINE_BALLS.find((id) => !pocketedBallIds.includes(id));
    return next === undefined ? [] : [next];
  }

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
  ruleset: GameRuleset = 'eight-ball',
): ShotCandidate[] {
  const cuePos = ballPositions.get(0);
  if (!cuePos) return [];

  const legalTargets = getAILegalTargets(aiGroup, pocketedBallIds, ruleset);
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

      const totalDist = toGhostLen + toPocketLen;
      const minPower = Math.max(0.2, totalDist / 1200);
      const comfortPower = Math.min(0.75, totalDist / 700);
      const powerVariants = [
        minPower,
        Math.min(0.85, (minPower + comfortPower) / 2),
        comfortPower,
      ];

      const hasClusterNearTarget = hasNearbyCluster(targetPos, ballPositions, targetId);
      if (hasClusterNearTarget) {
        powerVariants.push(Math.min(0.9, comfortPower + 0.2));
      }

      for (const power of powerVariants) {
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

export function isOnTable(pos: Vector): boolean {
  return (
    pos.x >= PLAY_AREA.left + BALL_RADIUS &&
    pos.x <= PLAY_AREA.right - BALL_RADIUS &&
    pos.y >= PLAY_AREA.top + BALL_RADIUS &&
    pos.y <= PLAY_AREA.bottom - BALL_RADIUS
  );
}

function hasNearbyCluster(
  targetPos: Vector,
  ballPositions: Map<number, Vector>,
  excludeId: number,
): boolean {
  let nearby = 0;
  for (const [id, pos] of ballPositions) {
    if (id === 0 || id === excludeId) continue;
    if (Math.hypot(pos.x - targetPos.x, pos.y - targetPos.y) < CLUSTER_RADIUS) {
      nearby++;
    }
  }
  return nearby >= 2;
}

export function generateKickShots(
  ballPositions: Map<number, Vector>,
  aiGroup: BallGroup | null,
  pocketedBallIds: number[],
  ruleset: GameRuleset = 'eight-ball',
): ShotCandidate[] {
  const cuePos = ballPositions.get(0);
  if (!cuePos) return [];

  const legalTargets = getAILegalTargets(aiGroup, pocketedBallIds, ruleset);
  const candidates: ShotCandidate[] = [];

  for (const targetId of legalTargets) {
    const targetPos = ballPositions.get(targetId);
    if (!targetPos) continue;

    for (let pocketIndex = 0; pocketIndex < POCKETS.length; pocketIndex++) {
      const pocket = POCKETS[pocketIndex];
      const toPocketX = pocket.x - targetPos.x;
      const toPocketY = pocket.y - targetPos.y;
      const toPocketLen = Math.hypot(toPocketX, toPocketY);
      if (toPocketLen < 1) continue;

      const toPocketDir = { x: toPocketX / toPocketLen, y: toPocketY / toPocketLen };
      const ghostBall = {
        x: targetPos.x - toPocketDir.x * BALL_RADIUS * 2,
        y: targetPos.y - toPocketDir.y * BALL_RADIUS * 2,
      };

      if (!isOnTable(ghostBall)) continue;

      const kickShots = computeOneCushionKicks(cuePos, ghostBall, ballPositions);
      for (const kick of kickShots) {
        const totalDist = kick.distToCushion + kick.distToGhost;
        const power = Math.min(0.85, Math.max(0.35, totalDist / 600));
        candidates.push({
          targetBallId: targetId,
          pocketIndex,
          direction: kick.direction,
          power,
          spin: { x: 0, y: 0 },
          type: 'kick',
          ghostBallPos: ghostBall,
        });
      }
    }
  }

  return candidates;
}

function computeOneCushionKicks(
  cuePos: Vector,
  ghostBall: Vector,
  ballPositions: Map<number, Vector>,
): { direction: Vector; distToCushion: number; distToGhost: number }[] {
  const results: { direction: Vector; distToCushion: number; distToGhost: number }[] = [];
  const obstacles = Array.from(ballPositions.entries())
    .filter(([id]) => id !== 0)
    .map(([, pos]) => pos);

  const cushions = [
    { axis: 'x', value: PLAY_AREA.left + BALL_RADIUS, flipX: true, flipY: false },
    { axis: 'x', value: PLAY_AREA.right - BALL_RADIUS, flipX: true, flipY: false },
    { axis: 'y', value: PLAY_AREA.top + BALL_RADIUS, flipX: false, flipY: true },
    { axis: 'y', value: PLAY_AREA.bottom - BALL_RADIUS, flipX: false, flipY: true },
  ];

  for (const cushion of cushions) {
    let mirrorX = ghostBall.x;
    let mirrorY = ghostBall.y;

    if (cushion.axis === 'x') {
      mirrorX = 2 * cushion.value - ghostBall.x;
    } else {
      mirrorY = 2 * cushion.value - ghostBall.y;
    }

    const dx = mirrorX - cuePos.x;
    const dy = mirrorY - cuePos.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;

    const dir = { x: dx / len, y: dy / len };

    let cushionT: number;
    if (cushion.axis === 'x') {
      if (Math.abs(dir.x) < 0.01) continue;
      cushionT = (cushion.value - cuePos.x) / dir.x;
    } else {
      if (Math.abs(dir.y) < 0.01) continue;
      cushionT = (cushion.value - cuePos.y) / dir.y;
    }

    if (cushionT < 50) continue;

    const cushionPoint = { x: cuePos.x + dir.x * cushionT, y: cuePos.y + dir.y * cushionT };

    const margin = BALL_RADIUS * 3;
    if (cushion.axis === 'y') {
      if (cushionPoint.x < PLAY_AREA.left + margin || cushionPoint.x > PLAY_AREA.right - margin) {
        continue;
      }
    } else {
      if (cushionPoint.y < PLAY_AREA.top + margin || cushionPoint.y > PLAY_AREA.bottom - margin) {
        continue;
      }
    }

    const pathObstacles = obstacles.filter(
      (o) => Math.hypot(o.x - cuePos.x, o.y - cuePos.y) > BALL_RADIUS * 2,
    );
    if (!isPathClear(cuePos, cushionPoint, pathObstacles)) continue;

    const distToCushion = Math.hypot(cushionPoint.x - cuePos.x, cushionPoint.y - cuePos.y);
    const distToGhost = Math.hypot(ghostBall.x - cushionPoint.x, ghostBall.y - cushionPoint.y);

    if (distToCushion + distToGhost > 900) continue;

    results.push({ direction: dir, distToCushion, distToGhost });
  }

  return results;
}

export function generateClusterBreakShots(
  ballPositions: Map<number, Vector>,
  aiGroup: BallGroup | null,
  pocketedBallIds: number[],
  ruleset: GameRuleset = 'eight-ball',
): ShotCandidate[] {
  const cuePos = ballPositions.get(0);
  if (!cuePos) return [];

  const groupBalls =
    ruleset === 'nine-ball'
      ? getAILegalTargets(aiGroup, pocketedBallIds, ruleset)
      : aiGroup === 'solids' ? SOLIDS : aiGroup === 'stripes' ? STRIPES : [...SOLIDS, ...STRIPES];
  const remaining = groupBalls.filter((id) => !pocketedBallIds.includes(id));

  const clusterCenters: { center: Vector; ballIds: number[] }[] = [];
  const clusterDist = BALL_RADIUS * 4;

  for (const id of remaining) {
    const pos = ballPositions.get(id);
    if (!pos) continue;

    let neighbors = 0;
    const clusterBalls = [id];
    for (const otherId of remaining) {
      if (otherId === id) continue;
      const otherPos = ballPositions.get(otherId);
      if (!otherPos) continue;
      if (Math.hypot(pos.x - otherPos.x, pos.y - otherPos.y) < clusterDist) {
        neighbors++;
        clusterBalls.push(otherId);
      }
    }
    if (neighbors >= 2) {
      clusterCenters.push({ center: pos, ballIds: clusterBalls });
    }
  }

  if (clusterCenters.length === 0) return [];

  const candidates: ShotCandidate[] = [];
  const obstacles = Array.from(ballPositions.entries())
    .filter(([id]) => id !== 0)
    .map(([, pos]) => pos);
  const legalTargets = getAILegalTargets(aiGroup, pocketedBallIds, ruleset);

  for (const cluster of clusterCenters) {
    for (const targetId of cluster.ballIds) {
      if (!legalTargets.includes(targetId)) continue;
      const targetPos = ballPositions.get(targetId);
      if (!targetPos) continue;

      const dx = targetPos.x - cuePos.x;
      const dy = targetPos.y - cuePos.y;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;

      const direction = { x: dx / len, y: dy / len };

      const pathObstacles = obstacles.filter(
        (o) => Math.hypot(o.x - targetPos.x, o.y - targetPos.y) > 0.1 &&
               Math.hypot(o.x - cuePos.x, o.y - cuePos.y) > 0.1,
      );
      if (!isPathClear(cuePos, targetPos, pathObstacles)) continue;

      for (const power of [0.6, 0.75, 0.85]) {
        candidates.push({
          targetBallId: targetId,
          pocketIndex: -1,
          direction,
          power,
          spin: { x: 0, y: 0 },
          type: 'break_cluster',
          ghostBallPos: targetPos,
        });
      }
    }
  }

  return candidates;
}
