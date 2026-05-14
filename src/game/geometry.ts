import { BALL_RADIUS, CUE, PLAY_AREA, POCKET_MOUTHS, TABLE, type Vector } from './constants';

const BREAK_CUE_SAFE_INSET = BALL_RADIUS;
const BREAK_CORNER_CLEARANCE = POCKET_MOUTHS.cornerCapture + BALL_RADIUS * 2;
const LEGAL_EPSILON = 0.001;

export function distance(a: Vector, b: Vector): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function isInPocket(point: Vector, pockets: Vector[]): boolean {
  return pockets.some((pocket) => distance(point, pocket) <= TABLE.pocketRadius);
}

export function isOnTableSurface(point: Vector): boolean {
  return (
    point.x >= PLAY_AREA.left &&
    point.x <= PLAY_AREA.right &&
    point.y >= PLAY_AREA.top &&
    point.y <= PLAY_AREA.bottom
  );
}

export function headStringX(): number {
  return PLAY_AREA.left + (PLAY_AREA.right - PLAY_AREA.left) * 0.25;
}

export function breakLineX(): number {
  return headStringX();
}

export function isLegalBreakCuePosition(point: Vector): boolean {
  return (
    point.x >= PLAY_AREA.left + BREAK_CUE_SAFE_INSET &&
    point.x <= breakLineX() &&
    point.y >= PLAY_AREA.top + BREAK_CUE_SAFE_INSET &&
    point.y <= PLAY_AREA.bottom - BREAK_CUE_SAFE_INSET &&
    isOutsideBreakCornerClearance(point)
  );
}

export function clampBreakCuePosition(point: Vector): Vector {
  return pushOutsideBreakCorners({
    x: Math.min(Math.max(point.x, PLAY_AREA.left + BREAK_CUE_SAFE_INSET), breakLineX()),
    y: Math.min(Math.max(point.y, PLAY_AREA.top + BREAK_CUE_SAFE_INSET), PLAY_AREA.bottom - BREAK_CUE_SAFE_INSET),
  });
}

function isOutsideBreakCornerClearance(point: Vector): boolean {
  return leftBreakCorners().every((corner) => distance(point, corner) >= BREAK_CORNER_CLEARANCE - LEGAL_EPSILON);
}

function pushOutsideBreakCorners(point: Vector): Vector {
  return leftBreakCorners().reduce((next, corner) => pushOutsideCorner(next, corner, BREAK_CORNER_CLEARANCE), point);
}

function pushOutsideCorner(point: Vector, corner: Vector, clearance: number): Vector {
  const dx = point.x - corner.x;
  const dy = point.y - corner.y;
  const currentDistance = Math.hypot(dx, dy);

  if (currentDistance >= clearance || currentDistance === 0) {
    return point;
  }

  return {
    x: corner.x + (dx / currentDistance) * clearance,
    y: corner.y + (dy / currentDistance) * clearance,
  };
}

function leftBreakCorners(): Vector[] {
  return [
    { x: PLAY_AREA.left, y: PLAY_AREA.top },
    { x: PLAY_AREA.left, y: PLAY_AREA.bottom },
  ];
}

export function clampShotPower(dragDistance: number): number {
  return Math.max(0, Math.min(dragDistance / TABLE.maxDragDistance, 1));
}

export function isTableReady(speeds: number[]): boolean {
  return speeds.every((speed) => speed <= TABLE.readySpeed);
}

export function shouldSnapBallToRest(linearSpeed: number, angularSpeed: number): boolean {
  return linearSpeed > 0 && linearSpeed <= TABLE.snapSpeed && Math.abs(angularSpeed) <= 1.2;
}

export function createTriangleRack(apex: Vector, count: number): Vector[] {
  const positions: Vector[] = [];
  const horizontalGap = BALL_RADIUS * 2.08;
  const verticalGap = BALL_RADIUS * 2.12;

  for (let row = 0; positions.length < count; row += 1) {
    for (let column = 0; column <= row && positions.length < count; column += 1) {
      positions.push({
        x: apex.x + row * horizontalGap,
        y: apex.y + (column - row / 2) * verticalGap,
      });
    }
  }

  return positions;
}

export function getCuePullback(power: number): number {
  const clamped = Math.max(0, Math.min(power, 1));
  return CUE.minPullback + (CUE.maxPullback - CUE.minPullback) * clamped;
}

export function rayCircleIntersection(
  origin: Vector,
  direction: Vector,
  center: Vector,
  radius: number,
): { point: Vector; distance: number } | null {
  const ocX = center.x - origin.x;
  const ocY = center.y - origin.y;
  const t = ocX * direction.x + ocY * direction.y;

  if (t < 0) return null;

  const closestX = origin.x + direction.x * t;
  const closestY = origin.y + direction.y * t;
  const dSq = (center.x - closestX) ** 2 + (center.y - closestY) ** 2;

  if (dSq > radius * radius) return null;

  const h = Math.sqrt(radius * radius - dSq);
  const t1 = t - h;

  if (t1 < 0) return null;

  return {
    point: { x: origin.x + direction.x * t1, y: origin.y + direction.y * t1 },
    distance: t1,
  };
}

export function predictCollisionDirections(
  cuePos: Vector,
  shotDirection: Vector,
  targetPos: Vector,
): {
  targetBallDir: Vector;
  cueBallDeflectDir: Vector | null;
  hitPoint: Vector;
  cueBallImpactCenter: Vector;
  targetBallCenter: Vector;
} | null {
  const directionLength = Math.hypot(shotDirection.x, shotDirection.y);
  if (directionLength < 0.001) return null;

  const direction = {
    x: shotDirection.x / directionLength,
    y: shotDirection.y / directionLength,
  };
  const cuePathHit = rayCircleIntersection(cuePos, direction, targetPos, BALL_RADIUS * 2);
  if (!cuePathHit) return null;

  const cueBallImpactCenter = cuePathHit.point;
  const nx = targetPos.x - cueBallImpactCenter.x;
  const ny = targetPos.y - cueBallImpactCenter.y;
  const nLen = Math.hypot(nx, ny);
  if (nLen < 0.001) return null;

  const n = { x: nx / nLen, y: ny / nLen };
  const targetBallDir = n;

  const dot = direction.x * n.x + direction.y * n.y;
  const tangentX = direction.x - dot * n.x;
  const tangentY = direction.y - dot * n.y;
  const tangentLen = Math.hypot(tangentX, tangentY);

  const cueBallDeflectDir =
    tangentLen < 0.001
      ? null
      : { x: tangentX / tangentLen, y: tangentY / tangentLen };

  const hitPoint = {
    x: cueBallImpactCenter.x + n.x * BALL_RADIUS,
    y: cueBallImpactCenter.y + n.y * BALL_RADIUS,
  };

  return { targetBallDir, cueBallDeflectDir, hitPoint, cueBallImpactCenter, targetBallCenter: targetPos };
}

export function projectRayToPlayArea(origin: Vector, direction: Vector, inset = BALL_RADIUS): Vector {
  const directionLength = Math.hypot(direction.x, direction.y);
  if (directionLength < 0.001) return origin;

  const unit = {
    x: direction.x / directionLength,
    y: direction.y / directionLength,
  };
  const bounds = {
    left: PLAY_AREA.left + inset,
    right: PLAY_AREA.right - inset,
    top: PLAY_AREA.top + inset,
    bottom: PLAY_AREA.bottom - inset,
  };
  const candidates: number[] = [];

  if (unit.x > 0.001) candidates.push((bounds.right - origin.x) / unit.x);
  if (unit.x < -0.001) candidates.push((bounds.left - origin.x) / unit.x);
  if (unit.y > 0.001) candidates.push((bounds.bottom - origin.y) / unit.y);
  if (unit.y < -0.001) candidates.push((bounds.top - origin.y) / unit.y);

  const distanceToEdge = candidates
    .filter((distanceToBound) => distanceToBound >= 0)
    .sort((a, b) => a - b)[0];

  if (distanceToEdge === undefined) return origin;

  return {
    x: origin.x + unit.x * distanceToEdge,
    y: origin.y + unit.y * distanceToEdge,
  };
}
