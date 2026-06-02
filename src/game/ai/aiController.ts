import { BALL_RADIUS, PLAY_AREA, POCKETS, RACK_CENTER, TABLE, type Vector } from '../constants';
import type { BallGroup, EightBallState, PlayerIndex } from '../eightBallRules';
import type { GameRuleset } from '../gameRules';
import { breakLineX, clampBreakCuePosition, createNineBallRack, createTriangleRack } from '../geometry';
import type { NineBallState } from '../nineBallRules';
import type { AIDecision, MCTSConfig, ShotCandidate, TableState } from './types';
import { mctsSearch } from './mcts';
import { generateShotCandidates, generateKickShots, generateClusterBreakShots, getAILegalTargets, isPathClear, isOnTable } from './shotGenerator';
import { simulateProShot as simulateShot } from './proPhysicsSimulator';
import { evaluateState, scorePositionPlay } from './evaluator';
import { generatePositionAwareShots, computeNextTarget, scoreFuturePotRoute } from './positionPlay';
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
const STRONG_ATTACK_SCORE = 0.55;
const BREAK_POWER = 0.86;

type ScoredShot = {
  shot: ShotCandidate;
  score: number;
};

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

    const breakDecision = this.computeOpeningBreakDecision(ballPositions, rules, ruleset, nineBallRules);
    if (breakDecision) {
      return this.createDecision(breakDecision.shot, breakDecision.placementPosition);
    }

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
      return this.createDecision(directShot.shot, placementPosition);
    }

    const safetyShot = this.findBestSafetyShot(state, aiPlayer, aiGroup, pocketedBallIds);
    const kickShot = this.findBestKickShot(state, aiPlayer, aiGroup, pocketedBallIds);
    const clusterShot = this.findBestClusterBreak(state, aiPlayer, aiGroup, pocketedBallIds);

    const bestAlternative = this.pickBestAlternative(kickShot, clusterShot, safetyShot);
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

    const rescueShot = this.findRescueKickShot(state, aiGroup, pocketedBallIds);
    if (rescueShot) {
      return this.createDecision(rescueShot, placementPosition);
    }

    return null;
  }

  private createDecision(shot: ShotCandidate, placementPosition?: Vector): AIDecision {
    return applyDifficultyToDecision({ shot, placementPosition }, this.difficultyProfile, this.rng);
  }

  private computeOpeningBreakDecision(
    ballPositions: Map<number, Vector>,
    rules: EightBallState,
    ruleset: GameRuleset,
    nineBallRules?: NineBallState,
  ): AIDecision | null {
    const shotCount = ruleset === 'nine-ball' && nineBallRules ? nineBallRules.shotCount : rules.shotCount;
    if (shotCount !== 0) return null;
    const cueBallInHand = ruleset === 'nine-ball' && nineBallRules ? nineBallRules.cueBallInHand : rules.cueBallInHand;
    if (cueBallInHand) return null;

    const pocketedBallIds = ruleset === 'nine-ball' && nineBallRules ? nineBallRules.pocketedBallIds : rules.pocketedBallIds;
    if (pocketedBallIds.length > 0) return null;
    if (!hasOpeningRackBallCount(ballPositions, ruleset)) return null;
    if (!isOpeningRackIntact(ballPositions, ruleset)) return null;

    const targetBallId = ruleset === 'nine-ball' ? 1 : findClosestBallToRackCenter(ballPositions);
    if (targetBallId === null) return null;

    const targetPos = ballPositions.get(targetBallId);
    if (!targetPos) return null;

    const placementPosition = chooseOpeningBreakPlacement(targetPos);
    const direction = unitDirection(placementPosition, targetPos);
    if (!direction) return null;

    return {
      placementPosition,
      shot: {
        targetBallId,
        pocketIndex: -1,
        direction,
        power: BREAK_POWER,
        spin: { x: 0, y: 0 },
        type: 'break_cluster',
        ghostBallPos: targetPos,
      },
    };
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

  private confirmedPotLimit(): number {
    return Math.max(5, Math.floor(this.difficultyProfile.candidateLimit / 6));
  }

  private proConfirmationLimit(): number {
    return Math.max(12, this.difficultyProfile.candidateLimit);
  }

  private findBestConfirmedPot(
    state: TableState,
    aiPlayer: PlayerIndex,
    aiGroup: BallGroup | null,
    pocketedBallIds: number[],
  ): ScoredShot | null {
    const candidates = generateShotCandidates(state.ballPositions, aiGroup, pocketedBallIds, state.ruleset);
    const potCandidates = sortPotCandidates(
      candidates.filter((c) => c.type === 'pot'),
      state.ballPositions,
    );
    if (potCandidates.length === 0) return null;

    // Phase 1: Find which (target, pocket) combos actually pot
    const confirmedPots: { targetBallId: number; pocketIndex: number }[] = [];
    for (const candidate of potCandidates.slice(0, this.proConfirmationLimit())) {
      const simResult = simulateShot(
        state.ballPositions,
        candidate.direction,
        candidate.power,
        candidate.spin,
      );
      if (simResult.pocketedBalls.includes(candidate.targetBallId) && !simResult.cueBallPocketed) {
        const key = `${candidate.targetBallId}-${candidate.pocketIndex}`;
        if (!confirmedPots.some((p) => `${p.targetBallId}-${p.pocketIndex}` === key)) {
          confirmedPots.push({
            targetBallId: candidate.targetBallId,
            pocketIndex: candidate.pocketIndex,
          });
          if (confirmedPots.length >= this.confirmedPotLimit()) {
            break;
          }
        }
      }
    }

    if (confirmedPots.length === 0) return null;

    // Phase 2: Generate position-aware candidates for confirmed pots
    const legalTargets = getAILegalTargets(aiGroup, pocketedBallIds, state.ruleset);
    let bestShot: ShotCandidate | null = null;
    let bestScore = -Infinity;

    for (const { targetBallId, pocketIndex } of confirmedPots.slice(0, this.confirmedPotLimit())) {
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

      for (const candidate of positionCandidates.slice(0, this.difficultyProfile.candidateLimit)) {
        const simResult = simulateShot(
          state.ballPositions,
          candidate.direction,
          candidate.power,
          candidate.spin,
        );

        if (!simResult.pocketedBalls.includes(candidate.targetBallId)) continue;
        if (simResult.cueBallPocketed) continue;
        if (isIllegalEightBallResult(state, simResult, aiGroup)) continue;

        const posScore = scorePositionPlay(simResult, idealZone, zoneRadius);
        const routeScore = scoreFuturePotRoute(
          simResult.ballPositions,
          getAILegalTargets(aiGroup, [...pocketedBallIds, ...simResult.pocketedBalls], state.ruleset),
          [...pocketedBallIds, ...simResult.pocketedBalls],
          state.ruleset,
          Math.max(1, this.difficultyProfile.routeDepth - 1),
        );
        const simScore = evaluateState(state, simResult, aiPlayer, aiGroup);
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
        const score =
          simScore * 0.32 +
          posScore * 0.26 +
          routeScore * 0.24 +
          safetyScore * 0.13 +
          0.05 -
          powerPenalty +
          this.personalityBias(candidate);

        if (score > bestScore) {
          bestScore = score;
          bestShot = candidate;
        }
      }
    }

    if (bestShot) {
      return { shot: bestShot, score: Math.max(bestScore, STRONG_ATTACK_SCORE) };
    }
    return null;
  }

  private findBestKickShot(
    state: TableState,
    aiPlayer: PlayerIndex,
    aiGroup: BallGroup | null,
    pocketedBallIds: number[],
  ): ScoredShot | null {
    const kickCandidates = generateKickShots(state.ballPositions, aiGroup, pocketedBallIds, state.ruleset);
    if (kickCandidates.length === 0) return null;

    let bestShot: ShotCandidate | null = null;
    let bestScore = -Infinity;

    for (const candidate of kickCandidates.slice(0, this.difficultyProfile.candidateLimit)) {
      const simResult = simulateShot(
        state.ballPositions,
        candidate.direction,
        candidate.power,
        candidate.spin,
      );

      if (simResult.cueBallPocketed) continue;
      if (!isLegalFirstContact(state, simResult, aiGroup)) continue;

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
  ): ScoredShot | null {
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
      if (!isLegalFirstContact(state, simResult, aiGroup)) continue;

      const score = evaluateState(state, simResult, aiPlayer, aiGroup) + this.personalityBias(candidate);
      if (score > bestScore) {
        bestScore = score;
        bestShot = candidate;
      }
    }

    if (!bestShot) return null;
    return { shot: bestShot, score: bestScore };
  }

  private findBestSafetyShot(
    state: TableState,
    aiPlayer: PlayerIndex,
    aiGroup: BallGroup | null,
    pocketedBallIds: number[],
  ): ScoredShot | null {
    const candidates = generateShotCandidates(state.ballPositions, aiGroup, pocketedBallIds, state.ruleset)
      .filter((candidate) => candidate.type === 'safety');
    if (candidates.length === 0) return null;

    let bestShot: ShotCandidate | null = null;
    let bestScore = -Infinity;

    for (const candidate of candidates.slice(0, this.difficultyProfile.candidateLimit)) {
      const simResult = simulateShot(
        state.ballPositions,
        candidate.direction,
        candidate.power,
        candidate.spin,
      );
      if (simResult.cueBallPocketed) continue;
      if (!isLegalFirstContact(state, simResult, aiGroup)) continue;

      const baseScore = evaluateState(state, simResult, aiPlayer, aiGroup);
      const snookerScore = scoreOpponentDeniedRoutes(state, simResult, aiGroup);
      const cueSafety = scoreCueBallPocketSafety(simResult);
      const legalContactBonus = simResult.firstContact === candidate.targetBallId ? 0.08 : 0;
      const score =
        baseScore * 0.35 +
        snookerScore * 0.38 +
        cueSafety * 0.17 +
        legalContactBonus +
        this.personalityBias(candidate) -
        candidate.power * 0.04;

      if (score > bestScore) {
        bestScore = score;
        bestShot = candidate;
      }
    }

    return bestShot ? { shot: bestShot, score: bestScore } : null;
  }

  private pickBestAlternative(
    kickResult: ScoredShot | null,
    clusterResult: ScoredShot | null,
    safetyResult: ScoredShot | null,
  ): ShotCandidate | null {
    const options = [kickResult, clusterResult, safetyResult].filter((option): option is ScoredShot => option !== null);
    if (options.length === 0) return null;
    options.sort((a, b) => b.score - a.score);
    return options[0].shot;
  }

  private fallbackSearch(
    state: TableState,
    aiPlayer: PlayerIndex,
    aiGroup: BallGroup | null,
    pocketedBallIds: number[],
  ): ShotCandidate | null {
    const candidates = generateShotCandidates(state.ballPositions, aiGroup, pocketedBallIds, state.ruleset);
    if (candidates.length === 0) return null;

    const top = candidates.slice(0, this.difficultyProfile.candidateLimit);
    let bestShot: ShotCandidate | null = null;
    let bestScore = -Infinity;

    for (const candidate of top) {
      const simResult = simulateShot(
        state.ballPositions,
        candidate.direction,
        candidate.power,
        candidate.spin,
      );
      if (simResult.cueBallPocketed) continue;
      if (!isLegalFirstContact(state, simResult, aiGroup)) continue;
      const score = evaluateState(state, simResult, aiPlayer, aiGroup) + this.personalityBias(candidate);
      if (score > bestScore) {
        bestScore = score;
        bestShot = candidate;
      }
    }

    return bestShot;
  }

  private findRescueKickShot(
    state: TableState,
    aiGroup: BallGroup | null,
    pocketedBallIds: number[],
  ): ShotCandidate | null {
    const cuePos = state.ballPositions.get(0);
    if (!cuePos) return null;

    const legalTargets = getAILegalTargets(aiGroup, pocketedBallIds, state.ruleset)
      .filter((ballId) => state.ballPositions.has(ballId));
    if (legalTargets.length === 0) return null;

    let bestShot: ShotCandidate | null = null;
    let bestScore = -Infinity;
    const powers = [0.55, 0.8];

    for (const targetBallId of legalTargets) {
      const targetPos = state.ballPositions.get(targetBallId);
      if (!targetPos) continue;

      for (const direction of generateRescueDirections(cuePos, targetPos)) {
        for (const power of powers) {
          const simResult = simulateShot(state.ballPositions, direction, power, { x: 0, y: 0 });
          const score = scoreRescueKick(simResult, targetBallId, legalTargets, targetPos, power);
          if (score > bestScore) {
            bestScore = score;
            bestShot = {
              targetBallId,
              pocketIndex: -1,
              direction,
              power,
              spin: { x: 0, y: 0 },
              type: 'kick',
              ghostBallPos: { x: targetPos.x, y: targetPos.y },
            };
          }
        }
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

function sortPotCandidates(candidates: ShotCandidate[], ballPositions: Map<number, Vector>): ShotCandidate[] {
  const cuePos = ballPositions.get(0);
  if (!cuePos) return candidates;

  return candidates.slice().sort((a, b) => {
    return estimateCandidateQuality(b, ballPositions, cuePos) - estimateCandidateQuality(a, ballPositions, cuePos);
  });
}

function estimateCandidateQuality(
  candidate: ShotCandidate,
  ballPositions: Map<number, Vector>,
  cuePos: Vector,
): number {
  const targetPos = ballPositions.get(candidate.targetBallId);
  const pocket = POCKETS[candidate.pocketIndex];
  if (!targetPos || !pocket) return -Infinity;

  const cueDist = Math.hypot(candidate.ghostBallPos.x - cuePos.x, candidate.ghostBallPos.y - cuePos.y);
  const pocketDist = Math.hypot(pocket.x - targetPos.x, pocket.y - targetPos.y);
  const targetLine = Math.atan2(pocket.y - targetPos.y, pocket.x - targetPos.x);
  const cueLine = Math.atan2(candidate.ghostBallPos.y - cuePos.y, candidate.ghostBallPos.x - cuePos.x);
  let cutAngle = Math.abs(targetLine - cueLine);
  if (cutAngle > Math.PI) cutAngle = 2 * Math.PI - cutAngle;

  const distanceScore = Math.max(0, 1 - (cueDist + pocketDist) / 1300);
  const cutScore = Math.max(0, 1 - cutAngle / (Math.PI * 0.7));
  const powerScore = 1 - candidate.power;
  const spinScore = 1 - Math.min(1, Math.hypot(candidate.spin.x, candidate.spin.y));

  return distanceScore * 0.36 + cutScore * 0.34 + powerScore * 0.18 + spinScore * 0.12;
}

function isLegalFirstContact(
  state: TableState,
  simResult: ReturnType<typeof simulateShot>,
  aiGroup: BallGroup | null,
): boolean {
  if (simResult.firstContact === null) return false;
  const legalTargets = getAILegalTargets(aiGroup, state.pocketedBallIds, state.ruleset);
  return legalTargets.includes(simResult.firstContact);
}

function isIllegalEightBallResult(
  state: TableState,
  simResult: ReturnType<typeof simulateShot>,
  aiGroup: BallGroup | null,
): boolean {
  if (state.ruleset === 'nine-ball') return false;
  if (!simResult.pocketedBalls.includes(8)) return false;
  if (aiGroup === null) return true;

  const groupBalls = aiGroup === 'solids'
    ? [1, 2, 3, 4, 5, 6, 7]
    : [9, 10, 11, 12, 13, 14, 15];
  const allGroupPocketed = groupBalls.every(
    (id) => state.pocketedBallIds.includes(id) || simResult.pocketedBalls.includes(id),
  );

  return !allGroupPocketed || simResult.cueBallPocketed || simResult.firstContact !== 8;
}

function scoreCueBallPocketSafety(simResult: ReturnType<typeof simulateShot>): number {
  const cueEnd = simResult.ballPositions.get(0);
  if (!cueEnd) return 0;

  let minPocketDist = Infinity;
  for (const pocket of POCKETS) {
    const d = Math.hypot(cueEnd.x - pocket.x, cueEnd.y - pocket.y);
    if (d < minPocketDist) minPocketDist = d;
  }

  return minPocketDist > BALL_RADIUS * 5 ? 1 : Math.max(0, minPocketDist / (BALL_RADIUS * 5));
}

function scoreOpponentDeniedRoutes(
  state: TableState,
  simResult: ReturnType<typeof simulateShot>,
  aiGroup: BallGroup | null,
): number {
  if (state.ruleset === 'nine-ball') {
    const nextTargets = getAILegalTargets(null, [...state.pocketedBallIds, ...simResult.pocketedBalls], 'nine-ball');
    return 1 - scoreFuturePotRoute(
      simResult.ballPositions,
      nextTargets,
      [...state.pocketedBallIds, ...simResult.pocketedBalls],
      'nine-ball',
      1,
    );
  }

  const opponentGroup = aiGroup === 'solids' ? 'stripes' : aiGroup === 'stripes' ? 'solids' : null;
  const opponentTargets = getAILegalTargets(
    opponentGroup,
    [...state.pocketedBallIds, ...simResult.pocketedBalls],
    state.ruleset,
  );
  const opponentRoute = scoreFuturePotRoute(
    simResult.ballPositions,
    opponentTargets,
    [...state.pocketedBallIds, ...simResult.pocketedBalls],
    state.ruleset,
    1,
  );

  return Math.max(0, Math.min(1, 1 - opponentRoute));
}

function generateRescueDirections(cuePos: Vector, targetPos: Vector): Vector[] {
  const candidates: Vector[] = [];
  const railPoints = [
    { x: PLAY_AREA.left + BALL_RADIUS, y: targetPos.y },
    { x: PLAY_AREA.right - BALL_RADIUS, y: targetPos.y },
    { x: targetPos.x, y: PLAY_AREA.top + BALL_RADIUS },
    { x: targetPos.x, y: PLAY_AREA.bottom - BALL_RADIUS },
    { x: PLAY_AREA.left + BALL_RADIUS, y: PLAY_AREA.top + BALL_RADIUS },
    { x: PLAY_AREA.right - BALL_RADIUS, y: PLAY_AREA.top + BALL_RADIUS },
    { x: PLAY_AREA.left + BALL_RADIUS, y: PLAY_AREA.bottom - BALL_RADIUS },
    { x: PLAY_AREA.right - BALL_RADIUS, y: PLAY_AREA.bottom - BALL_RADIUS },
  ];

  for (const point of railPoints) {
    const direction = unitDirection(cuePos, point);
    if (direction) candidates.push(direction);
  }

  for (let i = 0; i < 16; i += 1) {
    const angle = (Math.PI * 2 * i) / 16;
    candidates.push({ x: Math.cos(angle), y: Math.sin(angle) });
  }

  return dedupeDirections(candidates);
}

function scoreRescueKick(
  simResult: ReturnType<typeof simulateShot>,
  targetBallId: number,
  legalTargets: number[],
  targetStart: Vector,
  power: number,
): number {
  if (simResult.cueBallPocketed) {
    return -100;
  }

  const firstContactScore =
    simResult.firstContact === targetBallId
      ? 20
      : simResult.firstContact !== null && legalTargets.includes(simResult.firstContact)
        ? 12
        : 0;
  const targetEnd = simResult.ballPositions.get(targetBallId);
  const targetMovement = targetEnd
    ? Math.hypot(targetEnd.x - targetStart.x, targetEnd.y - targetStart.y)
    : BALL_RADIUS * 6;
  const pocketBonus = simResult.pocketedBalls.some((id) => legalTargets.includes(id)) ? 4 : 0;
  const cushionBonus = simResult.cushionAfterContact ? 1.5 : 0;

  return firstContactScore + Math.min(6, targetMovement / BALL_RADIUS) + pocketBonus + cushionBonus - power * 0.1;
}

function unitDirection(from: Vector, to: Vector): Vector | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return null;
  return { x: dx / len, y: dy / len };
}

function dedupeDirections(directions: Vector[]): Vector[] {
  const seen = new Set<string>();
  const unique: Vector[] = [];
  for (const direction of directions) {
    const key = `${Math.round(direction.x * 1000)},${Math.round(direction.y * 1000)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(direction);
  }
  return unique;
}

function findClosestBallToRackCenter(ballPositions: Map<number, Vector>): number | null {
  let closestId: number | null = null;
  let closestDist = Infinity;

  for (const [id, pos] of ballPositions) {
    if (id === 0 || id === 8) continue;
    const dist = Math.hypot(pos.x - RACK_CENTER.x, pos.y - RACK_CENTER.y);
    if (dist < closestDist) {
      closestDist = dist;
      closestId = id;
    }
  }

  return closestId;
}

function hasOpeningRackBallCount(ballPositions: Map<number, Vector>, ruleset: GameRuleset): boolean {
  const objectBallCount = Array.from(ballPositions.keys()).filter((id) => id !== 0).length;
  return ruleset === 'nine-ball' ? objectBallCount >= 9 : objectBallCount >= 15;
}

function isOpeningRackIntact(ballPositions: Map<number, Vector>, ruleset: GameRuleset): boolean {
  const tolerance = BALL_RADIUS * 0.75;
  if (ruleset === 'nine-ball') {
    const rack = createNineBallRack(RACK_CENTER);
    return rack.every(({ id, position }) => isBallNear(ballPositions.get(id), position, tolerance));
  }

  const rack = createTriangleRack(RACK_CENTER, 15);
  return rack.every((position, index) => isBallNear(ballPositions.get(index + 1), position, tolerance));
}

function isBallNear(actual: Vector | undefined, expected: Vector, tolerance: number): boolean {
  return actual !== undefined && Math.hypot(actual.x - expected.x, actual.y - expected.y) <= tolerance;
}

function chooseOpeningBreakPlacement(targetPos: Vector): Vector {
  const candidateY = targetPos.y <= TABLE.height / 2
    ? targetPos.y + BALL_RADIUS * 1.2
    : targetPos.y - BALL_RADIUS * 1.2;
  return clampBreakCuePosition({
    x: breakLineX(),
    y: candidateY,
  });
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
        if (simResult.pocketedBalls.includes(candidate.targetBallId) && !simResult.cueBallPocketed) {
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
      if (!simResult.pocketedBalls.includes(candidate.targetBallId)) continue;
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
