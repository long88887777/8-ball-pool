import type { Vector } from '../constants';

export type PhysicsBallKind = 'cue' | 'target';
export type PhysicsBallState = 'stationary' | 'rolling' | 'sliding' | 'falling' | 'in-pocket';

export type PhysicsBallStart = {
  id: number;
  kind: PhysicsBallKind;
  position: Vector;
  color?: string;
  label?: number;
};

export type PhysicsBallSnapshot = {
  id: number;
  kind: PhysicsBallKind;
  position: Vector;
  state: PhysicsBallState;
  pocketed: boolean;
};

export type PhysicsShot = {
  direction: Vector;
  power: number;
  /**
   * Normalized cue-ball contact point. x < 0 is left English, x > 0 is right English,
   * y > 0 is high/follow, and y < 0 is low/draw. Values are clamped by the engine.
   */
  contactOffset?: Vector;
};

export type PhysicsVelocity = {
  x: number;
  y: number;
};

export type PhysicsPocketEvent = {
  type: 'pocket';
  ballId: number;
  kind: PhysicsBallKind;
  pocketIndex: number;
};

export type PhysicsCollisionEvent = {
  type: 'collision' | 'cushion';
  ballId: number;
  otherBallId?: number;
  speed: number;
};

export type PhysicsEvent = PhysicsPocketEvent | PhysicsCollisionEvent;

export type PhysicsStepResult = {
  balls: PhysicsBallSnapshot[];
  events: PhysicsEvent[];
  settled: boolean;
};
