import type { ChallengeLevel } from './levels';
import type { ChallengeProgress } from './progress';
import {
  CUE_CATALOG,
  getCueStyle,
  type CueStyle,
  type PlayerWallet,
} from '../economy';

export const ALL_STARS_COIN_REWARD = 888;

export type ChallengeRewardStatus = 'locked' | 'cue' | 'coins' | 'claimed';

export type ChallengeRewardResult = {
  wallet: PlayerWallet;
  claimed: boolean;
  cue?: CueStyle;
  coinsAwarded: number;
  reason?: 'not-eligible' | 'already-claimed' | 'invalid-cue';
};

export function hasAllChallengeStars(
  progress: ChallengeProgress,
  levels: Pick<ChallengeLevel, 'id'>[],
): boolean {
  return levels.length > 0 && levels.every((level) => {
    const stars = progress.levels[String(level.id)]?.stars;
    return typeof stars === 'number' && Number.isFinite(stars) && stars >= 3;
  });
}

export function getUnownedRareCues(wallet: PlayerWallet): CueStyle[] {
  return CUE_CATALOG.filter((cue) => (
    cue.rarity === 'rare' && !wallet.unlockedCueIds.includes(cue.id)
  ));
}

export function getChallengeRewardStatus(
  progress: ChallengeProgress,
  levels: Pick<ChallengeLevel, 'id'>[],
  wallet: PlayerWallet,
): ChallengeRewardStatus {
  if (wallet.challengeRewardClaimed) return 'claimed';
  if (!hasAllChallengeStars(progress, levels)) return 'locked';
  return getUnownedRareCues(wallet).length > 0 ? 'cue' : 'coins';
}

export function claimChallengeReward(
  progress: ChallengeProgress,
  levels: Pick<ChallengeLevel, 'id'>[],
  wallet: PlayerWallet,
  cueId?: string,
): ChallengeRewardResult {
  if (wallet.challengeRewardClaimed) {
    return { wallet, claimed: false, coinsAwarded: 0, reason: 'already-claimed' };
  }
  if (!hasAllChallengeStars(progress, levels)) {
    return { wallet, claimed: false, coinsAwarded: 0, reason: 'not-eligible' };
  }

  const availableCues = getUnownedRareCues(wallet);
  if (availableCues.length === 0) {
    return {
      wallet: {
        ...wallet,
        coins: wallet.coins + ALL_STARS_COIN_REWARD,
        challengeRewardClaimed: true,
      },
      claimed: true,
      coinsAwarded: ALL_STARS_COIN_REWARD,
    };
  }

  const selectedCue = availableCues.find((cue) => cue.id === cueId);
  if (!selectedCue) {
    return { wallet, claimed: false, coinsAwarded: 0, reason: 'invalid-cue' };
  }

  return {
    wallet: {
      ...wallet,
      unlockedCueIds: [...wallet.unlockedCueIds, selectedCue.id],
      cueDurability: {
        ...wallet.cueDurability,
        [selectedCue.id]: getCueStyle(selectedCue.id).durability,
      },
      challengeRewardClaimed: true,
    },
    claimed: true,
    cue: selectedCue,
    coinsAwarded: 0,
  };
}
