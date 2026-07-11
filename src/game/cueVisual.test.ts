import { describe, expect, it } from 'vitest';
import { CUE_CATALOG } from './economy';
import { computeCueSpritePose } from './cueVisual';

describe('cue sprite pose', () => {
  it('anchors the visible cue tip behind the cue ball at the requested pullback', () => {
    const style = CUE_CATALOG[0];
    const pose = computeCueSpritePose({ x: 320, y: 240 }, 0, 40, style);

    expect(pose.textureKey).toBe('cue-classic-maple');
    expect(pose.x).toBeCloseTo(275);
    expect(pose.y).toBeCloseTo(240);
    expect(pose.rotation).toBeCloseTo(Math.PI);
    expect(pose.originX).toBeCloseTo(65 / 2172);
    expect(pose.originY).toBe(0.5);
    expect(pose.displayWidth).toBe(470);
    expect(pose.displayHeight).toBeCloseTo((470 * 160) / 2172);
  });

  it('keeps the tip alignment when the shot direction rotates', () => {
    const pose = computeCueSpritePose({ x: 320, y: 240 }, Math.PI / 2, 40, CUE_CATALOG[1]);

    expect(pose.x).toBeCloseTo(320);
    expect(pose.y).toBeCloseTo(195);
    expect(pose.rotation).toBeCloseTo((Math.PI * 3) / 2);
  });
});
