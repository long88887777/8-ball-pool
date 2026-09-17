import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RANK_POINTS,
  applyMatchToStats,
  AI_DAILY_RANK_POINTS_LIMIT,
  createLocalMatchTracker,
  createDefaultPlayerStats,
  getRankProgress,
  recordPlayerStroke,
  summarizeStats,
  type MatchResultInput,
} from './stats';

describe('growth stats', () => {
  it('updates totals, streaks, clear rate, strokes, best game, rank points, and recent matches', () => {
    const first: MatchResultInput = {
      matchId: 'match-1',
      playedAt: '2026-05-16T10:00:00.000Z',
      mode: 'online',
      opponentName: 'Alex',
      won: true,
      strokes: 8,
      clearedTable: true,
    };
    const second: MatchResultInput = {
      matchId: 'match-2',
      playedAt: '2026-05-16T11:00:00.000Z',
      mode: 'online',
      opponentName: 'Mina',
      won: false,
      strokes: 13,
      clearedTable: false,
    };

    const afterWin = applyMatchToStats(createDefaultPlayerStats(), first);
    const afterLoss = applyMatchToStats(afterWin, second);
    const summary = summarizeStats(afterLoss);

    expect(summary.totalGames).toBe(2);
    expect(summary.wins).toBe(1);
    expect(summary.losses).toBe(1);
    expect(summary.winRate).toBe(50);
    expect(summary.currentStreak).toBe(0);
    expect(summary.bestStreak).toBe(1);
    expect(summary.clearRate).toBe(50);
    expect(summary.averageStrokes).toBe(10.5);
    expect(summary.bestSingleGameStrokes).toBe(8);
    expect(afterWin.rankPoints).toBeGreaterThan(DEFAULT_RANK_POINTS);
    expect(afterLoss.rankPoints).toBeLessThanOrEqual(afterWin.rankPoints);
    expect(afterLoss.recentMatches.map((match) => match.matchId)).toEqual(['match-2', 'match-1']);
  });

  it('keeps only the most recent match records', () => {
    const stats = Array.from({ length: 12 }, (_, index) => index + 1).reduce(
      (current, value) => applyMatchToStats(current, {
        matchId: `match-${value}`,
        playedAt: `2026-05-16T${String(value).padStart(2, '0')}:00:00.000Z`,
        mode: 'ai',
        opponentName: 'AI',
        won: value % 2 === 0,
        strokes: value,
        clearedTable: value % 2 === 0,
      }),
      createDefaultPlayerStats(),
    );

    expect(stats.recentMatches).toHaveLength(10);
    expect(stats.recentMatches[0].matchId).toBe('match-12');
    expect(stats.recentMatches.at(-1)?.matchId).toBe('match-3');
  });

  it('keeps optional ruleset and shot history on recent matches', () => {
    const stats = applyMatchToStats(createDefaultPlayerStats(), {
      matchId: 'match-history',
      playedAt: '2026-05-25T10:00:00.000Z',
      mode: 'online',
      opponentName: 'Mina',
      won: true,
      strokes: 3,
      clearedTable: true,
      ruleset: 'eight-ball',
      shotHistory: [{
        playerIndex: 0,
        ruleset: 'eight-ball',
        powerPercent: 70,
        spin: { x: 0, y: 0 },
        pocketedBallIds: [1],
        foulReason: null,
        message: 'legal pot',
      }],
    });

    expect(stats.recentMatches[0].ruleset).toBe('eight-ball');
    expect(stats.recentMatches[0].shotHistory).toHaveLength(1);
  });

  it('calculates the D through SSS rank ladder and next-rank gap', () => {
    expect(getRankProgress(1000)).toEqual({
      rankName: 'B-',
      rankIndex: 6,
      points: 1000,
      floor: 900,
      nextFloor: 1200,
      progressPercent: 33,
      pointsToNext: 200,
    });

    expect(getRankProgress(4100)).toMatchObject({
      rankName: 'SSS',
      pointsToNext: 0,
      progressPercent: 100,
    });
  });

  it('uses performance within the current rank cap and limits positive AI points to 100 per day', () => {
    let stats = { ...createDefaultPlayerStats(), rankPoints: 1_800 };
    const strongWin: MatchResultInput = {
      matchId: 'rank-1', playedAt: '2026-09-15T10:00:00.000Z', dateKey: '2026-09-15', mode: 'ai',
      opponentName: 'AI', won: true, strokes: 4, clearedTable: true, ruleset: 'eight-ball',
      shotHistory: Array.from({ length: 4 }, () => ({
        playerIndex: 0 as const, ruleset: 'eight-ball' as const, powerPercent: 60,
        spin: { x: 0, y: 0 }, pocketedBallIds: [1, 2], foulReason: null, message: 'pot',
      })),
    };
    stats = applyMatchToStats(stats, strongWin);
    expect(stats.recentMatches[0].rankDelta).toBe(40);
    stats = applyMatchToStats({ ...stats, aiRankPointsEarned: 95 }, { ...strongWin, matchId: 'rank-2' });
    expect(stats.recentMatches[0].rankDelta).toBe(5);
    expect(stats.aiRankPointsEarned).toBe(AI_DAILY_RANK_POINTS_LIMIT);
  });

  it('rewards efficient losses with a smaller deduction while never exceeding the tier cap', () => {
    const base = { ...createDefaultPlayerStats(), rankPoints: 900 };
    const efficient = applyMatchToStats(base, {
      matchId: 'loss-good', playedAt: '2026-09-15T10:00:00.000Z', mode: 'online', opponentName: 'Mina',
      won: false, strokes: 5, clearedTable: false,
    });
    const poor = applyMatchToStats(base, {
      matchId: 'loss-poor', playedAt: '2026-09-15T11:00:00.000Z', mode: 'online', opponentName: 'Mina',
      won: false, strokes: 30, clearedTable: false,
      shotHistory: [{ playerIndex: 0, ruleset: 'eight-ball', powerPercent: 20, spin: { x: 0, y: 0 }, pocketedBallIds: [], foulReason: 'scratch', message: 'foul' }],
    });
    expect(Math.abs(efficient.recentMatches[0].rankDelta!)).toBeLessThan(Math.abs(poor.recentMatches[0].rankDelta!));
    expect(Math.abs(poor.recentMatches[0].rankDelta!)).toBeLessThanOrEqual(30);
  });

  it('tracks per-player strokes within a local match without changing score stats', () => {
    const tracker = recordPlayerStroke(
      recordPlayerStroke(createLocalMatchTracker(), 0),
      1,
    );

    expect(tracker.playerStrokes).toEqual([1, 1]);
  });
});
