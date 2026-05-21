import { describe, expect, it } from 'vitest';

import {
  createNineBallState,
  getNineBallTargetDisplayBallIds,
  getPocketedNineBallDisplayBallIds,
  getRemainingNineBallCount,
  passNineBallPushOut,
  recordNineBallCushion,
  recordNineBallFirstContact,
  recordNineBallPocket,
  resolveNineBallShot,
  startNineBallShot,
} from './nineBallRules';

describe('nine-ball rules', () => {
  it('starts with one shared lowest-number target ball for both players', () => {
    const state = createNineBallState();

    expect(getRemainingNineBallCount(state)).toBe(9);
    expect(getNineBallTargetDisplayBallIds(state)).toEqual([1]);
    expect(getPocketedNineBallDisplayBallIds(state)).toEqual([]);
  });

  it('advances the shared target to the next lowest remaining ball', () => {
    let state = startNineBallShot(createNineBallState());
    state = recordNineBallFirstContact(state, 1);
    state = recordNineBallPocket(state, 1);
    state = resolveNineBallShot(state);

    expect(getNineBallTargetDisplayBallIds(state)).toEqual([2]);
  });

  it('keeps the shooter at the table after legally pocketing any object ball', () => {
    let state = startNineBallShot(createNineBallState());
    state = recordNineBallFirstContact(state, 1);
    state = recordNineBallPocket(state, 4);
    state = resolveNineBallShot(state);

    expect(state.currentPlayer).toBe(0);
    expect(state.cueBallInHand).toBe(false);
    expect(state.messageKey).toBe('nineBallKeepTurn');
    expect(getNineBallTargetDisplayBallIds(state)).toEqual([1]);
  });

  it('allows push out on the shot immediately after a legal break that pockets an object ball', () => {
    let state = startNineBallShot(createNineBallState());
    state = recordNineBallFirstContact(state, 1);
    state = recordNineBallPocket(state, 4);
    state = resolveNineBallShot(state);

    expect(state.currentPlayer).toBe(0);
    expect(state.pushOutAvailable).toBe(true);
  });

  it('keeps the breaker at the table when a nine-ball break pockets an object ball even if the rack collision report names another object ball first', () => {
    let state = startNineBallShot(createNineBallState());
    state = recordNineBallFirstContact(state, 4);
    state = recordNineBallPocket(state, 4);
    state = resolveNineBallShot(state);

    expect(state.currentPlayer).toBe(0);
    expect(state.cueBallInHand).toBe(false);
    expect(state.lastFoul).toBeNull();
    expect(state.messageKey).toBe('nineBallKeepTurn');
  });

  it('passes the turn when the lowest ball is hit first and a ball reaches a cushion', () => {
    let state = createNineBallState();
    state = startNineBallShot(state);
    state = recordNineBallFirstContact(state, 1);
    state = recordNineBallPocket(state, 1);
    state = resolveNineBallShot(state);

    state = startNineBallShot(state);
    state = recordNineBallFirstContact(state, 2);
    state = recordNineBallCushion(state, 2);
    state = resolveNineBallShot(state);

    expect(state.currentPlayer).toBe(1);
    expect(state.messageKey).toBe('nineBallTurnPass');
  });

  it('fouls when a non-break shot has no pocketed ball and no cushion after contact', () => {
    let state = createNineBallState();
    state = startNineBallShot(state);
    state = recordNineBallFirstContact(state, 1);
    state = recordNineBallPocket(state, 1);
    state = resolveNineBallShot(state);

    state = startNineBallShot(state);
    state = recordNineBallFirstContact(state, 2);
    state = resolveNineBallShot(state);

    expect(state.currentPlayer).toBe(1);
    expect(state.cueBallInHand).toBe(true);
    expect(state.lastFoul).toBe('noCushionAfterContact');
  });

  it('fouls on a dry break unless at least four object balls reach cushions', () => {
    let state = startNineBallShot(createNineBallState());
    state = recordNineBallFirstContact(state, 1);
    state = recordNineBallCushion(state, 1);
    state = recordNineBallCushion(state, 2);
    state = recordNineBallCushion(state, 3);
    state = resolveNineBallShot(state);

    expect(state.currentPlayer).toBe(1);
    expect(state.cueBallInHand).toBe(true);
    expect(state.lastFoul).toBe('illegalBreak');
  });

  it('allows a dry break when four object balls reach cushions', () => {
    let state = startNineBallShot(createNineBallState());
    state = recordNineBallFirstContact(state, 1);
    state = recordNineBallCushion(state, 1);
    state = recordNineBallCushion(state, 2);
    state = recordNineBallCushion(state, 3);
    state = recordNineBallCushion(state, 4);
    state = resolveNineBallShot(state);

    expect(state.currentPlayer).toBe(1);
    expect(state.cueBallInHand).toBe(false);
    expect(state.pushOutAvailable).toBe(true);
    expect(state.messageKey).toBe('nineBallPushOutAvailable');
  });

  it('gives ball in hand after hitting the wrong first ball', () => {
    let state = startNineBallShot(createNineBallState());
    state = recordNineBallFirstContact(state, 2);
    state = resolveNineBallShot(state);

    expect(state.currentPlayer).toBe(1);
    expect(state.cueBallInHand).toBe(true);
    expect(state.lastFoul).toBe('wrongFirstContact');
  });

  it('spots the nine instead of winning when the nine is pocketed on a foul', () => {
    let state = startNineBallShot(createNineBallState());
    state = recordNineBallFirstContact(state, 2);
    state = recordNineBallPocket(state, 9);
    state = resolveNineBallShot(state);

    expect(state.gameOver).toBe(false);
    expect(state.currentPlayer).toBe(1);
    expect(state.cueBallInHand).toBe(true);
    expect(state.pocketedBallIds).not.toContain(9);
    expect(getNineBallTargetDisplayBallIds(state)).toEqual([1]);
  });

  it('wins when the nine ball is legally pocketed', () => {
    let state = startNineBallShot(createNineBallState());
    state = recordNineBallFirstContact(state, 1);
    state = recordNineBallPocket(state, 9);
    state = resolveNineBallShot(state);

    expect(state.gameOver).toBe(true);
    expect(state.winner).toBe(0);
    expect(state.messageKey).toBe('nineBallWin');
  });

  it('loses after three consecutive fouls by the same player', () => {
    let state = createNineBallState();

    state = startNineBallShot(state);
    state = recordNineBallFirstContact(state, 2);
    state = resolveNineBallShot(state);

    state = startNineBallShot(state);
    state = recordNineBallFirstContact(state, 1);
    state = recordNineBallCushion(state, 1);
    state = resolveNineBallShot(state);

    state = startNineBallShot(state);
    state = recordNineBallFirstContact(state, 2);
    state = resolveNineBallShot(state);

    expect(state.messageKey).toBe('nineBallThreeFoulWarning');

    state = startNineBallShot(state);
    state = recordNineBallFirstContact(state, 1);
    state = recordNineBallCushion(state, 1);
    state = resolveNineBallShot(state);

    state = startNineBallShot(state);
    state = recordNineBallFirstContact(state, 2);
    state = resolveNineBallShot(state);

    expect(state.gameOver).toBe(true);
    expect(state.winner).toBe(1);
    expect(state.loser).toBe(0);
    expect(state.messageKey).toBe('nineBallThreeFoulLoss');
  });

  it('allows a declared push out only on the shot immediately after a legal break', () => {
    let state = startNineBallShot(createNineBallState());
    state = recordNineBallFirstContact(state, 1);
    state = recordNineBallCushion(state, 1);
    state = recordNineBallCushion(state, 2);
    state = recordNineBallCushion(state, 3);
    state = recordNineBallCushion(state, 4);
    state = resolveNineBallShot(state);

    state = startNineBallShot(state, { pushOut: true });
    state = recordNineBallPocket(state, 9);
    state = resolveNineBallShot(state);

    expect(state.gameOver).toBe(false);
    expect(state.currentPlayer).toBe(0);
    expect(state.pushOutAvailable).toBe(false);
    expect(state.pushOutDecision?.originalShooter).toBe(1);
    expect(state.pocketedBallIds).not.toContain(9);
    expect(state.messageKey).toBe('nineBallPushOutChoice');

    state = passNineBallPushOut(state);

    expect(state.currentPlayer).toBe(1);
    expect(state.pushOutDecision).toBeNull();
    expect(state.messageKey).toBe('nineBallPushOutPassedBack');
  });

  it('treats a cue-ball scratch during push out as a foul instead of a push-out choice', () => {
    let state = startNineBallShot(createNineBallState());
    state = recordNineBallFirstContact(state, 1);
    state = recordNineBallCushion(state, 1);
    state = recordNineBallCushion(state, 2);
    state = recordNineBallCushion(state, 3);
    state = recordNineBallCushion(state, 4);
    state = resolveNineBallShot(state);

    state = startNineBallShot(state, { pushOut: true });
    state = recordNineBallPocket(state, 0);
    state = resolveNineBallShot(state);

    expect(state.currentPlayer).toBe(0);
    expect(state.cueBallInHand).toBe(true);
    expect(state.pushOutDecision).toBeNull();
    expect(state.lastFoul).toBe('cueBallPocketed');
  });
});
