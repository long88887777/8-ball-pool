import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class {
      game = { registry: { get: vi.fn() }, loop: { delta: 0 } };
    },
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
    Math: {
      Distance: { Between: (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x1 - x2, y1 - y2) },
    },
  },
}));

vi.mock('./challenge/progress', async () => {
  const actual = await vi.importActual<typeof import('./challenge/progress')>('./challenge/progress');
  return {
    ...actual,
    readProgressSupabase: vi.fn(async () => ({ levels: {} })),
    writeProgressSupabase: vi.fn(async (_client: unknown, progress: unknown) => progress),
  };
});

import { CUE_START, type Vector } from './constants';
import { PoolScene } from './PoolScene';
import {
  createChallengeState,
  recordChallengeCuePocket,
  recordChallengeOrderedPocket,
  recordChallengePocket,
  recordChallengeShot,
  resolveChallengeResult,
  type ChallengeState,
} from './challenge/challengeState';
import { CHALLENGE_LEVELS, type ChallengeLevel } from './challenge/levels';
import { createEightBallState, type EightBallState } from './eightBallRules';
import { clampBreakCuePosition } from './geometry';
import { createGameState, type GameState } from './state';

type FakeBall = {
  ballId: number;
  pocketed: boolean;
  x: number;
  y: number;
  destroy: ReturnType<typeof vi.fn>;
  setPosition: ReturnType<typeof vi.fn>;
  setVisible: ReturnType<typeof vi.fn>;
};

type ChallengeSceneHarness = {
  gameMode: 'pvp' | 'ai' | 'challenge' | 'online';
  currentLevel: ChallengeLevel | null;
  challengeState: ChallengeState | null;
  cueBall: FakeBall;
  targetBalls: FakeBall[];
  state: GameState;
  rules: EightBallState;
  wasMoving: boolean;
  cuePlacementState: unknown;
  strikeLocked: boolean;
  aiThinking: boolean;
  physicsEngine: {
    rack: ReturnType<typeof vi.fn>;
    getBalls: ReturnType<typeof vi.fn>;
    resetCueBall: ReturnType<typeof vi.fn>;
    resetBall: ReturnType<typeof vi.fn>;
    isSettled: ReturnType<typeof vi.fn>;
  };
  aimLine: { clear: ReturnType<typeof vi.fn> };
  cueGraphics: { clear: ReturnType<typeof vi.fn> };
  feedbackGraphics: { clear: ReturnType<typeof vi.fn> };
  forbiddenIcon: { setVisible: ReturnType<typeof vi.fn> };
  handSprite: { setVisible: ReturnType<typeof vi.fn> };
  createBall: (position: Vector, texture: string, kind: 'cue' | 'target', ballId?: number) => FakeBall;
  hideChallengeSelect: ReturnType<typeof vi.fn>;
  hideChallengeResult: ReturnType<typeof vi.fn>;
  updateChallengeHud: ReturnType<typeof vi.fn>;
  hideVictoryScreen: ReturnType<typeof vi.fn>;
  setSelectedSpin: ReturnType<typeof vi.fn>;
  syncBallsFromPhysics: ReturnType<typeof vi.fn>;
  showChallengeResult: ReturnType<typeof vi.fn>;
  updateAimHud: ReturnType<typeof vi.fn>;
  input: { on: ReturnType<typeof vi.fn> };
  audio: { unlock: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn> };
  aimState: unknown;
  canStartBreakCuePlacement: (point: Vector) => boolean;
  canPlaceBreakCueBall: () => boolean;
  canAim: () => boolean;
  bindInput: () => void;
  handlePhysicsEvents: (events: Array<
    | { type: 'collision'; ballId: number; otherBallId: number; speed: number }
    | { type: 'pocket'; ballId: number; pocketIndex: number }
  >) => void;
  handleSettledTable: (settled: boolean) => void;
  startChallengeLevel: (level: ChallengeLevel) => void;
};

type ChallengeResultHarness = {
  language: 'en' | 'zh';
  challengeResultOverlay?: HTMLElement;
  challengeState: ChallengeState | null;
  cachedProgress: { levels: Record<string, { stars: number; bestShots: number }> } | null;
  saveChallengeProgress: ReturnType<typeof vi.fn>;
  completeDailyGrowthTask: ReturnType<typeof vi.fn>;
  showChallengeResult: () => Promise<void>;
};

function createFakeBall(ballId: number, position: Vector = { x: 0, y: 0 }): FakeBall {
  const ball: FakeBall = {
    ballId,
    pocketed: false,
    x: position.x,
    y: position.y,
    destroy: vi.fn(),
    setPosition: vi.fn((x: number, y: number) => {
      ball.x = x;
      ball.y = y;
      return ball;
    }),
    setVisible: vi.fn(() => ball),
  };
  return ball;
}

function createChallengeHarness(): ChallengeSceneHarness {
  const scene = new PoolScene() as unknown as ChallengeSceneHarness;

  scene.gameMode = 'challenge';
  scene.currentLevel = null;
  scene.challengeState = null;
  scene.cueBall = createFakeBall(0);
  scene.targetBalls = [];
  scene.state = createGameState(1);
  scene.rules = createEightBallState();
  scene.wasMoving = true;
  scene.cuePlacementState = null;
  scene.strikeLocked = false;
  scene.aiThinking = false;
  scene.physicsEngine = {
    rack: vi.fn(),
    getBalls: vi.fn(() => []),
    resetCueBall: vi.fn(),
    resetBall: vi.fn(),
    isSettled: vi.fn(() => true),
  };
  scene.aimLine = { clear: vi.fn() };
  scene.cueGraphics = { clear: vi.fn() };
  scene.feedbackGraphics = { clear: vi.fn() };
  scene.forbiddenIcon = { setVisible: vi.fn() };
  scene.handSprite = { setVisible: vi.fn() };
  scene.createBall = vi.fn((position: Vector, _texture: string, _kind: 'cue' | 'target', ballId = 0) =>
    createFakeBall(ballId, position),
  );
  scene.hideChallengeSelect = vi.fn();
  scene.hideChallengeResult = vi.fn();
  scene.updateChallengeHud = vi.fn();
  scene.hideVictoryScreen = vi.fn();
  scene.setSelectedSpin = vi.fn();
  scene.syncBallsFromPhysics = vi.fn();
  scene.showChallengeResult = vi.fn();
  scene.updateAimHud = vi.fn();
  scene.input = { on: vi.fn() };
  scene.audio = { unlock: vi.fn(), play: vi.fn() };
  scene.aimState = null;

  return scene;
}

function physicsBall(id: number, pocketed: boolean) {
  return {
    id,
    kind: id === 0 ? 'cue' : 'target',
    position: { x: 100 + id, y: 200 + id },
    state: pocketed ? 'in-pocket' : 'stationary',
    pocketed,
  };
}

describe('PoolScene challenge rules', () => {
  it('starts every challenge level with break-line cue placement available', () => {
    const scene = createChallengeHarness();
    const level = CHALLENGE_LEVELS[0];

    scene.state = { ...createGameState(1), strokes: 4 };
    scene.rules = { ...createEightBallState(), cueBallInHand: true };

    scene.startChallengeLevel(level);

    expect(scene.state.strokes).toBe(0);
    expect(scene.rules.cueBallInHand).toBe(false);
    expect(scene.canPlaceBreakCueBall()).toBe(true);
    expect(scene.physicsEngine.rack).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 0,
          position: clampBreakCuePosition(level.balls[0].position),
        }),
      ]),
    );
  });

  it('lets challenge break-line free ball placement start from anywhere on the table', () => {
    const scene = createChallengeHarness();

    scene.state = createGameState(1);
    scene.rules = createEightBallState();
    scene.cueBall = createFakeBall(0, CUE_START);

    expect(scene.canStartBreakCuePlacement({ x: 900, y: 320 })).toBe(true);
  });

  it('allows aiming after the opening challenge cue placement is confirmed', () => {
    const scene = createChallengeHarness();
    const handlers = new Map<string, (pointer: { id: number; worldX: number; worldY: number; rightButtonDown: () => boolean }) => void>();
    scene.input.on.mockImplementation((eventName: string, handler: (pointer: { id: number; worldX: number; worldY: number; rightButtonDown: () => boolean }) => void) => {
      handlers.set(eventName, handler);
      return scene.input;
    });

    scene.state = createGameState(1);
    scene.rules = createEightBallState();
    scene.cueBall = createFakeBall(0, CUE_START);
    scene.bindInput();

    handlers.get('pointerdown')!({ id: 1, worldX: 900, worldY: 320, rightButtonDown: () => false });
    handlers.get('pointerup')!({ id: 1, worldX: 900, worldY: 320, rightButtonDown: () => false });

    expect(scene.canPlaceBreakCueBall()).toBe(false);

    handlers.get('pointerdown')!({ id: 2, worldX: 900, worldY: 320, rightButtonDown: () => false });

    expect(scene.cuePlacementState).toBeNull();
    expect(scene.aimState).toEqual({ pointerId: 2, current: { x: 900, y: 320 } });
  });

  it('gives full-table ball in hand after a non-final cue scratch without reverting pocketed targets', () => {
    const scene = createChallengeHarness();
    const level = CHALLENGE_LEVELS[2];
    const sortedIds = [1, 2];

    scene.currentLevel = level;
    scene.challengeState = createChallengeState(level);
    scene.challengeState = recordChallengeShot(scene.challengeState);
    scene.challengeState = recordChallengeOrderedPocket(scene.challengeState, 1, sortedIds);
    scene.challengeState = recordChallengeCuePocket(scene.challengeState);
    scene.physicsEngine.getBalls.mockReturnValue([
      physicsBall(0, true),
      physicsBall(1, true),
      physicsBall(2, false),
    ]);

    scene.handleSettledTable(true);

    expect(scene.challengeState?.targetsPocketed).toBe(1);
    expect(scene.challengeState?.allPocketedBallIds).toEqual([1]);
    expect(scene.rules.cueBallInHand).toBe(true);
    expect(scene.physicsEngine.resetCueBall).toHaveBeenCalledWith(CUE_START);
    expect(scene.physicsEngine.resetBall).not.toHaveBeenCalledWith(1, expect.anything());
    expect(scene.showChallengeResult).not.toHaveBeenCalled();
  });

  it('keeps level 7 ball 2 pocketed after the cue ball kicks ball 1 so ball 1 can finish the level', () => {
    const scene = createChallengeHarness();
    const level = CHALLENGE_LEVELS[6];

    scene.currentLevel = level;
    scene.challengeState = createChallengeState(level);
    scene.challengeState = recordChallengeShot(scene.challengeState);
    scene.physicsEngine.getBalls.mockReturnValue([
      physicsBall(0, false),
      physicsBall(1, false),
      physicsBall(2, true),
    ]);

    scene.handlePhysicsEvents([
      { type: 'pocket', ballId: 2, pocketIndex: 0 },
      { type: 'collision', ballId: 0, otherBallId: 2, speed: 1 },
      { type: 'collision', ballId: 0, otherBallId: 1, speed: 1 },
    ]);
    scene.handleSettledTable(true);

    expect(scene.challengeState?.targetsPocketed).toBe(1);
    expect(scene.challengeState?.allPocketedBallIds).toEqual([2]);
    expect(scene.physicsEngine.resetBall).not.toHaveBeenCalledWith(2, expect.anything());

    scene.challengeState = recordChallengeShot(scene.challengeState!);
    scene.wasMoving = true;
    scene.physicsEngine.getBalls.mockReturnValue([
      physicsBall(0, false),
      physicsBall(1, true),
      physicsBall(2, true),
    ]);

    scene.handlePhysicsEvents([{ type: 'pocket', ballId: 1, pocketIndex: 0 }]);
    scene.handleSettledTable(true);

    expect(scene.challengeState?.targetsPocketed).toBe(2);
    expect(resolveChallengeResult(scene.challengeState!)).toEqual({ passed: true, stars: 3 });
    expect(scene.showChallengeResult).toHaveBeenCalledOnce();
  });

  it('does not complete level 7 if ball 2 and ball 1 are pocketed without the required kick', () => {
    const scene = createChallengeHarness();
    const level = CHALLENGE_LEVELS[6];

    scene.currentLevel = level;
    scene.challengeState = createChallengeState(level);
    scene.challengeState = recordChallengeShot(scene.challengeState);
    scene.physicsEngine.getBalls.mockReturnValue([
      physicsBall(0, false),
      physicsBall(1, false),
      physicsBall(2, true),
    ]);

    scene.handlePhysicsEvents([
      { type: 'pocket', ballId: 2, pocketIndex: 0 },
      { type: 'collision', ballId: 0, otherBallId: 2, speed: 1 },
      { type: 'collision', ballId: 2, otherBallId: 1, speed: 1 },
    ]);
    scene.handleSettledTable(true);

    scene.challengeState = recordChallengeShot(scene.challengeState!);
    scene.wasMoving = true;
    scene.physicsEngine.getBalls.mockReturnValue([
      physicsBall(0, false),
      physicsBall(1, true),
      physicsBall(2, true),
    ]);

    scene.handlePhysicsEvents([{ type: 'pocket', ballId: 1, pocketIndex: 0 }]);
    scene.handleSettledTable(true);

    expect(resolveChallengeResult(scene.challengeState!)).toEqual({ passed: false, stars: 0 });
    expect(scene.showChallengeResult).toHaveBeenCalledOnce();
  });

  it('fails with zero stars when the cue ball scratches on the final challenge shot', () => {
    const scene = createChallengeHarness();
    const level = CHALLENGE_LEVELS[0];

    scene.currentLevel = level;
    scene.challengeState = createChallengeState(level);
    scene.challengeState = recordChallengeShot(scene.challengeState);
    scene.challengeState = recordChallengeShot(scene.challengeState);
    scene.challengeState = recordChallengePocket(scene.challengeState, 1);
    scene.challengeState = recordChallengeCuePocket(scene.challengeState);
    scene.physicsEngine.getBalls.mockReturnValue([
      physicsBall(0, true),
      physicsBall(1, true),
    ]);

    scene.handleSettledTable(true);

    expect(scene.challengeState?.result).toEqual({ passed: false, stars: 0 });
    expect(scene.showChallengeResult).toHaveBeenCalledOnce();
    expect(scene.rules.cueBallInHand).toBe(false);
  });

  it('fails with zero stars when the final challenge shot pockets no target', () => {
    const scene = createChallengeHarness();
    const level = CHALLENGE_LEVELS[0];

    scene.currentLevel = level;
    scene.challengeState = createChallengeState(level);
    scene.challengeState = recordChallengeShot(scene.challengeState);
    scene.challengeState = recordChallengeShot(scene.challengeState);
    scene.physicsEngine.getBalls.mockReturnValue([
      physicsBall(0, false),
      physicsBall(1, false),
    ]);

    scene.handleSettledTable(true);

    expect(scene.challengeState?.result).toEqual({ passed: false, stars: 0 });
    expect(scene.showChallengeResult).toHaveBeenCalledOnce();
  });

  it('shows a preset final failure result instead of recalculating it as a pass', async () => {
    const scene = new PoolScene() as unknown as ChallengeResultHarness;
    const previousDocument = globalThis.document;
    const overlay = { hidden: true } as HTMLElement;
    const nodes: Record<string, HTMLElement> = {
      '#challenge-result-title': { textContent: '' } as HTMLElement,
      '#challenge-stars': { innerHTML: '' } as HTMLElement,
      '#challenge-result-detail': { textContent: '' } as HTMLElement,
      '#challenge-retry': { textContent: '' } as HTMLElement,
      '#challenge-to-select': { textContent: '' } as HTMLElement,
      '#challenge-next': { textContent: '', hidden: false } as HTMLElement,
    };
    let state = createChallengeState(CHALLENGE_LEVELS[0]);
    state = recordChallengeShot(state);
    state = recordChallengePocket(state, 1);

    scene.language = 'zh';
    scene.challengeResultOverlay = overlay;
    scene.challengeState = { ...state, result: { passed: false, stars: 0 } };
    scene.cachedProgress = { levels: {} };
    scene.saveChallengeProgress = vi.fn();
    scene.completeDailyGrowthTask = vi.fn();

    globalThis.document = {
      querySelector: vi.fn((selector: string) => nodes[selector] ?? null),
    } as unknown as Document;

    try {
      await scene.showChallengeResult();

      expect(nodes['#challenge-result-title'].textContent).toBe('挑战失败');
      expect(scene.challengeState?.result).toEqual({ passed: false, stars: 0 });
      expect(scene.saveChallengeProgress).not.toHaveBeenCalled();
      expect(overlay.hidden).toBe(false);
    } finally {
      globalThis.document = previousDocument;
    }
  });
});
