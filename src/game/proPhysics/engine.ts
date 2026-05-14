import { Vector3 } from 'three';
import { BALL_RADIUS, CUE_START, CUSHION_NOSE_INSET, PLAY_AREA, POCKET_MOUTHS, TABLE, type Vector } from '../constants';
import { createCoordinateMapper } from './coordinate';
import type {
  PhysicsBallSnapshot,
  PhysicsBallStart,
  PhysicsEvent,
  PhysicsShot,
  PhysicsStepResult,
  PhysicsVelocity,
} from './types';
import { Ball, State } from '../../vendor/tailuge-billiards/model/ball';
import { Collision } from '../../vendor/tailuge-billiards/model/physics/collision';
import { setR, R } from '../../vendor/tailuge-billiards/model/physics/constants';
import { Cushion } from '../../vendor/tailuge-billiards/model/physics/cushion';
import { Knuckle } from '../../vendor/tailuge-billiards/model/physics/knuckle';
import { Pocket } from '../../vendor/tailuge-billiards/model/physics/pocket';
import { bounceHanBlend, cueToSpin } from '../../vendor/tailuge-billiards/model/physics/physics';
import { PocketGeometry } from '../../vendor/tailuge-billiards/view/pocketgeometry';
import { TableGeometry } from '../../vendor/tailuge-billiards/view/tablegeometry';
import { scaleContactOffsetForCueModel } from './spin';

const MAX_COLLISION_DEPTH = 100;
const MAX_STEP_SECONDS = 1 / 120;
const SHOT_SPEED_METERS_PER_SECOND = 8.0;
const PLAYABLE_REST_SPEED = 0.003;
const PLAYABLE_REST_SPIN = 0.08;

type VisualDropPocket = {
  pocket: Pocket;
  captures(point: Vector): boolean;
};

type EngineBall = Ball & {
  localId: number;
  localKind: 'cue' | 'target';
  emittedPocket?: boolean;
  capturedPocketIndex?: number;
};

export type NetworkBallSnapshot = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pocketed: boolean;
};

export class ProfessionalPoolEngine {
  private readonly mapper = createCoordinateMapper();
  private balls: EngineBall[] = [];
  private pairs: Array<{ a: EngineBall; b: EngineBall }> = [];
  private events: PhysicsEvent[] = [];
  private visualDropPockets: VisualDropPocket[] = [];
  private postUpdateCushionContacts = new Map<number, Vector>();
  private visibleCushionContacts = new Map<number, Vector>();

  constructor() {
    setR(this.mapper.ballRadiusMeters);
    this.configureVisualTableGeometry();
    PocketGeometry.scaleToRadius(R);
    this.visualDropPockets = this.createVisualDropPockets();
  }

  rack(starts: PhysicsBallStart[]): void {
    this.visibleCushionContacts.clear();
    this.postUpdateCushionContacts.clear();
    this.balls = starts.map((start) => {
      const point = this.mapper.toPhysics(start.position);
      const ball = new Ball(new Vector3(point.x, point.y, 0), undefined, start.label) as EngineBall;
      ball.localId = start.id;
      ball.localKind = start.kind;
      ball.emittedPocket = false;
      return ball;
    });
    this.pairs = [];
    for (let a = 0; a < this.balls.length; a += 1) {
      for (let b = a + 1; b < this.balls.length; b += 1) {
        this.pairs.push({ a: this.balls[a], b: this.balls[b] });
      }
    }
  }

  strikeCueBall(shot: PhysicsShot): void {
    const cueBall = this.balls.find((ball) => ball.localKind === 'cue');
    if (!cueBall || !this.isSettled()) {
      return;
    }

    const length = Math.hypot(shot.direction.x, shot.direction.y);
    if (length === 0) {
      return;
    }

    cueBall.vel.set(
      (shot.direction.x / length) * SHOT_SPEED_METERS_PER_SECOND * shot.power,
      -(shot.direction.y / length) * SHOT_SPEED_METERS_PER_SECOND * shot.power,
      0,
    );
    const spinOffset = scaleContactOffsetForCueModel(shot.contactOffset);
    cueBall.rvel.copy(cueToSpin(new Vector3(spinOffset.x, spinOffset.y, 0), cueBall.vel));
    cueBall.state = State.Sliding;
  }

  step(deltaSeconds: number): PhysicsStepResult {
    this.events = [];
    this.visibleCushionContacts.clear();
    let remaining = Math.min(deltaSeconds, 1 / 20);
    while (remaining > 0) {
      const step = Math.min(MAX_STEP_SECONDS, remaining);
      this.advance(step);
      remaining -= step;
    }
    this.emitNewPocketEvents();
    return { balls: this.getBalls(), events: this.events, settled: this.isSettled() };
  }

  drainEvents(): PhysicsEvent[] {
    const events = [...this.events];
    this.events = [];
    return events;
  }

  getBalls(): PhysicsBallSnapshot[] {
    return this.balls.map((ball) => {
      const visibleContact = this.visibleCushionContacts.get(ball.localId);
      return {
        id: ball.localId,
        kind: ball.localKind,
        position: visibleContact ?? this.mapper.toPixels({ x: ball.pos.x, y: ball.pos.y }),
        state: this.toSnapshotState(ball.state),
        pocketed: !ball.onTable(),
      };
    });
  }

  isSettled(): boolean {
    return this.balls.every((ball) => !ball.inMotion());
  }

  resetCueBall(position: Vector = CUE_START): void {
    const cueBall = this.balls.find((ball) => ball.localKind === 'cue');
    if (!cueBall) {
      return;
    }

    const point = this.mapper.toPhysics(position);
    cueBall.pos.set(point.x, point.y, 0);
    cueBall.setStationary();
    cueBall.state = State.Stationary;
    cueBall.emittedPocket = false;
    this.visibleCushionContacts.delete(cueBall.localId);
    this.postUpdateCushionContacts.delete(cueBall.localId);
  }

  resetBall(ballId: number, position: Vector): void {
    const ball = this.balls.find((b) => b.localId === ballId);
    if (!ball) {
      return;
    }

    const point = this.mapper.toPhysics(position);
    ball.pos.set(point.x, point.y, 0);
    ball.setStationary();
    ball.state = State.Stationary;
    ball.emittedPocket = false;
    this.visibleCushionContacts.delete(ball.localId);
    this.postUpdateCushionContacts.delete(ball.localId);
  }

  pocketBall(ballId: number): void {
    const ball = this.balls.find((b) => b.localId === ballId);
    if (!ball) return;
    ball.setStationary();
    ball.state = State.InPocket;
    ball.emittedPocket = true;
  }

  setBallVelocity(ballId: number, velocity: PhysicsVelocity): void {
    const ball = this.balls.find((candidate) => candidate.localId === ballId);
    if (!ball || !ball.onTable()) {
      return;
    }

    ball.vel.set(velocity.x, velocity.y, 0);
    ball.state = velocity.x === 0 && velocity.y === 0 ? State.Stationary : State.Sliding;
  }

  private advance(deltaSeconds: number): void {
    let depth = 0;
    this.postUpdateCushionContacts.clear();
    while (!this.prepareAdvanceAll(deltaSeconds)) {
      depth += 1;
      if (depth > MAX_COLLISION_DEPTH) {
        break;
      }
    }
    this.balls.forEach((ball) => {
      ball.update(deltaSeconds);
      this.applyPostUpdateCushionContact(ball);
      this.enforceVisualBounds(ball);
      this.snapPlayableRest(ball);
      ball.fround();
    });
    this.separateOverlappingPairs();
  }

  private prepareAdvanceAll(deltaSeconds: number): boolean {
    const resolved = this.resolveEarliestCollision(deltaSeconds);
    if (resolved) {
      return false;
    }
    return this.balls.every((ball) => this.prepareAdvanceToCushions(ball, deltaSeconds));
  }

  private resolveEarliestCollision(deltaSeconds: number): boolean {
    let earliest: { a: EngineBall; b: EngineBall; time: number } | null = null;

    for (const pair of this.pairs) {
      if (!Collision.willCollide(pair.a, pair.b, deltaSeconds)) {
        continue;
      }
      const t = this.computeCollisionTime(pair.a, pair.b);
      if (earliest === null || t < earliest.time) {
        earliest = { a: pair.a, b: pair.b, time: t };
      }
    }

    if (!earliest) {
      return false;
    }

    const speed = Collision.collide(earliest.a, earliest.b);
    this.events.push({ type: 'collision', ballId: earliest.a.localId, otherBallId: earliest.b.localId, speed });
    return true;
  }

  private computeCollisionTime(a: EngineBall, b: EngineBall): number {
    const dpX = a.pos.x - b.pos.x;
    const dpY = a.pos.y - b.pos.y;
    const dvX = a.vel.x - b.vel.x;
    const dvY = a.vel.y - b.vel.y;

    const aCoeff = dvX * dvX + dvY * dvY;
    if (aCoeff === 0) {
      return 0;
    }

    const bCoeff = 2 * (dpX * dvX + dpY * dvY);
    const cCoeff = dpX * dpX + dpY * dpY - 4 * R * R;
    const discriminant = bCoeff * bCoeff - 4 * aCoeff * cCoeff;

    if (discriminant < 0) {
      return 0;
    }

    const t = (-bCoeff - Math.sqrt(discriminant)) / (2 * aCoeff);
    return t > 0 ? t : 0;
  }

  private prepareAdvanceToCushions(ball: EngineBall, deltaSeconds: number): boolean {
    if (!ball.onTable()) {
      return true;
    }

    const visualPocket = this.findVisualDropPocket(ball, deltaSeconds);
    if (visualPocket) {
      ball.capturedPocketIndex = visualPocket.index;
      visualPocket.pocket.fall(ball, deltaSeconds);
      return false;
    }

    if (this.isInPocketThroat(ball, deltaSeconds)) {
      return true;
    }

    const futurePosition = ball.futurePosition(deltaSeconds);
    if (Math.abs(futurePosition.y) < TableGeometry.tableY && Math.abs(futurePosition.x) < TableGeometry.tableX) {
      return true;
    }

    const straightCushionContact = this.straightCushionContactFor(ball, futurePosition);
    const cushionSpeed = Cushion.bounceAny(ball, deltaSeconds, true, bounceHanBlend);
    if (cushionSpeed) {
      if (straightCushionContact) {
        this.postUpdateCushionContacts.set(ball.localId, straightCushionContact);
        this.visibleCushionContacts.set(ball.localId, straightCushionContact);
      }
      this.events.push({ type: 'cushion', ballId: ball.localId, speed: cushionSpeed });
      return false;
    }

    const knuckle = Knuckle.findBouncing(ball, deltaSeconds);
    if (knuckle) {
      const straightKnuckleContact = this.straightCushionContactFor(ball, futurePosition);
      const speed = knuckle.bounce(ball);
      if (straightKnuckleContact) {
        this.postUpdateCushionContacts.set(ball.localId, straightKnuckleContact);
        this.visibleCushionContacts.set(ball.localId, straightKnuckleContact);
      }
      this.events.push({ type: 'cushion', ballId: ball.localId, speed });
      return false;
    }

    return true;
  }

  private configureVisualTableGeometry(): void {
    const center = {
      x: (PLAY_AREA.left + PLAY_AREA.right) / 2,
      y: (PLAY_AREA.top + PLAY_AREA.bottom) / 2,
    };
    const rightLimit = this.mapper.toPhysics({
      x: PLAY_AREA.right - BALL_RADIUS,
      y: center.y,
    }).x;
    const topLimit = this.mapper.toPhysics({
      x: center.x,
      y: PLAY_AREA.top + BALL_RADIUS,
    }).y;

    TableGeometry.tableX = Math.abs(rightLimit);
    TableGeometry.tableY = Math.abs(topLimit);
    TableGeometry.X = TableGeometry.tableX + R;
    TableGeometry.Y = TableGeometry.tableY + R;
  }

  private createVisualDropPockets(): VisualDropPocket[] {
    const pocketRadius = TABLE.pocketRadius / this.mapper.pixelsPerMeter;
    const halfBall = BALL_RADIUS / 2;
    const sideOpening = POCKET_MOUTHS.middleCaptureHalf;
    const cornerOpening = POCKET_MOUTHS.cornerCapture;
    const middleX = TABLE.width / 2;

    const makePocket = (point: Vector, captures: (point: Vector) => boolean): VisualDropPocket => {
      const physicsPoint = this.mapper.toPhysics(point);
      return {
        pocket: new Pocket(new Vector3(physicsPoint.x, physicsPoint.y, 0), pocketRadius),
        captures,
      };
    };

    return [
      makePocket({ x: PLAY_AREA.left - BALL_RADIUS, y: PLAY_AREA.top - BALL_RADIUS }, (point) => {
        return (
          this.isCornerPocketCapture(point, PLAY_AREA.left, PLAY_AREA.top, -1, -1, cornerOpening, halfBall)
        );
      }),
      makePocket({ x: PLAY_AREA.right + BALL_RADIUS, y: PLAY_AREA.top - BALL_RADIUS }, (point) => {
        return (
          this.isCornerPocketCapture(point, PLAY_AREA.right, PLAY_AREA.top, 1, -1, cornerOpening, halfBall)
        );
      }),
      makePocket({ x: PLAY_AREA.left - BALL_RADIUS, y: PLAY_AREA.bottom + BALL_RADIUS }, (point) => {
        return (
          this.isCornerPocketCapture(point, PLAY_AREA.left, PLAY_AREA.bottom, -1, 1, cornerOpening, halfBall)
        );
      }),
      makePocket({ x: PLAY_AREA.right + BALL_RADIUS, y: PLAY_AREA.bottom + BALL_RADIUS }, (point) => {
        return (
          this.isCornerPocketCapture(point, PLAY_AREA.right, PLAY_AREA.bottom, 1, 1, cornerOpening, halfBall)
        );
      }),
      makePocket({ x: middleX, y: PLAY_AREA.top - BALL_RADIUS }, (point) => {
        return Math.abs(point.x - middleX) <= sideOpening && point.y < PLAY_AREA.top - halfBall;
      }),
      makePocket({ x: middleX, y: PLAY_AREA.bottom + BALL_RADIUS }, (point) => {
        return Math.abs(point.x - middleX) <= sideOpening && point.y > PLAY_AREA.bottom + halfBall;
      }),
    ];
  }

  private findVisualDropPocket(ball: EngineBall, deltaSeconds: number): { pocket: Pocket; index: number } | undefined {
    const futurePosition = ball.futurePosition(deltaSeconds);
    const futurePixels = this.mapper.toPixels({ x: futurePosition.x, y: futurePosition.y });
    const idx = this.visualDropPockets.findIndex((dropPocket) => dropPocket.captures(futurePixels));
    if (idx === -1) return undefined;
    return { pocket: this.visualDropPockets[idx].pocket, index: idx };
  }

  private isInPocketThroat(ball: EngineBall, deltaSeconds: number): boolean {
    const currentPixels = this.mapper.toPixels({ x: ball.pos.x, y: ball.pos.y });
    const futurePosition = ball.futurePosition(deltaSeconds);
    const futurePixels = this.mapper.toPixels({ x: futurePosition.x, y: futurePosition.y });
    const movement = { x: futurePixels.x - currentPixels.x, y: futurePixels.y - currentPixels.y };
    return this.isInMiddlePocketThroat(futurePixels) || this.isInCornerPocketThroat(futurePixels, movement);
  }

  private isInMiddlePocketThroat(point: Vector): boolean {
    const middleX = TABLE.width / 2;
    return (
      Math.abs(point.x - middleX) <= POCKET_MOUTHS.middleCaptureHalf &&
      (point.y < PLAY_AREA.top + BALL_RADIUS ||
        point.y > PLAY_AREA.bottom - BALL_RADIUS)
    );
  }

  private isInCornerPocketThroat(point: Vector, movement: Vector = { x: 0, y: 0 }): boolean {
    return (
      this.isInSingleCornerPocketThroat(point, movement, PLAY_AREA.left, PLAY_AREA.top, -1, -1) ||
      this.isInSingleCornerPocketThroat(point, movement, PLAY_AREA.right, PLAY_AREA.top, 1, -1) ||
      this.isInSingleCornerPocketThroat(point, movement, PLAY_AREA.left, PLAY_AREA.bottom, -1, 1) ||
      this.isInSingleCornerPocketThroat(point, movement, PLAY_AREA.right, PLAY_AREA.bottom, 1, 1)
    );
  }

  private isInSingleCornerPocketThroat(
    point: Vector,
    movement: Vector,
    cornerX: number,
    cornerY: number,
    xDirection: -1 | 1,
    yDirection: -1 | 1,
  ): boolean {
    const movingIntoPocket =
      movement.x * xDirection >= -0.001 &&
      movement.y * yDirection >= -0.001 &&
      Math.abs(movement.x) > 0.001 &&
      Math.abs(movement.y) > 0.001;
    const throatOpening = movingIntoPocket
      ? POCKET_MOUTHS.cornerCapture + BALL_RADIUS * 2
      : POCKET_MOUTHS.cornerCapture;

    return this.isInCornerMouthGate(point, cornerX, cornerY, xDirection, yDirection, BALL_RADIUS / 2, throatOpening);
  }

  private isCornerPocketCapture(
    point: Vector,
    cornerX: number,
    cornerY: number,
    xDirection: -1 | 1,
    yDirection: -1 | 1,
    cornerOpening: number,
    halfBall: number,
  ): boolean {
    return this.isInCornerMouthGate(point, cornerX, cornerY, xDirection, yDirection, halfBall, cornerOpening);
  }

  private isInCornerMouthGate(
    point: Vector,
    cornerX: number,
    cornerY: number,
    xDirection: -1 | 1,
    yDirection: -1 | 1,
    outsideAllowance = 0,
    opening = POCKET_MOUTHS.cornerCapture,
  ): boolean {
    const inwardX = -((point.x - cornerX) * xDirection);
    const inwardY = -((point.y - cornerY) * yDirection);

    if (
      inwardX < -outsideAllowance ||
      inwardY < -outsideAllowance ||
      inwardX > POCKET_MOUTHS.cornerVisual ||
      inwardY > POCKET_MOUTHS.cornerVisual
    ) {
      return false;
    }

    return Math.max(inwardX, 0) + Math.max(inwardY, 0) <= opening;
  }

  private enforceVisualBounds(ball: EngineBall): void {
    if (!ball.onTable()) {
      return;
    }

    const pixels = this.mapper.toPixels({ x: ball.pos.x, y: ball.pos.y });
    const movement = { x: ball.vel.x, y: -ball.vel.y };
    if (this.isInMiddlePocketThroat(pixels) || this.isInCornerPocketThroat(pixels, movement)) {
      return;
    }

    const bounds = this.visualBoundsFor(pixels);
    const clamped = {
      x: Math.min(Math.max(pixels.x, bounds.left), bounds.right),
      y: Math.min(Math.max(pixels.y, bounds.top), bounds.bottom),
    };

    if (clamped.x === pixels.x && clamped.y === pixels.y) {
      return;
    }

    const next = this.mapper.toPhysics(clamped);
    if (clamped.x !== pixels.x) {
      ball.vel.x *= -0.72;
      ball.rvel.multiplyScalar(0.72);
    }
    if (clamped.y !== pixels.y) {
      ball.vel.y *= -0.72;
      ball.rvel.multiplyScalar(0.72);
    }
    ball.pos.set(next.x, next.y, 0);
  }

  private straightCushionContactFor(ball: EngineBall, futurePosition: Vector3): Vector | undefined {
    const pixels = this.mapper.toPixels({ x: ball.pos.x, y: ball.pos.y });
    const futurePixels = this.mapper.toPixels({ x: futurePosition.x, y: futurePosition.y });
    const movement = { x: futurePixels.x - pixels.x, y: futurePixels.y - pixels.y };
    if (this.isInMiddlePocketThroat(futurePixels) || this.isInCornerPocketThroat(futurePixels, movement)) {
      return undefined;
    }

    const bounds = this.visualBoundsFor(futurePixels);
    const clamped = {
      x: Math.min(Math.max(futurePixels.x, bounds.left), bounds.right),
      y: Math.min(Math.max(futurePixels.y, bounds.top), bounds.bottom),
    };

    if (clamped.x === futurePixels.x && clamped.y === futurePixels.y) {
      return undefined;
    }

    return clamped;
  }

  private applyPostUpdateCushionContact(ball: EngineBall): void {
    const contact = this.postUpdateCushionContacts.get(ball.localId);
    if (!contact || !ball.onTable()) {
      return;
    }

    const next = this.mapper.toPhysics(contact);
    ball.pos.set(next.x, next.y, 0);
  }

  private visualBoundsFor(point: Vector): { left: number; right: number; top: number; bottom: number } {
    const halfBall = BALL_RADIUS / 2;
    const sideOpening = POCKET_MOUTHS.middleCaptureHalf;
    const cornerOpening = POCKET_MOUTHS.cornerCapture;
    const middleX = TABLE.width / 2;
    const bounds = {
      left: PLAY_AREA.left + BALL_RADIUS,
      right: PLAY_AREA.right - BALL_RADIUS,
      top: PLAY_AREA.top + BALL_RADIUS,
      bottom: PLAY_AREA.bottom - BALL_RADIUS,
    };

    if (Math.abs(point.x - middleX) <= sideOpening) {
      if (point.y < PLAY_AREA.top + BALL_RADIUS) {
        bounds.top = PLAY_AREA.top - halfBall;
      }
      if (point.y > PLAY_AREA.bottom - BALL_RADIUS) {
        bounds.bottom = PLAY_AREA.bottom + halfBall;
      }
    }

    if (this.isInCornerMouthGate(point, PLAY_AREA.left, PLAY_AREA.top, -1, -1, halfBall, cornerOpening)) {
      bounds.left = PLAY_AREA.left - halfBall;
      bounds.top = PLAY_AREA.top - halfBall;
    }
    if (this.isInCornerMouthGate(point, PLAY_AREA.right, PLAY_AREA.top, 1, -1, halfBall, cornerOpening)) {
      bounds.right = PLAY_AREA.right + halfBall;
      bounds.top = PLAY_AREA.top - halfBall;
    }
    if (this.isInCornerMouthGate(point, PLAY_AREA.left, PLAY_AREA.bottom, -1, 1, halfBall, cornerOpening)) {
      bounds.left = PLAY_AREA.left - halfBall;
      bounds.bottom = PLAY_AREA.bottom + halfBall;
    }
    if (this.isInCornerMouthGate(point, PLAY_AREA.right, PLAY_AREA.bottom, 1, 1, halfBall, cornerOpening)) {
      bounds.right = PLAY_AREA.right + halfBall;
      bounds.bottom = PLAY_AREA.bottom + halfBall;
    }

    return bounds;
  }

  private emitNewPocketEvents(): void {
    for (const ball of this.balls) {
      if (!ball.onTable() && !ball.emittedPocket) {
        ball.emittedPocket = true;
        this.events.push({ type: 'pocket', ballId: ball.localId, kind: ball.localKind, pocketIndex: ball.capturedPocketIndex ?? 0 });
      }
    }
  }

  private snapPlayableRest(ball: EngineBall): void {
    if (!ball.onTable()) {
      return;
    }
    if (ball.vel.length() <= PLAYABLE_REST_SPEED && ball.rvel.length() <= PLAYABLE_REST_SPIN) {
      ball.setStationary();
    }
  }

  private separateOverlappingPairs(): void {
    const minDistance = 2 * R;
    const minDistanceSq = minDistance * minDistance;
    const epsilon = 1e-7;
    for (const pair of this.pairs) {
      if (!pair.a.onTable() || !pair.b.onTable()) continue;
      const dx = pair.a.pos.x - pair.b.pos.x;
      const dy = pair.a.pos.y - pair.b.pos.y;
      const distSq = dx * dx + dy * dy;
      if (distSq >= minDistanceSq) continue;
      const dist = Math.sqrt(distSq);
      let nx: number;
      let ny: number;
      if (dist < epsilon) {
        nx = 1;
        ny = 0;
      } else {
        nx = dx / dist;
        ny = dy / dist;
      }
      const push = (minDistance - dist) / 2 + epsilon;
      pair.a.pos.x += nx * push;
      pair.a.pos.y += ny * push;
      pair.b.pos.x -= nx * push;
      pair.b.pos.y -= ny * push;
    }
  }

  getNetworkSnapshot(): NetworkBallSnapshot[] {
    return this.balls.map((ball) => {
      const pixels = this.mapper.toPixels({ x: ball.pos.x, y: ball.pos.y });
      return {
        id: ball.localId,
        x: pixels.x,
        y: pixels.y,
        vx: ball.vel.x * this.mapper.pixelsPerMeter,
        vy: -ball.vel.y * this.mapper.pixelsPerMeter,
        pocketed: !ball.onTable(),
      };
    });
  }

  applyNetworkSnapshot(snapshots: NetworkBallSnapshot[]): void {
    for (const snap of snapshots) {
      const ball = this.balls.find((b) => b.localId === snap.id);
      if (!ball) continue;
      if (snap.pocketed) {
        if (ball.onTable()) {
          ball.setStationary();
          ball.state = State.InPocket;
        }
        ball.emittedPocket = true;
        continue;
      }
      const point = this.mapper.toPhysics({ x: snap.x, y: snap.y });
      ball.pos.set(point.x, point.y, 0);
      const vx = snap.vx / this.mapper.pixelsPerMeter;
      const vy = -snap.vy / this.mapper.pixelsPerMeter;
      ball.vel.set(vx, vy, 0);
      const moving = Math.hypot(vx, vy) > PLAYABLE_REST_SPEED;
      ball.state = moving ? State.Sliding : State.Stationary;
      if (!moving) {
        ball.rvel.set(0, 0, 0);
      }
      this.visibleCushionContacts.delete(ball.localId);
      this.postUpdateCushionContacts.delete(ball.localId);
    }
  }

  private toSnapshotState(state: State): PhysicsBallSnapshot['state'] {
    if (state === State.InPocket) return 'in-pocket';
    if (state === State.Falling) return 'falling';
    if (state === State.Rolling) return 'rolling';
    if (state === State.Sliding) return 'sliding';
    return 'stationary';
  }
}
