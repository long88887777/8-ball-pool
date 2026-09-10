import { describe, expect, it } from 'vitest';
import { CUE_CATALOG, DEFAULT_PLAYER_WALLET } from '../economy';
import { CHALLENGE_LEVELS } from './levels';
import type { ChallengeProgress } from './progress';
import {
  ALL_STARS_COIN_REWARD,
  claimChallengeReward,
  getChallengeRewardStatus,
  getUnownedRareCues,
} from './reward';

function fullStars(): ChallengeProgress {
  return {
    levels: Object.fromEntries(CHALLENGE_LEVELS.map((level) => [
      String(level.id),
      { stars: 3, bestShots: 1 },
    ])),
  };
}

describe('all-stars challenge reward', () => {
  it('stays locked until every challenge level has three stars', () => {
    const progress = fullStars();
    progress.levels['2'] = { stars: 2, bestShots: 2 };

    expect(getChallengeRewardStatus(progress, CHALLENGE_LEVELS, DEFAULT_PLAYER_WALLET)).toBe('locked');
    expect(claimChallengeReward(progress, CHALLENGE_LEVELS, DEFAULT_PLAYER_WALLET, 'moonlit-kitsune')).toMatchObject({
      claimed: false,
      reason: 'not-eligible',
    });
  });

  it('lets the player choose one unowned rare cue and grants full durability once', () => {
    const selected = getUnownedRareCues(DEFAULT_PLAYER_WALLET)[1];
    const result = claimChallengeReward(fullStars(), CHALLENGE_LEVELS, DEFAULT_PLAYER_WALLET, selected.id);
    const repeated = claimChallengeReward(fullStars(), CHALLENGE_LEVELS, result.wallet, selected.id);

    expect(result.claimed).toBe(true);
    expect(result.cue?.id).toBe(selected.id);
    expect(result.wallet.unlockedCueIds).toContain(selected.id);
    expect(result.wallet.cueDurability[selected.id]).toBe(selected.durability);
    expect(result.wallet.challengeRewardClaimed).toBe(true);
    expect(repeated).toMatchObject({ claimed: false, reason: 'already-claimed' });
  });

  it('rejects an owned, non-rare, or unknown cue selection', () => {
    const result = claimChallengeReward(
      fullStars(),
      CHALLENGE_LEVELS,
      DEFAULT_PLAYER_WALLET,
      DEFAULT_PLAYER_WALLET.equippedCueId,
    );

    expect(result).toMatchObject({ claimed: false, reason: 'invalid-cue' });
  });

  it('awards 888 coins when every rare cue is already owned', () => {
    const rareIds = CUE_CATALOG.filter((cue) => cue.rarity === 'rare').map((cue) => cue.id);
    const wallet = {
      ...DEFAULT_PLAYER_WALLET,
      coins: 12,
      unlockedCueIds: [...DEFAULT_PLAYER_WALLET.unlockedCueIds, ...rareIds],
    };
    const result = claimChallengeReward(fullStars(), CHALLENGE_LEVELS, wallet);

    expect(getChallengeRewardStatus(fullStars(), CHALLENGE_LEVELS, wallet)).toBe('coins');
    expect(result.coinsAwarded).toBe(ALL_STARS_COIN_REWARD);
    expect(result.wallet.coins).toBe(12 + ALL_STARS_COIN_REWARD);
    expect(result.wallet.challengeRewardClaimed).toBe(true);
  });
});
