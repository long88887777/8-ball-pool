export const AVATAR_STORAGE_KEY = 'pool.avatarSelection.v1';

export type DefaultAvatarId =
  | 'default-01'
  | 'default-02'
  | 'default-03'
  | 'default-04'
  | 'default-05'
  | 'default-06';

export type DefaultAvatar = {
  id: DefaultAvatarId;
  label: string;
  src: string;
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
  { id: 'default-01', label: '蓝色球手', src: '/assets/avatars/default-01.webp' },
  { id: 'default-02', label: '白色球手', src: '/assets/avatars/default-02.webp' },
  { id: 'default-03', label: '清洁方块', src: '/assets/avatars/default-03.webp' },
  { id: 'default-04', label: '冠军球手', src: '/assets/avatars/default-04.webp' },
  { id: 'default-05', label: '手套握杆', src: '/assets/avatars/default-05.webp' },
  { id: 'default-06', label: '黑八女孩', src: '/assets/avatars/default-06.webp' },
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
