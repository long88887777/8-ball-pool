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

export async function uploadProfileAvatar(supabase: unknown, blob: Blob): Promise<string | null> {
  const client = asSupabaseAvatarClient(supabase);
  if (!client?.storage) return null;
  const userId = await getSupabaseUserId(client);
  if (!userId) return null;

  const extension = blob.type === 'image/png' ? 'png' : 'webp';
  const path = `${userId}/avatar-${Date.now()}.${extension}`;
  try {
    const bucket = client.storage.from('profile-avatars');
    const { error } = await bucket.upload(path, blob, {
      contentType: blob.type || 'image/webp',
      upsert: true,
    });
    if (error) return null;
    return bucket.getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
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
