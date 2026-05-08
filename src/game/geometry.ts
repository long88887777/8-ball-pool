import { BALL_RADIUS, CUE, TABLE, type Vector } from './constants';

export function distance(a: Vector, b: Vector): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function isInPocket(point: Vector, pockets: Vector[]): boolean {
  return pockets.some((pocket) => distance(point, pocket) <= TABLE.pocketRadius);
}

export function clampShotPower(dragDistance: number): number {
  const normalized = Math.max(0, Math.min(dragDistance / TABLE.maxDragDistance, 1));
  return Number(normalized.toFixed(2));
}

export function isTableReady(speeds: number[]): boolean {
  return speeds.every((speed) => speed <= TABLE.readySpeed);
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
  return Math.round(CUE.minPullback + (CUE.maxPullback - CUE.minPullback) * clamped);
}
