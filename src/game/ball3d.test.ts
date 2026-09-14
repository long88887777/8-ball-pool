import { describe, expect, it } from 'vitest';
import { BALL_RADIUS } from './constants';
import { calculateBallRoll, createDefaultBall3DDefinitions, pocketLipImpactPoint } from './ball3d';

describe('3D pool balls', () => {
  it('keeps a hard pocket impact on the table side of the pocket center', () => {
    const pocket = { x: 83, y: 83 };
    const entryDirection = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
    const impact = pocketLipImpactPoint(pocket, entryDirection);
    const beyondPocket = (impact.x - pocket.x) * entryDirection.x
      + (impact.y - pocket.y) * entryDirection.y;

    expect(beyondPocket).toBeLessThan(0);
  });

  it('creates only the balls present in the active rack', () => {
    const definitions = createDefaultBall3DDefinitions([0, 1, 8, 9]);
    expect(definitions.map((ball) => ball.id)).toEqual([0, 1, 8, 9]);
  });

  it('rolls one radian around Y after moving one radius horizontally', () => {
    expect(calculateBallRoll(
      { x: 100, y: 100 },
      { x: 100 + BALL_RADIUS, y: 100 },
      'rolling',
    )).toEqual({ x: 0, y: 1 });
  });

  it('uses partial rotation while the ball is still sliding', () => {
    expect(calculateBallRoll(
      { x: 100, y: 100 },
      { x: 100, y: 100 + BALL_RADIUS },
      'sliding',
    )).toEqual({ x: 0.34, y: 0 });
  });

  it('rolls around X for vertical travel', () => {
    const roll = calculateBallRoll(
      { x: 100, y: 100 },
      { x: 100, y: 100 + BALL_RADIUS },
      'rolling',
    );

    expect(roll?.x).toBeCloseTo(1);
    expect(roll?.y).toBeCloseTo(0);
  });

  it('combines both rotation axes for diagonal travel', () => {
    const roll = calculateBallRoll(
      { x: 100, y: 100 },
      { x: 100 + BALL_RADIUS * 0.75, y: 100 + BALL_RADIUS * 0.5 },
      'rolling',
    );

    expect(roll).toEqual({ x: 0.5, y: 0.75 });
  });

  it('keeps stationary balls from rotating', () => {
    expect(calculateBallRoll(
      { x: 100, y: 100 },
      { x: 100, y: 100 },
      'stationary',
    )).toBeNull();
  });

  it('uses the rolling coefficient after a cushion rebound', () => {
    expect(calculateBallRoll(
      { x: 100, y: 100 },
      { x: 100 - BALL_RADIUS, y: 100 },
      'rolling',
    )).toEqual({ x: 0, y: -1 });
  });
});
