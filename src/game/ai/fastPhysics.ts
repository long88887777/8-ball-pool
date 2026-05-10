import { BALL_RADIUS, PLAY_AREA, POCKETS, type Vector } from '../constants';
import type { FastSimResult } from './types';

const FRICTION = 0.992;
const COLLISION_ENERGY_LOSS = 0.92;
const CUSHION_ENERGY_LOSS = 0.78;
const MAX_STEPS = 600;
const DT = 0.016;
const SPEED_THRESHOLD = 0.3;
const SHOT_SPEED = 8.0 * 60;
const POCKET_CAPTURE_RADIUS = 26 + BALL_RADIUS * 0.5;

type SimBall = {
  id: number;
  pos: Vector;
  vel: Vector;
  pocketed: boolean;
};

export function simulateShot(
  balls: Map<number, Vector>,
  cueDirection: Vector,
  power: number,
  _spin: Vector,
): FastSimResult {
  const simBalls: SimBall[] = [];
  for (const [id, pos] of balls) {
    simBalls.push({ id, pos: { ...pos }, vel: { x: 0, y: 0 }, pocketed: false });
  }

  const cueBall = simBalls.find((b) => b.id === 0);
  if (cueBall) {
    const speed = SHOT_SPEED * power;
    cueBall.vel = { x: cueDirection.x * speed, y: cueDirection.y * speed };
  }

  let firstContact: number | null = null;
  let cushionAfterContact = false;
  const pocketedBalls: number[] = [];
  let cueBallPocketed = false;

  for (let step = 0; step < MAX_STEPS; step++) {
    let allStopped = true;

    for (const ball of simBalls) {
      if (ball.pocketed) continue;
      if (Math.hypot(ball.vel.x, ball.vel.y) > SPEED_THRESHOLD) {
        allStopped = false;
      }

      ball.pos.x += ball.vel.x * DT;
      ball.pos.y += ball.vel.y * DT;
      ball.vel.x *= FRICTION;
      ball.vel.y *= FRICTION;

      if (Math.hypot(ball.vel.x, ball.vel.y) < SPEED_THRESHOLD) {
        ball.vel.x = 0;
        ball.vel.y = 0;
      }
    }

    for (let i = 0; i < simBalls.length; i++) {
      for (let j = i + 1; j < simBalls.length; j++) {
        const a = simBalls[i];
        const b = simBalls[j];
        if (a.pocketed || b.pocketed) continue;
        const collision = resolveCollision(a, b);
        if (collision && firstContact === null) {
          if (a.id === 0) firstContact = b.id;
          else if (b.id === 0) firstContact = a.id;
        }
      }
    }

    for (const ball of simBalls) {
      if (ball.pocketed) continue;
      const hitCushion = resolveCushion(ball);
      if (hitCushion && firstContact !== null) {
        cushionAfterContact = true;
      }
    }

    for (const ball of simBalls) {
      if (ball.pocketed) continue;
      if (isInPocket(ball.pos)) {
        ball.pocketed = true;
        ball.vel = { x: 0, y: 0 };
        if (ball.id === 0) {
          cueBallPocketed = true;
        } else {
          pocketedBalls.push(ball.id);
        }
      }
    }

    if (allStopped && step > 0) break;
  }

  const ballPositions = new Map<number, Vector>();
  for (const ball of simBalls) {
    if (!ball.pocketed) {
      ballPositions.set(ball.id, ball.pos);
    }
  }

  return { ballPositions, pocketedBalls, cueBallPocketed, firstContact, cushionAfterContact };
}

function resolveCollision(a: SimBall, b: SimBall): boolean {
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  const dist = Math.hypot(dx, dy);
  const minDist = BALL_RADIUS * 2;

  if (dist >= minDist || dist === 0) return false;

  const nx = dx / dist;
  const ny = dy / dist;

  const relVelX = a.vel.x - b.vel.x;
  const relVelY = a.vel.y - b.vel.y;
  const relVelDotN = relVelX * nx + relVelY * ny;

  if (relVelDotN <= 0) return false;

  const impulse = relVelDotN * COLLISION_ENERGY_LOSS;
  a.vel.x -= impulse * nx;
  a.vel.y -= impulse * ny;
  b.vel.x += impulse * nx;
  b.vel.y += impulse * ny;

  const overlap = minDist - dist;
  a.pos.x -= (overlap / 2) * nx;
  a.pos.y -= (overlap / 2) * ny;
  b.pos.x += (overlap / 2) * nx;
  b.pos.y += (overlap / 2) * ny;

  return true;
}

function resolveCushion(ball: SimBall): boolean {
  let hit = false;
  const left = PLAY_AREA.left + BALL_RADIUS;
  const right = PLAY_AREA.right - BALL_RADIUS;
  const top = PLAY_AREA.top + BALL_RADIUS;
  const bottom = PLAY_AREA.bottom - BALL_RADIUS;

  if (ball.pos.x < left) {
    ball.pos.x = left;
    ball.vel.x = Math.abs(ball.vel.x) * CUSHION_ENERGY_LOSS;
    ball.vel.y *= CUSHION_ENERGY_LOSS;
    hit = true;
  } else if (ball.pos.x > right) {
    ball.pos.x = right;
    ball.vel.x = -Math.abs(ball.vel.x) * CUSHION_ENERGY_LOSS;
    ball.vel.y *= CUSHION_ENERGY_LOSS;
    hit = true;
  }

  if (ball.pos.y < top) {
    ball.pos.y = top;
    ball.vel.y = Math.abs(ball.vel.y) * CUSHION_ENERGY_LOSS;
    ball.vel.x *= CUSHION_ENERGY_LOSS;
    hit = true;
  } else if (ball.pos.y > bottom) {
    ball.pos.y = bottom;
    ball.vel.y = -Math.abs(ball.vel.y) * CUSHION_ENERGY_LOSS;
    ball.vel.x *= CUSHION_ENERGY_LOSS;
    hit = true;
  }

  return hit;
}

function isInPocket(pos: Vector): boolean {
  return POCKETS.some(
    (pocket) => Math.hypot(pos.x - pocket.x, pos.y - pocket.y) < POCKET_CAPTURE_RADIUS,
  );
}
