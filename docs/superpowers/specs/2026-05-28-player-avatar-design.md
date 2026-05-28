# Player Avatar System Design

**Date**: 2026-05-28
**Status**: Approved
**Depends on**: Main menu shell, auth/profile table, Supabase client, local guest mode

## Goal

Add a player avatar system to the pool game. Players can open a dedicated profile panel, choose one of six built-in default avatars, or upload their own image and crop/zoom it into a 320x320 avatar. Signed-in users keep the avatar synced with their account; guest users keep it in local browser storage.

## Player Experience

The main menu shows the current player identity with an avatar and profile entry. Opening the profile panel displays the current avatar, nickname/record summary, six built-in default avatars, and an upload action. Selecting a default avatar applies it immediately after save. Uploading a local image opens a crop interface where the player can drag the image, zoom it with a slider, preview the circular UI crop, and save a 320x320 result.

Avatars should feel like first-class game assets, not temporary UI decorations. The built-in default avatars are the six provided billiards-themed images from `C:/Users/86182/Desktop/aa/`:

- `台球游戏默认头像合集.png`
- `台球游戏默认头像合集 (1).png`
- `台球游戏默认头像合集 (2).png`
- `台球游戏默认头像合集 (3).png`
- `台球游戏默认头像合集 (4).png`
- `台球游戏默认头像合集 (5).png`

## Scope

### Included

- Dedicated profile panel opened from the main menu player/profile area.
- Built-in avatar catalog with the six provided images.
- Asset preparation for each default avatar as 320x320 thumbnails, with crop positions chosen so the subject reads well and source watermarks are not visible in normal avatar display.
- Avatar display in menu/profile surfaces, using circular presentation with a consistent border treatment.
- Upload flow using a file picker for image files.
- Crop/zoom interface for uploaded images:
  - square crop workspace
  - circular mask preview
  - drag-to-position
  - zoom slider
  - save/cancel actions
  - 320x320 output canvas
- Persistence:
  - signed-in users sync avatar metadata/image through Supabase
  - guest users persist avatar data locally
- Basic error/empty states for failed reads, invalid files, unsupported formats, and unavailable storage.
- Focused tests for avatar model/storage helpers and crop math.

### Not Included

- Animated avatars.
- Paid/avatar unlock economy.
- Public moderation workflow for uploaded images.
- Friend list, social profile pages, or avatar sharing.
- Server-side image transformation service.
- Full nickname editing unless it is already trivial to expose from the profile panel without expanding scope.

## Product Decisions

### Profile Entry

Use the independent profile panel direction. The menu should present the avatar as part of the player identity area, with a clear "个人资料" or edit action. This keeps avatar management separate from control settings and leaves room for future profile content such as titles, rank badges, and richer stats.

### Default Avatar Assets

The six provided images become the built-in avatar catalog. The implementation should not ship the original large images directly in normal UI paths. Prepare 320x320 optimized assets in `public/assets/avatars/` and reference those assets from TypeScript metadata.

The source images include visible generation watermarks in the bottom-right corner. The 320x320 crops must avoid or remove those watermarks from the avatar view. If a square crop cannot avoid a watermark while preserving the subject, use a manual crop region that prioritizes the avatar subject and excludes the watermark.

### Uploaded Avatar Storage

Uploaded avatars are also normalized to 320x320. The UI displays them as circles, but the stored output remains a square image so it can be reused in different surfaces. Use `image/webp` or `image/png` depending on browser support and project compatibility; prefer a compact format for local/Supabase storage.

### Signed-In vs Guest

Signed-in users:

- store selected default avatar id or uploaded avatar URL/data reference with the Supabase profile
- load the avatar during `loadUserProfile`
- update the menu/profile display after save

Guest users:

- store selected default avatar id or uploaded avatar data URL in local storage
- do not require auth
- keep the same profile panel behavior, with a local-storage note only if persistence fails

## Architecture

### Avatar Model

Add a small avatar model module, for example `src/player/avatar.ts`:

```ts
export type AvatarSelection =
  | { kind: 'default'; id: DefaultAvatarId }
  | { kind: 'uploaded'; url: string };

export type DefaultAvatar = {
  id: DefaultAvatarId;
  label: string;
  src: string;
};
```

The module owns:

- default avatar catalog
- fallback avatar selection
- validation/sanitization for unknown persisted values
- local storage read/write helpers for guest mode

### Profile Persistence

Extend `public.profiles` with avatar fields. Keep the schema minimal:

- `avatar_kind text not null default 'default'`
- `avatar_id text`
- `avatar_url text`

`avatar_kind` values are `default` and `uploaded`. For a default avatar, `avatar_id` is set and `avatar_url` is null. For uploaded avatars, `avatar_url` points at the stored uploaded asset and `avatar_id` may be null.

If Supabase Storage is available, uploaded signed-in avatars should be stored in a profile avatar bucket and `avatar_url` should hold the public or signed-access URL used by the client. If storage setup is not available in the first implementation pass, the fallback is to store uploaded avatars locally for guests and keep signed-in custom upload behind a clear error state until storage exists. Default avatar selection should still sync through the profile table.

### Cropper Module

Add a cropper helper, for example `src/player/avatarCrop.ts`, with pure math for:

- fitting an image into the crop workspace
- applying zoom bounds
- translating drag offsets
- computing the source rectangle for the 320x320 output

The DOM cropper in `main.ts` or a small profile UI module uses these helpers and draws the saved result to a canvas.

### UI Integration

Keep the UI in the current framework-free DOM style:

- add profile panel markup to `index.html`
- add styles to `src/styles.css`
- wire handlers from `src/main.ts` or a small extracted `src/profile/profilePanel.ts`

The profile panel should include:

- current avatar preview
- nickname/record summary
- default avatar grid
- upload button and hidden file input
- cropper state when an uploaded image is selected
- save/cancel controls
- short feedback row for errors or save status

Avoid embedding large image data into HTML. Use catalog metadata and DOM creation where practical.

## Data Flow

### Loading

1. App starts and auth state is resolved.
2. If signed in, `loadUserProfile` reads `profiles.nickname`, wins/losses, and avatar fields.
3. If guest, avatar selection is read from local storage.
4. The menu/profile avatar preview renders the sanitized selection.
5. If stored data is missing or invalid, use the first default avatar.

### Selecting A Default Avatar

1. Player opens profile panel.
2. Player selects one of the six default avatars.
3. Panel updates preview immediately.
4. Player saves.
5. Signed-in users update `profiles.avatar_kind/avatar_id/avatar_url`.
6. Guests update local storage.
7. Menu/profile avatar refreshes without reloading the page.

### Uploading A Custom Avatar

1. Player clicks upload and selects an image.
2. Client validates file type and decodes it.
3. Cropper opens with the image fit into the crop area.
4. Player drags and zooms until the circular preview looks right.
5. Saving draws the crop to a 320x320 canvas.
6. Signed-in users upload the generated image to Supabase Storage and update profile fields.
7. Guests store the generated data URL locally.
8. Menu/profile avatar refreshes.

## Error Handling

- Unsupported file type: show "请选择图片文件。"
- Decode failure: show "图片读取失败，请换一张再试。"
- File too large: either reject with a friendly message or downscale before canvas work.
- Canvas export failure: keep the cropper open and show "头像生成失败。"
- Supabase update failure: keep the local preview unchanged or revert to the previous saved avatar and show a save failure message.
- Storage upload unavailable: default avatar selection remains available; custom upload shows an actionable error.
- Local storage failure: avatar still works for the current session but warns that it may not persist.

## Security And Privacy

Uploaded images are selected locally by the player. Do not transmit guest uploads. Signed-in uploads should only be sent to the configured Supabase project after the player clicks save.

Use strict file type checks and avoid executing any file content. Draw images to canvas and export normalized image data instead of preserving original files. Supabase row-level policies must only allow users to update their own profile avatar fields. Storage paths should be user-scoped by auth uid.

This feature does not solve public content moderation. If avatars become visible to other players in online matches, add moderation or reporting before broad social exposure.

## Testing Strategy

### Unit Tests

- Avatar catalog contains six default avatars and a stable fallback.
- Persisted avatar selections sanitize unknown ids/kinds to fallback.
- Guest local storage read/write handles malformed JSON and storage exceptions.
- Crop math preserves a square output and clamps zoom/offset bounds.
- Canvas export helper handles failure paths where possible with dependency injection.

### UI/Manual Checks

- Open as guest, select each default avatar, reload, verify the chosen avatar remains.
- Sign in, select a default avatar, reload or sign out/sign in, verify sync.
- Upload a wide image, crop/zoom, save, verify the circular preview matches the cropper.
- Upload a tall image, crop/zoom, save, verify no distortion.
- Try a non-image file and verify a friendly error.
- Verify menu/profile layout on desktop and mobile widths.
- Verify the shipped default thumbnails are 320x320 and visually avoid the source watermark.

### Build Verification

- `npm test`
- `npm run build`

## Acceptance Criteria

- The profile panel opens from the main menu player identity area.
- Six provided default avatars are available as optimized 320x320 game assets.
- Selecting and saving a default avatar updates the current menu/profile display.
- Uploading an image opens a crop/zoom UI and saves a 320x320 avatar result.
- Guest avatar choices persist locally.
- Signed-in default avatar choices sync through Supabase profiles.
- Signed-in custom uploads either sync through Supabase Storage or show a clear storage-unavailable error while preserving default-avatar functionality.
- Existing gameplay, menu flow, settings, growth, history, recharge, and cue shop flows keep working.
- Tests and build pass.

## File Impact Summary

| Type | Path | Purpose |
| ---- | ---- | ------- |
| Add | `public/assets/avatars/*.png` or `*.webp` | Six optimized 320x320 default avatars |
| Add | `src/player/avatar.ts` | Avatar catalog, selection model, sanitizers, guest persistence |
| Add | `src/player/avatarCrop.ts` | Pure crop/zoom math and output helpers |
| Modify | `supabase/migrations/*` | Add avatar fields to `profiles`; optionally create storage policies |
| Modify | `src/main.ts` | Load/render avatar, open profile panel, save selection/upload |
| Modify | `index.html` | Profile panel and cropper markup |
| Modify | `src/styles.css` | Profile panel, avatar grid, cropper, previews |
| Add/Modify | `*.test.ts` | Avatar model, crop math, persistence coverage |

## Deferred Follow-Ups

- Nickname editing in the same profile panel.
- Rank badges/titles next to avatars.
- Avatar display in online opponent HUD.
- Avatar unlocks from achievements or events.
- Moderation/reporting if custom avatars become visible to other players.
