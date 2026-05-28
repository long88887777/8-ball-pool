import type { Vector } from '../constants';
import { ProfessionalPoolEngine } from '../proPhysics/engine';
import type { PhysicsBallStart } from '../proPhysics/types';
import type { FastSimResult } from './types';

const STEP_SECONDS = 1 / 20;
const MAX_STEPS = 500;
const MAX_CACHE_ENTRIES = 4096;

const simCache = new Map<string, FastSimResult>();

export function simulateProShot(
  balls: Map<number, Vector>,
  cueDirection: Vector,
  power: number,
  spin: Vector,
): FastSimResult {
  const cacheKey = makeCacheKey(balls, cueDirection, power, spin);
  const cached = simCache.get(cacheKey);
  if (cached) {
    return cloneResult(cached);
  }

  const engine = new ProfessionalPoolEngine();
  engine.rack(toBallStarts(balls));
  engine.strikeCueBall({
    direction: cueDirection,
    power,
    contactOffset: spin,
  });

  let firstContact: number | null = null;
  let cushionAfterContact = false;
  let result = engine.step(STEP_SECONDS);

  for (let i = 0; i < MAX_STEPS && !result.settled; i += 1) {
    for (const event of result.events) {
      if (event.type === 'collision' && firstContact === null) {
        if (event.ballId === 0 && event.otherBallId !== undefined) {
          firstContact = event.otherBallId;
        } else if (event.otherBallId === 0) {
          firstContact = event.ballId;
        }
      }
      if (event.type === 'cushion' && firstContact !== null) {
        cushionAfterContact = true;
      }
    }
    result = engine.step(STEP_SECONDS);
  }

  for (const event of result.events) {
    if (event.type === 'collision' && firstContact === null) {
      if (event.ballId === 0 && event.otherBallId !== undefined) {
        firstContact = event.otherBallId;
      } else if (event.otherBallId === 0) {
        firstContact = event.ballId;
      }
    }
    if (event.type === 'cushion' && firstContact !== null) {
      cushionAfterContact = true;
    }
  }

  const finalBalls = result.balls;
  const ballPositions = new Map<number, Vector>();
  const pocketedBalls: number[] = [];
  let cueBallPocketed = false;

  for (const ball of finalBalls) {
    if (ball.pocketed) {
      if (ball.id === 0) {
        cueBallPocketed = true;
      } else {
        pocketedBalls.push(ball.id);
      }
      continue;
    }
    ballPositions.set(ball.id, { x: ball.position.x, y: ball.position.y });
  }

  pocketedBalls.sort((a, b) => a - b);
  const simResult = { ballPositions, pocketedBalls, cueBallPocketed, firstContact, cushionAfterContact };
  remember(cacheKey, simResult);
  return cloneResult(simResult);
}

function toBallStarts(balls: Map<number, Vector>): PhysicsBallStart[] {
  return Array.from(balls.entries()).map(([id, position]) => ({
    id,
    kind: id === 0 ? 'cue' : 'target',
    position: { x: position.x, y: position.y },
    label: id === 0 ? undefined : id,
  }));
}

function makeCacheKey(
  balls: Map<number, Vector>,
  cueDirection: Vector,
  power: number,
  spin: Vector,
): string {
  const ballKey = Array.from(balls.entries())
    .sort(([a], [b]) => a - b)
    .map(([id, pos]) => `${id}:${round(pos.x)},${round(pos.y)}`)
    .join('|');
  return [
    ballKey,
    round(cueDirection.x),
    round(cueDirection.y),
    round(power),
    round(spin.x),
    round(spin.y),
  ].join(';');
}

function round(value: number): string {
  return Math.round(value * 10000).toString();
}

function remember(key: string, result: FastSimResult): void {
  if (simCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = simCache.keys().next().value;
    if (firstKey !== undefined) {
      simCache.delete(firstKey);
    }
  }
  simCache.set(key, cloneResult(result));
}

function cloneResult(result: FastSimResult): FastSimResult {
  return {
    ballPositions: new Map(
      Array.from(result.ballPositions.entries()).map(([id, pos]) => [id, { x: pos.x, y: pos.y }]),
    ),
    pocketedBalls: [...result.pocketedBalls],
    cueBallPocketed: result.cueBallPocketed,
    firstContact: result.firstContact,
    cushionAfterContact: result.cushionAfterContact,
  };
}
