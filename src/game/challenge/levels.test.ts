import { describe, it, expect } from 'vitest';
import { CHALLENGE_LEVELS, type ChallengeLevel } from './levels';
import { PLAY_AREA, BALL_RADIUS } from '../constants';

describe('CHALLENGE_LEVELS', () => {
  it('has exactly 10 levels', () => {
    expect(CHALLENGE_LEVELS).toHaveLength(10);
  });

  it('each level has required fields', () => {
    for (const level of CHALLENGE_LEVELS) {
      expect(level.id).toBeGreaterThanOrEqual(1);
      expect(level.name.en).toBeTruthy();
      expect(level.name.zh).toBeTruthy();
      expect(level.balls.length).toBeGreaterThanOrEqual(2); // cue + at least 1 target
      expect(level.maxShots).toBeGreaterThan(0);
      expect(level.starThresholds).toHaveLength(2);
      expect(level.starThresholds[0]).toBeLessThanOrEqual(level.starThresholds[1]);
      expect(level.starThresholds[1]).toBeLessThanOrEqual(level.maxShots);
    }
  });

  it('all ball positions are within play area', () => {
    for (const level of CHALLENGE_LEVELS) {
      for (const ball of level.balls) {
        expect(ball.position.x).toBeGreaterThanOrEqual(PLAY_AREA.left + BALL_RADIUS);
        expect(ball.position.x).toBeLessThanOrEqual(PLAY_AREA.right - BALL_RADIUS);
        expect(ball.position.y).toBeGreaterThanOrEqual(PLAY_AREA.top + BALL_RADIUS);
        expect(ball.position.y).toBeLessThanOrEqual(PLAY_AREA.bottom - BALL_RADIUS);
      }
    }
  });

  it('each level has exactly one cue ball', () => {
    for (const level of CHALLENGE_LEVELS) {
      const cueBalls = level.balls.filter(b => b.id === 0);
      expect(cueBalls).toHaveLength(1);
    }
  });

  it('levels are ordered by id', () => {
    for (let i = 0; i < CHALLENGE_LEVELS.length; i++) {
      expect(CHALLENGE_LEVELS[i].id).toBe(i + 1);
    }
  });
});
