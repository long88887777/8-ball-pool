import { describe, it, expect } from 'vitest';
import {
  createChallengeState,
  recordChallengeShot,
  recordChallengePocket,
  recordChallengeOrderedPocket,
  recordChallengeCuePocket,
  recordChallengeCollision,
  recordChallengePocketWithRequired,
  checkKickChain,
  resetChallengeShot,
  revertCuePocketShot,
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
    expect(state.orderViolation).toBe(false);
  });

  it('records a shot', () => {
    const state = createChallengeState(level);
    const next = recordChallengeShot(state);
    expect(next.shotsUsed).toBe(1);
  });

  it('records target pocket', () => {
    const state = createChallengeState(level);
    const next = recordChallengePocket(state, 1);
    expect(next.targetsPocketed).toBe(1);
    expect(next.ballsPocketedThisShot).toEqual([1]);
  });

  it('records cue ball pocket as flag', () => {
    const state = createChallengeState(level);
    const next = recordChallengeCuePocket(state);
    expect(next.cuePocketed).toBe(true);
    expect(next.shotsUsed).toBe(0);
  });

  it('resolves 3 stars when shots <= starThresholds[0]', () => {
    let state = createChallengeState(level);
    state = recordChallengeShot(state);
    state = recordChallengePocket(state, 1);
    const result = resolveChallengeResult(state);
    expect(result).toEqual({ passed: true, stars: 3 });
  });

  it('resolves 2 stars when shots <= starThresholds[1]', () => {
    let state = createChallengeState(level);
    state = recordChallengeShot(state);
    state = recordChallengeShot(state);
    state = recordChallengePocket(state, 1);
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

describe('orderedPocket', () => {
  const level10 = CHALLENGE_LEVELS[9]; // orderedPocket: true, 8 targets (ids 1-8)
  const sortedIds = level10.balls.filter(b => b.id !== 0).map(b => b.id).sort((a, b) => a - b);

  it('initializes nextRequiredBallId for ordered level', () => {
    const state = createChallengeState(level10);
    expect(state.nextRequiredBallId).toBe(1);
    expect(state.orderViolation).toBe(false);
  });

  it('does not set nextRequiredBallId for non-ordered level', () => {
    const state = createChallengeState(CHALLENGE_LEVELS[1]);
    expect(state.nextRequiredBallId).toBeNull();
  });

  it('advances nextRequiredBallId on correct pocket', () => {
    let state = createChallengeState(level10);
    state = recordChallengeOrderedPocket(state, 1, sortedIds);
    expect(state.targetsPocketed).toBe(1);
    expect(state.nextRequiredBallId).toBe(2);
    expect(state.orderViolation).toBe(false);
  });

  it('sets orderViolation on wrong pocket order', () => {
    let state = createChallengeState(level10);
    state = recordChallengeOrderedPocket(state, 3, sortedIds);
    expect(state.orderViolation).toBe(true);
    expect(state.targetsPocketed).toBe(0);
  });
});

describe('requiredPocket', () => {
  const level6 = CHALLENGE_LEVELS[5]; // requiredPocket: 5

  it('initializes requiredPocketViolation as false', () => {
    const state = createChallengeState(level6);
    expect(state.requiredPocketViolation).toBe(false);
  });

  it('counts pocket when ball enters required pocket', () => {
    let state = createChallengeState(level6);
    state = recordChallengePocketWithRequired(state, 1, 5, 5);
    expect(state.targetsPocketed).toBe(1);
    expect(state.requiredPocketViolation).toBe(false);
  });

  it('sets violation when ball enters wrong pocket', () => {
    let state = createChallengeState(level6);
    state = recordChallengePocketWithRequired(state, 1, 0, 5);
    expect(state.targetsPocketed).toBe(0);
    expect(state.requiredPocketViolation).toBe(true);
  });

  it('ignores cue ball pocket events', () => {
    let state = createChallengeState(level6);
    state = recordChallengePocketWithRequired(state, 0, 3, 5);
    expect(state.targetsPocketed).toBe(0);
    expect(state.requiredPocketViolation).toBe(false);
  });
});

describe('kickChain', () => {
  const level7 = CHALLENGE_LEVELS[6]; // requireKickChain: [2, 1]

  it('initializes collision chain empty', () => {
    const state = createChallengeState(level7);
    expect(state.collisionChain).toEqual([]);
    expect(state.kickChainSatisfied).toBe(false);
  });

  it('records collisions', () => {
    let state = createChallengeState(level7);
    state = recordChallengeCollision(state, 0, 2);
    state = recordChallengeCollision(state, 0, 1);
    expect(state.collisionChain).toEqual([[0, 2], [0, 1]]);
  });

  it('detects valid kick chain (cue→2, cue→1)', () => {
    let state = createChallengeState(level7);
    state = recordChallengeCollision(state, 0, 2);
    state = recordChallengeCollision(state, 0, 1);
    expect(checkKickChain(state, [2, 1])).toBe(true);
  });

  it('rejects invalid chain when cue never kicks ball 1', () => {
    let state = createChallengeState(level7);
    state = recordChallengeCollision(state, 0, 2);
    state = recordChallengeCollision(state, 2, 1);
    expect(checkKickChain(state, [2, 1])).toBe(false);
  });

  it('resets collision chain between shots', () => {
    let state = createChallengeState(level7);
    state = recordChallengeCollision(state, 0, 2);
    state = resetChallengeShot(state);
    expect(state.collisionChain).toEqual([]);
    expect(state.cuePocketed).toBe(false);
    expect(state.ballsPocketedThisShot).toEqual([]);
  });
});

describe('revertCuePocketShot', () => {
  const level3 = CHALLENGE_LEVELS[2]; // orderedPocket: true, 2 targets (ids 1,2)
  const sortedIds = [1, 2];

  it('reverts targetsPocketed when cue ball pocketed', () => {
    let state = createChallengeState(level3);
    state = recordChallengeShot(state);
    state = recordChallengeOrderedPocket(state, 1, sortedIds);
    state = recordChallengeCuePocket(state);
    expect(state.targetsPocketed).toBe(1);
    expect(state.cuePocketed).toBe(true);
    state = revertCuePocketShot(state, sortedIds, true);
    expect(state.targetsPocketed).toBe(0);
    expect(state.nextRequiredBallId).toBe(1);
  });

  it('does not revert if no balls pocketed this shot', () => {
    let state = createChallengeState(level3);
    state = recordChallengeShot(state);
    state = recordChallengeCuePocket(state);
    state = revertCuePocketShot(state, sortedIds, true);
    expect(state.targetsPocketed).toBe(0);
  });

  it('keeps nextRequiredBallId null for non-ordered levels', () => {
    const level2 = CHALLENGE_LEVELS[1]; // no orderedPocket
    let state = createChallengeState(level2);
    state = recordChallengeShot(state);
    state = recordChallengePocket(state, 1);
    state = recordChallengeCuePocket(state);
    state = revertCuePocketShot(state, [1], false);
    expect(state.targetsPocketed).toBe(0);
    expect(state.nextRequiredBallId).toBeNull();
  });
});
