import type Phaser from 'phaser';

export type RuntimeProfileInput = {
  userAgent?: string;
  maxTouchPoints?: number;
  viewportWidth?: number;
};

export type PowerProfile = 'standard' | 'mobile';

export type PoolGamePerformanceProfile = {
  profile: PowerProfile;
  fps: {
    target: number;
    limit: number;
    smoothStep: boolean;
  };
  render: {
    antialiasGL: boolean;
    powerPreference: 'default' | 'low-power';
  };
  autoRound: boolean;
};

const MOBILE_USER_AGENT_PATTERN =
  /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle|PlayBook|Windows Phone/i;

export function detectPowerProfile(input: RuntimeProfileInput): PowerProfile {
  const userAgent = input.userAgent ?? '';
  const maxTouchPoints = input.maxTouchPoints ?? 0;
  const viewportWidth = input.viewportWidth ?? Number.POSITIVE_INFINITY;
  const looksMobile = MOBILE_USER_AGENT_PATTERN.test(userAgent);
  const looksTablet = maxTouchPoints > 1 && viewportWidth <= 1366;

  return looksMobile || looksTablet ? 'mobile' : 'standard';
}

export function createPoolGamePerformanceProfile(input: RuntimeProfileInput): PoolGamePerformanceProfile {
  const profile = detectPowerProfile(input);

  if (profile === 'mobile') {
    return {
      profile,
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
    };
  }

  return {
    profile,
    fps: {
      target: 60,
      limit: 0,
      smoothStep: true,
    },
    render: {
      antialiasGL: true,
      powerPreference: 'default',
    },
    autoRound: false,
  };
}

export function createBrowserPerformanceProfile(): PoolGamePerformanceProfile {
  const nav = window.navigator;
  return createPoolGamePerformanceProfile({
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints,
    viewportWidth: window.innerWidth,
  });
}

export function applyPerformanceProfileToConfig(
  config: Phaser.Types.Core.GameConfig,
  profile: PoolGamePerformanceProfile,
): Phaser.Types.Core.GameConfig {
  return {
    ...config,
    fps: {
      ...profile.fps,
      ...(config.fps ?? {}),
    },
    render: {
      ...profile.render,
      ...(config.render ?? {}),
    },
    scale: {
      ...(config.scale ?? {}),
      autoRound: profile.autoRound,
    },
  };
}
