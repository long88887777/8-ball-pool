import { describe, it, expect } from 'vitest';
import { computeNextTarget, deriveSpin } from './positionPlay';
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

  describe('deriveSpin', () => {
    it('returns follow spin when ideal zone is ahead along shot direction', () => {
      const cuePos = { x: 200, y: 320 };
      const ghostBallPos = { x: 400, y: 320 };
      const shotDirection = { x: 1, y: 0 };
      const idealZone = { x: 600, y: 320 };

      const spin = deriveSpin(cuePos, ghostBallPos, shotDirection, idealZone);
      expect(spin.y).toBeGreaterThan(0);
    });

    it('returns draw spin when ideal zone is behind collision point', () => {
      const cuePos = { x: 200, y: 320 };
      const ghostBallPos = { x: 400, y: 320 };
      const shotDirection = { x: 1, y: 0 };
      const idealZone = { x: 250, y: 320 };

      const spin = deriveSpin(cuePos, ghostBallPos, shotDirection, idealZone);
      expect(spin.y).toBeLessThan(0);
    });

    it('returns side spin when ideal zone is perpendicular', () => {
      const cuePos = { x: 200, y: 320 };
      const ghostBallPos = { x: 400, y: 320 };
      const shotDirection = { x: 1, y: 0 };
      const idealZone = { x: 400, y: 150 };

      const spin = deriveSpin(cuePos, ghostBallPos, shotDirection, idealZone);
      expect(Math.abs(spin.x)).toBeGreaterThan(0.1);
    });

    it('clamps spin values to [-1, 1]', () => {
      const cuePos = { x: 200, y: 320 };
      const ghostBallPos = { x: 400, y: 320 };
      const shotDirection = { x: 1, y: 0 };
      const idealZone = { x: 100, y: 100 };

      const spin = deriveSpin(cuePos, ghostBallPos, shotDirection, idealZone);
      expect(spin.x).toBeGreaterThanOrEqual(-1);
      expect(spin.x).toBeLessThanOrEqual(1);
      expect(spin.y).toBeGreaterThanOrEqual(-1);
      expect(spin.y).toBeLessThanOrEqual(1);
    });
  });
});
