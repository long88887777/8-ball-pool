import type { Vector } from '../constants';

export type PocketJawSegment = {
  name: string;
  start: Vector;
  end: Vector;
};

export type PocketJawCollision = {
  time: number;
  position: Vector;
  normal: Vector;
  jaw: PocketJawSegment;
};

// Cushion-face endpoints extracted from the accepted pool-table.glb after the
// same transform used by ball3d.ts. These are the twelve visible pocket jaws.
export const VISIBLE_POCKET_JAWS: readonly PocketJawSegment[] = [
  { name: 'top-left top', start: { x: 119.143, y: 97.709 }, end: { x: 103.852, y: 88.122 } },
  { name: 'top-left side', start: { x: 89.806, y: 126.236 }, end: { x: 79.12, y: 111.237 } },
  { name: 'top-middle left', start: { x: 527.444, y: 97.709 }, end: { x: 530.928, y: 88.137 } },
  { name: 'top-middle right', start: { x: 572.556, y: 97.741 }, end: { x: 569.072, y: 88.137 } },
  { name: 'top-right top', start: { x: 980.762, y: 97.741 }, end: { x: 995.986, y: 88.122 } },
  { name: 'top-right side', start: { x: 1009.981, y: 126.171 }, end: { x: 1020.718, y: 111.237 } },
  { name: 'bottom-left bottom', start: { x: 119.133, y: 542.286 }, end: { x: 103.852, y: 551.878 } },
  { name: 'bottom-left side', start: { x: 89.806, y: 513.774 }, end: { x: 79.12, y: 528.763 } },
  { name: 'bottom-middle left', start: { x: 527.443, y: 542.286 }, end: { x: 530.928, y: 551.863 } },
  { name: 'bottom-middle right', start: { x: 572.557, y: 542.853 }, end: { x: 569.072, y: 551.863 } },
  { name: 'bottom-right bottom', start: { x: 980.74, y: 541.691 }, end: { x: 995.986, y: 551.878 } },
  { name: 'bottom-right side', start: { x: 1009.981, y: 513.807 }, end: { x: 1020.718, y: 528.763 } },
];

export function findEarliestPocketJawCollision(
  position: Vector,
  velocity: Vector,
  duration: number,
  radius: number,
): PocketJawCollision | undefined {
  let earliest: PocketJawCollision | undefined;
  for (const jaw of VISIBLE_POCKET_JAWS) {
    const collision = findPocketJawSegmentCollision(position, velocity, duration, radius, jaw);
    if (collision && (!earliest || collision.time < earliest.time)) earliest = collision;
  }
  return earliest;
}

export function findPocketJawSegmentCollision(
  position: Vector,
  velocity: Vector,
  duration: number,
  radius: number,
  jaw: PocketJawSegment,
): PocketJawCollision | undefined {
  const speedSquared = velocity.x * velocity.x + velocity.y * velocity.y;
  if (speedSquared === 0 || duration <= 0) return undefined;

  const segmentX = jaw.end.x - jaw.start.x;
  const segmentY = jaw.end.y - jaw.start.y;
  const segmentLength = Math.hypot(segmentX, segmentY);
  const tangent = { x: segmentX / segmentLength, y: segmentY / segmentLength };
  const segmentNormal = { x: -tangent.y, y: tangent.x };
  const relative = { x: position.x - jaw.start.x, y: position.y - jaw.start.y };
  const tangentPosition = dot(relative, tangent);
  const tangentVelocity = dot(velocity, tangent);
  const normalPosition = dot(relative, segmentNormal);
  const normalVelocity = dot(velocity, segmentNormal);
  const candidates = [0, duration];
  const addCandidate = (time: number): void => {
    if (Number.isFinite(time)) candidates.push(Math.max(0, Math.min(duration, time)));
  };

  addCandidate(-dot(relative, velocity) / speedSquared);
  const endRelative = { x: position.x - jaw.end.x, y: position.y - jaw.end.y };
  addCandidate(-dot(endRelative, velocity) / speedSquared);
  if (normalVelocity !== 0) addCandidate(-normalPosition / normalVelocity);
  if (tangentVelocity !== 0) {
    addCandidate(-tangentPosition / tangentVelocity);
    addCandidate((segmentLength - tangentPosition) / tangentVelocity);
  }

  let minimumTime = 0;
  let minimumDistanceSquared = Number.POSITIVE_INFINITY;
  for (const time of candidates) {
    const sample = closestPointAtTime(position, velocity, time, jaw);
    if (sample.distanceSquared < minimumDistanceSquared) {
      minimumDistanceSquared = sample.distanceSquared;
      minimumTime = time;
    }
  }

  const radiusSquared = radius * radius;
  const start = closestPointAtTime(position, velocity, 0, jaw);
  if (start.distanceSquared > radiusSquared && minimumDistanceSquared > radiusSquared) return undefined;

  let low = 0;
  let high = minimumTime;
  if (start.distanceSquared > radiusSquared) {
    for (let iteration = 0; iteration < 36; iteration += 1) {
      const middle = (low + high) / 2;
      if (closestPointAtTime(position, velocity, middle, jaw).distanceSquared <= radiusSquared) high = middle;
      else low = middle;
    }
  }

  const time = start.distanceSquared <= radiusSquared ? 0 : high;
  const contact = closestPointAtTime(position, velocity, time, jaw);
  const distance = Math.sqrt(contact.distanceSquared);
  let normal = distance > 1e-7
    ? { x: (contact.position.x - contact.closest.x) / distance, y: (contact.position.y - contact.closest.y) / distance }
    : segmentNormal;
  if (dot(velocity, normal) > 0 && distance <= 1e-7) normal = { x: -normal.x, y: -normal.y };
  if (dot(velocity, normal) >= -1e-7) return undefined;

  return {
    time,
    position: {
      x: contact.closest.x + normal.x * radius,
      y: contact.closest.y + normal.y * radius,
    },
    normal,
    jaw,
  };
}

function closestPointAtTime(
  position: Vector,
  velocity: Vector,
  time: number,
  jaw: PocketJawSegment,
): { position: Vector; closest: Vector; distanceSquared: number } {
  const current = {
    x: position.x + velocity.x * time,
    y: position.y + velocity.y * time,
  };
  const segmentX = jaw.end.x - jaw.start.x;
  const segmentY = jaw.end.y - jaw.start.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  const projection = Math.max(0, Math.min(1,
    ((current.x - jaw.start.x) * segmentX + (current.y - jaw.start.y) * segmentY) / segmentLengthSquared,
  ));
  const closest = {
    x: jaw.start.x + segmentX * projection,
    y: jaw.start.y + segmentY * projection,
  };
  const dx = current.x - closest.x;
  const dy = current.y - closest.y;
  return { position: current, closest, distanceSquared: dx * dx + dy * dy };
}

function dot(a: Vector, b: Vector): number {
  return a.x * b.x + a.y * b.y;
}
