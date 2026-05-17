import { describe, expect, it } from 'vitest';
import {
  DAILY_TASKS,
  completeDailyTask,
  createDailyTaskState,
  summarizeDailyTasks,
} from './tasks';

describe('daily growth tasks', () => {
  it('creates all first-phase daily tasks for a date', () => {
    const state = createDailyTaskState('2026-05-16');

    expect(state.dateKey).toBe('2026-05-16');
    expect(Object.keys(state.tasks)).toEqual([
      'play_match',
      'win_match',
      'daily_check_in',
      'pass_challenge',
    ]);
    expect(summarizeDailyTasks(state)).toEqual({
      completed: 0,
      total: DAILY_TASKS.length,
      unclaimedCoins: 0,
    });
  });

  it('completes and rewards a task exactly once per day', () => {
    const state = createDailyTaskState('2026-05-16');

    const first = completeDailyTask(state, 'win_match');
    const second = completeDailyTask(first.state, 'win_match');

    expect(first.completedNow).toBe(true);
    expect(first.coinReward).toBe(90);
    expect(second.completedNow).toBe(false);
    expect(second.coinReward).toBe(0);
    expect(summarizeDailyTasks(second.state)).toEqual({
      completed: 1,
      total: DAILY_TASKS.length,
      unclaimedCoins: 0,
    });
  });
});
