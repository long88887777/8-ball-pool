import { describe, expect, it } from 'vitest';
import { TABLE, type Vector } from './constants';
import {
  adjustAimPower,
  computeAimIntent,
  resolveFoulFeedbackTarget,
  rotateAimPoint,
} from './shotControl';

describe('shot control helpers', () => {
  const cue: Vector = { x: 100, y: 100 };

  it('turns a pull point into an opposite shot direction and power', () => {
    const intent = computeAimIntent(cue, { x: 0, y: 100 });

    expect(intent.dragDistance).toBe(100);
    expect(intent.power).toBeCloseTo(0.5);
    expect(intent.direction).toEqual({ x: 1, y: -0 });
    expect(intent.canShoot).toBe(true);
  });

  it('marks very short pulls as aim-only so release can cancel safely', () => {
    const intent = computeAimIntent(cue, { x: cue.x + 3, y: cue.y });

    expect(intent.power).toBeLessThan(TABLE.minShotPower);
    expect(intent.direction).toBeNull();
    expect(intent.canShoot).toBe(false);
  });

  it('rotates the aim point around the cue without changing power', () => {
    const start = { x: 0, y: 100 };
    const rotated = rotateAimPoint(cue, start, Math.PI / 2);

    expect(Math.hypot(rotated.x - cue.x, rotated.y - cue.y)).toBeCloseTo(100);
    expect(rotated.x).toBeCloseTo(100);
    expect(rotated.y).toBeCloseTo(0);
  });

  it('adjusts power along the same aim angle and clamps at the table maximum', () => {
    const start = { x: 0, y: 100 };
    const stronger = adjustAimPower(cue, start, TABLE.maxDragDistance);

    expect(stronger.x).toBeCloseTo(cue.x - TABLE.maxDragDistance);
    expect(stronger.y).toBeCloseTo(cue.y);

    const softer = adjustAimPower(cue, start, -TABLE.maxDragDistance);
    expect(softer.x).toBeCloseTo(cue.x);
    expect(softer.y).toBeCloseTo(cue.y);
  });

  it('targets the first wrong-contact ball for foul feedback', () => {
    const balls = new Map<number, Vector>([
      [3, { x: 320, y: 180 }],
    ]);

    expect(resolveFoulFeedbackTarget('wrongFirstContact', cue, 3, balls)).toEqual({
      kind: 'ball',
      ballId: 3,
      position: { x: 320, y: 180 },
    });
  });

  it('falls back to cue or table feedback for fouls without a specific ball', () => {
    expect(resolveFoulFeedbackTarget('cueBallPocketed', cue, null, new Map())).toEqual({
      kind: 'cue',
      position: cue,
    });
    expect(resolveFoulFeedbackTarget('noCushionAfterContact', cue, null, new Map())).toEqual({
      kind: 'table',
    });
  });
});
