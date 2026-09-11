import type { CueRarity, CueStyle, PlayerWallet } from './economy';

export type CheckInRarity = Exclude<CueRarity, 'starter'>;

export type CheckInMilestone = {
  days: number;
  rarity: CheckInRarity;
};

export type SequentialCheckInState = {
  cycle: number;
  progress: number;
  nextDay: number;
  makeupCount: number;
};

export const DAILY_CHECK_IN_REWARD = 66;
export const CHECK_IN_CYCLE_LENGTH = 30;
export const MATCHES_PER_MAKEUP_CARD = 3;
export const MAX_CYCLE_MAKEUPS = 7;
export const DUPLICATE_CUE_COMPENSATION: Record<CheckInRarity, number> = {
  rare: 888,
  epic: 2_666,
  legendary: 6_666,
};

const CHECK_IN_MARKER_PREFIX = 'daily-v2';
const CHECK_IN_MILESTONES: CheckInMilestone[] = [
  { days: 7, rarity: 'rare' },
  { days: 14, rarity: 'epic' },
  { days: CHECK_IN_CYCLE_LENGTH, rarity: 'legendary' },
];

export function getCheckInMilestones(): CheckInMilestone[] {
  return CHECK_IN_MILESTONES.map((milestone) => ({ ...milestone }));
}

export function getCheckInDayClaimKey(cycle: number, day: number, source: 'daily' | 'makeup'): string {
  return `${CHECK_IN_MARKER_PREFIX}:${cycle}:day:${day}:${source}`;
}

export function getCheckInClaimKey(cycle: number, days: number): string {
  return `${CHECK_IN_MARKER_PREFIX}:${cycle}:reward:${days}`;
}

export function getSequentialCheckInState(wallet: PlayerWallet): SequentialCheckInState {
  const dayClaims = wallet.checkInRewardClaims.flatMap((entry) => {
    const match = /^daily-v2:(\d+):day:(\d+):(daily|makeup)$/.exec(entry);
    if (!match) return [];
    return [{ cycle: Number(match[1]), day: Number(match[2]), source: match[3] as 'daily' | 'makeup' }];
  });
  const rewardCycles = wallet.checkInRewardClaims.flatMap((entry) => {
    const match = /^daily-v2:(\d+):reward:(7|14|30)$/.exec(entry);
    return match ? [Number(match[1])] : [];
  });
  const cycle = Math.max(1, ...dayClaims.map((claim) => claim.cycle), ...rewardCycles);
  const cycleClaims = dayClaims.filter((claim) => claim.cycle === cycle);
  const claimedDays = new Set(cycleClaims.map((claim) => claim.day));
  let progress = 0;
  while (progress < CHECK_IN_CYCLE_LENGTH && claimedDays.has(progress + 1)) progress += 1;
  const makeupCount = cycleClaims.filter((claim) => claim.source === 'makeup' && claim.day <= progress).length;

  return {
    cycle,
    progress,
    nextDay: progress >= CHECK_IN_CYCLE_LENGTH ? 1 : progress + 1,
    makeupCount,
  };
}

export function applyDailyCheckIn(
  wallet: PlayerWallet,
  dateKey: string,
): {
  wallet: PlayerWallet;
  claimed: boolean;
  day?: number;
  cycle?: number;
  reason?: 'already-checked-in' | 'invalid-date' | 'pending-reward';
} {
  if (!isDateKey(dateKey)) {
    return { wallet, claimed: false, reason: 'invalid-date' };
  }

  const state = getSequentialCheckInState(wallet);
  const hasSequentialClaims = wallet.checkInRewardClaims.some((entry) => entry.startsWith(`${CHECK_IN_MARKER_PREFIX}:`));
  if (hasSequentialClaims && wallet.lastCheckInDate === dateKey) {
    return { wallet, claimed: false, reason: 'already-checked-in' };
  }

  let cycle = state.cycle;
  let day = state.nextDay;
  if (state.progress >= CHECK_IN_CYCLE_LENGTH) {
    const hasPendingReward = CHECK_IN_MILESTONES.some((milestone) => (
      !wallet.checkInRewardClaims.includes(getCheckInClaimKey(state.cycle, milestone.days))
    ));
    if (hasPendingReward) {
      return { wallet, claimed: false, reason: 'pending-reward' };
    }
    cycle += 1;
    day = 1;
  }

  return {
    wallet: {
      ...wallet,
      coins: wallet.coins + DAILY_CHECK_IN_REWARD,
      lastCheckInDate: dateKey,
      checkInDates: Array.from(new Set([...wallet.checkInDates, dateKey])).sort(),
      checkInRewardClaims: [
        ...wallet.checkInRewardClaims,
        getCheckInDayClaimKey(cycle, day, 'daily'),
      ],
    },
    claimed: true,
    day,
    cycle,
  };
}

export function applyMakeupCheckIn(
  wallet: PlayerWallet,
  currentDateKey: string,
): {
  wallet: PlayerWallet;
  claimed: boolean;
  day?: number;
  cycle?: number;
  reason?: 'invalid-date' | 'daily-check-in-required' | 'no-card' | 'daily-limit' | 'cycle-limit' | 'cycle-complete';
} {
  if (!isDateKey(currentDateKey)) {
    return { wallet, claimed: false, reason: 'invalid-date' };
  }
  const state = getSequentialCheckInState(wallet);
  if (wallet.lastCheckInDate !== currentDateKey || state.progress === 0) {
    return { wallet, claimed: false, reason: 'daily-check-in-required' };
  }
  if (state.progress >= CHECK_IN_CYCLE_LENGTH) {
    return { wallet, claimed: false, reason: 'cycle-complete' };
  }
  if (wallet.makeupCards <= 0) {
    return { wallet, claimed: false, reason: 'no-card' };
  }
  if (wallet.lastMakeupDate === currentDateKey) {
    return { wallet, claimed: false, reason: 'daily-limit' };
  }
  if (state.makeupCount >= MAX_CYCLE_MAKEUPS) {
    return { wallet, claimed: false, reason: 'cycle-limit' };
  }

  const day = state.progress + 1;
  return {
    wallet: {
      ...wallet,
      coins: wallet.coins + DAILY_CHECK_IN_REWARD,
      makeupCards: wallet.makeupCards - 1,
      lastMakeupDate: currentDateKey,
      checkInRewardClaims: [
        ...wallet.checkInRewardClaims,
        getCheckInDayClaimKey(state.cycle, day, 'makeup'),
      ],
    },
    claimed: true,
    day,
    cycle: state.cycle,
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

export function openCheckInChest(
  wallet: PlayerWallet,
  cueCatalog: CueStyle[],
  options: { cycle: number; days: number; random?: () => number },
): {
  wallet: PlayerWallet;
  opened: boolean;
  cue?: CueStyle;
  duplicate?: boolean;
  coinsAwarded: number;
  reason?: 'invalid-milestone' | 'locked' | 'already-opened' | 'empty-pool';
} {
  const milestone = CHECK_IN_MILESTONES.find((entry) => entry.days === options.days);
  if (!milestone || !Number.isInteger(options.cycle) || options.cycle < 1) {
    return { wallet, opened: false, coinsAwarded: 0, reason: 'invalid-milestone' };
  }
  const state = getSequentialCheckInState(wallet);
  if (state.cycle !== options.cycle || state.progress < milestone.days) {
    return { wallet, opened: false, coinsAwarded: 0, reason: 'locked' };
  }
  const claimKey = getCheckInClaimKey(options.cycle, milestone.days);
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
