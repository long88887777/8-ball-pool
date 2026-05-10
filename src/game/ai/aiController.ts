import { BALL_RADIUS, PLAY_AREA, POCKETS, type Vector } from '../constants';
import type { BallGroup, EightBallState, PlayerIndex } from '../eightBallRules';
import type { AIDecision, MCTSConfig, ShotCandidate, TableState } from './types';
import { mctsSearch } from './mcts';
import { generateShotCandidates } from './shotGenerator';
import { simulateShot } from './fastPhysics';
import { evaluateState } from './evaluator';

const DEFAULT_CONFIG: MCTSConfig = {
  timeBudgetMs: 100,
  maxDepth: 3,
  explorationConstant: 1.41,
};

const PLACEMENT_GRID_SPACING = 30;
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
  const minX = PLAY_AREA.left + BALL_RADIUS;
  const maxX = PLAY_AREA.right - BALL_RADIUS;
  const minY = PLAY_AREA.top + BALL_RADIUS;
  const maxY = PLAY_AREA.bottom - BALL_RADIUS;

  const existingBalls: Vector[] = [];
  for (const [id, pos] of ballPositions) {
    if (id !== 0) existingBalls.push(pos);
  }

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
    const score = potCandidates.length > 0 ? potCandidates.length : candidates.length * 0.1;

    if (score > bestScore) {
      bestScore = score;
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
