export type GameState = {
  score: number;
  strokes: number;
  remainingTargets: number;
  cueBallPocketed: boolean;
  message: string;
};

export function createGameState(targetCount: number): GameState {
  return {
    score: 0,
    strokes: 0,
    remainingTargets: targetCount,
    cueBallPocketed: false,
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
    return {
      ...state,
      message: 'Table cleared. Restart for another rack.',
    };
  }

  return {
    ...state,
    message: 'Drag from the cue ball to aim. Release to shoot.',
  };
}

export function restartGame(targetCount: number): GameState {
  return createGameState(targetCount);
}
