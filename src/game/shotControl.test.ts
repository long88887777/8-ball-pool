import { describe, expect, it } from 'vitest';
import { TABLE, type Vector } from './constants';
import {
  adjustAimPower,
  computeAimIntent,
  createDefaultAimControlSettings,
  resolveFoulFeedbackTarget,
  resolveAimControlStep,
  rotateAimPoint,
  smoothAimPoint,
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

  it('smooths pointer aiming every frame without quantizing tiny movements', () => {
    const current = { x: 10.25, y: 20.5 };
    const target = { x: 10.85, y: 20.1 };

    const next = smoothAimPoint(current, target, 1 / 60);

    expect(next.x).toBeGreaterThan(current.x);
    expect(next.x).toBeLessThan(target.x);
    expect(next.y).toBeLessThan(current.y);
    expect(next.y).toBeGreaterThan(target.y);
    expect(next.x).not.toBe(Math.round(next.x));
  });

  it('settles precisely on the target when smoothed aiming is close enough', () => {
    const target = { x: 300.125, y: 220.875 };

    expect(smoothAimPoint({ x: 300.13, y: 220.88 }, target, 1 / 60)).toEqual(target);
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

  it('resolves aim control steps from sensitivity and shift state', () => {
    expect(resolveAimControlStep(createDefaultAimControlSettings(), false)).toMatchObject({
      powerStep: 5,
    });
    expect(resolveAimControlStep({ sensitivity: 'fine', powerStep: 4, powerLocked: false }, false).rotationStepRadians)
      .toBeLessThan(resolveAimControlStep({ sensitivity: 'fast', powerStep: 4, powerLocked: false }, false).rotationStepRadians);
    expect(resolveAimControlStep({ sensitivity: 'normal', powerStep: 5, powerLocked: false }, true).powerStep).toBe(15);
  });
});
