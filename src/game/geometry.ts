import { TABLE, type Vector } from './constants';

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
