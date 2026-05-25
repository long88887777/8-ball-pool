import { describe, expect, it } from 'vitest';
import { appendShotHistoryEntry, sanitizeShotHistory, type ShotHistoryEntry } from './matchHistory';

describe('match history', () => {
  const entry: ShotHistoryEntry = {
    playerIndex: 0,
    ruleset: 'eight-ball',
    powerPercent: 62,
    spin: { x: 0.2, y: -0.1 },
    pocketedBallIds: [3],
    foulReason: null,
    message: '玩家一 合法进球',
  };

  it('sanitizes valid shot entries and drops malformed rows', () => {
    expect(sanitizeShotHistory([entry, { playerIndex: 8 }])).toEqual([entry]);
  });

  it('caps stored shot history to the newest 80 shots', () => {
    const result = Array.from({ length: 85 }, (_, index) => ({
      ...entry,
      powerPercent: index,
    })).reduce((history, item) => appendShotHistoryEntry(history, item), [] as ShotHistoryEntry[]);

    expect(result).toHaveLength(80);
    expect(result[0].powerPercent).toBe(5);
    expect(result.at(-1)?.powerPercent).toBe(84);
  });
});
