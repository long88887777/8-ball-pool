import { TABLE, type Vector } from './constants';
import type { EightBallFoulReason } from './eightBallRules';
import { clampShotPower } from './geometry';

export type AimIntent = {
  pull: Vector;
  dragDistance: number;
  power: number;
  direction: Vector | null;
  canShoot: boolean;
};

export type FoulFeedbackTarget =
  | { kind: 'ball'; ballId: number; position: Vector }
  | { kind: 'cue'; position: Vector }
  | { kind: 'table' };

export function computeAimIntent(cue: Vector, aimPoint: Vector): AimIntent {
  const pull = {
    x: aimPoint.x - cue.x,
    y: aimPoint.y - cue.y,
  };
  const dragDistance = Math.hypot(pull.x, pull.y);
  const power = clampShotPower(dragDistance);
  const canShoot = power >= TABLE.minShotPower && dragDistance > 0;

  return {
    pull,
    dragDistance,
    power,
    direction: canShoot ? { x: -pull.x / dragDistance, y: -pull.y / dragDistance } : null,
    canShoot,
  };
}

export function rotateAimPoint(cue: Vector, aimPoint: Vector, radians: number): Vector {
  const dx = aimPoint.x - cue.x;
  const dy = aimPoint.y - cue.y;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: cue.x + dx * cos - dy * sin,
    y: cue.y + dx * sin + dy * cos,
  };
}

export function adjustAimPower(cue: Vector, aimPoint: Vector, deltaDistance: number): Vector {
  const dx = aimPoint.x - cue.x;
  const dy = aimPoint.y - cue.y;
  const distance = Math.hypot(dx, dy);
  const nextDistance = Math.max(0, Math.min(TABLE.maxDragDistance, distance + deltaDistance));

  if (distance < 0.001) {
    return { x: cue.x - nextDistance, y: cue.y };
  }

  return {
    x: cue.x + (dx / distance) * nextDistance,
    y: cue.y + (dy / distance) * nextDistance,
  };
}

export function resolveFoulFeedbackTarget(
  reason: EightBallFoulReason,
  cuePosition: Vector,
  firstContactBallId: number | null,
  ballPositions: Map<number, Vector>,
): FoulFeedbackTarget {
  if (reason === 'wrongFirstContact' && firstContactBallId !== null) {
    const position = ballPositions.get(firstContactBallId);
    if (position) {
      return { kind: 'ball', ballId: firstContactBallId, position };
    }
  }

  if (reason === 'cueBallPocketed') {
    return { kind: 'cue', position: cuePosition };
  }

  return { kind: 'table' };
}
