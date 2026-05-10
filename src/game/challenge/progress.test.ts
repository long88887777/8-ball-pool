import { describe, it, expect, beforeEach } from 'vitest';
import {
  readProgress,
  writeProgress,
  isLevelUnlocked,
  type ChallengeProgress,
} from './progress';

function createMockStorage(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  } as Storage;
}

describe('progress', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('returns empty progress when nothing stored', () => {
    const progress = readProgress(storage);
    expect(progress.levels).toEqual({});
  });

  it('writes and reads level completion', () => {
    writeProgress(storage, { levels: { '1': { stars: 3, bestShots: 1 } } });
    const progress = readProgress(storage);
    expect(progress.levels['1']).toEqual({ stars: 3, bestShots: 1 });
  });

  it('level 1 is always unlocked', () => {
    const progress = readProgress(storage);
    expect(isLevelUnlocked(progress, 1)).toBe(true);
  });

  it('level 2 is locked until level 1 is completed', () => {
    let progress = readProgress(storage);
    expect(isLevelUnlocked(progress, 2)).toBe(false);
    writeProgress(storage, { levels: { '1': { stars: 1, bestShots: 2 } } });
    progress = readProgress(storage);
    expect(isLevelUnlocked(progress, 2)).toBe(true);
  });

  it('handles corrupted storage gracefully', () => {
    storage.setItem('pool.challenge.progress', 'not-json');
    const progress = readProgress(storage);
    expect(progress.levels).toEqual({});
  });
});
