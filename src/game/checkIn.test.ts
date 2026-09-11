import { describe, expect, it } from 'vitest';
import { CUE_CATALOG, DEFAULT_PLAYER_WALLET, type PlayerWallet } from './economy';
import {
  CHECK_IN_CYCLE_LENGTH,
  DAILY_CHECK_IN_REWARD,
  DUPLICATE_CUE_COMPENSATION,
  MAX_CYCLE_MAKEUPS,
  applyDailyCheckIn,
  applyMakeupCheckIn,
  getCheckInClaimKey,
  getCheckInDayClaimKey,
  getCheckInMilestones,
  getSequentialCheckInState,
  openCheckInChest,
  recordCompletedMatchForMakeup,
} from './checkIn';

function walletAt(progress: number, options: { cycle?: number; makeupDays?: number[] } = {}): PlayerWallet {
  const cycle = options.cycle ?? 1;
  const makeupDays = new Set(options.makeupDays ?? []);
  return {
    ...DEFAULT_PLAYER_WALLET,
    checkInRewardClaims: Array.from({ length: progress }, (_, index) => {
      const day = index + 1;
      return getCheckInDayClaimKey(cycle, day, makeupDays.has(day) ? 'makeup' : 'daily');
    }),
  };
}

describe('sequential daily check-in rewards', () => {
  it('starts every player at day 1 and awards 66 coins once per natural day', () => {
    const legacyWallet = {
      ...DEFAULT_PLAYER_WALLET,
      coins: 100,
      lastCheckInDate: '2026-09-10',
      checkInDates: ['2026-09-10'],
      checkInRewardClaims: ['2026-09:7'],
    };
    const first = applyDailyCheckIn(legacyWallet, '2026-09-10');
    const repeated = applyDailyCheckIn(first.wallet, '2026-09-10');

    expect(first).toMatchObject({ claimed: true, day: 1, cycle: 1 });
    expect(first.wallet.coins).toBe(100 + DAILY_CHECK_IN_REWARD);
    expect(getSequentialCheckInState(first.wallet).progress).toBe(1);
    expect(repeated).toMatchObject({ claimed: false, reason: 'already-checked-in' });
  });

  it('advances to the next numbered slot without depending on month or day-of-month', () => {
    const first = applyDailyCheckIn(DEFAULT_PLAYER_WALLET, '2026-09-30');
    const second = applyDailyCheckIn(first.wallet, '2026-10-03');

    expect(first.day).toBe(1);
    expect(second.day).toBe(2);
    expect(getSequentialCheckInState(second.wallet)).toMatchObject({ cycle: 1, progress: 2, nextDay: 3 });
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

  it('uses a makeup card to advance one extra slot, once per day and at most seven times per cycle', () => {
    const afterDaily = applyDailyCheckIn({ ...DEFAULT_PLAYER_WALLET, coins: 100, makeupCards: 8 }, '2026-09-10');
    const first = applyMakeupCheckIn(afterDaily.wallet, '2026-09-10');
    const sameDay = applyMakeupCheckIn(first.wallet, '2026-09-10');
    const atCycleLimit = applyMakeupCheckIn({
      ...walletAt(8, { makeupDays: [2, 3, 4, 5, 6, 7, 8] }),
      lastCheckInDate: '2026-09-11',
      makeupCards: 1,
    }, '2026-09-11');

    expect(first).toMatchObject({ claimed: true, day: 2, cycle: 1 });
    expect(first.wallet.coins).toBe(100 + DAILY_CHECK_IN_REWARD * 2);
    expect(first.wallet.makeupCards).toBe(7);
    expect(sameDay).toMatchObject({ claimed: false, reason: 'daily-limit' });
    expect(atCycleLimit).toMatchObject({ claimed: false, reason: 'cycle-limit' });
    expect(MAX_CYCLE_MAKEUPS).toBe(7);
  });

  it('uses fixed day 7, 14 and 30 milestone chests in every cycle', () => {
    expect(getCheckInMilestones()).toEqual([
      { days: 7, rarity: 'rare' },
      { days: 14, rarity: 'epic' },
      { days: CHECK_IN_CYCLE_LENGTH, rarity: 'legendary' },
    ]);

    const result = openCheckInChest(walletAt(7), CUE_CATALOG, {
      cycle: 1,
      days: 7,
      random: () => 0,
    });

    expect(result.opened).toBe(true);
    expect(result.cue?.rarity).toBe('rare');
    expect(result.wallet.unlockedCueIds).toContain(result.cue?.id);
    expect(result.wallet.checkInRewardClaims).toContain(getCheckInClaimKey(1, 7));
  });

  it('turns the seventh sequential sign-in into an immediately openable chest node', () => {
    const signed = applyDailyCheckIn({
      ...walletAt(6),
      lastCheckInDate: '2026-09-09',
    }, '2026-09-10');
    const opened = openCheckInChest(signed.wallet, CUE_CATALOG, {
      cycle: 1,
      days: 7,
      random: () => 0,
    });

    expect(signed).toMatchObject({ claimed: true, day: 7, cycle: 1 });
    expect(opened).toMatchObject({ opened: true, cue: { rarity: 'rare' } });
  });

  it('converts duplicate cues to tier-specific coins and cannot reopen a chest', () => {
    const rareCue = CUE_CATALOG.find((cue) => cue.rarity === 'rare')!;
    const wallet = {
      ...walletAt(7),
      coins: 50,
      unlockedCueIds: [...DEFAULT_PLAYER_WALLET.unlockedCueIds, rareCue.id],
      cueDurability: { ...DEFAULT_PLAYER_WALLET.cueDurability, [rareCue.id]: rareCue.durability },
    };
    const opened = openCheckInChest(wallet, [rareCue], { cycle: 1, days: 7, random: () => 0 });
    const repeated = openCheckInChest(opened.wallet, [rareCue], { cycle: 1, days: 7, random: () => 0 });

    expect(opened).toMatchObject({ opened: true, duplicate: true, coinsAwarded: DUPLICATE_CUE_COMPENSATION.rare });
    expect(opened.wallet.coins).toBe(50 + DUPLICATE_CUE_COMPENSATION.rare);
    expect(repeated).toMatchObject({ opened: false, reason: 'already-opened' });
  });

  it('starts a new cycle at day 1 on a later date after all three chests are opened', () => {
    const completed = walletAt(30);
    const wallet = {
      ...completed,
      lastCheckInDate: '2026-09-30',
      checkInRewardClaims: [
        ...completed.checkInRewardClaims,
        getCheckInClaimKey(1, 7),
        getCheckInClaimKey(1, 14),
        getCheckInClaimKey(1, 30),
      ],
    };
    const next = applyDailyCheckIn(wallet, '2026-10-01');

    expect(next).toMatchObject({ claimed: true, cycle: 2, day: 1 });
    expect(getSequentialCheckInState(next.wallet)).toMatchObject({ cycle: 2, progress: 1, nextDay: 2 });
  });

  it('does not discard unopened milestone rewards when a cycle is complete', () => {
    const result = applyDailyCheckIn({
      ...walletAt(30),
      lastCheckInDate: '2026-09-30',
    }, '2026-10-01');

    expect(result).toMatchObject({ claimed: false, reason: 'pending-reward' });
  });
});
