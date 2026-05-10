import { BALL_RADIUS, POCKETS, type Vector } from '../constants';
import type { BallGroup, PlayerIndex } from '../eightBallRules';
import type { TableState, FastSimResult } from './types';
import { getAILegalTargets, isPathClear } from './shotGenerator';

const SOLIDS = [1, 2, 3, 4, 5, 6, 7];
const STRIPES = [9, 10, 11, 12, 13, 14, 15];

const WEIGHT_POTTED = 0.35;
const WEIGHT_POSITION = 0.30;
const WEIGHT_CONNECTIVITY = 0.20;
const WEIGHT_SAFETY = 0.10;
const FOUL_PENALTY = 0.15;

export function evaluateState(
  stateBefore: TableState,
  simResult: FastSimResult,
  aiPlayer: PlayerIndex,
  aiGroup: BallGroup | null,
): number {
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
    return Math.max(0.0, FOUL_PENALTY);
  }

  const pottedScore = scorePottedBalls(simResult, aiGroup);
  const positionScore = scorePosition(simResult);
  const connectivityScore = scoreConnectivity(simResult, aiGroup, stateBefore.pocketedBallIds);
  const safetyScore = scoreSafety(simResult, aiGroup);

  const raw =
    WEIGHT_POTTED * pottedScore +
    WEIGHT_POSITION * positionScore +
    WEIGHT_CONNECTIVITY * connectivityScore +
    WEIGHT_SAFETY * safetyScore;

  return Math.max(0.0, Math.min(1.0, 0.3 + raw * 0.6));
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
    else if (opponentBalls.includes(id)) score -= 0.5;
  }

  return Math.max(0, Math.min(1, score / 2));
}

function scorePosition(simResult: FastSimResult): number {
  const cuePos = simResult.ballPositions.get(0);
  if (!cuePos) return 0;

  const centerX = 550;
  const centerY = 320;
  const maxDist = Math.hypot(550 - 74, 320 - 74);
  const dist = Math.hypot(cuePos.x - centerX, cuePos.y - centerY);

  return 1 - dist / maxDist;
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

  let minDistToPocket = Infinity;
  for (const pocket of POCKETS) {
    const dist = Math.hypot(cuePos.x - pocket.x, cuePos.y - pocket.y);
    if (dist < minDistToPocket) minDistToPocket = dist;
  }

  const safeDistance = minDistToPocket > BALL_RADIUS * 4 ? 1 : minDistToPocket / (BALL_RADIUS * 4);
  return safeDistance;
}
