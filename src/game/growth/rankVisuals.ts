import { RANKS } from './stats';

export type RankName = (typeof RANKS)[number]['name'];

const VALID_RANKS = new Set<string>(RANKS.map((rank) => rank.name));

export function normalizeRankName(value: unknown): RankName {
  return typeof value === 'string' && VALID_RANKS.has(value) ? value as RankName : 'D-';
}

export function rankFamily(rankName: RankName): 'd' | 'c' | 'b' | 'a' | 's' {
  return rankName.startsWith('D') ? 'd'
    : rankName.startsWith('C') ? 'c'
      : rankName.startsWith('B') ? 'b'
        : rankName.startsWith('A') ? 'a'
          : 's';
}

export function rankBadgeMarkup(value: unknown, compact = false): string {
  const rankName = normalizeRankName(value);
  const family = rankFamily(rankName);
  const modifier = rankName.endsWith('-') ? 'minus' : rankName.endsWith('+') ? 'plus' : 'core';
  const assetName = rankName.toLowerCase()
    .replace('-', '-minus')
    .replace('+', '-plus');

  return `<span class="rank-badge rank-badge--${family} rank-badge--${modifier}${compact ? ' rank-badge--compact' : ''}" data-rank="${rankName}" aria-label="${rankName} 段位徽章">
    <img src="/assets/ranks/dragon-break/${assetName}.webp" alt="" decoding="async" />
  </span>`;
}

export function rankThemeName(rankName: RankName): string {
  const family = rankFamily(rankName);
  return ({
    d: '赤铜初芒',
    c: '青玉流云',
    b: '蓝晶龙翼',
    a: '金羽天冠',
    s: '龙凰破界',
  } as const)[family];
}
