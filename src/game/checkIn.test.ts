import { describe, expect, it } from 'vitest';
import { CUE_CATALOG, DEFAULT_PLAYER_WALLET } from './economy';
import {
  DAILY_CHECK_IN_REWARD,
  DUPLICATE_CUE_COMPENSATION,
  MAX_MONTHLY_MAKEUPS,
  applyDailyCheckIn,
  applyMakeupCheckIn,
  getCheckInClaimKey,
  getCheckInMilestones,
  openCheckInChest,
  recordCompletedMatchForMakeup,
} from './checkIn';

describe('monthly check-in rewards', () => {
  it('awards 66 coins once for the current date', () => {
    const first = applyDailyCheckIn({ ...DEFAULT_PLAYER_WALLET, coins: 100 }, '2026-09-10');
    const repeated = applyDailyCheckIn(first.wallet, '2026-09-10');

    expect(first.claimed).toBe(true);
    expect(first.wallet.coins).toBe(100 + DAILY_CHECK_IN_REWARD);
    expect(first.wallet.checkInDates).toEqual(['2026-09-10']);
    expect(repeated.claimed).toBe(false);
    expect(repeated.wallet).toBe(first.wallet);
  });

  it('grants one makeup card after every three completed matches', () => {
    const first = recordCompletedMatchForMakeup(DEFAULT_PLAYER_WALLET);
    const second = recordCompletedMatchForMakeup(first.wallet);
    const third = recordCompletedMatchForMakeup(second.wallet);

    expect(first.cardEarned).toBe(false);
    expect(second.wallet.makeupMatchProgress).toBe(2);
    expect(third.cardEarned).toBe(true);
    expect(third.wallet.makeupCards).toBe(1);
    expect(third.wallet.makeupMatchProgress).toBe(0);
  });

  it('allows one past-day makeup per day and no more than seven per month', () => {
    const wallet = { ...DEFAULT_PLAYER_WALLET, coins: 100, makeupCards: 8 };
    const first = applyMakeupCheckIn(wallet, {
      targetDateKey: '2026-09-01',
      currentDateKey: '2026-09-10',
    });
    const sameDay = applyMakeupCheckIn(first.wallet, {
      targetDateKey: '2026-09-02',
      currentDateKey: '2026-09-10',
    });
    const atMonthlyLimit = applyMakeupCheckIn({
      ...wallet,
      monthlyMakeupCounts: { '2026-09': MAX_MONTHLY_MAKEUPS },
    }, {
      targetDateKey: '2026-09-03',
      currentDateKey: '2026-09-11',
    });

    expect(first.claimed).toBe(true);
    expect(first.wallet.coins).toBe(100 + DAILY_CHECK_IN_REWARD);
    expect(first.wallet.makeupCards).toBe(7);
    expect(first.wallet.monthlyMakeupCounts['2026-09']).toBe(1);
    expect(sameDay).toMatchObject({ claimed: false, reason: 'daily-limit' });
    expect(atMonthlyLimit).toMatchObject({ claimed: false, reason: 'monthly-limit' });
  });

  it('unlocks exact-rarity 7, 14 and full-month chests', () => {
    expect(getCheckInMilestones('2026-09-10')).toEqual([
      { days: 7, rarity: 'rare' },
      { days: 14, rarity: 'epic' },
      { days: 30, rarity: 'legendary' },
    ]);

    const sevenDates = Array.from({ length: 7 }, (_, index) => `2026-09-${String(index + 1).padStart(2, '0')}`);
    const result = openCheckInChest({
      ...DEFAULT_PLAYER_WALLET,
      checkInDates: sevenDates,
    }, CUE_CATALOG, {
      dateKey: '2026-09-10',
      days: 7,
      random: () => 0,
    });

    expect(result.opened).toBe(true);
    expect(result.cue?.rarity).toBe('rare');
    expect(result.wallet.unlockedCueIds).toContain(result.cue?.id);
    expect(result.wallet.checkInRewardClaims).toContain(getCheckInClaimKey('2026-09-10', 7));
  });

  it('converts duplicate cues to tier-specific coins and cannot reopen the chest', () => {
    const rareCue = CUE_CATALOG.find((cue) => cue.rarity === 'rare')!;
    const wallet = {
      ...DEFAULT_PLAYER_WALLET,
      coins: 50,
      checkInDates: Array.from({ length: 7 }, (_, index) => `2026-09-${String(index + 1).padStart(2, '0')}`),
      unlockedCueIds: [...DEFAULT_PLAYER_WALLET.unlockedCueIds, rareCue.id],
      cueDurability: { ...DEFAULT_PLAYER_WALLET.cueDurability, [rareCue.id]: rareCue.durability },
    };
    const opened = openCheckInChest(wallet, [rareCue], {
      dateKey: '2026-09-10',
      days: 7,
      random: () => 0,
    });
    const repeated = openCheckInChest(opened.wallet, [rareCue], {
      dateKey: '2026-09-10',
      days: 7,
      random: () => 0,
    });

    expect(opened).toMatchObject({ opened: true, duplicate: true, coinsAwarded: DUPLICATE_CUE_COMPENSATION.rare });
    expect(opened.wallet.coins).toBe(50 + DUPLICATE_CUE_COMPENSATION.rare);
    expect(repeated).toMatchObject({ opened: false, reason: 'already-opened' });
  });

  it.each([
    ['rare', 7, 888],
    ['epic', 14, 2_666],
    ['legendary', 30, 6_666],
  ] as const)('converts a duplicate %s cue to %i coins', (rarity, days, compensation) => {
    const cue = CUE_CATALOG.find((entry) => entry.rarity === rarity)!;
    const wallet = {
      ...DEFAULT_PLAYER_WALLET,
      checkInDates: Array.from({ length: days }, (_, index) => `2026-09-${String(index + 1).padStart(2, '0')}`),
      unlockedCueIds: [...DEFAULT_PLAYER_WALLET.unlockedCueIds, cue.id],
    };

    const result = openCheckInChest(wallet, [cue], {
      dateKey: '2026-09-10',
      days,
      random: () => 0,
    });

    expect(result).toMatchObject({ opened: true, duplicate: true, coinsAwarded: compensation });
    expect(result.wallet.coins).toBe(DEFAULT_PLAYER_WALLET.coins + compensation);
  });

  it('rejects chest claims for an invalid date key', () => {
    expect(openCheckInChest(DEFAULT_PLAYER_WALLET, CUE_CATALOG, {
      dateKey: 'invalid',
      days: 0,
    })).toMatchObject({ opened: false, reason: 'invalid-milestone' });
  });
});
