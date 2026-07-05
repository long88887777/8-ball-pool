import type { SupabaseClient } from '@supabase/supabase-js';

const STORAGE_KEY = 'pool.challenge.progress';

type ProgressStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type LevelResult = {
  stars: number;
  bestShots: number;
};

export type ChallengeProgress = {
  levels: Record<string, LevelResult>;
};

export function readProgress(storage: Pick<ProgressStorage, 'getItem'>): ChallengeProgress {
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

export function writeProgress(storage: Pick<ProgressStorage, 'setItem'>, progress: ChallengeProgress): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Keep remote sync usable if browser storage is unavailable.
  }
}

export async function readProgressSupabase(
  supabase: SupabaseClient,
  storage: ProgressStorage = browserStorage(),
): Promise<ChallengeProgress> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return readProgress(storage);
  const localProgress = readProgress(storage);
  try {
    const { data, error } = await supabase
      .from('challenge_progress')
      .select('levels')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) return localProgress;
    if (!error && data?.levels) {
      const parsed = data.levels as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        const remoteProgress = { levels: parsed as ChallengeProgress['levels'] };
        const progress = mergeProgress(remoteProgress, localProgress);
        writeProgress(storage, progress);
        if (!sameProgress(remoteProgress, progress)) {
          try {
            await writeProgressRow(supabase, user.id, progress);
          } catch {
            // Reading should still succeed when opportunistic sync-back fails.
          }
        }
        return progress;
      }
    }
  } catch {
    return readProgress(storage);
  }
  if (Object.keys(localProgress.levels).length > 0) {
    try {
      await writeProgressRow(supabase, user.id, localProgress);
    } catch {
      // Reading should still return the local fallback if remote sync fails.
    }
  }
  return localProgress;
}

export async function writeProgressSupabase(
  supabase: SupabaseClient,
  progress: ChallengeProgress,
  storage: ProgressStorage = browserStorage(),
): Promise<void> {
  writeProgress(storage, progress);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await writeProgressRow(supabase, user.id, progress);
}

async function writeProgressRow(
  supabase: SupabaseClient,
  userId: string,
  progress: ChallengeProgress,
): Promise<void> {
  const { error } = await supabase
    .from('challenge_progress')
    .upsert(
      { user_id: userId, levels: progress.levels, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) {
    throw error;
  }
}

function mergeProgress(remote: ChallengeProgress, local: ChallengeProgress): ChallengeProgress {
  const levels: ChallengeProgress['levels'] = { ...remote.levels };
  for (const [levelId, localResult] of Object.entries(local.levels)) {
    const remoteResult = levels[levelId];
    levels[levelId] = remoteResult
      ? {
          stars: Math.max(remoteResult.stars, localResult.stars),
          bestShots: Math.min(remoteResult.bestShots, localResult.bestShots),
        }
      : localResult;
  }
  return { levels };
}

function sameProgress(left: ChallengeProgress, right: ChallengeProgress): boolean {
  const leftKeys = Object.keys(left.levels);
  const rightKeys = Object.keys(right.levels);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => {
    const leftResult = left.levels[key];
    const rightResult = right.levels[key];
    return rightResult !== undefined
      && leftResult.stars === rightResult.stars
      && leftResult.bestShots === rightResult.bestShots;
  });
}

function browserStorage(): ProgressStorage {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {
    // Browsers can expose localStorage but reject access in strict privacy modes.
  }
  return {
    getItem: () => null,
    setItem: () => undefined,
  };
}

export function isLevelUnlocked(progress: ChallengeProgress, levelId: number): boolean {
  if (levelId === 1) return true;
  const prev = progress.levels[String(levelId - 1)];
  return prev !== undefined && prev.stars >= 1;
}
