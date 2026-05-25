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
  recentMatches: RecentMatchRecord[];
};

export type PlayerStatsSummary = PlayerStats & {
  winRate: number;
  clearRate: number;
  averageStrokes: number;
};

export type MatchResultInput = RecentMatchRecord;

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

export const DEFAULT_RANK_POINTS = 1000;
export const MAX_RECENT_MATCHES = 10;

const RANKS = [
  { name: 'Rookie', floor: 0 },
  { name: 'Bronze', floor: 900 },
  { name: 'Silver', floor: 1200 },
  { name: 'Gold', floor: 1500 },
  { name: 'Diamond', floor: 1800 },
  { name: 'Master', floor: 2100 },
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
  const rankDelta = match.won ? 18 : -18;
  const bestSingleGameStrokes =
    stats.bestSingleGameStrokes === null
      ? match.strokes
      : Math.min(stats.bestSingleGameStrokes, match.strokes);

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
    rankPoints: Math.max(0, stats.rankPoints + rankDelta),
    recentMatches: [match, ...stats.recentMatches].slice(0, MAX_RECENT_MATCHES),
  });
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
    rankPoints: nonNegativeInteger(value.rankPoints, base.rankPoints),
    recentMatches: Array.isArray(value.recentMatches)
      ? value.recentMatches
        .map(sanitizeRecentMatchRecord)
        .filter((match): match is RecentMatchRecord => match !== null)
        .slice(0, MAX_RECENT_MATCHES)
      : [],
  };
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

  return {
    matchId: candidate.matchId,
    playedAt: candidate.playedAt,
    mode: candidate.mode,
    opponentName: candidate.opponentName,
    won: candidate.won,
    strokes: candidate.strokes,
    clearedTable: candidate.clearedTable,
    ...(ruleset ? { ruleset } : {}),
    ...(shotHistory.length > 0 ? { shotHistory } : {}),
  };
}
