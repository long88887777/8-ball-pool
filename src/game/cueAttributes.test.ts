import { describe, expect, it } from 'vitest';
import { CUE_CATALOG } from './economy';
import { applyCuePower, applyCueSpin, getCueGuideRatios } from './cueAttributes';

describe('cue gameplay attributes', () => {
  const starter = CUE_CATALOG.find((cue) => cue.rarity === 'starter')!;
  const legendary = CUE_CATALOG.find((cue) => cue.rarity === 'legendary')!;

  it('makes higher power cues hit harder at the same input power', () => {
    expect(applyCuePower(0.8, legendary)).toBeGreaterThan(applyCuePower(0.8, starter));
    expect(applyCuePower(1, legendary)).toBeLessThanOrEqual(1);
  });

  it('makes higher spin cues produce a stronger contact offset', () => {
    const selectedSpin = { x: 0.6, y: 0.5 };
    const starterSpin = applyCueSpin(selectedSpin, starter);
    const legendarySpin = applyCueSpin(selectedSpin, legendary);

    expect(Math.hypot(legendarySpin.x, legendarySpin.y)).toBeGreaterThan(
      Math.hypot(starterSpin.x, starterSpin.y),
    );
    expect(Math.hypot(legendarySpin.x, legendarySpin.y)).toBeLessThanOrEqual(1);
  });

  it('makes higher accuracy cues draw longer target, separation, and miss guidelines', () => {
    const starterRatios = getCueGuideRatios(starter, 0.7);
    const legendaryRatios = getCueGuideRatios(legendary, 0.7);

    expect(legendaryRatios.target).toBeGreaterThan(starterRatios.target);
    expect(legendaryRatios.cueDeflection).toBeGreaterThan(starterRatios.cueDeflection);
    expect(legendaryRatios.miss).toBeGreaterThan(starterRatios.miss);
  });
});
