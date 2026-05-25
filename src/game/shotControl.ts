import { TABLE, type Vector } from './constants';
import type { EightBallFoulReason } from './eightBallRules';
import type { NineBallFoulReason } from './nineBallRules';
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

export type AimSensitivity = 'fine' | 'normal' | 'fast';

export type AimControlSettings = {
  sensitivity: AimSensitivity;
  powerStep: number;
  powerLocked: boolean;
};

export function createDefaultAimControlSettings(): AimControlSettings {
  return { sensitivity: 'normal', powerStep: 5, powerLocked: false };
}

export function sanitizeAimControlSettings(value: unknown): AimControlSettings {
  const fallback = createDefaultAimControlSettings();
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const candidate = value as Partial<AimControlSettings>;
  const sensitivity: AimSensitivity =
    candidate.sensitivity === 'fine' || candidate.sensitivity === 'fast' || candidate.sensitivity === 'normal'
      ? candidate.sensitivity
      : fallback.sensitivity;

  return {
    sensitivity,
    powerStep: typeof candidate.powerStep === 'number' && Number.isFinite(candidate.powerStep)
      ? Math.max(1, Math.min(20, Math.round(candidate.powerStep)))
      : fallback.powerStep,
    powerLocked: candidate.powerLocked === true,
  };
}

export function resolveAimControlStep(
  settings: AimControlSettings,
  fastModifier: boolean,
): { rotationStepRadians: number; powerStep: number } {
  const baseRotation = settings.sensitivity === 'fine'
    ? (0.2 * Math.PI) / 180
    : settings.sensitivity === 'fast'
      ? (0.7 * Math.PI) / 180
      : (0.35 * Math.PI) / 180;
  const multiplier = fastModifier ? 3 : 1;

  return {
    rotationStepRadians: baseRotation * multiplier,
    powerStep: Math.max(1, Math.floor(settings.powerStep)) * multiplier,
  };
}

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
  reason: EightBallFoulReason | NineBallFoulReason,
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
