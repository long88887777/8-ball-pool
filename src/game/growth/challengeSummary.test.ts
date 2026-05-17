import { describe, expect, it } from 'vitest';
import { CHALLENGE_LEVELS } from '../challenge/levels';
import { summarizeChallengeStars } from './challengeSummary';

describe('challenge star summary', () => {
  it('summarizes earned stars, total stars, and completed levels from challenge progress', () => {
    const summary = summarizeChallengeStars(
      {
        levels: {
          '1': { stars: 3, bestShots: 1 },
          '2': { stars: 0, bestShots: 2 },
          '3': { stars: 2, bestShots: 2 },
        },
      },
      CHALLENGE_LEVELS,
    );

    expect(summary).toEqual({
      earnedStars: 5,
      totalStars: CHALLENGE_LEVELS.length * 3,
      completedLevels: 2,
      totalLevels: CHALLENGE_LEVELS.length,
    });
  });
});
