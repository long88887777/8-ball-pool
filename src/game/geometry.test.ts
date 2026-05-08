import { describe, expect, it } from 'vitest';
import { BALL_RADIUS, POCKETS, TABLE } from './constants';
import { clampShotPower, createTriangleRack, getCuePullback, isInPocket, isTableReady } from './geometry';

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

  it('creates a non-overlapping 15-ball triangle rack', () => {
    const rack = createTriangleRack({ x: 740, y: 320 }, 15);

    expect(rack).toHaveLength(15);
    for (let i = 0; i < rack.length; i += 1) {
      for (let j = i + 1; j < rack.length; j += 1) {
        expect(Math.hypot(rack[i].x - rack[j].x, rack[i].y - rack[j].y)).toBeGreaterThan(BALL_RADIUS * 2);
      }
    }
  });

  it('maps shot power to cue pullback distance', () => {
    expect(getCuePullback(0)).toBe(28);
    expect(getCuePullback(0.5)).toBe(82);
    expect(getCuePullback(1)).toBe(136);
  });
});
