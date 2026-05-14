import { describe, expect, it } from 'vitest';
import { BALL_RADIUS, CUE_START, PLAY_AREA, POCKETS, TABLE } from './constants';
import {
  clampShotPower,
  clampBreakCuePosition,
  createTriangleRack,
  breakLineX,
  getCuePullback,
  headStringX,
  isInPocket,
  isLegalBreakCuePosition,
  isOnTableSurface,
  isTableReady,
  predictCollisionDirections,
  projectRayToPlayArea,
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
    expect(isLegalBreakCuePosition({ x: breakLineX() + BALL_RADIUS, y: TABLE.height / 2 })).toBe(false);
    expect(isLegalBreakCuePosition({ x: PLAY_AREA.left + BALL_RADIUS - 1, y: TABLE.height / 2 })).toBe(false);
  });

  it('uses the break line as the visible head-string boundary', () => {
    expect(breakLineX()).toBe(headStringX());
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
      x: breakLineX(),
      y: PLAY_AREA.top + BALL_RADIUS,
    });
    const lowerLeft = clampBreakCuePosition({ x: PLAY_AREA.left, y: PLAY_AREA.bottom + 100 });
    expect(isLegalBreakCuePosition(lowerLeft)).toBe(true);
    expect(isInPocket(lowerLeft, POCKETS)).toBe(false);
  });

  it('allows straight-rail cue ball placement to sit flush with the cushion nose', () => {
    const centerRail = clampBreakCuePosition({ x: PLAY_AREA.left + BALL_RADIUS, y: TABLE.height / 2 });

    expect(centerRail.x).toBeCloseTo(PLAY_AREA.left + BALL_RADIUS, 5);
    expect(centerRail.y).toBeCloseTo(TABLE.height / 2, 5);
    expect(isLegalBreakCuePosition(centerRail)).toBe(true);
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
  it('target ball goes along the ghost-ball collision normal', () => {
    const cuePos = { x: 100, y: 100 };
    const shotDir = { x: 1, y: 0 };
    const targetPos = { x: 130, y: 100 };

    const result = predictCollisionDirections(cuePos, shotDir, targetPos);
    expect(result).not.toBeNull();
    expect(result!.targetBallDir.x).toBeCloseTo(1, 5);
    expect(result!.targetBallDir.y).toBeCloseTo(0, 5);
    expect(result!.cueBallImpactCenter.x).toBeCloseTo(targetPos.x - BALL_RADIUS * 2, 5);
    expect(result!.cueBallImpactCenter.y).toBeCloseTo(targetPos.y, 5);
    expect(result!.cueBallDeflectDir).toBeNull();
  });

  it('contact point is on the target ball surface facing the ghost cue ball', () => {
    const cuePos = { x: 100, y: 100 };
    const shotDir = { x: 1, y: 0 };
    const targetPos = { x: 145, y: 100 };

    const result = predictCollisionDirections(cuePos, shotDir, targetPos);
    expect(result).not.toBeNull();
    expect(result!.hitPoint.x).toBeCloseTo(targetPos.x - BALL_RADIUS, 5);
    expect(result!.hitPoint.y).toBeCloseTo(targetPos.y, 5);
  });

  it('cut shot uses the cue ball impact center instead of the cue-to-target center line', () => {
    const cuePos = { x: 0, y: 0 };
    const shotDir = { x: 1, y: 0 };
    const targetPos = { x: 100, y: 20 };

    const result = predictCollisionDirections(cuePos, shotDir, targetPos);
    expect(result).not.toBeNull();

    const cueToTargetCenterLineY = targetPos.y / Math.hypot(targetPos.x, targetPos.y);
    expect(result!.targetBallDir.y).toBeGreaterThan(cueToTargetCenterLineY + 0.4);
    expect(result!.cueBallImpactCenter.y).toBeCloseTo(0, 5);
    expect(result!.cueBallDeflectDir).not.toBeNull();
    expect(result!.cueBallDeflectDir!.y).toBeLessThan(-0.7);

    const dot = result!.cueBallDeflectDir!.x * result!.targetBallDir.x + result!.cueBallDeflectDir!.y * result!.targetBallDir.y;
    expect(Math.abs(dot)).toBeLessThan(0.001);
  });

  it('returns null when the cue ball path misses the target ball collision radius', () => {
    const cuePos = { x: 0, y: 0 };
    const shotDir = { x: 1, y: 0 };
    const targetPos = { x: 100, y: BALL_RADIUS * 2 + 1 };

    expect(predictCollisionDirections(cuePos, shotDir, targetPos)).toBeNull();
  });
});

describe('projectRayToPlayArea', () => {
  it('projects a ray to the right playable edge', () => {
    const result = projectRayToPlayArea({ x: 100, y: 200 }, { x: 1, y: 0 });

    expect(result.x).toBeCloseTo(PLAY_AREA.right - BALL_RADIUS, 5);
    expect(result.y).toBeCloseTo(200, 5);
  });

  it('projects an angled ray to the first playable edge it reaches', () => {
    const origin = { x: 300, y: 300 };
    const direction = { x: 1, y: 1 };

    const result = projectRayToPlayArea(origin, direction);

    expect(result.y).toBeCloseTo(PLAY_AREA.bottom - BALL_RADIUS, 5);
    expect(result.x).toBeLessThan(PLAY_AREA.right - BALL_RADIUS);
  });

  it('falls back to the origin when the direction is zero length', () => {
    const origin = { x: 300, y: 300 };

    expect(projectRayToPlayArea(origin, { x: 0, y: 0 })).toEqual(origin);
  });
});
