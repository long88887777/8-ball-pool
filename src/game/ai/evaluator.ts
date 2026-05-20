import { BALL_RADIUS, PLAY_AREA, POCKETS, type Vector } from '../constants';
import type { BallGroup, PlayerIndex } from '../eightBallRules';
import type { GameRuleset } from '../gameRules';
import type { TableState, FastSimResult, ShotCandidate } from './types';
import { getAILegalTargets, isPathClear } from './shotGenerator';

const SOLIDS = [1, 2, 3, 4, 5, 6, 7];
const STRIPES = [9, 10, 11, 12, 13, 14, 15];
const NINE_BALLS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const WEIGHT_POTTED = 0.45;
const WEIGHT_POSITION = 0.30;
const WEIGHT_CONNECTIVITY = 0.15;
const WEIGHT_SAFETY = 0.10;

export function evaluateState(
  stateBefore: TableState,
  simResult: FastSimResult,
  aiPlayer: PlayerIndex,
  aiGroup: BallGroup | null,
): number {
  if (stateBefore.ruleset === 'nine-ball') {
    return evaluateNineBallState(stateBefore, simResult);
  }

  const eightBallPotted = simResult.pocketedBalls.includes(8);

  if (eightBallPotted) {
    const groupBalls = getGroupBalls(aiGroup);
    const allGroupPocketed = groupBalls.every(
      (id) => stateBefore.pocketedBallIds.includes(id) || simResult.pocketedBalls.includes(id),
    );
    const noFoul = !simResult.cueBallPocketed && simResult.firstContact === 8;
    if (allGroupPocketed && noFoul) return 1.0;
    return 0.0;
  }

  const isFoul = checkFoul(simResult, aiGroup, stateBefore.pocketedBallIds);
  if (isFoul) {
    return 0.05;
  }

  const pottedScore = scorePottedBalls(simResult, aiGroup);
  const positionScore = scorePosition(simResult, aiGroup, stateBefore.pocketedBallIds);
  const connectivityScore = scoreConnectivity(simResult, aiGroup, stateBefore.pocketedBallIds);
  const safetyScore = scoreSafety(simResult, aiGroup);

  const raw =
    WEIGHT_POTTED * pottedScore +
    WEIGHT_POSITION * positionScore +
    WEIGHT_CONNECTIVITY * connectivityScore +
    WEIGHT_SAFETY * safetyScore;

  return Math.max(0.05, Math.min(0.95, raw));
}

export function evaluateWithPowerPenalty(
  stateBefore: TableState,
  simResult: FastSimResult,
  aiPlayer: PlayerIndex,
  aiGroup: BallGroup | null,
  shot: ShotCandidate,
): number {
  const base = evaluateState(stateBefore, simResult, aiPlayer, aiGroup);
  const breakoutBonus = evaluateBreakout(stateBefore, simResult, aiGroup);
  const powerPenalty = breakoutBonus > 0 ? 0 : shot.power * 0.08;
  return Math.max(0.05, base + breakoutBonus - powerPenalty);
}

function getGroupBalls(group: BallGroup | null): number[] {
  if (group === 'solids') return SOLIDS;
  if (group === 'stripes') return STRIPES;
  return [...SOLIDS, ...STRIPES];
}

function getOpponentBalls(group: BallGroup | null): number[] {
  if (group === 'solids') return STRIPES;
  if (group === 'stripes') return SOLIDS;
  return [];
}

function checkFoul(
  simResult: FastSimResult,
  aiGroup: BallGroup | null,
  pocketedBallIds: number[],
): boolean {
  if (simResult.cueBallPocketed) return true;
  if (simResult.firstContact === null) return true;

  if (aiGroup !== null) {
    const legalTargets = getAILegalTargets(aiGroup, pocketedBallIds);
    if (!legalTargets.includes(simResult.firstContact)) return true;
  }

  if (!simResult.cushionAfterContact && simResult.pocketedBalls.length === 0) return true;

  return false;
}

function scorePottedBalls(simResult: FastSimResult, aiGroup: BallGroup | null): number {
  const groupBalls = getGroupBalls(aiGroup);
  const opponentBalls = getOpponentBalls(aiGroup);

  let score = 0;
  for (const id of simResult.pocketedBalls) {
    if (groupBalls.includes(id)) score += 1.0;
    else if (opponentBalls.includes(id)) score -= 0.3;
  }

  if (score > 0) return Math.min(1, 0.6 + score * 0.2);
  if (score < 0) return 0.1;
  return 0.2;
}

function scorePosition(
  simResult: FastSimResult,
  aiGroup: BallGroup | null,
  pocketedBallIds: number[],
): number {
  const cuePos = simResult.ballPositions.get(0);
  if (!cuePos) return 0;

  const allPocketed = [...pocketedBallIds, ...simResult.pocketedBalls];
  const legalTargets = getAILegalTargets(aiGroup, allPocketed);
  if (legalTargets.length === 0) return 0.5;

  let minPocketDist = Infinity;
  for (const pocket of POCKETS) {
    const d = Math.hypot(cuePos.x - pocket.x, cuePos.y - pocket.y);
    if (d < minPocketDist) minPocketDist = d;
  }
  const scratchRisk = minPocketDist < BALL_RADIUS * 3 ? 0.3 : 0;

  const onTable =
    cuePos.x > PLAY_AREA.left + BALL_RADIUS &&
    cuePos.x < PLAY_AREA.right - BALL_RADIUS &&
    cuePos.y > PLAY_AREA.top + BALL_RADIUS &&
    cuePos.y < PLAY_AREA.bottom - BALL_RADIUS;
  if (!onTable) return 0;

  const obstacles: Vector[] = [];
  for (const [id, pos] of simResult.ballPositions) {
    if (id !== 0) obstacles.push(pos);
  }

  let bestShotQuality = 0;
  for (const targetId of legalTargets) {
    const targetPos = simResult.ballPositions.get(targetId);
    if (!targetPos) continue;

    for (const pocket of POCKETS) {
      const toPocketX = pocket.x - targetPos.x;
      const toPocketY = pocket.y - targetPos.y;
      const toPocketLen = Math.hypot(toPocketX, toPocketY);
      if (toPocketLen < 1) continue;

      const toPocketDir = { x: toPocketX / toPocketLen, y: toPocketY / toPocketLen };
      const ghostBall = {
        x: targetPos.x - toPocketDir.x * BALL_RADIUS * 2,
        y: targetPos.y - toPocketDir.y * BALL_RADIUS * 2,
      };

      const toGhostX = ghostBall.x - cuePos.x;
      const toGhostY = ghostBall.y - cuePos.y;
      const dist = Math.hypot(toGhostX, toGhostY);
      if (dist < BALL_RADIUS * 2) continue;

      const idealDist = 150;
      const distScore = dist < idealDist
        ? 0.8 + 0.2 * (dist / idealDist)
        : Math.max(0.1, 1 - (dist - idealDist) / 600);

      const approachAngle = Math.atan2(toGhostY, toGhostX);
      const pocketAngle = Math.atan2(-toPocketDir.y, -toPocketDir.x);
      let angleDiff = Math.abs(approachAngle - pocketAngle);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
      const angleScore = angleDiff < Math.PI / 4
        ? 1 - angleDiff / (Math.PI / 2)
        : Math.max(0, 0.5 - angleDiff / Math.PI);

      const quality = distScore * 0.5 + angleScore * 0.5;
      if (quality > bestShotQuality) bestShotQuality = quality;
    }
  }

  return Math.max(0, bestShotQuality - scratchRisk);
}

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

function scoreConnectivity(
  simResult: FastSimResult,
  aiGroup: BallGroup | null,
  pocketedBallIds: number[],
): number {
  const cuePos = simResult.ballPositions.get(0);
  if (!cuePos) return 0;

  const allPocketed = [...pocketedBallIds, ...simResult.pocketedBalls];
  const legalTargets = getAILegalTargets(aiGroup, allPocketed);

  const obstacles: Vector[] = [];
  for (const [id, pos] of simResult.ballPositions) {
    if (id !== 0) obstacles.push(pos);
  }

  let clearPaths = 0;
  for (const targetId of legalTargets) {
    const targetPos = simResult.ballPositions.get(targetId);
    if (!targetPos) continue;

    const filteredObstacles = obstacles.filter(
      (o) => Math.hypot(o.x - targetPos.x, o.y - targetPos.y) > 0.1,
    );
    if (isPathClear(cuePos, targetPos, filteredObstacles)) {
      clearPaths++;
    }
  }

  if (legalTargets.length === 0) return 0.5;
  return Math.min(1, clearPaths / Math.max(1, legalTargets.length));
}

function scoreSafety(simResult: FastSimResult, aiGroup: BallGroup | null): number {
  const cuePos = simResult.ballPositions.get(0);
  if (!cuePos) return 0;

  let minPocketDist = Infinity;
  for (const pocket of POCKETS) {
    const dist = Math.hypot(cuePos.x - pocket.x, cuePos.y - pocket.y);
    if (dist < minPocketDist) minPocketDist = dist;
  }

  const safeDistance = minPocketDist > BALL_RADIUS * 4 ? 1 : minPocketDist / (BALL_RADIUS * 4);
  return safeDistance;
}

export function detectClusters(
  ballPositions: Map<number, Vector>,
  aiGroup: BallGroup | null,
  pocketedBallIds: number[],
  ruleset: GameRuleset = 'eight-ball',
): Vector[] {
  const groupBalls = ruleset === 'nine-ball'
    ? NINE_BALLS
    : aiGroup === 'solids' ? SOLIDS : aiGroup === 'stripes' ? STRIPES : [...SOLIDS, ...STRIPES];
  const remaining = groupBalls.filter((id) => !pocketedBallIds.includes(id));

  const clusters: Vector[] = [];
  const clusterDist = BALL_RADIUS * 4;

  for (const id of remaining) {
    const pos = ballPositions.get(id);
    if (!pos) continue;

    let neighbors = 0;
    for (const otherId of remaining) {
      if (otherId === id) continue;
      const otherPos = ballPositions.get(otherId);
      if (!otherPos) continue;
      if (Math.hypot(pos.x - otherPos.x, pos.y - otherPos.y) < clusterDist) {
        neighbors++;
      }
    }

    if (neighbors >= 2) {
      clusters.push(pos);
    }
  }

  return clusters;
}

export function evaluateBreakout(
  stateBefore: TableState,
  simResult: FastSimResult,
  aiGroup: BallGroup | null,
): number {
  const clustersBefore = detectClusters(
    stateBefore.ballPositions,
    aiGroup,
    stateBefore.pocketedBallIds,
    stateBefore.ruleset,
  );
  if (clustersBefore.length === 0) return 0;

  const clustersAfter = detectClusters(
    simResult.ballPositions,
    aiGroup,
    [...stateBefore.pocketedBallIds, ...simResult.pocketedBalls],
    stateBefore.ruleset,
  );

  const improvement = clustersBefore.length - clustersAfter.length;
  return Math.max(0, improvement * 0.15);
}

function evaluateNineBallState(stateBefore: TableState, simResult: FastSimResult): number {
  if (simResult.cueBallPocketed || simResult.firstContact === null) {
    return 0.05;
  }

  const lowest = NINE_BALLS.find((id) => !stateBefore.pocketedBallIds.includes(id));
  if (simResult.firstContact !== lowest) {
    return 0.05;
  }

  if (simResult.pocketedBalls.includes(9)) {
    return 1;
  }

  const legalPocketed = simResult.pocketedBalls.some((id) => id !== 0);
  if (legalPocketed) {
    return 0.72;
  }

  return simResult.cushionAfterContact ? 0.38 : 0.2;
}
