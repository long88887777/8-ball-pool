import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class {
      game = { registry: { get: vi.fn() }, loop: { delta: 16 } };
    },
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
    Math: {
      Distance: { Between: vi.fn() },
    },
  },
}));

import { PoolScene } from './PoolScene';

type UpdateHarness = {
  game: { loop: { delta: number }; registry: { get: ReturnType<typeof vi.fn> } };
  cuePlacementState: unknown;
  cueBall: { x: number; y: number };
  wasMoving: boolean;
  aimState: unknown;
  lastFoulFeedback: unknown;
  pocketAnimatingBalls: Set<number>;
  physicsEngine: {
    isSettled: ReturnType<typeof vi.fn>;
    step: ReturnType<typeof vi.fn>;
    drainEvents: ReturnType<typeof vi.fn>;
  };
  updateShotClock: ReturnType<typeof vi.fn>;
  updateOnlineTick: ReturnType<typeof vi.fn>;
  updateForbiddenIcon: ReturnType<typeof vi.fn>;
  updateHandSprite: ReturnType<typeof vi.fn>;
  smoothActiveAim: ReturnType<typeof vi.fn>;
  renderAim: ReturnType<typeof vi.fn>;
  renderFoulFeedback: ReturnType<typeof vi.fn>;
  handlePhysicsEvents: ReturnType<typeof vi.fn>;
  syncBallsFromPhysics: ReturnType<typeof vi.fn>;
  handleSettledTable: ReturnType<typeof vi.fn>;
  update: () => void;
};

type HandSpriteHarness = {
  aimState: unknown;
  cueBall: { x: number; y: number };
  handSprite: {
    height: number;
    visible: boolean;
    setVisible: ReturnType<typeof vi.fn>;
    setScale: ReturnType<typeof vi.fn>;
    setPosition: ReturnType<typeof vi.fn>;
  };
  canPlaceBreakCueBall: ReturnType<typeof vi.fn>;
  canPlaceBallInHandCueBall: ReturnType<typeof vi.fn>;
  updateHandSprite: () => void;
};

type ShotClockHudHarness = {
  onlineState: null;
  shotClockRemaining: number;
  updateShotClockHud: () => void;
  updatePlayerClockCard: ReturnType<typeof vi.fn>;
  activeHudPlayer: ReturnType<typeof vi.fn>;
};

function createUpdateHarness(): UpdateHarness {
  const scene = new PoolScene() as unknown as UpdateHarness;
  scene.game = { loop: { delta: 16 }, registry: { get: vi.fn(() => undefined) } };
  scene.cuePlacementState = null;
  scene.wasMoving = false;
  scene.aimState = null;
  scene.lastFoulFeedback = null;
  scene.pocketAnimatingBalls = new Set();
  scene.physicsEngine = {
    isSettled: vi.fn(() => true),
    step: vi.fn(() => ({ balls: [], events: [], settled: true })),
    drainEvents: vi.fn(() => []),
  };
  scene.updateShotClock = vi.fn();
  scene.updateOnlineTick = vi.fn();
  scene.updateForbiddenIcon = vi.fn();
  scene.updateHandSprite = vi.fn();
  scene.smoothActiveAim = vi.fn();
  scene.renderAim = vi.fn();
  scene.renderFoulFeedback = vi.fn();
  scene.handlePhysicsEvents = vi.fn();
  scene.syncBallsFromPhysics = vi.fn();
  scene.handleSettledTable = vi.fn();
  return scene;
}

describe('PoolScene mobile power behavior', () => {
  it('skips physics stepping and ball syncing while the table is already idle', () => {
    const scene = createUpdateHarness();

    scene.update();

    expect(scene.physicsEngine.isSettled).not.toHaveBeenCalled();
    expect(scene.physicsEngine.step).not.toHaveBeenCalled();
    expect(scene.syncBallsFromPhysics).not.toHaveBeenCalled();
    expect(scene.handleSettledTable).not.toHaveBeenCalled();
    expect(scene.updateShotClock).toHaveBeenCalledOnce();
  });

  it('throttles idle maintenance after the immediate idle refresh', () => {
    const scene = createUpdateHarness();

    scene.update();
    scene.update();
    scene.update();

    expect(scene.updateShotClock).toHaveBeenCalledOnce();

    scene.game.loop.delta = 250;
    scene.update();

    expect(scene.updateShotClock).toHaveBeenCalledTimes(2);
  });

  it('keeps physics stepping while a shot is settling', () => {
    const scene = createUpdateHarness();
    scene.wasMoving = true;

    scene.update();

    expect(scene.physicsEngine.step).toHaveBeenCalledOnce();
    expect(scene.syncBallsFromPhysics).toHaveBeenCalledOnce();
    expect(scene.handleSettledTable).toHaveBeenCalledWith(true);
  });

  it('does not redraw an unchanged active aim guide on every frame', () => {
    const scene = createUpdateHarness();
    scene.cueBall = { x: 200, y: 160 };
    scene.aimState = {
      pointerId: 1,
      current: { x: 320, y: 240 },
      target: { x: 320, y: 240 },
    };
    scene.smoothActiveAim.mockImplementation(() => undefined);

    scene.update();
    scene.update();

    expect(scene.renderAim).toHaveBeenCalledOnce();
  });

  it('does not rewrite an unchanged hand placement hint every frame', () => {
    const scene = new PoolScene() as unknown as HandSpriteHarness;
    const handSprite = {
      height: 40,
      visible: false,
      setVisible: vi.fn((visible: boolean) => {
        handSprite.visible = visible;
        return handSprite;
      }),
      setScale: vi.fn(() => handSprite),
      setPosition: vi.fn(() => handSprite),
    };

    scene.aimState = null;
    scene.cueBall = { x: 250, y: 180 };
    scene.handSprite = handSprite;
    scene.canPlaceBreakCueBall = vi.fn(() => true);
    scene.canPlaceBallInHandCueBall = vi.fn(() => false);

    scene.updateHandSprite();
    scene.updateHandSprite();

    expect(handSprite.setVisible).toHaveBeenCalledOnce();
    expect(handSprite.setScale).toHaveBeenCalledOnce();
    expect(handSprite.setPosition).toHaveBeenCalledOnce();
  });

  it('updates the visible shot clock only when the displayed second changes', () => {
    const scene = new PoolScene() as unknown as ShotClockHudHarness;
    const previousDocument = globalThis.document;
    const shotClock = { textContent: '' } as HTMLElement;

    scene.onlineState = null;
    scene.shotClockRemaining = 19.9;
    scene.updatePlayerClockCard = vi.fn();
    scene.activeHudPlayer = vi.fn(() => 0);

    globalThis.document = {
      querySelector: vi.fn((selector: string) => (selector === '#shot-clock' ? shotClock : null)),
    } as unknown as Document;

    try {
      scene.updateShotClockHud();
      expect(shotClock.textContent).toBe('20');

      scene.shotClockRemaining = 19.6;
      scene.updateShotClockHud();
      expect((globalThis.document.querySelector as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([selector]) => selector === '#shot-clock',
      )).toHaveLength(1);

      scene.shotClockRemaining = 18.9;
      scene.updateShotClockHud();
      expect(shotClock.textContent).toBe('19');
    } finally {
      globalThis.document = previousDocument;
    }
  });
});
