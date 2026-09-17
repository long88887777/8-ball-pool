import {
  CUE_CATALOG,
  getCueStyle,
  type CueRarity,
  type CueStyle,
  type PlayerWallet,
} from '../economy';

export type RankRewardId = 'C-' | 'B-' | 'A-' | 'S' | 'SS' | 'SSS';

export type RankRewardDefinition = {
  id: RankRewardId;
  floor: number;
  coins: number;
  cueRarity?: Extract<CueRarity, 'rare' | 'epic' | 'legendary'>;
  quality: 'rare' | 'epic' | 'legendary';
};

export const RANK_REWARDS: readonly RankRewardDefinition[] = [
  { id: 'C-', floor: 300, coins: 888, quality: 'rare' },
  { id: 'B-', floor: 900, coins: 1_888, cueRarity: 'rare', quality: 'rare' },
  { id: 'A-', floor: 1_800, coins: 2_888, cueRarity: 'epic', quality: 'epic' },
  { id: 'S', floor: 3_000, coins: 5_888, quality: 'epic' },
  { id: 'SS', floor: 3_500, coins: 8_888, quality: 'legendary' },
  { id: 'SSS', floor: 4_100, coins: 12_888, cueRarity: 'legendary', quality: 'legendary' },
] as const;

export type RankRewardStatus = 'locked' | 'ready' | 'claimed';

export function getRankRewardStatus(
  rankPoints: number,
  wallet: PlayerWallet,
  rewardId: RankRewardId,
): RankRewardStatus {
  if (wallet.rankRewardClaims.includes(rewardId)) return 'claimed';
  const reward = RANK_REWARDS.find((item) => item.id === rewardId);
  return reward && rankPoints >= reward.floor ? 'ready' : 'locked';
}

export function getUnownedRankRewardCues(wallet: PlayerWallet, rewardId: RankRewardId): CueStyle[] {
  const rarity = RANK_REWARDS.find((item) => item.id === rewardId)?.cueRarity;
  if (!rarity) return [];
  return CUE_CATALOG.filter((cue) => cue.rarity === rarity && !wallet.unlockedCueIds.includes(cue.id));
}

export function claimRankReward(
  rankPoints: number,
  wallet: PlayerWallet,
  rewardId: RankRewardId,
  selection: { type: 'coins' } | { type: 'cue'; cueId: string },
): { wallet: PlayerWallet; claimed: boolean; coinsAwarded: number; cue?: CueStyle; reason?: 'locked' | 'already-claimed' | 'invalid-choice' } {
  const reward = RANK_REWARDS.find((item) => item.id === rewardId);
  if (!reward || rankPoints < reward.floor) {
    return { wallet, claimed: false, coinsAwarded: 0, reason: 'locked' };
  }
  if (wallet.rankRewardClaims.includes(rewardId)) {
    return { wallet, claimed: false, coinsAwarded: 0, reason: 'already-claimed' };
  }

  if (selection.type === 'cue') {
    const cue = getUnownedRankRewardCues(wallet, rewardId).find((item) => item.id === selection.cueId);
    if (!cue) return { wallet, claimed: false, coinsAwarded: 0, reason: 'invalid-choice' };
    return {
      wallet: {
        ...wallet,
        unlockedCueIds: [...wallet.unlockedCueIds, cue.id],
        cueDurability: { ...wallet.cueDurability, [cue.id]: getCueStyle(cue.id).durability },
        rankRewardClaims: [...wallet.rankRewardClaims, rewardId],
      },
      claimed: true,
      coinsAwarded: 0,
      cue,
    };
  }

  return {
    wallet: {
      ...wallet,
      coins: wallet.coins + reward.coins,
      rankRewardClaims: [...wallet.rankRewardClaims, rewardId],
    },
    claimed: true,
    coinsAwarded: reward.coins,
  };
}
