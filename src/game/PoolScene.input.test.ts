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
import { createEightBallState } from './eightBallRules';
import { PoolScene } from './PoolScene';
import { createNineBallState } from './nineBallRules';
import { createGameState, recordStroke } from './state';

type FakePointer = {
  id: number;
  pointerId: number;
  worldX: number;
  worldY: number;
  rightButtonDown: () => boolean;
};

type FakeInput = {
  on: ReturnType<typeof vi.fn>;
};

type InputHarness = {
  game: {
    canvas?: {
      setPointerCapture: ReturnType<typeof vi.fn>;
      releasePointerCapture: ReturnType<typeof vi.fn>;
      hasPointerCapture: ReturnType<typeof vi.fn>;
      getBoundingClientRect: () => Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
    };
    registry: { get: ReturnType<typeof vi.fn> };
    loop: { delta: number };
  };
  aimState: { target: { x: number; y: number } } | null;
  input: FakeInput;
  audio: { unlock: ReturnType<typeof vi.fn> };
  gameMode: 'pvp' | 'ai' | 'challenge' | 'online';
  gameRuleset: 'eight-ball' | 'nine-ball';
  state: ReturnType<typeof createGameState>;
  rules: ReturnType<typeof createEightBallState>;
  nineBallRules: ReturnType<typeof createNineBallState>;
  cueBall: { x: number; y: number };
  cuePlacementState: null;
  strikeLocked: boolean;
  aiThinking: boolean;
  onlineState: null;
  physicsEngine: { isSettled: ReturnType<typeof vi.fn> };
  aimLine: { clear: ReturnType<typeof vi.fn> };
  cueGraphics: { clear: ReturnType<typeof vi.fn> };
  updateAimHud: ReturnType<typeof vi.fn>;
  bindInput: () => void;
  cancelAim: () => void;
};

function createInputHarness(): {
  scene: InputHarness;
  handlers: Map<string, (pointer: FakePointer) => void>;
} {
  const scene = new PoolScene() as unknown as InputHarness;
  const handlers = new Map<string, (pointer: FakePointer) => void>();

  scene.game = {
    ...scene.game,
    canvas: {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      getBoundingClientRect: () => ({
        left: 10,
        top: 20,
        width: 550,
        height: 320,
      }),
    },
  };
  scene.input = {
    on: vi.fn((eventName: string, handler: (pointer: FakePointer) => void) => {
      handlers.set(eventName, handler);
    }),
  };
  scene.audio = { unlock: vi.fn() };
  scene.gameMode = 'pvp';
  scene.gameRuleset = 'eight-ball';
  scene.state = recordStroke(createGameState(15));
  scene.rules = createEightBallState();
  scene.nineBallRules = createNineBallState();
  scene.cueBall = { ...CUE_START };
  scene.cuePlacementState = null;
  scene.strikeLocked = false;
  scene.aiThinking = false;
  scene.onlineState = null;
  scene.physicsEngine = { isSettled: vi.fn(() => true) };
  scene.aimLine = { clear: vi.fn() };
  scene.cueGraphics = { clear: vi.fn() };
  scene.updateAimHud = vi.fn();

  return { scene, handlers };
}

describe('PoolScene aim input', () => {
  it('captures the active aim pointer so dragging outside the canvas can keep increasing power', () => {
    const { scene, handlers } = createInputHarness();
    scene.bindInput();

    const pointer: FakePointer = {
      id: 42,
      pointerId: 420,
      worldX: CUE_START.x,
      worldY: CUE_START.y,
      rightButtonDown: () => false,
    };

    handlers.get('pointerdown')!(pointer);
    handlers.get('pointermove')!({ ...pointer, worldX: CUE_START.x - 400 });
    scene.cancelAim();

    expect(scene.game.canvas?.setPointerCapture).toHaveBeenCalledWith(pointer.pointerId);
    expect(scene.game.canvas?.releasePointerCapture).toHaveBeenCalledWith(pointer.pointerId);
  });

  it('updates aim from window mouse movement after the cursor leaves the canvas', () => {
    const previousWindow = globalThis.window;
    const listeners = new Map<string, EventListener[]>();
    globalThis.window = {
      addEventListener: vi.fn((eventName: string, listener: EventListener) => {
        listeners.set(eventName, [...(listeners.get(eventName) ?? []), listener]);
      }),
      removeEventListener: vi.fn(),
    } as unknown as Window & typeof globalThis;

    try {
      const { scene, handlers } = createInputHarness();
      scene.bindInput();

      const pointer: FakePointer = {
        id: 42,
        pointerId: 420,
        worldX: CUE_START.x,
        worldY: CUE_START.y,
        rightButtonDown: () => false,
      };

      handlers.get('pointerdown')!(pointer);
      listeners.get('mousemove')![0]({
        clientX: -540,
        clientY: 180,
        preventDefault: vi.fn(),
      } as unknown as MouseEvent);

      expect(scene.aimState?.target.x).toBeCloseTo(-1100);
      expect(scene.aimState?.target.y).toBeCloseTo(320);
    } finally {
      globalThis.window = previousWindow;
    }
  });
});
