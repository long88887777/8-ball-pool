import { describe, expect, it } from 'vitest';
import { BALL_RADIUS, CUE_START, CUSHION_NOSE_INSET, PLAY_AREA, POCKETS, TABLE } from './constants';
import {
  clampShotPower,
  clampBreakCuePosition,
  createTriangleRack,
  getCuePullback,
  headStringX,
  isInPocket,
  isLegalBreakCuePosition,
  isOnTableSurface,
  isTableReady,
  predictCollisionDirections,
  rayCircleIntersection,
  shouldSnapBallToRest,
} from './geometry';

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

  it('snaps slow rolling balls to rest before drift can block the next shot', () => {
    expect(shouldSnapBallToRest(TABLE.readySpeed + 0.025, 0.8)).toBe(true);
    expect(shouldSnapBallToRest(TABLE.readySpeed * 4, 0)).toBe(false);
  });

  it('detects pointer positions on the playable table surface', () => {
    expect(isOnTableSurface({ x: TABLE.rail + 12, y: TABLE.rail + 12 })).toBe(true);
    expect(isOnTableSurface({ x: TABLE.rail - 12, y: TABLE.rail + 12 })).toBe(false);
  });

  it('allows cue ball placement only on the break side of the head string', () => {
    expect(isLegalBreakCuePosition(CUE_START)).toBe(true);
    expect(isLegalBreakCuePosition({ x: PLAY_AREA.left + BALL_RADIUS, y: PLAY_AREA.top + BALL_RADIUS })).toBe(false);
    expect(isLegalBreakCuePosition({ x: headStringX() + BALL_RADIUS, y: TABLE.height / 2 })).toBe(false);
    expect(isLegalBreakCuePosition({ x: PLAY_AREA.left + BALL_RADIUS - 1, y: TABLE.height / 2 })).toBe(false);
  });

  it('keeps opening cue ball placement out of corner pocket jaws', () => {
    const upperLeft = clampBreakCuePosition({ x: PLAY_AREA.left, y: PLAY_AREA.top });
    const lowerLeft = clampBreakCuePosition({ x: PLAY_AREA.left, y: PLAY_AREA.bottom });

    expect(isLegalBreakCuePosition(upperLeft)).toBe(true);
    expect(isLegalBreakCuePosition(lowerLeft)).toBe(true);
    expect(isInPocket(upperLeft, POCKETS)).toBe(false);
    expect(isInPocket(lowerLeft, POCKETS)).toBe(false);
    expect(upperLeft.y).toBeGreaterThan(PLAY_AREA.top + BALL_RADIUS);
    expect(lowerLeft.y).toBeLessThan(PLAY_AREA.bottom - BALL_RADIUS);
  });

  it('clamps cue ball placement to the break side of the head string', () => {
    expect(clampBreakCuePosition({ x: PLAY_AREA.right, y: PLAY_AREA.top - 100 })).toEqual({
      x: headStringX(),
      y: PLAY_AREA.top + BALL_RADIUS + CUSHION_NOSE_INSET,
    });
    const lowerLeft = clampBreakCuePosition({ x: PLAY_AREA.left, y: PLAY_AREA.bottom + 100 });
    expect(isLegalBreakCuePosition(lowerLeft)).toBe(true);
    expect(isInPocket(lowerLeft, POCKETS)).toBe(false);
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

describe('rayCircleIntersection', () => {
  it('returns the nearest intersection when a ray hits a circle head-on', () => {
    const origin = { x: 0, y: 0 };
    const direction = { x: 1, y: 0 };
    const center = { x: 10, y: 0 };
    const radius = 3;
    const result = rayCircleIntersection(origin, direction, center, radius);
    expect(result).not.toBeNull();
    expect(result!.distance).toBeCloseTo(7, 5);
    expect(result!.point.x).toBeCloseTo(7, 5);
    expect(result!.point.y).toBeCloseTo(0, 5);
  });

  it('returns null when a ray misses the circle', () => {
    const origin = { x: 0, y: 0 };
    const direction = { x: 1, y: 0 };
    const center = { x: 10, y: 50 };
    const radius = 3;
    expect(rayCircleIntersection(origin, direction, center, radius)).toBeNull();
  });

  it('returns null when the circle is behind the ray', () => {
    const origin = { x: 10, y: 0 };
    const direction = { x: 1, y: 0 };
    const center = { x: 5, y: 0 };
    const radius = 3;
    expect(rayCircleIntersection(origin, direction, center, radius)).toBeNull();
  });

  it('returns the grazing intersection for a ray that just touches the edge', () => {
    const origin = { x: 0, y: 0 };
    const direction = { x: 1, y: 0 };
    const center = { x: 10, y: 3 };
    const radius = 3;
    const result = rayCircleIntersection(origin, direction, center, radius);
    expect(result).not.toBeNull();
    expect(result!.distance).toBeCloseTo(10, 5);
  });
});

describe('predictCollisionDirections', () => {
  it('target ball goes along the collision normal', () => {
    const cuePos = { x: 100, y: 100 };
    const shotDir = { x: 1, y: 0 };
    const targetPos = { x: 130, y: 100 };

    const result = predictCollisionDirections(cuePos, shotDir, targetPos);
    expect(result).not.toBeNull();
    expect(result!.targetBallDir.x).toBeCloseTo(1, 5);
    expect(result!.targetBallDir.y).toBeCloseTo(0, 5);
    expect(Math.abs(result!.cueBallDeflectDir.x)).toBeLessThan(0.01);
    expect(Math.abs(result!.cueBallDeflectDir.y)).toBeCloseTo(1, 2);
  });

  it('hit point is on the target ball surface facing the cue ball', () => {
    const cuePos = { x: 100, y: 100 };
    const shotDir = { x: 1, y: 0 };
    const targetPos = { x: 145, y: 100 };

    const result = predictCollisionDirections(cuePos, shotDir, targetPos);
    expect(result).not.toBeNull();
    expect(result!.hitPoint.x).toBeCloseTo(targetPos.x - BALL_RADIUS, 5);
    expect(result!.hitPoint.y).toBeCloseTo(targetPos.y, 5);
  });

  it('angled shot produces non-trivial deflection', () => {
    const cuePos = { x: 100, y: 100 };
    const shotDir = { x: 1, y: 0 };
    const targetPos = { x: 130, y: 115 };

    const result = predictCollisionDirections(cuePos, shotDir, targetPos);
    expect(result).not.toBeNull();
    const n = {
      x: (targetPos.x - cuePos.x) / Math.hypot(targetPos.x - cuePos.x, targetPos.y - cuePos.y),
      y: (targetPos.y - cuePos.y) / Math.hypot(targetPos.x - cuePos.x, targetPos.y - cuePos.y),
    };
    expect(result!.targetBallDir.x).toBeCloseTo(n.x, 5);
    expect(result!.targetBallDir.y).toBeCloseTo(n.y, 5);
    const dot = result!.cueBallDeflectDir.x * n.x + result!.cueBallDeflectDir.y * n.y;
    expect(Math.abs(dot)).toBeLessThan(0.001);
  });
});
