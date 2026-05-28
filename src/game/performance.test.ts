import { describe, expect, it } from 'vitest';

import {
  applyPerformanceProfileToConfig,
  createPoolGamePerformanceProfile,
  detectPowerProfile,
} from './performance';

describe('pool game performance profile', () => {
  it('limits mobile and tablet devices to a low-power game loop', () => {
    const profile = createPoolGamePerformanceProfile({
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)',
      maxTouchPoints: 5,
      viewportWidth: 1180,
    });

    expect(profile).toEqual({
      profile: 'mobile',
      fps: {
        target: 30,
        limit: 30,
        smoothStep: true,
      },
      render: {
        antialiasGL: false,
        powerPreference: 'low-power',
      },
      autoRound: true,
    });
  });

  it('treats desktop browsers as standard performance targets', () => {
    const profile = createPoolGamePerformanceProfile({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      maxTouchPoints: 0,
      viewportWidth: 1440,
    });

    expect(profile.fps.limit).toBe(0);
    expect(profile.fps.target).toBe(60);
    expect(profile.render.powerPreference).toBe('default');
    expect(profile.autoRound).toBe(false);
  });

  it('detects large touch tablets even when they use a desktop-style user agent', () => {
    expect(detectPowerProfile({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      maxTouchPoints: 5,
      viewportWidth: 1024,
    })).toBe('mobile');
  });

  it('applies low-power settings without replacing unrelated Phaser config', () => {
    const config = applyPerformanceProfileToConfig(
      {
        width: 1100,
        height: 640,
        backgroundColor: '#10100e',
        scale: { mode: 1, autoCenter: 1 },
      },
      createPoolGamePerformanceProfile({
        userAgent: 'Mozilla/5.0 (Linux; Android 15)',
        maxTouchPoints: 5,
        viewportWidth: 900,
      }),
    );

    expect(config).toMatchObject({
      width: 1100,
      height: 640,
      backgroundColor: '#10100e',
      fps: {
        target: 30,
        limit: 30,
      },
      render: {
        antialiasGL: false,
        powerPreference: 'low-power',
      },
      scale: {
        mode: 1,
        autoCenter: 1,
        autoRound: true,
      },
    });
  });
});
