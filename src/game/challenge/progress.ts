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
  storage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export async function readProgressSupabase(
  supabase: SupabaseClient,
  storage: ProgressStorage = browserStorage(),
): Promise<ChallengeProgress> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return readProgress(storage);
  try {
    const { data, error } = await supabase
      .from('challenge_progress')
      .select('levels')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!error && data?.levels) {
      const parsed = data.levels as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        const progress = { levels: parsed as ChallengeProgress['levels'] };
        writeProgress(storage, progress);
        return progress;
      }
    }
  } catch {
    return readProgress(storage);
  }
  const localProgress = readProgress(storage);
  if (Object.keys(localProgress.levels).length > 0) {
    await writeProgressRow(supabase, user.id, localProgress);
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
  try {
    await supabase
      .from('challenge_progress')
      .upsert({ user_id: userId, levels: progress.levels, updated_at: new Date().toISOString() });
  } catch {
    // Local progress has already been saved.
  }
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
