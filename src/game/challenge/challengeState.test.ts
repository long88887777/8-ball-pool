import { describe, it, expect } from 'vitest';
import {
  createChallengeState,
  recordChallengeShot,
  recordChallengePocket,
  recordChallengeCuePocket,
  resolveChallengeResult,
  type ChallengeState,
} from './challengeState';
import { CHALLENGE_LEVELS } from './levels';

describe('challengeState', () => {
  const level = CHALLENGE_LEVELS[0]; // 1 target, maxShots=2, stars=[1,2]

  it('creates initial state from level', () => {
    const state = createChallengeState(level);
    expect(state.levelId).toBe(1);
    expect(state.shotsUsed).toBe(0);
    expect(state.targetsPocketed).toBe(0);
    expect(state.totalTargets).toBe(1);
    expect(state.maxShots).toBe(2);
    expect(state.result).toBeNull();
  });

  it('records a shot', () => {
    const state = createChallengeState(level);
    const next = recordChallengeShot(state);
    expect(next.shotsUsed).toBe(1);
  });

  it('records target pocket', () => {
    const state = createChallengeState(level);
    const next = recordChallengePocket(state);
    expect(next.targetsPocketed).toBe(1);
  });

  it('records cue ball pocket as penalty', () => {
    const state = createChallengeState(level);
    const next = recordChallengeCuePocket(state);
    expect(next.shotsUsed).toBe(1);
  });

  it('resolves 3 stars when shots <= starThresholds[0]', () => {
    let state = createChallengeState(level);
    state = recordChallengeShot(state);
    state = recordChallengePocket(state);
    const result = resolveChallengeResult(state);
    expect(result).toEqual({ passed: true, stars: 3 });
  });

  it('resolves 2 stars when shots <= starThresholds[1]', () => {
    let state = createChallengeState(level);
    state = recordChallengeShot(state);
    state = recordChallengeShot(state);
    state = recordChallengePocket(state);
    const result = resolveChallengeResult(state);
    expect(result).toEqual({ passed: true, stars: 2 });
  });

  it('resolves fail when shots exceed maxShots without clearing', () => {
    let state = createChallengeState(level);
    state = recordChallengeShot(state);
    state = recordChallengeShot(state);
    const result = resolveChallengeResult(state);
    expect(result).toEqual({ passed: false, stars: 0 });
  });
});
