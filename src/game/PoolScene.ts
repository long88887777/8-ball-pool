import Phaser from 'phaser';
import {
  BALL_COLORS,
  BALL_RADIUS,
  CUE_START,
  PLAY_AREA,
  POCKETS,
  TABLE,
  TARGET_STARTS,
  type Vector,
} from './constants';
import { clampShotPower, distance, isInPocket, isTableReady } from './geometry';
import { createBallTexture, drawPoolHall, drawRefinedTable } from './rendering';
import {
  createGameState,
  pocketCueBall,
  pocketTargetBall,
  recordStroke,
  resolveSettledState,
  restartGame,
  type GameState,
} from './state';

type BallKind = 'cue' | 'target';

type PoolBall = Phaser.Physics.Matter.Image & {
  body: MatterJS.BodyType;
  ballKind: BallKind;
  pocketed?: boolean;
};

type AimState = {
  pointerId: number;
  current: Vector;
};

const DEPTH = {
  room: 0,
  table: 1,
  pocket: 2,
  ball: 4,
  aim: 5,
};

export class PoolScene extends Phaser.Scene {
  private cueBall!: PoolBall;
  private targetBalls: PoolBall[] = [];
  private aimLine!: Phaser.GameObjects.Graphics;
  private state: GameState = createGameState(TARGET_STARTS.length);
  private aimState: AimState | null = null;
  private wasMoving = false;
  private restartButton?: HTMLButtonElement;
  private restartHandler = (): void => {
    this.restartRack();
  };

  constructor() {
    super('PoolScene');
  }

  create(): void {
    this.matter.world.setBounds(
      PLAY_AREA.left,
      PLAY_AREA.top,
      PLAY_AREA.right - PLAY_AREA.left,
      PLAY_AREA.bottom - PLAY_AREA.top,
      32,
    );
    this.createTextures();
    this.drawRoom();
    this.drawTable();
    this.createBalls();
    this.aimLine = this.add.graphics().setDepth(DEPTH.aim);
    this.bindInput();
    this.bindRestart();
    this.updateHud();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.restartButton?.removeEventListener('click', this.restartHandler);
    });
  }

  update(): void {
    this.applyRollingFriction();
    this.checkPockets();
    this.handleSettledTable();
    this.renderAim();
  }

  private createTextures(): void {
    createBallTexture(this, { key: 'cue-ball', fill: '#f8f0dd' });
    BALL_COLORS.forEach((color, index) => {
      createBallTexture(this, { key: `target-ball-${index}`, fill: color });
    });
  }

  private drawRoom(): void {
    drawPoolHall(this);
  }

  private drawTable(): void {
    drawRefinedTable(this);
  }

  private createBalls(): void {
    this.cueBall?.destroy();
    this.targetBalls.forEach((ball) => ball.destroy());
    this.targetBalls = [];

    this.cueBall = this.createBall(CUE_START, 'cue-ball', 'cue');
    TARGET_STARTS.forEach((position, index) => {
      this.targetBalls.push(this.createBall(position, `target-ball-${index}`, 'target'));
    });
  }

  private createBall(position: Vector, texture: string, kind: BallKind): PoolBall {
    const ball = this.matter.add.image(position.x, position.y, texture, undefined, {
      shape: {
        type: 'circle',
        radius: BALL_RADIUS,
      },
      restitution: 0.94,
      friction: 0.002,
      frictionAir: 0.012,
      frictionStatic: 0,
      density: 0.002,
    }) as PoolBall;

    ball.setDepth(DEPTH.ball);
    ball.setCircle(BALL_RADIUS);
    ball.setBounce(0.94);
    ball.setFriction(0.002, 0, 0.012);
    ball.setMass(1);
    ball.ballKind = kind;
    return ball;
  }

  private bindInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.canAim()) {
        return;
      }

      const point = { x: pointer.worldX, y: pointer.worldY };
      if (distance(point, this.cuePosition()) > BALL_RADIUS * 2.2) {
        return;
      }

      this.aimState = {
        pointerId: pointer.id,
        current: point,
      };
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.aimState || pointer.id !== this.aimState.pointerId) {
        return;
      }

      this.aimState.current = { x: pointer.worldX, y: pointer.worldY };
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!this.aimState || pointer.id !== this.aimState.pointerId) {
        return;
      }

      this.shootFromAim();
    });
  }

  private bindRestart(): void {
    this.restartButton = document.querySelector<HTMLButtonElement>('#restart') ?? undefined;
    this.restartButton?.addEventListener('click', this.restartHandler);
  }

  private canAim(): boolean {
    return !this.state.cueBallPocketed && this.state.remainingTargets > 0 && this.tableReady();
  }

  private cuePosition(): Vector {
    return { x: this.cueBall.x, y: this.cueBall.y };
  }

  private shootFromAim(): void {
    if (!this.aimState) {
      return;
    }

    const cue = this.cuePosition();
    const pull = {
      x: this.aimState.current.x - cue.x,
      y: this.aimState.current.y - cue.y,
    };
    const dragDistance = Math.hypot(pull.x, pull.y);
    const power = clampShotPower(dragDistance);
    this.aimState = null;
    this.aimLine.clear();

    if (power < TABLE.minShotPower || dragDistance === 0) {
      return;
    }

    const impulseScale = TABLE.maxImpulse * power;
    this.cueBall.applyForce(
      new Phaser.Math.Vector2((-pull.x / dragDistance) * impulseScale, (-pull.y / dragDistance) * impulseScale),
    );
    this.state = recordStroke(this.state);
    this.wasMoving = true;
    this.updateHud();
  }

  private renderAim(): void {
    this.aimLine.clear();
    if (!this.aimState) {
      return;
    }

    const cue = this.cuePosition();
    const pull = {
      x: this.aimState.current.x - cue.x,
      y: this.aimState.current.y - cue.y,
    };
    const dragDistance = Math.hypot(pull.x, pull.y);
    const power = clampShotPower(dragDistance);

    if (dragDistance < 1) {
      return;
    }

    const direction = {
      x: -pull.x / dragDistance,
      y: -pull.y / dragDistance,
    };
    const guideLength = 120 + power * 190;
    const cueBack = 36 + power * 90;

    this.aimLine.lineStyle(3, 0xf6e7b4, 0.9);
    this.aimLine.beginPath();
    this.aimLine.moveTo(cue.x + direction.x * BALL_RADIUS, cue.y + direction.y * BALL_RADIUS);
    this.aimLine.lineTo(cue.x + direction.x * guideLength, cue.y + direction.y * guideLength);
    this.aimLine.strokePath();

    this.aimLine.lineStyle(7, 0x8a5a32, 0.95);
    this.aimLine.beginPath();
    this.aimLine.moveTo(cue.x - direction.x * (BALL_RADIUS + cueBack), cue.y - direction.y * (BALL_RADIUS + cueBack));
    this.aimLine.lineTo(cue.x - direction.x * (BALL_RADIUS + 8), cue.y - direction.y * (BALL_RADIUS + 8));
    this.aimLine.strokePath();

    this.aimLine.fillStyle(0xd9a441, 0.95);
    this.aimLine.fillRoundedRect(PLAY_AREA.left, PLAY_AREA.bottom + 24, power * 220, 10, 5);
  }

  private checkPockets(): void {
    for (const ball of this.activeBalls()) {
      if (ball.pocketed || !isInPocket({ x: ball.x, y: ball.y }, POCKETS)) {
        continue;
      }

      ball.pocketed = true;
      ball.setVisible(false);
      ball.setCollisionCategory(0);
      ball.setVelocity(0, 0);

      if (ball.ballKind === 'cue') {
        this.state = pocketCueBall(this.state);
      } else {
        this.state = pocketTargetBall(this.state);
      }
      this.updateHud();
    }
  }

  private handleSettledTable(): void {
    const moving = !this.tableReady();
    if (moving) {
      this.wasMoving = true;
      return;
    }

    if (!this.wasMoving) {
      return;
    }

    this.wasMoving = false;
    this.stopTinyDrift();

    if (this.state.cueBallPocketed) {
      this.resetCueBallBody();
    }
    this.state = resolveSettledState(this.state);
    this.updateHud();
  }

  private activeBalls(): PoolBall[] {
    return [this.cueBall, ...this.targetBalls].filter((ball) => !ball.pocketed);
  }

  private tableReady(): boolean {
    return isTableReady(this.activeBalls().map((ball) => Math.hypot(ball.body.velocity.x, ball.body.velocity.y)));
  }

  private applyRollingFriction(): void {
    for (const ball of this.activeBalls()) {
      const velocity = ball.body.velocity;
      const speed = Math.hypot(velocity.x, velocity.y);
      if (speed > 0 && speed < TABLE.readySpeed) {
        ball.setVelocity(0, 0);
      }
    }
  }

  private stopTinyDrift(): void {
    for (const ball of this.activeBalls()) {
      ball.setVelocity(0, 0);
      ball.setAngularVelocity(0);
    }
  }

  private resetCueBallBody(): void {
    this.cueBall.pocketed = false;
    this.cueBall.setVisible(true);
    this.cueBall.setCollisionCategory(1);
    this.cueBall.setPosition(CUE_START.x, CUE_START.y);
    this.cueBall.setVelocity(0, 0);
    this.cueBall.setAngularVelocity(0);
  }

  private restartRack(): void {
    this.aimState = null;
    this.aimLine?.clear();
    this.createBalls();
    this.state = restartGame(TARGET_STARTS.length);
    this.wasMoving = false;
    this.updateHud();
  }

  private updateHud(): void {
    const score = document.querySelector('#score');
    const strokes = document.querySelector('#strokes');
    const remaining = document.querySelector('#remaining');
    const message = document.querySelector('#message');

    if (score) score.textContent = `Score ${this.state.score}`;
    if (strokes) strokes.textContent = `Strokes ${this.state.strokes}`;
    if (remaining) remaining.textContent = `Balls ${this.state.remainingTargets}`;
    if (message) message.textContent = this.state.message;
  }
}
