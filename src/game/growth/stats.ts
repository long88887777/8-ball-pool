import type { GameRuleset } from '../gameRules';
import { sanitizeShotHistory, type ShotHistoryEntry } from '../matchHistory';

export type MatchMode = 'ai' | 'pvp' | 'challenge' | 'online';

export type RecentMatchRecord = {
  matchId: string;
  playedAt: string;
  mode: MatchMode;
  opponentName: string;
  won: boolean;
  strokes: number;
  clearedTable: boolean;
  ruleset?: GameRuleset;
  shotHistory?: ShotHistoryEntry[];
  coinDelta?: number;
  rankDelta?: number;
};

export type PlayerStats = {
  totalGames: number;
  wins: number;
  losses: number;
  currentStreak: number;
  bestStreak: number;
  clearances: number;
  totalStrokes: number;
  bestSingleGameStrokes: number | null;
  rankPoints: number;
  aiRankPointsEarnedDate: string | null;
  aiRankPointsEarned: number;
  recentMatches: RecentMatchRecord[];
};

export type PlayerStatsSummary = PlayerStats & {
  winRate: number;
  clearRate: number;
  averageStrokes: number;
};

export type MatchResultInput = RecentMatchRecord & { dateKey?: string; performancePlayerIndex?: 0 | 1 };

export type LocalMatchTracker = {
  playerStrokes: [number, number];
};

export type RankProgress = {
  rankName: string;
  rankIndex: number;
  points: number;
  floor: number;
  nextFloor: number | null;
  progressPercent: number;
  pointsToNext: number;
};

export const DEFAULT_RANK_POINTS = 0;
export const AI_DAILY_RANK_POINTS_LIMIT = 100;
export const MAX_RANK_POINTS = 4_100;
export const MAX_RECENT_MATCHES = 10;

export const RANKS = [
  { name: 'D-', floor: 0, matchLimit: 10 },
  { name: 'D', floor: 100, matchLimit: 10 },
  { name: 'D+', floor: 200, matchLimit: 10 },
  { name: 'C-', floor: 300, matchLimit: 20 },
  { name: 'C', floor: 500, matchLimit: 20 },
  { name: 'C+', floor: 700, matchLimit: 20 },
  { name: 'B-', floor: 900, matchLimit: 30 },
  { name: 'B', floor: 1200, matchLimit: 30 },
  { name: 'B+', floor: 1500, matchLimit: 30 },
  { name: 'A-', floor: 1800, matchLimit: 40 },
  { name: 'A', floor: 2200, matchLimit: 40 },
  { name: 'A+', floor: 2600, matchLimit: 40 },
  { name: 'S', floor: 3000, matchLimit: 50 },
  { name: 'SS', floor: 3500, matchLimit: 60 },
  { name: 'SSS', floor: 4100, matchLimit: 60 },
] as const;

export function createDefaultPlayerStats(): PlayerStats {
  return {
    totalGames: 0,
    wins: 0,
    losses: 0,
    currentStreak: 0,
    bestStreak: 0,
    clearances: 0,
    totalStrokes: 0,
    bestSingleGameStrokes: null,
    rankPoints: DEFAULT_RANK_POINTS,
    aiRankPointsEarnedDate: null,
    aiRankPointsEarned: 0,
    recentMatches: [],
  };
}

export function createLocalMatchTracker(): LocalMatchTracker {
  return { playerStrokes: [0, 0] };
}

export function recordPlayerStroke(
  tracker: LocalMatchTracker,
  playerIndex: 0 | 1,
): LocalMatchTracker {
  const playerStrokes: [number, number] = [...tracker.playerStrokes];
  playerStrokes[playerIndex] += 1;
  return { playerStrokes };
}

export function applyMatchToStats(stats: PlayerStats, match: MatchResultInput): PlayerStats {
  const currentStreak = match.won ? stats.currentStreak + 1 : 0;
  const safeStats = sanitizePlayerStats(stats);
  const rankResult = calculateRankPointResult(safeStats, match);
  const bestSingleGameStrokes =
    stats.bestSingleGameStrokes === null
      ? match.strokes
      : Math.min(stats.bestSingleGameStrokes, match.strokes);
  const recentMatch: RecentMatchRecord = {
    matchId: match.matchId,
    playedAt: match.playedAt,
    mode: match.mode,
    opponentName: match.opponentName,
    won: match.won,
    strokes: match.strokes,
    clearedTable: match.clearedTable,
    ...(match.ruleset ? { ruleset: match.ruleset } : {}),
    ...(match.shotHistory ? { shotHistory: match.shotHistory } : {}),
    ...(match.coinDelta !== undefined ? { coinDelta: Math.trunc(match.coinDelta) } : {}),
  };

  return sanitizePlayerStats({
    ...stats,
    totalGames: stats.totalGames + 1,
    wins: stats.wins + (match.won ? 1 : 0),
    losses: stats.losses + (match.won ? 0 : 1),
    currentStreak,
    bestStreak: Math.max(stats.bestStreak, currentStreak),
    clearances: stats.clearances + (match.clearedTable ? 1 : 0),
    totalStrokes: stats.totalStrokes + Math.max(0, Math.floor(match.strokes)),
    bestSingleGameStrokes,
    rankPoints: Math.max(0, Math.min(MAX_RANK_POINTS, safeStats.rankPoints + rankResult.rankDelta)),
    aiRankPointsEarnedDate: rankResult.aiEarnedDate,
    aiRankPointsEarned: rankResult.aiEarned,
    recentMatches: [{ ...recentMatch, rankDelta: rankResult.rankDelta }, ...stats.recentMatches].slice(0, MAX_RECENT_MATCHES),
  });
}

export function getDailyAiRankPointsEarned(stats: PlayerStats, dateKey: string): number {
  return stats.aiRankPointsEarnedDate === dateKey
    ? integerRange(stats.aiRankPointsEarned, 0, AI_DAILY_RANK_POINTS_LIMIT)
    : 0;
}

export function calculateRankPointResult(
  stats: PlayerStats,
  match: MatchResultInput,
): { rankDelta: number; performance: number; aiEarnedDate: string | null; aiEarned: number } {
  const dateKey = match.dateKey ?? match.playedAt.slice(0, 10);
  const earnedToday = getDailyAiRankPointsEarned(stats, dateKey);
  if (match.mode === 'challenge') {
    return { rankDelta: 0, performance: 0, aiEarnedDate: stats.aiRankPointsEarnedDate, aiEarned: stats.aiRankPointsEarned };
  }

  const rank = getRankProgress(stats.rankPoints);
  const matchLimit = RANKS[rank.rankIndex].matchLimit;
  const performance = matchPerformance(match);
  const rawDelta = match.won
    ? Math.max(1, Math.round(matchLimit * (0.5 + performance * 0.5)))
    : -Math.max(1, Math.round(matchLimit * (1 - performance * 0.75)));
  const dailyLimitedDelta = match.mode === 'ai' && rawDelta > 0
    ? Math.min(rawDelta, Math.max(0, AI_DAILY_RANK_POINTS_LIMIT - earnedToday))
    : rawDelta;
  const rankDelta = dailyLimitedDelta > 0
    ? Math.min(dailyLimitedDelta, Math.max(0, MAX_RANK_POINTS - stats.rankPoints))
    : dailyLimitedDelta;
  const nextAiEarned = match.mode === 'ai' && rankDelta > 0 ? earnedToday + rankDelta : earnedToday;

  return {
    rankDelta,
    performance,
    aiEarnedDate: match.mode === 'ai' ? dateKey : stats.aiRankPointsEarnedDate,
    aiEarned: match.mode === 'ai' ? nextAiEarned : stats.aiRankPointsEarned,
  };
}

export function summarizeStats(stats: PlayerStats): PlayerStatsSummary {
  const sanitized = sanitizePlayerStats(stats);
  return {
    ...sanitized,
    winRate: percentage(sanitized.wins, sanitized.totalGames),
    clearRate: percentage(sanitized.clearances, sanitized.totalGames),
    averageStrokes:
      sanitized.totalGames > 0
        ? roundToOne(sanitized.totalStrokes / sanitized.totalGames)
        : 0,
  };
}

export function getRankProgress(points: number): RankProgress {
  const safePoints = Math.max(0, Math.floor(points));
  const rankIndex = findRankIndex(safePoints);
  const rank = RANKS[rankIndex];
  const next = RANKS[rankIndex + 1] ?? null;
  const span = next ? next.floor - rank.floor : 1;
  const gained = next ? safePoints - rank.floor : span;

  return {
    rankName: rank.name,
    rankIndex,
    points: safePoints,
    floor: rank.floor,
    nextFloor: next?.floor ?? null,
    progressPercent: next ? Math.min(100, Math.round((gained / span) * 100)) : 100,
    pointsToNext: next ? Math.max(0, next.floor - safePoints) : 0,
  };
}

function findRankIndex(points: number): number {
  for (let index = RANKS.length - 1; index >= 0; index -= 1) {
    if (points >= RANKS[index].floor) {
      return index;
    }
  }
  return 0;
}

export function sanitizePlayerStats(value: Partial<PlayerStats> | null | undefined): PlayerStats {
  const base = createDefaultPlayerStats();
  if (!value || typeof value !== 'object') {
    return base;
  }

  return {
    totalGames: nonNegativeInteger(value.totalGames, base.totalGames),
    wins: nonNegativeInteger(value.wins, base.wins),
    losses: nonNegativeInteger(value.losses, base.losses),
    currentStreak: nonNegativeInteger(value.currentStreak, base.currentStreak),
    bestStreak: nonNegativeInteger(value.bestStreak, base.bestStreak),
    clearances: nonNegativeInteger(value.clearances, base.clearances),
    totalStrokes: nonNegativeInteger(value.totalStrokes, base.totalStrokes),
    bestSingleGameStrokes:
      typeof value.bestSingleGameStrokes === 'number' && Number.isFinite(value.bestSingleGameStrokes)
        ? Math.max(0, Math.floor(value.bestSingleGameStrokes))
        : null,
    rankPoints: integerRange(value.rankPoints, 0, MAX_RANK_POINTS),
    aiRankPointsEarnedDate: dateKey(value.aiRankPointsEarnedDate),
    aiRankPointsEarned: integerRange(value.aiRankPointsEarned, 0, AI_DAILY_RANK_POINTS_LIMIT),
    recentMatches: Array.isArray(value.recentMatches)
      ? value.recentMatches
        .map(sanitizeRecentMatchRecord)
        .filter((match): match is RecentMatchRecord => match !== null)
        .slice(0, MAX_RECENT_MATCHES)
      : [],
  };
}

function matchPerformance(match: MatchResultInput): number {
  const shots = (match.shotHistory ?? []).filter((shot) => (
    match.performancePlayerIndex === undefined || shot.playerIndex === match.performancePlayerIndex
  ));
  const shotCount = Math.max(1, shots.length || match.strokes);
  const pocketed = shots.reduce((total, shot) => total + shot.pocketedBallIds.length, 0);
  const fouls = shots.filter((shot) => shot.foulReason !== null).length;
  const targetStrokes = match.ruleset === 'nine-ball' ? 7 : 10;
  const potRate = Math.min(1, pocketed / shotCount);
  const efficiency = Math.min(1, targetStrokes / Math.max(1, match.strokes));
  const discipline = Math.max(0, 1 - fouls / shotCount);
  return Math.max(0, Math.min(1, potRate * 0.45 + efficiency * 0.35 + discipline * 0.2));
}

function dateKey(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function integerRange(value: unknown, minimum: number, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, Math.floor(value)))
    : minimum;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;
}

function percentage(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function roundToOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function sanitizeRecentMatchRecord(value: unknown): RecentMatchRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<RecentMatchRecord>;
  const validBase =
    typeof candidate.matchId === 'string' &&
    typeof candidate.playedAt === 'string' &&
    (candidate.mode === 'ai' ||
      candidate.mode === 'pvp' ||
      candidate.mode === 'challenge' ||
      candidate.mode === 'online') &&
    typeof candidate.opponentName === 'string' &&
    typeof candidate.won === 'boolean' &&
    typeof candidate.strokes === 'number' &&
    typeof candidate.clearedTable === 'boolean';

  if (!validBase) {
    return null;
  }

  const ruleset = candidate.ruleset === 'eight-ball' || candidate.ruleset === 'nine-ball'
    ? candidate.ruleset
    : undefined;
  const shotHistory = sanitizeShotHistory(candidate.shotHistory);
  const rankDelta = typeof candidate.rankDelta === 'number' && Number.isFinite(candidate.rankDelta)
    ? Math.trunc(candidate.rankDelta)
    : undefined;
  const coinDelta = typeof candidate.coinDelta === 'number' && Number.isFinite(candidate.coinDelta)
    ? Math.trunc(candidate.coinDelta)
    : undefined;
  const base = candidate as RecentMatchRecord;

  return {
    matchId: base.matchId,
    playedAt: base.playedAt,
    mode: base.mode,
    opponentName: base.opponentName,
    won: base.won,
    strokes: base.strokes,
    clearedTable: base.clearedTable,
    ...(ruleset ? { ruleset } : {}),
    ...(shotHistory.length > 0 ? { shotHistory } : {}),
    ...(coinDelta !== undefined ? { coinDelta } : {}),
    ...(rankDelta !== undefined ? { rankDelta } : {}),
  };
}
