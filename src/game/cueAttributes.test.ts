import { describe, expect, it } from 'vitest';
import { CUE_START, RACK_CENTER } from './constants';
import { CUE_CATALOG } from './economy';
import { applyCuePower, applyCueSpin, getCueGuideLengths, projectGuideEnd } from './cueAttributes';
import { predictCollisionDirections } from './geometry';
import { computeAimIntent } from './shotControl';

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
    expect(starterLengths.target).toBe(starterLengths.cueDeflection);
    expect(legendaryLengths.target).toBe(legendaryLengths.cueDeflection);
  });

  it('keeps guide length constant while the aim angle changes', () => {
    const length = getCueGuideLengths(starter).target;
    const start = { x: 400, y: 300 };
    const horizontalEnd = projectGuideEnd(start, { x: 1, y: 0 }, length);
    const diagonalEnd = projectGuideEnd(start, { x: 1, y: 1 }, length);
    const towardNearbyCushionEnd = projectGuideEnd(start, { x: 2, y: -1 }, length);

    expect(Math.hypot(horizontalEnd.x - start.x, horizontalEnd.y - start.y)).toBeCloseTo(length);
    expect(Math.hypot(diagonalEnd.x - start.x, diagonalEnd.y - start.y)).toBeCloseTo(length);
    expect(Math.hypot(towardNearbyCushionEnd.x - start.x, towardNearbyCushionEnd.y - start.y)).toBeCloseTo(length);

    for (let degrees = 0; degrees < 360; degrees += 1) {
      const radians = (degrees * Math.PI) / 180;
      const end = projectGuideEnd(start, { x: Math.cos(radians), y: Math.sin(radians) }, length);
      expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeCloseTo(length);
    }
  });

  it('keeps both collision guides equal through opposite cut-angle adjustments', () => {
    const expectedLength = getCueGuideLengths(starter).target;
    const measuredLengths = [{ x: 80, y: 306 }, { x: 80, y: 334 }].map((pullPoint) => {
      const intent = computeAimIntent(CUE_START, pullPoint);
      const prediction = predictCollisionDirections(CUE_START, intent.direction!, RACK_CENTER)!;
      const targetEnd = projectGuideEnd(prediction.targetBallCenter, prediction.targetBallDir, expectedLength);
      const cueEnd = projectGuideEnd(
        prediction.cueBallImpactCenter,
        prediction.cueBallDeflectDir!,
        expectedLength,
      );
      return {
        target: Math.hypot(
          targetEnd.x - prediction.targetBallCenter.x,
          targetEnd.y - prediction.targetBallCenter.y,
        ),
        cue: Math.hypot(
          cueEnd.x - prediction.cueBallImpactCenter.x,
          cueEnd.y - prediction.cueBallImpactCenter.y,
        ),
      };
    });

    expect(measuredLengths).toEqual([
      { target: expect.closeTo(expectedLength), cue: expect.closeTo(expectedLength) },
      { target: expect.closeTo(expectedLength), cue: expect.closeTo(expectedLength) },
    ]);
  });
});
