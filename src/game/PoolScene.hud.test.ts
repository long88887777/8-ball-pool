import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class {
      game = { registry: { get: vi.fn() }, loop: { delta: 0 } };
    },
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
    Math: {
      Distance: { Between: vi.fn() },
    },
  },
}));

import { PoolScene } from './PoolScene';
import { createChallengeState } from './challenge/challengeState';
import { CHALLENGE_LEVELS } from './challenge/levels';
import { DEFAULT_PLAYER_WALLET } from './economy';

type HudHarness = {
  gameMode: 'pvp' | 'ai' | 'challenge' | 'online';
  language: 'en' | 'zh';
  currentLevel: (typeof CHALLENGE_LEVELS)[number] | null;
  challengeState: ReturnType<typeof createChallengeState> | null;
  challengeHud?: HTMLElement;
  restartButton?: HTMLButtonElement;
  updateHud: () => void;
};

type EconomyHudHarness = {
  wallet: typeof DEFAULT_PLAYER_WALLET;
  renderEconomyHud: () => void;
};

type ChallengeUiHarness = {
  bindChallengeUI: () => void;
};

type ChallengeSelectHarness = {
  language: 'en' | 'zh';
  challengeSelectOverlay?: HTMLElement;
  challengeProgressSaveQueue: Promise<void>;
  showChallengeSelect: () => Promise<void>;
};

type ChallengeRestartHarness = {
  gameMode: 'pvp' | 'ai' | 'challenge' | 'online';
  currentLevel: (typeof CHALLENGE_LEVELS)[number] | null;
  restartHandler: () => void;
  restartRack: ReturnType<typeof vi.fn>;
  retryChallengeLevel: ReturnType<typeof vi.fn>;
};

function createFakeButton(): HTMLButtonElement & { click: () => void } {
  const listeners = new Map<string, EventListener[]>();
  return {
    hidden: false,
    textContent: '',
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    }),
    removeEventListener: vi.fn(),
    click: () => {
      for (const listener of listeners.get('click') ?? []) {
        listener(new Event('click'));
      }
    },
  } as unknown as HTMLButtonElement & { click: () => void };
}

describe('PoolScene HUD', () => {
  it('hides normal match labels and shows challenge HUD in challenge mode', () => {
    const scene = new PoolScene() as unknown as HudHarness;
    const level = CHALLENGE_LEVELS[0];
    const previousDocument = globalThis.document;

    const nodes: Record<string, HTMLElement> = {
      '.match-panel': { hidden: false } as HTMLElement,
      '#mode': { hidden: false, textContent: '双人对战' } as HTMLElement,
      '#remaining': { hidden: false, textContent: '剩余 15' } as HTMLElement,
      '#strokes': { hidden: false, textContent: '杆数 0' } as HTMLElement,
      '#challenge-level-name': { hidden: false, textContent: '' } as HTMLElement,
      '#challenge-hint': { hidden: false, textContent: '' } as HTMLElement,
      '#challenge-shots': { hidden: false, textContent: '' } as HTMLElement,
    };
    const challengeHud = { hidden: true } as HTMLElement;
    const restartButton = { textContent: '' } as HTMLButtonElement;

    scene.gameMode = 'challenge';
    scene.language = 'zh';
    scene.currentLevel = level;
    scene.challengeState = createChallengeState(level);
    scene.challengeHud = challengeHud;
    scene.restartButton = restartButton;

    globalThis.document = {
      documentElement: { lang: '' } as HTMLElement,
      title: '',
      querySelector: vi.fn((selector: string) => nodes[selector] ?? null),
    } as unknown as Document;

    try {
      scene.updateHud();

      expect(nodes['.match-panel'].hidden).toBe(true);
      expect(nodes['#mode'].hidden).toBe(true);
      expect(nodes['#remaining'].hidden).toBe(true);
      expect(nodes['#strokes'].hidden).toBe(true);
      expect(challengeHud.hidden).toBe(false);
      expect(nodes['#challenge-level-name'].textContent).toBe(level.name.zh);
      expect(nodes['#challenge-shots'].textContent).toBe('杆数 0/2');
      expect(restartButton.textContent).toBe('重试');
    } finally {
      globalThis.document = previousDocument;
    }
  });

  it('retries the current challenge level from the primary restart button', () => {
    const scene = new PoolScene() as unknown as ChallengeRestartHarness;

    scene.gameMode = 'challenge';
    scene.currentLevel = CHALLENGE_LEVELS[0];
    scene.restartRack = vi.fn();
    scene.retryChallengeLevel = vi.fn();

    scene.restartHandler();

    expect(scene.retryChallengeLevel).toHaveBeenCalledOnce();
    expect(scene.restartRack).not.toHaveBeenCalled();
  });

  it('asks the app shell to return to the main menu from the challenge level select back button', () => {
    const scene = new PoolScene() as unknown as ChallengeUiHarness;
    const previousDocument = globalThis.document;
    const previousWindow = globalThis.window;
    const dispatchEvent = vi.fn();

    const nodes: Record<string, HTMLElement> = {
      '#challenge-btn': createFakeButton(),
      '#challenge-select': { hidden: false } as HTMLElement,
      '#challenge-result': { hidden: true } as HTMLElement,
      '#challenge-hud': { hidden: false } as HTMLElement,
      '#challenge-back': createFakeButton(),
      '#challenge-retry': createFakeButton(),
      '#challenge-next': createFakeButton(),
      '#challenge-to-select': createFakeButton(),
    };

    globalThis.document = {
      querySelector: vi.fn((selector: string) => nodes[selector] ?? null),
    } as unknown as Document;
    globalThis.window = { dispatchEvent } as unknown as Window & typeof globalThis;

    try {
      scene.bindChallengeUI();
      (nodes['#challenge-back'] as HTMLButtonElement & { click: () => void }).click();

      expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'pool:return-to-menu' }));
    } finally {
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    }
  });

  it('shows the challenge level select overlay before waiting for saved progress', () => {
    const scene = new PoolScene() as unknown as ChallengeSelectHarness;
    const previousDocument = globalThis.document;
    const overlay = { hidden: true } as HTMLElement;
    const pendingProgressSave = new Promise<void>(() => undefined);

    const nodes: Record<string, HTMLElement> = {
      '#challenge-title': { textContent: '' } as HTMLElement,
      '#challenge-grid': { innerHTML: '' } as HTMLElement,
      '#challenge-back': { textContent: '' } as HTMLElement,
    };

    scene.language = 'zh';
    scene.challengeSelectOverlay = overlay;
    scene.challengeProgressSaveQueue = pendingProgressSave;

    globalThis.document = {
      querySelector: vi.fn((selector: string) => nodes[selector] ?? null),
    } as unknown as Document;

    try {
      void scene.showChallengeSelect();

      expect(overlay.hidden).toBe(false);
    } finally {
      globalThis.document = previousDocument;
    }
  });

  it('shows owned coins in the growth stats when the economy HUD refreshes', () => {
    const scene = new PoolScene() as unknown as EconomyHudHarness;
    const previousDocument = globalThis.document;

    const nodes: Record<string, HTMLElement> = {
      '#coin-balance': { textContent: '' } as HTMLElement,
      '#growth-stat-coins': { textContent: '' } as HTMLElement,
    };

    scene.wallet = { ...DEFAULT_PLAYER_WALLET, coins: 880 };

    globalThis.document = {
      querySelector: vi.fn((selector: string) => nodes[selector] ?? null),
    } as unknown as Document;

    try {
      scene.renderEconomyHud();

      expect(nodes['#coin-balance'].textContent).toBe('金币 880');
      expect(nodes['#growth-stat-coins'].textContent).toBe('880');
    } finally {
      globalThis.document = previousDocument;
    }
  });
});
