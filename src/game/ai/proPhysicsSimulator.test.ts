import { describe, expect, it } from 'vitest';
import { BALL_RADIUS, POCKETS, type Vector } from '../constants';
import { simulateProShot } from './proPhysicsSimulator';

describe('proPhysicsSimulator', () => {
  it('reports the same target pocket result shape the AI evaluator expects', () => {
    const pocket = POCKETS[1];
    const ballPositions = new Map<number, Vector>([
      [0, { x: pocket.x, y: pocket.y + 320 }],
      [9, { x: pocket.x, y: pocket.y + 125 }],
    ]);

    const result = simulateProShot(
      ballPositions,
      { x: 0, y: -1 },
      0.45,
      { x: 0, y: 0 },
    );

    expect(result.pocketedBalls).toContain(9);
    expect(result.cueBallPocketed).toBe(false);
    expect(result.firstContact).toBe(9);
    expect(result.ballPositions.has(9)).toBe(false);
    expect(result.ballPositions.get(0)).toBeDefined();
  });

  it('detects cue-ball scratches with the real pocket geometry', () => {
    const pocket = POCKETS[0];
    const ballPositions = new Map<number, Vector>([
      [0, { x: pocket.x + BALL_RADIUS * 5, y: pocket.y + BALL_RADIUS * 5 }],
    ]);
    const diagonal = { x: -1 / Math.SQRT2, y: -1 / Math.SQRT2 };

    const result = simulateProShot(ballPositions, diagonal, 0.7, { x: 0, y: 0 });

    expect(result.cueBallPocketed).toBe(true);
    expect(result.ballPositions.has(0)).toBe(false);
  });

  it('preserves deterministic cue-ball endpoints for identical spin shots', () => {
    const ballPositions = new Map<number, Vector>([
      [0, { x: 240, y: 320 }],
      [1, { x: 420, y: 320 }],
    ]);

    const first = simulateProShot(ballPositions, { x: 1, y: 0 }, 0.62, { x: 0, y: 0.8 });
    const second = simulateProShot(ballPositions, { x: 1, y: 0 }, 0.62, { x: 0, y: 0.8 });

    expect(second).toEqual(first);
  });
});
