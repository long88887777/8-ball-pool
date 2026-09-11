export type StorageAdapter = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type WalletSupabaseRow = {
  coins: number | null;
  last_check_in_date: string | null;
  check_in_dates?: unknown;
  makeup_cards?: number | null;
  makeup_match_progress?: number | null;
  last_makeup_date?: string | null;
  monthly_makeup_counts?: unknown;
  check_in_reward_claims?: unknown;
  ai_coin_earned_date: string | null;
  ai_coins_earned: number | null;
  unlocked_cue_ids: unknown;
  equipped_cue_id: string | null;
  cue_durability: unknown;
  challenge_reward_claimed: boolean | null;
};

type WalletSupabasePayload = {
  user_id: string;
  coins: number;
  last_check_in_date: string | null;
  check_in_dates: string[];
  makeup_cards: number;
  makeup_match_progress: number;
  last_makeup_date: string | null;
  monthly_makeup_counts: Record<string, number>;
  check_in_reward_claims: string[];
  ai_coin_earned_date: string | null;
  ai_coins_earned: number;
  unlocked_cue_ids: string[];
  equipped_cue_id: string;
  cue_durability: Record<string, number>;
  challenge_reward_claimed: boolean;
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
  textureKey: string;
  assetPath: string;
  tipOffsetX: number;
  price: number;
  rarity: CueRarity;
  power: number;
  accuracy: number;
  spin: number;
  durability: number;
  repairCost: number;
  shaftColor: number;
  forearmColor: number;
  wrapColor: number;
  accentColor: number;
  gemColor: number;
};

export type PlayerWallet = {
  coins: number;
  lastCheckInDate: string | null;
  checkInDates: string[];
  makeupCards: number;
  makeupMatchProgress: number;
  lastMakeupDate: string | null;
  monthlyMakeupCounts: Record<string, number>;
  checkInRewardClaims: string[];
  aiCoinEarnedDate: string | null;
  aiCoinsEarned: number;
  unlockedCueIds: string[];
  equippedCueId: string;
  cueDurability: Record<string, number>;
  challengeRewardClaimed: boolean;
};

export const PLAYER_WALLET_KEY = 'pool.playerWallet.v1';
export const AI_DAILY_COIN_LIMIT = 300;
export { DAILY_CHECK_IN_REWARD, applyDailyCheckIn } from './checkIn';
export const MATCH_COIN_RANGES = {
  ai: { min: 30, max: 50 },
  pvp: { min: 50, max: 100 },
} as const;
export const CUE_PRICE_RANGES: Record<CueRarity, { min: number; max: number }> = {
  starter: { min: 300, max: 1_000 },
  rare: { min: 2_000, max: 3_500 },
  epic: { min: 5_000, max: 8_000 },
  legendary: { min: 10_000, max: 18_000 },
};
export const CUE_REPAIR_COST_RANGES: Record<CueRarity, { min: number; max: number }> = {
  starter: { min: 30, max: 70 },
  rare: { min: 90, max: 150 },
  epic: { min: 180, max: 280 },
  legendary: { min: 400, max: 500 },
};
export const DEFAULT_EQUIPPED_CUE_ID = 'comet-tail';

type CueDefinition = Omit<CueStyle, 'textureKey' | 'assetPath' | 'shaftColor' | 'forearmColor' | 'wrapColor' | 'accentColor' | 'gemColor'> & {
  colors: readonly [number, number, number, number, number];
};

function defineCue({ colors, ...cue }: CueDefinition): CueStyle {
  const [shaftColor, forearmColor, wrapColor, accentColor, gemColor] = colors;
  return {
    ...cue,
    textureKey: `cue-${cue.id}`,
    assetPath: `assets/cues/cue-${cue.id}.png`,
    shaftColor,
    forearmColor,
    wrapColor,
    accentColor,
    gemColor,
  };
}

export const CUE_CATALOG: CueStyle[] = [
  defineCue({ id: DEFAULT_EQUIPPED_CUE_ID, name: '彗星尾迹', tipOffsetX: 19, price: 300, rarity: 'starter', power: 42, accuracy: 58, spin: 44, durability: 50, repairCost: 30, colors: [0xe5c492, 0xdce9ea, 0xd9e2e3, 0x33b8c4, 0xa8f4ff] }),
  defineCue({ id: 'synthwave-sunset', name: '蒸汽波落日', tipOffsetX: 19, price: 520, rarity: 'starter', power: 50, accuracy: 48, spin: 52, durability: 54, repairCost: 36, colors: [0xe1bd86, 0x382057, 0x15151b, 0xff765e, 0xffc45c] }),
  defineCue({ id: 'laser-grid', name: '激光网格', tipOffsetX: 19, price: 600, rarity: 'starter', power: 47, accuracy: 56, spin: 50, durability: 56, repairCost: 40, colors: [0xdfbd87, 0x262d2a, 0x131718, 0x8fd52c, 0xb563ff] }),
  defineCue({ id: 'venetian-masquerade', name: '威尼斯假面', tipOffsetX: 19, price: 680, rarity: 'starter', power: 44, accuracy: 54, spin: 57, durability: 58, repairCost: 44, colors: [0xe4c394, 0x5b172f, 0x4c1733, 0xc6a24e, 0x8d62bd] }),
  defineCue({ id: 'clockwork-marquis', name: '机械侯爵', tipOffsetX: 19, price: 760, rarity: 'starter', power: 55, accuracy: 46, spin: 48, durability: 64, repairCost: 48, colors: [0xe0bd84, 0x60391f, 0x8b4e29, 0xb78a45, 0x557aa8] }),
  defineCue({ id: 'thunderstorm', name: '雷霆风暴', tipOffsetX: 19, price: 820, rarity: 'starter', power: 58, accuracy: 42, spin: 55, durability: 52, repairCost: 52, colors: [0xe0bd85, 0x172330, 0x111417, 0x2d8fda, 0xa9eaff] }),
  defineCue({ id: 'abyssal-leviathan', name: '深渊巨兽', tipOffsetX: 19, price: 880, rarity: 'starter', power: 49, accuracy: 53, spin: 58, durability: 60, repairCost: 56, colors: [0xdfbd87, 0x102f3d, 0x173b52, 0x4aa2a9, 0xc3f8e9] }),
  defineCue({ id: 'enchanted-grove', name: '秘境古林', tipOffsetX: 19, price: 920, rarity: 'starter', power: 45, accuracy: 57, spin: 51, durability: 62, repairCost: 60, colors: [0xe1c08b, 0x163629, 0x154833, 0xb08b42, 0x35c9ad] }),
  defineCue({ id: 'desert-mirage', name: '沙海幻境', tipOffsetX: 19, price: 940, rarity: 'starter', power: 52, accuracy: 51, spin: 46, durability: 63, repairCost: 62, colors: [0xe4c292, 0xa56531, 0xa87347, 0x2f9b9c, 0xb94d32] }),
  defineCue({ id: 'quantum-lattice', name: '量子晶格', tipOffsetX: 19, price: 960, rarity: 'starter', power: 54, accuracy: 58, spin: 53, durability: 58, repairCost: 64, colors: [0xe2c28f, 0xe7e4df, 0xe4e5e0, 0x3469c9, 0xb828a9] }),
  defineCue({ id: 'titan-exosuit', name: '泰坦外骨骼', tipOffsetX: 19, price: 980, rarity: 'starter', power: 58, accuracy: 50, spin: 49, durability: 64, repairCost: 66, colors: [0xe0bd86, 0x393c3d, 0x121517, 0xee671f, 0xe6e2d9] }),
  defineCue({ id: 'stealth-vector', name: '隐形矢量', tipOffsetX: 19, price: 1_000, rarity: 'starter', power: 56, accuracy: 57, spin: 52, durability: 61, repairCost: 70, colors: [0xdfbd88, 0x141619, 0x222426, 0xb5272e, 0xe4e2da] }),

  defineCue({ id: 'frost-valkyrie', name: '霜翼女武神', tipOffsetX: 45, price: 17_800, rarity: 'legendary', power: 97, accuracy: 99, spin: 98, durability: 132, repairCost: 490, colors: [0xe8d7b8, 0xe8edf0, 0x31558a, 0x72b9df, 0xf1f8ff] }),
  defineCue({ id: 'moonlit-kitsune', name: '月夜九尾', tipOffsetX: 19, price: 2_350, rarity: 'rare', power: 64, accuracy: 73, spin: 75, durability: 80, repairCost: 96, colors: [0xe3c28f, 0x34303b, 0x241c55, 0xc5c1ca, 0x9271d3] }),
  defineCue({ id: 'event-horizon', name: '事件视界', tipOffsetX: 19, price: 2_500, rarity: 'rare', power: 72, accuracy: 74, spin: 62, durability: 82, repairCost: 102, colors: [0xe0bd85, 0x141313, 0x222020, 0xb87862, 0x8f1d22] }),
  defineCue({ id: 'aurora-borealis', name: '极光穹顶', tipOffsetX: 19, price: 2_650, rarity: 'rare', power: 68, accuracy: 71, spin: 74, durability: 76, repairCost: 108, colors: [0xe0bd85, 0x10234b, 0x0b493b, 0x2ab9a3, 0x7a5ee7] }),
  defineCue({ id: 'electric-viper', name: '电光毒蛇', tipOffsetX: 19, price: 2_800, rarity: 'rare', power: 75, accuracy: 65, spin: 72, durability: 84, repairCost: 116, colors: [0xdfbc84, 0x12161b, 0x11151b, 0xd9d22a, 0x2c70d8] }),
  defineCue({ id: 'art-deco-noir', name: '鎏金夜宴', tipOffsetX: 19, price: 2_950, rarity: 'rare', power: 70, accuracy: 76, spin: 66, durability: 86, repairCost: 124, colors: [0xdfbf8b, 0x151414, 0x181718, 0xd0b164, 0x32a474] }),
  defineCue({ id: 'mosaic-seraph', name: '螺钿炽翼', tipOffsetX: 19, price: 3_100, rarity: 'rare', power: 62, accuracy: 78, spin: 70, durability: 75, repairCost: 132, colors: [0xe5c99b, 0xf1eadb, 0xe8e5dc, 0xd0ad62, 0x56c8c0] }),
  defineCue({ id: 'magma-core', name: '熔岩核心', tipOffsetX: 19, price: 3_250, rarity: 'rare', power: 76, accuracy: 64, spin: 73, durability: 83, repairCost: 140, colors: [0xe0bb81, 0x241815, 0x141313, 0xe24d20, 0xff9e2f] }),
  defineCue({ id: 'liquid-mercury', name: '液态水银', tipOffsetX: 19, price: 3_400, rarity: 'rare', power: 73, accuracy: 77, spin: 69, durability: 81, repairCost: 150, colors: [0xe0c08d, 0xbec2c3, 0x404346, 0x88979f, 0x45aee0] }),

  defineCue({ id: 'phoenix-rebirth', name: '涅槃凤凰', tipOffsetX: 19, price: 5_200, rarity: 'epic', power: 88, accuracy: 84, spin: 87, durability: 102, repairCost: 180, colors: [0xe3c08b, 0x5b1018, 0x171315, 0xd99a31, 0xf05a26] }),
  defineCue({ id: 'nebula-sovereign', name: '星云主宰', tipOffsetX: 19, price: 5_700, rarity: 'epic', power: 83, accuracy: 88, spin: 89, durability: 98, repairCost: 200, colors: [0xdfbd87, 0x241243, 0x191921, 0x8b56ca, 0xff67ba] }),
  defineCue({ id: 'solar-eclipse', name: '日蚀王冠', tipOffsetX: 19, price: 6_200, rarity: 'epic', power: 90, accuracy: 85, spin: 82, durability: 105, repairCost: 220, colors: [0xdfbc85, 0x171412, 0x171718, 0xd99a35, 0xffbd45] }),
  defineCue({ id: 'hologram-prism', name: '全息棱镜', tipOffsetX: 19, price: 6_700, rarity: 'epic', power: 81, accuracy: 90, spin: 88, durability: 96, repairCost: 240, colors: [0xdfbf8e, 0xd9dedb, 0xbcccd1, 0x69b9c8, 0xffd35c] }),
  defineCue({ id: 'imperial-cloisonne', name: '皇家景泰蓝', tipOffsetX: 19, price: 7_300, rarity: 'epic', power: 85, accuracy: 87, spin: 84, durability: 110, repairCost: 260, colors: [0xe0bd86, 0x163a79, 0x183568, 0xc9a24b, 0xe45b3c] }),
  defineCue({ id: 'biomech-orchid', name: '生物机械兰', tipOffsetX: 19, price: 8_000, rarity: 'epic', power: 87, accuracy: 82, spin: 90, durability: 104, repairCost: 280, colors: [0xe0bd86, 0xb9b6b1, 0x3f283f, 0x9c6d77, 0x7639a6] }),

  defineCue({ id: 'dragon-emperor', name: '龙皇', tipOffsetX: 19, price: 16_000, rarity: 'legendary', power: 98, accuracy: 96, spin: 95, durability: 134, repairCost: 420, colors: [0xe2c18d, 0x171411, 0x631619, 0xc39b48, 0xe54231] }),
  defineCue({ id: 'sunken-atlantis', name: '沉海·亚特兰蒂斯', tipOffsetX: 19, price: 18_000, rarity: 'legendary', power: 95, accuracy: 99, spin: 97, durability: 128, repairCost: 500, colors: [0xe2c18e, 0x083c43, 0x132d46, 0xb68a50, 0x7fd5ce] }),
  defineCue({ id: 'cyber-sakura', name: '赛博樱花', tipOffsetX: 19, price: 17_000, rarity: 'legendary', power: 97, accuracy: 94, spin: 99, durability: 124, repairCost: 460, colors: [0xdfbd86, 0x161319, 0x8f225f, 0x2ed7db, 0xff5fae] }),
];

const CUE_RARITY_RANK: Record<CueRarity, number> = {
  starter: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
};

export function getCuePerformanceScore(cue: CueStyle): number {
  return Math.round((cue.power + cue.accuracy + cue.spin + Math.min(100, cue.durability)) / 4);
}

export function getCuesForCollection(): CueStyle[] {
  return [...CUE_CATALOG].sort((left, right) => (
    CUE_RARITY_RANK[right.rarity] - CUE_RARITY_RANK[left.rarity]
    || getCuePerformanceScore(right) - getCuePerformanceScore(left)
    || right.price - left.price
  ));
}

export const DEFAULT_PLAYER_WALLET: PlayerWallet = {
  coins: 260,
  lastCheckInDate: null,
  checkInDates: [],
  makeupCards: 0,
  makeupMatchProgress: 0,
  lastMakeupDate: null,
  monthlyMakeupCounts: {},
  checkInRewardClaims: [],
  aiCoinEarnedDate: null,
  aiCoinsEarned: 0,
  unlockedCueIds: [DEFAULT_EQUIPPED_CUE_ID],
  equippedCueId: DEFAULT_EQUIPPED_CUE_ID,
  cueDurability: {
    [DEFAULT_EQUIPPED_CUE_ID]: 50,
  },
  challengeRewardClaimed: false,
};

const cueIds = new Set(CUE_CATALOG.map((cue) => cue.id));

export function getCueStyle(cueId: string): CueStyle {
  return CUE_CATALOG.find((cue) => cue.id === cueId) ?? CUE_CATALOG[0];
}

export function getCueDurability(wallet: PlayerWallet, cueId: string): number {
  const cue = CUE_CATALOG.find((item) => item.id === cueId);
  if (!cue || !wallet.unlockedCueIds.includes(cueId)) {
    return 0;
  }
  return normalizeDurability(wallet.cueDurability?.[cueId], cue.durability);
}

export type MatchCoinMode = keyof typeof MATCH_COIN_RANGES;

export type MatchCoinResult = {
  wallet: PlayerWallet;
  rolledAmount: number;
  coinDelta: number;
  dailyLimitReached: boolean;
};

export function getDailyAiCoinsEarned(wallet: PlayerWallet, dateKey: string): number {
  return wallet.aiCoinEarnedDate === dateKey ? normalizeAiCoinsEarned(wallet.aiCoinsEarned) : 0;
}

export function applyMatchCoinResult(
  wallet: PlayerWallet,
  options: {
    mode: MatchCoinMode;
    won: boolean;
    dateKey: string;
    random?: () => number;
  },
): MatchCoinResult {
  const { mode, won, dateKey, random = Math.random } = options;
  const range = MATCH_COIN_RANGES[mode];
  const rolledAmount = randomIntegerInclusive(range.min, range.max, random);
  const earnedToday = getDailyAiCoinsEarned(wallet, dateKey);
  const amount = won && mode === 'ai'
    ? Math.min(rolledAmount, AI_DAILY_COIN_LIMIT - earnedToday)
    : rolledAmount;
  const nextCoins = won
    ? wallet.coins + amount
    : Math.max(0, wallet.coins - amount);
  const coinDelta = nextCoins - wallet.coins;
  const nextAiCoinsEarned = mode === 'ai' && won ? earnedToday + amount : earnedToday;
  const nextWallet = sanitizeWallet({
    ...wallet,
    coins: nextCoins,
    ...(mode === 'ai' ? {
      aiCoinEarnedDate: dateKey,
      aiCoinsEarned: nextAiCoinsEarned,
    } : {}),
  });

  return {
    wallet: nextWallet,
    rolledAmount,
    coinDelta,
    dailyLimitReached: mode === 'ai' && nextAiCoinsEarned >= AI_DAILY_COIN_LIMIT,
  };
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
): { wallet: PlayerWallet; equipped: boolean; reason?: 'locked' | 'not-found' | 'needs-repair' } {
  if (!cueIds.has(cueId)) {
    return { wallet, equipped: false, reason: 'not-found' };
  }
  if (!wallet.unlockedCueIds.includes(cueId)) {
    return { wallet, equipped: false, reason: 'locked' };
  }
  if (getCueDurability(wallet, cueId) <= 0) {
    return { wallet, equipped: false, reason: 'needs-repair' };
  }

  return {
    wallet: sanitizeWallet({ ...wallet, equippedCueId: cueId }),
    equipped: true,
  };
}

export function consumeEquippedCueDurability(
  wallet: PlayerWallet,
): { wallet: PlayerWallet; used: boolean; remaining: number; reason?: 'needs-repair' } {
  const cueId = wallet.equippedCueId;
  const remaining = getCueDurability(wallet, cueId);
  if (remaining <= 0) {
    return { wallet, used: false, remaining: 0, reason: 'needs-repair' };
  }

  const nextRemaining = remaining - 1;
  return {
    wallet: sanitizeWallet({
      ...wallet,
      cueDurability: {
        ...wallet.cueDurability,
        [cueId]: nextRemaining,
      },
    }),
    used: true,
    remaining: nextRemaining,
  };
}

export function repairCue(
  wallet: PlayerWallet,
  cueId: string,
): {
  wallet: PlayerWallet;
  repaired: boolean;
  reason?: 'not-found' | 'not-owned' | 'not-needed' | 'not-enough-coins';
} {
  const cue = CUE_CATALOG.find((item) => item.id === cueId);
  if (!cue) {
    return { wallet, repaired: false, reason: 'not-found' };
  }
  if (!wallet.unlockedCueIds.includes(cueId)) {
    return { wallet, repaired: false, reason: 'not-owned' };
  }
  if (getCueDurability(wallet, cueId) > 0) {
    return { wallet, repaired: false, reason: 'not-needed' };
  }
  if (wallet.coins < cue.repairCost) {
    return { wallet, repaired: false, reason: 'not-enough-coins' };
  }

  return {
    wallet: sanitizeWallet({
      ...wallet,
      coins: wallet.coins - cue.repairCost,
      cueDurability: {
        ...wallet.cueDurability,
        [cueId]: cue.durability,
      },
    }),
    repaired: true,
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
      .select('coins, last_check_in_date, check_in_dates, makeup_cards, makeup_match_progress, last_makeup_date, monthly_makeup_counts, check_in_reward_claims, ai_coin_earned_date, ai_coins_earned, unlocked_cue_ids, equipped_cue_id, cue_durability, challenge_reward_claimed')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) {
      const wallet = sanitizeWallet({
        coins: data.coins ?? undefined,
        lastCheckInDate: data.last_check_in_date,
        checkInDates: Array.isArray(data.check_in_dates) ? data.check_in_dates : undefined,
        makeupCards: data.makeup_cards ?? undefined,
        makeupMatchProgress: data.makeup_match_progress ?? undefined,
        lastMakeupDate: data.last_makeup_date,
        monthlyMakeupCounts: isRecord(data.monthly_makeup_counts)
          ? data.monthly_makeup_counts as Record<string, number>
          : undefined,
        checkInRewardClaims: Array.isArray(data.check_in_reward_claims) ? data.check_in_reward_claims : undefined,
        aiCoinEarnedDate: data.ai_coin_earned_date,
        aiCoinsEarned: data.ai_coins_earned ?? undefined,
        unlockedCueIds: Array.isArray(data.unlocked_cue_ids) ? data.unlocked_cue_ids : undefined,
        equippedCueId: data.equipped_cue_id ?? undefined,
        cueDurability: isRecord(data.cue_durability)
          ? data.cue_durability as Record<string, number>
          : undefined,
        challengeRewardClaimed: data.challenge_reward_claimed ?? undefined,
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
  const aiCoinEarnedDate = typeof wallet.aiCoinEarnedDate === 'string' ? wallet.aiCoinEarnedDate : null;
  const lastCheckInDate = normalizeDateKey(wallet.lastCheckInDate);

  return {
    coins: normalizeCoins(wallet.coins),
    lastCheckInDate,
    checkInDates: normalizeDateKeys(wallet.checkInDates, lastCheckInDate),
    makeupCards: normalizeNonNegativeInteger(wallet.makeupCards),
    makeupMatchProgress: normalizeIntegerRange(wallet.makeupMatchProgress, 0, 2),
    lastMakeupDate: normalizeDateKey(wallet.lastMakeupDate),
    monthlyMakeupCounts: normalizeMonthlyMakeupCounts(wallet.monthlyMakeupCounts),
    checkInRewardClaims: normalizeCheckInRewardClaims(wallet.checkInRewardClaims),
    aiCoinEarnedDate,
    aiCoinsEarned: aiCoinEarnedDate ? normalizeAiCoinsEarned(wallet.aiCoinsEarned) : 0,
    unlockedCueIds: unlocked,
    equippedCueId: equipped,
    cueDurability: normalizeCueDurability(wallet.cueDurability, unlocked),
    challengeRewardClaimed: wallet.challengeRewardClaimed === true,
  };
}

function normalizeCoins(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : DEFAULT_PLAYER_WALLET.coins;
}

function normalizeNonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalizeIntegerRange(value: unknown, minimum: number, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, Math.floor(value)))
    : minimum;
}

function normalizeDateKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? value
    : null;
}

function normalizeDateKeys(value: unknown, legacyDate: string | null): string[] {
  const entries = Array.isArray(value) ? value : [];
  const dates = entries.map(normalizeDateKey).filter((entry): entry is string => entry !== null);
  if (legacyDate) dates.push(legacyDate);
  return Array.from(new Set(dates)).sort();
}

function normalizeMonthlyMakeupCounts(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([month]) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    .map(([month, count]) => [month, normalizeIntegerRange(count, 0, 7)]));
}

function normalizeCheckInRewardClaims(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((entry): entry is string => (
    typeof entry === 'string' && (
      /^\d{4}-(0[1-9]|1[0-2]):(7|14|2[89]|3[01])$/.test(entry)
      || /^daily-v2:[1-9]\d*:(?:day:(?:[1-9]|[12]\d|30):(daily|makeup)|reward:(7|14|30))$/.test(entry)
    )
  )))).sort();
}

function normalizeAiCoinsEarned(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(AI_DAILY_COIN_LIMIT, Math.floor(value)))
    : 0;
}

function randomIntegerInclusive(minimum: number, maximum: number, random: () => number): number {
  const randomValue = random();
  const normalized = Number.isFinite(randomValue)
    ? Math.max(0, Math.min(0.9999999999999999, randomValue))
    : 0;
  return minimum + Math.floor(normalized * (maximum - minimum + 1));
}

function normalizeUnlockedCueIds(value: unknown): string[] {
  const ids = Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string' && cueIds.has(id))
    : [];
  return Array.from(new Set([DEFAULT_EQUIPPED_CUE_ID, ...ids]));
}

function normalizeCueDurability(value: unknown, unlockedCueIds: string[]): Record<string, number> {
  const source = isRecord(value) ? value : {};
  return Object.fromEntries(unlockedCueIds.map((cueId) => {
    const cue = getCueStyle(cueId);
    return [cueId, normalizeDurability(source[cueId], cue.durability)];
  }));
}

function normalizeDurability(value: unknown, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(maximum, Math.floor(value)))
    : maximum;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
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
      check_in_dates: sanitized.checkInDates,
      makeup_cards: sanitized.makeupCards,
      makeup_match_progress: sanitized.makeupMatchProgress,
      last_makeup_date: sanitized.lastMakeupDate,
      monthly_makeup_counts: sanitized.monthlyMakeupCounts,
      check_in_reward_claims: sanitized.checkInRewardClaims,
      ai_coin_earned_date: sanitized.aiCoinEarnedDate,
      ai_coins_earned: sanitized.aiCoinsEarned,
      unlocked_cue_ids: sanitized.unlockedCueIds,
      equipped_cue_id: sanitized.equippedCueId,
      cue_durability: sanitized.cueDurability,
      challenge_reward_claimed: sanitized.challengeRewardClaimed,
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
