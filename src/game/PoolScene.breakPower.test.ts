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

import { CUE_START, type Vector } from './constants';
import { PoolScene } from './PoolScene';
import { createEightBallState, startEightBallShot, type EightBallState } from './eightBallRules';
import type { AimIntent } from './shotControl';
import { createGameState, recordStroke, type GameState } from './state';
import { createOnlineState, transitionToMyTurn, type OnlineState } from '../online/onlineState';

type BreakPowerHarness = {
  gameMode: 'pvp' | 'ai' | 'challenge' | 'online';
  gameRuleset: 'eight-ball' | 'nine-ball';
  state: GameState;
  rules: EightBallState;
  selectedSpin: Vector;
  wasMoving: boolean;
  physicsEngine: {
    strikeCueBall: ReturnType<typeof vi.fn>;
    getNetworkSnapshot: ReturnType<typeof vi.fn>;
  };
  audio: { play: ReturnType<typeof vi.fn> };
  onlineChannel: { send: ReturnType<typeof vi.fn> } | null;
  onlineState: OnlineState | null;
  logOnlineAuditEvent: ReturnType<typeof vi.fn>;
  applyCueImpulse: (intent: AimIntent) => void;
  sendOnlineShot: (direction: Vector, power: number, contactOffset: Vector, cueBallPos: Vector) => void;
};

function createOpeningBreakScene(): BreakPowerHarness {
  const scene = new PoolScene() as unknown as BreakPowerHarness;
  scene.gameMode = 'pvp';
  scene.gameRuleset = 'eight-ball';
  scene.state = recordStroke(createGameState(15));
  scene.rules = startEightBallShot(createEightBallState());
  scene.selectedSpin = { x: 0, y: 0 };
  scene.wasMoving = false;
  scene.physicsEngine = {
    strikeCueBall: vi.fn(),
    getNetworkSnapshot: vi.fn(() => []),
  };
  scene.audio = { play: vi.fn() };
  scene.onlineChannel = null;
  scene.onlineState = null;
  scene.logOnlineAuditEvent = vi.fn();
  return scene;
}

function createIntent(power: number): AimIntent {
  return {
    pull: { x: -100, y: 0 },
    dragDistance: 100,
    power,
    direction: { x: 1, y: 0 },
    canShoot: true,
  };
}

describe('PoolScene eight-ball break power', () => {
  it('uses 150% power for the first eight-ball break impulse', () => {
    const scene = createOpeningBreakScene();

    scene.applyCueImpulse(createIntent(0.8));

    const shot = scene.physicsEngine.strikeCueBall.mock.calls[0][0];
    expect(shot.power).toBeCloseTo(1.2);
  });

  it('keeps later eight-ball shots at the selected power', () => {
    const laterEightBall = createOpeningBreakScene();
    laterEightBall.state = { ...laterEightBall.state, strokes: 2 };
    laterEightBall.rules = { ...laterEightBall.rules, shotCount: 2 };

    laterEightBall.applyCueImpulse(createIntent(0.8));

    expect(laterEightBall.physicsEngine.strikeCueBall.mock.calls[0][0].power).toBe(0.8);
  });

  it('sends 150% opening power to online opponents', () => {
    const scene = createOpeningBreakScene();
    const send = vi.fn();
    scene.gameMode = 'online';
    scene.onlineChannel = { send };
    scene.onlineState = transitionToMyTurn(createOnlineState({
      isHost: true,
      turnTimeLimit: 30,
      disconnectTimeout: 30,
    }));

    scene.sendOnlineShot({ x: 1, y: 0 }, 1, { x: 0, y: 0 }, CUE_START);

    expect(send.mock.calls[0][0].power).toBe(1.5);
    expect(scene.logOnlineAuditEvent).toHaveBeenCalledWith('shot_sent', {
      metadata: {
        power: 1.5,
        snapshotBallCount: 0,
      },
    });
  });
});
