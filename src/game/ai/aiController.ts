import { BALL_RADIUS, PLAY_AREA, POCKETS, type Vector } from '../constants';
import type { BallGroup, EightBallState, PlayerIndex } from '../eightBallRules';
import type { GameRuleset } from '../gameRules';
import type { NineBallState } from '../nineBallRules';
import type { AIDecision, MCTSConfig, ShotCandidate, TableState } from './types';
import { mctsSearch } from './mcts';
import { generateShotCandidates, generateKickShots, generateClusterBreakShots, getAILegalTargets, isPathClear, isOnTable } from './shotGenerator';
import { simulateShot } from './fastPhysics';
import { evaluateState, scorePositionPlay } from './evaluator';
import { generatePositionAwareShots, computeNextTarget } from './positionPlay';
import {
  applyDifficultyToDecision,
  getAIDifficultyProfile,
  type AIDifficulty,
  type AIDifficultyProfile,
  type RandomSource,
} from './difficulty';

const DEFAULT_CONFIG: MCTSConfig = {
  timeBudgetMs: 200,
  maxDepth: 3,
  explorationConstant: 1.41,
};

const LEGACY_HARD_PROFILE: AIDifficultyProfile = {
  ...getAIDifficultyProfile('hard'),
  aimErrorRadians: 0,
  powerError: 0,
  spinError: 0,
};

const PLACEMENT_GRID_SPACING = 40;
const PLACEMENT_MIN_BALL_DIST = BALL_RADIUS * 2 + 4;
const PLACEMENT_MIN_POCKET_DIST = 50;

export class AIController {
  private config: MCTSConfig;
  private difficultyProfile: AIDifficultyProfile;
  private rng: RandomSource;

  constructor(config?: MCTSConfig | {
    difficulty?: AIDifficulty;
    config?: MCTSConfig;
    rng?: RandomSource;
  }) {
    if (isControllerOptions(config)) {
      this.difficultyProfile = getAIDifficultyProfile(config.difficulty ?? 'hard');
      this.config = config.config ?? this.difficultyProfile.mctsConfig;
      this.rng = config.rng ?? Math.random;
    } else {
      this.difficultyProfile = LEGACY_HARD_PROFILE;
      this.config = config ?? DEFAULT_CONFIG;
      this.rng = Math.random;
    }
  }

  computeDecision(
    ballPositions: Map<number, Vector>,
    rules: EightBallState,
    ruleset: GameRuleset = 'eight-ball',
    nineBallRules?: NineBallState,
  ): AIDecision | null {
    const aiPlayer: PlayerIndex = ruleset === 'nine-ball' && nineBallRules ? nineBallRules.currentPlayer : rules.currentPlayer;
    const aiGroup: BallGroup | null = ruleset === 'nine-ball' ? null : rules.players[aiPlayer].group;
    const pocketedBallIds = ruleset === 'nine-ball' && nineBallRules ? nineBallRules.pocketedBallIds : rules.pocketedBallIds;
    const cueBallInHand = ruleset === 'nine-ball' && nineBallRules ? nineBallRules.cueBallInHand : rules.cueBallInHand;

    let positions = ballPositions;
    let placementPosition: Vector | undefined;

    if (cueBallInHand) {
      placementPosition = computeBestPlacement(ballPositions, aiGroup, pocketedBallIds, ruleset);
      positions = new Map(ballPositions);
      positions.set(0, placementPosition);
    }

    const state: TableState = {
      ballPositions: positions,
      pocketedBallIds,
      currentPlayer: aiPlayer,
      playerGroups: [rules.players[0].group, rules.players[1].group],
      ruleset,
    };

    const directShot = this.findBestConfirmedPot(state, aiPlayer, aiGroup, pocketedBallIds);
    if (directShot) {
      return this.createDecision(directShot, placementPosition);
    }

    const kickShot = this.findBestKickShot(state, aiPlayer, aiGroup, pocketedBallIds);
    const clusterShot = this.findBestClusterBreak(state, aiPlayer, aiGroup, pocketedBallIds);

    const bestAlternative = this.pickBestAlternative(kickShot, clusterShot);
    if (bestAlternative) {
      return this.createDecision(bestAlternative, placementPosition);
    }

    const mctsShot = mctsSearch(state, aiPlayer, aiGroup, pocketedBallIds, this.config);
    if (mctsShot) {
      return this.createDecision(mctsShot, placementPosition);
    }

    const fallbackShot = this.fallbackSearch(state, aiPlayer, aiGroup, pocketedBallIds);
    if (fallbackShot) {
      return this.createDecision(fallbackShot, placementPosition);
    }

    return null;
  }

  private createDecision(shot: ShotCandidate, placementPosition?: Vector): AIDecision {
    return applyDifficultyToDecision({ shot, placementPosition }, this.difficultyProfile, this.rng);
  }

  private personalityBias(candidate: ShotCandidate): number {
    if (candidate.type === 'safety') {
      return this.difficultyProfile.safetyBias;
    }
    if (candidate.type === 'pot') {
      return this.difficultyProfile.riskTolerance;
    }
    if (candidate.type === 'kick' || candidate.type === 'break_cluster') {
      return this.difficultyProfile.riskTolerance * 0.5;
    }
    return 0;
  }

  private findBestConfirmedPot(
    state: TableState,
    aiPlayer: PlayerIndex,
    aiGroup: BallGroup | null,
    pocketedBallIds: number[],
  ): ShotCandidate | null {
    const candidates = generateShotCandidates(state.ballPositions, aiGroup, pocketedBallIds, state.ruleset);
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
    const legalTargets = getAILegalTargets(aiGroup, pocketedBallIds, state.ruleset);
    let bestShot: ShotCandidate | null = null;
    let bestScore = -Infinity;

    for (const { targetBallId, pocketIndex } of confirmedPots.slice(0, 5)) {
      const positionCandidates = generatePositionAwareShots(
        state.ballPositions,
        targetBallId,
        pocketIndex,
        legalTargets,
        pocketedBallIds,
        state.ruleset,
      );

      const nextTarget = computeNextTarget(
        state.ballPositions,
        targetBallId,
        legalTargets,
        pocketedBallIds,
        state.ruleset,
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

        const posScore = scorePositionPlay(simResult, idealZone, zoneRadius);
        const cueEnd = simResult.ballPositions.get(0);
        let safetyScore = 1.0;
        if (cueEnd) {
          let minPocketDist = Infinity;
          for (const pocket of POCKETS) {
            const d = Math.hypot(cueEnd.x - pocket.x, cueEnd.y - pocket.y);
            if (d < minPocketDist) minPocketDist = d;
          }
          safetyScore = minPocketDist > BALL_RADIUS * 4 ? 1 : minPocketDist / (BALL_RADIUS * 4);
        }
        const powerPenalty = candidate.power * 0.03;

        // Position play is the primary objective once pot is confirmed
        const score = posScore * 0.55 + safetyScore * 0.15 + 0.3 - powerPenalty + this.personalityBias(candidate);

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
    const kickCandidates = generateKickShots(state.ballPositions, aiGroup, pocketedBallIds, state.ruleset);
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
        score = evaluateState(state, simResult, aiPlayer, aiGroup) + 0.2 + this.personalityBias(candidate);
      } else {
        score = evaluateState(state, simResult, aiPlayer, aiGroup) * 0.5 + this.personalityBias(candidate);
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
    const breakCandidates = generateClusterBreakShots(state.ballPositions, aiGroup, pocketedBallIds, state.ruleset);
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

      const score = evaluateState(state, simResult, aiPlayer, aiGroup) + this.personalityBias(candidate);
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
    const candidates = generateShotCandidates(state.ballPositions, aiGroup, pocketedBallIds, state.ruleset);
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
      const score = evaluateState(state, simResult, aiPlayer, aiGroup) + this.personalityBias(candidate);
      if (score > bestScore) {
        bestScore = score;
        bestShot = candidate;
      }
    }

    return bestShot;
  }
}

function isControllerOptions(value: MCTSConfig | {
  difficulty?: AIDifficulty;
  config?: MCTSConfig;
  rng?: RandomSource;
} | undefined): value is {
  difficulty?: AIDifficulty;
  config?: MCTSConfig;
  rng?: RandomSource;
} {
  return Boolean(
    value &&
    ('difficulty' in value || 'config' in value || 'rng' in value)
  );
}

export function computeBestPlacement(
  ballPositions: Map<number, Vector>,
  aiGroup: BallGroup | null,
  pocketedBallIds: number[],
  ruleset: GameRuleset = 'eight-ball',
): Vector {
  const existingBalls: Vector[] = [];
  for (const [id, pos] of ballPositions) {
    if (id !== 0) existingBalls.push(pos);
  }

  const idealPlacements = computeIdealPlacements(ballPositions, aiGroup, pocketedBallIds, existingBalls, ruleset);

  if (idealPlacements.length > 0) {
    const positionsWithCue = new Map(ballPositions);
    let bestPoint = idealPlacements[0].point;
    let bestScore = -Infinity;

    for (const { point, shotDifficulty } of idealPlacements) {
      positionsWithCue.set(0, point);
      const candidates = generateShotCandidates(positionsWithCue, aiGroup, pocketedBallIds, ruleset);
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

  return gridFallbackPlacement(ballPositions, aiGroup, pocketedBallIds, existingBalls, ruleset);
}

function computeIdealPlacements(
  ballPositions: Map<number, Vector>,
  aiGroup: BallGroup | null,
  pocketedBallIds: number[],
  existingBalls: Vector[],
  ruleset: GameRuleset,
): { point: Vector; shotDifficulty: number }[] {
  const legalTargets = getAILegalTargets(aiGroup, pocketedBallIds, ruleset);
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
  ruleset: GameRuleset,
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
    const candidates = generateShotCandidates(positionsWithCue, aiGroup, pocketedBallIds, ruleset);
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
