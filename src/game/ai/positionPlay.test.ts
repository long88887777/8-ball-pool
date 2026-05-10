import { describe, it, expect } from 'vitest';
import { computeNextTarget } from './positionPlay';
import { POCKETS, BALL_RADIUS } from '../constants';
import type { Vector } from '../constants';

describe('positionPlay', () => {
  describe('computeNextTarget', () => {
    it('finds the easiest next ball+pocket combination', () => {
      const ballPositions = new Map<number, Vector>([
        [0, { x: 300, y: 320 }],
        [1, { x: 500, y: 320 }],
        [2, { x: 700, y: 200 }],
        [3, { x: 200, y: 500 }],
      ]);

      const result = computeNextTarget(ballPositions, 1, [1, 2, 3], []);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.ballId).not.toBe(1);
        expect(result.pocketIndex).toBeGreaterThanOrEqual(0);
        expect(result.idealZone).toBeDefined();
        expect(result.shotQuality).toBeGreaterThan(0);
      }
    });

    it('returns null when no next targets available', () => {
      const ballPositions = new Map<number, Vector>([
        [0, { x: 300, y: 320 }],
        [1, { x: 500, y: 320 }],
      ]);
      const result = computeNextTarget(ballPositions, 1, [1], []);
      expect(result).toBeNull();
    });

    it('excludes pocketed balls from consideration', () => {
      const ballPositions = new Map<number, Vector>([
        [0, { x: 300, y: 320 }],
        [1, { x: 500, y: 320 }],
        [2, { x: 700, y: 200 }],
      ]);
      const result = computeNextTarget(ballPositions, 1, [1, 2], [2]);
      expect(result).toBeNull();
    });
  });
});
