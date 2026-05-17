export type StorageAdapter = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type WalletSupabaseRow = {
  coins: number | null;
  last_check_in_date: string | null;
  unlocked_cue_ids: unknown;
  equipped_cue_id: string | null;
};

type WalletSupabasePayload = {
  user_id: string;
  coins: number;
  last_check_in_date: string | null;
  unlocked_cue_ids: string[];
  equipped_cue_id: string;
  updated_at: string;
};

type WalletSupabaseClient = {
  auth: {
    getUser(): PromiseLike<{ data: { user: { id: string } | null } }>;
  };
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{ data: WalletSupabaseRow | null; error: unknown }>;
      };
    };
    upsert(payload: WalletSupabasePayload): PromiseLike<{ error: unknown }>;
  };
};

export type CueRarity = 'starter' | 'rare' | 'epic' | 'legendary';

export type CueStyle = {
  id: string;
  name: string;
  price: number;
  rarity: CueRarity;
  shaftColor: number;
  forearmColor: number;
  wrapColor: number;
  accentColor: number;
  gemColor: number;
};

export type PlayerWallet = {
  coins: number;
  lastCheckInDate: string | null;
  unlockedCueIds: string[];
  equippedCueId: string;
};

export const PLAYER_WALLET_KEY = 'pool.playerWallet.v1';
export const DAILY_CHECK_IN_REWARD = 180;
export const MATCH_WIN_REWARD = 120;
export const MATCH_LOSS_PENALTY = 45;
export const DEFAULT_EQUIPPED_CUE_ID = 'classic-maple';

export const CUE_CATALOG: CueStyle[] = [
  {
    id: DEFAULT_EQUIPPED_CUE_ID,
    name: 'Classic Maple',
    price: 0,
    rarity: 'starter',
    shaftColor: 0xd99a52,
    forearmColor: 0xb8662a,
    wrapColor: 0x1e1712,
    accentColor: 0xe6bd75,
    gemColor: 0x5aa0b7,
  },
  {
    id: 'royal-amethyst',
    name: 'Royal Amethyst',
    price: 320,
    rarity: 'rare',
    shaftColor: 0xf1c783,
    forearmColor: 0x6e35a5,
    wrapColor: 0x171026,
    accentColor: 0xf2d276,
    gemColor: 0xb26bff,
  },
  {
    id: 'jade-dragon',
    name: 'Jade Dragon',
    price: 620,
    rarity: 'epic',
    shaftColor: 0xe7c27f,
    forearmColor: 0x0b8a78,
    wrapColor: 0x10251f,
    accentColor: 0xf3d68a,
    gemColor: 0x44f0c8,
  },
  {
    id: 'phoenix-gold',
    name: 'Phoenix Gold',
    price: 980,
    rarity: 'legendary',
    shaftColor: 0xf5cb7a,
    forearmColor: 0xc9442e,
    wrapColor: 0x24110d,
    accentColor: 0xffdf7a,
    gemColor: 0xff8b3d,
  },
];

export const DEFAULT_PLAYER_WALLET: PlayerWallet = {
  coins: 260,
  lastCheckInDate: null,
  unlockedCueIds: [DEFAULT_EQUIPPED_CUE_ID],
  equippedCueId: DEFAULT_EQUIPPED_CUE_ID,
};

const cueIds = new Set(CUE_CATALOG.map((cue) => cue.id));

export function getCueStyle(cueId: string): CueStyle {
  return CUE_CATALOG.find((cue) => cue.id === cueId) ?? CUE_CATALOG[0];
}

export function applyDailyCheckIn(wallet: PlayerWallet, dateKey: string): { wallet: PlayerWallet; claimed: boolean } {
  if (wallet.lastCheckInDate === dateKey) {
    return { wallet, claimed: false };
  }

  return {
    wallet: sanitizeWallet({
      ...wallet,
      coins: wallet.coins + DAILY_CHECK_IN_REWARD,
      lastCheckInDate: dateKey,
    }),
    claimed: true,
  };
}

export function applyMatchCoinResult(wallet: PlayerWallet, won: boolean): PlayerWallet {
  return sanitizeWallet({
    ...wallet,
    coins: won ? wallet.coins + MATCH_WIN_REWARD : Math.max(0, wallet.coins - MATCH_LOSS_PENALTY),
  });
}

export function buyCue(
  wallet: PlayerWallet,
  cueId: string,
): { wallet: PlayerWallet; purchased: boolean; reason?: 'already-owned' | 'not-found' | 'not-enough-coins' } {
  const cue = CUE_CATALOG.find((item) => item.id === cueId);
  if (!cue) {
    return { wallet, purchased: false, reason: 'not-found' };
  }
  if (wallet.unlockedCueIds.includes(cueId)) {
    return { wallet, purchased: false, reason: 'already-owned' };
  }
  if (wallet.coins < cue.price) {
    return { wallet, purchased: false, reason: 'not-enough-coins' };
  }

  return {
    wallet: sanitizeWallet({
      ...wallet,
      coins: wallet.coins - cue.price,
      unlockedCueIds: [...wallet.unlockedCueIds, cueId],
    }),
    purchased: true,
  };
}

export function equipCue(
  wallet: PlayerWallet,
  cueId: string,
): { wallet: PlayerWallet; equipped: boolean; reason?: 'locked' | 'not-found' } {
  if (!cueIds.has(cueId)) {
    return { wallet, equipped: false, reason: 'not-found' };
  }
  if (!wallet.unlockedCueIds.includes(cueId)) {
    return { wallet, equipped: false, reason: 'locked' };
  }

  return {
    wallet: sanitizeWallet({ ...wallet, equippedCueId: cueId }),
    equipped: true,
  };
}

export function readPlayerWallet(storage: Pick<StorageAdapter, 'getItem'>): PlayerWallet {
  try {
    const raw = storage.getItem(PLAYER_WALLET_KEY);
    if (!raw) {
      return DEFAULT_PLAYER_WALLET;
    }
    return sanitizeWallet(JSON.parse(raw) as Partial<PlayerWallet>);
  } catch {
    return DEFAULT_PLAYER_WALLET;
  }
}

export function writePlayerWallet(storage: StorageAdapter, wallet: PlayerWallet): PlayerWallet {
  const sanitized = sanitizeWallet(wallet);
  try {
    storage.setItem(PLAYER_WALLET_KEY, JSON.stringify(sanitized));
  } catch {
    // Some privacy modes reject localStorage writes. Keep the in-memory wallet usable.
  }
  return sanitized;
}

export async function readPlayerWalletSupabase(
  supabase: unknown,
  storage: StorageAdapter = browserStorage(),
): Promise<PlayerWallet> {
  const client = asWalletSupabaseClient(supabase);
  if (!client) {
    return readPlayerWallet(storage);
  }

  const userId = await getSupabaseUserId(client);
  if (!userId) {
    return readPlayerWallet(storage);
  }

  try {
    const { data, error } = await client
      .from('player_wallets')
      .select('coins, last_check_in_date, unlocked_cue_ids, equipped_cue_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) {
      const wallet = sanitizeWallet({
        coins: data.coins ?? undefined,
        lastCheckInDate: data.last_check_in_date,
        unlockedCueIds: Array.isArray(data.unlocked_cue_ids) ? data.unlocked_cue_ids : undefined,
        equippedCueId: data.equipped_cue_id ?? undefined,
      });
      writePlayerWallet(storage, wallet);
      return wallet;
    }
  } catch {
    return readPlayerWallet(storage);
  }

  const localWallet = readPlayerWallet(storage);
  await writePlayerWalletRow(client, userId, localWallet);
  return localWallet;
}

export async function writePlayerWalletSupabase(
  supabase: unknown,
  wallet: PlayerWallet,
  storage: StorageAdapter = browserStorage(),
): Promise<PlayerWallet> {
  const sanitized = writePlayerWallet(storage, wallet);
  const client = asWalletSupabaseClient(supabase);
  if (!client) {
    return sanitized;
  }

  const userId = await getSupabaseUserId(client);
  if (!userId) {
    return sanitized;
  }

  await writePlayerWalletRow(client, userId, sanitized);
  return sanitized;
}

function asWalletSupabaseClient(value: unknown): WalletSupabaseClient | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<WalletSupabaseClient>;
  return candidate.auth && typeof candidate.from === 'function'
    ? candidate as WalletSupabaseClient
    : null;
}

function sanitizeWallet(wallet: Partial<PlayerWallet>): PlayerWallet {
  const unlocked = normalizeUnlockedCueIds(wallet.unlockedCueIds);
  const equipped = typeof wallet.equippedCueId === 'string' && unlocked.includes(wallet.equippedCueId)
    ? wallet.equippedCueId
    : DEFAULT_EQUIPPED_CUE_ID;

  return {
    coins: normalizeCoins(wallet.coins),
    lastCheckInDate: typeof wallet.lastCheckInDate === 'string' ? wallet.lastCheckInDate : null,
    unlockedCueIds: unlocked,
    equippedCueId: equipped,
  };
}

function normalizeCoins(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : DEFAULT_PLAYER_WALLET.coins;
}

function normalizeUnlockedCueIds(value: unknown): string[] {
  const ids = Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string' && cueIds.has(id))
    : [];
  return Array.from(new Set([DEFAULT_EQUIPPED_CUE_ID, ...ids]));
}

async function getSupabaseUserId(supabase: WalletSupabaseClient): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

async function writePlayerWalletRow(
  supabase: WalletSupabaseClient,
  userId: string,
  wallet: PlayerWallet,
): Promise<void> {
  try {
    const sanitized = sanitizeWallet(wallet);
    await supabase.from('player_wallets').upsert({
      user_id: userId,
      coins: sanitized.coins,
      last_check_in_date: sanitized.lastCheckInDate,
      unlocked_cue_ids: sanitized.unlockedCueIds,
      equipped_cue_id: sanitized.equippedCueId,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Keep local wallet state playable if the remote table is unavailable.
  }
}

function browserStorage(): StorageAdapter {
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }

  return {
    getItem: () => null,
    setItem: () => undefined,
  };
}
