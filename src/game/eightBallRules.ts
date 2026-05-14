export type PlayerIndex = 0 | 1;
export type BallGroup = 'solids' | 'stripes';
export type BallClass = BallGroup | 'eight' | 'cue' | 'unknown';

export type EightBallMessageKey =
  | 'eightBallReady'
  | 'eightBallShotInMotion'
  | 'eightBallGroupsAssigned'
  | 'eightBallKeepTurn'
  | 'eightBallTurnPass'
  | 'eightBallFoul'
  | 'eightBallTimeoutFoul'
  | 'eightBallBallInHand'
  | 'eightBallWin'
  | 'eightBallLoss';

export type EightBallFoulReason = 'cueBallPocketed' | 'noFirstContact' | 'wrongFirstContact' | 'noCushionAfterContact' | 'shotClockExpired';

export type EightBallPlayer = {
  id: PlayerIndex;
  group: BallGroup | null;
};

export type EightBallShot = {
  firstContactBallId: number | null;
  pocketedBallIds: number[];
  cushionAfterContact: boolean;
};

export type EightBallState = {
  currentPlayer: PlayerIndex;
  players: [EightBallPlayer, EightBallPlayer];
  pocketedBallIds: number[];
  cueBallInHand: boolean;
  shot: EightBallShot;
  shotCount: number;
  lastFoul: EightBallFoulReason | null;
  gameOver: boolean;
  winner: PlayerIndex | null;
  loser: PlayerIndex | null;
  messageKey: EightBallMessageKey;
  messageValues?: Record<string, string | number>;
};

const SOLIDS = [1, 2, 3, 4, 5, 6, 7];
const STRIPES = [9, 10, 11, 12, 13, 14, 15];

export function createEightBallState(): EightBallState {
  return {
    currentPlayer: 0,
    players: [
      { id: 0, group: null },
      { id: 1, group: null },
    ],
    pocketedBallIds: [],
    cueBallInHand: false,
    shot: createEmptyShot(),
    shotCount: 0,
    lastFoul: null,
    gameOver: false,
    winner: null,
    loser: null,
    messageKey: 'eightBallReady',
  };
}

export function getBallGroup(ballId: number): BallClass {
  if (ballId === 0) return 'cue';
  if (SOLIDS.includes(ballId)) return 'solids';
  if (ballId === 8) return 'eight';
  if (STRIPES.includes(ballId)) return 'stripes';
  return 'unknown';
}

export function startEightBallShot(state: EightBallState): EightBallState {
  if (state.gameOver) {
    return state;
  }

  return {
    ...state,
    cueBallInHand: false,
    shot: createEmptyShot(),
    shotCount: state.shotCount + 1,
    lastFoul: null,
    messageKey: 'eightBallShotInMotion',
    messageValues: undefined,
  };
}

export function recordEightBallFirstContact(state: EightBallState, ballId: number): EightBallState {
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

export function recordEightBallPocket(state: EightBallState, ballId: number): EightBallState {
  if (state.gameOver) {
    return state;
  }

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

export function recordEightBallCushion(state: EightBallState, ballId?: number): EightBallState {
  if (
    state.gameOver ||
    state.shot.cushionAfterContact ||
    (state.shot.firstContactBallId === null && (ballId === undefined || ballId === 0))
  ) {
    return state;
  }

  return {
    ...state,
    shot: {
      ...state.shot,
      cushionAfterContact: true,
    },
  };
}

export function resolveEightBallShot(state: EightBallState): EightBallState {
  if (state.gameOver) {
    return state;
  }

  const currentPlayer = state.currentPlayer;
  const opponent = nextPlayer(currentPlayer);
  const foul = getShotFoul(state);
  const eightPocketed = state.shot.pocketedBallIds.includes(8);

  if (eightPocketed) {
    if (!foul && isPlayerOnEight(state, currentPlayer)) {
      return endGame(state, currentPlayer, opponent, 'eightBallWin');
    }

    return endGame(state, opponent, currentPlayer, 'eightBallLoss');
  }

  if (foul) {
    return {
      ...state,
      currentPlayer: opponent,
      cueBallInHand: true,
      shot: createEmptyShot(),
      lastFoul: foul,
      messageKey: 'eightBallFoul',
      messageValues: {
        player: opponent + 1,
        reason: foul,
      },
    };
  }

  const assigned = assignGroupsIfNeeded(state);
  const playerGroup = assigned.players[currentPlayer].group;
  const ownBallPocketed =
    playerGroup !== null &&
    assigned.shot.pocketedBallIds.some((ballId) => getBallGroup(ballId) === playerGroup);

  if (ownBallPocketed) {
    return {
      ...assigned,
      cueBallInHand: false,
      shot: createEmptyShot(),
      lastFoul: null,
      messageKey: assigned !== state ? 'eightBallGroupsAssigned' : 'eightBallKeepTurn',
      messageValues: {
        player: currentPlayer + 1,
        group: playerGroup,
      },
    };
  }

  return {
    ...assigned,
    currentPlayer: opponent,
    cueBallInHand: false,
    shot: createEmptyShot(),
    lastFoul: null,
    messageKey: 'eightBallTurnPass',
    messageValues: { player: opponent + 1 },
  };
}

export function clearEightBallBallInHand(state: EightBallState): EightBallState {
  if (!state.cueBallInHand) {
    return state;
  }

  return {
    ...state,
    cueBallInHand: false,
    messageKey: 'eightBallReady',
    messageValues: { player: state.currentPlayer + 1 },
  };
}

export function recordEightBallTimeoutFoul(state: EightBallState): EightBallState {
  if (state.gameOver) {
    return state;
  }

  const opponent = nextPlayer(state.currentPlayer);
  return {
    ...state,
    currentPlayer: opponent,
    cueBallInHand: true,
    shot: createEmptyShot(),
    lastFoul: 'shotClockExpired',
    messageKey: 'eightBallTimeoutFoul',
    messageValues: { player: opponent + 1 },
  };
}

export function isPlayerOnEight(state: EightBallState, player: PlayerIndex): boolean {
  const group = state.players[player].group;
  if (group === null) {
    return false;
  }

  const groupBallIds = group === 'solids' ? SOLIDS : STRIPES;
  return groupBallIds.every((ballId) => state.pocketedBallIds.includes(ballId));
}

export function getRemainingEightBallCount(state: EightBallState): number {
  return 15 - state.pocketedBallIds.filter((ballId) => ballId !== 0).length;
}

export function getPocketedDisplayBallIds(state: EightBallState): number[] {
  return state.pocketedBallIds.filter((ballId) => ballId !== 0);
}

export function getPlayerRemainingBallIds(state: EightBallState, player: PlayerIndex): number[] {
  const group = state.players[player].group;
  const targetBallIds = group === null ? [...SOLIDS, ...STRIPES] : group === 'solids' ? SOLIDS : STRIPES;
  const remaining = targetBallIds.filter((ballId) => !state.pocketedBallIds.includes(ballId));

  if (group !== null && remaining.length === 0 && !state.pocketedBallIds.includes(8)) {
    return [8];
  }

  return remaining;
}

export function getPlayerTargetDisplayBallIds(state: EightBallState, player: PlayerIndex): number[] {
  if (state.players[player].group === null) {
    return [];
  }

  return getPlayerRemainingBallIds(state, player);
}

function assignGroupsIfNeeded(state: EightBallState): EightBallState {
  if (state.players[0].group !== null || state.players[1].group !== null) {
    return state;
  }

  const assignedGroup = state.shot.pocketedBallIds.map(getBallGroup).find(isBallGroup);
  if (!assignedGroup) {
    return state;
  }

  const currentPlayer = state.currentPlayer;
  const opponent = nextPlayer(currentPlayer);
  const opponentGroup = assignedGroup === 'solids' ? 'stripes' : 'solids';

  return {
    ...state,
    players: state.players.map((player) => {
      if (player.id === currentPlayer) {
        return { ...player, group: assignedGroup };
      }
      if (player.id === opponent) {
        return { ...player, group: opponentGroup };
      }
      return player;
    }) as [EightBallPlayer, EightBallPlayer],
  };
}

function isBreakShot(state: EightBallState): boolean {
  return state.shotCount === 1;
}

function getShotFoul(state: EightBallState): EightBallFoulReason | null {
  if (state.shot.pocketedBallIds.includes(0)) {
    return 'cueBallPocketed';
  }

  const firstContact = state.shot.firstContactBallId;
  if (firstContact === null) {
    return 'noFirstContact';
  }

  const breakShot = isBreakShot(state);

  const playerGroup = state.players[state.currentPlayer].group;
  const firstContactGroup = getBallGroup(firstContact);

  if (playerGroup === null) {
    if (!breakShot && firstContactGroup !== 'solids' && firstContactGroup !== 'stripes') {
      return 'wrongFirstContact';
    }
  } else if (wasPlayerOnEightBeforeShot(state, state.currentPlayer)) {
    if (firstContactGroup !== 'eight') {
      return 'wrongFirstContact';
    }
  } else if (firstContactGroup !== playerGroup) {
    return 'wrongFirstContact';
  }

  if (!breakShot) {
    const nonCuePocketed = state.shot.pocketedBallIds.filter((id) => id !== 0).length > 0;
    if (!state.shot.cushionAfterContact && !nonCuePocketed) {
      return 'noCushionAfterContact';
    }
  }

  return null;
}

function wasPlayerOnEightBeforeShot(state: EightBallState, player: PlayerIndex): boolean {
  const group = state.players[player].group;
  if (group === null) {
    return false;
  }

  const groupBallIds = group === 'solids' ? SOLIDS : STRIPES;
  const pocketedBeforeShot = state.pocketedBallIds.filter(
    (id) => !state.shot.pocketedBallIds.includes(id),
  );
  return groupBallIds.every((ballId) => pocketedBeforeShot.includes(ballId));
}

function endGame(
  state: EightBallState,
  winner: PlayerIndex,
  loser: PlayerIndex,
  messageKey: 'eightBallWin' | 'eightBallLoss',
): EightBallState {
  return {
    ...state,
    cueBallInHand: false,
    shot: createEmptyShot(),
    lastFoul: null,
    gameOver: true,
    winner,
    loser,
    messageKey,
    messageValues: {
      winner: winner + 1,
      loser: loser + 1,
    },
  };
}

function createEmptyShot(): EightBallShot {
  return {
    firstContactBallId: null,
    pocketedBallIds: [],
    cushionAfterContact: false,
  };
}

function nextPlayer(player: PlayerIndex): PlayerIndex {
  return player === 0 ? 1 : 0;
}

function isBallGroup(group: BallClass): group is BallGroup {
  return group === 'solids' || group === 'stripes';
}
