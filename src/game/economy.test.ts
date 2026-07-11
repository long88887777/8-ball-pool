import { describe, expect, it } from 'vitest';
import {
  CUE_CATALOG,
  DAILY_CHECK_IN_REWARD,
  DEFAULT_EQUIPPED_CUE_ID,
  DEFAULT_PLAYER_WALLET,
  MATCH_LOSS_PENALTY,
  MATCH_WIN_REWARD,
  applyDailyCheckIn,
  applyMatchCoinResult,
  buyCue,
  equipCue,
  readPlayerWalletSupabase,
  readPlayerWallet,
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
  unlocked_cue_ids: string[];
  equipped_cue_id: string;
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

  it('adds coins for wins and subtracts coins for losses without going below zero', () => {
    const wallet: PlayerWallet = { ...DEFAULT_PLAYER_WALLET, coins: 40 };

    const won = applyMatchCoinResult(wallet, true);
    const lost = applyMatchCoinResult({ ...wallet, coins: 15 }, false);

    expect(won.coins).toBe(40 + MATCH_WIN_REWARD);
    expect(lost.coins).toBe(0);
    expect(MATCH_LOSS_PENALTY).toBeGreaterThan(15);
  });

  it('maps every cue shop entry to one of the supplied cue images', () => {
    expect(CUE_CATALOG.map((cue) => cue.assetPath)).toEqual([
      'assets/cues/cue-classic-maple.png',
      'assets/cues/cue-carbon-blue.png',
      'assets/cues/cue-red-black.png',
      'assets/cues/cue-pearl-ebony.png',
      'assets/cues/cue-royal-gold.png',
    ]);
    expect(new Set(CUE_CATALOG.map((cue) => cue.textureKey)).size).toBe(CUE_CATALOG.length);
    expect(CUE_CATALOG.map((cue) => cue.tipOffsetX)).toEqual([65, 42, 40, 42, 44]);
  });

  it('buys and equips unlocked cue sticks', () => {
    const cue = CUE_CATALOG.find((item) => item.price > 0)!;
    const wallet: PlayerWallet = { ...DEFAULT_PLAYER_WALLET, coins: cue.price + 25 };

    const bought = buyCue(wallet, cue.id);
    const equipped = equipCue(bought.wallet, cue.id);

    expect(bought.purchased).toBe(true);
    expect(bought.wallet.coins).toBe(25);
    expect(bought.wallet.unlockedCueIds).toContain(cue.id);
    expect(equipped.equipped).toBe(true);
    expect(equipped.wallet.equippedCueId).toBe(cue.id);
  });

  it('rejects locked cue equip and unaffordable purchases', () => {
    const cue = CUE_CATALOG.find((item) => item.price > DEFAULT_PLAYER_WALLET.coins)!;

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
      coins: 250,
      lastCheckInDate: '2026-05-15',
      unlockedCueIds: [DEFAULT_EQUIPPED_CUE_ID, 'missing-cue'],
      equippedCueId: 'missing-cue',
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
        unlocked_cue_ids: [DEFAULT_EQUIPPED_CUE_ID, 'jade-dragon'],
        equipped_cue_id: 'jade-dragon',
      },
    });

    const wallet = await readPlayerWalletSupabase(client, createStorage());

    expect(wallet).toEqual({
      coins: 720,
      lastCheckInDate: '2026-05-15',
      unlockedCueIds: [DEFAULT_EQUIPPED_CUE_ID, 'jade-dragon'],
      equippedCueId: 'jade-dragon',
    });
  });

  it('seeds Supabase from local wallet when a signed-in player has no wallet row', async () => {
    const storage = createStorage();
    const localWallet = writePlayerWallet(storage, {
      coins: 555,
      lastCheckInDate: '2026-05-15',
      unlockedCueIds: [DEFAULT_EQUIPPED_CUE_ID, 'royal-amethyst'],
      equippedCueId: 'royal-amethyst',
    });
    const { client, upserts } = createSupabaseWalletClient({ row: null });

    const wallet = await readPlayerWalletSupabase(client, storage);

    expect(wallet).toEqual(localWallet);
    expect(upserts).toEqual([
      expect.objectContaining({
        user_id: 'user-1',
        coins: 555,
        last_check_in_date: '2026-05-15',
        unlocked_cue_ids: [DEFAULT_EQUIPPED_CUE_ID, 'royal-amethyst'],
        equipped_cue_id: 'royal-amethyst',
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
