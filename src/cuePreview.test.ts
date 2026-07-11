import { describe, expect, it } from 'vitest';

import { closeCuePreview, isCuePreviewEscape, openCuePreview } from './cuePreview';

describe('cue detail preview state', () => {
  it('opens with the selected cue and closes without losing the cue metadata contract', () => {
    const cue = {
      id: 'classic-maple',
      name: 'Classic Maple',
      assetPath: 'assets/cues/cue-classic-maple.png',
      rarity: 'starter',
    } as const;

    expect(openCuePreview(cue)).toEqual({ open: true, cue });
    expect(closeCuePreview()).toEqual({ open: false, cue: null });
  });

  it('recognizes Escape as the preview close shortcut', () => {
    expect(isCuePreviewEscape('Escape')).toBe(true);
    expect(isCuePreviewEscape('Enter')).toBe(false);
  });
});
