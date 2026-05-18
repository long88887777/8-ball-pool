import { describe, it, expect, beforeEach } from 'vitest';
import {
  readProgress,
  readProgressSupabase,
  writeProgress,
  writeProgressSupabase,
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

function createMockSupabase(options: {
  userId?: string | null;
  levelsRow?: Record<string, unknown> | null;
  selectError?: unknown;
  upsertError?: unknown;
} = {}) {
  const upserts: Array<{ table: string; payload: unknown }> = [];
  const userId = options.userId === undefined ? 'user-1' : options.userId;

  const client = {
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null } }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: options.levelsRow === undefined ? null : { levels: options.levelsRow },
            error: options.selectError ?? null,
          }),
        }),
      }),
      upsert: async (payload: unknown) => {
        upserts.push({ table, payload });
        return { error: options.upsertError ?? null };
      },
    }),
  };

  return { client, upserts };
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

  it('mirrors authenticated progress locally before syncing to Supabase', async () => {
    const progress: ChallengeProgress = {
      levels: { '1': { stars: 3, bestShots: 1 } },
    };
    const { client, upserts } = createMockSupabase();

    await writeProgressSupabase(client as never, progress, storage);

    expect(readProgress(storage)).toEqual(progress);
    expect(upserts).toEqual([
      {
        table: 'challenge_progress',
        payload: expect.objectContaining({
          user_id: 'user-1',
          levels: progress.levels,
        }),
      },
    ]);
  });

  it('falls back to local progress when authenticated Supabase read has no row', async () => {
    const progress: ChallengeProgress = {
      levels: { '1': { stars: 2, bestShots: 2 } },
    };
    writeProgress(storage, progress);
    const { client } = createMockSupabase({ levelsRow: null });

    await expect(readProgressSupabase(client as never, storage)).resolves.toEqual(progress);
  });
});
