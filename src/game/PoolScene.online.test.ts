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
import { createEightBallState, resolveEightBallShot, startEightBallShot } from './eightBallRules';
import { createNineBallState, resolveNineBallShot, startNineBallShot, type NineBallState } from './nineBallRules';
import { createGameState } from './state';
import { createDefaultPlayerStats, type PlayerStats } from './growth/stats';
import type { ShotHistoryEntry } from './matchHistory';
import { transitionToMyTurn, transitionToOpponentTurn, type OnlineState } from '../online/onlineState';
import type { MatchAuditEventType, NetworkFoulReason, RoomInfo } from '../online/types';

type ShotHandlerHarness = {
  handleOpponentShot: (msg: {
    type: 'shot';
    ts: number;
    direction: { x: number; y: number };
    power: number;
    contactOffset: { x: number; y: number };
    cueBallPos: { x: number; y: number };
    ballsSnapshot?: Array<{ id: number; x: number; y: number; vx: number; vy: number; pocketed: boolean }>;
  }) => void;
  handleOpponentSnapshot: (msg: {
    type: 'snapshot';
    ts: number;
    balls: Array<{ id: number; x: number; y: number; vx: number; vy: number; pocketed: boolean }>;
  }) => void;
  handleOpponentResult: (msg: {
    type: 'result';
    ts: number;
    balls: Array<{ id: number; x: number; y: number; pocketed: boolean; pocketIndex?: number }>;
  }) => void;
  handleOpponentTurnEnd: (msg: {
    type: 'turn_end';
    ts: number;
    foul: boolean;
    cueBallInHand: boolean;
    nextPlayer: 0 | 1;
    pocketedBallIds: number[];
    gameOver: boolean;
    winner: 0 | 1 | null;
    foulReason?: NetworkFoulReason;
  }) => void;
  handlePhysicsEvents: (events: Array<{ type: 'collision' | 'cushion' | 'pocket'; ballId: number; otherBallId?: number; speed?: number; pocketIndex?: number }>) => void;
  handleOnlineSettled: () => void;
  handleOnlineTimeout: () => void;
  updateOnlineTick: (deltaSeconds: number) => void;
  applyPendingOpponentResult: () => void;
  formatCurrentMessageText: () => string;
  updateShotClockHud: () => void;
  canAim: () => boolean;
  canPlaceBallInHandCueBall: () => boolean;
  restartHandler: () => void;
  reportOnlineLeave: () => void;
  forfeitOnlineMatchToMenu: () => void;
  victoryRestartHandler: () => void;
  bindChatUI: () => void;
  unbindChatUI: () => void;
  syncOnlineChatTriggers: () => void;
  sendOnlineResult: () => void;
  startRematchCountdown: () => void;
  beginRematchCountdown: ReturnType<typeof vi.fn>;
  performRematch: (breaker: 0 | 1, gameSeq?: number) => void;
  restartRack: ReturnType<typeof vi.fn>;
  showOnlineGameOver: (iWin: boolean, reason: string) => void;
  updateHud: ReturnType<typeof vi.fn>;
  logOnlineAuditEvent: (
    eventType: MatchAuditEventType,
    opts?: { reason?: string; metadata?: Record<string, unknown> },
  ) => Promise<void> | void;
  updateOnlineNetworkHud: () => void;
  victoryTitle?: HTMLElement;
  victoryDetail?: HTMLElement;
  victoryOverlay?: HTMLElement;
  victoryRestartButton?: HTMLButtonElement;
  coinResult?: HTMLElement;
  settleMatchCoins: (won: boolean) => void;
  formatCoinResultText: () => string;
  setElementHidden: (selector: string, hidden: boolean) => void;
  leaveOnlineMatch: ReturnType<typeof vi.fn>;
  bindVictoryOverlay: () => void;
  updateOnlineStats: (won: boolean, reason: 'normal' | 'disconnect' | 'surrender') => Promise<void>;
  settleGrowthForMatch: (won: boolean, reason?: 'normal' | 'disconnect' | 'surrender') => void;
  completeDailyGrowthTask: ReturnType<typeof vi.fn>;
  saveGrowthData: ReturnType<typeof vi.fn>;
  supabaseClient: { rpc: ReturnType<typeof vi.fn>; from: ReturnType<typeof vi.fn> };
  matchStartedAt: number | null;
  currentMatchId: string | null;
  onlineGameSeq: number;
  localMatchTracker: { playerStrokes: [number, number] };
  currentShotHistory: ShotHistoryEntry[];
  playerStats: PlayerStats;
  matchGrowthSettled: boolean;
  gameMode: 'pvp' | 'ai' | 'challenge' | 'online';
  language: 'en' | 'zh';
  roomInfo: RoomInfo | null;
  onlineChannel: { send: ReturnType<typeof vi.fn> } | null;
  aimLine: { clear: ReturnType<typeof vi.fn> };
  cueGraphics: { clear: ReturnType<typeof vi.fn> };
  onlineState: OnlineState;
  cueBall: FakeBall;
  targetBalls: FakeBall[];
  state: ReturnType<typeof createGameState>;
  rules: ReturnType<typeof createEightBallState>;
  nineBallRules: NineBallState;
  pendingResult: {
    type: 'result';
    ts: number;
    balls: Array<{ id: number; x: number; y: number; pocketed: boolean; pocketIndex?: number }>;
  } | null;
  pendingTurnEnd: {
    type: 'turn_end';
    ts: number;
    foul: boolean;
    cueBallInHand: boolean;
    nextPlayer: 0 | 1;
    pocketedBallIds: number[];
    gameOver: boolean;
    winner: 0 | 1 | null;
    foulReason?: NetworkFoulReason;
  } | null;
  opponentResultApplied: boolean;
  opponentTurnEndApplied: boolean;
  opponentShotResolved: boolean;
  ballPocketMap: Map<number, number>;
  wasMoving: boolean;
  physicsEngine: {
    resetCueBall: ReturnType<typeof vi.fn>;
    resetBall: ReturnType<typeof vi.fn>;
    pocketBall: ReturnType<typeof vi.fn>;
    getBalls: ReturnType<typeof vi.fn>;
    strikeCueBall: ReturnType<typeof vi.fn>;
    applyNetworkSnapshot: ReturnType<typeof vi.fn>;
    getNetworkSnapshot: ReturnType<typeof vi.fn>;
    isSettled: ReturnType<typeof vi.fn>;
  };
  syncBallsFromPhysics: ((snapshots: Array<{ id: number; kind: 'cue' | 'target'; position: { x: number; y: number }; state: string; pocketed: boolean }>) => void) & ReturnType<typeof vi.fn>;
  startPocketAnimation: ReturnType<typeof vi.fn>;
  audio: { play: ReturnType<typeof vi.fn> };
  gameRuleset: 'eight-ball' | 'nine-ball';
};

type FakeBall = {
  ballId: number;
  pocketed: boolean;
  x: number;
  y: number;
  rotation: number;
  setPosition: ReturnType<typeof vi.fn>;
  setVisible: ReturnType<typeof vi.fn>;
  setScale: ReturnType<typeof vi.fn>;
  setAlpha: ReturnType<typeof vi.fn>;
  setDepth: ReturnType<typeof vi.fn>;
};

function createFakeBall(ballId: number): FakeBall {
  const ball: FakeBall = {
    ballId,
    pocketed: false,
    x: 0,
    y: 0,
    rotation: 0,
    setPosition: vi.fn((x: number, y: number) => {
      ball.x = x;
      ball.y = y;
      return ball;
    }),
    setVisible: vi.fn(() => ball),
    setScale: vi.fn(() => ball),
    setAlpha: vi.fn(() => ball),
    setDepth: vi.fn(() => ball),
  };
  return ball;
}

function createFakeCard(): {
  active: boolean;
  classList: { toggle: (className: string, active: boolean) => void };
  style: { setProperty: ReturnType<typeof vi.fn> };
} {
  const card = {
    active: false,
    classList: {
      toggle: (className: string, active: boolean) => {
        if (className === 'is-active-turn') {
          card.active = active;
        }
      },
    },
    style: {
      setProperty: vi.fn(),
    },
  };
  return card;
}

function createFakeButton(): HTMLButtonElement & { click: () => void } {
  const listeners = new Map<string, EventListener[]>();
  return {
    hidden: false,
    textContent: '',
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      listeners.set(type, (listeners.get(type) ?? []).filter((item) => item !== listener));
    }),
    cloneNode: vi.fn(() => createFakeButton()),
    parentNode: { replaceChild: vi.fn() },
    getBoundingClientRect: () => ({ top: 8, left: 12, bottom: 32 }),
    click: () => {
      for (const listener of listeners.get('click') ?? []) {
        listener(new Event('click'));
      }
    },
  } as unknown as HTMLButtonElement & { click: () => void };
}

function createFakeInput(): HTMLInputElement {
  return {
    value: '',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    cloneNode: vi.fn(() => createFakeInput()),
    focus: vi.fn(),
    parentNode: { replaceChild: vi.fn() },
  } as unknown as HTMLInputElement;
}

function createFakeElement(children: Record<string, HTMLElement> = {}): HTMLElement {
  return {
    hidden: true,
    textContent: '',
    innerHTML: '',
    style: { top: '', left: '' },
    dataset: {},
    appendChild: vi.fn(),
    querySelector: vi.fn((selector: string) => children[selector] ?? null),
    cloneNode: vi.fn(() => createFakeElement(children)),
    addEventListener: vi.fn(),
    parentNode: { replaceChild: vi.fn() },
    offsetParent: {
      getBoundingClientRect: () => ({ top: 0, left: 0 }),
    },
    getBoundingClientRect: () => ({ top: 8, left: 12, bottom: 32 }),
  } as unknown as HTMLElement;
}

function createOnlineSceneHarness(options: { useRealSync?: boolean } = {}): ShotHandlerHarness {
  const scene = new PoolScene() as unknown as ShotHandlerHarness;

  scene.gameMode = 'online';
  scene.gameRuleset = 'eight-ball';
  scene.language = 'zh';
  scene.roomInfo = {
    roomId: 'room-1',
    opponentId: 'opponent-1',
    isHost: true,
    myNickname: '小红',
    opponentNickname: '小明',
    myUserId: 'self-1',
    ruleset: 'eight-ball',
  };
  scene.onlineGameSeq = 1;
  scene.onlineChannel = null;
  scene.aimLine = { clear: vi.fn() };
  scene.cueGraphics = { clear: vi.fn() };
  scene.onlineState = transitionToOpponentTurn({
    phase: 'waiting_opponent',
    turnTimer: 30,
    turnTimeLimit: 30,
    disconnectTimeout: 30,
    highLatencyThreshold: 10,
    protectionWindow: 15,
    lastOpponentHeartbeat: Date.now(),
    realtimeStatus: 'stable',
    realtimeStatusUpdatedAt: Date.now(),
    opponentPresenceLostAt: null,
    disconnectProtectionStartedAt: null,
    isMyTurn: false,
    winner: null,
    gameOverReason: null,
  });
  scene.cueBall = createFakeBall(0);
  scene.targetBalls = Array.from({ length: 15 }, (_, index) => createFakeBall(index + 1));
  scene.state = createGameState(15);
  scene.rules = createEightBallState();
  scene.nineBallRules = createNineBallState();
  scene.pendingResult = null;
  scene.pendingTurnEnd = null;
  scene.opponentResultApplied = false;
  scene.opponentTurnEndApplied = false;
  scene.opponentShotResolved = false;
  scene.ballPocketMap = new Map();
  scene.wasMoving = false;
  scene.physicsEngine = {
    resetCueBall: vi.fn(),
    resetBall: vi.fn(),
    pocketBall: vi.fn(),
    getBalls: vi.fn(() => []),
    strikeCueBall: vi.fn(),
    applyNetworkSnapshot: vi.fn(),
    getNetworkSnapshot: vi.fn(() => []),
    isSettled: vi.fn(() => false),
  };
  if (!options.useRealSync) {
    scene.syncBallsFromPhysics = vi.fn() as ShotHandlerHarness['syncBallsFromPhysics'];
  }
  scene.startPocketAnimation = vi.fn();
  scene.audio = { play: vi.fn() };
  scene.restartRack = vi.fn();
  scene.leaveOnlineMatch = vi.fn();
  scene.showOnlineGameOver = vi.fn() as unknown as ShotHandlerHarness['showOnlineGameOver'];
  scene.updateHud = vi.fn();
  scene.updateOnlineStats = vi.fn(async () => undefined);
  scene.completeDailyGrowthTask = vi.fn();
  scene.saveGrowthData = vi.fn();
  scene.logOnlineAuditEvent = vi.fn();

  return scene;
}

describe('PoolScene online turn state', () => {
  it('keeps a target-ball cushion event that arrives before first-contact in the same physics batch', () => {
    const scene = createOnlineSceneHarness();
    scene.gameMode = 'pvp';
    scene.rules = startEightBallShot({ ...createEightBallState(), shotCount: 1 });

    scene.handlePhysicsEvents([
      { type: 'cushion', ballId: 3, speed: 0.5 },
      { type: 'collision', ballId: 0, otherBallId: 3, speed: 1 },
    ]);
    scene.rules = resolveEightBallShot(scene.rules);

    expect(scene.rules.lastFoul).not.toBe('noCushionAfterContact');
    expect(scene.rules.cueBallInHand).toBe(false);
  });

  it('keeps a nine-ball breaker at the table after the one ball is hit first and an object ball drops', () => {
    const scene = createOnlineSceneHarness();
    scene.gameMode = 'pvp';
    scene.gameRuleset = 'nine-ball';
    scene.nineBallRules = startNineBallShot(createNineBallState());

    scene.handlePhysicsEvents([
      { type: 'collision', ballId: 0, otherBallId: 1, speed: 1 },
      { type: 'collision', ballId: 0, otherBallId: 3, speed: 0.4 },
      { type: 'pocket', ballId: 3, pocketIndex: 0 },
    ]);
    scene.nineBallRules = resolveNineBallShot(scene.nineBallRules);

    expect(scene.nineBallRules.currentPlayer).toBe(0);
    expect(scene.nineBallRules.cueBallInHand).toBe(false);
    expect(scene.nineBallRules.lastFoul).toBeNull();
    expect(scene.nineBallRules.messageKey).toBe('nineBallKeepTurn');
  });

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

  it('starts rematches with the next online game sequence', () => {
    const scene = createOnlineSceneHarness();
    scene.onlineChannel = { send: vi.fn() };
    scene.onlineGameSeq = 1;
    scene.beginRematchCountdown = vi.fn();

    scene.startRematchCountdown();

    expect(scene.onlineChannel.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'rematch_start',
      gameSeq: 2,
    }));
  });

  it('resets online match tracking when a rematch begins', () => {
    const scene = createOnlineSceneHarness();
    scene.onlineGameSeq = 1;
    scene.matchStartedAt = 1000;
    scene.currentMatchId = 'match-1';
    scene.setElementHidden = vi.fn();

    scene.performRematch(0, 2);

    expect(scene.onlineGameSeq).toBe(2);
    expect(scene.currentMatchId).toBeNull();
    expect(scene.matchStartedAt).not.toBe(1000);
    expect(scene.matchStartedAt).toEqual(expect.any(Number));
  });

  it('settles online stats with the current game sequence', async () => {
    const scene = createOnlineSceneHarness();
    scene.onlineGameSeq = 3;
    scene.matchStartedAt = 1000;
    scene.currentMatchId = null;
    scene.localMatchTracker = { playerStrokes: [2, 1] };
    scene.supabaseClient = {
      rpc: vi.fn(async () => ({ data: [{ match_id: 'match-3' }], error: null })),
      from: vi.fn(),
    };
    scene.updateOnlineStats = (
      PoolScene.prototype as unknown as { updateOnlineStats: ShotHandlerHarness['updateOnlineStats'] }
    ).updateOnlineStats.bind(scene);

    await scene.updateOnlineStats(true, 'normal');

    expect(scene.supabaseClient.rpc).toHaveBeenCalledWith('settle_online_match', expect.objectContaining({
      p_room_id: 'room-1',
      p_game_seq: 3,
    }));
  });

  it('attaches shot history to growth match records', () => {
    const scene = createOnlineSceneHarness();
    scene.currentShotHistory = [{
      playerIndex: 0,
      ruleset: 'eight-ball',
      powerPercent: 50,
      spin: { x: 0, y: 0 },
      pocketedBallIds: [1],
      foulReason: null,
      message: 'legal pot',
    }];
    scene.playerStats = createDefaultPlayerStats();
    scene.matchGrowthSettled = false;
    scene.localMatchTracker = { playerStrokes: [3, 4] };

    scene.settleGrowthForMatch(true, 'normal');

    expect(scene.playerStats.recentMatches[0].ruleset).toBe('eight-ball');
    expect(scene.playerStats.recentMatches[0].shotHistory).toEqual(scene.currentShotHistory);
  });

  it('keeps already-pocketed balls pocketed when applying the shot-start snapshot', () => {
    const scene = createOnlineSceneHarness();
    scene.rules = {
      ...createEightBallState(),
      pocketedBallIds: [5],
    };

    scene.handleOpponentShot({
      type: 'shot',
      ts: Date.now(),
      direction: { x: 1, y: 0 },
      power: 0.8,
      contactOffset: { x: 0, y: 0 },
      cueBallPos: CUE_START,
      ballsSnapshot: [
        { id: 5, x: 500, y: 300, vx: 80, vy: 0, pocketed: false },
      ],
    });

    expect(scene.physicsEngine.applyNetworkSnapshot).toHaveBeenCalledWith([
      { id: 5, x: 500, y: 300, vx: 0, vy: 0, pocketed: true },
    ]);
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

  it('applies late opponent results without replaying pocket animations', () => {
    const scene = createOnlineSceneHarness({ useRealSync: true });
    scene.onlineState = { ...scene.onlineState, phase: 'my_turn' };
    scene.pendingResult = {
      type: 'result',
      ts: Date.now(),
      balls: [{ id: 5, x: 920, y: 520, pocketed: true, pocketIndex: 3 }],
    };
    scene.physicsEngine.getBalls.mockReturnValue([
      { id: 5, kind: 'target', position: { x: 920, y: 520 }, state: 'in-pocket', pocketed: true },
    ]);

    scene.applyPendingOpponentResult();

    expect(scene.startPocketAnimation).not.toHaveBeenCalled();
    expect(scene.targetBalls[4].pocketed).toBe(true);
    expect(scene.targetBalls[4].setVisible).toHaveBeenCalledWith(false);
  });

  it('does not show a rules-pocketed ball again from a stale non-pocketed snapshot', () => {
    const scene = createOnlineSceneHarness({ useRealSync: true });
    const ball = scene.targetBalls[4];
    ball.pocketed = true;
    scene.rules = {
      ...createEightBallState(),
      pocketedBallIds: [5],
    };

    scene.syncBallsFromPhysics([
      { id: 5, kind: 'target', position: { x: 500, y: 300 }, state: 'stationary', pocketed: false },
    ]);

    expect(ball.pocketed).toBe(true);
    expect(ball.setVisible).not.toHaveBeenCalledWith(true);
    expect(scene.physicsEngine.pocketBall).toHaveBeenCalledWith(5);
  });

  it('keeps a locally pocketed opponent ball pocketed when a stale snapshot says it is still on the table', () => {
    const scene = createOnlineSceneHarness({ useRealSync: true });
    scene.onlineState = { ...scene.onlineState, phase: 'watching_opponent_shot' };
    scene.wasMoving = true;
    scene.syncBallsFromPhysics([
      { id: 5, kind: 'target', position: { x: 920, y: 520 }, state: 'in-pocket', pocketed: true },
    ]);

    scene.handleOpponentSnapshot({
      type: 'snapshot',
      ts: Date.now(),
      balls: [
        { id: 5, x: 500, y: 300, vx: 120, vy: -60, pocketed: false },
      ],
    });

    expect(scene.physicsEngine.applyNetworkSnapshot).toHaveBeenCalledWith([
      { id: 5, x: 500, y: 300, vx: 0, vy: 0, pocketed: true },
    ]);
  });

  it('ignores cue collisions with balls that are already pocketed in rules', () => {
    const scene = createOnlineSceneHarness();
    scene.gameMode = 'pvp';
    scene.rules = startEightBallShot({
      ...createEightBallState(),
      shotCount: 1,
      players: [
        { id: 0, group: 'solids' },
        { id: 1, group: 'stripes' },
      ],
      pocketedBallIds: [9],
    });

    scene.handlePhysicsEvents([
      { type: 'collision', ballId: 0, otherBallId: 9, speed: 1 },
      { type: 'collision', ballId: 0, otherBallId: 1, speed: 1 },
      { type: 'cushion', ballId: 1, speed: 0.5 },
    ]);

    expect(scene.rules.shot.firstContactBallId).toBe(1);
    expect(resolveEightBallShot(scene.rules).lastFoul).toBeNull();
  });

  it('keeps rules-pocketed balls pocketed when applying opponent snapshots', () => {
    const scene = createOnlineSceneHarness();
    scene.onlineState = { ...scene.onlineState, phase: 'watching_opponent_shot' };
    scene.wasMoving = true;
    scene.rules = {
      ...createEightBallState(),
      pocketedBallIds: [5],
    };

    scene.handleOpponentSnapshot({
      type: 'snapshot',
      ts: Date.now(),
      balls: [
        { id: 5, x: 500, y: 300, vx: 120, vy: -60, pocketed: false },
      ],
    });

    expect(scene.physicsEngine.applyNetworkSnapshot).toHaveBeenCalledWith([
      { id: 5, x: 500, y: 300, vx: 0, vy: 0, pocketed: true },
    ]);
  });

  it('does not reset a rules-pocketed ball from a stale opponent result', () => {
    const scene = createOnlineSceneHarness({ useRealSync: true });
    scene.rules = {
      ...createEightBallState(),
      pocketedBallIds: [5],
    };
    scene.pendingResult = {
      type: 'result',
      ts: Date.now(),
      balls: [{ id: 5, x: 500, y: 300, pocketed: false }],
    };
    scene.physicsEngine.getBalls.mockReturnValue([
      { id: 5, kind: 'target', position: { x: 500, y: 300 }, state: 'in-pocket', pocketed: true },
    ]);

    scene.applyPendingOpponentResult();

    expect(scene.physicsEngine.resetBall).not.toHaveBeenCalledWith(5, { x: 500, y: 300 });
    expect(scene.physicsEngine.pocketBall).toHaveBeenCalledWith(5);
  });

  it('uses turn_end.nextPlayer as the observer rules current player after opponent results', () => {
    const scene = createOnlineSceneHarness();
    scene.roomInfo = { ...scene.roomInfo!, isHost: false };
    scene.onlineState = { ...scene.onlineState, phase: 'watching_opponent_shot' };
    scene.rules = {
      ...createEightBallState(),
      currentPlayer: 0,
      players: [
        { id: 0, group: 'solids' },
        { id: 1, group: 'stripes' },
      ],
      shot: {
        firstContactBallId: 1,
        pocketedBallIds: [1],
        cushionAfterContact: true,
      },
    };
    scene.pendingTurnEnd = {
      type: 'turn_end',
      ts: Date.now(),
      foul: false,
      cueBallInHand: false,
      nextPlayer: 1,
      pocketedBallIds: [],
      gameOver: false,
      winner: null,
      foulReason: 'shotClockExpired',
    };

    scene.applyPendingOpponentResult();

    expect(scene.rules.currentPlayer).toBe(1);
    expect(scene.onlineState.phase).toBe('my_turn');
  });

  it('applies an opponent shot-clock timeout turn_end without requiring shot/result messages first', () => {
    const scene = createOnlineSceneHarness();
    scene.roomInfo = { ...scene.roomInfo!, isHost: false };
    scene.onlineState = transitionToOpponentTurn(scene.onlineState);
    scene.physicsEngine.isSettled.mockReturnValue(true);

    scene.handleOpponentTurnEnd({
      type: 'turn_end',
      ts: Date.now(),
      foul: true,
      cueBallInHand: true,
      nextPlayer: 1,
      pocketedBallIds: [],
      gameOver: false,
      winner: null,
      foulReason: 'shotClockExpired',
    });

    expect(scene.rules.currentPlayer).toBe(1);
    expect(scene.rules.cueBallInHand).toBe(true);
    expect(scene.rules.lastFoul).toBe('shotClockExpired');
    expect(scene.rules.messageKey).toBe('eightBallTimeoutFoul');
    expect(scene.onlineState.phase).toBe('my_turn');
    expect(scene.canPlaceBallInHandCueBall()).toBe(true);
  });

  it('applies an opponent shot-clock timeout after the previous opponent shot was already resolved', () => {
    const scene = createOnlineSceneHarness();
    scene.roomInfo = { ...scene.roomInfo!, isHost: false };
    scene.onlineState = transitionToOpponentTurn(scene.onlineState);
    scene.opponentResultApplied = true;
    scene.opponentTurnEndApplied = true;
    scene.opponentShotResolved = true;
    scene.physicsEngine.isSettled.mockReturnValue(true);

    scene.handleOpponentTurnEnd({
      type: 'turn_end',
      ts: Date.now(),
      foul: true,
      cueBallInHand: true,
      nextPlayer: 1,
      pocketedBallIds: [],
      gameOver: false,
      winner: null,
      foulReason: 'shotClockExpired',
    });

    expect(scene.rules.currentPlayer).toBe(1);
    expect(scene.rules.cueBallInHand).toBe(true);
    expect(scene.rules.lastFoul).toBe('shotClockExpired');
    expect(scene.onlineState.phase).toBe('my_turn');
    expect(scene.canPlaceBallInHandCueBall()).toBe(true);
  });

  it('applies a nine-ball opponent shot-clock timeout after the previous opponent shot was already resolved', () => {
    const scene = createOnlineSceneHarness();
    scene.roomInfo = { ...scene.roomInfo!, isHost: false };
    scene.gameRuleset = 'nine-ball';
    scene.onlineState = transitionToOpponentTurn(scene.onlineState);
    scene.nineBallRules = {
      ...createNineBallState(),
      currentPlayer: 0,
      shotCount: 2,
    };
    scene.opponentResultApplied = true;
    scene.opponentTurnEndApplied = true;
    scene.opponentShotResolved = true;
    scene.physicsEngine.isSettled.mockReturnValue(true);

    scene.handleOpponentTurnEnd({
      type: 'turn_end',
      ts: Date.now(),
      foul: true,
      cueBallInHand: true,
      nextPlayer: 1,
      pocketedBallIds: [],
      gameOver: false,
      winner: null,
      foulReason: 'shotClockExpired',
    });

    expect(scene.nineBallRules.currentPlayer).toBe(1);
    expect(scene.rules.currentPlayer).toBe(1);
    expect(scene.nineBallRules.cueBallInHand).toBe(true);
    expect(scene.nineBallRules.lastFoul).toBe('shotClockExpired');
    expect(scene.onlineState.phase).toBe('my_turn');
    expect(scene.canPlaceBallInHandCueBall()).toBe(true);
  });

  it('pockets balls from authoritative turn_end immediately when result has not arrived yet', () => {
    const scene = createOnlineSceneHarness();
    scene.roomInfo = { ...scene.roomInfo!, isHost: false };
    scene.onlineState = { ...scene.onlineState, phase: 'watching_opponent_shot' };
    scene.pendingTurnEnd = {
      type: 'turn_end',
      ts: Date.now(),
      foul: false,
      cueBallInHand: false,
      nextPlayer: 0,
      pocketedBallIds: [5],
      gameOver: false,
      winner: null,
    };

    scene.applyPendingOpponentResult();

    expect(scene.physicsEngine.pocketBall).toHaveBeenCalledWith(5);
  });

  it('accepts turn_end after an already-applied opponent result so the incoming player gets control', () => {
    const scene = createOnlineSceneHarness();
    scene.roomInfo = { ...scene.roomInfo!, isHost: false };
    scene.onlineState = { ...scene.onlineState, phase: 'watching_opponent_shot' };
    scene.wasMoving = false;
    scene.physicsEngine.isSettled.mockReturnValue(true);
    scene.physicsEngine.getBalls.mockReturnValue([
      { id: 0, kind: 'cue', position: { x: 240, y: 300 }, state: 'stationary', pocketed: false },
    ]);

    scene.handleOpponentResult({
      type: 'result',
      ts: Date.now(),
      balls: [{ id: 0, x: 240, y: 300, pocketed: false }],
    });
    scene.handleOpponentTurnEnd({
      type: 'turn_end',
      ts: Date.now(),
      foul: false,
      cueBallInHand: false,
      nextPlayer: 1,
      pocketedBallIds: [],
      gameOver: false,
      winner: null,
    });

    expect(scene.rules.currentPlayer).toBe(1);
    expect(scene.onlineState.phase).toBe('my_turn');
    expect(scene.canAim()).toBe(true);
  });

  it('accepts a late opponent result after turn_end to correct local drift without pocket animation', () => {
    const scene = createOnlineSceneHarness({ useRealSync: true });
    scene.roomInfo = { ...scene.roomInfo!, isHost: false };
    scene.onlineState = { ...scene.onlineState, phase: 'watching_opponent_shot' };
    scene.wasMoving = false;
    scene.physicsEngine.isSettled.mockReturnValue(true);
    scene.physicsEngine.getBalls.mockReturnValue([
      { id: 5, kind: 'target', position: { x: 920, y: 520 }, state: 'in-pocket', pocketed: true },
      { id: 7, kind: 'target', position: { x: 510, y: 300 }, state: 'stationary', pocketed: false },
    ]);

    scene.handleOpponentTurnEnd({
      type: 'turn_end',
      ts: Date.now(),
      foul: false,
      cueBallInHand: false,
      nextPlayer: 0,
      pocketedBallIds: [5],
      gameOver: false,
      winner: null,
    });
    scene.handleOpponentResult({
      type: 'result',
      ts: Date.now(),
      balls: [
        { id: 5, x: 920, y: 520, pocketed: true, pocketIndex: 3 },
        { id: 7, x: 510, y: 300, pocketed: false },
      ],
    });

    expect(scene.physicsEngine.pocketBall).toHaveBeenCalledWith(5);
    expect(scene.physicsEngine.resetBall).toHaveBeenCalledWith(7, { x: 510, y: 300 });
    expect(scene.startPocketAnimation).not.toHaveBeenCalled();
    expect(scene.targetBalls[4].pocketed).toBe(true);
    expect(scene.targetBalls[6].pocketed).toBe(false);
    expect(scene.onlineState.phase).toBe('opponent_turn');
  });

  it('trusts a non-foul turn_end instead of keeping an observer-local foul', () => {
    const scene = createOnlineSceneHarness();
    scene.roomInfo = { ...scene.roomInfo!, isHost: false };
    scene.onlineState = { ...scene.onlineState, phase: 'watching_opponent_shot' };
    scene.rules = {
      ...createEightBallState(),
      currentPlayer: 0,
      players: [
        { id: 0, group: 'solids' },
        { id: 1, group: 'stripes' },
      ],
      shot: {
        firstContactBallId: 9,
        pocketedBallIds: [],
        cushionAfterContact: false,
      },
    };
    scene.pendingTurnEnd = {
      type: 'turn_end',
      ts: Date.now(),
      foul: false,
      cueBallInHand: false,
      nextPlayer: 1,
      pocketedBallIds: [],
      gameOver: false,
      winner: null,
    };

    scene.applyPendingOpponentResult();

    expect(scene.rules.lastFoul).toBeNull();
    expect(scene.rules.cueBallInHand).toBe(false);
    expect(scene.rules.currentPlayer).toBe(1);
  });

  it('highlights the local player card from online turn state even when rules currentPlayer is stale', () => {
    const scene = createOnlineSceneHarness();
    scene.roomInfo = { ...scene.roomInfo!, isHost: false };
    scene.onlineState = transitionToMyTurn(scene.onlineState);
    scene.rules = {
      ...createEightBallState(),
      currentPlayer: 0,
    };
    const playerOneCard = createFakeCard();
    const playerTwoCard = createFakeCard();
    const previousDocument = globalThis.document;
    globalThis.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '#player-one-card') return playerOneCard;
        if (selector === '#player-two-card') return playerTwoCard;
        if (selector === '#shot-clock') return { textContent: '' };
        return null;
      }),
    } as unknown as Document;

    try {
      scene.updateShotClockHud();

      expect(playerOneCard.active).toBe(false);
      expect(playerTwoCard.active).toBe(true);
    } finally {
      globalThis.document = previousDocument;
    }
  });

  it('allows aiming on my online turn even if rules currentPlayer is stale', () => {
    const scene = createOnlineSceneHarness();
    scene.roomInfo = { ...scene.roomInfo!, isHost: false };
    scene.onlineState = transitionToMyTurn(scene.onlineState);
    scene.rules = {
      ...createEightBallState(),
      currentPlayer: 0,
    };
    scene.physicsEngine.isSettled.mockReturnValue(true);

    expect(scene.canAim()).toBe(true);
  });

  it('assigns a break-pocketed group to the guest shooter even when rules currentPlayer is stale', () => {
    const scene = createOnlineSceneHarness();
    const send = vi.fn();
    scene.onlineChannel = { send };
    scene.roomInfo = { ...scene.roomInfo!, isHost: false };
    scene.onlineState = { ...scene.onlineState, phase: 'watching_my_shot', isMyTurn: false };
    scene.physicsEngine.getBalls.mockReturnValue([]);
    scene.rules = {
      ...createEightBallState(),
      currentPlayer: 0,
      shotCount: 1,
      shot: {
        firstContactBallId: 1,
        pocketedBallIds: [9],
        cushionAfterContact: false,
      },
    };

    scene.handleOnlineSettled();

    expect(scene.rules.players[1].group).toBe('stripes');
    expect(scene.rules.players[0].group).toBe('solids');
    expect(scene.rules.currentPlayer).toBe(1);
  });

  it('updates local rules to opponent ball-in-hand when my online shot clock expires', () => {
    const scene = createOnlineSceneHarness();
    const send = vi.fn();
    scene.onlineChannel = { send };
    scene.onlineState = transitionToMyTurn(scene.onlineState);
    scene.rules = {
      ...createEightBallState(),
      currentPlayer: 0,
    };

    scene.handleOnlineTimeout();

    expect(send).toHaveBeenCalledWith({
      type: 'turn_end',
      foul: true,
      cueBallInHand: true,
      nextPlayer: 1,
      pocketedBallIds: [],
      gameOver: false,
      winner: null,
      foulReason: 'shotClockExpired',
    });
    expect(scene.rules.currentPlayer).toBe(1);
    expect(scene.rules.cueBallInHand).toBe(true);
    expect(scene.rules.lastFoul).toBe('shotClockExpired');
    expect(scene.onlineState.phase).toBe('opponent_turn');
  });

  it('charges a post-break shot-clock timeout to the online shooter even if rules currentPlayer is stale', () => {
    const scene = createOnlineSceneHarness();
    const send = vi.fn();
    scene.onlineChannel = { send };
    scene.roomInfo = { ...scene.roomInfo!, isHost: false };
    scene.onlineState = transitionToMyTurn(scene.onlineState);
    scene.rules = {
      ...createEightBallState(),
      currentPlayer: 0,
      shotCount: 2,
      players: [
        { id: 0, group: 'solids' },
        { id: 1, group: 'stripes' },
      ],
    };

    scene.handleOnlineTimeout();

    expect(send).toHaveBeenCalledWith({
      type: 'turn_end',
      foul: true,
      cueBallInHand: true,
      nextPlayer: 0,
      pocketedBallIds: [],
      gameOver: false,
      winner: null,
      foulReason: 'shotClockExpired',
    });
    expect(scene.rules.currentPlayer).toBe(0);
    expect(scene.rules.cueBallInHand).toBe(true);
    expect(scene.rules.lastFoul).toBe('shotClockExpired');
    expect(scene.rules.messageValues).toEqual({ player: 1 });
    expect(scene.onlineState.phase).toBe('opponent_turn');
  });

  it('charges a post-break nine-ball timeout to the online shooter even if rules currentPlayer is stale', () => {
    const scene = createOnlineSceneHarness();
    const send = vi.fn();
    scene.onlineChannel = { send };
    scene.roomInfo = { ...scene.roomInfo!, isHost: false };
    scene.gameRuleset = 'nine-ball';
    scene.onlineState = transitionToMyTurn(scene.onlineState);
    scene.nineBallRules = {
      ...createNineBallState(),
      currentPlayer: 0,
      shotCount: 2,
    };
    scene.rules = {
      ...scene.rules,
      currentPlayer: 0,
    };

    scene.handleOnlineTimeout();

    expect(send).toHaveBeenCalledWith({
      type: 'turn_end',
      foul: true,
      cueBallInHand: true,
      nextPlayer: 0,
      pocketedBallIds: [],
      gameOver: false,
      winner: null,
      foulReason: 'shotClockExpired',
    });
    expect(scene.nineBallRules.currentPlayer).toBe(0);
    expect(scene.rules.currentPlayer).toBe(0);
    expect(scene.nineBallRules.cueBallInHand).toBe(true);
    expect(scene.nineBallRules.lastFoul).toBe('shotClockExpired');
    expect(scene.nineBallRules.consecutiveFouls).toEqual([0, 1]);
    expect(scene.nineBallRules.messageValues).toEqual({
      player: 1,
      shooter: 2,
      reason: 'shotClockExpired',
    });
    expect(scene.onlineState.phase).toBe('opponent_turn');
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
    expect(scene.logOnlineAuditEvent).toHaveBeenCalledWith('surrender_sent', {
      reason: 'self_surrender',
      metadata: { winner: 1 },
    });
    expect(scene.restartRack).not.toHaveBeenCalled();
  });

  it('forfeits to menu without offering a rematch when returning from an online match', () => {
    const scene = createOnlineSceneHarness();
    const send = vi.fn();
    scene.onlineChannel = { send };
    scene.onlineState = transitionToMyTurn(scene.onlineState);
    scene.showOnlineGameOver = (PoolScene.prototype as unknown as ShotHandlerHarness).showOnlineGameOver;
    scene.settleMatchCoins = vi.fn();
    scene.formatCoinResultText = vi.fn(() => '');
    scene.setElementHidden = vi.fn();
    scene.victoryTitle = { textContent: '' } as HTMLElement;
    scene.victoryDetail = { textContent: '' } as HTMLElement;
    scene.victoryOverlay = { hidden: true } as HTMLElement;
    scene.victoryRestartButton = { textContent: '' } as HTMLButtonElement;
    scene.coinResult = { textContent: '' } as HTMLElement;

    scene.forfeitOnlineMatchToMenu();

    expect(send).toHaveBeenCalledWith({ type: 'game_over', reason: 'return_to_menu', winner: 1 });
    expect(scene.onlineState.phase).toBe('game_over');
    expect(scene.victoryRestartButton.textContent).toBe('确定');
    expect(scene.setElementHidden).toHaveBeenCalledWith('#rematch-actions', true);
    expect(scene.setElementHidden).toHaveBeenCalledWith('#victory-actions', false);
  });

  it('keeps chat buttons wired after scene cleanup and a second bind', () => {
    const previousDocument = globalThis.document;
    const chatTriggerP1 = createFakeButton();
    const chatTriggerP2 = createFakeButton();
    const popover = createFakeElement();
    const input = createFakeInput();
    const emojiButton = createFakeButton();
    const emojiList = createFakeElement();
    const sendButton = createFakeButton();
    const myBubble = createFakeElement({
      '.chat-msg-sender-inline': createFakeElement(),
      '.chat-msg-text-inline': createFakeElement(),
    });
    const opponentBubble = createFakeElement({
      '.chat-msg-sender-inline': createFakeElement(),
      '.chat-msg-text-inline': createFakeElement(),
    });
    const nodes: Record<string, HTMLElement> = {
      '#chat-trigger-p1': chatTriggerP1,
      '#chat-trigger-p2': chatTriggerP2,
      '#chat-popover': popover,
      '#chat-popover-input': input,
      '#chat-popover-emoji': emojiButton,
      '#chat-popover-emojis': emojiList,
      '#chat-popover-send': sendButton,
      '#chat-my-bubble': myBubble,
      '#chat-opponent-bubble': opponentBubble,
    };
    globalThis.document = {
      querySelector: vi.fn((selector: string) => nodes[selector] ?? null),
      createElement: vi.fn(() => createFakeButton()),
    } as unknown as Document;

    try {
      const scene = createOnlineSceneHarness();
      scene.bindChatUI();
      scene.unbindChatUI();
      scene.bindChatUI();

      popover.hidden = true;
      chatTriggerP1.click();

      expect(popover.hidden).toBe(false);
      expect(input.focus).toHaveBeenCalled();
    } finally {
      globalThis.document = previousDocument;
    }
  });

  it('shows only the local player chat button when online mode starts', () => {
    const previousDocument = globalThis.document;
    const chatTriggerP1 = createFakeButton();
    const chatTriggerP2 = createFakeButton();
    const popover = createFakeElement();
    const input = createFakeInput();
    const emojiButton = createFakeButton();
    const emojiList = createFakeElement();
    const sendButton = createFakeButton();
    const myBubble = createFakeElement({
      '.chat-msg-sender-inline': createFakeElement(),
      '.chat-msg-text-inline': createFakeElement(),
    });
    const opponentBubble = createFakeElement({
      '.chat-msg-sender-inline': createFakeElement(),
      '.chat-msg-text-inline': createFakeElement(),
    });
    const nodes: Record<string, HTMLElement> = {
      '#chat-trigger-p1': chatTriggerP1,
      '#chat-trigger-p2': chatTriggerP2,
      '#chat-popover': popover,
      '#chat-popover-input': input,
      '#chat-popover-emoji': emojiButton,
      '#chat-popover-emojis': emojiList,
      '#chat-popover-send': sendButton,
      '#chat-my-bubble': myBubble,
      '#chat-opponent-bubble': opponentBubble,
    };
    globalThis.document = {
      querySelector: vi.fn((selector: string) => nodes[selector] ?? null),
      createElement: vi.fn(() => createFakeButton()),
    } as unknown as Document;

    try {
      const scene = createOnlineSceneHarness();
      scene.roomInfo = { ...scene.roomInfo!, isHost: false };
      scene.bindChatUI();
      scene.syncOnlineChatTriggers();

      expect(chatTriggerP1.hidden).toBe(true);
      expect(chatTriggerP2.hidden).toBe(false);

      popover.hidden = true;
      chatTriggerP2.click();

      expect(popover.hidden).toBe(false);
      expect(input.focus).toHaveBeenCalled();
    } finally {
      globalThis.document = previousDocument;
    }
  });

  it('shows a return-to-menu win as a final confirmation instead of rematch actions', () => {
    const scene = createOnlineSceneHarness();
    const title = { textContent: '' };
    const detail = { textContent: '' };
    const overlay = { hidden: true };
    scene.showOnlineGameOver = (PoolScene.prototype as unknown as ShotHandlerHarness).showOnlineGameOver;
    scene.victoryTitle = title as HTMLElement;
    scene.victoryDetail = detail as HTMLElement;
    scene.victoryOverlay = overlay as HTMLElement;
    scene.victoryRestartButton = { textContent: '' } as HTMLButtonElement;
    scene.coinResult = { textContent: '' } as HTMLElement;
    scene.settleMatchCoins = vi.fn();
    scene.formatCoinResultText = vi.fn(() => '');
    scene.setElementHidden = vi.fn();

    scene.showOnlineGameOver(true, 'return_to_menu');

    expect(title.textContent).toBe('You Win!');
    expect(detail.textContent).toContain('returned to the main menu');
    expect(scene.victoryRestartButton.textContent).toBe('确定');
    expect(scene.setElementHidden).toHaveBeenCalledWith('#rematch-actions', true);
    expect(scene.setElementHidden).toHaveBeenCalledWith('#victory-actions', false);
  });

  it('hides stale game-over overlay when a new scene binds the shared DOM overlay', () => {
    const scene = createOnlineSceneHarness();
    const previousDocument = globalThis.document;
    const overlay = { hidden: false };
    const title = { textContent: 'You Lose' };
    const detail = { textContent: 'You returned to the main menu.' };
    const restart = createFakeButton();
    const nodes: Record<string, HTMLElement> = {
      '#victory-overlay': overlay as HTMLElement,
      '#victory-title': title as HTMLElement,
      '#victory-detail': detail as HTMLElement,
      '#coin-result': { textContent: '' } as HTMLElement,
      '#victory-restart': restart,
      '#rematch-request': createFakeButton(),
      '#rematch-leave': createFakeButton(),
      '#rematch-cancel': createFakeButton(),
      '#rematch-accept': createFakeButton(),
      '#rematch-decline': createFakeButton(),
    };
    globalThis.document = {
      querySelector: vi.fn((selector: string) => nodes[selector] ?? null),
    } as unknown as Document;
    scene.bindVictoryOverlay = (PoolScene.prototype as unknown as ShotHandlerHarness).bindVictoryOverlay;

    try {
      scene.bindVictoryOverlay();

      expect(overlay.hidden).toBe(true);
      expect(title.textContent).toBe('You Lose');
      expect(detail.textContent).toBe('You returned to the main menu.');
    } finally {
      globalThis.document = previousDocument;
    }
  });

  it('leaves the online match when confirming a return-to-menu final result', () => {
    const scene = createOnlineSceneHarness();
    scene.onlineState = {
      ...transitionToMyTurn(scene.onlineState),
      phase: 'game_over',
      winner: 1,
      gameOverReason: 'return_to_menu',
    };

    scene.victoryRestartHandler();

    expect(scene.leaveOnlineMatch).toHaveBeenCalledOnce();
    expect(scene.restartRack).not.toHaveBeenCalled();
  });

  it('keeps the stable channel status when starting a rematch on the existing connection', () => {
    const scene = createOnlineSceneHarness();
    const previousDocument = globalThis.document;
    scene.onlineState = {
      ...scene.onlineState,
      phase: 'game_over',
      realtimeStatus: 'stable',
      lastOpponentHeartbeat: Date.now() - 1000,
    };

    globalThis.document = {
      querySelector: vi.fn(() => null),
    } as unknown as Document;

    try {
      scene.performRematch(0);

      expect(scene.onlineState.realtimeStatus).toBe('stable');
    } finally {
      globalThis.document = previousDocument;
    }
  });

  it('shows a protection countdown instead of ending immediately when opponent heartbeat is late', () => {
    const scene = createOnlineSceneHarness();
    const previousDocument = globalThis.document;
    const networkStatus = {
      textContent: '',
      dataset: {} as Record<string, string>,
      hidden: true,
    };
    scene.onlineState = {
      ...scene.onlineState,
      lastOpponentHeartbeat: Date.now() - 18000,
      realtimeStatus: 'stable',
    };
    globalThis.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '#network-status') return networkStatus;
        return null;
      }),
    } as unknown as Document;

    try {
      scene.updateOnlineNetworkHud();

      expect(networkStatus.hidden).toBe(false);
      expect(networkStatus.dataset.status).toBe('opponent_protected');
      expect(networkStatus.textContent).toContain('保护');
      expect(networkStatus.textContent).toContain('12');
      expect(scene.showOnlineGameOver).not.toHaveBeenCalled();
    } finally {
      globalThis.document = previousDocument;
    }
  });

  it('logs late moving snapshots as sync anomalies when an authoritative result already exists', () => {
    const scene = createOnlineSceneHarness();
    scene.onlineState = { ...scene.onlineState, phase: 'watching_opponent_shot' };
    scene.wasMoving = true;
    scene.pendingResult = {
      type: 'result',
      ts: Date.now(),
      balls: [{ id: 5, x: 920, y: 520, pocketed: true, pocketIndex: 3 }],
    };
    scene.physicsEngine.isSettled.mockReturnValue(false);

    scene.handleOpponentSnapshot({
      type: 'snapshot',
      ts: Date.now(),
      balls: [{ id: 5, x: 500, y: 300, vx: 260, vy: -140, pocketed: false }],
    });

    expect(scene.logOnlineAuditEvent).toHaveBeenCalledWith('sync_anomaly', {
      reason: 'late_snapshot_after_authoritative_result',
      metadata: { ballCount: 1 },
    });
  });

  it('renders online game over details for both disconnect and surrender perspectives', () => {
    const scene = createOnlineSceneHarness();
    const title = { textContent: '' };
    const detail = { textContent: '' };
    const overlay = { hidden: true };
    scene.showOnlineGameOver = (PoolScene.prototype as unknown as ShotHandlerHarness).showOnlineGameOver;
    scene.victoryTitle = title as HTMLElement;
    scene.victoryDetail = detail as HTMLElement;
    scene.victoryOverlay = overlay as HTMLElement;
    scene.coinResult = { textContent: '' } as HTMLElement;
    scene.settleMatchCoins = vi.fn();
    scene.formatCoinResultText = vi.fn(() => '');
    scene.setElementHidden = vi.fn();

    scene.showOnlineGameOver(true, 'disconnect');
    expect(title.textContent).toBe('You Win!');
    expect(detail.textContent).toContain('Opponent disconnected');

    scene.showOnlineGameOver(false, 'disconnect');
    expect(title.textContent).toBe('You Lose');
    expect(detail.textContent).toContain('You disconnected');

    scene.showOnlineGameOver(true, 'surrender');
    expect(detail.textContent).toContain('Opponent surrendered');

    scene.showOnlineGameOver(false, 'surrender');
    expect(detail.textContent).toContain('You surrendered');
  });

  it('persists audit events with room, player, phase, reason, and metadata', async () => {
    const scene = createOnlineSceneHarness();
    const insert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ insert }));
    scene.logOnlineAuditEvent = (PoolScene.prototype as unknown as ShotHandlerHarness).logOnlineAuditEvent;
    scene.supabaseClient = { rpc: vi.fn(), from };
    scene.onlineState = { ...scene.onlineState, phase: 'my_turn' };

    await scene.logOnlineAuditEvent('turn_end_sent' as MatchAuditEventType, {
      reason: 'timeout',
      metadata: { nextPlayer: 1 },
    });

    expect(from).toHaveBeenCalledWith('match_audit_logs');
    expect(insert).toHaveBeenCalledWith({
      room_id: 'room-1',
      match_id: null,
      player_id: 'self-1',
      event_type: 'turn_end_sent',
      reason: 'timeout',
      phase: 'my_turn',
      metadata: { nextPlayer: 1 },
    });
  });

  it('settles online matches through the room-scoped RPC so both players are updated once', async () => {
    const scene = createOnlineSceneHarness();
    const rpc = vi.fn(async () => ({ data: [{ match_id: 'match-1' }], error: null }));
    const from = vi.fn();
    scene.updateOnlineStats = (PoolScene.prototype as unknown as ShotHandlerHarness).updateOnlineStats;
    scene.supabaseClient = { rpc, from };
    scene.matchStartedAt = Date.parse('2026-05-22T00:00:00.000Z');
    scene.localMatchTracker = { playerStrokes: [2, 3] };

    await scene.updateOnlineStats(true, 'disconnect');

    expect(rpc).toHaveBeenCalledWith('settle_online_match', {
      p_room_id: 'room-1',
      p_winner_id: 'self-1',
      p_reason: 'disconnect',
      p_started_at: '2026-05-22T00:00:00.000Z',
      p_player1_strokes: 2,
      p_player2_strokes: 3,
      p_player1_cleared_table: false,
      p_player2_cleared_table: false,
      p_game_seq: 1,
    });
    expect(scene.currentMatchId).toBe('match-1');
    expect(from).not.toHaveBeenCalled();
  });

  it('forfeits and settles locally when opponent is disconnected for more than 30 seconds even if the game_over send fails', () => {
    const scene = createOnlineSceneHarness();
    const previousDocument = globalThis.document;
    const send = vi.fn(() => {
      throw new Error('channel closed');
    });
    scene.onlineChannel = { send };
    scene.onlineState = {
      ...transitionToOpponentTurn(scene.onlineState),
      lastOpponentHeartbeat: Date.now() - 31000,
      realtimeStatus: 'stable',
    };
    globalThis.document = {
      querySelector: vi.fn(() => null),
    } as unknown as Document;

    try {
      expect(() => scene.updateOnlineTick(0)).not.toThrow();

      expect(send).toHaveBeenCalledWith({ type: 'game_over', reason: 'disconnect', winner: 0 });
      expect(scene.onlineState.phase).toBe('game_over');
      expect(scene.showOnlineGameOver).toHaveBeenCalledWith(true, 'disconnect');
      expect(scene.updateOnlineStats).toHaveBeenCalledWith(true, 'disconnect');
    } finally {
      globalThis.document = previousDocument;
    }
  });

  it('applies snapshot when watching opponent shot and balls still in motion', () => {
    const scene = createOnlineSceneHarness();
    scene.onlineState = { ...scene.onlineState, phase: 'watching_opponent_shot' };
    scene.wasMoving = true;
    scene.physicsEngine.isSettled.mockReturnValue(false);
    const balls = [
      { id: 0, x: 250, y: 300, vx: 1, vy: 0, pocketed: false },
    ];

    scene.handleOpponentSnapshot({
      type: 'snapshot',
      ts: Date.now(),
      balls,
    });

    expect(scene.physicsEngine.applyNetworkSnapshot).toHaveBeenCalledWith(balls);
  });

  it('ignores late snapshot arriving after observer physics already settled', () => {
    const scene = createOnlineSceneHarness();
    scene.onlineState = { ...scene.onlineState, phase: 'watching_opponent_shot' };
    scene.wasMoving = false;
    scene.physicsEngine.isSettled.mockReturnValue(true);
    const balls = [
      { id: 0, x: 250, y: 300, vx: 50, vy: 0, pocketed: false },
    ];

    scene.handleOpponentSnapshot({
      type: 'snapshot',
      ts: Date.now(),
      balls,
    });

    expect(scene.physicsEngine.applyNetworkSnapshot).not.toHaveBeenCalled();
  });

  it('ignores late moving snapshots after the opponent result has already arrived', () => {
    const scene = createOnlineSceneHarness();
    scene.onlineState = { ...scene.onlineState, phase: 'watching_opponent_shot' };
    scene.wasMoving = true;
    scene.pendingResult = {
      type: 'result',
      ts: Date.now(),
      balls: [{ id: 5, x: 920, y: 520, pocketed: true, pocketIndex: 3 }],
    };
    scene.physicsEngine.isSettled.mockReturnValue(false);

    scene.handleOpponentSnapshot({
      type: 'snapshot',
      ts: Date.now(),
      balls: [{ id: 5, x: 500, y: 300, vx: 260, vy: -140, pocketed: false }],
    });

    expect(scene.physicsEngine.applyNetworkSnapshot).not.toHaveBeenCalled();
    expect(scene.syncBallsFromPhysics).not.toHaveBeenCalled();
  });

  it('ignores snapshots after the opponent result has already been applied', () => {
    const scene = createOnlineSceneHarness();
    scene.onlineState = { ...scene.onlineState, phase: 'watching_opponent_shot' };
    scene.pendingResult = {
      type: 'result',
      ts: Date.now(),
      balls: [{ id: 5, x: 920, y: 520, pocketed: true, pocketIndex: 3 }],
    };
    scene.applyPendingOpponentResult();
    scene.wasMoving = true;
    scene.physicsEngine.isSettled.mockReturnValue(false);

    scene.handleOpponentSnapshot({
      type: 'snapshot',
      ts: Date.now(),
      balls: [{ id: 5, x: 500, y: 300, vx: 260, vy: -140, pocketed: false }],
    });

    expect(scene.physicsEngine.applyNetworkSnapshot).not.toHaveBeenCalled();
    expect(scene.syncBallsFromPhysics).toHaveBeenCalledTimes(1);
  });

  it('ignores late opponent result messages after the observed shot is over', () => {
    const scene = createOnlineSceneHarness();
    scene.onlineState = transitionToMyTurn(scene.onlineState);
    scene.wasMoving = false;
    scene.physicsEngine.isSettled.mockReturnValue(true);

    scene.handleOpponentResult({
      type: 'result',
      ts: Date.now(),
      balls: [{ id: 5, x: 920, y: 520, pocketed: true, pocketIndex: 3 }],
    });

    expect(scene.physicsEngine.pocketBall).not.toHaveBeenCalled();
    expect(scene.pendingResult).toBeNull();
    expect(scene.syncBallsFromPhysics).not.toHaveBeenCalled();
  });

  it('ignores snapshot when not in watching_opponent_shot phase', () => {
    const scene = createOnlineSceneHarness();
    scene.onlineState = { ...scene.onlineState, phase: 'my_turn' };
    scene.wasMoving = true;
    scene.physicsEngine.isSettled.mockReturnValue(false);

    scene.handleOpponentSnapshot({
      type: 'snapshot',
      ts: Date.now(),
      balls: [{ id: 0, x: 100, y: 100, vx: 0, vy: 0, pocketed: false }],
    });

    expect(scene.physicsEngine.applyNetworkSnapshot).not.toHaveBeenCalled();
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
