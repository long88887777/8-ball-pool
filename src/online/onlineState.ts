import type { OnlinePhase } from './types';

export interface OnlineStateConfig {
  isHost: boolean;
  turnTimeLimit: number;
  disconnectTimeout: number;
}

export interface OnlineState {
  phase: OnlinePhase;
  turnTimer: number;
  turnTimeLimit: number;
  disconnectTimeout: number;
  lastOpponentHeartbeat: number;
  isMyTurn: boolean;
  winner: 0 | 1 | null;
  gameOverReason: string | null;
}

export function createOnlineState(config: OnlineStateConfig): OnlineState {
  return {
    phase: 'waiting_opponent',
    turnTimer: config.turnTimeLimit,
    turnTimeLimit: config.turnTimeLimit,
    disconnectTimeout: config.disconnectTimeout,
    lastOpponentHeartbeat: Date.now(),
    isMyTurn: false,
    winner: null,
    gameOverReason: null,
  };
}

export function transitionToMyTurn(state: OnlineState): OnlineState {
  return { ...state, phase: 'my_turn', isMyTurn: true, turnTimer: state.turnTimeLimit };
}

export function transitionToOpponentTurn(state: OnlineState): OnlineState {
  return { ...state, phase: 'opponent_turn', isMyTurn: false, turnTimer: state.turnTimeLimit };
}

export function transitionToWatchingMyShot(state: OnlineState): OnlineState {
  return { ...state, phase: 'watching_my_shot', isMyTurn: false };
}

export function transitionToWatchingOpponentShot(state: OnlineState): OnlineState {
  return { ...state, phase: 'watching_opponent_shot', isMyTurn: false };
}

export function transitionToGameOver(state: OnlineState, winner: 0 | 1, reason: string): OnlineState {
  return { ...state, phase: 'game_over', isMyTurn: false, winner, gameOverReason: reason };
}

export function tickTurnTimer(state: OnlineState, delta: number): OnlineState {
  if (state.phase !== 'my_turn') return state;
  return { ...state, turnTimer: Math.max(0, state.turnTimer - delta) };
}

export function recordHeartbeat(state: OnlineState, now: number): OnlineState {
  return { ...state, lastOpponentHeartbeat: now };
}

export function checkDisconnect(state: OnlineState, now: number): boolean {
  return now - state.lastOpponentHeartbeat > state.disconnectTimeout * 1000;
}

export function pickBreakerFromRoomId(roomId: string): 0 | 1 {
  let hash = 0;
  for (let i = 0; i < roomId.length; i += 1) {
    hash = (hash * 31 + roomId.charCodeAt(i)) | 0;
  }
  return ((hash & 1) === 0 ? 0 : 1);
}
