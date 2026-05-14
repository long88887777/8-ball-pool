import { describe, expect, it } from 'vitest';
import {
  SPIN_PRESETS,
  contactOffsetMatchesPreset,
  normalizeCueContactOffset,
  scaleContactOffsetForCueModel,
} from './spin';

describe('cue spin helpers', () => {
  it('falls back to center for missing or non-finite contact offsets', () => {
    expect(normalizeCueContactOffset()).toEqual(SPIN_PRESETS.center);
    expect(normalizeCueContactOffset({ x: Number.NaN, y: 0.5 })).toEqual(SPIN_PRESETS.center);
    expect(normalizeCueContactOffset({ x: 0.25, y: Number.POSITIVE_INFINITY })).toEqual(SPIN_PRESETS.center);
  });

  it('clamps contact offsets to the legal cue-ball contact circle', () => {
    const normalized = normalizeCueContactOffset({ x: 1, y: 1 });

    expect(Math.hypot(normalized.x, normalized.y)).toBeCloseTo(1, 6);
    expect(normalized.x).toBeCloseTo(Math.SQRT1_2, 6);
    expect(normalized.y).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('keeps preset offsets inside the legal contact circle', () => {
    expect(SPIN_PRESETS.center).toEqual({ x: 0, y: 0 });
    expect(SPIN_PRESETS.high).toEqual({ x: 0, y: 0.85 });
    expect(SPIN_PRESETS.low).toEqual({ x: 0, y: -0.85 });
    expect(SPIN_PRESETS.left).toEqual({ x: -0.85, y: 0 });
    expect(SPIN_PRESETS.right).toEqual({ x: 0.85, y: 0 });
  });

  it('maps player-facing spin directions into the vendor cue model direction', () => {
    const high = scaleContactOffsetForCueModel(SPIN_PRESETS.high);
    const low = scaleContactOffsetForCueModel(SPIN_PRESETS.low);
    const right = scaleContactOffsetForCueModel(SPIN_PRESETS.right);
    const left = scaleContactOffsetForCueModel(SPIN_PRESETS.left);

    expect(high.y).toBeGreaterThan(0);
    expect(low.y).toBeLessThan(0);
    expect(right.x).toBeLessThan(0);
    expect(left.x).toBeGreaterThan(0);
    expect(Math.abs(right.x)).toBeLessThan(Math.abs(high.y));
    expect(Math.hypot(high.x, high.y)).toBeLessThanOrEqual(0.5);
  });

  it('matches presets with a small tolerance', () => {
    expect(contactOffsetMatchesPreset({ x: 0.001, y: -0.002 }, 'center')).toBe(true);
    expect(contactOffsetMatchesPreset({ x: 0.1, y: 0 }, 'center')).toBe(false);
  });
});
