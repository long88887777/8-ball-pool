import type { CueRarity, CueStyle, PlayerWallet } from './economy';

export type CheckInRarity = Exclude<CueRarity, 'starter'>;

export type CheckInMilestone = {
  days: number;
  rarity: CheckInRarity;
};

export const DAILY_CHECK_IN_REWARD = 66;
export const MATCHES_PER_MAKEUP_CARD = 3;
export const MAX_MONTHLY_MAKEUPS = 7;
export const DUPLICATE_CUE_COMPENSATION: Record<CheckInRarity, number> = {
  rare: 888,
  epic: 2_666,
  legendary: 6_666,
};

export function getCheckInMilestones(dateKey: string): CheckInMilestone[] {
  return [
    { days: 7, rarity: 'rare' },
    { days: 14, rarity: 'epic' },
    { days: daysInMonth(dateKey), rarity: 'legendary' },
  ];
}

export function getMonthCheckInDates(wallet: PlayerWallet, dateKey: string): string[] {
  const monthKey = getMonthKey(dateKey);
  if (!monthKey) return [];
  return wallet.checkInDates.filter((entry) => entry.startsWith(`${monthKey}-`));
}

export function getMonthlyMakeupCount(wallet: PlayerWallet, dateKey: string): number {
  const monthKey = getMonthKey(dateKey);
  return monthKey ? wallet.monthlyMakeupCounts[monthKey] ?? 0 : 0;
}

export function applyDailyCheckIn(
  wallet: PlayerWallet,
  dateKey: string,
): { wallet: PlayerWallet; claimed: boolean; reason?: 'already-checked-in' | 'invalid-date' } {
  if (!isDateKey(dateKey)) {
    return { wallet, claimed: false, reason: 'invalid-date' };
  }
  if (wallet.checkInDates.includes(dateKey)) {
    return { wallet, claimed: false, reason: 'already-checked-in' };
  }

  return {
    wallet: {
      ...wallet,
      coins: wallet.coins + DAILY_CHECK_IN_REWARD,
      lastCheckInDate: dateKey,
      checkInDates: [...wallet.checkInDates, dateKey].sort(),
    },
    claimed: true,
  };
}

export function applyMakeupCheckIn(
  wallet: PlayerWallet,
  options: { targetDateKey: string; currentDateKey: string },
): {
  wallet: PlayerWallet;
  claimed: boolean;
  reason?: 'invalid-date' | 'not-past-day' | 'outside-current-month' | 'already-checked-in' | 'no-card' | 'daily-limit' | 'monthly-limit';
} {
  const { targetDateKey, currentDateKey } = options;
  if (!isDateKey(targetDateKey) || !isDateKey(currentDateKey)) {
    return { wallet, claimed: false, reason: 'invalid-date' };
  }
  if (targetDateKey >= currentDateKey) {
    return { wallet, claimed: false, reason: 'not-past-day' };
  }
  const currentMonthKey = getMonthKey(currentDateKey)!;
  if (getMonthKey(targetDateKey) !== currentMonthKey) {
    return { wallet, claimed: false, reason: 'outside-current-month' };
  }
  if (wallet.checkInDates.includes(targetDateKey)) {
    return { wallet, claimed: false, reason: 'already-checked-in' };
  }
  if (wallet.makeupCards <= 0) {
    return { wallet, claimed: false, reason: 'no-card' };
  }
  if (wallet.lastMakeupDate === currentDateKey) {
    return { wallet, claimed: false, reason: 'daily-limit' };
  }
  const monthlyCount = getMonthlyMakeupCount(wallet, currentDateKey);
  if (monthlyCount >= MAX_MONTHLY_MAKEUPS) {
    return { wallet, claimed: false, reason: 'monthly-limit' };
  }

  return {
    wallet: {
      ...wallet,
      coins: wallet.coins + DAILY_CHECK_IN_REWARD,
      checkInDates: [...wallet.checkInDates, targetDateKey].sort(),
      makeupCards: wallet.makeupCards - 1,
      lastMakeupDate: currentDateKey,
      monthlyMakeupCounts: {
        ...wallet.monthlyMakeupCounts,
        [currentMonthKey]: monthlyCount + 1,
      },
    },
    claimed: true,
  };
}

export function recordCompletedMatchForMakeup(wallet: PlayerWallet): {
  wallet: PlayerWallet;
  cardEarned: boolean;
} {
  const progress = wallet.makeupMatchProgress + 1;
  if (progress < MATCHES_PER_MAKEUP_CARD) {
    return {
      wallet: { ...wallet, makeupMatchProgress: progress },
      cardEarned: false,
    };
  }

  return {
    wallet: {
      ...wallet,
      makeupCards: wallet.makeupCards + 1,
      makeupMatchProgress: 0,
    },
    cardEarned: true,
  };
}

export function getCheckInClaimKey(dateKey: string, days: number): string {
  return `${getMonthKey(dateKey) ?? 'invalid'}:${days}`;
}

export function openCheckInChest(
  wallet: PlayerWallet,
  cueCatalog: CueStyle[],
  options: { dateKey: string; days: number; random?: () => number },
): {
  wallet: PlayerWallet;
  opened: boolean;
  cue?: CueStyle;
  duplicate?: boolean;
  coinsAwarded: number;
  reason?: 'invalid-milestone' | 'locked' | 'already-opened' | 'empty-pool';
} {
  if (daysInMonth(options.dateKey) === 0) {
    return { wallet, opened: false, coinsAwarded: 0, reason: 'invalid-milestone' };
  }
  const milestone = getCheckInMilestones(options.dateKey).find((entry) => entry.days === options.days);
  if (!milestone) {
    return { wallet, opened: false, coinsAwarded: 0, reason: 'invalid-milestone' };
  }
  if (getMonthCheckInDates(wallet, options.dateKey).length < milestone.days) {
    return { wallet, opened: false, coinsAwarded: 0, reason: 'locked' };
  }
  const claimKey = getCheckInClaimKey(options.dateKey, milestone.days);
  if (wallet.checkInRewardClaims.includes(claimKey)) {
    return { wallet, opened: false, coinsAwarded: 0, reason: 'already-opened' };
  }

  const candidates = cueCatalog.filter((cue) => cue.rarity === milestone.rarity);
  if (candidates.length === 0) {
    return { wallet, opened: false, coinsAwarded: 0, reason: 'empty-pool' };
  }
  const cue = candidates[randomIndex(candidates.length, options.random ?? Math.random)];
  const duplicate = wallet.unlockedCueIds.includes(cue.id);
  const coinsAwarded = duplicate ? DUPLICATE_CUE_COMPENSATION[milestone.rarity] : 0;
  const unlockedCueIds = duplicate ? wallet.unlockedCueIds : [...wallet.unlockedCueIds, cue.id];
  const cueDurability = duplicate
    ? wallet.cueDurability
    : { ...wallet.cueDurability, [cue.id]: cue.durability };

  return {
    wallet: {
      ...wallet,
      coins: wallet.coins + coinsAwarded,
      unlockedCueIds,
      cueDurability,
      checkInRewardClaims: [...wallet.checkInRewardClaims, claimKey],
    },
    opened: true,
    cue,
    duplicate,
    coinsAwarded,
  };
}

export function daysInMonth(dateKey: string): number {
  const monthKey = getMonthKey(dateKey);
  if (!monthKey) return 0;
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getMonthKey(dateKey: string): string | null {
  return isDateKey(dateKey) ? dateKey.slice(0, 7) : null;
}

function isDateKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function randomIndex(length: number, random: () => number): number {
  const value = random();
  const normalized = Number.isFinite(value) ? Math.max(0, Math.min(0.9999999999999999, value)) : 0;
  return Math.floor(normalized * length);
}
