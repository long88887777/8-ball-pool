import { describe, expect, it } from 'vitest';

import { createModeSelectionState, selectGameMode, selectRuleset } from './menuFlow';
import {
  formatRecentMatchSummary,
  readStoredAimControlSettings,
  resolveHistorySelectionIndex,
  showChallengeSelectLoadingState,
  writeStoredAimControlSettings,
} from './menuShell';
import type { RecentMatchRecord } from './game/growth/stats';

describe('main menu ruleset selection', () => {
  it('asks local versus AI players to pick eight-ball or nine-ball before starting', () => {
    const state = selectGameMode(createModeSelectionState(), 'ai');

    expect(state).toEqual({
      panel: 'ruleset',
      pendingMode: 'ai',
      ruleset: 'eight-ball',
    });
  });

  it('returns a start request after a local ruleset is selected', () => {
    const result = selectRuleset(
      { panel: 'ruleset', pendingMode: 'pvp', ruleset: 'eight-ball' },
      'nine-ball',
    );

    expect(result).toEqual({
      panel: 'main',
      pendingMode: null,
      ruleset: 'nine-ball',
      start: { mode: 'pvp', ruleset: 'nine-ball' },
    });
  });

  it('opens the challenge level select before starting challenge gameplay', () => {
    const state = selectGameMode(createModeSelectionState(), 'challenge');

    expect(state).toEqual({
      panel: 'challenge-select',
      pendingMode: null,
      ruleset: 'eight-ball',
    });
  });

});

describe('menu shell helpers', () => {
  it('shows the challenge selector immediately while saved progress is loading', () => {
    const overlay = { hidden: true } as HTMLElement;
    const title = { textContent: '' } as HTMLElement;
    const backBtn = { textContent: '' } as HTMLElement;
    const gridChildren: unknown[] = [];
    const grid = {
      replaceChildren: (...children: unknown[]) => {
        gridChildren.splice(0, gridChildren.length, ...children);
      },
    } as HTMLElement;
    const doc = {
      createElement: (tag: string) => ({
        tagName: tag.toUpperCase(),
        className: '',
        textContent: '',
      }),
    } as Pick<Document, 'createElement'>;

    showChallengeSelectLoadingState({ overlay, grid, title, backBtn }, doc);

    expect(overlay.hidden).toBe(false);
    expect(title.textContent).toBe('挑战模式');
    expect(backBtn.textContent).toBe('返回');
    expect(gridChildren).toMatchObject([
      {
        className: 'challenge-loading',
        textContent: '正在加载关卡...',
      },
    ]);
  });

  it('persists sanitized aim control settings', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };

    const saved = writeStoredAimControlSettings(storage, {
      sensitivity: 'fast',
      powerStep: 12.8,
      powerLocked: true,
    });

    expect(saved).toEqual({
      sensitivity: 'fast',
      powerStep: 13,
      powerLocked: true,
    });
    expect(readStoredAimControlSettings(storage)).toEqual(saved);
  });

  it('formats recent match history rows with ruleset and result context', () => {
    const match: RecentMatchRecord = {
      matchId: 'match-1',
      playedAt: '2026-05-25T10:00:00.000Z',
      mode: 'online',
      opponentName: 'Mina',
      won: true,
      strokes: 6,
      clearedTable: true,
      ruleset: 'nine-ball',
      shotHistory: [],
    };

    expect(formatRecentMatchSummary(match, 'zh')).toMatchObject({
      title: '胜 · Mina',
      meta: '联网 · 9 球 · 6 杆',
      detail: '2026/5/25 18:00',
    });
  });

  it('keeps history selection by row index when records share a match id', () => {
    const matches: RecentMatchRecord[] = [
      {
        matchId: 'same-id',
        playedAt: '2026-05-25T10:00:00.000Z',
        mode: 'online',
        opponentName: 'Mina',
        won: true,
        strokes: 6,
        clearedTable: true,
      },
      {
        matchId: 'same-id',
        playedAt: '2026-05-25T11:00:00.000Z',
        mode: 'online',
        opponentName: 'Mina',
        won: false,
        strokes: 9,
        clearedTable: false,
      },
    ];

    expect(resolveHistorySelectionIndex(matches, null)).toBe(0);
    expect(resolveHistorySelectionIndex(matches, 1)).toBe(1);
    expect(resolveHistorySelectionIndex(matches, 4)).toBe(0);
  });
});
