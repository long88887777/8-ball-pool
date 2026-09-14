import { describe, expect, it } from 'vitest';

import { impactIntensityFromSpeed } from './audio';

describe('pool impact audio', () => {
  it('maps gentle, medium, and hard collisions to increasing intensity', () => {
    const gentle = impactIntensityFromSpeed(0.2);
    const medium = impactIntensityFromSpeed(1.5);
    const hard = impactIntensityFromSpeed(5);

    expect(gentle).toBeGreaterThan(0);
    expect(gentle).toBeLessThan(medium);
    expect(medium).toBeLessThan(hard);
    expect(hard).toBe(1);
  });

  it('clamps invalid and extreme collision speeds safely', () => {
    expect(impactIntensityFromSpeed(-1)).toBe(0);
    expect(impactIntensityFromSpeed(Number.NaN)).toBe(0);
    expect(impactIntensityFromSpeed(20)).toBe(1);
  });
});
