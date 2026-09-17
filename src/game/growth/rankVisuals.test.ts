import { describe, expect, it } from 'vitest';
import { normalizeRankName, rankBadgeMarkup, rankFamily, rankThemeName } from './rankVisuals';

describe('rank honor badge presentation', () => {
  it('creates distinct family and subdivision markup for every rank', () => {
    expect(rankBadgeMarkup('D-')).toContain('rank-badge--d rank-badge--minus');
    expect(rankBadgeMarkup('A+')).toContain('rank-badge--a rank-badge--plus');
    expect(rankBadgeMarkup('SSS')).toContain('data-rank="SSS"');
    expect(rankBadgeMarkup('D-')).toContain('/assets/ranks/dragon-break/d-minus.webp');
    expect(rankBadgeMarkup('SSS')).toContain('/assets/ranks/dragon-break/sss.webp');
  });

  it('sanitizes network-provided rank names', () => {
    expect(normalizeRankName('<script>')).toBe('D-');
    expect(rankFamily('B+')).toBe('b');
    expect(rankThemeName('S')).toBe('龙凰破界');
  });
});
