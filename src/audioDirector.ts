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

const MUSIC_BY_SCENE: Record<Exclude<AudioScene, 'silent'>, readonly string[]> = {
  menu: ['/assets/audio/menu-beautiful-things.mp3'],
  game: [
    '/assets/audio/game-gentle-study-flow.mp3',
    '/assets/audio/game-background-piano-loop.mp3',
    '/assets/audio/game-soft-piano.mp3',
  ],
};

export function selectSceneMusic(
  scene: Exclude<AudioScene, 'silent'>,
  randomValue = Math.random(),
): string {
  const tracks = MUSIC_BY_SCENE[scene];
  const safeRandom = Math.min(0.999999, Math.max(0, randomValue));
  return tracks[Math.floor(safeRandom * tracks.length)];
}

export class AudioDirector {
  private context: AudioContext | null = null;
  private soundBus: GainNode | null = null;
  private music: HTMLAudioElement | null = null;
  private musicScene: Exclude<AudioScene, 'silent'> | null = null;
  private requestedScene: AudioScene = 'silent';
  private activeScene: AudioScene = 'silent';
  private preferences: AudioPreferences = { ...DEFAULT_AUDIO_PREFERENCES };
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private fadeRevision = 0;
  private visibilityListenerInstalled = false;
  private readonly lastSoundAt = new Map<GameSound, number>();
  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.music?.pause();
      if (this.context) void this.context.suspend();
      return;
    }
    if (this.context) void this.context.resume();
    if (this.activeScene !== 'silent' && this.music?.src) {
      void this.music.play().catch(() => undefined);
    }
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
    if (!this.music || this.activeScene === scene) return;
    this.startScene(scene);
  }

  unlock(): void {
    if (!this.music && typeof Audio !== 'undefined') {
      this.music = new Audio();
      this.music.loop = true;
      this.music.preload = 'auto';
    }

    if (!this.context) {
      if (typeof window === 'undefined') return;
      const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextCtor) return;

      this.context = new AudioContextCtor();
      this.soundBus = this.context.createGain();
      this.soundBus.connect(this.context.destination);
      this.applyBusLevels();
    }

    if (typeof document !== 'undefined' && !this.visibilityListenerInstalled) {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      this.visibilityListenerInstalled = true;
    }

    void this.context.resume();
    if (this.activeScene !== this.requestedScene) {
      this.startScene(this.requestedScene);
    }
  }

  play(sound: GameSound, intensity = 1): void {
    this.unlock();
    if (!this.context || !this.soundBus || this.preferences.soundVolume === 0) return;

    const nowMs = performance.now();
    const minGap = sound === 'collision' || sound === 'rail' ? 55 : 32;
    if (nowMs - (this.lastSoundAt.get(sound) ?? -Infinity) < minGap) return;
    this.lastSoundAt.set(sound, nowMs);

    if (sound === 'success') {
      this.scheduleEffectTone(523.25, 0, 0.22, 0.12);
      this.scheduleEffectTone(659.25, 0.06, 0.2, 0.14);
      this.scheduleEffectTone(783.99, 0.12, 0.18, 0.18);
      return;
    }

    const impactStrength = Math.min(1, Math.max(0, Number.isFinite(intensity) ? intensity : 0));
    if (sound === 'collision') {
      this.scheduleCollisionEffect(impactStrength);
      return;
    }

    const voice = {
      tap: { start: 540, end: 620, gain: 0.2, duration: 0.045, type: 'sine' as OscillatorType },
      select: { start: 430, end: 650, gain: 0.22, duration: 0.075, type: 'sine' as OscillatorType },
      back: { start: 360, end: 245, gain: 0.2, duration: 0.07, type: 'sine' as OscillatorType },
      warning: { start: 185, end: 155, gain: 0.28, duration: 0.14, type: 'triangle' as OscillatorType },
      cue: { start: 155, end: 118, gain: 0.38, duration: 0.07, type: 'triangle' as OscillatorType },
      rail: {
        start: 190 + (95 * impactStrength),
        end: 135 + (55 * impactStrength),
        gain: 0.07 + (0.15 * Math.sqrt(impactStrength)),
        duration: 0.085 - (0.025 * impactStrength),
        type: 'triangle' as OscillatorType,
      },
      pocket: { start: 110, end: 72, gain: 0.38, duration: 0.17, type: 'sine' as OscillatorType },
    }[sound];

    this.scheduleEffectSweep(voice.start, voice.end, voice.gain, voice.duration, voice.type);
  }

  dispose(): void {
    this.clearFade();
    this.music?.pause();
    if (this.music) {
      this.music.removeAttribute('src');
      this.music.load();
    }
    if (this.context) void this.context.close();
    this.context = null;
    this.soundBus = null;
    this.music = null;
    this.musicScene = null;
    this.activeScene = 'silent';
    if (typeof document !== 'undefined' && this.visibilityListenerInstalled) {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      this.visibilityListenerInstalled = false;
    }
  }

  private startScene(scene: AudioScene): void {
    if (!this.music) return;

    const revision = ++this.fadeRevision;
    this.clearFade();
    this.activeScene = scene;

    const switchTrack = (): void => {
      if (!this.music || revision !== this.fadeRevision || this.activeScene !== scene) return;
      if (scene === 'silent') {
        this.music.pause();
        this.music.currentTime = 0;
        this.musicScene = null;
        return;
      }

      if (this.musicScene !== scene) {
        this.music.pause();
        this.music.src = selectSceneMusic(scene);
        this.music.currentTime = 0;
        this.musicScene = scene;
      }
      this.music.volume = 0;
      void this.music.play()
        .then(() => this.fadeMusicTo(this.musicLevel(), 700, revision))
        .catch(() => undefined);
    };

    if (this.musicScene && !this.music.paused) {
      this.fadeMusicTo(0, 180, revision, switchTrack);
      return;
    }
    switchTrack();
  }

  private scheduleEffectSweep(
    startFrequency: number,
    endFrequency: number,
    peakGain: number,
    duration: number,
    type: OscillatorType,
    attack = 0.006,
  ): void {
    if (!this.context || !this.soundBus) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peakGain, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.soundBus);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  private scheduleCollisionEffect(intensity: number): void {
    const loudness = Math.sqrt(intensity);
    const clarity = Math.pow(intensity, 1.35);
    this.scheduleEffectSweep(
      360 + (720 * intensity),
      240 + (400 * intensity),
      0.07 + (0.35 * loudness),
      0.075 - (0.035 * intensity),
      intensity >= 0.5 ? 'triangle' : 'sine',
      0.003,
    );
    this.scheduleEffectSweep(
      700 + (1_000 * intensity),
      440 + (700 * intensity),
      0.012 + (0.14 * clarity),
      0.042 - (0.018 * intensity),
      'sine',
      0.0015,
    );
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

  private fadeMusicTo(target: number, durationMs: number, revision: number, onComplete?: () => void): void {
    if (!this.music) return;
    this.clearFade();
    const startVolume = this.music.volume;
    const startedAt = performance.now();
    this.fadeTimer = setInterval(() => {
      if (!this.music || revision !== this.fadeRevision) {
        this.clearFade();
        return;
      }
      const progress = Math.min(1, (performance.now() - startedAt) / durationMs);
      this.music.volume = startVolume + ((target - startVolume) * progress);
      if (progress < 1) return;
      this.clearFade();
      onComplete?.();
    }, 30);
  }

  private clearFade(): void {
    if (!this.fadeTimer) return;
    clearInterval(this.fadeTimer);
    this.fadeTimer = null;
  }

  private applyBusLevels(): void {
    if (this.music) this.music.volume = this.musicLevel();
    if (this.context) {
      this.soundBus?.gain.setTargetAtTime(this.preferences.soundVolume / 100, this.context.currentTime, 0.025);
    }
  }

  private musicLevel(): number {
    const sceneLevel = this.activeScene === 'game' ? 0.4 : 0.58;
    return (this.preferences.musicVolume / 100) * sceneLevel;
  }
}

export const gameAudio = new AudioDirector();

export {};
