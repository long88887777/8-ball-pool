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
      sx: 440,
      sy: 560,
      sw: 640,
      sh: 640,
    });
  });
});
