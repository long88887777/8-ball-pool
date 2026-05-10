import type { ChallengeLevel } from './levels';

export type ChallengeResult = {
  passed: boolean;
  stars: number;
};

export type ChallengeState = {
  levelId: number;
  shotsUsed: number;
  targetsPocketed: number;
  totalTargets: number;
  maxShots: number;
  starThresholds: [number, number];
  result: ChallengeResult | null;
};

export function createChallengeState(level: ChallengeLevel): ChallengeState {
  return {
    levelId: level.id,
    shotsUsed: 0,
    targetsPocketed: 0,
    totalTargets: level.balls.length - 1,
    maxShots: level.maxShots,
    starThresholds: level.starThresholds,
    result: null,
  };
}

export function recordChallengeShot(state: ChallengeState): ChallengeState {
  return { ...state, shotsUsed: state.shotsUsed + 1 };
}

export function recordChallengePocket(state: ChallengeState): ChallengeState {
  return { ...state, targetsPocketed: state.targetsPocketed + 1 };
}

export function recordChallengeCuePocket(state: ChallengeState): ChallengeState {
  return { ...state, shotsUsed: state.shotsUsed + 1 };
}

export function resolveChallengeResult(state: ChallengeState): ChallengeResult {
  if (state.targetsPocketed >= state.totalTargets) {
    if (state.shotsUsed <= state.starThresholds[0]) return { passed: true, stars: 3 };
    if (state.shotsUsed <= state.starThresholds[1]) return { passed: true, stars: 2 };
    return { passed: true, stars: 1 };
  }
  if (state.shotsUsed >= state.maxShots) return { passed: false, stars: 0 };
  return { passed: false, stars: 0 };
}
