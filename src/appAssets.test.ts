import { describe, expect, it } from 'vitest';
import html from '../index.html?raw';
import favicon from '../public/favicon.svg?raw';
import posterBackgroundUrl from '../public/assets/pool-poster-background.webp?url';
import rareCheckInChestUrl from '../public/assets/check-in/chest-rare.webp?url';
import epicCheckInChestUrl from '../public/assets/check-in/chest-epic.webp?url';
import legendaryCheckInChestUrl from '../public/assets/check-in/chest-legendary.webp?url';
import checkInHeaderOrnamentsUrl from '../public/assets/check-in/billiards-header-ornaments-v2.png?url';
import dailyCheckInBackgroundUrl from '../public/assets/check-in/daily-checkin-bg-botanical-glasshouse.png?url';

describe('app static assets', () => {
  it('declares an available favicon asset', async () => {
    expect(html).toContain('href="/favicon.svg"');
    expect(favicon).toContain('<svg');
  });

  it('declares the menu title artwork asset', () => {
    expect(html).toContain('src="/assets/eight-ball-title-art.webp"');
  });

  it('declares an available poster artwork asset for the game background', () => {
    expect(posterBackgroundUrl).toContain('pool-poster-background');
  });

  it('bundles every monthly check-in chest quality', () => {
    expect([rareCheckInChestUrl, epicCheckInChestUrl, legendaryCheckInChestUrl]).toEqual([
      expect.stringContaining('chest-rare'),
      expect.stringContaining('chest-epic'),
      expect.stringContaining('chest-legendary'),
    ]);
  });

  it('bundles the daily check-in glasshouse background', () => {
    expect(dailyCheckInBackgroundUrl).toContain('daily-checkin-bg-botanical-glasshouse');
  });

  it('uses bright pool-themed artwork without a dead settings shortcut', () => {
    expect(checkInHeaderOrnamentsUrl).toContain('billiards-header-ornaments-v2');
    expect(html).toContain('src="/assets/check-in/billiards-header-ornaments-v2.png"');
    expect(html).toContain('id="checkin-rules-toggle"');
    expect(html).not.toContain('checkin-settings-shortcut');
  });
});
