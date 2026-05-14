import type { SupabaseClient } from '@supabase/supabase-js';

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

export async function readProgressSupabase(supabase: SupabaseClient): Promise<ChallengeProgress> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return readProgress(localStorage);
  const { data } = await supabase
    .from('challenge_progress')
    .select('levels')
    .eq('user_id', user.id)
    .maybeSingle();
  if (data?.levels) {
    const parsed = data.levels as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      return { levels: parsed as ChallengeProgress['levels'] };
    }
  }
  return { levels: {} };
}

export async function writeProgressSupabase(
  supabase: SupabaseClient,
  progress: ChallengeProgress,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    writeProgress(localStorage, progress);
    return;
  }
  await supabase
    .from('challenge_progress')
    .upsert({ user_id: user.id, levels: progress.levels, updated_at: new Date().toISOString() });
}

export function isLevelUnlocked(progress: ChallengeProgress, levelId: number): boolean {
  if (levelId === 1) return true;
  const prev = progress.levels[String(levelId - 1)];
  return prev !== undefined && prev.stars >= 1;
}
