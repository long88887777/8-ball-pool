import { describe, expect, it } from 'vitest';
import {
  createEightBallState,
  getBallGroup,
  getPocketedDisplayBallIds,
  getPlayerRemainingBallIds,
  getPlayerTargetDisplayBallIds,
  getRemainingEightBallCount,
  isPlayerOnEight,
  recordEightBallCushion,
  recordEightBallFirstContact,
  recordEightBallPocket,
  recordEightBallTimeoutFoul,
  resolveEightBallShot,
  startEightBallShot,
} from './eightBallRules';

describe('local two-player eight-ball rules', () => {
  it('starts as an open table with player one shooting', () => {
    const state = createEightBallState();

    expect(state.currentPlayer).toBe(0);
    expect(state.players[0].group).toBeNull();
    expect(state.players[1].group).toBeNull();
    expect(state.cueBallInHand).toBe(false);
    expect(state.gameOver).toBe(false);
    expect(state.messageKey).toBe('eightBallReady');
  });

  it('assigns groups from the first legally pocketed object ball and keeps the shooter at the table', () => {
    let state = startEightBallShot(createEightBallState());
    state = recordEightBallFirstContact(state, 3);
    state = recordEightBallPocket(state, 3);
    state = resolveEightBallShot(state);

    expect(state.currentPlayer).toBe(0);
    expect(state.players[0].group).toBe('solids');
    expect(state.players[1].group).toBe('stripes');
    expect(state.messageKey).toBe('eightBallGroupsAssigned');
  });

  it('passes the turn after a legal shot with no pocketed ball', () => {
    let state = startEightBallShot(createEightBallState());
    state = recordEightBallFirstContact(state, 11);
    state = recordEightBallCushion(state);
    state = resolveEightBallShot(state);

    expect(state.currentPlayer).toBe(1);
    expect(state.cueBallInHand).toBe(false);
    expect(state.messageKey).toBe('eightBallTurnPass');
  });

  it('does NOT foul on break shot even without cushion contact', () => {
    let state = startEightBallShot(createEightBallState());
    state = recordEightBallFirstContact(state, 1);
    state = resolveEightBallShot(state);

    expect(state.lastFoul).toBeNull();
    expect(state.currentPlayer).toBe(1);
    expect(state.cueBallInHand).toBe(false);
  });

  it('does NOT foul on break shot when hitting the 8-ball first', () => {
    let state = startEightBallShot(createEightBallState());
    state = recordEightBallFirstContact(state, 8);
    state = resolveEightBallShot(state);

    expect(state.lastFoul).toBeNull();
    expect(state.currentPlayer).toBe(1);
    expect(state.cueBallInHand).toBe(false);
  });

  it('gives the incoming player ball in hand after a cue-ball scratch', () => {
    let state = startEightBallShot(createEightBallState());
    state = recordEightBallFirstContact(state, 4);
    state = recordEightBallPocket(state, 0);
    state = resolveEightBallShot(state);

    expect(state.currentPlayer).toBe(1);
    expect(state.cueBallInHand).toBe(true);
    expect(state.lastFoul).toBe('cueBallPocketed');
    expect(state.messageKey).toBe('eightBallFoul');
  });

  it('gives the opponent ball in hand after a shot clock timeout', () => {
    const state = recordEightBallTimeoutFoul(createEightBallState());

    expect(state.currentPlayer).toBe(1);
    expect(state.cueBallInHand).toBe(true);
    expect(state.lastFoul).toBe('shotClockExpired');
    expect(state.messageKey).toBe('eightBallTimeoutFoul');
    expect(state.messageValues).toEqual({ player: 2 });
  });

  it('fouls when a player hits the wrong group first', () => {
    let state = startEightBallShot(createEightBallState());
    state = recordEightBallFirstContact(state, 2);
    state = recordEightBallPocket(state, 2);
    state = resolveEightBallShot(state);

    state = startEightBallShot(state);
    state = recordEightBallFirstContact(state, 11);
    state = resolveEightBallShot(state);

    expect(state.currentPlayer).toBe(1);
    expect(state.cueBallInHand).toBe(true);
    expect(state.lastFoul).toBe('wrongFirstContact');
  });

  it('fouls when the eight ball is hit first before groups are assigned (non-break)', () => {
    let state = startEightBallShot(createEightBallState());
    state = recordEightBallFirstContact(state, 1);
    state = recordEightBallCushion(state);
    state = resolveEightBallShot(state);

    expect(state.currentPlayer).toBe(1);

    state = startEightBallShot(state);
    state = recordEightBallFirstContact(state, 8);
    state = resolveEightBallShot(state);

    expect(state.currentPlayer).toBe(0);
    expect(state.cueBallInHand).toBe(true);
    expect(state.lastFoul).toBe('wrongFirstContact');
  });

  it('loses immediately when the eight ball is pocketed before the shooter is on the eight', () => {
    let state = startEightBallShot(createEightBallState());
    state = recordEightBallFirstContact(state, 8);
    state = recordEightBallPocket(state, 8);
    state = resolveEightBallShot(state);

    expect(state.gameOver).toBe(true);
    expect(state.winner).toBe(1);
    expect(state.loser).toBe(0);
    expect(state.messageKey).toBe('eightBallLoss');
  });

  it('wins when the shooter legally pockets the eight after clearing their group', () => {
    let state = createEightBallState();
    for (const ballId of [1, 2, 3, 4, 5, 6, 7]) {
      state = recordEightBallPocket(state, ballId);
    }
    state = {
      ...state,
      players: [
        { id: 0, group: 'solids' },
        { id: 1, group: 'stripes' },
      ],
    };

    expect(isPlayerOnEight(state, 0)).toBe(true);

    state = startEightBallShot(state);
    state = recordEightBallFirstContact(state, 8);
    state = recordEightBallPocket(state, 8);
    state = resolveEightBallShot(state);

    expect(state.gameOver).toBe(true);
    expect(state.winner).toBe(0);
    expect(state.messageKey).toBe('eightBallWin');
  });

  it('does NOT foul when pocketing the last group balls in one shot (hitting own ball first)', () => {
    let state = createEightBallState();
    state = {
      ...state,
      players: [
        { id: 0, group: 'solids' },
        { id: 1, group: 'stripes' },
      ],
      pocketedBallIds: [1, 2, 3, 4, 5],
    };

    state = startEightBallShot(state);
    state = recordEightBallFirstContact(state, 6);
    state = recordEightBallPocket(state, 6);
    state = recordEightBallPocket(state, 7);
    state = resolveEightBallShot(state);

    expect(state.lastFoul).toBeNull();
    expect(state.currentPlayer).toBe(0);
    expect(state.messageKey).toBe('eightBallKeepTurn');
  });

  it('classifies numbered balls into solids, stripes, and the eight', () => {
    expect(getBallGroup(1)).toBe('solids');
    expect(getBallGroup(7)).toBe('solids');
    expect(getBallGroup(8)).toBe('eight');
    expect(getBallGroup(9)).toBe('stripes');
    expect(getBallGroup(15)).toBe('stripes');
  });

  it('counts all pocketed object balls including the eight for HUD remaining count', () => {
    let state = createEightBallState();
    state = recordEightBallPocket(state, 1);
    state = recordEightBallPocket(state, 8);

    expect(getRemainingEightBallCount(state)).toBe(13);
  });

  it('lists pocketed display balls without including a scratched cue ball', () => {
    let state = createEightBallState();
    state = recordEightBallPocket(state, 0);
    state = recordEightBallPocket(state, 2);
    state = recordEightBallPocket(state, 10);

    expect(getPocketedDisplayBallIds(state)).toEqual([2, 10]);
  });

  it('shows player remaining target balls once groups are assigned', () => {
    let state = createEightBallState();
    state = {
      ...state,
      players: [
        { id: 0, group: 'solids' },
        { id: 1, group: 'stripes' },
      ],
    };
    state = recordEightBallPocket(state, 2);
    state = recordEightBallPocket(state, 10);

    expect(getPlayerRemainingBallIds(state, 0)).toEqual([1, 3, 4, 5, 6, 7]);
    expect(getPlayerRemainingBallIds(state, 1)).toEqual([9, 11, 12, 13, 14, 15]);
  });

  it('shows the eight as the remaining target after a player clears their group', () => {
    let state = createEightBallState();
    state = {
      ...state,
      players: [
        { id: 0, group: 'solids' },
        { id: 1, group: 'stripes' },
      ],
    };
    for (const ballId of [1, 2, 3, 4, 5, 6, 7]) {
      state = recordEightBallPocket(state, ballId);
    }

    expect(getPlayerRemainingBallIds(state, 0)).toEqual([8]);
  });

  it('shows all object balls as remaining for both players before groups are assigned', () => {
    let state = createEightBallState();
    state = recordEightBallPocket(state, 5);

    expect(getPlayerRemainingBallIds(state, 0)).toEqual([1, 2, 3, 4, 6, 7, 9, 10, 11, 12, 13, 14, 15]);
    expect(getPlayerRemainingBallIds(state, 1)).toEqual([1, 2, 3, 4, 6, 7, 9, 10, 11, 12, 13, 14, 15]);
  });

  it('shows player target display balls only after groups are assigned', () => {
    let state = createEightBallState();

    expect(getPlayerTargetDisplayBallIds(state, 0)).toEqual([]);
    expect(getPlayerTargetDisplayBallIds(state, 1)).toEqual([]);

    state = {
      ...state,
      players: [
        { id: 0, group: 'solids' },
        { id: 1, group: 'stripes' },
      ],
    };
    state = recordEightBallPocket(state, 0);
    state = recordEightBallPocket(state, 3);
    state = recordEightBallPocket(state, 12);

    expect(getPocketedDisplayBallIds(state)).toEqual([3, 12]);
    expect(getPlayerTargetDisplayBallIds(state, 0)).toEqual([1, 2, 4, 5, 6, 7]);
    expect(getPlayerTargetDisplayBallIds(state, 1)).toEqual([9, 10, 11, 13, 14, 15]);
  });

  it('does NOT foul when Player 2 legally breaks cluster after receiving ball-in-hand from cue scratch', () => {
    let state = startEightBallShot(createEightBallState());
    state = recordEightBallFirstContact(state, 5);
    state = recordEightBallPocket(state, 0);
    state = resolveEightBallShot(state);

    expect(state.currentPlayer).toBe(1);
    expect(state.cueBallInHand).toBe(true);
    expect(state.lastFoul).toBe('cueBallPocketed');

    state = startEightBallShot(state);
    state = recordEightBallFirstContact(state, 9);
    state = recordEightBallCushion(state);
    state = resolveEightBallShot(state);

    expect(state.lastFoul).toBeNull();
    expect(state.currentPlayer).toBe(0);
    expect(state.cueBallInHand).toBe(false);
    expect(state.messageKey).toBe('eightBallTurnPass');
  });

  it('does NOT foul when Player 2 pockets a ball after ball-in-hand from cue scratch', () => {
    let state = startEightBallShot(createEightBallState());
    state = recordEightBallFirstContact(state, 5);
    state = recordEightBallPocket(state, 0);
    state = resolveEightBallShot(state);

    expect(state.currentPlayer).toBe(1);
    expect(state.cueBallInHand).toBe(true);

    state = startEightBallShot(state);
    state = recordEightBallFirstContact(state, 11);
    state = recordEightBallPocket(state, 11);
    state = resolveEightBallShot(state);

    expect(state.lastFoul).toBeNull();
    expect(state.currentPlayer).toBe(1);
    expect(state.players[1].group).toBe('stripes');
  });
});
