import { describe, expect, it } from 'vitest';
import {
  AI_DAILY_COIN_LIMIT,
  CUE_CATALOG,
  CUE_PRICE_RANGES,
  CUE_REPAIR_COST_RANGES,
  DAILY_CHECK_IN_REWARD,
  DEFAULT_EQUIPPED_CUE_ID,
  DEFAULT_PLAYER_WALLET,
  MATCH_COIN_RANGES,
  applyDailyCheckIn,
  applyMatchCoinResult,
  buyCue,
  consumeEquippedCueDurability,
  equipCue,
  getCueDurability,
  getCuePerformanceScore,
  getCuesForCollection,
  getDailyAiCoinsEarned,
  readPlayerWalletSupabase,
  readPlayerWallet,
  repairCue,
  writePlayerWallet,
  writePlayerWalletSupabase,
  type PlayerWallet,
  type StorageAdapter,
} from './economy';

function createStorage(seed: Record<string, string> = {}): StorageAdapter {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

type WalletRow = {
  coins: number;
  last_check_in_date: string | null;
  check_in_dates?: string[];
  makeup_cards?: number;
  makeup_match_progress?: number;
  last_makeup_date?: string | null;
  monthly_makeup_counts?: Record<string, number>;
  check_in_reward_claims?: string[];
  ai_coin_earned_date?: string | null;
  ai_coins_earned?: number;
  unlocked_cue_ids: string[];
  equipped_cue_id: string;
  cue_durability?: Record<string, number>;
  challenge_reward_claimed?: boolean;
};

function createSupabaseWalletClient(options: {
  userId?: string | null;
  row?: WalletRow | null;
  selectError?: unknown;
  upsertError?: unknown;
} = {}) {
  const upserts: unknown[] = [];
  const userId = options.userId === undefined ? 'user-1' : options.userId;
  const client = {
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null } }),
    },
    from: (table: string) => {
      expect(table).toBe('player_wallets');
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: options.row ?? null,
              error: options.selectError ?? null,
            }),
          }),
        }),
        upsert: async (payload: unknown) => {
          upserts.push(payload);
          return { error: options.upsertError ?? null };
        },
      };
    },
  };

  return { client, upserts };
}

describe('pool economy', () => {
  it('creates a default wallet with starter coins and the default cue unlocked', () => {
    const wallet = readPlayerWallet(createStorage());

    expect(wallet.coins).toBe(DEFAULT_PLAYER_WALLET.coins);
    expect(wallet.equippedCueId).toBe(DEFAULT_EQUIPPED_CUE_ID);
    expect(wallet.unlockedCueIds).toEqual([DEFAULT_EQUIPPED_CUE_ID]);
    expect(getCueDurability(wallet, DEFAULT_EQUIPPED_CUE_ID)).toBe(CUE_CATALOG[0].durability);
    expect(wallet.challengeRewardClaimed).toBe(false);
  });

  it('gives every cue four gameplay attributes that increase by rarity tier', () => {
    const rarityOrder = ['starter', 'rare', 'epic', 'legendary'] as const;
    const tierRanges = rarityOrder.map((rarity) => {
      const cues = CUE_CATALOG.filter((cue) => cue.rarity === rarity);
      return {
        rarity,
        minPower: Math.min(...cues.map((cue) => cue.power)),
        maxPower: Math.max(...cues.map((cue) => cue.power)),
        minAccuracy: Math.min(...cues.map((cue) => cue.accuracy)),
        maxAccuracy: Math.max(...cues.map((cue) => cue.accuracy)),
        minSpin: Math.min(...cues.map((cue) => cue.spin)),
        maxSpin: Math.max(...cues.map((cue) => cue.spin)),
        minDurability: Math.min(...cues.map((cue) => cue.durability)),
        maxDurability: Math.max(...cues.map((cue) => cue.durability)),
      };
    });

    for (const cue of CUE_CATALOG) {
      expect(cue.power).toBeGreaterThan(0);
      expect(cue.accuracy).toBeGreaterThan(0);
      expect(cue.spin).toBeGreaterThan(0);
      expect(cue.durability).toBeGreaterThan(0);
      expect(cue.repairCost).toBeGreaterThan(0);
    }

    for (let index = 1; index < tierRanges.length; index += 1) {
      expect(tierRanges[index].minPower).toBeGreaterThan(tierRanges[index - 1].maxPower);
      expect(tierRanges[index].minAccuracy).toBeGreaterThan(tierRanges[index - 1].maxAccuracy);
      expect(tierRanges[index].minSpin).toBeGreaterThan(tierRanges[index - 1].maxSpin);
      expect(tierRanges[index].minDurability).toBeGreaterThan(tierRanges[index - 1].maxDurability);
    }
  });

  it('prices every cue inside its rarity tier range', () => {
    for (const cue of CUE_CATALOG) {
      const range = CUE_PRICE_RANGES[cue.rarity];
      expect(cue.price).toBeGreaterThanOrEqual(range.min);
      expect(cue.price).toBeLessThanOrEqual(range.max);

      const repairRange = CUE_REPAIR_COST_RANGES[cue.rarity];
      expect(cue.repairCost).toBeGreaterThanOrEqual(repairRange.min);
      expect(cue.repairCost).toBeLessThanOrEqual(repairRange.max);
    }
  });

  it('allows exactly one daily check-in reward per local date', () => {
    const initial: PlayerWallet = { ...DEFAULT_PLAYER_WALLET, coins: 100 };

    const first = applyDailyCheckIn(initial, '2026-05-15');
    const second = applyDailyCheckIn(first.wallet, '2026-05-15');
    const nextDay = applyDailyCheckIn(second.wallet, '2026-05-16');

    expect(first.claimed).toBe(true);
    expect(first.wallet.coins).toBe(100 + DAILY_CHECK_IN_REWARD);
    expect(second.claimed).toBe(false);
    expect(second.wallet.coins).toBe(first.wallet.coins);
    expect(nextDay.claimed).toBe(true);
    expect(nextDay.wallet.coins).toBe(100 + DAILY_CHECK_IN_REWARD * 2);
  });

  it('randomizes AI match coins from 30 to 50 and never lets the wallet go below zero', () => {
    const wallet: PlayerWallet = { ...DEFAULT_PLAYER_WALLET, coins: 40 };
    const minimumWin = applyMatchCoinResult(wallet, {
      mode: 'ai',
      won: true,
      dateKey: '2026-09-09',
      random: () => 0,
    });
    const maximumLoss = applyMatchCoinResult({ ...wallet, coins: 45 }, {
      mode: 'ai',
      won: false,
      dateKey: '2026-09-09',
      random: () => 0.999999,
    });

    expect(minimumWin.rolledAmount).toBe(MATCH_COIN_RANGES.ai.min);
    expect(minimumWin.coinDelta).toBe(30);
    expect(minimumWin.wallet.coins).toBe(70);
    expect(maximumLoss.rolledAmount).toBe(MATCH_COIN_RANGES.ai.max);
    expect(maximumLoss.coinDelta).toBe(-45);
    expect(maximumLoss.wallet.coins).toBe(0);
  });

  it('caps AI win earnings at 300 coins per local date without counting losses or check-ins', () => {
    const almostCapped: PlayerWallet = {
      ...DEFAULT_PLAYER_WALLET,
      coins: 1_000,
      aiCoinEarnedDate: '2026-09-09',
      aiCoinsEarned: 285,
    };

    const cappedWin = applyMatchCoinResult(almostCapped, {
      mode: 'ai',
      won: true,
      dateKey: '2026-09-09',
      random: () => 0.999999,
    });
    const noMoreReward = applyMatchCoinResult(cappedWin.wallet, {
      mode: 'ai',
      won: true,
      dateKey: '2026-09-09',
      random: () => 0,
    });
    const lossAfterCap = applyMatchCoinResult(noMoreReward.wallet, {
      mode: 'ai',
      won: false,
      dateKey: '2026-09-09',
      random: () => 0,
    });
    const checkedIn = applyDailyCheckIn(lossAfterCap.wallet, '2026-09-09');

    expect(cappedWin.coinDelta).toBe(15);
    expect(cappedWin.dailyLimitReached).toBe(true);
    expect(getDailyAiCoinsEarned(cappedWin.wallet, '2026-09-09')).toBe(AI_DAILY_COIN_LIMIT);
    expect(noMoreReward.coinDelta).toBe(0);
    expect(lossAfterCap.coinDelta).toBe(-30);
    expect(getDailyAiCoinsEarned(lossAfterCap.wallet, '2026-09-09')).toBe(AI_DAILY_COIN_LIMIT);
    expect(getDailyAiCoinsEarned(checkedIn.wallet, '2026-09-09')).toBe(AI_DAILY_COIN_LIMIT);
  });

  it('resets the AI earnings counter on a new date and leaves PVP rewards uncapped', () => {
    const previousDay: PlayerWallet = {
      ...DEFAULT_PLAYER_WALLET,
      coins: 1_000,
      aiCoinEarnedDate: '2026-09-08',
      aiCoinsEarned: AI_DAILY_COIN_LIMIT,
    };
    const aiWin = applyMatchCoinResult(previousDay, {
      mode: 'ai',
      won: true,
      dateKey: '2026-09-09',
      random: () => 0,
    });
    const pvpWin = applyMatchCoinResult(aiWin.wallet, {
      mode: 'pvp',
      won: true,
      dateKey: '2026-09-09',
      random: () => 0.999999,
    });
    const pvpLoss = applyMatchCoinResult(pvpWin.wallet, {
      mode: 'pvp',
      won: false,
      dateKey: '2026-09-09',
      random: () => 0,
    });

    expect(aiWin.coinDelta).toBe(30);
    expect(getDailyAiCoinsEarned(aiWin.wallet, '2026-09-09')).toBe(30);
    expect(pvpWin.coinDelta).toBe(MATCH_COIN_RANGES.pvp.max);
    expect(pvpLoss.coinDelta).toBe(-MATCH_COIN_RANGES.pvp.min);
    expect(getDailyAiCoinsEarned(pvpLoss.wallet, '2026-09-09')).toBe(30);
  });

  it('maps every cue shop entry to one of the supplied cue images', () => {
    expect(CUE_CATALOG).toHaveLength(30);
    expect(CUE_CATALOG.map((cue) => cue.assetPath)).toEqual([
      'assets/cues/cue-comet-tail.png',
      'assets/cues/cue-synthwave-sunset.png',
      'assets/cues/cue-laser-grid.png',
      'assets/cues/cue-venetian-masquerade.png',
      'assets/cues/cue-clockwork-marquis.png',
      'assets/cues/cue-thunderstorm.png',
      'assets/cues/cue-abyssal-leviathan.png',
      'assets/cues/cue-enchanted-grove.png',
      'assets/cues/cue-desert-mirage.png',
      'assets/cues/cue-quantum-lattice.png',
      'assets/cues/cue-titan-exosuit.png',
      'assets/cues/cue-stealth-vector.png',
      'assets/cues/cue-frost-valkyrie.png',
      'assets/cues/cue-moonlit-kitsune.png',
      'assets/cues/cue-event-horizon.png',
      'assets/cues/cue-aurora-borealis.png',
      'assets/cues/cue-electric-viper.png',
      'assets/cues/cue-art-deco-noir.png',
      'assets/cues/cue-mosaic-seraph.png',
      'assets/cues/cue-magma-core.png',
      'assets/cues/cue-liquid-mercury.png',
      'assets/cues/cue-phoenix-rebirth.png',
      'assets/cues/cue-nebula-sovereign.png',
      'assets/cues/cue-solar-eclipse.png',
      'assets/cues/cue-hologram-prism.png',
      'assets/cues/cue-imperial-cloisonne.png',
      'assets/cues/cue-biomech-orchid.png',
      'assets/cues/cue-dragon-emperor.png',
      'assets/cues/cue-sunken-atlantis.png',
      'assets/cues/cue-cyber-sakura.png',
    ]);
    expect(new Set(CUE_CATALOG.map((cue) => cue.textureKey)).size).toBe(CUE_CATALOG.length);
    expect(CUE_CATALOG.every((cue) => cue.textureKey === `cue-${cue.id}`)).toBe(true);
  });

  it('uses the requested rarity distribution and legendary selections', () => {
    expect(Object.fromEntries((['starter', 'rare', 'epic', 'legendary'] as const).map((rarity) => [
      rarity,
      CUE_CATALOG.filter((cue) => cue.rarity === rarity).length,
    ]))).toEqual({ starter: 12, rare: 8, epic: 6, legendary: 4 });
    expect(CUE_CATALOG.filter((cue) => cue.rarity === 'legendary').map((cue) => cue.id).sort()).toEqual([
      'cyber-sakura',
      'dragon-emperor',
      'frost-valkyrie',
      'sunken-atlantis',
    ]);
  });

  it('promotes Frost Valkyrie to top-tier legendary attributes and pricing', () => {
    const cue = CUE_CATALOG.find((item) => item.id === 'frost-valkyrie');

    expect(cue).toMatchObject({
      rarity: 'legendary',
      price: 17_800,
      power: 97,
      accuracy: 99,
      spin: 98,
      durability: 132,
      repairCost: 490,
    });
    expect(getCuePerformanceScore(cue!)).toBe(99);
  });

  it('orders the collection by rarity and then by overall performance', () => {
    const ordered = getCuesForCollection();
    const rarityRank = { starter: 0, rare: 1, epic: 2, legendary: 3 } as const;

    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      expect(rarityRank[previous.rarity]).toBeGreaterThanOrEqual(rarityRank[current.rarity]);
      if (previous.rarity === current.rarity) {
        expect(getCuePerformanceScore(previous)).toBeGreaterThanOrEqual(getCuePerformanceScore(current));
      }
    }
  });

  it('buys and equips unlocked cue sticks', () => {
    const cue = CUE_CATALOG.find((item) => item.id !== DEFAULT_EQUIPPED_CUE_ID)!;
    const wallet: PlayerWallet = { ...DEFAULT_PLAYER_WALLET, coins: cue.price + 25 };

    const bought = buyCue(wallet, cue.id);
    const equipped = equipCue(bought.wallet, cue.id);

    expect(bought.purchased).toBe(true);
    expect(bought.wallet.coins).toBe(25);
    expect(bought.wallet.unlockedCueIds).toContain(cue.id);
    expect(equipped.equipped).toBe(true);
    expect(equipped.wallet.equippedCueId).toBe(cue.id);
    expect(getCueDurability(equipped.wallet, cue.id)).toBe(cue.durability);
  });

  it('consumes one durability per player shot and blocks a broken cue from being equipped', () => {
    const cue = CUE_CATALOG.find((item) => item.id !== DEFAULT_EQUIPPED_CUE_ID)!;
    const owned = {
      ...DEFAULT_PLAYER_WALLET,
      unlockedCueIds: [...DEFAULT_PLAYER_WALLET.unlockedCueIds, cue.id],
      equippedCueId: cue.id,
      cueDurability: {
        ...DEFAULT_PLAYER_WALLET.cueDurability,
        [cue.id]: 1,
      },
    };

    const used = consumeEquippedCueDurability(owned);
    const equipBroken = equipCue({ ...used.wallet, equippedCueId: DEFAULT_EQUIPPED_CUE_ID }, cue.id);
    const blocked = consumeEquippedCueDurability(used.wallet);

    expect(used.used).toBe(true);
    expect(getCueDurability(used.wallet, cue.id)).toBe(0);
    expect(blocked.used).toBe(false);
    expect(blocked.reason).toBe('needs-repair');
    expect(equipBroken.equipped).toBe(false);
    expect(equipBroken.reason).toBe('needs-repair');
  });

  it('repairs an owned broken cue to full durability and charges coins', () => {
    const cue = CUE_CATALOG[0];
    const broken = {
      ...DEFAULT_PLAYER_WALLET,
      coins: cue.repairCost + 10,
      cueDurability: { [cue.id]: 0 },
    };

    const repaired = repairCue(broken, cue.id);
    const insufficient = repairCue({ ...broken, coins: cue.repairCost - 1 }, cue.id);

    expect(repaired.repaired).toBe(true);
    expect(repaired.wallet.coins).toBe(10);
    expect(getCueDurability(repaired.wallet, cue.id)).toBe(cue.durability);
    expect(insufficient.repaired).toBe(false);
    expect(insufficient.reason).toBe('not-enough-coins');
  });

  it('rejects locked cue equip and unaffordable purchases', () => {
    const cue = CUE_CATALOG.find((item) => item.id !== DEFAULT_EQUIPPED_CUE_ID)!;

    const lockedEquip = equipCue(DEFAULT_PLAYER_WALLET, cue.id);
    const purchase = buyCue(DEFAULT_PLAYER_WALLET, cue.id);

    expect(lockedEquip.equipped).toBe(false);
    expect(lockedEquip.reason).toBe('locked');
    expect(purchase.purchased).toBe(false);
    expect(purchase.reason).toBe('not-enough-coins');
  });

  it('persists sanitized wallet data', () => {
    const storage = createStorage();
    const written = writePlayerWallet(storage, {
      ...DEFAULT_PLAYER_WALLET,
      coins: 250,
      lastCheckInDate: '2026-05-15',
      unlockedCueIds: [DEFAULT_EQUIPPED_CUE_ID, 'missing-cue'],
      equippedCueId: 'missing-cue',
      cueDurability: {
        [DEFAULT_EQUIPPED_CUE_ID]: 999,
        'missing-cue': -1,
      },
    });
    const read = readPlayerWallet(storage);

    expect(written.equippedCueId).toBe(DEFAULT_EQUIPPED_CUE_ID);
    expect(read).toEqual(written);
  });

  it('reads an authenticated wallet from Supabase', async () => {
    const { client } = createSupabaseWalletClient({
      row: {
        coins: 720,
        last_check_in_date: '2026-05-15',
        check_in_dates: ['2026-05-14', '2026-05-15'],
        makeup_cards: 2,
        makeup_match_progress: 1,
        last_makeup_date: '2026-05-15',
        monthly_makeup_counts: { '2026-05': 1 },
        check_in_reward_claims: ['2026-05:7', 'daily-v2:1:day:1:daily'],
        ai_coin_earned_date: '2026-05-15',
        ai_coins_earned: 210,
        unlocked_cue_ids: [DEFAULT_EQUIPPED_CUE_ID, 'frost-valkyrie'],
        equipped_cue_id: 'frost-valkyrie',
        cue_durability: {
          [DEFAULT_EQUIPPED_CUE_ID]: 17,
          'frost-valkyrie': 41,
        },
        challenge_reward_claimed: true,
      },
    });

    const wallet = await readPlayerWalletSupabase(client, createStorage());

    expect(wallet).toEqual({
      coins: 720,
      lastCheckInDate: '2026-05-15',
      checkInDates: ['2026-05-14', '2026-05-15'],
      makeupCards: 2,
      makeupMatchProgress: 1,
      lastMakeupDate: '2026-05-15',
      monthlyMakeupCounts: { '2026-05': 1 },
      checkInRewardClaims: ['2026-05:7', 'daily-v2:1:day:1:daily'],
      aiCoinEarnedDate: '2026-05-15',
      aiCoinsEarned: 210,
      unlockedCueIds: [DEFAULT_EQUIPPED_CUE_ID, 'frost-valkyrie'],
      equippedCueId: 'frost-valkyrie',
      cueDurability: {
        [DEFAULT_EQUIPPED_CUE_ID]: 17,
        'frost-valkyrie': 41,
      },
      challengeRewardClaimed: true,
    });
  });

  it('seeds Supabase from local wallet when a signed-in player has no wallet row', async () => {
    const storage = createStorage();
    const localWallet = writePlayerWallet(storage, {
      ...DEFAULT_PLAYER_WALLET,
      coins: 555,
      lastCheckInDate: '2026-05-15',
      unlockedCueIds: [DEFAULT_EQUIPPED_CUE_ID, 'moonlit-kitsune'],
      equippedCueId: 'moonlit-kitsune',
      cueDurability: DEFAULT_PLAYER_WALLET.cueDurability,
    });
    const { client, upserts } = createSupabaseWalletClient({ row: null });

    const wallet = await readPlayerWalletSupabase(client, storage);

    expect(wallet).toEqual(localWallet);
    expect(upserts).toEqual([
      expect.objectContaining({
        user_id: 'user-1',
        coins: 555,
        last_check_in_date: '2026-05-15',
        check_in_dates: ['2026-05-15'],
        makeup_cards: 0,
        makeup_match_progress: 0,
        last_makeup_date: null,
        monthly_makeup_counts: {},
        check_in_reward_claims: [],
        ai_coin_earned_date: null,
        ai_coins_earned: 0,
        unlocked_cue_ids: [DEFAULT_EQUIPPED_CUE_ID, 'moonlit-kitsune'],
        equipped_cue_id: 'moonlit-kitsune',
        cue_durability: localWallet.cueDurability,
        challenge_reward_claimed: false,
      }),
    ]);
  });

  it('uses local storage for wallet reads and writes when no player is signed in', async () => {
    const storage = createStorage();
    const { client, upserts } = createSupabaseWalletClient({ userId: null });

    const written = await writePlayerWalletSupabase(client, {
      ...DEFAULT_PLAYER_WALLET,
      coins: 880,
    }, storage);
    const read = await readPlayerWalletSupabase(client, storage);

    expect(written.coins).toBe(880);
    expect(read.coins).toBe(880);
    expect(upserts).toEqual([]);
  });
});
