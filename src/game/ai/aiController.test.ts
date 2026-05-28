import { describe, it, expect } from 'vitest';
import { AIController, computeBestPlacement } from './aiController';
import type { Vector } from '../constants';
import { PLAY_AREA, BALL_RADIUS, POCKETS } from '../constants';
import { createEightBallState } from '../eightBallRules';
import { simulateShot } from './fastPhysics';
import { simulateProShot } from './proPhysicsSimulator';
import { computeNextTarget } from './positionPlay';

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

    it('AI finds pot shots in realistic post-break positions', () => {
      const controller = new AIController({ timeBudgetMs: 50, maxDepth: 2, explorationConstant: 1.41 });
      const ballPositions = new Map<number, Vector>([
        [0, { x: 265, y: 320 }],
        [1, { x: 400, y: 200 }],
        [2, { x: 600, y: 150 }],
        [3, { x: 350, y: 450 }],
        [4, { x: 700, y: 300 }],
        [5, { x: 500, y: 400 }],
        [6, { x: 800, y: 200 }],
        [7, { x: 300, y: 150 }],
        [8, { x: 550, y: 320 }],
        [9, { x: 450, y: 250 }],
        [10, { x: 650, y: 450 }],
        [11, { x: 750, y: 400 }],
        [12, { x: 400, y: 350 }],
        [13, { x: 850, y: 300 }],
        [14, { x: 200, y: 200 }],
        [15, { x: 900, y: 150 }],
      ]);
      const rules = createEightBallState();
      rules.currentPlayer = 1;
      rules.players[1].group = 'stripes';

      const decision = controller.computeDecision(ballPositions, rules);
      expect(decision).not.toBeNull();
      expect(decision!.shot.type).toBe('pot');
      expect(decision!.shot.power).toBeGreaterThan(0.2);
    });

    it('AI shot direction actually pots a ball in the real physics engine', () => {
      const controller = new AIController({ timeBudgetMs: 50, maxDepth: 2, explorationConstant: 1.41 });
      const pocket = POCKETS[1];
      const targetPos = { x: pocket.x, y: pocket.y + 100 };
      const ballPositions = new Map<number, Vector>([
        [0, { x: 265, y: 320 }],
        [9, targetPos],
      ]);
      const rules = createEightBallState();
      rules.currentPlayer = 1;
      rules.players[1].group = 'stripes';

      const decision = controller.computeDecision(ballPositions, rules);
      expect(decision).not.toBeNull();

      const simResult = simulateProShot(
        ballPositions,
        decision!.shot.direction,
        decision!.shot.power,
        decision!.shot.spin,
      );
      expect(simResult.pocketedBalls).toContain(9);
    });

    it('AI planned pot must pocket the intended target in the real physics engine', () => {
      const controller = new AIController({ timeBudgetMs: 100, maxDepth: 2, explorationConstant: 1.41 });
      const pocket = POCKETS[1];
      const ballPositions = new Map<number, Vector>([
        [0, { x: 300, y: 400 }],
        [9, { x: pocket.x, y: pocket.y + 120 }],
        [10, { x: 800, y: 200 }],
      ]);
      const rules = createEightBallState();
      rules.currentPlayer = 1;
      rules.players[1].group = 'stripes';

      const decision = controller.computeDecision(ballPositions, rules);

      expect(decision).not.toBeNull();
      expect(decision!.shot.type).toBe('pot');

      const simResult = simulateProShot(
        ballPositions,
        decision!.shot.direction,
        decision!.shot.power,
        decision!.shot.spin,
      );
      expect(simResult.pocketedBalls).toContain(decision!.shot.targetBallId);
      expect(simResult.firstContact).toBe(decision!.shot.targetBallId);
      expect(simResult.cueBallPocketed).toBe(false);
    });

    it('AI takes a confirmed real-physics pot instead of playing safety', () => {
      const controller = new AIController({ difficulty: 'normal' });
      const ballPositions = new Map<number, Vector>([
        [0, { x: 308.60682620050466, y: 91.69740732133147 }],
        [9, { x: 164, y: 144 }],
      ]);
      const rules = createEightBallState();
      rules.currentPlayer = 1;
      rules.players[1].group = 'stripes';

      const decision = controller.computeDecision(ballPositions, rules);

      expect(decision).not.toBeNull();
      expect(decision!.shot.type).toBe('pot');
      const simResult = simulateProShot(
        ballPositions,
        decision!.shot.direction,
        decision!.shot.power,
        decision!.shot.spin,
      );
      expect(simResult.pocketedBalls).toContain(decision!.shot.targetBallId);
      expect(simResult.firstContact).toBe(decision!.shot.targetBallId);
      expect(simResult.cueBallPocketed).toBe(false);
    });

    it('AI prefers lower power for easy straight shots', () => {
      const controller = new AIController({ timeBudgetMs: 50, maxDepth: 2, explorationConstant: 1.41 });
      const pocket = POCKETS[1];
      const targetPos = { x: pocket.x, y: pocket.y + 120 };
      const ballPositions = new Map<number, Vector>([
        [0, { x: pocket.x, y: pocket.y + 300 }],
        [9, targetPos],
      ]);
      const rules = createEightBallState();
      rules.currentPlayer = 1;
      rules.players[1].group = 'stripes';

      const decision = controller.computeDecision(ballPositions, rules);
      expect(decision).not.toBeNull();
      expect(decision!.shot.power).toBeLessThan(0.55);
    });

    it('AI uses spin for position when next ball is available', () => {
      const controller = new AIController({ timeBudgetMs: 100, maxDepth: 2, explorationConstant: 1.41 });
      const pocket = POCKETS[3]; // bottom-left
      const ballPositions = new Map<number, Vector>([
        [0, { x: 500, y: 300 }],
        [9, { x: 300, y: 450 }],  // target near bottom-left pocket
        [10, { x: 700, y: 200 }], // next ball on right side
      ]);
      const rules = createEightBallState();
      rules.currentPlayer = 1;
      rules.players[1].group = 'stripes';

      const decision = controller.computeDecision(ballPositions, rules);
      expect(decision).not.toBeNull();

      const sim = simulateProShot(
        ballPositions,
        decision!.shot.direction,
        decision!.shot.power,
        decision!.shot.spin,
      );
      expect(sim.pocketedBalls.length).toBeGreaterThan(0);
      expect(sim.cueBallPocketed).toBe(false);
    });

    it('AI attempts kick shot when direct path is blocked', () => {
      const controller = new AIController({ timeBudgetMs: 100, maxDepth: 2, explorationConstant: 1.41 });
      // Target ball near pocket but blocker ball in the way
      const pocket = POCKETS[5]; // bottom-right
      const ballPositions = new Map<number, Vector>([
        [0, { x: 200, y: 300 }],
        [9, { x: pocket.x - 50, y: pocket.y - 50 }], // target near pocket
        [2, { x: 400, y: 300 }], // blocker in direct path
        [3, { x: 600, y: 300 }], // another blocker
      ]);
      const rules = createEightBallState();
      rules.currentPlayer = 1;
      rules.players[1].group = 'stripes';

      const decision = controller.computeDecision(ballPositions, rules);
      expect(decision).not.toBeNull();
      // Should find some shot (kick, safety, or MCTS)
      expect(decision!.shot.direction).toBeDefined();
      expect(decision!.shot.power).toBeGreaterThan(0);
    });

    it('does not foul by shooting straight into a blocking opponent ball', () => {
      const controller = new AIController({ timeBudgetMs: 100, maxDepth: 2, explorationConstant: 1.41 });
      const ballPositions = new Map<number, Vector>([
        [0, { x: 220, y: 320 }],
        [9, { x: 650, y: 320 }],
        [1, { x: 390, y: 320 }],
        [2, { x: 390, y: 280 }],
        [3, { x: 390, y: 360 }],
      ]);
      const rules = createEightBallState();
      rules.currentPlayer = 1;
      rules.players[1].group = 'stripes';

      const decision = controller.computeDecision(ballPositions, rules);

      expect(decision).not.toBeNull();
      const sim = simulateProShot(
        ballPositions,
        decision!.shot.direction,
        decision!.shot.power,
        decision!.shot.spin,
      );
      expect(sim.firstContact).toBe(9);
      expect(sim.cueBallPocketed).toBe(false);
    });

    it('AI breaks clusters when no direct pot available', () => {
      const controller = new AIController({ timeBudgetMs: 100, maxDepth: 2, explorationConstant: 1.41 });
      // Cluster of own balls with no clear pot
      const ballPositions = new Map<number, Vector>([
        [0, { x: 200, y: 320 }],
        [9, { x: 700, y: 300 }],   // clustered
        [10, { x: 715, y: 315 }],  // clustered
        [11, { x: 685, y: 285 }],  // clustered
        [8, { x: 550, y: 320 }],   // 8-ball blocking paths
        [1, { x: 400, y: 200 }],   // opponent ball blocking
        [2, { x: 500, y: 400 }],   // opponent ball blocking
      ]);
      const rules = createEightBallState();
      rules.currentPlayer = 1;
      rules.players[1].group = 'stripes';

      const decision = controller.computeDecision(ballPositions, rules);
      expect(decision).not.toBeNull();
      expect(['break_cluster', 'kick']).toContain(decision!.shot.type);
      expect(decision!.shot.power).toBeGreaterThan(0);
    });

    it('does not attack the 8-ball before clearing its group', () => {
      const controller = new AIController({ timeBudgetMs: 100, maxDepth: 3, explorationConstant: 1.25 });
      const ballPositions = new Map<number, Vector>([
        [0, { x: 250, y: 320 }],
        [8, { x: 500, y: 320 }],
        [9, { x: 760, y: 250 }],
      ]);
      const rules = createEightBallState();
      rules.currentPlayer = 1;
      rules.players[1].group = 'stripes';

      const decision = controller.computeDecision(ballPositions, rules);

      expect(decision).not.toBeNull();
      expect(decision!.shot.targetBallId).not.toBe(8);
    });

    it('attacks the 8-ball after clearing its group when the shot is legal', () => {
      const controller = new AIController({ timeBudgetMs: 100, maxDepth: 3, explorationConstant: 1.25 });
      const ballPositions = new Map<number, Vector>([
        [0, { x: 250, y: 320 }],
        [8, { x: 500, y: 320 }],
      ]);
      const rules = createEightBallState();
      rules.currentPlayer = 1;
      rules.players[1].group = 'stripes';
      rules.pocketedBallIds = [9, 10, 11, 12, 13, 14, 15];

      const decision = controller.computeDecision(ballPositions, rules);

      expect(decision).not.toBeNull();
      expect(decision!.shot.targetBallId).toBe(8);
    });

    it('AI uses position play to steer cue ball toward next target', () => {
      const controller = new AIController({ timeBudgetMs: 100, maxDepth: 2, explorationConstant: 1.41 });
      const pocket = POCKETS[1]; // top-middle
      const ballPositions = new Map<number, Vector>([
        [0, { x: 300, y: 400 }],
        [9, { x: pocket.x, y: pocket.y + 120 }],  // easy pot into top-middle
        [10, { x: 800, y: 200 }],                   // next target on right side
      ]);
      const rules = createEightBallState();
      rules.currentPlayer = 1;
      rules.players[1].group = 'stripes';

      const decision = controller.computeDecision(ballPositions, rules);
      expect(decision).not.toBeNull();

      const sim = simulateProShot(
        ballPositions,
        decision!.shot.direction,
        decision!.shot.power,
        decision!.shot.spin,
      );

      // Must pot the planned target in the real engine.
      expect(sim.pocketedBalls).toContain(decision!.shot.targetBallId);
      expect(sim.cueBallPocketed).toBe(false);

      // Cue ball should end up closer to ball 10's side of the table
      const cueEnd = sim.ballPositions.get(0)!;
      const distToNext = Math.hypot(cueEnd.x - 800, cueEnd.y - 200);
      // Should be within reasonable range (not stuck on left side)
      expect(distToNext).toBeLessThan(500);
    });

    it('AI position play does not sacrifice pot accuracy', () => {
      const controller = new AIController({ timeBudgetMs: 100, maxDepth: 2, explorationConstant: 1.41 });
      const setups = [
        new Map<number, Vector>([[0, { x: 265, y: 320 }], [9, { x: 550, y: 150 }], [10, { x: 700, y: 400 }]]),
        new Map<number, Vector>([[0, { x: 400, y: 400 }], [9, { x: 600, y: 200 }], [10, { x: 300, y: 150 }]]),
        new Map<number, Vector>([[0, { x: 300, y: 300 }], [9, { x: 500, y: 300 }], [10, { x: 800, y: 300 }]]),
      ];

      let potCount = 0;
      for (const positions of setups) {
        const rules = createEightBallState();
        rules.currentPlayer = 1;
        rules.players[1].group = 'stripes';

        const decision = controller.computeDecision(positions, rules);
        if (!decision) continue;

        const sim = simulateProShot(
          positions,
          decision.shot.direction,
          decision.shot.power,
          decision.shot.spin,
        );
        if (sim.pocketedBalls.length > 0 && !sim.cueBallPocketed) {
          potCount++;
        }
      }

      // At least 2 out of 3 should pot successfully
      expect(potCount).toBeGreaterThanOrEqual(2);
    });

    it('uses only moderate spin on a routine position shot', () => {
      const controller = new AIController({ timeBudgetMs: 100, maxDepth: 2, explorationConstant: 1.41 });
      const pocket = POCKETS[1];
      const targetPos = { x: pocket.x, y: pocket.y + 120 };
      const nextTarget = { x: 800, y: 200 };
      const ballPositions = new Map<number, Vector>([
        [0, { x: 300, y: 400 }],
        [9, targetPos],
        [10, nextTarget],
      ]);
      const rules = createEightBallState();
      rules.currentPlayer = 1;
      rules.players[1].group = 'stripes';

      const decision = controller.computeDecision(ballPositions, rules);
      expect(decision).not.toBeNull();

      const sim = simulateProShot(
        ballPositions,
        decision!.shot.direction,
        decision!.shot.power,
        decision!.shot.spin,
      );
      expect(sim.pocketedBalls).toContain(decision!.shot.targetBallId);
      expect(sim.cueBallPocketed).toBe(false);

      const cueEnd = sim.ballPositions.get(0)!;
      const next = computeNextTarget(ballPositions, decision!.shot.targetBallId, [9, 10], []);
      expect(next).not.toBeNull();
      const idealZone = next!.idealZone;
      const distToIdeal = Math.hypot(cueEnd.x - idealZone.x, cueEnd.y - idealZone.y);
      const spinMagnitude = Math.hypot(decision!.shot.spin.x, decision!.shot.spin.y);
      const noSpinSim = simulateProShot(
        ballPositions,
        decision!.shot.direction,
        decision!.shot.power,
        { x: 0, y: 0 },
      );
      const noSpinCueEnd = noSpinSim.ballPositions.get(0)!;
      const noSpinDist = Math.hypot(noSpinCueEnd.x - idealZone.x, noSpinCueEnd.y - idealZone.y);

      expect(spinMagnitude).toBeLessThanOrEqual(0.85);
      expect(distToIdeal).toBeLessThan(noSpinDist);
    });
  });
});
