import { describe, expect, it } from 'vitest';
import {
  completeRack,
  createGameState,
  pocketCueBall,
  pocketTargetBall,
  readBestStrokes,
  recordStroke,
  resolveSettledState,
  restartGame,
  writeBestStrokes,
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

  it('marks a rack complete and records a best stroke count', () => {
    const state = completeRack({ ...createGameState(0), strokes: 7 });

    expect(state.rackComplete).toBe(true);
    expect(state.bestStrokes).toBe(7);
    expect(state.message).toBe('Rack cleared in 7 strokes. Start a new rack when ready.');
  });

  it('keeps the lower best stroke count', () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };

    writeBestStrokes(adapter, 9);
    writeBestStrokes(adapter, 12);
    expect(readBestStrokes(adapter)).toBe(9);
    writeBestStrokes(adapter, 6);
    expect(readBestStrokes(adapter)).toBe(6);
  });
});
