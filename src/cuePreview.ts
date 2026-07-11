export interface CuePreviewCue {
  id: string;
  name: string;
  assetPath: string;
  rarity: string;
}

export interface CuePreviewState {
  open: boolean;
  cue: CuePreviewCue | null;
}

export function openCuePreview(cue: CuePreviewCue): CuePreviewState {
  return { open: true, cue };
}

export function closeCuePreview(): CuePreviewState {
  return { open: false, cue: null };
}

export function isCuePreviewEscape(key: string): boolean {
  return key === 'Escape';
}
