import type { GameRuleset } from './game/gameRules';

export type MenuGameMode = 'pvp' | 'ai' | 'challenge' | 'online';

export type ModeSelectionState = {
  panel: 'main' | 'ruleset' | 'challenge-select';
  pendingMode: MenuGameMode | null;
  ruleset: GameRuleset;
};

export type ModeSelectionResult = ModeSelectionState & {
  start?: {
    mode: Exclude<MenuGameMode, 'challenge' | 'online'>;
    ruleset: GameRuleset;
  };
};

export function createModeSelectionState(): ModeSelectionState {
  return {
    panel: 'main',
    pendingMode: null,
    ruleset: 'eight-ball',
  };
}

export function selectGameMode(state: ModeSelectionState, mode: MenuGameMode): ModeSelectionState {
  if (mode === 'challenge') {
    return {
      ...state,
      panel: 'challenge-select',
      pendingMode: null,
    };
  }

  return {
    ...state,
    panel: 'ruleset',
    pendingMode: mode,
  };
}

export function selectRuleset(state: ModeSelectionState, ruleset: GameRuleset): ModeSelectionResult {
  const pendingMode = state.pendingMode;
  const next = {
    panel: 'main' as const,
    pendingMode: null,
    ruleset,
  };

  if (pendingMode === 'ai' || pendingMode === 'pvp') {
    return {
      ...next,
      start: {
        mode: pendingMode,
        ruleset,
      },
    };
  }

  return next;
}
