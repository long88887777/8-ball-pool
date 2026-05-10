import { BALL_RADIUS, PLAY_AREA, POCKETS, type Vector } from '../constants';
import type { BallGroup, EightBallState, PlayerIndex } from '../eightBallRules';
import type { AIDecision, MCTSConfig, ShotCandidate, TableState } from './types';
import { mctsSearch } from './mcts';
import { generateShotCandidates, generateKickShots, generateClusterBreakShots, getAILegalTargets, isPathClear, isOnTable } from './shotGenerator';
import { simulateShot } from './fastPhysics';
import { evaluateState, evaluateWithPowerPenalty, scorePositionPlay } from './evaluator';
import { generatePositionAwareShots, computeNextTarget } from './positionPlay';

const DEFAULT_CONFIG: MCTSConfig = {
  timeBudgetMs: 200,
  maxDepth: 3,
  explorationConstant: 1.41,
};

const PLACEMENT_GRID_SPACING = 40;
const PLACEMENT_MIN_BALL_DIST = BALL_RADIUS * 2 + 4;
const PLACEMENT_MIN_POCKET_DIST = 50;

export class AIController {
  private config: MCTSConfig;

  constructor(config?: MCTSConfig) {
    this.config = config ?? DEFAULT_CONFIG;
  }

  computeDecision(
    ballPositions: Map<number, Vector>,
    rules: EightBallState,
  ): AIDecision | null {
    const aiPlayer: PlayerIndex = rules.currentPlayer;
    const aiGroup: BallGroup | null = rules.players[aiPlayer].group;
    const pocketedBallIds = rules.pocketedBallIds;

    let positions = ballPositions;
    let placementPosition: Vector | undefined;

    if (rules.cueBallInHand) {
      placementPosition = computeBestPlacement(ballPositions, aiGroup, pocketedBallIds);
      positions = new Map(ballPositions);
      positions.set(0, placementPosition);
    }

    const state: TableState = {
      ballPositions: positions,
      pocketedBallIds,
      currentPlayer: aiPlayer,
      playerGroups: [rules.players[0].group, rules.players[1].group],
    };

    const directShot = this.findBestConfirmedPot(state, aiPlayer, aiGroup, pocketedBallIds);
    if (directShot) {
      return { shot: directShot, placementPosition };
    }

    const kickShot = this.findBestKickShot(state, aiPlayer, aiGroup, pocketedBallIds);
    const clusterShot = this.findBestClusterBreak(state, aiPlayer, aiGroup, pocketedBallIds);

    const bestAlternative = this.pickBestAlternative(kickShot, clusterShot);
    if (bestAlternative) {
      return { shot: bestAlternative, placementPosition };
    }

    const mctsShot = mctsSearch(state, aiPlayer, aiGroup, pocketedBallIds, this.config);
    if (mctsShot) {
      return { shot: mctsShot, placementPosition };
    }

    const fallbackShot = this.fallbackSearch(state, aiPlayer, aiGroup, pocketedBallIds);
    if (fallbackShot) {
      return { shot: fallbackShot, placementPosition };
    }

    return null;
  }

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

  private findBestKickShot(
    state: TableState,
    aiPlayer: PlayerIndex,
    aiGroup: BallGroup | null,
    pocketedBallIds: number[],
  ): { shot: ShotCandidate; score: number } | null {
    const kickCandidates = generateKickShots(state.ballPositions, aiGroup, pocketedBallIds);
    if (kickCandidates.length === 0) return null;

    let bestShot: ShotCandidate | null = null;
    let bestScore = -Infinity;

    for (const candidate of kickCandidates.slice(0, 30)) {
      const simResult = simulateShot(
        state.ballPositions,
        candidate.direction,
        candidate.power,
        candidate.spin,
      );

      if (simResult.cueBallPocketed) continue;

      const potted = simResult.pocketedBalls.length > 0;
      let score: number;
      if (potted) {
        score = evaluateState(state, simResult, aiPlayer, aiGroup) + 0.2;
      } else {
        score = evaluateState(state, simResult, aiPlayer, aiGroup) * 0.5;
      }

      if (score > bestScore) {
        bestScore = score;
        bestShot = candidate;
      }
    }

    if (!bestShot) return null;
    return { shot: bestShot, score: bestScore };
  }

  private findBestClusterBreak(
    state: TableState,
    aiPlayer: PlayerIndex,
    aiGroup: BallGroup | null,
    pocketedBallIds: number[],
  ): { shot: ShotCandidate; score: number } | null {
    const breakCandidates = generateClusterBreakShots(state.ballPositions, aiGroup, pocketedBallIds);
    if (breakCandidates.length === 0) return null;

    let bestShot: ShotCandidate | null = null;
    let bestScore = -Infinity;

    for (const candidate of breakCandidates) {
      const simResult = simulateShot(
        state.ballPositions,
        candidate.direction,
        candidate.power,
        candidate.spin,
      );

      if (simResult.cueBallPocketed) continue;

      const score = evaluateState(state, simResult, aiPlayer, aiGroup);
      if (score > bestScore) {
        bestScore = score;
        bestShot = candidate;
      }
    }

    if (!bestShot) return null;
    return { shot: bestShot, score: bestScore };
  }

  private pickBestAlternative(
    kickResult: { shot: ShotCandidate; score: number } | null,
    clusterResult: { shot: ShotCandidate; score: number } | null,
  ): ShotCandidate | null {
    if (!kickResult && !clusterResult) return null;
    if (!kickResult) return clusterResult!.shot;
    if (!clusterResult) return kickResult.shot;
    return kickResult.score >= clusterResult.score ? kickResult.shot : clusterResult.shot;
  }

  private fallbackSearch(
    state: TableState,
    aiPlayer: PlayerIndex,
    aiGroup: BallGroup | null,
    pocketedBallIds: number[],
  ): ShotCandidate | null {
    const candidates = generateShotCandidates(state.ballPositions, aiGroup, pocketedBallIds);
    if (candidates.length === 0) return null;

    const top = candidates.slice(0, 20);
    let bestShot: ShotCandidate | null = null;
    let bestScore = -Infinity;

    for (const candidate of top) {
      const simResult = simulateShot(
        state.ballPositions,
        candidate.direction,
        candidate.power,
        candidate.spin,
      );
      const score = evaluateState(state, simResult, aiPlayer, aiGroup);
      if (score > bestScore) {
        bestScore = score;
        bestShot = candidate;
      }
    }

    return bestShot;
  }
}

export function computeBestPlacement(
  ballPositions: Map<number, Vector>,
  aiGroup: BallGroup | null,
  pocketedBallIds: number[],
): Vector {
  const existingBalls: Vector[] = [];
  for (const [id, pos] of ballPositions) {
    if (id !== 0) existingBalls.push(pos);
  }

  const idealPlacements = computeIdealPlacements(ballPositions, aiGroup, pocketedBallIds, existingBalls);

  if (idealPlacements.length > 0) {
    const positionsWithCue = new Map(ballPositions);
    let bestPoint = idealPlacements[0].point;
    let bestScore = -Infinity;

    for (const { point, shotDifficulty } of idealPlacements) {
      positionsWithCue.set(0, point);
      const candidates = generateShotCandidates(positionsWithCue, aiGroup, pocketedBallIds);
      const potCandidates = candidates.filter((c) => c.type === 'pot');
      if (potCandidates.length === 0) continue;

      let confirmedPot = false;
      for (const candidate of potCandidates.slice(0, 3)) {
        const simResult = simulateShot(
          positionsWithCue,
          candidate.direction,
          candidate.power,
          candidate.spin,
        );
        if (simResult.pocketedBalls.length > 0 && !simResult.cueBallPocketed) {
          confirmedPot = true;
          break;
        }
      }

      if (!confirmedPot) continue;

      const score = 2.0 - shotDifficulty;
      if (score > bestScore) {
        bestScore = score;
        bestPoint = point;
      }
    }

    if (bestScore > 0) return bestPoint;
  }

  return gridFallbackPlacement(ballPositions, aiGroup, pocketedBallIds, existingBalls);
}

function computeIdealPlacements(
  ballPositions: Map<number, Vector>,
  aiGroup: BallGroup | null,
  pocketedBallIds: number[],
  existingBalls: Vector[],
): { point: Vector; shotDifficulty: number }[] {
  const legalTargets = getAILegalTargets(aiGroup, pocketedBallIds);
  const results: { point: Vector; shotDifficulty: number }[] = [];

  const obstacles = existingBalls;

  for (const targetId of legalTargets) {
    const targetPos = ballPositions.get(targetId);
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

      if (!isOnTable(ghostBall)) continue;

      const ballToPocketObstacles = obstacles.filter(
        (o) => Math.hypot(o.x - targetPos.x, o.y - targetPos.y) > 0.1,
      );
      if (!isPathClear(targetPos, pocket, ballToPocketObstacles)) continue;

      const behindX = -toPocketDir.x;
      const behindY = -toPocketDir.y;

      for (const dist of [100, 150, 200, 250]) {
        const point = {
          x: ghostBall.x + behindX * dist,
          y: ghostBall.y + behindY * dist,
        };

        if (!isOnTable(point)) continue;
        if (!isValidPlacement(point, existingBalls)) continue;

        const pathObstacles = obstacles.filter(
          (o) => Math.hypot(o.x - targetPos.x, o.y - targetPos.y) > 0.1 &&
                 Math.hypot(o.x - point.x, o.y - point.y) > 0.1,
        );
        if (!isPathClear(point, ghostBall, pathObstacles)) continue;

        const idealDist = 150;
        const distPenalty = Math.abs(dist - idealDist) / 300;
        results.push({ point, shotDifficulty: distPenalty });
      }

      const perpX = -behindY;
      const perpY = behindX;
      for (const offset of [-40, 40]) {
        const point = {
          x: ghostBall.x + behindX * 150 + perpX * offset,
          y: ghostBall.y + behindY * 150 + perpY * offset,
        };

        if (!isOnTable(point)) continue;
        if (!isValidPlacement(point, existingBalls)) continue;

        const pathObstacles = obstacles.filter(
          (o) => Math.hypot(o.x - targetPos.x, o.y - targetPos.y) > 0.1 &&
                 Math.hypot(o.x - point.x, o.y - point.y) > 0.1,
        );
        if (!isPathClear(point, ghostBall, pathObstacles)) continue;

        const cutAngle = Math.abs(offset) / 150;
        results.push({ point, shotDifficulty: 0.3 + cutAngle });
      }
    }
  }

  results.sort((a, b) => a.shotDifficulty - b.shotDifficulty);
  return results.slice(0, 20);
}

function gridFallbackPlacement(
  ballPositions: Map<number, Vector>,
  aiGroup: BallGroup | null,
  pocketedBallIds: number[],
  existingBalls: Vector[],
): Vector {
  const minX = PLAY_AREA.left + BALL_RADIUS;
  const maxX = PLAY_AREA.right - BALL_RADIUS;
  const minY = PLAY_AREA.top + BALL_RADIUS;
  const maxY = PLAY_AREA.bottom - BALL_RADIUS;

  const validPoints: Vector[] = [];
  for (let x = minX; x <= maxX; x += PLACEMENT_GRID_SPACING) {
    for (let y = minY; y <= maxY; y += PLACEMENT_GRID_SPACING) {
      const point = { x, y };
      if (!isValidPlacement(point, existingBalls)) continue;
      validPoints.push(point);
    }
  }

  if (validPoints.length === 0) {
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  }

  let bestPoint = validPoints[0];
  let bestScore = -Infinity;
  const positionsWithCue = new Map(ballPositions);

  for (const point of validPoints) {
    positionsWithCue.set(0, point);
    const candidates = generateShotCandidates(positionsWithCue, aiGroup, pocketedBallIds);
    const potCandidates = candidates.filter((c) => c.type === 'pot');

    if (potCandidates.length === 0) {
      const safetyScore = candidates.length * 0.01;
      if (safetyScore > bestScore) {
        bestScore = safetyScore;
        bestPoint = point;
      }
      continue;
    }

    let topShotScore = 0;
    for (const candidate of potCandidates.slice(0, 5)) {
      const simResult = simulateShot(
        positionsWithCue,
        candidate.direction,
        candidate.power,
        candidate.spin,
      );
      if (simResult.pocketedBalls.length === 0) continue;
      if (simResult.cueBallPocketed) continue;

      const dist = Math.hypot(
        candidate.ghostBallPos.x - point.x,
        candidate.ghostBallPos.y - point.y,
      );
      const distBonus = dist < 200 ? 0.3 * (1 - dist / 200) : 0;
      const powerBonus = 0.1 * (1 - candidate.power);
      const shotScore = 1.0 + distBonus + powerBonus;

      if (shotScore > topShotScore) topShotScore = shotScore;
    }

    if (topShotScore > bestScore) {
      bestScore = topShotScore;
      bestPoint = point;
    }
  }

  return bestPoint;
}

function isValidPlacement(point: Vector, existingBalls: Vector[]): boolean {
  for (const pocket of POCKETS) {
    if (Math.hypot(point.x - pocket.x, point.y - pocket.y) < PLACEMENT_MIN_POCKET_DIST) {
      return false;
    }
  }

  for (const ball of existingBalls) {
    if (Math.hypot(point.x - ball.x, point.y - ball.y) < PLACEMENT_MIN_BALL_DIST) {
      return false;
    }
  }

  return true;
}
