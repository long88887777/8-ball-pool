import { describe, expect, it } from 'vitest';
import {
  createDefaultPlayerStats,
  type PlayerStats,
} from './stats';
import {
  createDailyTaskState,
  type DailyTaskState,
} from './tasks';
import {
  readDailyTaskStateSupabase,
  readPlayerStatsSupabase,
  writeDailyTaskStateSupabase,
  writePlayerStatsSupabase,
} from './persistence';

type StorageAdapter = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function createStorage(seed: Record<string, string> = {}): StorageAdapter {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

function createGrowthSupabaseClient(options: {
  userId?: string | null;
  statsRow?: Record<string, unknown> | null;
  tasksRow?: Record<string, unknown> | null;
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
        eq: () => {
          const query = {
            eq: () => query,
            maybeSingle: async () => ({
              data: table === 'player_stats' ? options.statsRow ?? null : options.tasksRow ?? null,
              error: options.selectError ?? null,
            }),
          };
          return query;
        },
      }),
      upsert: async (payload: unknown) => {
        upserts.push({ table, payload });
        return { error: options.upsertError ?? null };
      },
    }),
  };

  return { client, upserts };
}

describe('growth persistence', () => {
  it('reads authenticated player stats from Supabase and mirrors them locally', async () => {
    const storage = createStorage();
    const { client } = createGrowthSupabaseClient({
      statsRow: {
        total_games: 3,
        wins: 2,
        losses: 1,
        current_streak: 2,
        best_streak: 2,
        clearances: 1,
        total_strokes: 27,
        best_single_game_strokes: 7,
        rank_points: 1036,
        recent_matches: [
          {
            matchId: 'match-1',
            playedAt: '2026-05-16T10:00:00.000Z',
            mode: 'online',
            opponentName: 'Alex',
            won: true,
            strokes: 7,
            clearedTable: true,
          },
        ],
      },
    });

    const stats = await readPlayerStatsSupabase(client, storage);

    expect(stats.totalGames).toBe(3);
    expect(stats.rankPoints).toBe(1036);
    expect(JSON.parse(storage.getItem('pool.playerStats.v1')!)).toMatchObject({ totalGames: 3 });
  });

  it('seeds authenticated player stats from local fallback when Supabase has no row', async () => {
    const storage = createStorage();
    const local: PlayerStats = { ...createDefaultPlayerStats(), wins: 1, totalGames: 1, rankPoints: 1018 };
    storage.setItem('pool.playerStats.v1', JSON.stringify(local));
    const { client, upserts } = createGrowthSupabaseClient({ statsRow: null });

    const stats = await readPlayerStatsSupabase(client, storage);

    expect(stats).toMatchObject({ wins: 1, totalGames: 1, rankPoints: 1018 });
    expect(upserts).toEqual([
      {
        table: 'player_stats',
        payload: expect.objectContaining({
          user_id: 'user-1',
          wins: 1,
          total_games: 1,
          rank_points: 1018,
        }),
      },
    ]);
  });

  it('uses local player stats when signed out', async () => {
    const storage = createStorage();
    const { client, upserts } = createGrowthSupabaseClient({ userId: null });
    const stats: PlayerStats = { ...createDefaultPlayerStats(), totalGames: 2 };

    await writePlayerStatsSupabase(client, stats, storage);
    const read = await readPlayerStatsSupabase(client, storage);

    expect(read.totalGames).toBe(2);
    expect(upserts).toEqual([]);
  });

  it('reads and writes authenticated daily tasks for the requested date', async () => {
    const storage = createStorage();
    const taskState: DailyTaskState = createDailyTaskState('2026-05-16');
    taskState.tasks.daily_check_in = {
      completed: true,
      completedAt: '2026-05-16T01:00:00.000Z',
      claimedCoins: 40,
    };
    const { client, upserts } = createGrowthSupabaseClient({
      tasksRow: {
        task_date: '2026-05-16',
        tasks: taskState.tasks,
      },
    });

    const read = await readDailyTaskStateSupabase(client, '2026-05-16', storage);
    await writeDailyTaskStateSupabase(client, read, storage);

    expect(read.tasks.daily_check_in.completed).toBe(true);
    expect(upserts).toEqual([
      {
        table: 'daily_tasks',
        payload: expect.objectContaining({
          user_id: 'user-1',
          task_date: '2026-05-16',
          tasks: expect.objectContaining({
            daily_check_in: expect.objectContaining({ completed: true }),
          }),
        }),
      },
    ]);
  });
});
