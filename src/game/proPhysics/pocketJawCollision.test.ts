import { describe, expect, it } from 'vitest';
import { BALL_RADIUS, CUE_START, TABLE, type Vector } from '../constants';
import { ProfessionalPoolEngine } from './engine';
import {
  findEarliestPocketJawCollision,
  findPocketJawSegmentCollision,
  VISIBLE_POCKET_JAWS,
} from './pocketJawCollision';

describe('visible pocket-jaw collision', () => {
  it('sweeps the ball volume against all twelve GLB cushion jaws', () => {
    const tableCenter = { x: TABLE.width / 2, y: TABLE.height / 2 };

    for (const jaw of VISIBLE_POCKET_JAWS) {
      const midpoint = {
        x: (jaw.start.x + jaw.end.x) / 2,
        y: (jaw.start.y + jaw.end.y) / 2,
      };
      const tangent = {
        x: jaw.end.x - jaw.start.x,
        y: jaw.end.y - jaw.start.y,
      };
      const tangentLength = Math.hypot(tangent.x, tangent.y);
      let normal = { x: -tangent.y / tangentLength, y: tangent.x / tangentLength };
      const towardTable = { x: tableCenter.x - midpoint.x, y: tableCenter.y - midpoint.y };
      if (normal.x * towardTable.x + normal.y * towardTable.y < 0) {
        normal = { x: -normal.x, y: -normal.y };
      }
      const start = { x: midpoint.x + normal.x * 60, y: midpoint.y + normal.y * 60 };
      const velocity = { x: -normal.x * 1600, y: -normal.y * 1600 };

      const collision = findPocketJawSegmentCollision(start, velocity, 0.05, BALL_RADIUS, jaw);

      expect(collision?.jaw.name, jaw.name).toBe(jaw.name);
      expect(collision?.time, jaw.name).toBeGreaterThan(0);
      expect(collision?.time, jaw.name).toBeLessThan(0.05);
    }
  });

  it('does not invent a jaw collision through the clear center of a middle pocket', () => {
    expect(findEarliestPocketJawCollision(
      { x: TABLE.width / 2, y: 160 },
      { x: 0, y: -1600 },
      0.06,
      BALL_RADIUS,
    )).toBeUndefined();
  });

  const visibleMiddleJawHits = [
    { name: 'top-left', position: { x: 535, y: 160 }, velocity: { x: 0, y: 2.4 } },
    { name: 'top-right', position: { x: 565, y: 160 }, velocity: { x: 0, y: 2.4 } },
    { name: 'bottom-left', position: { x: 535, y: 480 }, velocity: { x: 0, y: -2.4 } },
    { name: 'bottom-right', position: { x: 565, y: 480 }, velocity: { x: 0, y: -2.4 } },
  ];

  for (const jaw of visibleMiddleJawHits) {
    it(`rebounds the screenshot-path ball edge from the ${jaw.name} middle jaw before pocketing`, () => {
      const engine = new ProfessionalPoolEngine();
      engine.rack([
        { id: 0, kind: 'cue', position: CUE_START },
        { id: 1, kind: 'target', position: jaw.position, label: 1 },
      ]);
      engine.setBallVelocity(1, jaw.velocity);

      let firstEvent: 'cushion' | 'pocket' | undefined;
      for (let frame = 0; frame < 60 && !firstEvent; frame += 1) {
        const result = engine.step(1 / 60);
        if (result.events.some((event) => event.type === 'cushion' && event.ballId === 1)) firstEvent = 'cushion';
        if (result.events.some((event) => event.type === 'pocket' && event.ballId === 1)) firstEvent = 'pocket';
      }

      expect(firstEvent).toBe('cushion');
    });
  }
});
