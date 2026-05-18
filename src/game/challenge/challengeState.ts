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
  nextRequiredBallId: number | null;
  orderViolation: boolean;
  requiredPocketViolation: boolean;
  kickChainSatisfied: boolean;
  collisionChain: Array<[number, number]>;
  cuePocketed: boolean;
  ballsPocketedThisShot: number[];
  allPocketedBallIds: number[];
};

export function createChallengeState(level: ChallengeLevel): ChallengeState {
  const targetBallIds = level.balls.filter(b => b.id !== 0).map(b => b.id).sort((a, b) => a - b);
  return {
    levelId: level.id,
    shotsUsed: 0,
    targetsPocketed: 0,
    totalTargets: level.balls.length - 1,
    maxShots: level.maxShots,
    starThresholds: level.starThresholds,
    result: null,
    nextRequiredBallId: level.orderedPocket ? targetBallIds[0] : null,
    orderViolation: false,
    requiredPocketViolation: false,
    kickChainSatisfied: !level.requireKickChain,
    collisionChain: [],
    cuePocketed: false,
    ballsPocketedThisShot: [],
    allPocketedBallIds: [],
  };
}

export function recordChallengeShot(state: ChallengeState): ChallengeState {
  return { ...state, shotsUsed: state.shotsUsed + 1 };
}

export function recordChallengePocket(state: ChallengeState, ballId: number): ChallengeState {
  if (state.allPocketedBallIds.includes(ballId)) {
    return state;
  }

  return {
    ...state,
    targetsPocketed: state.targetsPocketed + 1,
    ballsPocketedThisShot: [...state.ballsPocketedThisShot, ballId],
    allPocketedBallIds: [...state.allPocketedBallIds, ballId],
  };
}

export function recordChallengeOrderedPocket(state: ChallengeState, ballId: number, sortedTargetIds: number[]): ChallengeState {
  if (state.nextRequiredBallId !== null && ballId !== state.nextRequiredBallId) {
    return { ...state, orderViolation: true };
  }
  const nextIndex = sortedTargetIds.indexOf(ballId) + 1;
  const nextId = nextIndex < sortedTargetIds.length ? sortedTargetIds[nextIndex] : null;
  return {
    ...state,
    targetsPocketed: state.targetsPocketed + 1,
    nextRequiredBallId: nextId,
    ballsPocketedThisShot: [...state.ballsPocketedThisShot, ballId],
    allPocketedBallIds: [...state.allPocketedBallIds, ballId],
  };
}

export function recordChallengeCuePocket(state: ChallengeState): ChallengeState {
  return { ...state, cuePocketed: true };
}

export function recordChallengeCollision(state: ChallengeState, ballId: number, otherBallId: number): ChallengeState {
  return { ...state, collisionChain: [...state.collisionChain, [ballId, otherBallId]] };
}

export function recordChallengePocketWithRequired(
  state: ChallengeState,
  ballId: number,
  pocketIndex: number,
  requiredPocket: number,
): ChallengeState {
  if (ballId === 0) return state;
  if (pocketIndex !== requiredPocket) {
    return { ...state, requiredPocketViolation: true };
  }
  return {
    ...state,
    targetsPocketed: state.targetsPocketed + 1,
    ballsPocketedThisShot: [...state.ballsPocketedThisShot, ballId],
    allPocketedBallIds: [...state.allPocketedBallIds, ballId],
  };
}

export function checkKickChain(state: ChallengeState, requireKickChain: [number, number]): boolean {
  const [pocketedBall, kickedBall] = requireKickChain;
  const cueHitTarget = state.collisionChain.some(
    ([a, b]) => (a === 0 && b === pocketedBall) || (a === pocketedBall && b === 0),
  );
  const cueKickedTarget = state.collisionChain.some(
    ([a, b]) => (a === 0 && b === kickedBall) || (a === kickedBall && b === 0),
  );
  return cueHitTarget && cueKickedTarget;
}

export function resetChallengeShot(state: ChallengeState): ChallengeState {
  return {
    ...state,
    collisionChain: [],
    requiredPocketViolation: false,
    cuePocketed: false,
    ballsPocketedThisShot: [],
  };
}

export function revertCuePocketShot(state: ChallengeState, sortedTargetIds: number[], isOrdered: boolean): ChallengeState {
  const revertCount = state.ballsPocketedThisShot.length;
  const newPocketed = state.targetsPocketed - revertCount;
  const revertedSet = new Set(state.ballsPocketedThisShot);
  const newAllPocketed = state.allPocketedBallIds.filter(id => !revertedSet.has(id));
  let nextRequired = state.nextRequiredBallId;
  if (isOrdered && revertCount > 0) {
    const firstReverted = state.ballsPocketedThisShot[0];
    const idx = sortedTargetIds.indexOf(firstReverted);
    nextRequired = idx >= 0 ? sortedTargetIds[idx] : state.nextRequiredBallId;
  }
  return {
    ...state,
    targetsPocketed: newPocketed,
    nextRequiredBallId: nextRequired,
    allPocketedBallIds: newAllPocketed,
  };
}

export function resolveChallengeResult(state: ChallengeState): ChallengeResult {
  if (!state.kickChainSatisfied) {
    return { passed: false, stars: 0 };
  }

  if (state.targetsPocketed >= state.totalTargets) {
    if (state.shotsUsed <= state.starThresholds[0]) return { passed: true, stars: 3 };
    if (state.shotsUsed <= state.starThresholds[1]) return { passed: true, stars: 2 };
    return { passed: true, stars: 1 };
  }
  if (state.shotsUsed >= state.maxShots) return { passed: false, stars: 0 };
  return { passed: false, stars: 0 };
}
