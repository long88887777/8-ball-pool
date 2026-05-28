import { describe, expect, it } from 'vitest';
import {
  BALL_RADIUS,
  CUE_START,
  CUSHION_NOSE_INSET,
  PLAY_AREA,
  POCKETS,
  POCKET_MOUTHS,
  RACK_CENTER,
  TABLE,
  type Vector,
} from '../constants';
import { createNineBallRack, createTriangleRack } from '../geometry';
import { ProfessionalPoolEngine } from './engine';
import type { PhysicsBallStart } from './types';

function starts(): PhysicsBallStart[] {
  return [
    { id: 0, kind: 'cue', position: CUE_START },
    ...createTriangleRack(RACK_CENTER, 15).map((position, index) => ({
      id: index + 1,
      kind: 'target' as const,
      position,
      label: index + 1,
    })),
  ];
}

function nineBallStarts(): PhysicsBallStart[] {
  return [
    { id: 0, kind: 'cue', position: CUE_START },
    ...createNineBallRack(RACK_CENTER).map(({ id, position }) => ({
      id,
      kind: 'target' as const,
      position,
      label: id,
    })),
  ];
}

function stepUntilSettled(engine: ProfessionalPoolEngine): ReturnType<ProfessionalPoolEngine['step']> {
  let result = engine.step(1 / 60);
  for (let i = 0; i < 1400 && !result.settled; i += 1) {
    result = engine.step(1 / 60);
  }
  return result;
}

describe('ProfessionalPoolEngine', () => {
  it('creates cue and target ball snapshots', () => {
    const engine = new ProfessionalPoolEngine();
    engine.rack(starts());

    const balls = engine.getBalls();

    expect(balls).toHaveLength(16);
    expect(balls[0]).toMatchObject({ id: 0, kind: 'cue', pocketed: false });
  });

  it('moves and settles after a center ball strike', () => {
    const engine = new ProfessionalPoolEngine();
    engine.rack(starts());
    engine.strikeCueBall({ direction: { x: 1, y: 0 }, power: 0.6 });

    let result = engine.step(1 / 60);
    expect(result.balls[0].position.x).toBeGreaterThan(CUE_START.x);

    for (let i = 0; i < 1200 && !result.settled; i += 1) {
      result = engine.step(1 / 60);
    }

    expect(result.settled).toBe(true);
  });

  it('uses high and low cue contact points to change cue-ball behavior after object-ball contact', () => {
    const rack: PhysicsBallStart[] = [
      { id: 0, kind: 'cue', position: { x: CUE_START.x, y: CUE_START.y } },
      { id: 1, kind: 'target', position: { x: CUE_START.x + BALL_RADIUS * 4.4, y: CUE_START.y }, label: 1 },
    ];
    const draw = new ProfessionalPoolEngine();
    const follow = new ProfessionalPoolEngine();
    draw.rack(rack);
    follow.rack(rack);

    draw.strikeCueBall({ direction: { x: 1, y: 0 }, power: 0.78, contactOffset: { x: 0, y: -0.9 } });
    follow.strikeCueBall({ direction: { x: 1, y: 0 }, power: 0.78, contactOffset: { x: 0, y: 0.9 } });

    const drawCue = stepUntilSettled(draw).balls.find((ball) => ball.id === 0);
    const followCue = stepUntilSettled(follow).balls.find((ball) => ball.id === 0);

    const endpointDistance = Math.hypot(
      (drawCue?.position.x ?? 0) - (followCue?.position.x ?? 0),
      (drawCue?.position.y ?? 0) - (followCue?.position.y ?? 0),
    );

    expect(endpointDistance).toBeGreaterThan(BALL_RADIUS * 2);
  });

  it('uses left and right cue contact points to change the rail rebound endpoint', () => {
    const cuePosition = { x: TABLE.width / 2, y: TABLE.height / 2 };
    const left = new ProfessionalPoolEngine();
    const right = new ProfessionalPoolEngine();
    left.rack([{ id: 0, kind: 'cue', position: cuePosition }]);
    right.rack([{ id: 0, kind: 'cue', position: cuePosition }]);

    left.strikeCueBall({ direction: { x: 1, y: 0.2 }, power: 0.55, contactOffset: { x: -0.9, y: 0 } });
    right.strikeCueBall({ direction: { x: 1, y: 0.2 }, power: 0.55, contactOffset: { x: 0.9, y: 0 } });

    const leftCue = stepUntilSettled(left).balls.find((ball) => ball.id === 0);
    const rightCue = stepUntilSettled(right).balls.find((ball) => ball.id === 0);
    const endpointDistance = Math.hypot(
      (leftCue?.position.x ?? 0) - (rightCue?.position.x ?? 0),
      (leftCue?.position.y ?? 0) - (rightCue?.position.y ?? 0),
    );

    expect(endpointDistance).toBeGreaterThan(BALL_RADIUS);
  });

  it('keeps side-English cushion exit subtle enough for realistic play', () => {
    const cuePosition = { x: TABLE.width / 2, y: TABLE.height / 2 };
    const samples = [
      { name: 'center', contactOffset: { x: 0, y: 0 } },
      { name: 'left', contactOffset: { x: -0.9, y: 0 } },
      { name: 'right', contactOffset: { x: 0.9, y: 0 } },
    ].map((sample) => {
      const engine = new ProfessionalPoolEngine();
      engine.rack([{ id: 0, kind: 'cue', position: cuePosition }]);
      engine.strikeCueBall({ direction: { x: 1, y: 0.2 }, power: 0.55, contactOffset: sample.contactOffset });

      return {
        ...sample,
        engine,
        firstCushionStep: undefined as number | undefined,
        exitPosition: undefined as Vector | undefined,
      };
    });

    for (let step = 0; step < 1400 && samples.some((sample) => !sample.exitPosition); step += 1) {
      samples.forEach((sample) => {
        const result = sample.engine.step(1 / 60);
        const cue = result.balls.find((ball) => ball.id === 0);
        if (
          sample.firstCushionStep === undefined &&
          result.events.some((event) => event.type === 'cushion' && event.ballId === 0)
        ) {
          sample.firstCushionStep = step;
        }
        if (sample.firstCushionStep !== undefined && step === sample.firstCushionStep + 12) {
          sample.exitPosition = cue?.position;
        }
      });
    }

    const center = samples.find((sample) => sample.name === 'center')?.exitPosition;
    const left = samples.find((sample) => sample.name === 'left')?.exitPosition;
    const right = samples.find((sample) => sample.name === 'right')?.exitPosition;
    const leftRightDistance = Math.hypot(
      (left?.x ?? 0) - (right?.x ?? 0),
      (left?.y ?? 0) - (right?.y ?? 0),
    );
    const largestCenterDistance = Math.max(
      Math.hypot((left?.x ?? 0) - (center?.x ?? 0), (left?.y ?? 0) - (center?.y ?? 0)),
      Math.hypot((right?.x ?? 0) - (center?.x ?? 0), (right?.y ?? 0) - (center?.y ?? 0)),
    );

    expect(center).toBeDefined();
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    expect(leftRightDistance).toBeGreaterThan(BALL_RADIUS * 2);
    expect(leftRightDistance).toBeLessThan(BALL_RADIUS * 6.5);
    expect(largestCenterDistance).toBeLessThan(BALL_RADIUS * 6);
  });

  it('emits both ball ids for ball-ball collision events', () => {
    const engine = new ProfessionalPoolEngine();
    engine.rack([
      { id: 0, kind: 'cue', position: { x: CUE_START.x, y: CUE_START.y } },
      { id: 1, kind: 'target', position: { x: CUE_START.x + BALL_RADIUS * 4, y: CUE_START.y }, label: 1 },
    ]);
    engine.strikeCueBall({ direction: { x: 1, y: 0 }, power: 0.7 });

    const events = [];
    let result = engine.step(1 / 60);
    events.push(...result.events);
    for (let i = 0; i < 90 && !events.some((event) => event.type === 'collision'); i += 1) {
      result = engine.step(1 / 60);
      events.push(...result.events);
    }

    expect(
      events.some(
        (event) =>
          event.type === 'collision' &&
          ((event.ballId === 0 && event.otherBallId === 1) || (event.ballId === 1 && event.otherBallId === 0)),
      ),
    ).toBe(true);
  });

  it('emits a pocket event only once after a ball falls into a pocket', () => {
    const engine = new ProfessionalPoolEngine();
    engine.rack([
      { id: 0, kind: 'cue', position: CUE_START },
      { id: 1, kind: 'target', position: { x: 550, y: 90 }, label: 1 },
    ]);

    engine.setBallVelocity(1, { x: 0, y: 1.2 });

    let result = engine.step(1 / 60);
    for (let i = 0; i < 200 && !result.events.some((event) => event.type === 'pocket'); i += 1) {
      result = engine.step(1 / 60);
    }
    const next = engine.step(1 / 60);

    expect(result.events.filter((event) => event.type === 'pocket' && event.ballId === 1)).toHaveLength(1);
    expect(next.events.filter((event) => event.type === 'pocket' && event.ballId === 1)).toHaveLength(0);
  });

  it('settles gameplay as soon as only pocketed balls are still falling', () => {
    const engine = new ProfessionalPoolEngine();
    engine.rack([
      { id: 0, kind: 'cue', position: CUE_START },
      { id: 1, kind: 'target', position: { x: 550, y: 90 }, label: 1 },
    ]);

    engine.setBallVelocity(1, { x: 0, y: 1.2 });

    let result = engine.step(1 / 60);
    for (let i = 0; i < 200 && !result.events.some((event) => event.type === 'pocket'); i += 1) {
      result = engine.step(1 / 60);
    }

    expect(result.events.filter((event) => event.type === 'pocket' && event.ballId === 1)).toHaveLength(1);
    expect(result.balls.find((ball) => ball.id === 1)?.state).toBe('falling');
    expect(result.settled).toBe(true);
  });

  it('keeps balls inside the visible cushion nose bounds when no pocket is involved', () => {
    const engine = new ProfessionalPoolEngine();
    engine.rack([
      { id: 0, kind: 'cue', position: CUE_START },
      {
        id: 1,
        kind: 'target',
        position: { x: PLAY_AREA.right - BALL_RADIUS - 2, y: TABLE.height / 2 },
        label: 1,
      },
    ]);

    engine.setBallVelocity(1, { x: 2.4, y: 0 });

    let furthestRight = 0;
    for (let i = 0; i < 90; i += 1) {
      const result = engine.step(1 / 60);
      const target = result.balls.find((ball) => ball.id === 1);
      furthestRight = Math.max(furthestRight, target?.position.x ?? 0);
    }

    expect(furthestRight).toBeLessThanOrEqual(PLAY_AREA.right - BALL_RADIUS + 1);

    const topEngine = new ProfessionalPoolEngine();
    topEngine.rack([
      { id: 0, kind: 'cue', position: CUE_START },
      {
        id: 1,
        kind: 'target',
        position: { x: TABLE.width / 2 + 140, y: PLAY_AREA.top + BALL_RADIUS + 2 },
        label: 1,
      },
    ]);

    topEngine.setBallVelocity(1, { x: 0, y: 2.4 });

    let closestTop = TABLE.height;
    for (let i = 0; i < 90; i += 1) {
      const result = topEngine.step(1 / 60);
      const target = result.balls.find((ball) => ball.id === 1);
      closestTop = Math.min(closestTop, target?.position.y ?? TABLE.height);
    }

    expect(closestTop).toBeGreaterThanOrEqual(PLAY_AREA.top + BALL_RADIUS - 1);
  });

  it('lets balls reach the straight cushion nose without an artificial gap', () => {
    const engine = new ProfessionalPoolEngine();
    engine.rack([
      { id: 0, kind: 'cue', position: CUE_START },
      {
        id: 1,
        kind: 'target',
        position: { x: PLAY_AREA.right - BALL_RADIUS - 2, y: TABLE.height / 2 },
        label: 1,
      },
    ]);

    engine.setBallVelocity(1, { x: 2.4, y: 0 });

    let furthestRight = 0;
    for (let i = 0; i < 90; i += 1) {
      const result = engine.step(1 / 60);
      const target = result.balls.find((ball) => ball.id === 1);
      furthestRight = Math.max(furthestRight, target?.position.x ?? 0);
    }

    expect(furthestRight).toBeGreaterThanOrEqual(PLAY_AREA.right - BALL_RADIUS - 1);
    expect(furthestRight).toBeLessThanOrEqual(PLAY_AREA.right - BALL_RADIUS + 1);

    const topEngine = new ProfessionalPoolEngine();
    topEngine.rack([
      { id: 0, kind: 'cue', position: CUE_START },
      {
        id: 1,
        kind: 'target',
        position: { x: TABLE.width / 2 + 140, y: PLAY_AREA.top + BALL_RADIUS + 2 },
        label: 1,
      },
    ]);

    topEngine.setBallVelocity(1, { x: 0, y: 2.4 });

    let closestTop = TABLE.height;
    for (let i = 0; i < 90; i += 1) {
      const result = topEngine.step(1 / 60);
      const target = result.balls.find((ball) => ball.id === 1);
      closestTop = Math.min(closestTop, target?.position.y ?? TABLE.height);
    }

    expect(closestTop).toBeGreaterThanOrEqual(PLAY_AREA.top + BALL_RADIUS - 1);
    expect(closestTop).toBeLessThanOrEqual(PLAY_AREA.top + BALL_RADIUS + 1);
  });

  it('waits until more than half a ball crosses a middle pocket before falling', () => {
    const shallow = new ProfessionalPoolEngine();
    shallow.rack([
      { id: 0, kind: 'cue', position: CUE_START },
      {
        id: 1,
        kind: 'target',
        position: { x: TABLE.width / 2, y: PLAY_AREA.top - BALL_RADIUS / 2 + 1 },
        label: 1,
      },
    ]);

    const shallowStep = shallow.step(1 / 60);

    expect(shallowStep.events.filter((event) => event.type === 'pocket' && event.ballId === 1)).toHaveLength(0);
    expect(shallowStep.balls.find((ball) => ball.id === 1)?.pocketed).toBe(false);
    expect(shallowStep.balls.find((ball) => ball.id === 1)?.position.y).toBeGreaterThanOrEqual(
      PLAY_AREA.top - BALL_RADIUS / 2 - 1,
    );

    const deep = new ProfessionalPoolEngine();
    deep.rack([
      { id: 0, kind: 'cue', position: CUE_START },
      {
        id: 1,
        kind: 'target',
        position: { x: TABLE.width / 2, y: PLAY_AREA.top - BALL_RADIUS / 2 - 1 },
        label: 1,
      },
    ]);

    const deepStep = deep.step(1 / 60);

    expect(deepStep.events.filter((event) => event.type === 'pocket' && event.ballId === 1)).toHaveLength(1);
  });

  it('does not drop a ball through the middle pocket when it crosses outside the visible cushion mouth', () => {
    const engine = new ProfessionalPoolEngine();
    engine.rack([
      { id: 0, kind: 'cue', position: CUE_START },
      {
        id: 1,
        kind: 'target',
        position: {
          x: TABLE.width / 2 + POCKET_MOUTHS.middleCaptureHalf + BALL_RADIUS,
          y: PLAY_AREA.top + BALL_RADIUS + CUSHION_NOSE_INSET + 2,
        },
        label: 1,
      },
    ]);

    engine.setBallVelocity(1, { x: 0, y: 2.4 });

    let result = engine.step(1 / 60);
    for (let i = 0; i < 90 && !result.events.some((event) => event.type === 'pocket'); i += 1) {
      result = engine.step(1 / 60);
    }

    expect(result.events.filter((event) => event.type === 'pocket' && event.ballId === 1)).toHaveLength(0);
    expect(result.balls.find((ball) => ball.id === 1)?.pocketed).toBe(false);
    expect(result.balls.find((ball) => ball.id === 1)?.position.y).toBeGreaterThanOrEqual(
      PLAY_AREA.top + BALL_RADIUS + CUSHION_NOSE_INSET - 1,
    );
  });

  it('lets balls cross the visible edge of the middle pocket instead of bouncing off an invisible wall', () => {
    const engine = new ProfessionalPoolEngine();
    engine.rack([
      { id: 0, kind: 'cue', position: CUE_START },
      {
        id: 1,
        kind: 'target',
        position: {
          x: TABLE.width / 2 + BALL_RADIUS * 2,
          y: PLAY_AREA.top + BALL_RADIUS + CUSHION_NOSE_INSET + 2,
        },
        label: 1,
      },
    ]);

    engine.setBallVelocity(1, { x: 0, y: 2.4 });

    const events = [];
    let result = engine.step(1 / 60);
    events.push(...result.events);
    for (let i = 0; i < 90 && !events.some((event) => event.type === 'pocket' && event.ballId === 1); i += 1) {
      result = engine.step(1 / 60);
      events.push(...result.events);
    }

    expect(events.filter((event) => event.type === 'cushion' && event.ballId === 1)).toHaveLength(0);
    expect(events.filter((event) => event.type === 'pocket' && event.ballId === 1)).toHaveLength(1);
    expect(result.balls.find((ball) => ball.id === 1)?.pocketed).toBe(true);
  });

  it('lets a centered ball enter the middle pocket throat without bouncing off the cushion', () => {
    const engine = new ProfessionalPoolEngine();
    engine.rack([
      { id: 0, kind: 'cue', position: CUE_START },
      {
        id: 1,
        kind: 'target',
        position: {
          x: TABLE.width / 2,
          y: PLAY_AREA.top + BALL_RADIUS + CUSHION_NOSE_INSET + 2,
        },
        label: 1,
      },
    ]);

    engine.setBallVelocity(1, { x: 0, y: 2.4 });

    const events = [];
    let result = engine.step(1 / 60);
    events.push(...result.events);
    for (let i = 0; i < 30 && !result.events.some((event) => event.type === 'pocket'); i += 1) {
      result = engine.step(1 / 60);
      events.push(...result.events);
    }

    expect(events.filter((event) => event.type === 'cushion' && event.ballId === 1)).toHaveLength(0);
    expect(events.filter((event) => event.type === 'pocket' && event.ballId === 1)).toHaveLength(1);
    expect(result.balls.find((ball) => ball.id === 1)?.pocketed).toBe(true);
  });

  it('lets a ball enter the lower-right corner pocket without bouncing out', () => {
    const engine = new ProfessionalPoolEngine();
    engine.rack([
      { id: 0, kind: 'cue', position: CUE_START },
      {
        id: 1,
        kind: 'target',
        position: {
          x: PLAY_AREA.right - BALL_RADIUS - CUSHION_NOSE_INSET - 5,
          y: PLAY_AREA.bottom - BALL_RADIUS - CUSHION_NOSE_INSET - 5,
        },
        label: 1,
      },
    ]);

    engine.setBallVelocity(1, { x: 1.65, y: -1.65 });

    const events = [];
    let result = engine.step(1 / 60);
    events.push(...result.events);
    for (let i = 0; i < 40 && !events.some((event) => event.type === 'pocket' && event.ballId === 1); i += 1) {
      result = engine.step(1 / 60);
      events.push(...result.events);
    }

    expect(events.filter((event) => event.type === 'cushion' && event.ballId === 1)).toHaveLength(0);
    expect(events.filter((event) => event.type === 'pocket' && event.ballId === 1)).toHaveLength(1);
    expect(result.balls.find((ball) => ball.id === 1)?.pocketed).toBe(true);
  });

  it('lets balls fall into all four corner pockets', () => {
    const cases = [
      {
        name: 'upper-left',
        position: {
          x: PLAY_AREA.left + BALL_RADIUS + CUSHION_NOSE_INSET + 5,
          y: PLAY_AREA.top + BALL_RADIUS + CUSHION_NOSE_INSET + 5,
        },
        velocity: { x: -1.65, y: 1.65 },
      },
      {
        name: 'upper-right',
        position: {
          x: PLAY_AREA.right - BALL_RADIUS - CUSHION_NOSE_INSET - 5,
          y: PLAY_AREA.top + BALL_RADIUS + CUSHION_NOSE_INSET + 5,
        },
        velocity: { x: 1.65, y: 1.65 },
      },
      {
        name: 'lower-left',
        position: {
          x: PLAY_AREA.left + BALL_RADIUS + CUSHION_NOSE_INSET + 5,
          y: PLAY_AREA.bottom - BALL_RADIUS - CUSHION_NOSE_INSET - 5,
        },
        velocity: { x: -1.65, y: -1.65 },
      },
      {
        name: 'lower-right',
        position: {
          x: PLAY_AREA.right - BALL_RADIUS - CUSHION_NOSE_INSET - 5,
          y: PLAY_AREA.bottom - BALL_RADIUS - CUSHION_NOSE_INSET - 5,
        },
        velocity: { x: 1.65, y: -1.65 },
      },
    ];

    for (const corner of cases) {
      const engine = new ProfessionalPoolEngine();
      engine.rack([
        { id: 0, kind: 'cue', position: CUE_START },
        { id: 1, kind: 'target', position: corner.position, label: 1 },
      ]);

      engine.setBallVelocity(1, corner.velocity);

      const events = [];
      let result = engine.step(1 / 60);
      events.push(...result.events);
      for (let i = 0; i < 50 && !events.some((event) => event.type === 'pocket' && event.ballId === 1); i += 1) {
        result = engine.step(1 / 60);
        events.push(...result.events);
      }

      expect(events.filter((event) => event.type === 'pocket' && event.ballId === 1), corner.name).toHaveLength(1);
      expect(result.balls.find((ball) => ball.id === 1)?.pocketed, corner.name).toBe(true);
    }
  });

  it('lets angled shots from the cloth fall into corner pockets', () => {
    const cases = [
      {
        name: 'upper-left',
        position: { x: PLAY_AREA.left + 150, y: PLAY_AREA.top + 96 },
        velocity: { x: -2.4, y: 1.55 },
      },
      {
        name: 'upper-right',
        position: { x: PLAY_AREA.right - 150, y: PLAY_AREA.top + 96 },
        velocity: { x: 2.4, y: 1.55 },
      },
      {
        name: 'lower-left',
        position: { x: PLAY_AREA.left + 150, y: PLAY_AREA.bottom - 96 },
        velocity: { x: -2.4, y: -1.55 },
      },
      {
        name: 'lower-right',
        position: { x: PLAY_AREA.right - 150, y: PLAY_AREA.bottom - 96 },
        velocity: { x: 2.4, y: -1.55 },
      },
    ];

    for (const corner of cases) {
      const engine = new ProfessionalPoolEngine();
      engine.rack([
        { id: 0, kind: 'cue', position: CUE_START },
        { id: 1, kind: 'target', position: corner.position, label: 1 },
      ]);

      engine.setBallVelocity(1, corner.velocity);

      const events = [];
      let result = engine.step(1 / 60);
      events.push(...result.events);
      for (let i = 0; i < 180 && !events.some((event) => event.type === 'pocket' && event.ballId === 1); i += 1) {
        result = engine.step(1 / 60);
        events.push(...result.events);
      }

      expect(events.filter((event) => event.type === 'pocket' && event.ballId === 1), corner.name).toHaveLength(1);
      expect(result.balls.find((ball) => ball.id === 1)?.pocketed, corner.name).toBe(true);
    }
  });

  it('drops balls that settle inside the visible corner pocket openings', () => {
    const cases = [
      { name: 'upper-left', position: { x: PLAY_AREA.left + 16, y: PLAY_AREA.top + 16 } },
      { name: 'upper-right', position: { x: PLAY_AREA.right - 16, y: PLAY_AREA.top + 16 } },
      { name: 'lower-left', position: { x: PLAY_AREA.left + 16, y: PLAY_AREA.bottom - 16 } },
      { name: 'lower-right', position: { x: PLAY_AREA.right - 16, y: PLAY_AREA.bottom - 16 } },
    ];

    for (const corner of cases) {
      const engine = new ProfessionalPoolEngine();
      engine.rack([
        { id: 0, kind: 'cue', position: CUE_START },
        { id: 1, kind: 'target', position: corner.position, label: 1 },
      ]);

      const result = engine.step(1 / 60);

      expect(result.events.filter((event) => event.type === 'pocket' && event.ballId === 1), corner.name).toHaveLength(
        1,
      );
      expect(result.balls.find((ball) => ball.id === 1)?.pocketed, corner.name).toBe(true);
    }
  });

  it('does not pocket a ball resting just outside the corner mouth gate', () => {
    const engine = new ProfessionalPoolEngine();
    engine.rack([
      { id: 0, kind: 'cue', position: CUE_START },
      {
        id: 1,
        kind: 'target',
        position: {
          x: PLAY_AREA.left + POCKET_MOUTHS.cornerCapture * 0.53,
          y: PLAY_AREA.top + POCKET_MOUTHS.cornerCapture * 0.49,
        },
        label: 1,
      },
    ]);

    const result = engine.step(1 / 60);

    expect(result.events.filter((event) => event.type === 'pocket' && event.ballId === 1)).toHaveLength(0);
    expect(result.balls.find((ball) => ball.id === 1)?.pocketed).toBe(false);
  });

  it('survives a full-power break shot without throwing or losing collision events', () => {
    const engine = new ProfessionalPoolEngine();
    engine.rack(starts());
    engine.strikeCueBall({ direction: { x: 1, y: 0.05 }, power: 1.0 });

    const allEvents = [];
    let result = engine.step(1 / 60);
    allEvents.push(...result.events);
    for (let i = 0; i < 1400 && !result.settled; i += 1) {
      result = engine.step(1 / 60);
      allEvents.push(...result.events);
    }

    expect(result.settled).toBe(true);
    expect(
      allEvents.some(
        (event) =>
          event.type === 'collision' && (event.ballId === 0 || event.otherBallId === 0),
      ),
    ).toBe(true);
  });

  it('drains events so they can be rescued after an engine failure', () => {
    const engine = new ProfessionalPoolEngine();
    engine.rack([
      { id: 0, kind: 'cue', position: CUE_START },
      { id: 1, kind: 'target', position: { x: CUE_START.x + BALL_RADIUS * 4, y: CUE_START.y }, label: 1 },
    ]);
    engine.strikeCueBall({ direction: { x: 1, y: 0 }, power: 0.9 });

    let step = engine.step(1 / 60);
    for (let i = 0; i < 10 && step.events.length === 0; i += 1) {
      step = engine.step(1 / 60);
    }
    expect(step.events.length).toBeGreaterThan(0);

    const drained = engine.drainEvents();
    expect(drained).toEqual(step.events);

    const afterDrain = engine.drainEvents();
    expect(afterDrain).toEqual([]);
  });

  it('bounces off the corner jaw with cushion feedback when the path is outside the pocket mouth', () => {
    const engine = new ProfessionalPoolEngine();
    engine.rack([
      { id: 0, kind: 'cue', position: CUE_START },
      {
        id: 1,
        kind: 'target',
        position: {
          x: PLAY_AREA.left + POCKET_MOUTHS.cornerCapture + BALL_RADIUS + 6,
          y: PLAY_AREA.top + BALL_RADIUS + 2,
        },
        label: 1,
      },
    ]);

    engine.setBallVelocity(1, { x: 0, y: 2.4 });

    const events = [];
    let result = engine.step(1 / 60);
    events.push(...result.events);
    for (let i = 0; i < 80; i += 1) {
      result = engine.step(1 / 60);
      events.push(...result.events);
    }

    const target = result.balls.find((ball) => ball.id === 1);

    expect(events.filter((event) => event.type === 'pocket' && event.ballId === 1)).toHaveLength(0);
    expect(events.some((event) => event.type === 'cushion' && event.ballId === 1)).toBe(true);
    expect(target?.pocketed).toBe(false);
    expect(target?.position.y).toBeGreaterThanOrEqual(PLAY_AREA.top + BALL_RADIUS - 1);
  });

  it('lets a ball rolling down the right rail fall into the lower-right corner pocket', () => {
    const engine = new ProfessionalPoolEngine();
    engine.rack([
      { id: 0, kind: 'cue', position: CUE_START },
      {
        id: 1,
        kind: 'target',
        position: {
          x: PLAY_AREA.right - BALL_RADIUS - CUSHION_NOSE_INSET + 1,
          y: PLAY_AREA.bottom - BALL_RADIUS * 6,
        },
        label: 1,
      },
    ]);

    engine.setBallVelocity(1, { x: 0.08, y: -2.3 });

    const events = [];
    let result = engine.step(1 / 60);
    events.push(...result.events);
    for (let i = 0; i < 160 && !events.some((event) => event.type === 'pocket' && event.ballId === 1); i += 1) {
      result = engine.step(1 / 60);
      events.push(...result.events);
    }

    expect(events.filter((event) => event.type === 'pocket' && event.ballId === 1)).toHaveLength(1);
    expect(result.balls.find((ball) => ball.id === 1)?.pocketed).toBe(true);
  });

  it('lets rail-following balls fall into the lower-left and upper-right corner pockets', () => {
    const cases = [
      {
        name: 'lower-left from left rail',
        position: {
          x: PLAY_AREA.left + BALL_RADIUS + CUSHION_NOSE_INSET + 2,
          y: PLAY_AREA.bottom - 150,
        },
        velocity: { x: -0.18, y: -2.05 },
      },
      {
        name: 'upper-right from right rail',
        position: {
          x: PLAY_AREA.right - BALL_RADIUS - CUSHION_NOSE_INSET - 2,
          y: PLAY_AREA.top + 150,
        },
        velocity: { x: 0.18, y: 2.05 },
      },
      {
        name: 'lower-left from bottom rail',
        position: {
          x: PLAY_AREA.left + 150,
          y: PLAY_AREA.bottom - BALL_RADIUS - CUSHION_NOSE_INSET - 2,
        },
        velocity: { x: -2.05, y: -0.18 },
      },
      {
        name: 'upper-right from top rail',
        position: {
          x: PLAY_AREA.right - 150,
          y: PLAY_AREA.top + BALL_RADIUS + CUSHION_NOSE_INSET + 2,
        },
        velocity: { x: 2.05, y: 0.18 },
      },
      {
        name: 'lower-left through mouth without a one-frame outside-wall bounce',
        position: {
          x: PLAY_AREA.left + 22,
          y: PLAY_AREA.bottom - 3,
        },
        velocity: { x: -3.0, y: -3.0 },
      },
      {
        name: 'upper-right through mouth without a one-frame outside-wall bounce',
        position: {
          x: PLAY_AREA.right - 22,
          y: PLAY_AREA.top + 3,
        },
        velocity: { x: 3.0, y: 3.0 },
      },
    ];

    for (const corner of cases) {
      const engine = new ProfessionalPoolEngine();
      engine.rack([
        { id: 0, kind: 'cue', position: CUE_START },
        { id: 1, kind: 'target', position: corner.position, label: 1 },
      ]);

      engine.setBallVelocity(1, corner.velocity);

      const events = [];
      let result = engine.step(1 / 60);
      events.push(...result.events);
      for (let i = 0; i < 180 && !events.some((event) => event.type === 'pocket' && event.ballId === 1); i += 1) {
        result = engine.step(1 / 60);
        events.push(...result.events);
      }

      expect(events.filter((event) => event.type === 'pocket' && event.ballId === 1), corner.name).toHaveLength(1);
      expect(result.balls.find((ball) => ball.id === 1)?.pocketed, corner.name).toBe(true);
    }
  });

  it('does not reject valid lower-left and upper-right shots aimed at the pocket center', () => {
    const cases = [
      {
        name: 'lower-left',
        start: { x: 164, y: 540 },
        pocket: POCKETS[3],
        speed: 1.8,
      },
      {
        name: 'upper-right',
        start: { x: 936, y: 100 },
        pocket: POCKETS[2],
        speed: 1.8,
      },
    ];

    for (const shot of cases) {
      const engine = new ProfessionalPoolEngine();
      engine.rack([
        { id: 0, kind: 'cue', position: CUE_START },
        { id: 1, kind: 'target', position: shot.start, label: 1 },
      ]);
      const dx = shot.pocket.x - shot.start.x;
      const dy = shot.pocket.y - shot.start.y;
      const len = Math.hypot(dx, dy);
      engine.setBallVelocity(1, { x: (dx / len) * shot.speed, y: -(dy / len) * shot.speed });

      const events = [];
      let result = engine.step(1 / 60);
      events.push(...result.events);
      for (let i = 0; i < 240 && !events.some((event) => event.type === 'pocket' && event.ballId === 1); i += 1) {
        result = engine.step(1 / 60);
        events.push(...result.events);
      }

      expect(events.filter((event) => event.type === 'cushion' && event.ballId === 1), shot.name).toHaveLength(0);
      expect(events.filter((event) => event.type === 'pocket' && event.ballId === 1), shot.name).toHaveLength(1);
      expect(result.balls.find((ball) => ball.id === 1)?.pocketed, shot.name).toBe(true);
    }
  });

  it('does not bounce balls out of lower-left and upper-right pocket mouths during a long frame', () => {
    const cases = [
      {
        name: 'lower-left',
        position: { x: PLAY_AREA.left + 22, y: PLAY_AREA.bottom - 6 },
        velocity: { x: -2.4, y: -2.4 },
      },
      {
        name: 'upper-right',
        position: { x: PLAY_AREA.right - 22, y: PLAY_AREA.top + 6 },
        velocity: { x: 2.4, y: 2.4 },
      },
    ];

    for (const corner of cases) {
      const engine = new ProfessionalPoolEngine();
      engine.rack([
        { id: 0, kind: 'cue', position: CUE_START },
        { id: 1, kind: 'target', position: corner.position, label: 1 },
      ]);

      engine.setBallVelocity(1, corner.velocity);

      const result = engine.step(1 / 20);

      expect(result.events.filter((event) => event.type === 'cushion' && event.ballId === 1), corner.name).toHaveLength(0);
      expect(result.balls.find((ball) => ball.id === 1)?.pocketed, corner.name).toBe(true);
    }
  });

  it('keeps a ball beside the lower-right pocket on the table when it has not crossed the pocket threshold', () => {
    const engine = new ProfessionalPoolEngine();
    engine.rack([
      { id: 0, kind: 'cue', position: CUE_START },
      {
        id: 1,
        kind: 'target',
        position: {
          x: PLAY_AREA.right - BALL_RADIUS - CUSHION_NOSE_INSET - 1,
          y: PLAY_AREA.bottom - BALL_RADIUS * 3,
        },
        label: 1,
      },
    ]);

    engine.setBallVelocity(1, { x: 2.6, y: 0 });

    let result = engine.step(1 / 60);
    for (let i = 0; i < 80; i += 1) {
      result = engine.step(1 / 60);
    }

    const target = result.balls.find((ball) => ball.id === 1);

    expect(result.events.filter((event) => event.type === 'pocket' && event.ballId === 1)).toHaveLength(0);
    expect(target?.pocketed).toBe(false);
    expect(target?.position.x).toBeLessThanOrEqual(PLAY_AREA.right - BALL_RADIUS - CUSHION_NOSE_INSET + 1);
  });

  it('separates overlapping stationary balls so they never stay inside each other', () => {
    const engine = new ProfessionalPoolEngine();
    const overlapDistance = BALL_RADIUS * 1.4;
    engine.rack([
      { id: 0, kind: 'cue', position: { x: CUE_START.x, y: CUE_START.y } },
      {
        id: 1,
        kind: 'target',
        position: { x: CUE_START.x + overlapDistance, y: CUE_START.y },
        label: 1,
      },
    ]);

    const result = engine.step(1 / 60);
    const cue = result.balls.find((ball) => ball.id === 0)!;
    const target = result.balls.find((ball) => ball.id === 1)!;
    const distance = Math.hypot(cue.position.x - target.position.x, cue.position.y - target.position.y);

    expect(distance).toBeGreaterThanOrEqual(BALL_RADIUS * 2 - 0.5);
  });

  it('exposes network snapshot data with pixel-space positions and velocities', () => {
    const engine = new ProfessionalPoolEngine();
    engine.rack([
      { id: 0, kind: 'cue', position: CUE_START },
      { id: 1, kind: 'target', position: { x: CUE_START.x + BALL_RADIUS * 10, y: CUE_START.y }, label: 1 },
    ]);
    engine.strikeCueBall({ direction: { x: 1, y: 0 }, power: 0.5 });
    engine.step(1 / 60);

    const snap = engine.getNetworkSnapshot();
    const cueSnap = snap.find((entry) => entry.id === 0)!;

    expect(cueSnap).toBeDefined();
    expect(cueSnap.pocketed).toBe(false);
    expect(cueSnap.x).toBeGreaterThan(CUE_START.x);
    expect(Math.abs(cueSnap.y - CUE_START.y)).toBeLessThan(1);
    expect(cueSnap.vx).toBeGreaterThan(0);
  });

  it('applies network snapshots so remote observers can correct drifted balls', () => {
    const engine = new ProfessionalPoolEngine();
    engine.rack([
      { id: 0, kind: 'cue', position: CUE_START },
      { id: 1, kind: 'target', position: { x: CUE_START.x + BALL_RADIUS * 10, y: CUE_START.y }, label: 1 },
    ]);

    engine.applyNetworkSnapshot([
      { id: 1, x: 500, y: 320, vx: 120, vy: -60, pocketed: false },
    ]);

    const step = engine.step(1 / 60);
    const target = step.balls.find((ball) => ball.id === 1)!;

    expect(Math.abs(target.position.x - 500)).toBeLessThan(BALL_RADIUS);
    expect(Math.abs(target.position.y - 320)).toBeLessThan(BALL_RADIUS);
    expect(target.position.x).toBeGreaterThan(500 - 1);
  });

  it('does not emit a pocket event after a programmatic pocketBall call', () => {
    const engine = new ProfessionalPoolEngine();
    engine.rack([
      { id: 0, kind: 'cue', position: CUE_START },
      { id: 1, kind: 'target', position: { x: CUE_START.x + BALL_RADIUS * 10, y: CUE_START.y }, label: 1 },
    ]);

    engine.pocketBall(1);
    const step = engine.step(1 / 60);

    expect(step.balls.find((ball) => ball.id === 1)?.pocketed).toBe(true);
    expect(step.events.filter((event) => event.type === 'pocket' && event.ballId === 1)).toHaveLength(0);
  });

  it('keeps a network-pocketed ball out of play without emitting a local pocket event', () => {
    const engine = new ProfessionalPoolEngine();
    engine.rack([
      { id: 0, kind: 'cue', position: CUE_START },
      { id: 1, kind: 'target', position: { x: CUE_START.x + BALL_RADIUS * 10, y: CUE_START.y }, label: 1 },
    ]);

    engine.applyNetworkSnapshot([
      { id: 1, x: 500, y: 320, vx: 0, vy: 0, pocketed: true },
    ]);
    const step = engine.step(1 / 60);

    expect(step.balls.find((ball) => ball.id === 1)?.pocketed).toBe(true);
    expect(step.events.filter((event) => event.type === 'pocket' && event.ballId === 1)).toHaveLength(0);
  });

  it('break shot generates cushion events after cue-ball first contact', () => {
    const engine = new ProfessionalPoolEngine();
    engine.rack(starts());
    engine.strikeCueBall({ direction: { x: 1, y: 0 }, power: 0.8 });

    let firstContactBallId: number | null = null;
    let cushionAfterContact = false;
    let pocketedNonCue = false;

    let result = engine.step(1 / 60);
    for (let frame = 0; frame < 1400 && !result.settled; frame += 1) {
      for (const event of result.events) {
        if (event.type === 'collision' && event.otherBallId !== undefined) {
          if (event.ballId === 0 && event.otherBallId !== 0 && firstContactBallId === null) {
            firstContactBallId = event.otherBallId;
          } else if (event.otherBallId === 0 && event.ballId !== 0 && firstContactBallId === null) {
            firstContactBallId = event.ballId;
          }
        }
        if (event.type === 'cushion' && firstContactBallId !== null) {
          cushionAfterContact = true;
        }
        if (event.type === 'pocket' && event.ballId !== 0) {
          pocketedNonCue = true;
        }
      }
      result = engine.step(1 / 60);
    }
    for (const event of result.events) {
      if (event.type === 'collision' && event.otherBallId !== undefined) {
        if (event.ballId === 0 && event.otherBallId !== 0 && firstContactBallId === null) {
          firstContactBallId = event.otherBallId;
        } else if (event.otherBallId === 0 && event.ballId !== 0 && firstContactBallId === null) {
          firstContactBallId = event.ballId;
        }
      }
      if (event.type === 'cushion' && firstContactBallId !== null) {
        cushionAfterContact = true;
      }
      if (event.type === 'pocket' && event.ballId !== 0) {
        pocketedNonCue = true;
      }
    }

    expect(firstContactBallId).not.toBeNull();
    expect(cushionAfterContact || pocketedNonCue).toBe(true);
  });

  it('reports the apex one ball as the first cue contact on a nine-ball break', () => {
    const engine = new ProfessionalPoolEngine();
    engine.rack(nineBallStarts());
    engine.strikeCueBall({ direction: { x: 1, y: 0 }, power: 0.9 });

    let firstContactBallId: number | null = null;
    let result = engine.step(1 / 60);
    for (let frame = 0; frame < 1400 && !result.settled && firstContactBallId === null; frame += 1) {
      for (const event of result.events) {
        if (event.type !== 'collision' || event.otherBallId === undefined) {
          continue;
        }
        if (event.ballId === 0 && event.otherBallId !== 0) {
          firstContactBallId = event.otherBallId;
          break;
        }
        if (event.otherBallId === 0 && event.ballId !== 0) {
          firstContactBallId = event.ballId;
          break;
        }
      }
      result = engine.step(1 / 60);
    }

    expect(firstContactBallId).toBe(1);
  });
});
