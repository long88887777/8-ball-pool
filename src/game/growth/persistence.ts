import {
  createDefaultPlayerStats,
  sanitizePlayerStats,
  type PlayerStats,
  type RecentMatchRecord,
} from './stats';
import {
  createDailyTaskState,
  sanitizeDailyTaskState,
  type DailyTaskState,
} from './tasks';

export type StorageAdapter = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type SupabaseUserClient = {
  auth: {
    getUser(): PromiseLike<{ data: { user: { id: string } | null } }>;
  };
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          maybeSingle(): PromiseLike<{ data: unknown; error: unknown }>;
        };
        maybeSingle(): PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
    upsert(payload: unknown): PromiseLike<{ error: unknown }>;
  };
};

type PlayerStatsRow = {
  total_games?: number | null;
  wins?: number | null;
  losses?: number | null;
  current_streak?: number | null;
  best_streak?: number | null;
  clearances?: number | null;
  total_strokes?: number | null;
  best_single_game_strokes?: number | null;
  rank_points?: number | null;
  ai_rank_points_earned_date?: string | null;
  ai_rank_points_earned?: number | null;
  recent_matches?: unknown;
};

type DailyTasksRow = {
  task_date?: string | null;
  tasks?: unknown;
};

export const PLAYER_STATS_KEY = 'pool.playerStats.v1';
const PLAYER_STATS_PENDING_SYNC_KEY = 'pool.playerStats.pendingSync.v1';
export const DAILY_TASKS_KEY_PREFIX = 'pool.dailyTasks.v1.';

export function readPlayerStats(storage: Pick<StorageAdapter, 'getItem'>): PlayerStats {
  try {
    const raw = storage.getItem(PLAYER_STATS_KEY);
    if (!raw) return createDefaultPlayerStats();
    return sanitizePlayerStats(JSON.parse(raw) as Partial<PlayerStats>);
  } catch {
    return createDefaultPlayerStats();
  }
}

export function writePlayerStats(storage: StorageAdapter, stats: PlayerStats): PlayerStats {
  const sanitized = sanitizePlayerStats(stats);
  try {
    storage.setItem(PLAYER_STATS_KEY, JSON.stringify(sanitized));
  } catch {
    // Keep in-memory progress usable if storage is unavailable.
  }
  return sanitized;
}

export function readDailyTaskState(storage: Pick<StorageAdapter, 'getItem'>, dateKey: string): DailyTaskState {
  try {
    const raw = storage.getItem(dailyTasksStorageKey(dateKey));
    if (!raw) return createDailyTaskState(dateKey);
    return sanitizeDailyTaskState(JSON.parse(raw) as Partial<DailyTaskState>, dateKey);
  } catch {
    return createDailyTaskState(dateKey);
  }
}

export function writeDailyTaskState(storage: StorageAdapter, state: DailyTaskState): DailyTaskState {
  const sanitized = sanitizeDailyTaskState(state, state.dateKey);
  try {
    storage.setItem(dailyTasksStorageKey(sanitized.dateKey), JSON.stringify(sanitized));
  } catch {
    // Keep in-memory task state usable if storage is unavailable.
  }
  return sanitized;
}

export async function readPlayerStatsSupabase(
  supabase: unknown,
  storage: StorageAdapter = browserStorage(),
): Promise<PlayerStats> {
  const client = asSupabaseUserClient(supabase);
  if (!client) {
    return readPlayerStats(storage);
  }

  const userId = await getSupabaseUserId(client);
  if (!userId) {
    return readPlayerStats(storage);
  }

  const pendingStats = readPendingPlayerStatsSync(storage, userId);
  if (pendingStats) {
    try {
      await writePlayerStatsRow(client, userId, pendingStats.stats);
      clearPendingPlayerStatsSync(storage, pendingStats.marker);
    } catch {
      // Keep the newer local rank authoritative until a later read can retry.
    }
    return writePlayerStats(storage, pendingStats.stats);
  }

  try {
    const { data, error } = await client
      .from('player_stats')
      .select('total_games, wins, losses, current_streak, best_streak, clearances, total_strokes, best_single_game_strokes, rank_points, ai_rank_points_earned_date, ai_rank_points_earned, recent_matches')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) {
      const stats = rowToPlayerStats(data as PlayerStatsRow);
      writePlayerStats(storage, stats);
      return stats;
    }
  } catch {
    return readPlayerStats(storage);
  }

  const localStats = readPlayerStats(storage);
  try {
    await writePlayerStatsRow(client, userId, localStats);
  } catch {
    // A missing remote row must not make local progress unavailable.
  }
  return localStats;
}

export async function writePlayerStatsSupabase(
  supabase: unknown,
  stats: PlayerStats,
  storage: StorageAdapter = browserStorage(),
): Promise<PlayerStats> {
  const sanitized = writePlayerStats(storage, stats);
  const client = asSupabaseUserClient(supabase);
  if (!client) {
    return sanitized;
  }

  const userId = await getSupabaseUserId(client);
  if (!userId) {
    return sanitized;
  }

  const pendingMarker = stagePendingPlayerStatsSync(storage, userId, sanitized);
  await writePlayerStatsRow(client, userId, sanitized);
  clearPendingPlayerStatsSync(storage, pendingMarker);
  return sanitized;
}

export async function readDailyTaskStateSupabase(
  supabase: unknown,
  dateKey: string,
  storage: StorageAdapter = browserStorage(),
): Promise<DailyTaskState> {
  const client = asSupabaseUserClient(supabase);
  if (!client) {
    return readDailyTaskState(storage, dateKey);
  }

  const userId = await getSupabaseUserId(client);
  if (!userId) {
    return readDailyTaskState(storage, dateKey);
  }

  try {
    const { data, error } = await client
      .from('daily_tasks')
      .select('task_date, tasks')
      .eq('user_id', userId)
      .eq('task_date', dateKey)
      .maybeSingle();

    if (!error && data) {
      const state = rowToDailyTaskState(data as DailyTasksRow, dateKey);
      writeDailyTaskState(storage, state);
      return state;
    }
  } catch {
    return readDailyTaskState(storage, dateKey);
  }

  const localState = readDailyTaskState(storage, dateKey);
  await writeDailyTaskStateRow(client, userId, localState);
  return localState;
}

export async function writeDailyTaskStateSupabase(
  supabase: unknown,
  state: DailyTaskState,
  storage: StorageAdapter = browserStorage(),
): Promise<DailyTaskState> {
  const sanitized = writeDailyTaskState(storage, state);
  const client = asSupabaseUserClient(supabase);
  if (!client) {
    return sanitized;
  }

  const userId = await getSupabaseUserId(client);
  if (!userId) {
    return sanitized;
  }

  await writeDailyTaskStateRow(client, userId, sanitized);
  return sanitized;
}

function rowToPlayerStats(row: PlayerStatsRow): PlayerStats {
  return sanitizePlayerStats({
    totalGames: row.total_games ?? undefined,
    wins: row.wins ?? undefined,
    losses: row.losses ?? undefined,
    currentStreak: row.current_streak ?? undefined,
    bestStreak: row.best_streak ?? undefined,
    clearances: row.clearances ?? undefined,
    totalStrokes: row.total_strokes ?? undefined,
    bestSingleGameStrokes: row.best_single_game_strokes ?? undefined,
    rankPoints: row.rank_points ?? undefined,
    aiRankPointsEarnedDate: row.ai_rank_points_earned_date ?? undefined,
    aiRankPointsEarned: row.ai_rank_points_earned ?? undefined,
    recentMatches: Array.isArray(row.recent_matches)
      ? row.recent_matches as RecentMatchRecord[]
      : [],
  });
}

function playerStatsToRow(userId: string, stats: PlayerStats): Record<string, unknown> {
  const sanitized = sanitizePlayerStats(stats);
  return {
    user_id: userId,
    total_games: sanitized.totalGames,
    wins: sanitized.wins,
    losses: sanitized.losses,
    current_streak: sanitized.currentStreak,
    best_streak: sanitized.bestStreak,
    clearances: sanitized.clearances,
    total_strokes: sanitized.totalStrokes,
    best_single_game_strokes: sanitized.bestSingleGameStrokes,
    rank_points: sanitized.rankPoints,
    ai_rank_points_earned_date: sanitized.aiRankPointsEarnedDate,
    ai_rank_points_earned: sanitized.aiRankPointsEarned,
    recent_matches: sanitized.recentMatches,
    updated_at: new Date().toISOString(),
  };
}

function rowToDailyTaskState(row: DailyTasksRow, dateKey: string): DailyTaskState {
  return sanitizeDailyTaskState({
    dateKey: row.task_date ?? dateKey,
    tasks: row.tasks as DailyTaskState['tasks'] | undefined,
  }, dateKey);
}

function dailyTaskStateToRow(userId: string, state: DailyTaskState): Record<string, unknown> {
  const sanitized = sanitizeDailyTaskState(state, state.dateKey);
  return {
    user_id: userId,
    task_date: sanitized.dateKey,
    tasks: sanitized.tasks,
    updated_at: new Date().toISOString(),
  };
}

async function writePlayerStatsRow(
  supabase: SupabaseUserClient,
  userId: string,
  stats: PlayerStats,
): Promise<void> {
  try {
    const { error } = await supabase.from('player_stats').upsert(playerStatsToRow(userId, stats));
    if (error) throw persistenceError(error);
  } catch (error) {
    throw persistenceError(error);
  }
}

function stagePendingPlayerStatsSync(storage: StorageAdapter, userId: string, stats: PlayerStats): string {
  const marker = JSON.stringify({ userId, stats: sanitizePlayerStats(stats) });
  try {
    storage.setItem(PLAYER_STATS_PENDING_SYNC_KEY, marker);
  } catch {
    // The regular local stats still preserve the rank in this session.
  }
  return marker;
}

function readPendingPlayerStatsSync(
  storage: Pick<StorageAdapter, 'getItem'>,
  userId: string,
): { marker: string; stats: PlayerStats } | null {
  try {
    const marker = storage.getItem(PLAYER_STATS_PENDING_SYNC_KEY);
    if (!marker) return null;
    const value = JSON.parse(marker) as { userId?: unknown; stats?: unknown };
    if (value.userId !== userId || !value.stats || typeof value.stats !== 'object') return null;
    return { marker, stats: sanitizePlayerStats(value.stats as Partial<PlayerStats>) };
  } catch {
    return null;
  }
}

function clearPendingPlayerStatsSync(storage: StorageAdapter, marker: string): void {
  try {
    if (storage.getItem(PLAYER_STATS_PENDING_SYNC_KEY) === marker) {
      storage.setItem(PLAYER_STATS_PENDING_SYNC_KEY, '');
    }
  } catch {
    // A later read retries the staged stats.
  }
}

function persistenceError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return new Error(error.message);
  }
  return new Error('Failed to save player stats');
}

async function writeDailyTaskStateRow(
  supabase: SupabaseUserClient,
  userId: string,
  state: DailyTaskState,
): Promise<void> {
  try {
    await supabase.from('daily_tasks').upsert(dailyTaskStateToRow(userId, state));
  } catch {
    // Local tasks have already been saved.
  }
}

function asSupabaseUserClient(value: unknown): SupabaseUserClient | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SupabaseUserClient>;
  return candidate.auth && typeof candidate.from === 'function'
    ? candidate as SupabaseUserClient
    : null;
}

async function getSupabaseUserId(supabase: SupabaseUserClient): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

function dailyTasksStorageKey(dateKey: string): string {
  return `${DAILY_TASKS_KEY_PREFIX}${dateKey}`;
}

function browserStorage(): StorageAdapter {
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }

  return {
    getItem: () => null,
    setItem: () => undefined,
  };
}
