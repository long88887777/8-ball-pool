import type { ChallengeLevel } from '../challenge/levels';
import type { ChallengeProgress } from '../challenge/progress';

export type ChallengeStarSummary = {
  earnedStars: number;
  totalStars: number;
  completedLevels: number;
  totalLevels: number;
};

export function summarizeChallengeStars(
  progress: ChallengeProgress,
  levels: Pick<ChallengeLevel, 'id'>[],
): ChallengeStarSummary {
  const earnedStars = levels.reduce((total, level) => {
    const result = progress.levels[String(level.id)];
    return total + clampStars(result?.stars);
  }, 0);
  const completedLevels = levels.filter((level) => clampStars(progress.levels[String(level.id)]?.stars) > 0).length;

  return {
    earnedStars,
    totalStars: levels.length * 3,
    completedLevels,
    totalLevels: levels.length,
  };
}

function clampStars(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(3, Math.floor(value)))
    : 0;
}
