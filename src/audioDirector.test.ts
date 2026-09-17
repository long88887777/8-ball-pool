import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AudioDirector, selectSceneMusic, type GameSound } from './audioDirector';

class FakeAudioParam {
  value = 1;
  readonly targets: number[] = [];
  readonly setValues: number[] = [];
  readonly ramps: number[] = [];

  setTargetAtTime(value: number): void {
    this.value = value;
    this.targets.push(value);
  }

  setValueAtTime(value: number): void {
    this.value = value;
    this.setValues.push(value);
  }

  exponentialRampToValueAtTime(value: number): void {
    this.value = value;
    this.ramps.push(value);
  }
}

class FakeGainNode {
  readonly gain = new FakeAudioParam();
  connect(): void {}
}

class FakeOscillatorNode {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeAudioParam();
  connect(): void {}
  start(): void {}
  stop(): void {}
}

class FakeAudioContext {
  static latest: FakeAudioContext | null = null;

  readonly currentTime = 0;
  readonly destination = {};
  readonly gains: FakeGainNode[] = [];
  readonly oscillators: FakeOscillatorNode[] = [];

  constructor() {
    FakeAudioContext.latest = this;
  }

  createGain(): FakeGainNode {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain;
  }

  createOscillator(): FakeOscillatorNode {
    const oscillator = new FakeOscillatorNode();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  async resume(): Promise<void> {}
  async suspend(): Promise<void> {}
  async close(): Promise<void> {}
}

class FakeAudio {
  loop = false;
  preload = '';
  paused = true;
  src = '';
  currentTime = 0;
  volume = 1;

  async play(): Promise<void> {
    this.paused = false;
  }

  pause(): void {
    this.paused = true;
  }

  removeAttribute(): void {}
  load(): void {}
}

describe('audio director sound effects', () => {
  beforeEach(() => {
    FakeAudioContext.latest = null;
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    vi.stubGlobal('document', {
      hidden: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps menu selection feedback clearly audible at the default setting', () => {
    const director = new AudioDirector();

    director.play('select');

    const context = FakeAudioContext.latest;
    expect(context).not.toBeNull();
    const soundBusLevel = context!.gains[0].gain.targets.at(-1) ?? 0;
    const effectPeak = Math.max(...context!.gains[1].gain.ramps);
    expect(effectPeak * soundBusLevel).toBeGreaterThanOrEqual(0.11);

    director.dispose();
  });

  it.each([
    ['cue', 0.2],
    ['collision', 0.12],
    ['rail', 0.1],
    ['pocket', 0.2],
  ] satisfies Array<[GameSound, number]>)('keeps the %s sound audible during play', (sound, minimumPeak) => {
    const director = new AudioDirector();

    director.play(sound);

    const context = FakeAudioContext.latest;
    expect(context).not.toBeNull();
    const soundBusLevel = context!.gains[0].gain.targets.at(-1) ?? 0;
    const effectPeak = Math.max(...context!.gains[1].gain.ramps);
    expect(effectPeak * soundBusLevel).toBeGreaterThanOrEqual(minimumPeak);

    director.dispose();
  });

  it('makes hard ball collisions louder and crisper than gentle contacts', () => {
    const captureCollision = (intensity: number) => {
      FakeAudioContext.latest = null;
      const director = new AudioDirector();
      director.play('collision', intensity);
      const context = FakeAudioContext.latest!;
      const totalPeak = context.gains.slice(1).reduce(
        (sum, gain) => sum + Math.max(...gain.gain.ramps),
        0,
      );
      const detailFrequency = context.oscillators[1].frequency.setValues[0];
      const bodyType = context.oscillators[0].type;
      director.dispose();
      return { totalPeak, detailFrequency, bodyType };
    };

    const gentle = captureCollision(0.1);
    const hard = captureCollision(1);

    expect(hard.totalPeak).toBeGreaterThan(gentle.totalPeak * 2);
    expect(hard.detailFrequency).toBeGreaterThan(gentle.detailFrequency);
    expect(gentle.bodyType).toBe('sine');
    expect(hard.bodyType).toBe('triangle');
  });
});

describe('audio director music selection', () => {
  it('keeps the menu music fixed', () => {
    expect(selectSceneMusic('menu', 0.9)).toBe('/assets/audio/menu-beautiful-things.mp3');
  });

  it.each([
    [0, '/assets/audio/game-gentle-study-flow.mp3'],
    [0.34, '/assets/audio/game-background-piano-loop.mp3'],
    [0.99, '/assets/audio/game-soft-piano.mp3'],
  ])('maps random value %s to a gameplay track', (randomValue, expectedTrack) => {
    expect(selectSceneMusic('game', randomValue)).toBe(expectedTrack);
  });
});
