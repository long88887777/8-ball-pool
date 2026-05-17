import type { NetworkHealthStatus, OnlinePhase, RealtimeConnectionStatus } from './types';

export interface OnlineStateConfig {
  isHost: boolean;
  turnTimeLimit: number;
  disconnectTimeout: number;
  highLatencyThreshold?: number;
  protectionWindow?: number;
}

export interface OnlineState {
  phase: OnlinePhase;
  turnTimer: number;
  turnTimeLimit: number;
  disconnectTimeout: number;
  highLatencyThreshold: number;
  protectionWindow: number;
  lastOpponentHeartbeat: number;
  realtimeStatus: RealtimeConnectionStatus;
  realtimeStatusUpdatedAt: number;
  opponentPresenceLostAt: number | null;
  disconnectProtectionStartedAt: number | null;
  isMyTurn: boolean;
  winner: 0 | 1 | null;
  gameOverReason: string | null;
}

export interface NetworkHealth {
  status: NetworkHealthStatus;
  latencyMs: number | null;
  remainingProtectionSeconds: number | null;
}

export function createOnlineState(config: OnlineStateConfig): OnlineState {
  const now = Date.now();
  return {
    phase: 'waiting_opponent',
    turnTimer: config.turnTimeLimit,
    turnTimeLimit: config.turnTimeLimit,
    disconnectTimeout: config.disconnectTimeout,
    highLatencyThreshold: config.highLatencyThreshold ?? 10,
    protectionWindow: config.protectionWindow ?? Math.min(15, config.disconnectTimeout),
    lastOpponentHeartbeat: now,
    realtimeStatus: 'connecting',
    realtimeStatusUpdatedAt: now,
    opponentPresenceLostAt: null,
    disconnectProtectionStartedAt: null,
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
  return {
    ...state,
    lastOpponentHeartbeat: now,
    opponentPresenceLostAt: null,
    disconnectProtectionStartedAt: null,
  };
}

export function recordChannelStatus(
  state: OnlineState,
  status: RealtimeConnectionStatus,
  now: number,
): OnlineState {
  return {
    ...state,
    realtimeStatus: status,
    realtimeStatusUpdatedAt: now,
  };
}

export function markOpponentPresenceLost(state: OnlineState, now: number): OnlineState {
  return {
    ...state,
    opponentPresenceLostAt: state.opponentPresenceLostAt ?? now,
    disconnectProtectionStartedAt: state.disconnectProtectionStartedAt ?? now,
  };
}

export function markDisconnectProtectionSeen(state: OnlineState, now: number): OnlineState {
  const health = getNetworkHealth(state, now);
  if (health.status !== 'opponent_protected') {
    return state;
  }
  return {
    ...state,
    disconnectProtectionStartedAt: state.disconnectProtectionStartedAt ?? now,
  };
}

export function getNetworkHealth(state: OnlineState, now: number): NetworkHealth {
  if (state.realtimeStatus === 'connecting' || state.realtimeStatus === 'reconnecting') {
    return {
      status: 'connecting',
      latencyMs: null,
      remainingProtectionSeconds: null,
    };
  }

  if (state.realtimeStatus === 'disconnected') {
    return {
      status: 'disconnected',
      latencyMs: null,
      remainingProtectionSeconds: 0,
    };
  }

  if (state.opponentPresenceLostAt !== null) {
    const elapsed = Math.max(0, now - state.opponentPresenceLostAt);
    const remainingProtectionSeconds = Math.max(0, Math.ceil(state.protectionWindow - elapsed / 1000));
    if (remainingProtectionSeconds > 0) {
      return {
        status: 'opponent_protected',
        latencyMs: null,
        remainingProtectionSeconds,
      };
    }
    return {
      status: 'disconnected',
      latencyMs: null,
      remainingProtectionSeconds: 0,
    };
  }

  const latencyMs = Math.max(0, now - state.lastOpponentHeartbeat);
  const latencySeconds = latencyMs / 1000;
  if (latencySeconds > state.disconnectTimeout) {
    return {
      status: 'disconnected',
      latencyMs,
      remainingProtectionSeconds: 0,
    };
  }
  if (latencySeconds >= state.disconnectTimeout - state.protectionWindow) {
    return {
      status: 'opponent_protected',
      latencyMs,
      remainingProtectionSeconds: Math.max(0, Math.ceil(state.disconnectTimeout - latencySeconds)),
    };
  }
  if (latencySeconds >= state.highLatencyThreshold) {
    return {
      status: 'high_latency',
      latencyMs,
      remainingProtectionSeconds: null,
    };
  }
  return {
    status: 'stable',
    latencyMs,
    remainingProtectionSeconds: null,
  };
}

export function checkDisconnect(state: OnlineState, now: number): boolean {
  if (state.opponentPresenceLostAt !== null) {
    return now - state.opponentPresenceLostAt > state.protectionWindow * 1000;
  }
  return now - state.lastOpponentHeartbeat > state.disconnectTimeout * 1000;
}

export function pickBreakerFromRoomId(roomId: string): 0 | 1 {
  let hash = 0;
  for (let i = 0; i < roomId.length; i += 1) {
    hash = (hash * 31 + roomId.charCodeAt(i)) | 0;
  }
  return ((hash & 1) === 0 ? 0 : 1);
}
