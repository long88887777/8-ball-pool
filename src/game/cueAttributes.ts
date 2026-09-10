import type { Vector } from './constants';
import type { CueStyle } from './economy';
import { normalizeCueContactOffset } from './proPhysics/spin';

export type CueGuideRatios = {
  target: number;
  cueDeflection: number;
  miss: number;
};

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

export function getCueGuideRatios(cue: CueStyle, power: number): CueGuideRatios {
  const accuracy = normalizeStat(cue.accuracy);
  const normalizedPower = Math.max(0, Math.min(1, power));
  return {
    target: Math.min(0.96, 0.20 + accuracy * 0.66 + normalizedPower * 0.08),
    cueDeflection: Math.min(0.78, 0.12 + accuracy * 0.54 + normalizedPower * 0.06),
    miss: Math.min(0.94, 0.22 + accuracy * 0.68),
  };
}

function normalizeStat(value: number): number {
  return Math.max(0, Math.min(100, value)) / 100;
}
