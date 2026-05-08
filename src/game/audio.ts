declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export type PoolSound = 'cue' | 'collision' | 'rail' | 'pocket';

export class PoolAudio {
  private context: AudioContext | null = null;
  private readonly lastSoundAt = new Map<PoolSound, number>();

  unlock(): void {
    if (this.context) {
      void this.context.resume();
      return;
    }

    const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    this.context = new AudioContextCtor();
  }

  play(sound: PoolSound): void {
    if (!this.context) {
      return;
    }

    const now = performance.now();
    const last = this.lastSoundAt.get(sound) ?? 0;
    if (now - last < 55) {
      return;
    }
    this.lastSoundAt.set(sound, now);

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.connect(gain);
    gain.connect(this.context.destination);

    const time = this.context.currentTime;
    const settings = {
      cue: { frequency: 150, gain: 0.12, duration: 0.055 },
      collision: { frequency: 420, gain: 0.045, duration: 0.035 },
      rail: { frequency: 230, gain: 0.04, duration: 0.04 },
      pocket: { frequency: 95, gain: 0.14, duration: 0.12 },
    }[sound];

    oscillator.frequency.setValueAtTime(settings.frequency, time);
    gain.gain.setValueAtTime(settings.gain, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + settings.duration);
    oscillator.start(time);
    oscillator.stop(time + settings.duration);
  }
}

export {};
