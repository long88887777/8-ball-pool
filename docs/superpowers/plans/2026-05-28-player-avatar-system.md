# Player Avatar System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a player avatar system with six built-in 320x320 default avatars, a profile panel, and uploaded-image crop/zoom support.

**Architecture:** Keep the implementation framework-free and aligned with the current menu shell. Split pure avatar selection and crop math into small testable modules, then wire them into the existing `main.ts` menu/profile flow. Persist guest state in local storage and signed-in state through Supabase profile fields plus a `profile-avatars` storage bucket for uploaded images.

**Tech Stack:** TypeScript, Vite, Vitest, Supabase JS, browser canvas APIs, Sharp for one-time/default asset generation.

---

## File Structure

Create or modify these files:

- `scripts/prepare-default-avatars.mjs`: one-time asset generator for the six provided source images.
- `public/assets/avatars/default-01.webp` through `default-06.webp`: optimized 320x320 built-in avatar assets.
- `src/player/avatar.ts`: default avatar catalog, selection model, sanitizers, local guest storage helpers, Supabase row mapping helpers.
- `src/player/avatar.test.ts`: unit tests for catalog, sanitization, and local persistence.
- `src/player/avatarCrop.ts`: pure crop/zoom math used by the UI cropper and tests.
- `src/player/avatarCrop.test.ts`: unit tests for crop math and clamping.
- `src/player/avatarPersistence.ts`: signed-in profile avatar read/write and storage upload helpers.
- `src/player/avatarPersistence.test.ts`: mocked Supabase tests for default selection and upload paths.
- `supabase/migrations/202605280001_add_profile_avatars.sql`: avatar fields and storage bucket/policies.
- `index.html`: profile panel and cropper markup.
- `src/styles.css`: profile panel, avatar grid, and cropper styles.
- `src/main.ts`: load/render avatar state, wire profile panel events, save default/upload selections.
- `src/main.test.ts`: lightweight DOM/helper coverage for menu-shell avatar display if helper functions are placed in `menuShell.ts`.
- `package.json` and `package-lock.json`: add `sharp` as a dev dependency for the asset script.

Keep all new player-profile helpers under `src/player/` so avatar logic is not mixed into physics, economy, or growth modules.

---

## Task 1: Generate Built-In Avatar Assets

**Files:**
- Create: `scripts/prepare-default-avatars.mjs`
- Create: `public/assets/avatars/default-01.webp`
- Create: `public/assets/avatars/default-02.webp`
- Create: `public/assets/avatars/default-03.webp`
- Create: `public/assets/avatars/default-04.webp`
- Create: `public/assets/avatars/default-05.webp`
- Create: `public/assets/avatars/default-06.webp`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install the image generation dependency**

Run:

```bash
npm install --save-dev sharp
```

Expected:

- `package.json` gains `sharp` in `devDependencies`.
- `package-lock.json` updates.

- [ ] **Step 2: Add the asset preparation script**

Create `scripts/prepare-default-avatars.mjs`:

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const sourceDir = process.env.AVATAR_SOURCE_DIR ?? 'C:/Users/86182/Desktop/aa';
const outputDir = path.resolve('public/assets/avatars');

const avatars = [
  {
    file: '台球游戏默认头像合集.png',
    output: 'default-01.webp',
    crop: { left: 360, top: 120, width: 980, height: 980 },
  },
  {
    file: '台球游戏默认头像合集 (1).png',
    output: 'default-02.webp',
    crop: { left: 300, top: 160, width: 980, height: 980 },
  },
  {
    file: '台球游戏默认头像合集 (2).png',
    output: 'default-03.webp',
    crop: { left: 280, top: 150, width: 1000, height: 1000 },
  },
  {
    file: '台球游戏默认头像合集 (3).png',
    output: 'default-04.webp',
    crop: { left: 220, top: 150, width: 1000, height: 1000 },
  },
  {
    file: '台球游戏默认头像合集 (4).png',
    output: 'default-05.webp',
    crop: { left: 120, top: 190, width: 1080, height: 1080 },
  },
  {
    file: '台球游戏默认头像合集 (5).png',
    output: 'default-06.webp',
    crop: { left: 360, top: 70, width: 980, height: 980 },
  },
];

await fs.mkdir(outputDir, { recursive: true });

for (const avatar of avatars) {
  const input = path.join(sourceDir, avatar.file);
  const output = path.join(outputDir, avatar.output);
  await sharp(input)
    .extract(avatar.crop)
    .resize(320, 320, { fit: 'cover' })
    .webp({ quality: 88 })
    .toFile(output);
  console.log(`wrote ${output}`);
}
```

- [ ] **Step 3: Run the asset preparation script**

Run:

```bash
node scripts/prepare-default-avatars.mjs
```

Expected:

- Six files are written under `public/assets/avatars/`.
- Each file is 320x320.

- [ ] **Step 4: Verify dimensions**

Run:

```bash
node -e "import sharp from 'sharp'; const files=['default-01.webp','default-02.webp','default-03.webp','default-04.webp','default-05.webp','default-06.webp']; for (const f of files) { const m = await sharp('public/assets/avatars/'+f).metadata(); console.log(f, m.width, m.height); if (m.width !== 320 || m.height !== 320) process.exit(1); }"
```

Expected output includes:

```text
default-01.webp 320 320
default-02.webp 320 320
default-03.webp 320 320
default-04.webp 320 320
default-05.webp 320 320
default-06.webp 320 320
```

- [ ] **Step 5: Commit the asset preparation slice**

Run:

```bash
git add package.json package-lock.json scripts/prepare-default-avatars.mjs public/assets/avatars
git commit -m "feat: add default avatar assets"
```

---

## Task 2: Add Avatar Selection Model

**Files:**
- Create: `src/player/avatar.ts`
- Create: `src/player/avatar.test.ts`

- [ ] **Step 1: Write failing avatar model tests**

Create `src/player/avatar.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
npm test -- src/player/avatar.test.ts
```

Expected:

- FAIL because `src/player/avatar.ts` does not exist.

- [ ] **Step 3: Implement the avatar model**

Create `src/player/avatar.ts`:

```ts
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
```

- [ ] **Step 4: Run avatar model tests**

Run:

```bash
npm test -- src/player/avatar.test.ts
```

Expected:

- PASS for all tests in `src/player/avatar.test.ts`.

- [ ] **Step 5: Commit the avatar model slice**

Run:

```bash
git add src/player/avatar.ts src/player/avatar.test.ts
git commit -m "feat: add avatar selection model"
```

---

## Task 3: Add Crop And Zoom Math

**Files:**
- Create: `src/player/avatarCrop.ts`
- Create: `src/player/avatarCrop.test.ts`

- [ ] **Step 1: Write failing crop math tests**

Create `src/player/avatarCrop.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  clampCropState,
  createInitialCropState,
  resolveCropSourceRect,
  updateCropZoom,
} from './avatarCrop';

describe('avatar crop math', () => {
  it('fits a wide image into a square crop frame', () => {
    const state = createInitialCropState({ width: 1600, height: 900 }, 320);

    expect(state.zoom).toBeCloseTo(0.3556, 3);
    expect(state.offsetX).toBe(0);
    expect(state.offsetY).toBe(0);
  });

  it('clamps drag offsets so the crop frame remains covered', () => {
    const state = clampCropState({
      imageWidth: 1600,
      imageHeight: 900,
      frameSize: 320,
      zoom: 0.5,
      offsetX: 1000,
      offsetY: -1000,
    });

    expect(state.offsetX).toBeLessThanOrEqual(240);
    expect(state.offsetY).toBeGreaterThanOrEqual(-65);
  });

  it('updates zoom around the current crop center and clamps the result', () => {
    const initial = createInitialCropState({ width: 800, height: 1200 }, 320);
    const zoomed = updateCropZoom(initial, 2);

    expect(zoomed.zoom).toBe(2);
    expect(zoomed.offsetX).toBe(0);
    expect(Math.abs(zoomed.offsetY)).toBeLessThanOrEqual(1040);
  });

  it('resolves a bounded source rectangle for a 320 output', () => {
    const state = {
      imageWidth: 1600,
      imageHeight: 1600,
      frameSize: 320,
      zoom: 0.5,
      offsetX: 20,
      offsetY: -40,
    };

    expect(resolveCropSourceRect(state)).toEqual({
      sx: 280,
      sy: 400,
      sw: 640,
      sh: 640,
    });
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
npm test -- src/player/avatarCrop.test.ts
```

Expected:

- FAIL because `src/player/avatarCrop.ts` does not exist.

- [ ] **Step 3: Implement crop math**

Create `src/player/avatarCrop.ts`:

```ts
export type ImageSize = {
  width: number;
  height: number;
};

export type CropState = {
  imageWidth: number;
  imageHeight: number;
  frameSize: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
};

export type CropSourceRect = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

export const MIN_AVATAR_ZOOM = 0.01;
export const MAX_AVATAR_ZOOM = 4;
export const AVATAR_OUTPUT_SIZE = 320;

export function createInitialCropState(image: ImageSize, frameSize: number): CropState {
  const zoom = Math.max(frameSize / image.width, frameSize / image.height);
  return clampCropState({
    imageWidth: image.width,
    imageHeight: image.height,
    frameSize,
    zoom,
    offsetX: 0,
    offsetY: 0,
  });
}

export function updateCropZoom(state: CropState, zoom: number): CropState {
  return clampCropState({
    ...state,
    zoom: clampNumber(zoom, minimumCoverZoom(state), MAX_AVATAR_ZOOM),
  });
}

export function moveCrop(state: CropState, deltaX: number, deltaY: number): CropState {
  return clampCropState({
    ...state,
    offsetX: state.offsetX + deltaX,
    offsetY: state.offsetY + deltaY,
  });
}

export function clampCropState(state: CropState): CropState {
  const zoom = clampNumber(state.zoom, minimumCoverZoom(state), MAX_AVATAR_ZOOM);
  const renderedWidth = state.imageWidth * zoom;
  const renderedHeight = state.imageHeight * zoom;
  const maxOffsetX = Math.max(0, (renderedWidth - state.frameSize) / 2);
  const maxOffsetY = Math.max(0, (renderedHeight - state.frameSize) / 2);

  return {
    ...state,
    zoom,
    offsetX: clampNumber(state.offsetX, -maxOffsetX, maxOffsetX),
    offsetY: clampNumber(state.offsetY, -maxOffsetY, maxOffsetY),
  };
}

export function resolveCropSourceRect(state: CropState): CropSourceRect {
  const clamped = clampCropState(state);
  const sourceSize = clamped.frameSize / clamped.zoom;
  const centerX = clamped.imageWidth / 2 - clamped.offsetX / clamped.zoom;
  const centerY = clamped.imageHeight / 2 - clamped.offsetY / clamped.zoom;
  const sx = clampNumber(centerX - sourceSize / 2, 0, clamped.imageWidth - sourceSize);
  const sy = clampNumber(centerY - sourceSize / 2, 0, clamped.imageHeight - sourceSize);

  return {
    sx: Math.round(sx),
    sy: Math.round(sy),
    sw: Math.round(sourceSize),
    sh: Math.round(sourceSize),
  };
}

function minimumCoverZoom(state: Pick<CropState, 'imageWidth' | 'imageHeight' | 'frameSize'>): number {
  return Math.max(MIN_AVATAR_ZOOM, state.frameSize / state.imageWidth, state.frameSize / state.imageHeight);
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
```

- [ ] **Step 4: Run crop math tests**

Run:

```bash
npm test -- src/player/avatarCrop.test.ts
```

Expected:

- PASS for all tests in `src/player/avatarCrop.test.ts`.

- [ ] **Step 5: Commit the crop math slice**

Run:

```bash
git add src/player/avatarCrop.ts src/player/avatarCrop.test.ts
git commit -m "feat: add avatar crop math"
```

---

## Task 4: Add Supabase Profile Avatar Persistence

**Files:**
- Create: `supabase/migrations/202605280001_add_profile_avatars.sql`
- Create: `src/player/avatarPersistence.ts`
- Create: `src/player/avatarPersistence.test.ts`

- [ ] **Step 1: Add the database and storage migration**

Create `supabase/migrations/202605280001_add_profile_avatars.sql`:

```sql
alter table public.profiles
  add column if not exists avatar_kind text not null default 'default',
  add column if not exists avatar_id text,
  add column if not exists avatar_url text;

alter table public.profiles
  drop constraint if exists profiles_avatar_kind_check;

alter table public.profiles
  add constraint profiles_avatar_kind_check
  check (avatar_kind in ('default', 'uploaded'));

update public.profiles
set avatar_kind = 'default',
    avatar_id = coalesce(avatar_id, 'default-01')
where avatar_kind = 'default'
  and avatar_id is null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  1048576,
  array['image/png', 'image/webp', 'image/jpeg']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload own profile avatars" on storage.objects;
create policy "Users can upload own profile avatars"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update own profile avatars" on storage.objects;
create policy "Users can update own profile avatars"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Anyone can read profile avatars" on storage.objects;
create policy "Anyone can read profile avatars"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'profile-avatars');
```

- [ ] **Step 2: Write failing persistence tests**

Create `src/player/avatarPersistence.test.ts`:

```ts
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

    const url = await uploadProfileAvatar(client, blob);

    expect(url).toMatch(/^https:\/\/cdn\.example\/user-1\/avatar-/);
    expect(uploads[0].path).toMatch(/^user-1\/avatar-/);
    expect(uploads[0].options).toMatchObject({ contentType: 'image/webp', upsert: true });
  });
});
```

- [ ] **Step 3: Run failing persistence tests**

Run:

```bash
npm test -- src/player/avatarPersistence.test.ts
```

Expected:

- FAIL because `src/player/avatarPersistence.ts` does not exist.

- [ ] **Step 4: Implement persistence helpers**

Create `src/player/avatarPersistence.ts`:

```ts
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
      upload(path: string, file: Blob, options: { contentType: string; upsert: boolean }): PromiseLike<{ data: unknown; error: unknown }>;
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
```

- [ ] **Step 5: Run persistence tests**

Run:

```bash
npm test -- src/player/avatarPersistence.test.ts
```

Expected:

- PASS for all tests in `src/player/avatarPersistence.test.ts`.

- [ ] **Step 6: Commit the persistence slice**

Run:

```bash
git add supabase/migrations/202605280001_add_profile_avatars.sql src/player/avatarPersistence.ts src/player/avatarPersistence.test.ts
git commit -m "feat: persist player avatars"
```

---

## Task 5: Add Profile Panel Markup And Styles

**Files:**
- Modify: `index.html`
- Modify: `src/styles.css`

- [ ] **Step 1: Add profile entry markup to the menu user bar**

In `index.html`, replace the current `.menu-user-bar` contents with:

```html
<button id="profile-open" class="menu-profile-btn" type="button" aria-label="打开个人资料">
  <img id="menu-avatar" class="menu-avatar" src="/assets/avatars/default-01.webp" alt="" />
  <span id="user-info" class="user-info" hidden></span>
</button>
<button id="btn-logout" class="menu-logout-btn" type="button">退出登录</button>
```

- [ ] **Step 2: Add the profile panel markup**

Add this section near the existing menu overlays, before `#growth-panel`:

```html
<section id="profile-panel" class="profile-panel-overlay" hidden>
  <div class="profile-panel-dialog">
    <div class="profile-panel-header">
      <div>
        <p class="eyebrow">Profile</p>
        <h2>个人资料</h2>
      </div>
      <button id="profile-close" class="profile-panel-close" type="button" aria-label="关闭">&times;</button>
    </div>
    <div class="profile-summary-row">
      <img id="profile-avatar-preview" class="profile-avatar-preview" src="/assets/avatars/default-01.webp" alt="当前头像" />
      <div>
        <strong id="profile-name">游客玩家</strong>
        <span id="profile-record">本地存档</span>
      </div>
    </div>
    <div class="profile-section">
      <h3>默认头像</h3>
      <div id="profile-avatar-grid" class="profile-avatar-grid" role="listbox" aria-label="默认头像"></div>
    </div>
    <div class="profile-section">
      <h3>上传头像</h3>
      <input id="profile-avatar-upload" type="file" accept="image/*" hidden />
      <button id="profile-avatar-upload-btn" class="profile-upload-btn" type="button">选择相册图片</button>
      <div id="profile-cropper" class="profile-cropper" hidden>
        <div id="profile-crop-frame" class="profile-crop-frame">
          <img id="profile-crop-image" class="profile-crop-image" alt="" />
          <span class="profile-crop-mask" aria-hidden="true"></span>
          <span class="profile-crop-ring" aria-hidden="true"></span>
        </div>
        <label class="profile-slider-row">
          <span>缩放</span>
          <input id="profile-crop-zoom" type="range" min="0" max="4" step="0.01" />
        </label>
      </div>
    </div>
    <p id="profile-feedback" class="profile-feedback" aria-live="polite"></p>
    <div class="profile-actions">
      <button id="profile-cancel" type="button">取消</button>
      <button id="profile-save" type="button" class="primary">保存头像</button>
    </div>
  </div>
</section>
```

- [ ] **Step 3: Add profile styles**

Add styles to `src/styles.css`:

```css
.menu-profile-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  padding: 6px 12px 6px 6px;
  color: #1d1d1f;
  cursor: pointer;
}

.menu-avatar,
.profile-avatar-preview {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(29, 29, 31, 0.12);
  background: #101512;
}

.profile-panel-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(10, 13, 11, 0.55);
  backdrop-filter: blur(12px);
}

.profile-panel-overlay[hidden] {
  display: none;
}

.profile-panel-dialog {
  width: min(760px, 96vw);
  max-height: min(860px, 92vh);
  overflow: auto;
  border-radius: 18px;
  background: rgba(250, 249, 246, 0.96);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.22);
  padding: 22px;
}

.profile-panel-header,
.profile-summary-row,
.profile-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.profile-panel-close {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  background: rgba(29, 29, 31, 0.08);
  color: #1d1d1f;
  cursor: pointer;
}

.profile-summary-row {
  justify-content: flex-start;
  margin: 18px 0;
  padding: 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.68);
}

.profile-avatar-preview {
  width: 80px;
  height: 80px;
}

.profile-summary-row strong,
.profile-summary-row span {
  display: block;
}

.profile-summary-row span {
  margin-top: 4px;
  color: #6e6e73;
}

.profile-section {
  margin-top: 18px;
}

.profile-section h3 {
  margin: 0 0 10px;
  font-size: 15px;
}

.profile-avatar-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(70px, 1fr));
  gap: 10px;
}

.profile-avatar-option {
  border: 2px solid transparent;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.7);
  padding: 8px;
  cursor: pointer;
}

.profile-avatar-option.is-selected {
  border-color: #d8b85f;
}

.profile-avatar-option img {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}

.profile-upload-btn {
  width: 100%;
  border: 1px dashed rgba(29, 29, 31, 0.28);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  padding: 14px;
  cursor: pointer;
}

.profile-cropper {
  margin-top: 14px;
}

.profile-crop-frame {
  position: relative;
  width: min(360px, 100%);
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 16px;
  background: #101512;
  touch-action: none;
}

.profile-crop-image {
  position: absolute;
  left: 50%;
  top: 50%;
  transform-origin: center;
  user-select: none;
  pointer-events: none;
}

.profile-crop-mask {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, transparent 0 36%, rgba(0, 0, 0, 0.58) 36.5%);
}

.profile-crop-ring {
  position: absolute;
  inset: 14%;
  border: 2px solid #f2cf73;
  border-radius: 50%;
}

.profile-slider-row {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 12px;
  align-items: center;
  margin-top: 12px;
}

.profile-feedback {
  min-height: 20px;
  color: #9b332b;
}

.profile-actions {
  justify-content: flex-end;
}

.profile-actions button {
  border: 1px solid rgba(29, 29, 31, 0.16);
  border-radius: 10px;
  padding: 10px 14px;
  background: white;
  cursor: pointer;
}

.profile-actions .primary {
  border-color: #d8b85f;
  background: #d8b85f;
  color: #17150f;
}

@media (max-width: 640px) {
  .profile-avatar-grid {
    grid-template-columns: repeat(3, minmax(70px, 1fr));
  }
}
```

- [ ] **Step 4: Run a build check for markup/style syntax**

Run:

```bash
npm run build
```

Expected:

- Build completes. The new markup and CSS should not require TypeScript wiring to compile.

- [ ] **Step 5: Commit the markup/style slice**

Run:

```bash
git add index.html src/styles.css
git commit -m "feat: add profile avatar panel"
```

---

## Task 6: Wire Avatar UI Into Main Menu Flow

**Files:**
- Modify: `src/main.ts`
- Modify: `src/menuShell.ts` if small render helper functions are preferred
- Modify: `src/main.test.ts` if helper functions are added

- [ ] **Step 1: Add main-level imports and state**

In `src/main.ts`, add imports:

```ts
import {
  DEFAULT_AVATARS,
  createDefaultAvatarSelection,
  readStoredAvatarSelection,
  resolveAvatarSrc,
  writeStoredAvatarSelection,
  type AvatarSelection,
  type DefaultAvatarId,
} from './player/avatar';
import {
  AVATAR_OUTPUT_SIZE,
  createInitialCropState,
  moveCrop,
  resolveCropSourceRect,
  updateCropZoom,
  type CropState,
} from './player/avatarCrop';
import {
  readProfileAvatarSelection,
  uploadProfileAvatar,
  writeProfileAvatarSelection,
} from './player/avatarPersistence';
```

Near current menu state variables, add:

```ts
let currentAvatarSelection: AvatarSelection = createDefaultAvatarSelection();
let pendingAvatarSelection: AvatarSelection = currentAvatarSelection;
let cropState: CropState | null = null;
let cropImageElement: HTMLImageElement | null = null;
let cropSourceImage: HTMLImageElement | null = null;
let cropDragStart: { x: number; y: number; state: CropState } | null = null;
```

- [ ] **Step 2: Add avatar rendering helpers**

Add these helpers in `src/main.ts` near other menu rendering helpers:

```ts
function renderAvatarSelection(selection: AvatarSelection): void {
  currentAvatarSelection = selection;
  const src = resolveAvatarSrc(selection);
  const menuAvatar = document.getElementById('menu-avatar') as HTMLImageElement | null;
  const profilePreview = document.getElementById('profile-avatar-preview') as HTMLImageElement | null;
  if (menuAvatar) menuAvatar.src = src;
  if (profilePreview) profilePreview.src = src;
}

function renderProfilePanel(): void {
  pendingAvatarSelection = currentAvatarSelection;
  const name = document.getElementById('profile-name');
  const record = document.getElementById('profile-record');
  if (name) name.textContent = currentProfileName;
  if (record) {
    const summary = summarizeStats(currentStats);
    record.textContent = guestMode
      ? '游客玩家 | 本地存档'
      : `${summary.wins}胜 ${summary.losses}负 (${summary.winRate}%)`;
  }
  renderProfileAvatarGrid();
  renderAvatarSelection(pendingAvatarSelection);
  setProfileFeedback('');
}

function renderProfileAvatarGrid(): void {
  const grid = document.getElementById('profile-avatar-grid');
  if (!grid) return;
  grid.replaceChildren(...DEFAULT_AVATARS.map((avatar) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `profile-avatar-option${pendingAvatarSelection.kind === 'default' && pendingAvatarSelection.id === avatar.id ? ' is-selected' : ''}`;
    button.dataset.avatarId = avatar.id;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(pendingAvatarSelection.kind === 'default' && pendingAvatarSelection.id === avatar.id));

    const img = document.createElement('img');
    img.src = avatar.src;
    img.alt = avatar.label;
    button.append(img);
    return button;
  }));
}

function setProfileFeedback(message: string): void {
  const feedback = document.getElementById('profile-feedback');
  if (feedback) feedback.textContent = message;
}
```

- [ ] **Step 3: Add profile panel show/hide/save helpers**

Add:

```ts
function showProfilePanel(): void {
  renderProfilePanel();
  const panel = document.getElementById('profile-panel');
  if (panel) panel.hidden = false;
}

function hideProfilePanel(): void {
  const panel = document.getElementById('profile-panel');
  if (panel) panel.hidden = true;
  resetProfileCropper();
  renderAvatarSelection(currentAvatarSelection);
}

async function saveProfileAvatar(): Promise<void> {
  setProfileFeedback('正在保存头像...');
  if (guestMode) {
    currentAvatarSelection = writeStoredAvatarSelection(browserStorage(), pendingAvatarSelection);
    renderAvatarSelection(currentAvatarSelection);
    hideProfilePanel();
    return;
  }

  const saved = await writeProfileAvatarSelection(supabase, pendingAvatarSelection);
  if (!saved) {
    setProfileFeedback('头像保存失败，请稍后重试。');
    return;
  }
  currentAvatarSelection = pendingAvatarSelection;
  writeStoredAvatarSelection(browserStorage(), currentAvatarSelection);
  renderAvatarSelection(currentAvatarSelection);
  hideProfilePanel();
}
```

- [ ] **Step 4: Load avatar state with the user profile**

In `loadUserProfile`, after signed-in profile data is read, also read avatar selection:

```ts
const remoteAvatar = await readProfileAvatarSelection(supabase);
currentAvatarSelection = remoteAvatar ?? readStoredAvatarSelection(browserStorage());
renderAvatarSelection(currentAvatarSelection);
```

In the no-user branch, add:

```ts
currentAvatarSelection = readStoredAvatarSelection(browserStorage());
renderAvatarSelection(currentAvatarSelection);
```

- [ ] **Step 5: Add cropper helpers**

Add:

```ts
function resetProfileCropper(): void {
  cropState = null;
  cropImageElement = null;
  cropSourceImage = null;
  cropDragStart = null;
  const cropper = document.getElementById('profile-cropper');
  if (cropper) cropper.hidden = true;
}

async function handleProfileUpload(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) {
    setProfileFeedback('请选择图片文件。');
    return;
  }

  const image = new Image();
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('decode failed'));
      image.src = url;
    });
    cropSourceImage = image;
    cropState = createInitialCropState({ width: image.naturalWidth, height: image.naturalHeight }, 320);
    cropImageElement = document.getElementById('profile-crop-image') as HTMLImageElement | null;
    if (cropImageElement) cropImageElement.src = url;
    const cropper = document.getElementById('profile-cropper');
    if (cropper) cropper.hidden = false;
    updateCropperDom();
    setProfileFeedback('');
  } catch {
    URL.revokeObjectURL(url);
    setProfileFeedback('图片读取失败，请换一张再试。');
  }
}

function updateCropperDom(): void {
  if (!cropState || !cropImageElement) return;
  cropImageElement.style.width = `${cropState.imageWidth * cropState.zoom}px`;
  cropImageElement.style.height = `${cropState.imageHeight * cropState.zoom}px`;
  cropImageElement.style.transform = `translate(calc(-50% + ${cropState.offsetX}px), calc(-50% + ${cropState.offsetY}px))`;
  const zoom = document.getElementById('profile-crop-zoom') as HTMLInputElement | null;
  if (zoom) {
    zoom.min = String(Math.max(320 / cropState.imageWidth, 320 / cropState.imageHeight));
    zoom.value = String(cropState.zoom);
  }
}

async function saveCroppedAvatar(): Promise<AvatarSelection | null> {
  if (!cropState || !cropSourceImage) return pendingAvatarSelection;
  const rect = resolveCropSourceRect(cropState);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_OUTPUT_SIZE;
  canvas.height = AVATAR_OUTPUT_SIZE;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(
    cropSourceImage,
    rect.sx,
    rect.sy,
    rect.sw,
    rect.sh,
    0,
    0,
    AVATAR_OUTPUT_SIZE,
    AVATAR_OUTPUT_SIZE,
  );

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', 0.9);
  });
  if (!blob) return null;

  if (guestMode) {
    const dataUrl = canvas.toDataURL('image/webp', 0.9);
    return { kind: 'uploaded', url: dataUrl };
  }

  const uploadedUrl = await uploadProfileAvatar(supabase, blob);
  return uploadedUrl ? { kind: 'uploaded', url: uploadedUrl } : null;
}
```

Before writing default selections in `saveProfileAvatar`, resolve pending uploaded crop:

```ts
const cropped = await saveCroppedAvatar();
if (!cropped) {
  setProfileFeedback('头像生成失败。');
  return;
}
pendingAvatarSelection = cropped;
```

- [ ] **Step 6: Wire event listeners in `init`**

In `init`, add:

```ts
document.getElementById('profile-open')?.addEventListener('click', showProfilePanel);
document.getElementById('profile-close')?.addEventListener('click', hideProfilePanel);
document.getElementById('profile-cancel')?.addEventListener('click', hideProfilePanel);
document.getElementById('profile-save')?.addEventListener('click', () => {
  void saveProfileAvatar();
});
document.getElementById('profile-avatar-grid')?.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null;
  const button = target?.closest<HTMLButtonElement>('[data-avatar-id]');
  const avatarId = button?.dataset.avatarId as DefaultAvatarId | undefined;
  if (!avatarId) return;
  pendingAvatarSelection = { kind: 'default', id: avatarId };
  resetProfileCropper();
  renderProfileAvatarGrid();
  renderAvatarSelection(pendingAvatarSelection);
});
document.getElementById('profile-avatar-upload-btn')?.addEventListener('click', () => {
  (document.getElementById('profile-avatar-upload') as HTMLInputElement | null)?.click();
});
document.getElementById('profile-avatar-upload')?.addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) void handleProfileUpload(file);
  input.value = '';
});
document.getElementById('profile-crop-zoom')?.addEventListener('input', (event) => {
  if (!cropState) return;
  const input = event.target as HTMLInputElement;
  cropState = updateCropZoom(cropState, Number(input.value));
  updateCropperDom();
});
```

Add pointer handling:

```ts
const cropFrame = document.getElementById('profile-crop-frame');
cropFrame?.addEventListener('pointerdown', (event) => {
  if (!cropState) return;
  cropDragStart = { x: event.clientX, y: event.clientY, state: cropState };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
});
cropFrame?.addEventListener('pointermove', (event) => {
  if (!cropDragStart) return;
  cropState = moveCrop(
    cropDragStart.state,
    event.clientX - cropDragStart.x,
    event.clientY - cropDragStart.y,
  );
  updateCropperDom();
});
cropFrame?.addEventListener('pointerup', () => {
  cropDragStart = null;
});
cropFrame?.addEventListener('pointercancel', () => {
  cropDragStart = null;
});
```

- [ ] **Step 7: Run TypeScript build**

Run:

```bash
npm run build
```

Expected:

- PASS. Fix any `noUnusedLocals`, strict null checks, or DOM typing issues before continuing.

- [ ] **Step 8: Commit the UI wiring slice**

Run:

```bash
git add src/main.ts index.html src/styles.css
git commit -m "feat: wire profile avatar UI"
```

---

## Task 7: Final Verification And Manual Browser Check

**Files:**
- Modify only files needed for fixes found during verification.

- [ ] **Step 1: Run focused avatar tests**

Run:

```bash
npm test -- src/player/avatar.test.ts src/player/avatarCrop.test.ts src/player/avatarPersistence.test.ts
```

Expected:

- PASS for all avatar tests.

- [ ] **Step 2: Run the full test suite**

Run:

```bash
npm test
```

Expected:

- PASS for all tests.

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected:

- PASS with Vite build output under `dist/`.

- [ ] **Step 4: Start the dev server**

Run:

```bash
npm run dev
```

Expected:

- Vite serves the app on `http://127.0.0.1:5173/` or the next available port.

- [ ] **Step 5: Browser-check guest default avatar selection**

Open the dev server in the in-app browser and verify:

- auth page opens when signed out
- clicking `游客模式` opens the main menu
- menu user bar shows the default avatar
- clicking the profile identity opens the profile panel
- clicking each of the six avatars updates the preview
- saving a default avatar closes the panel and updates the menu avatar
- reloading keeps the guest avatar from local storage

- [ ] **Step 6: Browser-check upload cropper**

In guest mode:

- open profile panel
- click `选择相册图片`
- choose a wide image
- drag the crop frame
- move the zoom slider
- save
- verify the circular menu avatar matches the crop preview

Then repeat with a tall image.

- [ ] **Step 7: Browser-check signed-in default sync**

With a signed-in test account:

- open profile panel
- choose a default avatar
- save
- reload
- verify the same avatar is loaded from Supabase profile fields

If Supabase Storage is configured, upload a custom image and verify the saved `avatar_url` loads after refresh. If storage is not configured, verify the UI shows `头像保存失败，请稍后重试。` and default avatar saving still works.

- [ ] **Step 8: Clean up runtime**

Stop any dev server started in Step 4 unless intentionally handing it to the user. If leaving it running for user testing, report the URL and PID.

- [ ] **Step 9: Commit verification fixes**

If verification required fixes, run:

```bash
git add <fixed-files>
git commit -m "fix: polish avatar profile flow"
```

If no fixes were required, do not create an empty commit.

---

## Self-Review Checklist

- Spec coverage:
  - Six provided default avatars are covered by Task 1.
  - 320x320 optimized output is covered by Task 1 verification.
  - Avatar model, guest storage, and fallback behavior are covered by Task 2.
  - Crop/zoom math and 320x320 crop output are covered by Task 3 and Task 6.
  - Signed-in profile fields, Supabase Storage upload, and RLS/storage policies are covered by Task 4.
  - Independent profile panel is covered by Task 5.
  - Main menu loading, rendering, save behavior, and cropper events are covered by Task 6.
  - Full tests, build, browser checks, and runtime cleanup are covered by Task 7.
- Completion marker scan: no unfinished marker text or vague implementation steps are intentionally left.
- Type consistency:
  - `DefaultAvatarId`, `AvatarSelection`, and `CropState` are introduced before use.
  - `readProfileAvatarSelection`, `writeProfileAvatarSelection`, and `uploadProfileAvatar` signatures match the call sites in `main.ts`.
  - Storage keys and public asset paths are stable and versioned.
