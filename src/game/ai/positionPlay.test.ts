import { describe, it, expect } from 'vitest';
import { computeNextTarget, deriveSpin, generatePositionAwareShots, scoreFuturePotRoute } from './positionPlay';
import { simulateShot } from './fastPhysics';
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

  describe('scoreFuturePotRoute', () => {
    it('scores a connected two-ball route higher than a blocked next shot', () => {
      const openRoute = new Map<number, Vector>([
        [0, { x: POCKETS[1].x, y: POCKETS[1].y + 340 }],
        [10, { x: POCKETS[1].x, y: POCKETS[1].y + 130 }],
      ]);
      const blockedRoute = new Map<number, Vector>([
        [0, { x: POCKETS[1].x, y: POCKETS[1].y + 340 }],
        [10, { x: POCKETS[1].x, y: POCKETS[1].y + 130 }],
        [1, { x: POCKETS[1].x, y: POCKETS[1].y + 230 }],
        [2, { x: POCKETS[1].x, y: POCKETS[1].y + 70 }],
        [3, { x: POCKETS[1].x - 40, y: POCKETS[1].y + 130 }],
        [4, { x: POCKETS[1].x + 40, y: POCKETS[1].y + 130 }],
      ]);

      const openScore = scoreFuturePotRoute(openRoute, [10], [], 'eight-ball', 2);
      const blockedScore = scoreFuturePotRoute(blockedRoute, [10], [], 'eight-ball', 2);

      expect(openScore).toBeGreaterThan(blockedScore + 0.15);
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

    it('uses correct collision normal for cut shots with targetPos', () => {
      const cuePos = { x: 200, y: 320 };
      const ghostBallPos = { x: 400, y: 320 };
      const targetPos = { x: 420, y: 300 };
      const shotDirection = { x: 1, y: 0 };
      const idealZone = { x: 400, y: 500 };

      const spinWithTarget = deriveSpin(cuePos, ghostBallPos, shotDirection, idealZone, targetPos);
      const spinWithout = deriveSpin(cuePos, ghostBallPos, shotDirection, idealZone);

      expect(spinWithTarget.x !== spinWithout.x || spinWithTarget.y !== spinWithout.y).toBe(true);
    });

    it('boosts spin for thin cut angles', () => {
      const cuePos = { x: 200, y: 320 };
      const ghostBallPos = { x: 400, y: 320 };
      const targetPos = { x: 410, y: 280 };
      const shotDirection = { x: 1, y: 0 };
      const idealZone = { x: 300, y: 400 };

      const spin = deriveSpin(cuePos, ghostBallPos, shotDirection, idealZone, targetPos);
      const magnitude = Math.hypot(spin.x, spin.y);
      expect(magnitude).toBeGreaterThan(0.3);
    });
  });

  describe('generatePositionAwareShots', () => {
    it('generates candidates with derived spin for a pottable ball', () => {
      const pocket = POCKETS[1];
      const targetPos = { x: pocket.x, y: pocket.y + 100 };
      const ballPositions = new Map<number, Vector>([
        [0, { x: 300, y: 320 }],
        [1, targetPos],
        [2, { x: 700, y: 200 }],
      ]);

      const candidates = generatePositionAwareShots(
        ballPositions, 1, 1, [1, 2], [],
      );

      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.length).toBeLessThanOrEqual(100);
      const uniqueSpinY = new Set(candidates.map((c) => c.spin.y.toFixed(2)));
      expect(uniqueSpinY.size).toBeGreaterThan(2);
    });

    it('includes baseline no-spin candidate', () => {
      const pocket = POCKETS[1];
      const targetPos = { x: pocket.x, y: pocket.y + 100 };
      const ballPositions = new Map<number, Vector>([
        [0, { x: 300, y: 320 }],
        [1, targetPos],
        [2, { x: 700, y: 200 }],
      ]);

      const candidates = generatePositionAwareShots(
        ballPositions, 1, 1, [1, 2], [],
      );

      const noSpin = candidates.filter(
        (c) => Math.abs(c.spin.x) < 0.01 && Math.abs(c.spin.y) < 0.01,
      );
      expect(noSpin.length).toBeGreaterThan(0);
    });

    it('uses fallback spins when no next target exists', () => {
      const pocket = POCKETS[1];
      const targetPos = { x: pocket.x, y: pocket.y + 100 };
      const ballPositions = new Map<number, Vector>([
        [0, { x: 300, y: 320 }],
        [1, targetPos],
      ]);

      const candidates = generatePositionAwareShots(
        ballPositions, 1, 1, [1], [],
      );

      expect(candidates.length).toBeGreaterThan(0);
    });
  });

  describe('end-to-end position play quality', () => {
    it('position-aware shots land closer to ideal zone than no-spin shots', () => {
      const pocket = POCKETS[1]; // top-middle
      const targetPos = { x: pocket.x, y: pocket.y + 120 };
      const ballPositions = new Map<number, Vector>([
        [0, { x: 300, y: 400 }],
        [1, targetPos],
        [2, { x: 750, y: 250 }], // next target
      ]);

      const candidates = generatePositionAwareShots(
        ballPositions, 1, 1, [1, 2], [],
      );

      const nextTarget = computeNextTarget(ballPositions, 1, [1, 2], []);
      expect(nextTarget).not.toBeNull();
      const idealZone = nextTarget!.idealZone;

      // Find best position-aware shot that pots
      let bestDist = Infinity;
      let potted = false;
      for (const c of candidates) {
        const sim = simulateShot(ballPositions, c.direction, c.power, c.spin);
        if (sim.pocketedBalls.length === 0 || sim.cueBallPocketed) continue;
        potted = true;
        const cueEnd = sim.ballPositions.get(0);
        if (!cueEnd) continue;
        const dist = Math.hypot(cueEnd.x - idealZone.x, cueEnd.y - idealZone.y);
        if (dist < bestDist) bestDist = dist;
      }

      expect(potted).toBe(true);

      // Find no-spin shot distance for comparison
      const noSpinCandidate = candidates.find(
        (c) => Math.abs(c.spin.x) < 0.01 && Math.abs(c.spin.y) < 0.01,
      );
      let noSpinDist = Infinity;
      if (noSpinCandidate) {
        const sim = simulateShot(
          ballPositions, noSpinCandidate.direction, noSpinCandidate.power, noSpinCandidate.spin,
        );
        if (sim.pocketedBalls.length > 0 && !sim.cueBallPocketed) {
          const cueEnd = sim.ballPositions.get(0);
          if (cueEnd) noSpinDist = Math.hypot(cueEnd.x - idealZone.x, cueEnd.y - idealZone.y);
        }
      }

      // Position-aware best should be closer than no-spin
      expect(bestDist).toBeLessThan(noSpinDist);
    });

    it('follow spin moves cue ball forward after straight pot', () => {
      const pocket = POCKETS[1]; // top-middle
      const targetPos = { x: pocket.x, y: pocket.y + 100 };
      const cuePos = { x: pocket.x, y: pocket.y + 300 };
      const ballPositions = new Map<number, Vector>([
        [0, cuePos],
        [9, targetPos],
      ]);

      // Straight shot with follow
      const dir = { x: 0, y: -1 };
      const simFollow = simulateShot(ballPositions, dir, 0.5, { x: 0, y: 0.8 });
      const simNoSpin = simulateShot(ballPositions, dir, 0.5, { x: 0, y: 0 });

      // Follow should push cue ball further forward (lower y)
      const followEnd = simFollow.ballPositions.get(0);
      const noSpinEnd = simNoSpin.ballPositions.get(0);
      if (followEnd && noSpinEnd) {
        expect(followEnd.y).toBeLessThan(noSpinEnd.y);
      }
    });

    it('draw spin pulls cue ball back after straight pot', () => {
      const pocket = POCKETS[1]; // top-middle
      const targetPos = { x: pocket.x, y: pocket.y + 100 };
      const cuePos = { x: pocket.x, y: pocket.y + 300 };
      const ballPositions = new Map<number, Vector>([
        [0, cuePos],
        [9, targetPos],
      ]);

      const dir = { x: 0, y: -1 };
      const simDraw = simulateShot(ballPositions, dir, 0.5, { x: 0, y: -0.8 });
      const simNoSpin = simulateShot(ballPositions, dir, 0.5, { x: 0, y: 0 });

      // Draw should keep cue ball further back (higher y)
      const drawEnd = simDraw.ballPositions.get(0);
      const noSpinEnd = simNoSpin.ballPositions.get(0);
      if (drawEnd && noSpinEnd) {
        expect(drawEnd.y).toBeGreaterThan(noSpinEnd.y);
      }
    });
  });
});
