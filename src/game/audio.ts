import { gameAudio, type GameSound } from '../audioDirector';

export type PoolSound = 'cue' | 'collision' | 'rail' | 'pocket';

const FULL_IMPACT_SPEED_METERS_PER_SECOND = 5;

export function impactIntensityFromSpeed(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) return 0;
  return Math.sqrt(Math.min(1, speed / FULL_IMPACT_SPEED_METERS_PER_SECOND));
}

export class PoolAudio {
  unlock(): void {
    gameAudio.unlock();
  }

  play(sound: PoolSound, intensity = 1): void {
    gameAudio.play(sound satisfies GameSound, intensity);
  }
}

export {};
