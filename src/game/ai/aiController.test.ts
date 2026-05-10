import { describe, it, expect } from 'vitest';
import { AIController, computeBestPlacement } from './aiController';
import type { Vector } from '../constants';
import { PLAY_AREA, BALL_RADIUS } from '../constants';
import { createEightBallState } from '../eightBallRules';

describe('aiController', () => {
  describe('computeBestPlacement', () => {
    it('returns a position on the table surface', () => {
      const ballPositions = new Map<number, Vector>([[1, { x: 500, y: 320 }]]);
      const pos = computeBestPlacement(ballPositions, 'solids', []);
      expect(pos.x).toBeGreaterThanOrEqual(PLAY_AREA.left + BALL_RADIUS);
      expect(pos.x).toBeLessThanOrEqual(PLAY_AREA.right - BALL_RADIUS);
      expect(pos.y).toBeGreaterThanOrEqual(PLAY_AREA.top + BALL_RADIUS);
      expect(pos.y).toBeLessThanOrEqual(PLAY_AREA.bottom - BALL_RADIUS);
    });

    it('does not overlap with existing balls', () => {
      const ballPositions = new Map<number, Vector>([
        [1, { x: 300, y: 320 }],
        [2, { x: 400, y: 320 }],
        [3, { x: 500, y: 320 }],
      ]);
      const pos = computeBestPlacement(ballPositions, 'solids', []);
      for (const [, ballPos] of ballPositions) {
        const dist = Math.hypot(pos.x - ballPos.x, pos.y - ballPos.y);
        expect(dist).toBeGreaterThanOrEqual(BALL_RADIUS * 2);
      }
    });
  });

  describe('AIController', () => {
    it('creates an instance with default config', () => {
      const controller = new AIController();
      expect(controller).toBeDefined();
    });

    it('computeDecision returns a valid shot', () => {
      const controller = new AIController({ timeBudgetMs: 30, maxDepth: 2, explorationConstant: 1.41 });
      const ballPositions = new Map<number, Vector>([
        [0, { x: 250, y: 320 }],
        [1, { x: 500, y: 320 }],
      ]);
      const rules = createEightBallState();
      rules.currentPlayer = 1;
      rules.players[1].group = 'solids';

      const decision = controller.computeDecision(ballPositions, rules);
      expect(decision).not.toBeNull();
      if (decision) {
        expect(decision.shot.direction).toBeDefined();
        expect(decision.shot.power).toBeGreaterThan(0);
      }
    });

    it('computeDecision handles ball-in-hand', () => {
      const controller = new AIController({ timeBudgetMs: 30, maxDepth: 2, explorationConstant: 1.41 });
      const ballPositions = new Map<number, Vector>([
        [0, { x: 250, y: 320 }],
        [1, { x: 500, y: 320 }],
      ]);
      const rules = createEightBallState();
      rules.currentPlayer = 1;
      rules.players[1].group = 'solids';
      rules.cueBallInHand = true;

      const decision = controller.computeDecision(ballPositions, rules);
      expect(decision).not.toBeNull();
      if (decision) {
        expect(decision.placementPosition).toBeDefined();
      }
    });
  });
});
