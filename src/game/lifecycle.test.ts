import { describe, expect, it, vi } from 'vitest';

import { bindGamePowerLifecycle } from './lifecycle';

function createEventTargetHarness() {
  const listeners = new Map<string, Array<() => void>>();
  return {
    target: {
      addEventListener: vi.fn((event: string, listener: () => void) => {
        listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      }),
      removeEventListener: vi.fn((event: string, listener: () => void) => {
        listeners.set(event, (listeners.get(event) ?? []).filter((item) => item !== listener));
      }),
    },
    emit: (event: string) => {
      for (const listener of listeners.get(event) ?? []) {
        listener();
      }
    },
    listenerCount: (event: string) => listeners.get(event)?.length ?? 0,
  };
}

describe('game power lifecycle', () => {
  it('pauses the game while the page is hidden and resumes when visible', () => {
    const doc = createEventTargetHarness();
    const win = createEventTargetHarness();
    const game = {
      isPaused: false,
      pause: vi.fn(() => { game.isPaused = true; }),
      resume: vi.fn(() => { game.isPaused = false; }),
    };
    const documentRef = {
      ...doc.target,
      hidden: false,
    };

    bindGamePowerLifecycle(game, { documentRef, windowRef: win.target });

    documentRef.hidden = true;
    doc.emit('visibilitychange');
    expect(game.pause).toHaveBeenCalledOnce();

    documentRef.hidden = false;
    doc.emit('visibilitychange');
    expect(game.resume).toHaveBeenCalledOnce();
  });

  it('does not auto-resume over the explicit pause menu', () => {
    const doc = createEventTargetHarness();
    const win = createEventTargetHarness();
    const game = {
      isPaused: false,
      pause: vi.fn(() => { game.isPaused = true; }),
      resume: vi.fn(() => { game.isPaused = false; }),
    };
    const documentRef = {
      ...doc.target,
      hidden: false,
    };

    bindGamePowerLifecycle(game, {
      documentRef,
      windowRef: win.target,
      isUserPaused: () => true,
    });

    documentRef.hidden = true;
    doc.emit('visibilitychange');
    documentRef.hidden = false;
    doc.emit('visibilitychange');

    expect(game.pause).toHaveBeenCalledOnce();
    expect(game.resume).not.toHaveBeenCalled();
  });

  it('removes browser listeners when disposed', () => {
    const doc = createEventTargetHarness();
    const win = createEventTargetHarness();
    const game = {
      isPaused: false,
      pause: vi.fn(() => { game.isPaused = true; }),
      resume: vi.fn(() => { game.isPaused = false; }),
    };
    const documentRef = {
      ...doc.target,
      hidden: false,
    };

    const dispose = bindGamePowerLifecycle(game, { documentRef, windowRef: win.target });
    dispose();

    expect(doc.listenerCount('visibilitychange')).toBe(0);
    expect(win.listenerCount('blur')).toBe(0);
    expect(win.listenerCount('focus')).toBe(0);
  });
});
