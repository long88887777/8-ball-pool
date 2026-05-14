import { describe, it, expect } from 'vitest';
import { generateShotCandidates, getAILegalTargets, isPathClear, generateKickShots, generateClusterBreakShots } from './shotGenerator';
import type { Vector } from '../constants';
import { POCKETS } from '../constants';

describe('shotGenerator', () => {
  describe('getAILegalTargets', () => {
    it('returns solids when AI group is solids', () => {
      const targets = getAILegalTargets('solids', []);
      expect(targets).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('returns stripes when AI group is stripes', () => {
      const targets = getAILegalTargets('stripes', []);
      expect(targets).toEqual([9, 10, 11, 12, 13, 14, 15]);
    });

    it('returns 8-ball when all group balls pocketed', () => {
      const targets = getAILegalTargets('solids', [1, 2, 3, 4, 5, 6, 7]);
      expect(targets).toEqual([8]);
    });

    it('returns all non-8 balls when group is null', () => {
      const targets = getAILegalTargets(null, []);
      expect(targets.length).toBe(14);
      expect(targets).not.toContain(8);
    });

    it('excludes already pocketed balls', () => {
      const targets = getAILegalTargets('solids', [1, 2, 3]);
      expect(targets).toEqual([4, 5, 6, 7]);
    });
  });

  describe('isPathClear', () => {
    it('returns true when no obstacles', () => {
      const from = { x: 200, y: 320 };
      const to = { x: 500, y: 320 };
      expect(isPathClear(from, to, [])).toBe(true);
    });

    it('returns false when ball blocks path', () => {
      const from = { x: 200, y: 320 };
      const to = { x: 500, y: 320 };
      const obstacles: Vector[] = [{ x: 350, y: 320 }];
      expect(isPathClear(from, to, obstacles)).toBe(false);
    });

    it('returns true when ball is beside path', () => {
      const from = { x: 200, y: 320 };
      const to = { x: 500, y: 320 };
      const obstacles: Vector[] = [{ x: 350, y: 400 }];
      expect(isPathClear(from, to, obstacles)).toBe(true);
    });
  });

  describe('generateShotCandidates', () => {
    it('generates candidates for a simple table', () => {
      const ballPositions = new Map<number, Vector>([
        [0, { x: 250, y: 320 }],
        [1, { x: 500, y: 320 }],
      ]);
      const candidates = generateShotCandidates(ballPositions, 'solids', []);
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.every((c) => c.targetBallId === 1)).toBe(true);
    });

    it('generates safety candidates when no pot is available', () => {
      // Ball 1 surrounded by blockers so no clear pot line exists
      const ballPositions = new Map<number, Vector>([
        [0, { x: 200, y: 320 }],
        [1, { x: 550, y: 320 }],
        [9, { x: 550, y: 290 }],
        [10, { x: 550, y: 350 }],
        [11, { x: 520, y: 320 }],
        [12, { x: 580, y: 320 }],
        [13, { x: 520, y: 290 }],
        [14, { x: 580, y: 290 }],
        [15, { x: 520, y: 350 }],
      ]);
      const candidates = generateShotCandidates(ballPositions, 'solids', []);
      const safetyCandidates = candidates.filter((c) => c.type === 'safety');
      expect(safetyCandidates.length).toBeGreaterThan(0);
    });
  });

  describe('generateKickShots', () => {
    it('generates kick shots via cushion reflection', () => {
      // Cue ball on left, target near top-right pocket
      // Direct path might be blocked, but cushion kick should work
      const ballPositions = new Map<number, Vector>([
        [0, { x: 200, y: 400 }],
        [9, { x: 900, y: 150 }],
      ]);
      const kicks = generateKickShots(ballPositions, 'stripes', []);
      expect(kicks.length).toBeGreaterThan(0);
      expect(kicks.every((c) => c.type === 'kick')).toBe(true);
      expect(kicks.every((c) => c.power >= 0.35)).toBe(true);
    });
  });

  describe('generateClusterBreakShots', () => {
    it('generates break shots for clustered balls', () => {
      const ballPositions = new Map<number, Vector>([
        [0, { x: 200, y: 320 }],
        [9, { x: 700, y: 300 }],
        [10, { x: 715, y: 315 }],
        [11, { x: 685, y: 285 }],
      ]);
      const breaks = generateClusterBreakShots(ballPositions, 'stripes', []);
      expect(breaks.length).toBeGreaterThan(0);
      expect(breaks.every((c) => c.type === 'break_cluster')).toBe(true);
      expect(breaks.every((c) => c.power >= 0.6)).toBe(true);
    });

    it('returns empty when no clusters exist', () => {
      const ballPositions = new Map<number, Vector>([
        [0, { x: 200, y: 320 }],
        [9, { x: 500, y: 150 }],
        [10, { x: 700, y: 400 }],
        [11, { x: 300, y: 500 }],
      ]);
      const breaks = generateClusterBreakShots(ballPositions, 'stripes', []);
      expect(breaks.length).toBe(0);
    });
  });
});
