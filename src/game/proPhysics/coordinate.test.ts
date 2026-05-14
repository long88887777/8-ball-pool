import { describe, expect, it } from 'vitest';
import { CUE_START, PLAY_AREA } from '../constants';
import { createCoordinateMapper } from './coordinate';

describe('professional physics coordinate mapper', () => {
  const mapper = createCoordinateMapper();

  it('maps the play area center to physics origin', () => {
    const center = {
      x: (PLAY_AREA.left + PLAY_AREA.right) / 2,
      y: (PLAY_AREA.top + PLAY_AREA.bottom) / 2,
    };

    const physics = mapper.toPhysics(center);

    expect(physics.x).toBeCloseTo(0, 6);
    expect(physics.y).toBeCloseTo(0, 6);
  });

  it('round trips cue start without drift', () => {
    const physics = mapper.toPhysics(CUE_START);
    const pixels = mapper.toPixels(physics);

    expect(pixels.x).toBeCloseTo(CUE_START.x, 4);
    expect(pixels.y).toBeCloseTo(CUE_START.y, 4);
  });

  it('maps top-left and bottom-right corners with opposite y signs', () => {
    const topLeft = mapper.toPhysics({ x: PLAY_AREA.left, y: PLAY_AREA.top });
    const bottomRight = mapper.toPhysics({ x: PLAY_AREA.right, y: PLAY_AREA.bottom });

    expect(topLeft.x).toBeLessThan(0);
    expect(topLeft.y).toBeGreaterThan(0);
    expect(bottomRight.x).toBeGreaterThan(0);
    expect(bottomRight.y).toBeLessThan(0);
  });
});
