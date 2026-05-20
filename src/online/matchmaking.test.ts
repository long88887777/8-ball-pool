import { describe, expect, it } from 'vitest';

import { createMatchmakingState, selectMatchmakingRuleset } from './matchmaking';

describe('matchmaking mode menu', () => {
  it('opens on ruleset selection before showing online room actions', () => {
    const state = createMatchmakingState();

    expect(state.panel).toBe('ruleset');
  });

  it('shows room actions after selecting eight-ball or nine-ball', () => {
    const state = selectMatchmakingRuleset(createMatchmakingState(), 'nine-ball');

    expect(state).toEqual({
      panel: 'menu',
      ruleset: 'nine-ball',
    });
  });
});
