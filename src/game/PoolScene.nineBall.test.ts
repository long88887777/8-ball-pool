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

import { BALL_RADIUS, CUE_START, POCKETS, RACK_CENTER, type Vector } from './constants';
import { PoolScene } from './PoolScene';
import { createNineBallState, type NineBallState } from './nineBallRules';

type FakeBall = {
  ballId: number;
  pocketed: boolean;
  x: number;
  y: number;
  destroy: ReturnType<typeof vi.fn>;
  setPosition: ReturnType<typeof vi.fn>;
  setVisible: ReturnType<typeof vi.fn>;
  setScale: ReturnType<typeof vi.fn>;
  setAlpha: ReturnType<typeof vi.fn>;
  setDepth: ReturnType<typeof vi.fn>;
};

type NineBallRackHarness = {
  gameRuleset: 'eight-ball' | 'nine-ball';
  cueBall?: FakeBall;
  targetBalls: FakeBall[];
  physicsEngine: {
    rack: ReturnType<typeof vi.fn>;
    getBalls?: ReturnType<typeof vi.fn>;
    resetBall?: ReturnType<typeof vi.fn>;
  };
  createBall: ReturnType<typeof vi.fn>;
  createBalls: () => void;
};

type CueResetHarness = {
  cueBall: FakeBall;
  pocketAnimatingBalls: Set<number>;
  ballPocketMap: Map<number, number>;
  netDeformGraphics: { clear: ReturnType<typeof vi.fn> };
  tweens: { killTweensOf: ReturnType<typeof vi.fn> };
  physicsEngine: { resetCueBall: ReturnType<typeof vi.fn> };
  resetCueBallToTable: (position: Vector) => void;
};

function createFakeBall(ballId: number): FakeBall {
  const ball = {
    ballId,
    pocketed: false,
    x: 0,
    y: 0,
    destroy: vi.fn(),
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

describe('PoolScene nine-ball rack', () => {
  it('creates the opening rack as a 9-ball diamond and uses textures matching actual ball ids', () => {
    const scene = new PoolScene() as unknown as NineBallRackHarness;
    scene.gameRuleset = 'nine-ball';
    scene.targetBalls = [];
    scene.physicsEngine = { rack: vi.fn() };
    scene.createBall = vi.fn((_position: Vector, _texture: string, _kind: 'cue' | 'target', ballId = 0) =>
      createFakeBall(ballId),
    );

    scene.createBalls();

    const targetCalls = scene.createBall.mock.calls.filter((call) => call[2] === 'target');
    expect(targetCalls).toHaveLength(9);
    expect(targetCalls.map((call) => call[3]).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    const oneBall = targetCalls.find((call) => call[3] === 1);
    const nineBall = targetCalls.find((call) => call[3] === 9);
    expect(oneBall?.[0]).toEqual(RACK_CENTER);
    expect(nineBall?.[0]).toEqual({
      x: RACK_CENTER.x + BALL_RADIUS * 2.08 * 2,
      y: RACK_CENTER.y,
    });
    expect(nineBall?.[1]).toBe('target-ball-8');

    expect(scene.physicsEngine.rack).toHaveBeenCalledWith(
      expect.arrayContaining([
        { id: 0, kind: 'cue', position: CUE_START },
        expect.objectContaining({ id: 1, kind: 'target', position: RACK_CENTER, label: 1 }),
        expect.objectContaining({ id: 9, kind: 'target', label: 9 }),
      ]),
    );
  });

  it('restores a pocket-animated cue ball visibly when it is reset to the table', () => {
    const scene = new PoolScene() as unknown as CueResetHarness;
    const cueBall = createFakeBall(0);
    cueBall.pocketed = true;
    cueBall.x = POCKETS[0].x;
    cueBall.y = POCKETS[0].y;
    scene.cueBall = cueBall;
    scene.pocketAnimatingBalls = new Set([0]);
    scene.ballPocketMap = new Map([[0, 0]]);
    scene.netDeformGraphics = { clear: vi.fn() };
    scene.tweens = { killTweensOf: vi.fn() };
    scene.physicsEngine = { resetCueBall: vi.fn() };

    scene.resetCueBallToTable(CUE_START);

    expect(scene.tweens.killTweensOf).toHaveBeenCalledWith(cueBall);
    expect(scene.physicsEngine.resetCueBall).toHaveBeenCalledWith(CUE_START);
    expect(cueBall.pocketed).toBe(false);
    expect(cueBall.setPosition).toHaveBeenCalledWith(CUE_START.x, CUE_START.y);
    expect(cueBall.setVisible).toHaveBeenCalledWith(true);
    expect(cueBall.setScale).toHaveBeenCalledWith(1);
    expect(cueBall.setAlpha).toHaveBeenCalledWith(1);
    expect(scene.pocketAnimatingBalls.has(0)).toBe(false);
    expect(scene.ballPocketMap.has(0)).toBe(false);
  });

  it('declares push out on the next nine-ball shot when the button action is used', () => {
    const scene = new PoolScene() as unknown as NineBallRackHarness & {
      gameMode: 'pvp' | 'ai' | 'challenge' | 'online';
      nineBallRules: NineBallState;
      nineBallPushOutDeclared: boolean;
      strikeLocked: boolean;
      cuePlacementState: unknown;
      aiThinking: boolean;
      onlineState: unknown;
      roomInfo: unknown;
      physicsEngine: NineBallRackHarness['physicsEngine'] & { isSettled: ReturnType<typeof vi.fn> };
      declareNineBallPushOut: () => void;
      startRulesShot: () => void;
      updateHud: ReturnType<typeof vi.fn>;
    };
    scene.gameMode = 'pvp';
    scene.gameRuleset = 'nine-ball';
    scene.nineBallRules = {
      ...createNineBallState(),
      pushOutAvailable: true,
    };
    scene.nineBallPushOutDeclared = false;
    scene.strikeLocked = false;
    scene.cuePlacementState = null;
    scene.aiThinking = false;
    scene.onlineState = null;
    scene.roomInfo = null;
    scene.physicsEngine = {
      rack: vi.fn(),
      isSettled: vi.fn(() => true),
    };
    scene.updateHud = vi.fn();

    scene.declareNineBallPushOut();
    scene.startRulesShot();

    expect(scene.nineBallRules.shot.pushOut).toBe(true);
    expect(scene.nineBallPushOutDeclared).toBe(false);
  });

  it('spots the 9 ball back onto the table when rules say it was not legally pocketed', () => {
    const scene = new PoolScene() as unknown as NineBallRackHarness & {
      nineBallRules: unknown;
      pocketAnimatingBalls: Set<number>;
      ballPocketMap: Map<number, number>;
      tweens: { killTweensOf: ReturnType<typeof vi.fn> };
      syncBallsFromPhysics: ReturnType<typeof vi.fn>;
      spotNineBallIfNeeded: () => void;
    };
    const oneBall = createFakeBall(1);
    const nineBall = createFakeBall(9);
    oneBall.x = RACK_CENTER.x;
    oneBall.y = RACK_CENTER.y;
    nineBall.pocketed = true;
    scene.gameRuleset = 'nine-ball';
    scene.targetBalls = [oneBall, nineBall];
    scene.nineBallRules = {
      pocketedBallIds: [],
      gameOver: false,
    };
    scene.pocketAnimatingBalls = new Set([9]);
    scene.ballPocketMap = new Map([[9, 0]]);
    scene.tweens = { killTweensOf: vi.fn() };
    scene.physicsEngine = {
      rack: vi.fn(),
      getBalls: vi.fn(() => [
        { id: 9, kind: 'target', position: { x: 920, y: 320 }, state: 'in-pocket', pocketed: true },
      ]),
      resetBall: vi.fn(),
    };
    scene.syncBallsFromPhysics = vi.fn();

    scene.spotNineBallIfNeeded();

    expect(scene.physicsEngine.resetBall!).toHaveBeenCalledWith(9, {
      x: RACK_CENTER.x + BALL_RADIUS * 2.08,
      y: RACK_CENTER.y,
    });
    expect(nineBall.setVisible).toHaveBeenCalledWith(true);
    expect(scene.pocketAnimatingBalls.has(9)).toBe(false);
    expect(scene.ballPocketMap.has(9)).toBe(false);
  });
});
