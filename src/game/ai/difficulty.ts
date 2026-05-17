import type { AIDecision, MCTSConfig, ShotCandidate } from './types';

export type AIDifficulty = 'easy' | 'normal' | 'hard';
export type RandomSource = () => number;

export type AIDifficultyProfile = {
  difficulty: AIDifficulty;
  label: string;
  mctsConfig: MCTSConfig;
  aimErrorRadians: number;
  powerError: number;
  spinError: number;
};

const PROFILES: Record<AIDifficulty, AIDifficultyProfile> = {
  easy: {
    difficulty: 'easy',
    label: '新手',
    mctsConfig: {
      timeBudgetMs: 70,
      maxDepth: 2,
      explorationConstant: 1.7,
    },
    aimErrorRadians: (3.2 * Math.PI) / 180,
    powerError: 0.14,
    spinError: 0.18,
  },
  normal: {
    difficulty: 'normal',
    label: '熟练',
    mctsConfig: {
      timeBudgetMs: 140,
      maxDepth: 3,
      explorationConstant: 1.45,
    },
    aimErrorRadians: (0.9 * Math.PI) / 180,
    powerError: 0.045,
    spinError: 0.06,
  },
  hard: {
    difficulty: 'hard',
    label: '大师',
    mctsConfig: {
      timeBudgetMs: 220,
      maxDepth: 3,
      explorationConstant: 1.25,
    },
    aimErrorRadians: 0,
    powerError: 0,
    spinError: 0,
  },
};

export function normalizeAIDifficulty(
  value: unknown,
  fallback: AIDifficulty = 'normal',
): AIDifficulty {
  return value === 'easy' || value === 'normal' || value === 'hard' ? value : fallback;
}

export function getAIDifficultyProfile(difficulty: AIDifficulty): AIDifficultyProfile {
  return PROFILES[difficulty];
}

export function applyDifficultyToDecision(
  decision: AIDecision,
  profile: AIDifficultyProfile,
  rng: RandomSource = Math.random,
): AIDecision {
  return {
    shot: applyDifficultyToShot(decision.shot, profile, rng),
    placementPosition: decision.placementPosition
      ? { x: decision.placementPosition.x, y: decision.placementPosition.y }
      : undefined,
  };
}

function applyDifficultyToShot(
  shot: ShotCandidate,
  profile: AIDifficultyProfile,
  rng: RandomSource,
): ShotCandidate {
  const aimDelta = randomSigned(rng) * profile.aimErrorRadians;
  const powerDelta = randomSigned(rng) * profile.powerError;
  const spinXDelta = randomSigned(rng) * profile.spinError;
  const spinYDelta = randomSigned(rng) * profile.spinError;

  return {
    ...shot,
    direction: rotateUnitVector(shot.direction, aimDelta),
    power: clamp(shot.power + powerDelta, 0.12, 1),
    spin: {
      x: clamp(shot.spin.x + spinXDelta, -1, 1),
      y: clamp(shot.spin.y + spinYDelta, -1, 1),
    },
    ghostBallPos: { x: shot.ghostBallPos.x, y: shot.ghostBallPos.y },
  };
}

function rotateUnitVector(direction: { x: number; y: number }, angle: number): { x: number; y: number } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = direction.x * cos - direction.y * sin;
  const y = direction.x * sin + direction.y * cos;
  const length = Math.hypot(x, y);
  if (length < 0.001) return { x: 1, y: 0 };
  return { x: x / length, y: y / length };
}

function randomSigned(rng: RandomSource): number {
  return clamp(rng(), 0, 1) * 2 - 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
