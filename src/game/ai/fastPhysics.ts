import { BALL_RADIUS, PLAY_AREA, POCKETS, TABLE, type Vector } from '../constants';
import type { FastSimResult } from './types';

const FRICTION = 0.984;
const COLLISION_ENERGY_LOSS = 0.95;
const CUSHION_ENERGY_LOSS = 0.80;
const MAX_STEPS = 800;
const DT = 0.016;
const SPEED_THRESHOLD = 0.5;
const SHOT_SPEED = 1500;
const CORNER_POCKET_RADIUS = TABLE.pocketRadius + BALL_RADIUS * 0.6;
const MIDDLE_POCKET_RADIUS = TABLE.pocketRadius * 0.85;

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
  spin: Vector,
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
  let cueHasCollided = false;

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
        if (collision && (a.id === 0 || b.id === 0) && !cueHasCollided) {
          cueHasCollided = true;
          if (cueBall) {
            applySpinEffect(cueBall, cueDirection, spin, SHOT_SPEED * power);
          }
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

function applySpinEffect(
  cueBall: SimBall,
  shotDirection: Vector,
  spin: Vector,
  preCollisionSpeed: number,
): void {
  if (preCollisionSpeed < 1) return;

  const spinBase = preCollisionSpeed * 0.22;

  if (Math.abs(spin.y) > 0.1) {
    const followDraw = spin.y * spinBase;
    cueBall.vel.x += shotDirection.x * followDraw;
    cueBall.vel.y += shotDirection.y * followDraw;
  }

  if (Math.abs(spin.x) > 0.1) {
    const perpX = -shotDirection.y;
    const perpY = shotDirection.x;
    const sideEffect = spin.x * spinBase * 0.6;
    cueBall.vel.x += perpX * sideEffect;
    cueBall.vel.y += perpY * sideEffect;
  }
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
  for (let i = 0; i < POCKETS.length; i++) {
    const pocket = POCKETS[i];
    const dist = Math.hypot(pos.x - pocket.x, pos.y - pocket.y);
    const radius = (i === 1 || i === 4) ? MIDDLE_POCKET_RADIUS : CORNER_POCKET_RADIUS;
    if (dist < radius) return true;
  }
  return false;
}
