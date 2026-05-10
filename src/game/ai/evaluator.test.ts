import { describe, it, expect } from 'vitest';
import { evaluateState } from './evaluator';
import type { Vector } from '../constants';
import type { TableState, FastSimResult } from './types';

describe('evaluator', () => {
  const baseState: TableState = {
    ballPositions: new Map<number, Vector>([
      [0, { x: 300, y: 320 }],
      [1, { x: 500, y: 320 }],
    ]),
    pocketedBallIds: [],
    currentPlayer: 1,
    playerGroups: [null, 'solids'],
  };

  it('scores higher when own ball is pocketed', () => {
    const noPotsResult: FastSimResult = {
      ballPositions: new Map([[0, { x: 300, y: 320 }], [1, { x: 500, y: 320 }]]),
      pocketedBalls: [],
      cueBallPocketed: false,
      firstContact: 1,
      cushionAfterContact: true,
    };
    const potResult: FastSimResult = {
      ballPositions: new Map([[0, { x: 300, y: 320 }]]),
      pocketedBalls: [1],
      cueBallPocketed: false,
      firstContact: 1,
      cushionAfterContact: true,
    };
    const scoreNoPot = evaluateState(baseState, noPotsResult, 1, 'solids');
    const scorePot = evaluateState(baseState, potResult, 1, 'solids');
    expect(scorePot).toBeGreaterThan(scoreNoPot);
  });

  it('penalizes cue ball pocketed', () => {
    const cleanResult: FastSimResult = {
      ballPositions: new Map([[0, { x: 300, y: 320 }], [1, { x: 500, y: 320 }]]),
      pocketedBalls: [],
      cueBallPocketed: false,
      firstContact: 1,
      cushionAfterContact: true,
    };
    const foulResult: FastSimResult = {
      ballPositions: new Map([[1, { x: 500, y: 320 }]]),
      pocketedBalls: [],
      cueBallPocketed: true,
      firstContact: 1,
      cushionAfterContact: true,
    };
    const scoreClean = evaluateState(baseState, cleanResult, 1, 'solids');
    const scoreFoul = evaluateState(baseState, foulResult, 1, 'solids');
    expect(scoreFoul).toBeLessThan(scoreClean);
  });

  it('returns 1.0 for legal 8-ball pot (win)', () => {
    const winState: TableState = {
      ...baseState,
      ballPositions: new Map([[0, { x: 300, y: 320 }], [8, { x: 500, y: 320 }]]),
      pocketedBallIds: [1, 2, 3, 4, 5, 6, 7],
    };
    const winResult: FastSimResult = {
      ballPositions: new Map([[0, { x: 300, y: 320 }]]),
      pocketedBalls: [8],
      cueBallPocketed: false,
      firstContact: 8,
      cushionAfterContact: true,
    };
    const score = evaluateState(winState, winResult, 1, 'solids');
    expect(score).toBe(1.0);
  });

  it('returns 0.0 for illegal 8-ball pot (loss)', () => {
    const lossState: TableState = {
      ...baseState,
      ballPositions: new Map([[0, { x: 300, y: 320 }], [1, { x: 400, y: 320 }], [8, { x: 500, y: 320 }]]),
    };
    const lossResult: FastSimResult = {
      ballPositions: new Map([[0, { x: 300, y: 320 }], [1, { x: 400, y: 320 }]]),
      pocketedBalls: [8],
      cueBallPocketed: false,
      firstContact: 8,
      cushionAfterContact: true,
    };
    const score = evaluateState(lossState, lossResult, 1, 'solids');
    expect(score).toBe(0.0);
  });

  it('penalizes no first contact (foul)', () => {
    const foulResult: FastSimResult = {
      ballPositions: new Map([[0, { x: 300, y: 320 }], [1, { x: 500, y: 320 }]]),
      pocketedBalls: [],
      cueBallPocketed: false,
      firstContact: null,
      cushionAfterContact: false,
    };
    const score = evaluateState(baseState, foulResult, 1, 'solids');
    expect(score).toBeLessThan(0.3);
  });
});
