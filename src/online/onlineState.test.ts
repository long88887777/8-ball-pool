import { describe, expect, it } from 'vitest';
import {
  createOnlineState,
  transitionToMyTurn,
  transitionToOpponentTurn,
  transitionToWatchingMyShot,
  transitionToWatchingOpponentShot,
  transitionToGameOver,
  tickTurnTimer,
  recordHeartbeat,
  checkDisconnect,
} from './onlineState';

describe('onlineState', () => {
  describe('createOnlineState', () => {
    it('creates state with waiting_opponent phase', () => {
      const state = createOnlineState({ isHost: true, turnTimeLimit: 30, disconnectTimeout: 30 });
      expect(state.phase).toBe('waiting_opponent');
      expect(state.turnTimer).toBe(30);
      expect(state.isMyTurn).toBe(false);
    });
  });

  describe('transitions', () => {
    it('transitions to my_turn and sets isMyTurn true', () => {
      const initial = createOnlineState({ isHost: true, turnTimeLimit: 30, disconnectTimeout: 30 });
      const state = transitionToMyTurn(initial);
      expect(state.phase).toBe('my_turn');
      expect(state.isMyTurn).toBe(true);
      expect(state.turnTimer).toBe(30);
    });

    it('transitions to opponent_turn and sets isMyTurn false', () => {
      const initial = transitionToMyTurn(
        createOnlineState({ isHost: true, turnTimeLimit: 30, disconnectTimeout: 30 })
      );
      const state = transitionToOpponentTurn(initial);
      expect(state.phase).toBe('opponent_turn');
      expect(state.isMyTurn).toBe(false);
    });

    it('transitions to watching_my_shot', () => {
      const initial = transitionToMyTurn(
        createOnlineState({ isHost: true, turnTimeLimit: 30, disconnectTimeout: 30 })
      );
      const state = transitionToWatchingMyShot(initial);
      expect(state.phase).toBe('watching_my_shot');
      expect(state.isMyTurn).toBe(false);
    });

    it('transitions to watching_opponent_shot', () => {
      const initial = transitionToOpponentTurn(
        createOnlineState({ isHost: true, turnTimeLimit: 30, disconnectTimeout: 30 })
      );
      const state = transitionToWatchingOpponentShot(initial);
      expect(state.phase).toBe('watching_opponent_shot');
      expect(state.isMyTurn).toBe(false);
    });

    it('transitions to game_over', () => {
      const initial = createOnlineState({ isHost: true, turnTimeLimit: 30, disconnectTimeout: 30 });
      const state = transitionToGameOver(initial, 0, 'normal');
      expect(state.phase).toBe('game_over');
      expect(state.winner).toBe(0);
      expect(state.gameOverReason).toBe('normal');
    });
  });

  describe('tickTurnTimer', () => {
    it('decrements timer during my_turn', () => {
      const state = transitionToMyTurn(
        createOnlineState({ isHost: true, turnTimeLimit: 30, disconnectTimeout: 30 })
      );
      const ticked = tickTurnTimer(state, 1.5);
      expect(ticked.turnTimer).toBeCloseTo(28.5);
    });

    it('does not go below zero', () => {
      const state = transitionToMyTurn(
        createOnlineState({ isHost: true, turnTimeLimit: 30, disconnectTimeout: 30 })
      );
      const ticked = tickTurnTimer(state, 50);
      expect(ticked.turnTimer).toBe(0);
    });

    it('does not tick during opponent_turn', () => {
      const state = transitionToOpponentTurn(
        createOnlineState({ isHost: true, turnTimeLimit: 30, disconnectTimeout: 30 })
      );
      const ticked = tickTurnTimer(state, 5);
      expect(ticked.turnTimer).toBe(30);
    });
  });

  describe('heartbeat and disconnect', () => {
    it('recordHeartbeat updates lastOpponentHeartbeat', () => {
      const state = createOnlineState({ isHost: true, turnTimeLimit: 30, disconnectTimeout: 30 });
      const now = Date.now();
      const updated = recordHeartbeat(state, now);
      expect(updated.lastOpponentHeartbeat).toBe(now);
    });

    it('checkDisconnect returns false within timeout', () => {
      const now = Date.now();
      const state = recordHeartbeat(
        createOnlineState({ isHost: true, turnTimeLimit: 30, disconnectTimeout: 30 }),
        now
      );
      expect(checkDisconnect(state, now + 10000)).toBe(false);
    });

    it('checkDisconnect returns true after timeout', () => {
      const now = Date.now();
      const state = recordHeartbeat(
        createOnlineState({ isHost: true, turnTimeLimit: 30, disconnectTimeout: 30 }),
        now
      );
      expect(checkDisconnect(state, now + 31000)).toBe(true);
    });
  });
});
