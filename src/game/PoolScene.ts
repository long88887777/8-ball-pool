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
    this.createBallTexture('cue-ball', '#f8f0dd', '#ffffff');
    BALL_COLORS.forEach((color, index) => {
      this.createBallTexture(`target-ball-${index}`, color, '#fff2c8');
    });
  }

  private createBallTexture(key: string, fill: string, shine: string): void {
    const size = BALL_RADIUS * 2 + 8;
    const graphics = this.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x000000, 0.22);
    graphics.fillCircle(size / 2 + 2, size / 2 + 3, BALL_RADIUS);
    graphics.fillStyle(Phaser.Display.Color.HexStringToColor(fill).color, 1);
    graphics.fillCircle(size / 2, size / 2, BALL_RADIUS);
    graphics.fillStyle(Phaser.Display.Color.HexStringToColor(shine).color, 0.55);
    graphics.fillCircle(size / 2 - 5, size / 2 - 6, BALL_RADIUS * 0.34);
    graphics.lineStyle(1, 0xffffff, 0.16);
    graphics.strokeCircle(size / 2, size / 2, BALL_RADIUS - 1);
    graphics.generateTexture(key, size, size);
    graphics.destroy();
  }

  private drawRoom(): void {
    const room = this.add.graphics().setDepth(DEPTH.room);
    room.fillGradientStyle(0x241914, 0x241914, 0x0e0b09, 0x0e0b09, 1);
    room.fillRect(0, 0, TABLE.width, TABLE.height);
    room.fillStyle(0xf3bd71, 0.13);
    room.fillEllipse(TABLE.width / 2, 44, 520, 150);
  }

  private drawTable(): void {
    const table = this.add.graphics().setDepth(DEPTH.table);
    table.fillStyle(0x25150d, 1);
    table.fillRoundedRect(44, 44, TABLE.width - 88, TABLE.height - 88, 34);
    table.lineStyle(8, 0x0d0805, 0.9);
    table.strokeRoundedRect(44, 44, TABLE.width - 88, TABLE.height - 88, 34);

    table.fillStyle(0x5b321b, 1);
    table.fillRoundedRect(56, 56, TABLE.width - 112, TABLE.height - 112, 26);
    table.lineStyle(3, 0xa66b35, 0.42);
    table.strokeRoundedRect(62, 62, TABLE.width - 124, TABLE.height - 124, 22);

    table.fillStyle(0x0b5c3e, 1);
    table.fillRoundedRect(
      PLAY_AREA.left,
      PLAY_AREA.top,
      PLAY_AREA.right - PLAY_AREA.left,
      PLAY_AREA.bottom - PLAY_AREA.top,
      18,
    );

    const cloth = this.add.graphics().setDepth(DEPTH.table + 0.1);
    cloth.fillStyle(0xffffff, 0.025);
    for (let y = PLAY_AREA.top + 20; y < PLAY_AREA.bottom; y += 18) {
      cloth.fillRect(PLAY_AREA.left + 8, y, PLAY_AREA.right - PLAY_AREA.left - 16, 1);
    }

    const pockets = this.add.graphics().setDepth(DEPTH.pocket);
    for (const pocket of POCKETS) {
      pockets.fillStyle(0x050403, 1);
      pockets.fillCircle(pocket.x, pocket.y, TABLE.pocketRadius);
      pockets.lineStyle(3, 0x160d08, 1);
      pockets.strokeCircle(pocket.x, pocket.y, TABLE.pocketRadius - 1);
    }
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
