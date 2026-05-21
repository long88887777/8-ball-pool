import type { PlayerIndex } from './eightBallRules';

export type NineBallMessageKey =
  | 'nineBallReady'
  | 'nineBallShotInMotion'
  | 'nineBallKeepTurn'
  | 'nineBallTurnPass'
  | 'nineBallFoul'
  | 'nineBallTimeoutFoul'
  | 'nineBallBallInHand'
  | 'nineBallWin'
  | 'nineBallThreeFoulWarning'
  | 'nineBallThreeFoulLoss'
  | 'nineBallPushOutAvailable'
  | 'nineBallPushOutChoice'
  | 'nineBallPushOutPassedBack'
  | 'nineBallPushOutAccepted';

export type NineBallFoulReason =
  | 'cueBallPocketed'
  | 'noFirstContact'
  | 'wrongFirstContact'
  | 'noCushionAfterContact'
  | 'illegalBreak'
  | 'shotClockExpired';

export type NineBallShot = {
  firstContactBallId: number | null;
  pocketedBallIds: number[];
  cushionContactBallIds: number[];
  pushOut: boolean;
};

export type NineBallState = {
  currentPlayer: PlayerIndex;
  pocketedBallIds: number[];
  cueBallInHand: boolean;
  shot: NineBallShot;
  shotCount: number;
  lastFoul: NineBallFoulReason | null;
  gameOver: boolean;
  winner: PlayerIndex | null;
  loser: PlayerIndex | null;
  consecutiveFouls: [number, number];
  pushOutAvailable: boolean;
  pushOutDecision: { originalShooter: PlayerIndex } | null;
  messageKey: NineBallMessageKey;
  messageValues?: Record<string, string | number>;
};

const NINE_BALL_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const THREE_FOUL_LIMIT = 3;

export function createNineBallState(): NineBallState {
  return {
    currentPlayer: 0,
    pocketedBallIds: [],
    cueBallInHand: false,
    shot: createEmptyShot(),
    shotCount: 0,
    lastFoul: null,
    gameOver: false,
    winner: null,
    loser: null,
    consecutiveFouls: [0, 0],
    pushOutAvailable: false,
    pushOutDecision: null,
    messageKey: 'nineBallReady',
  };
}

export function startNineBallShot(state: NineBallState, options: { pushOut?: boolean } = {}): NineBallState {
  if (state.gameOver) return state;

  const pushOut = options.pushOut === true && state.pushOutAvailable;
  return {
    ...state,
    cueBallInHand: false,
    shot: createEmptyShot(pushOut),
    shotCount: state.shotCount + 1,
    lastFoul: null,
    pushOutAvailable: pushOut ? false : state.pushOutAvailable,
    messageKey: 'nineBallShotInMotion',
    messageValues: undefined,
  };
}

export function recordNineBallFirstContact(state: NineBallState, ballId: number): NineBallState {
  if (state.shot.firstContactBallId !== null || ballId === 0 || state.gameOver) {
    return state;
  }

  return {
    ...state,
    shot: {
      ...state.shot,
      firstContactBallId: ballId,
    },
  };
}

export function recordNineBallCushion(state: NineBallState, ballId: number): NineBallState {
  if (state.gameOver || state.shot.cushionContactBallIds.includes(ballId)) {
    return state;
  }

  return {
    ...state,
    shot: {
      ...state.shot,
      cushionContactBallIds: [...state.shot.cushionContactBallIds, ballId],
    },
  };
}

export function recordNineBallPocket(state: NineBallState, ballId: number): NineBallState {
  if (state.gameOver) return state;

  const shotPocketedBallIds = state.shot.pocketedBallIds.includes(ballId)
    ? state.shot.pocketedBallIds
    : [...state.shot.pocketedBallIds, ballId];
  const pocketedBallIds =
    ballId === 0 || state.pocketedBallIds.includes(ballId)
      ? state.pocketedBallIds
      : [...state.pocketedBallIds, ballId];

  return {
    ...state,
    pocketedBallIds,
    shot: {
      ...state.shot,
      pocketedBallIds: shotPocketedBallIds,
    },
  };
}

export function resolveNineBallShot(state: NineBallState): NineBallState {
  if (state.gameOver) return state;

  const currentPlayer = state.currentPlayer;
  const opponent = nextPlayer(currentPlayer);

  if (state.shot.pushOut) {
    const pushOutFoul = getPushOutFoul(state);
    if (pushOutFoul) {
      return applyNineBallFoul(
        {
          ...state,
          pocketedBallIds: spotNineIfNeeded(state.pocketedBallIds),
          pushOutAvailable: false,
          pushOutDecision: null,
        },
        pushOutFoul,
      );
    }

    return resolvePushOutShot(state, currentPlayer, opponent);
  }

  const foul = getShotFoul(state);
  const ninePocketed = state.shot.pocketedBallIds.includes(9);

  if (foul) {
    return applyNineBallFoul(
      {
        ...state,
        pocketedBallIds: spotNineIfNeeded(state.pocketedBallIds),
        pushOutAvailable: false,
        pushOutDecision: null,
      },
      foul,
    );
  }

  if (ninePocketed) {
    return {
      ...state,
      cueBallInHand: false,
      shot: createEmptyShot(),
      lastFoul: null,
      gameOver: true,
      winner: currentPlayer,
      loser: opponent,
      consecutiveFouls: resetPlayerFoulCount(state.consecutiveFouls, currentPlayer),
      pushOutAvailable: false,
      pushOutDecision: null,
      messageKey: 'nineBallWin',
      messageValues: {
        winner: currentPlayer + 1,
      },
    };
  }

  if (state.shot.pocketedBallIds.some((ballId) => ballId !== 0)) {
    return {
      ...state,
      cueBallInHand: false,
      shot: createEmptyShot(),
      lastFoul: null,
      consecutiveFouls: resetPlayerFoulCount(state.consecutiveFouls, currentPlayer),
      pushOutAvailable: isBreakShot(state),
      pushOutDecision: null,
      messageKey: 'nineBallKeepTurn',
      messageValues: {
        player: currentPlayer + 1,
      },
    };
  }

  const pushOutAvailable = isBreakShot(state) && isLegalBreakWithoutPocket(state);
  return {
    ...state,
    currentPlayer: opponent,
    cueBallInHand: false,
    shot: createEmptyShot(),
    lastFoul: null,
    consecutiveFouls: resetPlayerFoulCount(state.consecutiveFouls, currentPlayer),
    pushOutAvailable,
    pushOutDecision: null,
    messageKey: pushOutAvailable ? 'nineBallPushOutAvailable' : 'nineBallTurnPass',
    messageValues: {
      player: opponent + 1,
    },
  };
}

export function passNineBallPushOut(state: NineBallState): NineBallState {
  if (state.gameOver || !state.pushOutDecision) {
    return state;
  }

  const shooter = state.pushOutDecision.originalShooter;
  return {
    ...state,
    currentPlayer: shooter,
    cueBallInHand: false,
    shot: createEmptyShot(),
    lastFoul: null,
    pushOutAvailable: false,
    pushOutDecision: null,
    messageKey: 'nineBallPushOutPassedBack',
    messageValues: {
      player: shooter + 1,
    },
  };
}

export function acceptNineBallPushOut(state: NineBallState): NineBallState {
  if (state.gameOver || !state.pushOutDecision) {
    return state;
  }

  return {
    ...state,
    cueBallInHand: false,
    shot: createEmptyShot(),
    lastFoul: null,
    pushOutAvailable: false,
    pushOutDecision: null,
    messageKey: 'nineBallPushOutAccepted',
    messageValues: {
      player: state.currentPlayer + 1,
    },
  };
}

export function clearNineBallBallInHand(state: NineBallState): NineBallState {
  if (!state.cueBallInHand) return state;

  return {
    ...state,
    cueBallInHand: false,
    messageKey: 'nineBallReady',
    messageValues: { player: state.currentPlayer + 1 },
  };
}

export function recordNineBallTimeoutFoul(state: NineBallState): NineBallState {
  if (state.gameOver) return state;

  return applyNineBallFoul(
    {
      ...state,
      pushOutAvailable: false,
      pushOutDecision: null,
    },
    'shotClockExpired',
    'nineBallTimeoutFoul',
  );
}

export function getRemainingNineBallCount(state: NineBallState): number {
  return NINE_BALL_IDS.filter((ballId) => !state.pocketedBallIds.includes(ballId)).length;
}

export function getPocketedNineBallDisplayBallIds(state: NineBallState): number[] {
  return state.pocketedBallIds.filter((ballId) => ballId !== 0);
}

export function getNineBallTargetDisplayBallIds(state: NineBallState): number[] {
  const lowest = getLowestRemainingNineBallId(state);
  return lowest === null ? [] : [lowest];
}

export function getLowestRemainingNineBallId(state: NineBallState): number | null {
  return NINE_BALL_IDS.find((ballId) => !state.pocketedBallIds.includes(ballId)) ?? null;
}

function resolvePushOutShot(state: NineBallState, currentPlayer: PlayerIndex, opponent: PlayerIndex): NineBallState {
  return {
    ...state,
    pocketedBallIds: spotNineIfNeeded(state.pocketedBallIds),
    currentPlayer: opponent,
    cueBallInHand: false,
    shot: createEmptyShot(),
    lastFoul: null,
    pushOutAvailable: false,
    pushOutDecision: { originalShooter: currentPlayer },
    messageKey: 'nineBallPushOutChoice',
    messageValues: { player: opponent + 1 },
  };
}

function getShotFoul(state: NineBallState): NineBallFoulReason | null {
  if (state.shot.pocketedBallIds.includes(0)) return 'cueBallPocketed';

  if (isBreakShot(state) && isBreakWithPocketedNonNineObjectBall(state)) {
    return null;
  }

  const firstContact = state.shot.firstContactBallId;
  if (firstContact === null) return 'noFirstContact';
  if (firstContact !== getLowestRemainingNineBallIdBeforeShot(state)) return 'wrongFirstContact';

  if (isBreakShot(state)) {
    return isLegalBreak(state) ? null : 'illegalBreak';
  }

  const nonCuePocketed = state.shot.pocketedBallIds.some((ballId) => ballId !== 0);
  if (!nonCuePocketed && state.shot.cushionContactBallIds.length === 0) {
    return 'noCushionAfterContact';
  }

  return null;
}

function getPushOutFoul(state: NineBallState): NineBallFoulReason | null {
  return state.shot.pocketedBallIds.includes(0) ? 'cueBallPocketed' : null;
}

function getLowestRemainingNineBallIdBeforeShot(state: NineBallState): number | null {
  const pocketedBeforeShot = state.pocketedBallIds.filter(
    (id) => !state.shot.pocketedBallIds.includes(id),
  );
  return NINE_BALL_IDS.find((ballId) => !pocketedBeforeShot.includes(ballId)) ?? null;
}

function applyNineBallFoul(
  state: NineBallState,
  foul: NineBallFoulReason,
  messageKey: 'nineBallFoul' | 'nineBallTimeoutFoul' = 'nineBallFoul',
): NineBallState {
  const currentPlayer = state.currentPlayer;
  const opponent = nextPlayer(currentPlayer);
  const consecutiveFouls = incrementPlayerFoulCount(state.consecutiveFouls, currentPlayer);

  if (consecutiveFouls[currentPlayer] >= THREE_FOUL_LIMIT) {
    return {
      ...state,
      currentPlayer: opponent,
      cueBallInHand: false,
      shot: createEmptyShot(),
      lastFoul: foul,
      gameOver: true,
      winner: opponent,
      loser: currentPlayer,
      consecutiveFouls,
      pushOutAvailable: false,
      pushOutDecision: null,
      messageKey: 'nineBallThreeFoulLoss',
      messageValues: {
        winner: opponent + 1,
        loser: currentPlayer + 1,
      },
    };
  }

  return {
    ...state,
    currentPlayer: opponent,
    cueBallInHand: true,
    shot: createEmptyShot(),
    lastFoul: foul,
    consecutiveFouls,
    pushOutAvailable: false,
    pushOutDecision: null,
    messageKey: consecutiveFouls[currentPlayer] === THREE_FOUL_LIMIT - 1
      ? 'nineBallThreeFoulWarning'
      : messageKey,
    messageValues: {
      player: opponent + 1,
      shooter: currentPlayer + 1,
      reason: foul,
    },
  };
}

function createEmptyShot(pushOut = false): NineBallShot {
  return {
    firstContactBallId: null,
    pocketedBallIds: [],
    cushionContactBallIds: [],
    pushOut,
  };
}

function isBreakShot(state: NineBallState): boolean {
  return state.shotCount === 1;
}

function isLegalBreak(state: NineBallState): boolean {
  const objectBallsPocketed = state.shot.pocketedBallIds.some((ballId) => ballId !== 0);
  return objectBallsPocketed || state.shot.cushionContactBallIds.filter((ballId) => ballId !== 0).length >= 4;
}

function isBreakWithPocketedNonNineObjectBall(state: NineBallState): boolean {
  return state.shot.pocketedBallIds.some((ballId) => ballId !== 0 && ballId !== 9);
}

function isLegalBreakWithoutPocket(state: NineBallState): boolean {
  return state.shot.cushionContactBallIds.filter((ballId) => ballId !== 0).length >= 4 &&
    !state.shot.pocketedBallIds.some((ballId) => ballId !== 0);
}

function spotNineIfNeeded(pocketedBallIds: number[]): number[] {
  return pocketedBallIds.filter((ballId) => ballId !== 9);
}

function incrementPlayerFoulCount(counts: [number, number], player: PlayerIndex): [number, number] {
  const next: [number, number] = [...counts];
  next[player] += 1;
  return next;
}

function resetPlayerFoulCount(counts: [number, number], player: PlayerIndex): [number, number] {
  if (counts[player] === 0) {
    return counts;
  }
  const next: [number, number] = [...counts];
  next[player] = 0;
  return next;
}

function nextPlayer(player: PlayerIndex): PlayerIndex {
  return player === 0 ? 1 : 0;
}
