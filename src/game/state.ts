export type StorageAdapter = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type PracticeMode = 'clear-table';

export const BEST_STROKES_KEY = 'pool.bestStrokes.clearTable';

export type GameState = {
  score: number;
  strokes: number;
  remainingTargets: number;
  cueBallPocketed: boolean;
  rackComplete: boolean;
  mode: PracticeMode;
  bestStrokes: number | null;
  message: string;
};

export function createGameState(targetCount: number, bestStrokes: number | null = null): GameState {
  return {
    score: 0,
    strokes: 0,
    remainingTargets: targetCount,
    cueBallPocketed: false,
    rackComplete: false,
    mode: 'clear-table',
    bestStrokes,
    message: 'Drag from the cue ball to aim. Release to shoot.',
  };
}

export function recordStroke(state: GameState): GameState {
  return {
    ...state,
    strokes: state.strokes + 1,
    message: 'Shot in motion.',
  };
}

export function pocketTargetBall(state: GameState): GameState {
  const remainingTargets = Math.max(0, state.remainingTargets - 1);

  return {
    ...state,
    score: state.score + 100,
    remainingTargets,
    message: remainingTargets === 0 ? 'Table cleared. Restart for another rack.' : 'Target ball pocketed.',
  };
}

export function pocketCueBall(state: GameState): GameState {
  return {
    ...state,
    strokes: state.strokes + 1,
    cueBallPocketed: true,
    message: 'Cue ball pocketed. It will reset after the table stops.',
  };
}

export function resetCueBall(state: GameState): GameState {
  return {
    ...state,
    cueBallPocketed: false,
    message: 'Cue ball reset. Drag from the cue ball to aim.',
  };
}

export function readyForNextShot(state: GameState): GameState {
  if (state.remainingTargets === 0) {
    return completeRack(state);
  }

  return {
    ...state,
    message: 'Drag from the cue ball to aim. Release to shoot.',
  };
}

export function resolveSettledState(state: GameState): GameState {
  if (state.cueBallPocketed) {
    return resetCueBall(state);
  }

  return readyForNextShot(state);
}

export function restartGame(targetCount: number, bestStrokes: number | null = null): GameState {
  return createGameState(targetCount, bestStrokes);
}

export function completeRack(state: GameState, bestStrokes = state.bestStrokes): GameState {
  const nextBest = bestStrokes === null ? state.strokes : Math.min(bestStrokes, state.strokes);

  return {
    ...state,
    rackComplete: true,
    bestStrokes: nextBest,
    message: `Rack cleared in ${state.strokes} strokes. Start a new rack when ready.`,
  };
}

export function readBestStrokes(storage: Pick<StorageAdapter, 'getItem'>): number | null {
  try {
    const value = storage.getItem(BEST_STROKES_KEY);
    if (!value) {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function writeBestStrokes(storage: StorageAdapter, strokes: number): number | null {
  const previous = readBestStrokes(storage);
  const next = previous === null ? strokes : Math.min(previous, strokes);

  try {
    storage.setItem(BEST_STROKES_KEY, String(next));
  } catch {
    return previous;
  }

  return next;
}
