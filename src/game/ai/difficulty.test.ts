import { describe, expect, it } from 'vitest';
import { AIController } from './aiController';
import {
  applyDifficultyToDecision,
  getAIDifficultyProfile,
  normalizeAIDifficulty,
  type AIDifficultyProfile,
  type RandomSource,
} from './difficulty';
import { createEightBallState } from '../eightBallRules';
import type { Vector } from '../constants';
import type { AIDecision, ShotCandidate } from './types';

function sequence(values: number[]): RandomSource {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function angleOf(direction: Vector): number {
  return Math.atan2(direction.y, direction.x);
}

function noisyProfile(): AIDifficultyProfile {
  return {
    ...getAIDifficultyProfile('easy'),
    aimErrorRadians: (3.2 * Math.PI) / 180,
    powerError: 0.14,
    spinError: 0.18,
  };
}

describe('ai difficulty profiles', () => {
  it('normalizes unknown difficulty values to the provided fallback', () => {
    expect(normalizeAIDifficulty('easy', 'hard')).toBe('easy');
    expect(normalizeAIDifficulty('legendary', 'normal')).toBe('normal');
  });

  it('scales search budget from easy to hard without adding execution error', () => {
    const easy = getAIDifficultyProfile('easy');
    const normal = getAIDifficultyProfile('normal');
    const hard = getAIDifficultyProfile('hard');

    expect(easy.mctsConfig.timeBudgetMs).toBeLessThan(normal.mctsConfig.timeBudgetMs);
    expect(normal.mctsConfig.timeBudgetMs).toBeLessThanOrEqual(hard.mctsConfig.timeBudgetMs);
    expect(easy.aimErrorRadians).toBe(0);
    expect(normal.aimErrorRadians).toBe(0);
    expect(hard.aimErrorRadians).toBe(0);
    expect(easy.powerError).toBe(0);
    expect(normal.powerError).toBe(0);
    expect(hard.powerError).toBe(0);
    expect(easy.spinError).toBe(0);
    expect(normal.spinError).toBe(0);
    expect(hard.spinError).toBe(0);
  });

  it('exposes personality traits for each difficulty', () => {
    const easy = getAIDifficultyProfile('easy');
    const normal = getAIDifficultyProfile('normal');
    const hard = getAIDifficultyProfile('hard');

    expect(easy.safetyBias).toBeGreaterThan(hard.safetyBias);
    expect(hard.riskTolerance).toBeGreaterThan(normal.riskTolerance);
    expect(normal.tempoMs).toBeGreaterThan(0);
  });
});

describe('applyDifficultyToDecision', () => {
  const baseShot: ShotCandidate = {
    targetBallId: 9,
    pocketIndex: 1,
    direction: { x: 1, y: 0 },
    power: 0.5,
    spin: { x: 0.1, y: -0.1 },
    type: 'pot',
    ghostBallPos: { x: 400, y: 320 },
  };

  it('applies deterministic aim, power, and spin error without mutating the original shot', () => {
    const profile = noisyProfile();
    const decision: AIDecision = { shot: baseShot };

    const adjusted = applyDifficultyToDecision(decision, profile, sequence([1, 1, 0, 1]));

    expect(angleOf(adjusted.shot.direction)).toBeCloseTo(profile.aimErrorRadians, 5);
    expect(adjusted.shot.power).toBeCloseTo(baseShot.power + profile.powerError, 5);
    expect(adjusted.shot.spin.x).toBeCloseTo(baseShot.spin.x - profile.spinError, 5);
    expect(adjusted.shot.spin.y).toBeCloseTo(baseShot.spin.y + profile.spinError, 5);
    expect(baseShot.direction).toEqual({ x: 1, y: 0 });
    expect(baseShot.power).toBe(0.5);
  });

  it('clamps noisy shot values to playable ranges', () => {
    const profile = noisyProfile();
    const decision: AIDecision = {
      shot: {
        ...baseShot,
        power: 0.02,
        spin: { x: -0.95, y: 0.95 },
      },
    };

    const adjusted = applyDifficultyToDecision(decision, profile, sequence([0.5, 0, 0, 1]));

    expect(adjusted.shot.power).toBeGreaterThanOrEqual(0.12);
    expect(adjusted.shot.power).toBeLessThanOrEqual(1);
    expect(adjusted.shot.spin.x).toBeGreaterThanOrEqual(-1);
    expect(adjusted.shot.spin.y).toBeLessThanOrEqual(1);
  });
});

describe('AIController difficulty integration', () => {
  it('keeps legacy config constructor at hard difficulty behavior', () => {
    const legacyHard = new AIController({ timeBudgetMs: 30, maxDepth: 2, explorationConstant: 1.41 });
    const selectedHard = new AIController({
      difficulty: 'hard',
      config: { timeBudgetMs: 30, maxDepth: 2, explorationConstant: 1.41 },
      rng: sequence([1, 1, 1, 1]),
    });
    const ballPositions = new Map<number, Vector>([
      [0, { x: 250, y: 320 }],
      [9, { x: 500, y: 320 }],
    ]);
    const rules = createEightBallState();
    rules.currentPlayer = 1;
    rules.players[1].group = 'stripes';

    const legacyDecision = legacyHard.computeDecision(ballPositions, rules);
    const selectedDecision = selectedHard.computeDecision(ballPositions, rules);

    expect(legacyDecision).not.toBeNull();
    expect(selectedDecision).not.toBeNull();
    expect(selectedDecision!.shot.power - legacyDecision!.shot.power).toBeCloseTo(
      getAIDifficultyProfile('hard').powerError,
      5,
    );
    expect(angleOf(selectedDecision!.shot.direction) - angleOf(legacyDecision!.shot.direction)).toBeCloseTo(
      getAIDifficultyProfile('hard').aimErrorRadians,
      5,
    );
  });

  it('does not add random execution error to selected difficulty decisions', () => {
    const hard = new AIController({
      difficulty: 'hard',
      config: { timeBudgetMs: 30, maxDepth: 2, explorationConstant: 1.41 },
      rng: sequence([1, 1, 1, 1]),
    });
    const easy = new AIController({
      difficulty: 'easy',
      config: { timeBudgetMs: 30, maxDepth: 2, explorationConstant: 1.41 },
      rng: sequence([1, 1, 1, 1]),
    });
    const ballPositions = new Map<number, Vector>([
      [0, { x: 250, y: 320 }],
      [9, { x: 500, y: 320 }],
    ]);
    const rules = createEightBallState();
    rules.currentPlayer = 1;
    rules.players[1].group = 'stripes';

    const hardDecision = hard.computeDecision(ballPositions, rules);
    const easyDecision = easy.computeDecision(ballPositions, rules);

    expect(hardDecision).not.toBeNull();
    expect(easyDecision).not.toBeNull();
    expect(angleOf(easyDecision!.shot.direction) - angleOf(hardDecision!.shot.direction)).toBeCloseTo(0, 5);
    expect(easyDecision!.shot.power).toBeCloseTo(hardDecision!.shot.power, 5);
    expect(easyDecision!.shot.spin).toEqual(hardDecision!.shot.spin);
  });
});
