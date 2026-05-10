import { describe, it, expect } from 'vitest';
import { mctsSearch, createRootNode, selectBestChild } from './mcts';
import type { Vector } from '../constants';
import type { TableState, MCTSConfig } from './types';

describe('mcts', () => {
  const simpleState: TableState = {
    ballPositions: new Map<number, Vector>([
      [0, { x: 250, y: 320 }],
      [1, { x: 500, y: 320 }],
      [9, { x: 600, y: 200 }],
    ]),
    pocketedBallIds: [],
    currentPlayer: 1,
    playerGroups: [null, 'solids'],
  };

  const config: MCTSConfig = {
    timeBudgetMs: 50,
    maxDepth: 3,
    explorationConstant: 1.41,
  };

  describe('createRootNode', () => {
    it('creates a root node with no parent and no shot', () => {
      const root = createRootNode(simpleState, 'solids', []);
      expect(root.parent).toBeNull();
      expect(root.shot).toBeNull();
      expect(root.visits).toBe(0);
      expect(root.totalValue).toBe(0);
      expect(root.untriedShots.length).toBeGreaterThan(0);
    });
  });

  describe('selectBestChild', () => {
    it('selects child with highest average value when visits are equal', () => {
      const root = createRootNode(simpleState, 'solids', []);
      root.visits = 10;
      const child1 = { ...root, visits: 5, totalValue: 4.0, children: [], untriedShots: [], parent: root, shot: root.untriedShots[0] || null };
      const child2 = { ...root, visits: 5, totalValue: 2.0, children: [], untriedShots: [], parent: root, shot: root.untriedShots[1] || null };
      root.children = [child1, child2];
      const best = selectBestChild(root);
      expect(best.totalValue / best.visits).toBeCloseTo(0.8);
    });
  });

  describe('mctsSearch', () => {
    it('returns a valid shot candidate', () => {
      const result = mctsSearch(simpleState, 1, 'solids', [], config);
      expect(result).not.toBeNull();
      if (result) {
        expect(result.direction).toBeDefined();
        expect(result.power).toBeGreaterThan(0);
        expect(result.power).toBeLessThanOrEqual(1);
      }
    });

    it('completes within time budget', () => {
      const start = performance.now();
      mctsSearch(simpleState, 1, 'solids', [], config);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(config.timeBudgetMs + 100);
    });

    it('prefers potting shots over safety when pot is available', () => {
      const easyPotState: TableState = {
        ballPositions: new Map<number, Vector>([
          [0, { x: 300, y: 320 }],
          [1, { x: 550, y: 320 }],
        ]),
        pocketedBallIds: [],
        currentPlayer: 1,
        playerGroups: [null, 'solids'],
      };
      const result = mctsSearch(easyPotState, 1, 'solids', [], config);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('pot');
    });
  });
});
