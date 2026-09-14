import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class {
      game = { registry: { get: vi.fn() }, loop: { delta: 0 } };
    },
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
    Math: { Distance: { Between: vi.fn() } },
  },
}));

import { pocketMotionProfile, PoolScene } from './PoolScene';
import { POCKETS } from './constants';
import type { PhysicsBallSnapshot, PhysicsEvent } from './proPhysics/types';

type PocketAnimationHarness = {
  gameMode: 'pvp';
  gameRuleset: 'eight-ball';
  rules: { pocketedBallIds: number[] };
  targetBalls: Array<{
    ballId: number;
    pocketed: boolean;
    visible: boolean;
    setVisible: ReturnType<typeof vi.fn>;
    setPosition: ReturnType<typeof vi.fn>;
    setDepth: ReturnType<typeof vi.fn>;
    setScale: ReturnType<typeof vi.fn>;
    setAlpha: ReturnType<typeof vi.fn>;
  }>;
  cueBall: { ballId: number };
  threeLayerActive: boolean;
  ballPocketMap: Map<number, number>;
  pocketAnimatingBalls: Set<number>;
  ballPrevPositions: Map<number, { x: number; y: number }>;
  tweens: { chain: ReturnType<typeof vi.fn> };
  ball3dRenderer: { animatePocket: ReturnType<typeof vi.fn>; updateBall: ReturnType<typeof vi.fn>; hideBall: ReturnType<typeof vi.fn> };
  audio: { play: ReturnType<typeof vi.fn> };
  recordRulesPocket: ReturnType<typeof vi.fn>;
  updateHud: ReturnType<typeof vi.fn>;
  handlePhysicsEvents: (events: PhysicsEvent[]) => void;
  syncBallsFromPhysics: (snapshots: PhysicsBallSnapshot[]) => void;
};

describe('PoolScene pocket animation', () => {
  it('maps real entry speed to rattle, clean roll and rear-impact pocket motion', () => {
    expect(pocketMotionProfile(0.5).style).toBe('rattle');
    expect(pocketMotionProfile(1.8).style).toBe('roll');
    expect(pocketMotionProfile(4.5).style).toBe('rear-impact');
    expect(pocketMotionProfile(4.5).durationMs).toBeLessThan(pocketMotionProfile(0.5).durationMs);
  });

  it('keeps a newly pocketed ball visible while its drop animation runs', () => {
    const scene = new PoolScene() as unknown as PocketAnimationHarness;
    const ball = {
      ballId: 3,
      pocketed: false,
      visible: true,
      setVisible: vi.fn(function setVisible(this: typeof ball, visible: boolean) {
        this.visible = visible;
        return this;
      }),
      setPosition: vi.fn(),
      setDepth: vi.fn(),
      setScale: vi.fn(),
      setAlpha: vi.fn(),
    };
    scene.gameMode = 'pvp';
    scene.gameRuleset = 'eight-ball';
    scene.rules = { pocketedBallIds: [] };
    scene.targetBalls = [ball];
    scene.cueBall = { ballId: 0 };
    scene.threeLayerActive = false;
    scene.ballPocketMap = new Map();
    scene.pocketAnimatingBalls = new Set();
    scene.ballPrevPositions = new Map([[3, { x: 92, y: 84 }]]);
    scene.tweens = { chain: vi.fn() };
    scene.ball3dRenderer = { animatePocket: vi.fn(), updateBall: vi.fn(), hideBall: vi.fn() };
    scene.audio = { play: vi.fn() };
    scene.recordRulesPocket = vi.fn();
    scene.updateHud = vi.fn();

    scene.handlePhysicsEvents([{
      type: 'pocket',
      ballId: 3,
      kind: 'target',
      pocketIndex: 0,
      speed: 5.2,
    } as PhysicsEvent]);
    scene.syncBallsFromPhysics([{
      id: 3,
      kind: 'target',
      position: { x: 75, y: 62 },
      state: 'in-pocket',
      pocketed: true,
      velocity: { x: 420, y: -180 },
    }]);

    expect(scene.pocketAnimatingBalls.has(3)).toBe(true);
    expect(ball.visible).toBe(true);
    expect(scene.ball3dRenderer.animatePocket).toHaveBeenCalledWith(
      3,
      expect.any(Object),
      expect.objectContaining({ style: 'rear-impact' }),
      expect.any(Object),
    );
    expect(scene.tweens.chain).toHaveBeenCalledWith(expect.objectContaining({
      targets: ball,
      tweens: expect.arrayContaining([
        expect.objectContaining({ ease: 'Quad.easeOut' }),
        expect.objectContaining({ ease: 'Cubic.easeIn' }),
      ]),
    }));
    const chain = scene.tweens.chain.mock.calls[0][0] as {
      tweens: Array<{ x: number; y: number }>;
    };
    const pocket = POCKETS[0];
    const start = { x: 92, y: 84 };
    const length = Math.hypot(pocket.x - start.x, pocket.y - start.y);
    const direction = { x: (pocket.x - start.x) / length, y: (pocket.y - start.y) / length };
    for (const stage of chain.tweens) {
      const beyondPocket = (stage.x - pocket.x) * direction.x + (stage.y - pocket.y) * direction.y;
      expect(beyondPocket).toBeLessThanOrEqual(0);
    }
    expect(scene.ball3dRenderer.hideBall).not.toHaveBeenCalled();
  });
});
