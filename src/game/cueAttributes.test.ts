import { describe, expect, it } from 'vitest';
import { CUE_CATALOG } from './economy';
import { applyCuePower, applyCueSpin, getCueGuideLengths, projectGuideEnd } from './cueAttributes';

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
    const starterLengths = getCueGuideLengths(starter);
    const legendaryLengths = getCueGuideLengths(legendary);

    expect(legendaryLengths.target).toBeGreaterThan(starterLengths.target);
    expect(legendaryLengths.cueDeflection).toBeGreaterThan(starterLengths.cueDeflection);
    expect(legendaryLengths.miss).toBeGreaterThan(starterLengths.miss);
  });

  it('keeps guide length constant while the aim angle changes', () => {
    const length = getCueGuideLengths(starter).target;
    const start = { x: 400, y: 300 };
    const horizontalEnd = projectGuideEnd(start, { x: 900, y: 300 }, length);
    const diagonalEnd = projectGuideEnd(start, { x: 800, y: 700 }, length);

    expect(Math.hypot(horizontalEnd.x - start.x, horizontalEnd.y - start.y)).toBeCloseTo(length);
    expect(Math.hypot(diagonalEnd.x - start.x, diagonalEnd.y - start.y)).toBeCloseTo(length);
  });
});
