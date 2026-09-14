import type { Vector } from './constants';
import type { CueStyle } from './economy';
import { normalizeCueContactOffset } from './proPhysics/spin';

export type CueGuideLengths = {
  target: number;
  cueDeflection: number;
  miss: number;
};

const GUIDE_LENGTH = {
  target: { minimum: 110, bonus: 260 },
  cueDeflection: { minimum: 70, bonus: 150 },
  miss: { minimum: 180, bonus: 360 },
} as const;

export function applyCuePower(inputPower: number, cue: CueStyle): number {
  const normalizedPower = Math.max(0, Math.min(1, inputPower));
  const maximumPower = 0.72 + normalizeStat(cue.power) * 0.28;
  return normalizedPower * maximumPower;
}

export function applyCueSpin(contactOffset: Vector, cue: CueStyle): Vector {
  const normalized = normalizeCueContactOffset(contactOffset);
  const spinStrength = 0.45 + normalizeStat(cue.spin) * 0.55;
  return {
    x: normalized.x * spinStrength,
    y: normalized.y * spinStrength,
  };
}

export function getCueGuideLengths(cue: CueStyle): CueGuideLengths {
  const accuracy = normalizeStat(cue.accuracy);
  return {
    target: GUIDE_LENGTH.target.minimum + accuracy * GUIDE_LENGTH.target.bonus,
    cueDeflection: GUIDE_LENGTH.cueDeflection.minimum + accuracy * GUIDE_LENGTH.cueDeflection.bonus,
    miss: GUIDE_LENGTH.miss.minimum + accuracy * GUIDE_LENGTH.miss.bonus,
  };
}

export function projectGuideEnd(start: Vector, edgeEnd: Vector, length: number): Vector {
  const dx = edgeEnd.x - start.x;
  const dy = edgeEnd.y - start.y;
  const edgeDistance = Math.hypot(dx, dy);
  if (edgeDistance < 0.001) {
    return start;
  }

  const visibleLength = Math.min(Math.max(0, length), edgeDistance);
  return {
    x: start.x + (dx / edgeDistance) * visibleLength,
    y: start.y + (dy / edgeDistance) * visibleLength,
  };
}

function normalizeStat(value: number): number {
  return Math.max(0, Math.min(100, value)) / 100;
}
