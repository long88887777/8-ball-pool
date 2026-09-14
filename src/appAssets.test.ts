import { describe, expect, it } from 'vitest';
import html from '../index.html?raw';
import favicon from '../public/favicon.svg?raw';
import posterBackgroundUrl from '../public/assets/pool-poster-background.webp?url';
import rareCheckInChestUrl from '../public/assets/check-in/chest-rare.webp?url';
import epicCheckInChestUrl from '../public/assets/check-in/chest-epic.webp?url';
import legendaryCheckInChestUrl from '../public/assets/check-in/chest-legendary.webp?url';
import checkInHeaderOrnamentsUrl from '../public/assets/check-in/billiards-header-ornaments-v2.png?url';
import dailyCheckInBackgroundUrl from '../public/assets/check-in/daily-checkin-bg-botanical-glasshouse.png?url';
import menuMusicUrl from '../public/assets/audio/menu-beautiful-things.mp3?url';
import gameMusicUrl from '../public/assets/audio/game-gentle-study-flow.mp3?url';
import backgroundPianoLoopUrl from '../public/assets/audio/game-background-piano-loop.mp3?url';
import softPianoUrl from '../public/assets/audio/game-soft-piano.mp3?url';

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

  it('bundles the selected menu and gameplay piano tracks', () => {
    expect(menuMusicUrl).toContain('menu-beautiful-things');
    expect([gameMusicUrl, backgroundPianoLoopUrl, softPianoUrl]).toEqual([
      expect.stringContaining('game-gentle-study-flow'),
      expect.stringContaining('game-background-piano-loop'),
      expect.stringContaining('game-soft-piano'),
    ]);
  });

  it('offers music and sound effect controls from the in-game pause panel', () => {
    expect(html).toContain('id="game-music-volume"');
    expect(html).toContain('id="game-sound-volume"');
    expect(html).toContain('击球、碰撞、碰库与落袋');
  });

  it('uses bright pool-themed artwork without a dead settings shortcut', () => {
    expect(checkInHeaderOrnamentsUrl).toContain('billiards-header-ornaments-v2');
    expect(html).toContain('src="/assets/check-in/billiards-header-ornaments-v2.png"');
    expect(html).toContain('id="checkin-rules-toggle"');
    expect(html).not.toContain('checkin-settings-shortcut');
  });
});
