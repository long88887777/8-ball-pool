const STORAGE_KEY = 'pool.challenge.progress';

export type LevelResult = {
  stars: number;
  bestShots: number;
};

export type ChallengeProgress = {
  levels: Record<string, LevelResult>;
};

export function readProgress(storage: Pick<Storage, 'getItem'>): ChallengeProgress {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { levels: {} };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.levels) {
      return parsed as ChallengeProgress;
    }
    return { levels: {} };
  } catch {
    return { levels: {} };
  }
}

export function writeProgress(storage: Pick<Storage, 'setItem'>, progress: ChallengeProgress): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function isLevelUnlocked(progress: ChallengeProgress, levelId: number): boolean {
  if (levelId === 1) return true;
  const prev = progress.levels[String(levelId - 1)];
  return prev !== undefined && prev.stars >= 1;
}
