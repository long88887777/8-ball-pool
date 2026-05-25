import type { GameRuleset } from './gameRules';

export type ShotHistoryEntry = {
  playerIndex: 0 | 1;
  ruleset: GameRuleset;
  powerPercent: number;
  spin: { x: number; y: number };
  pocketedBallIds: number[];
  foulReason: string | null;
  message: string;
};

export const MAX_SHOT_HISTORY_ENTRIES = 80;

export function sanitizeShotHistory(value: unknown): ShotHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(sanitizeShotHistoryEntry)
    .filter((entry): entry is ShotHistoryEntry => entry !== null)
    .slice(-MAX_SHOT_HISTORY_ENTRIES);
}

export function appendShotHistoryEntry(
  history: ShotHistoryEntry[],
  entry: ShotHistoryEntry,
): ShotHistoryEntry[] {
  const sanitizedEntry = sanitizeShotHistoryEntry(entry);
  if (!sanitizedEntry) {
    return sanitizeShotHistory(history);
  }
  return [...sanitizeShotHistory(history), sanitizedEntry].slice(-MAX_SHOT_HISTORY_ENTRIES);
}

function sanitizeShotHistoryEntry(value: unknown): ShotHistoryEntry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<ShotHistoryEntry>;
  if (candidate.playerIndex !== 0 && candidate.playerIndex !== 1) {
    return null;
  }
  if (candidate.ruleset !== 'eight-ball' && candidate.ruleset !== 'nine-ball') {
    return null;
  }
  if (!candidate.spin || typeof candidate.spin !== 'object') {
    return null;
  }
  if (!Array.isArray(candidate.pocketedBallIds)) {
    return null;
  }
  if (candidate.foulReason !== null && typeof candidate.foulReason !== 'string') {
    return null;
  }
  if (typeof candidate.message !== 'string') {
    return null;
  }

  return {
    playerIndex: candidate.playerIndex,
    ruleset: candidate.ruleset,
    powerPercent: clampInteger(candidate.powerPercent, 0, 100),
    spin: {
      x: clampFinite(candidate.spin.x, -1, 1),
      y: clampFinite(candidate.spin.y, -1, 1),
    },
    pocketedBallIds: candidate.pocketedBallIds
      .filter((ballId): ballId is number => Number.isInteger(ballId) && ballId >= 1 && ballId <= 15),
    foulReason: candidate.foulReason,
    message: candidate.message,
  };
}

function clampInteger(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampFinite(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(min, Math.min(max, value));
}
