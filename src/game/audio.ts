import { gameAudio, type GameSound } from '../audioDirector';

export type PoolSound = 'cue' | 'collision' | 'rail' | 'pocket';

export class PoolAudio {
  unlock(): void {
    gameAudio.unlock();
  }

  play(sound: PoolSound): void {
    gameAudio.play(sound satisfies GameSound);
  }
}

export {};
