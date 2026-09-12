import { describe, expect, it } from 'vitest';

import { finishGameTableLoading, showGameShellForNewGame } from './gameShellVisibility';

function createTrackedElement(
  label: string,
  initialHidden: boolean,
  events: string[],
  getOverlayHidden?: () => boolean,
): HTMLElement {
  let hidden = initialHidden;
  return {
    dataset: {},
    get hidden() {
      return hidden;
    },
    set hidden(value: boolean) {
      hidden = value;
      const overlayState = getOverlayHidden ? `:overlay=${getOverlayHidden()}` : '';
      events.push(`${label}:${value}${overlayState}`);
    },
  } as HTMLElement;
}

describe('game shell visibility', () => {
  it('hides a stale game-over overlay before revealing the game shell', () => {
    const events: string[] = [];
    const overlay = createTrackedElement('overlay', false, events);
    const menu = createTrackedElement('menu', false, events);
    const challengeSelect = createTrackedElement('challenge', true, events);
    const shell = createTrackedElement('shell', true, events, () => overlay.hidden);
    const game = createTrackedElement('game', false, events);
    const doc = {
      getElementById: (id: string) => {
        if (id === 'victory-overlay') return overlay;
        if (id === 'main-menu') return menu;
        if (id === 'challenge-select') return challengeSelect;
        if (id === 'game') return game;
        return null;
      },
      querySelector: (selector: string) => {
        if (selector === '.game-shell') return shell;
        return null;
      },
    };

    showGameShellForNewGame(doc);

    const overlayHiddenIndex = events.indexOf('overlay:true');
    const shellShownIndex = events.indexOf('shell:false:overlay=true');
    expect(overlayHiddenIndex).toBeGreaterThanOrEqual(0);
    expect(shellShownIndex).toBeGreaterThanOrEqual(0);
    expect(overlayHiddenIndex).toBeLessThan(shellShownIndex);
    expect(game.dataset.renderState).toBe('loading');
  });

  it('reveals the table only after its final renderer has settled', () => {
    const game = createTrackedElement('game', false, []);
    game.dataset.renderState = 'loading';
    const doc = {
      getElementById: (id: string) => id === 'game' ? game : null,
      querySelector: () => null,
    };

    finishGameTableLoading(doc);

    expect(game.dataset.renderState).toBe('ready');
  });
});
