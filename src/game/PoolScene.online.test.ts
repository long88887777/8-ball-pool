import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class {
      game = { registry: { get: vi.fn() }, loop: { delta: 0 } };
    },
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
    Math: {
      Distance: { Between: vi.fn() },
    },
  },
}));

import { CUE_START } from './constants';
import { PoolScene } from './PoolScene';
import { createEightBallState } from './eightBallRules';
import { createGameState } from './state';
import { transitionToMyTurn, transitionToOpponentTurn, type OnlineState } from '../online/onlineState';
import type { RoomInfo } from '../online/types';

type ShotHandlerHarness = {
  handleOpponentShot: (msg: {
    type: 'shot';
    ts: number;
    direction: { x: number; y: number };
    power: number;
    contactOffset: { x: number; y: number };
    cueBallPos: { x: number; y: number };
  }) => void;
  applyPendingOpponentResult: () => void;
  formatCurrentMessageText: () => string;
  restartHandler: () => void;
  reportOnlineLeave: () => void;
  sendOnlineResult: () => void;
  restartRack: ReturnType<typeof vi.fn>;
  showOnlineGameOver: ReturnType<typeof vi.fn>;
  updateHud: ReturnType<typeof vi.fn>;
  updateOnlineStats: ReturnType<typeof vi.fn>;
  gameMode: 'pvp' | 'ai' | 'challenge' | 'online';
  language: 'en' | 'zh';
  roomInfo: RoomInfo | null;
  onlineChannel: { send: ReturnType<typeof vi.fn> } | null;
  onlineState: OnlineState;
  state: ReturnType<typeof createGameState>;
  rules: ReturnType<typeof createEightBallState>;
  pendingResult: {
    type: 'result';
    ts: number;
    balls: Array<{ id: number; x: number; y: number; pocketed: boolean; pocketIndex?: number }>;
  } | null;
  pendingTurnEnd: null;
  ballPocketMap: Map<number, number>;
  physicsEngine: {
    resetCueBall: ReturnType<typeof vi.fn>;
    resetBall: ReturnType<typeof vi.fn>;
    pocketBall: ReturnType<typeof vi.fn>;
    getBalls: ReturnType<typeof vi.fn>;
    strikeCueBall: ReturnType<typeof vi.fn>;
  };
  syncBallsFromPhysics: ReturnType<typeof vi.fn>;
  audio: { play: ReturnType<typeof vi.fn> };
};

function createOnlineSceneHarness(): ShotHandlerHarness {
  const scene = new PoolScene() as unknown as ShotHandlerHarness;

  scene.gameMode = 'online';
  scene.language = 'zh';
  scene.roomInfo = {
    roomId: 'room-1',
    opponentId: 'opponent-1',
    isHost: true,
    myNickname: '小红',
    opponentNickname: '小明',
    myUserId: 'self-1',
  };
  scene.onlineChannel = null;
  scene.onlineState = transitionToOpponentTurn({
    phase: 'waiting_opponent',
    turnTimer: 30,
    turnTimeLimit: 30,
    disconnectTimeout: 30,
    lastOpponentHeartbeat: Date.now(),
    isMyTurn: false,
    winner: null,
    gameOverReason: null,
  });
  scene.state = createGameState(15);
  scene.rules = createEightBallState();
  scene.pendingResult = null;
  scene.pendingTurnEnd = null;
  scene.ballPocketMap = new Map();
  scene.physicsEngine = {
    resetCueBall: vi.fn(),
    resetBall: vi.fn(),
    pocketBall: vi.fn(),
    getBalls: vi.fn(() => []),
    strikeCueBall: vi.fn(),
  };
  scene.syncBallsFromPhysics = vi.fn();
  scene.audio = { play: vi.fn() };
  scene.restartRack = vi.fn();
  scene.showOnlineGameOver = vi.fn();
  scene.updateHud = vi.fn();
  scene.updateOnlineStats = vi.fn();

  return scene;
}

describe('PoolScene online turn state', () => {
  it('records opponent shots so the observer does not stay in break placement mode', () => {
    const scene = createOnlineSceneHarness();

    scene.handleOpponentShot({
      type: 'shot',
      ts: Date.now(),
      direction: { x: 1, y: 0 },
      power: 0.8,
      contactOffset: { x: 0, y: 0 },
      cueBallPos: CUE_START,
    });

    expect(scene.state.strokes).toBe(1);
    expect(scene.rules.shotCount).toBe(1);
  });

  it('formats online turn prompts with nicknames instead of player numbers', () => {
    const scene = createOnlineSceneHarness();
    scene.rules = {
      ...createEightBallState(),
      currentPlayer: 1,
      messageKey: 'eightBallTurnPass',
      messageValues: { player: 2 },
    };

    expect(scene.formatCurrentMessageText()).toBe('未进球，小明 击球。');
  });

  it('sends pocket indexes with online result snapshots', () => {
    const scene = createOnlineSceneHarness();
    const send = vi.fn();
    scene.onlineChannel = { send };
    scene.ballPocketMap.set(5, 3);
    scene.physicsEngine.getBalls.mockReturnValue([
      {
        id: 5,
        position: { x: 920, y: 520 },
        pocketed: true,
      },
    ]);

    scene.sendOnlineResult();

    expect(send).toHaveBeenCalledWith({
      type: 'result',
      balls: [{ id: 5, x: 920, y: 520, pocketed: true, pocketIndex: 3 }],
    });
  });

  it('keeps the synced pocket index before animating opponent result balls', () => {
    const scene = createOnlineSceneHarness();
    scene.pendingResult = {
      type: 'result',
      ts: Date.now(),
      balls: [{ id: 5, x: 920, y: 520, pocketed: true, pocketIndex: 3 }],
    };

    scene.applyPendingOpponentResult();

    expect(scene.physicsEngine.pocketBall).toHaveBeenCalledWith(5);
    expect(scene.ballPocketMap.get(5)).toBe(3);
  });

  it('turns the online primary button into surrender instead of restarting the rack', () => {
    const scene = createOnlineSceneHarness();
    const send = vi.fn();
    scene.onlineChannel = { send };
    scene.onlineState = transitionToMyTurn(scene.onlineState);

    scene.restartHandler();

    expect(send).toHaveBeenCalledWith({ type: 'game_over', reason: 'surrender', winner: 1 });
    expect(scene.onlineState.phase).toBe('game_over');
    expect(scene.showOnlineGameOver).toHaveBeenCalledWith(false, 'surrender');
    expect(scene.restartRack).not.toHaveBeenCalled();
  });

  describe('reportOnlineLeave', () => {
    it('sends game_over(disconnect, winner=opponentIndex) when in-game', () => {
      const scene = createOnlineSceneHarness();
      const send = vi.fn();
      scene.onlineChannel = { send };
      scene.onlineState = transitionToMyTurn(scene.onlineState);

      scene.reportOnlineLeave();

      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith({
        type: 'game_over',
        reason: 'disconnect',
        winner: 1,
      });
      expect(scene.onlineState.phase).toBe('game_over');
    });

    it('is a no-op when phase is already game_over', () => {
      const scene = createOnlineSceneHarness();
      const send = vi.fn();
      scene.onlineChannel = { send };
      scene.onlineState = {
        ...scene.onlineState,
        phase: 'game_over',
      };

      scene.reportOnlineLeave();

      expect(send).not.toHaveBeenCalled();
    });

    it('is a no-op when roomInfo is null (local mode)', () => {
      const scene = createOnlineSceneHarness();
      const send = vi.fn();
      scene.onlineChannel = { send };
      scene.roomInfo = null;

      expect(() => scene.reportOnlineLeave()).not.toThrow();
      expect(send).not.toHaveBeenCalled();
    });

    it('is a no-op when onlineChannel is null', () => {
      const scene = createOnlineSceneHarness();
      scene.onlineChannel = null;

      expect(() => scene.reportOnlineLeave()).not.toThrow();
    });
  });
});
