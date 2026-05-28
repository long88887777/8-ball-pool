import {
  avatarSelectionToProfilePatch,
  profileRowToAvatarSelection,
  type AvatarSelection,
} from './avatar';

type SupabaseAvatarClient = {
  auth: {
    getUser(): PromiseLike<{ data: { user: { id: string } | null } }>;
  };
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        single(): PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
    update(payload: unknown): {
      eq(column: string, value: string): PromiseLike<{ error: unknown }>;
    };
  };
  storage?: {
    from(bucket: string): {
      upload(
        path: string,
        file: Blob,
        options: { contentType: string; upsert: boolean },
      ): PromiseLike<{ data: unknown; error: unknown }>;
      getPublicUrl(path: string): { data: { publicUrl: string } };
    };
  };
};

export type AvatarUploadFailureReason = 'not-signed-in' | 'storage-unavailable' | 'upload-failed';

export type AvatarUploadResult =
  | { ok: true; url: string }
  | { ok: false; reason: AvatarUploadFailureReason };

export async function readProfileAvatarSelection(supabase: unknown): Promise<AvatarSelection | null> {
  const client = asSupabaseAvatarClient(supabase);
  if (!client) return null;
  const userId = await getSupabaseUserId(client);
  if (!userId) return null;

  try {
    const { data, error } = await client
      .from('profiles')
      .select('avatar_kind, avatar_id, avatar_url')
      .eq('id', userId)
      .single();
    if (error || !data) return null;
    return profileRowToAvatarSelection(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function writeProfileAvatarSelection(
  supabase: unknown,
  selection: AvatarSelection,
): Promise<boolean> {
  const client = asSupabaseAvatarClient(supabase);
  if (!client) return false;
  const userId = await getSupabaseUserId(client);
  if (!userId) return false;

  try {
    const { error } = await client
      .from('profiles')
      .update(avatarSelectionToProfilePatch(selection))
      .eq('id', userId);
    return !error;
  } catch {
    return false;
  }
}

export async function uploadProfileAvatar(supabase: unknown, blob: Blob): Promise<AvatarUploadResult> {
  const client = asSupabaseAvatarClient(supabase);
  if (!client?.storage) return { ok: false, reason: 'storage-unavailable' };
  const userId = await getSupabaseUserId(client);
  if (!userId) return { ok: false, reason: 'not-signed-in' };

  const extension = blob.type === 'image/png' ? 'png' : 'webp';
  const path = `${userId}/avatar-${Date.now()}.${extension}`;
  try {
    const bucket = client.storage.from('profile-avatars');
    const { error } = await bucket.upload(path, blob, {
      contentType: blob.type || 'image/webp',
      upsert: true,
    });
    if (error) return { ok: false, reason: classifyUploadFailure(error) };
    const publicUrl = bucket.getPublicUrl(path).data.publicUrl;
    return publicUrl
      ? { ok: true, url: publicUrl }
      : { ok: false, reason: 'upload-failed' };
  } catch (error) {
    return { ok: false, reason: classifyUploadFailure(error) };
  }
}

function asSupabaseAvatarClient(value: unknown): SupabaseAvatarClient | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SupabaseAvatarClient>;
  return candidate.auth && typeof candidate.from === 'function'
    ? candidate as SupabaseAvatarClient
    : null;
}

async function getSupabaseUserId(supabase: SupabaseAvatarClient): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

function classifyUploadFailure(error: unknown): AvatarUploadFailureReason {
  if (!error || typeof error !== 'object') return 'upload-failed';
  const details = error as Record<string, unknown>;
  const statusCode = details.statusCode ?? details.status;
  const message = typeof details.message === 'string' ? details.message.toLowerCase() : '';
  if (statusCode === 404 || statusCode === '404' || message.includes('bucket not found')) {
    return 'storage-unavailable';
  }
  return 'upload-failed';
}
