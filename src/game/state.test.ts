import { describe, expect, it } from 'vitest';
import {
  createGameState,
  pocketCueBall,
  pocketTargetBall,
  recordStroke,
  resolveSettledState,
  restartGame,
} from './state';

describe('game state helpers', () => {
  it('starts with score, strokes, and remaining targets', () => {
    const state = createGameState(6);

    expect(state).toMatchObject({
      score: 0,
      strokes: 0,
      remainingTargets: 6,
      cueBallPocketed: false,
    });
  });

  it('records strokes and target pockets', () => {
    let state = createGameState(2);

    state = recordStroke(state);
    state = pocketTargetBall(state);

    expect(state.score).toBe(100);
    expect(state.strokes).toBe(1);
    expect(state.remainingTargets).toBe(1);
  });

  it('handles cue-ball pocket penalty', () => {
    const state = pocketCueBall(createGameState(3));

    expect(state.cueBallPocketed).toBe(true);
    expect(state.strokes).toBe(1);
    expect(state.message).toBe('Cue ball pocketed. It will reset after the table stops.');
  });

  it('restarts with a fresh target count', () => {
    const state = restartGame(5);

    expect(state.score).toBe(0);
    expect(state.strokes).toBe(0);
    expect(state.remainingTargets).toBe(5);
  });

  it('resolves pocket messages once the table is settled', () => {
    const targetState = resolveSettledState(pocketTargetBall(createGameState(2)));
    const cueState = resolveSettledState(pocketCueBall(createGameState(2)));

    expect(targetState.message).toBe('Drag from the cue ball to aim. Release to shoot.');
    expect(cueState.cueBallPocketed).toBe(false);
    expect(cueState.message).toBe('Cue ball reset. Drag from the cue ball to aim.');
  });
});
