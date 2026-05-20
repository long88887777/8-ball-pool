import { describe, expect, it } from 'vitest';

import { createModeSelectionState, selectGameMode, selectRuleset } from './menuFlow';

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
