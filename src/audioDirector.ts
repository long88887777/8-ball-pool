import {
  DEFAULT_AUDIO_PREFERENCES,
  sanitizeAudioPreferences,
  type AudioPreferences,
} from './audioPreferences';

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export type AudioScene = 'silent' | 'menu' | 'game';
export type GameSound = 'tap' | 'select' | 'back' | 'success' | 'warning' | 'cue' | 'collision' | 'rail' | 'pocket';

type Score = {
  bpm: number;
  steps: ReadonlyArray<ReadonlyArray<number>>;
};

const MENU_SCORE: Score = {
  bpm: 68,
  steps: [
    [60, 67], [], [64], [], [67], [], [71], [],
    [57, 64], [], [60], [], [64], [], [69], [],
    [53, 60], [], [57], [], [60], [], [64], [],
    [55, 62], [], [59], [], [62], [67], [64], [],
  ],
};

const GAME_SCORE: Score = {
  bpm: 76,
  steps: [
    [50, 57], [], [62], [65], [57], [], [62], [69],
    [48, 55], [], [60], [64], [55], [], [60], [67],
    [45, 52], [], [57], [60], [52], [], [57], [64],
    [47, 54], [], [59], [62], [54], [59], [62], [66],
  ],
};

const SCORE_BY_SCENE: Record<Exclude<AudioScene, 'silent'>, Score> = {
  menu: MENU_SCORE,
  game: GAME_SCORE,
};

export class AudioDirector {
  private context: AudioContext | null = null;
  private musicBus: GainNode | null = null;
  private soundBus: GainNode | null = null;
  private requestedScene: AudioScene = 'silent';
  private activeScene: AudioScene = 'silent';
  private preferences: AudioPreferences = { ...DEFAULT_AUDIO_PREFERENCES };
  private scheduler: ReturnType<typeof setInterval> | null = null;
  private nextStepAt = 0;
  private stepIndex = 0;
  private visibilityListenerInstalled = false;
  private readonly musicSources = new Set<OscillatorNode>();
  private readonly lastSoundAt = new Map<GameSound, number>();
  private readonly handleVisibilityChange = (): void => {
    if (!this.context) return;
    if (document.hidden) {
      void this.context.suspend();
      return;
    }
    void this.context.resume();
  };

  setPreferences(value: AudioPreferences): AudioPreferences {
    this.preferences = sanitizeAudioPreferences(value);
    this.applyBusLevels();
    return { ...this.preferences };
  }

  getPreferences(): AudioPreferences {
    return { ...this.preferences };
  }

  setScene(scene: AudioScene): void {
    this.requestedScene = scene;
    if (!this.context || this.activeScene === scene) return;
    this.startScene(scene);
  }

  unlock(): void {
    if (!this.context) {
      if (typeof window === 'undefined') return;
      const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextCtor) return;

      this.context = new AudioContextCtor();
      this.musicBus = this.context.createGain();
      this.soundBus = this.context.createGain();
      this.musicBus.connect(this.context.destination);
      this.soundBus.connect(this.context.destination);
      this.applyBusLevels();
      if (typeof document !== 'undefined' && !this.visibilityListenerInstalled) {
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        this.visibilityListenerInstalled = true;
      }
    }

    void this.context.resume();
    if (this.activeScene !== this.requestedScene) {
      this.startScene(this.requestedScene);
    }
  }

  play(sound: GameSound): void {
    this.unlock();
    if (!this.context || !this.soundBus || this.preferences.soundVolume === 0) return;

    const nowMs = performance.now();
    const minGap = sound === 'collision' || sound === 'rail' ? 55 : 32;
    if (nowMs - (this.lastSoundAt.get(sound) ?? -Infinity) < minGap) return;
    this.lastSoundAt.set(sound, nowMs);

    if (sound === 'success') {
      this.scheduleEffectTone(523.25, 0, 0.08, 0.12);
      this.scheduleEffectTone(659.25, 0.06, 0.075, 0.14);
      this.scheduleEffectTone(783.99, 0.12, 0.07, 0.18);
      return;
    }

    const voice = {
      tap: { start: 540, end: 620, gain: 0.045, duration: 0.045, type: 'sine' as OscillatorType },
      select: { start: 430, end: 650, gain: 0.055, duration: 0.075, type: 'sine' as OscillatorType },
      back: { start: 360, end: 245, gain: 0.045, duration: 0.07, type: 'sine' as OscillatorType },
      warning: { start: 185, end: 155, gain: 0.07, duration: 0.14, type: 'triangle' as OscillatorType },
      cue: { start: 155, end: 118, gain: 0.13, duration: 0.06, type: 'triangle' as OscillatorType },
      collision: { start: 470, end: 380, gain: 0.047, duration: 0.035, type: 'sine' as OscillatorType },
      rail: { start: 260, end: 215, gain: 0.043, duration: 0.045, type: 'triangle' as OscillatorType },
      pocket: { start: 110, end: 72, gain: 0.14, duration: 0.15, type: 'sine' as OscillatorType },
    }[sound];

    this.scheduleEffectSweep(voice.start, voice.end, voice.gain, voice.duration, voice.type);
  }

  dispose(): void {
    if (this.scheduler) {
      clearInterval(this.scheduler);
      this.scheduler = null;
    }
    this.stopMusicSources();
    if (this.context) void this.context.close();
    this.context = null;
    this.musicBus = null;
    this.soundBus = null;
    this.activeScene = 'silent';
    if (typeof document !== 'undefined' && this.visibilityListenerInstalled) {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      this.visibilityListenerInstalled = false;
    }
  }

  private startScene(scene: AudioScene): void {
    if (!this.context || !this.musicBus) return;

    if (this.scheduler) {
      clearInterval(this.scheduler);
      this.scheduler = null;
    }

    const now = this.context.currentTime;
    const gain = this.musicBus.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0.0001, now + 0.14);
    this.stopMusicSources(now + 0.15);
    this.activeScene = scene;

    if (scene === 'silent') return;

    this.stepIndex = 0;
    this.nextStepAt = now + 0.18;
    gain.setValueAtTime(0.0001, now + 0.16);
    gain.linearRampToValueAtTime(this.musicLevel(), now + 0.8);
    this.scheduleMusic();
    this.scheduler = setInterval(() => this.scheduleMusic(), 240);
  }

  private scheduleMusic(): void {
    if (!this.context || this.activeScene === 'silent') return;

    const score = SCORE_BY_SCENE[this.activeScene];
    const stepDuration = 30 / score.bpm;
    const scheduleUntil = this.context.currentTime + 1.4;

    while (this.nextStepAt < scheduleUntil) {
      const notes = score.steps[this.stepIndex % score.steps.length];
      for (const midi of notes) {
        this.schedulePianoNote(midi, this.nextStepAt, stepDuration * 3.2);
      }
      this.stepIndex += 1;
      this.nextStepAt += stepDuration;
    }
  }

  private schedulePianoNote(midi: number, startAt: number, duration: number): void {
    if (!this.context || !this.musicBus) return;

    const frequency = 440 * (2 ** ((midi - 69) / 12));
    const noteGain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const fundamental = this.context.createOscillator();
    const overtone = this.context.createOscillator();
    const overtoneGain = this.context.createGain();

    fundamental.type = 'triangle';
    fundamental.frequency.setValueAtTime(frequency, startAt);
    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(frequency * 2.01, startAt);
    overtoneGain.gain.setValueAtTime(0.14, startAt);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(3200, frequency * 7), startAt);
    filter.Q.setValueAtTime(0.65, startAt);

    noteGain.gain.setValueAtTime(0.0001, startAt);
    noteGain.gain.exponentialRampToValueAtTime(0.075, startAt + 0.012);
    noteGain.gain.exponentialRampToValueAtTime(0.024, startAt + Math.min(0.32, duration * 0.32));
    noteGain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    fundamental.connect(filter);
    overtone.connect(overtoneGain);
    overtoneGain.connect(filter);
    filter.connect(noteGain);
    noteGain.connect(this.musicBus);

    const stopAt = startAt + duration + 0.04;
    this.trackMusicSource(fundamental);
    this.trackMusicSource(overtone);
    fundamental.start(startAt);
    overtone.start(startAt);
    fundamental.stop(stopAt);
    overtone.stop(stopAt);
  }

  private scheduleEffectSweep(
    startFrequency: number,
    endFrequency: number,
    peakGain: number,
    duration: number,
    type: OscillatorType,
  ): void {
    if (!this.context || !this.soundBus) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.soundBus);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  private scheduleEffectTone(frequency: number, delay: number, peakGain: number, duration: number): void {
    if (!this.context || !this.soundBus) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const startAt = this.context.currentTime + delay;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(this.soundBus);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.02);
  }

  private trackMusicSource(source: OscillatorNode): void {
    this.musicSources.add(source);
    source.addEventListener('ended', () => this.musicSources.delete(source), { once: true });
  }

  private stopMusicSources(stopAt?: number): void {
    for (const source of this.musicSources) {
      try {
        source.stop(stopAt);
      } catch {
        // The source may already have completed between scheduling and cleanup.
      }
    }
    this.musicSources.clear();
  }

  private applyBusLevels(): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.musicBus?.gain.setTargetAtTime(this.musicLevel(), now, 0.035);
    this.soundBus?.gain.setTargetAtTime(this.preferences.soundVolume / 100, now, 0.025);
  }

  private musicLevel(): number {
    return (this.preferences.musicVolume / 100) * 0.58;
  }
}

export const gameAudio = new AudioDirector();

export {};
