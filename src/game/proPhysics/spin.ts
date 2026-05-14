import type { Vector } from '../constants';

export type CueSpinPreset = 'center' | 'high' | 'low' | 'left' | 'right';

const PRESET_OFFSET = 0.85;
const CUE_MODEL_VERTICAL_OFFSET = 0.5;
const CUE_MODEL_SIDE_OFFSET = 0.12;

export const SPIN_PRESETS: Record<CueSpinPreset, Vector> = {
  center: { x: 0, y: 0 },
  high: { x: 0, y: PRESET_OFFSET },
  low: { x: 0, y: -PRESET_OFFSET },
  left: { x: -PRESET_OFFSET, y: 0 },
  right: { x: PRESET_OFFSET, y: 0 },
};

export function normalizeCueContactOffset(offset: Vector = SPIN_PRESETS.center): Vector {
  if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y)) {
    return { ...SPIN_PRESETS.center };
  }

  const clamped = {
    x: Math.max(-1, Math.min(offset.x, 1)),
    y: Math.max(-1, Math.min(offset.y, 1)),
  };
  const length = Math.hypot(clamped.x, clamped.y);

  if (length <= 1) {
    return clamped;
  }

  return {
    x: clamped.x / length,
    y: clamped.y / length,
  };
}

export function scaleContactOffsetForCueModel(offset: Vector = SPIN_PRESETS.center): Vector {
  const normalized = normalizeCueContactOffset(offset);

  return {
    x: -normalized.x * CUE_MODEL_SIDE_OFFSET,
    y: normalized.y * CUE_MODEL_VERTICAL_OFFSET,
  };
}

export function contactOffsetMatchesPreset(
  offset: Vector,
  preset: CueSpinPreset,
  tolerance = 0.02,
): boolean {
  const normalized = normalizeCueContactOffset(offset);
  const expected = SPIN_PRESETS[preset];

  return Math.hypot(normalized.x - expected.x, normalized.y - expected.y) <= tolerance;
}
