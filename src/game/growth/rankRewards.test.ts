import { describe, expect, it } from 'vitest';
import { CUE_CATALOG, DEFAULT_PLAYER_WALLET } from '../economy';
import { claimRankReward, getRankRewardStatus, getUnownedRankRewardCues } from './rankRewards';

describe('rank milestone rewards', () => {
  it('locks rewards below their rank and allows one coin claim after reaching it', () => {
    expect(getRankRewardStatus(299, DEFAULT_PLAYER_WALLET, 'C-')).toBe('locked');
    const result = claimRankReward(300, DEFAULT_PLAYER_WALLET, 'C-', { type: 'coins' });
    expect(result.wallet.coins).toBe(DEFAULT_PLAYER_WALLET.coins + 888);
    expect(result.wallet.rankRewardClaims).toEqual(['C-']);
    expect(claimRankReward(300, result.wallet, 'C-', { type: 'coins' }).reason).toBe('already-claimed');
  });

  it('grants a selected unowned cue at full durability', () => {
    const cue = getUnownedRankRewardCues(DEFAULT_PLAYER_WALLET, 'A-')[0];
    const result = claimRankReward(1_800, DEFAULT_PLAYER_WALLET, 'A-', { type: 'cue', cueId: cue.id });
    expect(result.cue?.rarity).toBe('epic');
    expect(result.wallet.unlockedCueIds).toContain(cue.id);
    expect(result.wallet.cueDurability[cue.id]).toBe(cue.durability);
  });

  it('requires coins when every cue of the chest rarity is owned', () => {
    const legendaryIds = CUE_CATALOG.filter((cue) => cue.rarity === 'legendary').map((cue) => cue.id);
    const wallet = { ...DEFAULT_PLAYER_WALLET, unlockedCueIds: [...DEFAULT_PLAYER_WALLET.unlockedCueIds, ...legendaryIds] };
    expect(getUnownedRankRewardCues(wallet, 'SSS')).toEqual([]);
    expect(claimRankReward(4_100, wallet, 'SSS', { type: 'cue', cueId: legendaryIds[0] }).reason).toBe('invalid-choice');
    expect(claimRankReward(4_100, wallet, 'SSS', { type: 'coins' }).coinsAwarded).toBe(12_888);
  });
});
