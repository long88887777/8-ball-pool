export const AVATAR_STORAGE_KEY = 'pool.avatarSelection.v1';

export type DefaultAvatarId =
  | 'default-01'
  | 'default-02'
  | 'default-03'
  | 'default-04'
  | 'default-05'
  | 'default-06'
  | 'default-07'
  | 'default-08'
  | 'default-09'
  | 'default-10'
  | 'default-11'
  | 'default-12'
  | 'default-13'
  | 'default-14'
  | 'default-15'
  | 'default-16'
  | 'default-17'
  | 'default-18'
  | 'default-19'
  | 'default-20';

export type DefaultAvatar = {
  id: DefaultAvatarId;
  label: string;
  src: string;
  accent: string;
  motion: 'sparkle' | 'orbit' | 'ripple' | 'shimmer' | 'flutter';
};

export type AvatarSelection =
  | { kind: 'default'; id: DefaultAvatarId }
  | { kind: 'uploaded'; url: string };

export type AvatarProfileRow = {
  avatar_kind?: unknown;
  avatar_id?: unknown;
  avatar_url?: unknown;
};

export type AvatarStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const DEFAULT_AVATARS: DefaultAvatar[] = [
  { id: 'default-01', label: '琉光玉龙', src: '/assets/avatars/default-01.webp', accent: '#8ce6bf', motion: 'orbit' },
  { id: 'default-02', label: '绯樱狐刃', src: '/assets/avatars/default-02.webp', accent: '#ff7f78', motion: 'flutter' },
  { id: 'default-03', label: '极光雪狼', src: '/assets/avatars/default-03.webp', accent: '#89d5ff', motion: 'shimmer' },
  { id: 'default-04', label: '星航浣熊', src: '/assets/avatars/default-04.webp', accent: '#ffad69', motion: 'orbit' },
  { id: 'default-05', label: '琥珀猫头鹰', src: '/assets/avatars/default-05.webp', accent: '#e9c779', motion: 'sparkle' },
  { id: 'default-06', label: '铜齿钟兔', src: '/assets/avatars/default-06.webp', accent: '#d9a96e', motion: 'orbit' },
  { id: 'default-07', label: '霓光球后', src: '/assets/avatars/default-07.webp', accent: '#e79aff', motion: 'shimmer' },
  { id: 'default-08', label: '熔金雄狮', src: '/assets/avatars/default-08.webp', accent: '#ff944f', motion: 'ripple' },
  { id: 'default-09', label: '深海灵眸', src: '/assets/avatars/default-09.webp', accent: '#80e6e9', motion: 'ripple' },
  { id: 'default-10', label: '月影熊猫', src: '/assets/avatars/default-10.webp', accent: '#e4e9ed', motion: 'shimmer' },
  { id: 'default-11', label: '赤晶骑士', src: '/assets/avatars/default-11.webp', accent: '#ff628d', motion: 'orbit' },
  { id: 'default-12', label: '琉金甲虫', src: '/assets/avatars/default-12.webp', accent: '#f8cd4f', motion: 'sparkle' },
  { id: 'default-13', label: '海盗鹦鹉', src: '/assets/avatars/default-13.webp', accent: '#fa715d', motion: 'flutter' },
  { id: 'default-14', label: '琉璃夜猫', src: '/assets/avatars/default-14.webp', accent: '#53d6ab', motion: 'sparkle' },
  { id: 'default-15', label: '沙海狐猎', src: '/assets/avatars/default-15.webp', accent: '#f4b76b', motion: 'flutter' },
  { id: 'default-16', label: '水晶蝶灵', src: '/assets/avatars/default-16.webp', accent: '#cab3ff', motion: 'shimmer' },
  { id: 'default-17', label: '苔庭龟宗', src: '/assets/avatars/default-17.webp', accent: '#a4c878', motion: 'ripple' },
  { id: 'default-18', label: '霓虹球灵', src: '/assets/avatars/default-18.webp', accent: '#7be9ff', motion: 'orbit' },
  { id: 'default-19', label: '珊瑚小法师', src: '/assets/avatars/default-19.webp', accent: '#ff90c1', motion: 'flutter' },
  { id: 'default-20', label: '月影雪豹', src: '/assets/avatars/default-20.webp', accent: '#9bd6ff', motion: 'shimmer' },
];

const DEFAULT_AVATAR_IDS = new Set(DEFAULT_AVATARS.map((avatar) => avatar.id));

export function createDefaultAvatarSelection(): AvatarSelection {
  return { kind: 'default', id: 'default-01' };
}

export function isDefaultAvatarId(value: unknown): value is DefaultAvatarId {
  return typeof value === 'string' && DEFAULT_AVATAR_IDS.has(value as DefaultAvatarId);
}

export function sanitizeAvatarSelection(value: unknown): AvatarSelection {
  if (!value || typeof value !== 'object') {
    return createDefaultAvatarSelection();
  }

  const candidate = value as Partial<AvatarSelection>;
  if (candidate.kind === 'default' && isDefaultAvatarId(candidate.id)) {
    return { kind: 'default', id: candidate.id };
  }

  if (candidate.kind === 'uploaded' && typeof candidate.url === 'string' && candidate.url.trim().length > 0) {
    return { kind: 'uploaded', url: candidate.url.trim() };
  }

  return createDefaultAvatarSelection();
}

export function readStoredAvatarSelection(storage: Pick<AvatarStorage, 'getItem'>): AvatarSelection {
  try {
    const raw = storage.getItem(AVATAR_STORAGE_KEY);
    if (!raw) return createDefaultAvatarSelection();
    return sanitizeAvatarSelection(JSON.parse(raw) as unknown);
  } catch {
    return createDefaultAvatarSelection();
  }
}

export function writeStoredAvatarSelection(
  storage: AvatarStorage,
  selection: AvatarSelection,
): AvatarSelection {
  const sanitized = sanitizeAvatarSelection(selection);
  try {
    storage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(sanitized));
  } catch {
    // Keep the current in-memory avatar usable even if persistence is unavailable.
  }
  return sanitized;
}

export function profileRowToAvatarSelection(row: AvatarProfileRow | null | undefined): AvatarSelection {
  if (!row) return createDefaultAvatarSelection();
  if (row.avatar_kind === 'default') {
    return sanitizeAvatarSelection({ kind: 'default', id: row.avatar_id });
  }
  if (row.avatar_kind === 'uploaded') {
    return sanitizeAvatarSelection({ kind: 'uploaded', url: row.avatar_url });
  }
  return createDefaultAvatarSelection();
}

export function avatarSelectionToProfilePatch(selection: AvatarSelection): Record<string, string | null> {
  const sanitized = sanitizeAvatarSelection(selection);
  if (sanitized.kind === 'uploaded') {
    return {
      avatar_kind: 'uploaded',
      avatar_id: null,
      avatar_url: sanitized.url,
    };
  }

  return {
    avatar_kind: 'default',
    avatar_id: sanitized.id,
    avatar_url: null,
  };
}

export function resolveAvatarSrc(selection: AvatarSelection): string {
  const sanitized = sanitizeAvatarSelection(selection);
  if (sanitized.kind === 'uploaded') return sanitized.url;
  return DEFAULT_AVATARS.find((avatar) => avatar.id === sanitized.id)?.src ?? DEFAULT_AVATARS[0].src;
}
