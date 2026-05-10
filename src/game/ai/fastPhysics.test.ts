import { describe, it, expect } from 'vitest';
import { simulateShot } from './fastPhysics';
import type { Vector } from '../constants';

describe('fastPhysics', () => {
  describe('simulateShot', () => {
    it('moves cue ball in shot direction and comes to rest', () => {
      const balls = new Map<number, Vector>([[0, { x: 300, y: 320 }]]);
      const result = simulateShot(balls, { x: 1, y: 0 }, 0.5, { x: 0, y: 0 });
      expect(result.ballPositions.get(0)!.x).toBeGreaterThan(300);
      expect(result.cueBallPocketed).toBe(false);
      expect(result.pocketedBalls).toEqual([]);
    });

    it('detects ball-ball collision and transfers momentum', () => {
      const balls = new Map<number, Vector>([
        [0, { x: 200, y: 320 }],
        [1, { x: 400, y: 320 }],
      ]);
      const result = simulateShot(balls, { x: 1, y: 0 }, 0.7, { x: 0, y: 0 });
      expect(result.firstContact).toBe(1);
      const ball1Pos = result.ballPositions.get(1)!;
      expect(ball1Pos.x).toBeGreaterThan(400);
    });

    it('detects cue ball pocketed', () => {
      const balls = new Map<number, Vector>([[0, { x: 150, y: 150 }]]);
      const pocketDir = { x: -1, y: -1 };
      const len = Math.hypot(pocketDir.x, pocketDir.y);
      const result = simulateShot(
        balls,
        { x: pocketDir.x / len, y: pocketDir.y / len },
        0.9,
        { x: 0, y: 0 },
      );
      expect(result.cueBallPocketed).toBe(true);
    });

    it('detects target ball pocketed', () => {
      const balls = new Map<number, Vector>([
        [0, { x: 200, y: 76 }],
        [1, { x: 76, y: 76 }],
      ]);
      const result = simulateShot(balls, { x: -1, y: 0 }, 0.6, { x: 0, y: 0 });
      expect(result.pocketedBalls).toContain(1);
    });

    it('detects cushion contact after first ball hit', () => {
      const balls = new Map<number, Vector>([
        [0, { x: 300, y: 320 }],
        [1, { x: 900, y: 320 }],
      ]);
      const result = simulateShot(balls, { x: 1, y: 0 }, 0.9, { x: 0, y: 0 });
      expect(result.cushionAfterContact).toBe(true);
    });

    it('returns all ball final positions', () => {
      const balls = new Map<number, Vector>([
        [0, { x: 200, y: 320 }],
        [1, { x: 400, y: 320 }],
        [2, { x: 600, y: 320 }],
      ]);
      const result = simulateShot(balls, { x: 1, y: 0 }, 0.5, { x: 0, y: 0 });
      expect(result.ballPositions.size).toBeGreaterThanOrEqual(2);
    });
  });
});
