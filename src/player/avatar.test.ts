import { describe, expect, it } from 'vitest';
import {
  AVATAR_STORAGE_KEY,
  DEFAULT_AVATARS,
  createDefaultAvatarSelection,
  profileRowToAvatarSelection,
  readStoredAvatarSelection,
  sanitizeAvatarSelection,
  writeStoredAvatarSelection,
} from './avatar';

function createStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    data,
  };
}

describe('avatar model', () => {
  it('exposes six built-in avatar assets with stable ids', () => {
    expect(DEFAULT_AVATARS.map((avatar) => avatar.id)).toEqual([
      'default-01',
      'default-02',
      'default-03',
      'default-04',
      'default-05',
      'default-06',
    ]);
    expect(DEFAULT_AVATARS.every((avatar) => avatar.src.endsWith('.webp'))).toBe(true);
  });

  it('sanitizes unknown persisted selections to the fallback default', () => {
    expect(sanitizeAvatarSelection({ kind: 'default', id: 'missing' })).toEqual(createDefaultAvatarSelection());
    expect(sanitizeAvatarSelection({ kind: 'uploaded', url: '' })).toEqual(createDefaultAvatarSelection());
    expect(sanitizeAvatarSelection(null)).toEqual(createDefaultAvatarSelection());
  });

  it('reads and writes guest avatar selection in local storage', () => {
    const storage = createStorage();

    const saved = writeStoredAvatarSelection(storage, { kind: 'default', id: 'default-04' });

    expect(saved).toEqual({ kind: 'default', id: 'default-04' });
    expect(JSON.parse(storage.data.get(AVATAR_STORAGE_KEY)!)).toEqual({ kind: 'default', id: 'default-04' });
    expect(readStoredAvatarSelection(storage)).toEqual({ kind: 'default', id: 'default-04' });
  });

  it('maps profile rows into sanitized avatar selections', () => {
    expect(profileRowToAvatarSelection({
      avatar_kind: 'default',
      avatar_id: 'default-02',
      avatar_url: null,
    })).toEqual({ kind: 'default', id: 'default-02' });

    expect(profileRowToAvatarSelection({
      avatar_kind: 'uploaded',
      avatar_id: null,
      avatar_url: 'https://example.com/avatar.webp',
    })).toEqual({ kind: 'uploaded', url: 'https://example.com/avatar.webp' });
  });
});
