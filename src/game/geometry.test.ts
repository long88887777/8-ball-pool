import { describe, expect, it } from 'vitest';
import { BALL_RADIUS, POCKETS, TABLE } from './constants';
import { clampShotPower, isInPocket, isTableReady } from './geometry';

describe('geometry helpers', () => {
  it('detects a ball inside a pocket radius', () => {
    const pocket = POCKETS[0];

    expect(isInPocket({ x: pocket.x, y: pocket.y }, POCKETS)).toBe(true);
    expect(isInPocket({ x: pocket.x + BALL_RADIUS * 4, y: pocket.y }, POCKETS)).toBe(false);
  });

  it('clamps shot power from drag distance', () => {
    expect(clampShotPower(0)).toBe(0);
    expect(clampShotPower(90)).toBe(0.45);
    expect(clampShotPower(900)).toBe(1);
  });

  it('detects whether all balls are below the ready speed', () => {
    expect(isTableReady([0, 0.01, 0.03])).toBe(true);
    expect(isTableReady([0, TABLE.readySpeed + 0.01])).toBe(false);
  });
});
