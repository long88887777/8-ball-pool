import { describe, expect, it } from 'vitest';
import {
  readProfileAvatarSelection,
  uploadProfileAvatar,
  writeProfileAvatarSelection,
} from './avatarPersistence';

function createClient(options: {
  userId?: string | null;
  profileRow?: Record<string, unknown> | null;
  selectError?: unknown;
  updateError?: unknown;
  uploadError?: unknown;
} = {}) {
  const updates: unknown[] = [];
  const uploads: Array<{ path: string; file: Blob; options: unknown }> = [];
  const userId = options.userId === undefined ? 'user-1' : options.userId;

  const client = {
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: options.profileRow ?? null, error: options.selectError ?? null }),
        }),
      }),
      update: (payload: unknown) => ({
        eq: async () => {
          updates.push(payload);
          return { error: options.updateError ?? null };
        },
      }),
    }),
    storage: {
      from: () => ({
        upload: async (path: string, file: Blob, uploadOptions: unknown) => {
          uploads.push({ path, file, options: uploadOptions });
          return { data: { path }, error: options.uploadError ?? null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.example/${path}` } }),
      }),
    },
  };

  return { client, updates, uploads };
}

describe('avatar persistence', () => {
  it('reads signed-in profile avatar fields', async () => {
    const { client } = createClient({
      profileRow: {
        avatar_kind: 'default',
        avatar_id: 'default-03',
        avatar_url: null,
      },
    });

    await expect(readProfileAvatarSelection(client)).resolves.toEqual({ kind: 'default', id: 'default-03' });
  });

  it('returns null when there is no signed-in user', async () => {
    const { client } = createClient({ userId: null });

    await expect(readProfileAvatarSelection(client)).resolves.toBeNull();
  });

  it('writes a default avatar patch to the current profile', async () => {
    const { client, updates } = createClient();

    await writeProfileAvatarSelection(client, { kind: 'default', id: 'default-05' });

    expect(updates).toEqual([
      {
        avatar_kind: 'default',
        avatar_id: 'default-05',
        avatar_url: null,
      },
    ]);
  });

  it('uploads custom avatar blobs to a user-scoped storage path', async () => {
    const { client, uploads } = createClient();
    const blob = new Blob(['avatar'], { type: 'image/webp' });

    const result = await uploadProfileAvatar(client, blob);

    expect(result).toMatchObject({ ok: true });
    expect(result.ok ? result.url : '').toMatch(/^https:\/\/cdn\.example\/user-1\/avatar-/);
    expect(uploads[0].path).toMatch(/^user-1\/avatar-/);
    expect(uploads[0].options).toMatchObject({ contentType: 'image/webp', upsert: true });
  });

  it('falls back without throwing when avatar profile columns are not migrated yet', async () => {
    const { client } = createClient({
      selectError: { code: '42703', message: 'column profiles.avatar_kind does not exist' },
    });

    await expect(readProfileAvatarSelection(client)).resolves.toBeNull();
  });

  it('returns a storage-unavailable upload result when the avatar bucket is missing', async () => {
    const { client } = createClient({
      uploadError: { statusCode: '404', message: 'Bucket not found' },
    });
    const blob = new Blob(['avatar'], { type: 'image/webp' });

    await expect(uploadProfileAvatar(client, blob)).resolves.toEqual({
      ok: false,
      reason: 'storage-unavailable',
    });
  });
});
