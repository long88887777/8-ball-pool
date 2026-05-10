import Phaser from 'phaser';
import { AIController } from './ai/aiController';
import type { AIDecision } from './ai/types';
import { PoolAudio } from './audio';
import {
  BALLS,
  BALL_RADIUS,
  CUE,
  CUE_START,
  PLAY_AREA,
  POCKETS,
  RACK_CENTER,
  TABLE,
  type Vector,
} from './constants';
import {
  clampBreakCuePosition,
  clampShotPower,
  createTriangleRack,
  getCuePullback,
  isOnTableSurface,
  predictCollisionDirections,
  projectRayToPlayArea,
  rayCircleIntersection,
} from './geometry';
import { formatMessage, getCopy, getInitialLanguage, type Language } from './i18n';
import { ProfessionalPoolEngine } from './proPhysics/engine';
import {
  SPIN_PRESETS,
  contactOffsetMatchesPreset,
  normalizeCueContactOffset,
  type CueSpinPreset,
} from './proPhysics/spin';
import type { PhysicsBallSnapshot, PhysicsEvent } from './proPhysics/types';
import {
  createBallTexture,
  drawCueStick,
  drawPoolHall,
  drawRefinedTable,
} from './rendering';
import {
  clearEightBallBallInHand,
  createEightBallState,
  getPocketedDisplayBallIds,
  getPlayerTargetDisplayBallIds,
  getRemainingEightBallCount,
  recordEightBallCushion,
  recordEightBallFirstContact,
  recordEightBallPocket,
  recordEightBallTimeoutFoul,
  resolveEightBallShot,
  startEightBallShot,
  type EightBallState,
} from './eightBallRules';
import { createGameState, recordStroke, restartGame, type GameState } from './state';

type BallKind = 'cue' | 'target';

type PoolBall = Phaser.GameObjects.Image & {
  ballKind: BallKind;
  ballId: number;
  pocketed?: boolean;
};

type AimState = {
  pointerId: number;
  current: Vector;
};

type CuePlacementState = {
  pointerId: number;
  kind: 'break' | 'ball-in-hand';
};

const DEPTH = {
  room: 0,
  table: 1,
  ball: 4,
  aim: 5,
};

const SHOT_CLOCK_SECONDS = 20;

export class PoolScene extends Phaser.Scene {
  private cueBall!: PoolBall;
  private targetBalls: PoolBall[] = [];
  private aimLine!: Phaser.GameObjects.Graphics;
  private cueGraphics!: Phaser.GameObjects.Graphics;
  private forbiddenIcon!: Phaser.GameObjects.Graphics;
  private handSprite!: Phaser.GameObjects.Image;
  private cuePlacementValid = true;
  private state: GameState = createGameState(BALLS.length);
  private rules: EightBallState = createEightBallState();
  private aimState: AimState | null = null;
  private cuePlacementState: CuePlacementState | null = null;
  private wasMoving = false;
  private strikeLocked = false;
  private shotClockRemaining = SHOT_CLOCK_SECONDS;
  private readonly audio = new PoolAudio();
  private readonly physicsEngine = new ProfessionalPoolEngine();
  private restartButton?: HTMLButtonElement;
  private languageButton?: HTMLButtonElement;
  private victoryOverlay?: HTMLElement;
  private victoryTitle?: HTMLElement;
  private victoryDetail?: HTMLElement;
  private victoryRestartButton?: HTMLButtonElement;
  private spinPadButton?: HTMLButtonElement;
  private spinMarker?: HTMLElement;
  private spinPresetButtons: HTMLButtonElement[] = [];
  private selectedSpin: Vector = SPIN_PRESETS.center;
  private spinPadPointerId: number | null = null;
  private ballPrevPositions = new Map<number, Vector>();
  private language: Language = getInitialLanguage(navigator.language);
  private restartHandler = (): void => {
    this.restartRack();
  };
  private victoryRestartHandler = (): void => {
    this.restartRack();
  };
  private languageHandler = (): void => {
    this.language = this.language === 'en' ? 'zh' : 'en';
    this.updateHud();
  };
  private gameMode: 'pvp' | 'ai' = 'ai';
  private aiController = new AIController();
  private aiThinking = false;
  private aiDecision: AIDecision | null = null;
  private modeToggleButton?: HTMLButtonElement;
  private modeToggleHandler = (): void => {
    this.toggleGameMode();
  };

  constructor() {
    super('PoolScene');
  }

  preload(): void {
    this.load.image('hand-raw', 'assets/hand-raw.png');
  }

  create(): void {
    this.createTextures();
    this.state = createGameState(BALLS.length, null);
    this.rules = createEightBallState();
    this.drawRoom();
    this.drawTable();
    this.createHandTexture();
    this.handSprite = this.add.image(0, 0, 'hand').setDepth(DEPTH.ball + 1).setVisible(false);
    this.createBalls();
    this.aimLine = this.add.graphics().setDepth(DEPTH.aim);
    this.cueGraphics = this.add.graphics().setDepth(DEPTH.aim + 1);
    this.forbiddenIcon = this.createForbiddenIcon();
    this.bindInput();
    this.bindRestart();
    this.bindLanguage();
    this.bindModeToggle();
    this.bindSpinControl();
    this.updateHud();

    this.bindVictoryOverlay();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.restartButton?.removeEventListener('click', this.restartHandler);
      this.languageButton?.removeEventListener('click', this.languageHandler);
      this.modeToggleButton?.removeEventListener('click', this.modeToggleHandler);
      this.victoryRestartButton?.removeEventListener('click', this.victoryRestartHandler);
      this.unbindSpinControl();
    });
  }

  update(): void {
    try {
      const step = this.physicsEngine.step(this.game.loop.delta / 1000);
      this.handlePhysicsEvents(step.events);
      this.syncBallsFromPhysics(step.balls);
      this.handleSettledTable(step.settled);
    } catch {
      const rescuedEvents = this.physicsEngine.drainEvents();
      if (rescuedEvents.length > 0) {
        this.handlePhysicsEvents(rescuedEvents);
      }
    }
    this.updateShotClock(this.game.loop.delta / 1000);
    this.updateForbiddenIcon();
    this.updateHandSprite();
    this.renderAim();
  }

  private createTextures(): void {
    createBallTexture(this, { key: 'cue-ball', fill: '#f8f0dd', cueSpot: true });
    BALLS.forEach((ball, index) => {
      createBallTexture(this, { key: `target-ball-${index}`, fill: ball.color, label: String(ball.id), stripe: ball.id >= 9 });
    });
  }

  private createHandTexture(): void {
    const rawTex = this.textures.get('hand-raw');
    const source = rawTex.getSourceImage() as HTMLImageElement;
    const canvas = this.textures.createCanvas('hand', source.width, source.height);
    const ctx = canvas?.getContext();
    if (!ctx) return;
    ctx.drawImage(source, 0, 0);
    const imageData = ctx.getImageData(0, 0, source.width, source.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (g > 70 && g > r * 1.15 && g > b * 1.15) {
        data[i + 3] = 0;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    canvas?.refresh();
  }

  private drawRoom(): void {
    drawPoolHall(this);
  }

  private drawTable(): void {
    drawRefinedTable(this);
  }


  private createForbiddenIcon(): Phaser.GameObjects.Graphics {
    const gfx = this.add.graphics().setDepth(DEPTH.aim + 3).setVisible(false);
    const r = BALL_RADIUS + 4;
    gfx.fillStyle(0xcc2222, 0.85);
    gfx.fillCircle(0, 0, r);
    gfx.lineStyle(3, 0xffffff, 0.9);
    gfx.beginPath();
    gfx.moveTo(-r * 0.55, -r * 0.55);
    gfx.lineTo(r * 0.55, r * 0.55);
    gfx.strokePath();
    gfx.lineStyle(3, 0xffffff, 0.9);
    gfx.beginPath();
    gfx.moveTo(r * 0.55, -r * 0.55);
    gfx.lineTo(-r * 0.55, r * 0.55);
    gfx.strokePath();
    return gfx;
  }

  private createBalls(): void {
    this.cueBall?.destroy();
    this.targetBalls.forEach((ball) => ball.destroy());
    this.targetBalls = [];

    this.cueBall = this.createBall(CUE_START, 'cue-ball', 'cue');
    const rackPositions = createTriangleRack(RACK_CENTER, BALLS.length);
    rackPositions.forEach((position, index) => {
      this.targetBalls.push(this.createBall(position, `target-ball-${index}`, 'target', index + 1));
    });

    this.physicsEngine.rack([
      { id: 0, kind: 'cue', position: CUE_START },
      ...rackPositions.map((position, index) => ({
        id: index + 1,
        kind: 'target' as const,
        position,
        label: index + 1,
      })),
    ]);
  }

  private createBall(position: Vector, texture: string, kind: BallKind, ballId = 0): PoolBall {
    const ball = this.add.image(position.x, position.y, texture) as PoolBall;

    ball.setDepth(DEPTH.ball);
    ball.ballKind = kind;
    ball.ballId = ballId;
    ball.pocketed = false;
    return ball;
  }

  private bindInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.audio.unlock();
      const point = { x: pointer.worldX, y: pointer.worldY };
      if (this.canPlaceBallInHandCueBall() && isOnTableSurface(point)) {
        this.cuePlacementState = { pointerId: pointer.id, kind: 'ball-in-hand' };
        this.aimState = null;
        this.aimLine.clear();
        this.cueGraphics.clear();

        this.placeBallInHandCueBall(point);
        this.updateHud();
        return;
      }

      if (this.canPlaceBreakCueBall() && this.isCuePlacementStart(point)) {
        this.cuePlacementState = { pointerId: pointer.id, kind: 'break' };
        this.aimState = null;
        this.aimLine.clear();
        this.cueGraphics.clear();

        this.placeCueBall(point);
        return;
      }

      if (!this.canAim()) {
        return;
      }

      if (!isOnTableSurface(point)) {
        return;
      }

      this.aimState = {
        pointerId: pointer.id,
        current: point,
      };
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.cuePlacementState && pointer.id === this.cuePlacementState.pointerId) {
        const point = { x: pointer.worldX, y: pointer.worldY };
        if (this.cuePlacementState.kind === 'break') {
          this.placeCueBall(point);
        } else {
          this.placeBallInHandCueBall(point);
        }
        return;
      }

      if (!this.aimState || pointer.id !== this.aimState.pointerId) {
        return;
      }

      const raw = { x: pointer.worldX, y: pointer.worldY };
      const prev = this.aimState.current;
      const smoothing = 0.35;
      this.aimState.current = {
        x: prev.x + (raw.x - prev.x) * smoothing,
        y: prev.y + (raw.y - prev.y) * smoothing,
      };
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.cuePlacementState && pointer.id === this.cuePlacementState.pointerId) {
        const point = { x: pointer.worldX, y: pointer.worldY };
        if (this.cuePlacementState.kind === 'break') {
          this.placeCueBall(point);
          this.cuePlacementState = null;
        } else {
          this.placeBallInHandCueBall(point);
          if (this.cuePlacementValid) {
            this.rules = clearEightBallBallInHand(this.rules);
            this.updateHud();
            this.cuePlacementState = null;
            this.forbiddenIcon.setVisible(false);
          }
        }
        return;
      }

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

  private bindLanguage(): void {
    this.languageButton = document.querySelector<HTMLButtonElement>('#language') ?? undefined;
    this.languageButton?.addEventListener('click', this.languageHandler);
  }

  private bindModeToggle(): void {
    this.modeToggleButton = document.querySelector<HTMLButtonElement>('#mode-toggle') ?? undefined;
    this.modeToggleButton?.addEventListener('click', this.modeToggleHandler);
  }

  private toggleGameMode(): void {
    this.gameMode = this.gameMode === 'ai' ? 'pvp' : 'ai';
    this.restartRack();
  }

  private bindVictoryOverlay(): void {
    this.victoryOverlay = document.querySelector<HTMLElement>('#victory-overlay') ?? undefined;
    this.victoryTitle = document.querySelector<HTMLElement>('#victory-title') ?? undefined;
    this.victoryDetail = document.querySelector<HTMLElement>('#victory-detail') ?? undefined;
    this.victoryRestartButton = document.querySelector<HTMLButtonElement>('#victory-restart') ?? undefined;
    this.victoryRestartButton?.addEventListener('click', this.victoryRestartHandler);
  }

  private showVictoryScreen(): void {
    if (!this.victoryOverlay || !this.victoryTitle || !this.victoryDetail) return;
    const copy = getCopy(this.language);
    const isZh = this.language === 'zh';
    const winner = this.rules.winner !== null ? this.rules.winner + 1 : 1;

    this.victoryOverlay.hidden = false;
    this.victoryTitle.textContent = isZh ? `玩家 ${winner} 获胜！` : `Player ${winner} Wins!`;
    this.victoryDetail.textContent = isZh
      ? `恭喜玩家 ${winner}，你赢得了这场比赛。`
      : `Congratulations Player ${winner}, you won the match.`;
  }

  private hideVictoryScreen(): void {
    if (this.victoryOverlay) this.victoryOverlay.hidden = true;
  }

  private bindSpinControl(): void {
    this.spinPadButton = document.querySelector<HTMLButtonElement>('#spin-pad') ?? undefined;
    this.spinMarker = document.querySelector<HTMLElement>('#spin-marker') ?? undefined;
    this.spinPresetButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-spin-preset]'));
    this.spinPadButton?.addEventListener('pointerdown', this.spinPadPointerDownHandler);
    this.spinPadButton?.addEventListener('pointermove', this.spinPadPointerMoveHandler);
    this.spinPadButton?.addEventListener('pointerup', this.spinPadPointerUpHandler);
    this.spinPadButton?.addEventListener('pointercancel', this.spinPadPointerUpHandler);
    this.spinPresetButtons.forEach((button) => {
      button.addEventListener('pointerdown', this.stopDomControlEvent);
      button.addEventListener('pointerup', this.stopDomControlEvent);
      button.addEventListener('click', this.spinPresetClickHandler);
    });
    this.updateSpinControl();
  }

  private unbindSpinControl(): void {
    this.spinPadButton?.removeEventListener('pointerdown', this.spinPadPointerDownHandler);
    this.spinPadButton?.removeEventListener('pointermove', this.spinPadPointerMoveHandler);
    this.spinPadButton?.removeEventListener('pointerup', this.spinPadPointerUpHandler);
    this.spinPadButton?.removeEventListener('pointercancel', this.spinPadPointerUpHandler);
    this.spinPresetButtons.forEach((button) => {
      button.removeEventListener('pointerdown', this.stopDomControlEvent);
      button.removeEventListener('pointerup', this.stopDomControlEvent);
      button.removeEventListener('click', this.spinPresetClickHandler);
    });
  }

  private readonly spinPadPointerDownHandler = (event: PointerEvent): void => {
    this.stopDomControlEvent(event);
    this.spinPadPointerId = event.pointerId;
    try {
      this.spinPadButton?.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers can reject capture if the pointer is no longer active.
    }
    this.setSpinFromPadEvent(event);
  };

  private readonly spinPadPointerMoveHandler = (event: PointerEvent): void => {
    this.stopDomControlEvent(event);
    if (this.spinPadPointerId !== event.pointerId) {
      return;
    }
    this.setSpinFromPadEvent(event);
  };

  private readonly spinPadPointerUpHandler = (event: PointerEvent): void => {
    this.stopDomControlEvent(event);
    if (this.spinPadPointerId !== event.pointerId) {
      return;
    }
    this.spinPadPointerId = null;
    try {
      this.spinPadButton?.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already be released by the browser.
    }
  };

  private readonly spinPresetClickHandler = (event: MouseEvent): void => {
    this.stopDomControlEvent(event);
    const preset = (event.currentTarget as HTMLButtonElement).dataset.spinPreset as CueSpinPreset | undefined;
    if (!preset || !(preset in SPIN_PRESETS)) {
      return;
    }
    this.setSelectedSpin(SPIN_PRESETS[preset]);
  };

  private readonly stopDomControlEvent = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  private canAim(): boolean {
    return (
      !this.strikeLocked &&
      !this.cuePlacementState &&
      !this.rules.cueBallInHand &&
      !this.rules.gameOver &&
      !this.aiThinking &&
      !this.isAITurn() &&
      this.physicsEngine.isSettled()
    );
  }

  private canPlaceBreakCueBall(): boolean {
    return (
      !this.strikeLocked &&
      this.state.strokes === 0 &&
      !this.rules.cueBallInHand &&
      !this.rules.gameOver &&
      !this.isAITurn() &&
      this.physicsEngine.isSettled()
    );
  }

  private canPlaceBallInHandCueBall(): boolean {
    return !this.strikeLocked && this.rules.cueBallInHand && !this.rules.gameOver && !this.isAITurn() && this.physicsEngine.isSettled();
  }

  private isCuePlacementStart(point: Vector): boolean {
    return Phaser.Math.Distance.Between(point.x, point.y, this.cueBall.x, this.cueBall.y) <= BALL_RADIUS * 1.8;
  }

  private placeCueBall(point: Vector): void {
    const next = clampBreakCuePosition(point);
    this.cueBall.setPosition(next.x, next.y);
    this.physicsEngine.resetCueBall(next);
  }

  private static readonly BALL_CUSHION_MARGIN = BALL_RADIUS;
  private static readonly POCKET_SAFE_DIST = TABLE.pocketRadius + BALL_RADIUS * 2 + 6;

  private placeBallInHandCueBall(point: Vector): void {
    const next = {
      x: Math.min(Math.max(point.x, PLAY_AREA.left + PoolScene.BALL_CUSHION_MARGIN), PLAY_AREA.right - PoolScene.BALL_CUSHION_MARGIN),
      y: Math.min(Math.max(point.y, PLAY_AREA.top + PoolScene.BALL_CUSHION_MARGIN), PLAY_AREA.bottom - PoolScene.BALL_CUSHION_MARGIN),
    };
    this.cueBall.setPosition(next.x, next.y);
    this.physicsEngine.resetCueBall(next);
    this.cuePlacementValid = this.isPlacementClear(next);
    this.updateForbiddenIcon();
  }

  private isPlacementClear(point: Vector): boolean {
    const ballMinDist = BALL_RADIUS * 2 + 4;
    const clearOfBalls = this.targetBalls.every((ball) => {
      if (ball.pocketed) return true;
      return Phaser.Math.Distance.Between(point.x, point.y, ball.x, ball.y) >= ballMinDist;
    });
    if (!clearOfBalls) return false;
    const clearOfPockets = POCKETS.every((pocket) => {
      return Phaser.Math.Distance.Between(point.x, point.y, pocket.x, pocket.y) >= PoolScene.POCKET_SAFE_DIST;
    });
    return clearOfPockets;
  }

  private updateForbiddenIcon(): void {
    if (!this.forbiddenIcon) return;
    const isPlacing = this.cuePlacementState?.kind === 'ball-in-hand';
    const show = isPlacing && !this.cuePlacementValid;
    this.forbiddenIcon.setVisible(show);
    if (show) {
      this.forbiddenIcon.setPosition(this.cueBall.x, this.cueBall.y);
    }
  }

  private updateHandSprite(): void {
    if (!this.handSprite) return;
    const show = !this.aimState && (this.canPlaceBreakCueBall() || this.canPlaceBallInHandCueBall());
    this.handSprite.setVisible(show);
    if (show) {
      const targetH = BALL_RADIUS * 2.6;
      const scale = targetH / this.handSprite.height;
      this.handSprite.setScale(scale);
      this.handSprite.setPosition(
        this.cueBall.x - BALL_RADIUS * 1.15,
        this.cueBall.y + BALL_RADIUS * 0.95,
      );
    }
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

    const cueAngle = Math.atan2(-pull.y / dragDistance, -pull.x / dragDistance);
    this.strikeLocked = true;
    this.tweens.addCounter({
      from: getCuePullback(power),
      to: 12,
      duration: CUE.strikeDurationMs,
      ease: 'Cubic.easeIn',
      onUpdate: (tween) => {
        drawCueStick(this.cueGraphics, cue.x, cue.y, cueAngle, tween.getValue() ?? 12);
      },
      onComplete: () => {
        this.cueGraphics.clear();
        this.applyCueImpulse(pull, dragDistance, power);
        this.strikeLocked = false;
      },
    });
    this.state = recordStroke(this.state);
    this.rules = startEightBallShot(this.rules);
    this.shotClockRemaining = SHOT_CLOCK_SECONDS;
    this.updateHud();
  }

  private applyCueImpulse(pull: Vector, dragDistance: number, power: number): void {
    this.physicsEngine.strikeCueBall({
      direction: { x: -pull.x / dragDistance, y: -pull.y / dragDistance },
      power,
      contactOffset: this.selectedSpin,
    });
    this.wasMoving = true;
    this.audio.play('cue');
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
    const cueAngle = Math.atan2(direction.y, direction.x);
    const cueBack = getCuePullback(power);

    const nearestHit = this.raycastNearestTargetBall(cue, direction);
    if (nearestHit) {
      const prediction = predictCollisionDirections(cue, direction, nearestHit.ballPos);
      if (prediction) {
        this.drawPredictedCollisionRoutes(cue, prediction, power);
      }
    } else {
      const missEnd = projectRayToPlayArea(cue, direction);
      this.aimLine.lineStyle(3, 0xf6e7b4, 0.42);
      this.aimLine.beginPath();
      this.aimLine.moveTo(cue.x + direction.x * BALL_RADIUS, cue.y + direction.y * BALL_RADIUS);
      this.aimLine.lineTo(missEnd.x, missEnd.y);
      this.aimLine.strokePath();
    }

    this.aimLine.fillStyle(0xd9a441, 0.95);
    this.aimLine.fillRoundedRect(PLAY_AREA.left, PLAY_AREA.bottom + 24, power * 220, 10, 5);
    this.drawSpinAimFeedback(cue);
    drawCueStick(this.cueGraphics, cue.x, cue.y, cueAngle, cueBack);
  }

  private drawPredictedCollisionRoutes(
    cue: Vector,
    prediction: {
      targetBallDir: Vector;
      cueBallDeflectDir: Vector | null;
      hitPoint: Vector;
      cueBallImpactCenter: Vector;
      targetBallCenter: Vector;
    },
    power: number,
  ): void {
    const impactDistance = Math.hypot(prediction.cueBallImpactCenter.x - cue.x, prediction.cueBallImpactCenter.y - cue.y);
    const inboundStart =
      impactDistance < 0.001
        ? cue
        : {
            x: cue.x + ((prediction.cueBallImpactCenter.x - cue.x) / impactDistance) * BALL_RADIUS,
            y: cue.y + ((prediction.cueBallImpactCenter.y - cue.y) / impactDistance) * BALL_RADIUS,
          };
    const targetEnd = this.scaleRouteEnd(
      prediction.targetBallCenter,
      projectRayToPlayArea(prediction.targetBallCenter, prediction.targetBallDir),
      0.52 + power * 0.36,
    );
    const cueDeflectEnd = prediction.cueBallDeflectDir
      ? this.scaleRouteEnd(
          prediction.cueBallImpactCenter,
          projectRayToPlayArea(prediction.cueBallImpactCenter, prediction.cueBallDeflectDir),
          0.32 + power * 0.3,
        )
      : null;

    this.aimLine.lineStyle(5, 0x10100e, 0.45);
    this.strokeLine(inboundStart, prediction.cueBallImpactCenter);
    this.strokeLine(prediction.targetBallCenter, targetEnd);
    if (cueDeflectEnd) this.strokeLine(prediction.cueBallImpactCenter, cueDeflectEnd);

    this.aimLine.lineStyle(3, 0xf6e7b4, 0.92);
    this.strokeLine(inboundStart, prediction.cueBallImpactCenter);

    this.aimLine.lineStyle(3, 0xffffff, 0.88);
    this.strokeLine(prediction.targetBallCenter, targetEnd);

    if (cueDeflectEnd) {
      this.aimLine.lineStyle(3, 0xffffff, 0.82);
      this.strokeLine(prediction.cueBallImpactCenter, cueDeflectEnd);
    }

    this.aimLine.lineStyle(2, 0x10100e, 0.58);
    this.aimLine.strokeCircle(prediction.cueBallImpactCenter.x, prediction.cueBallImpactCenter.y, BALL_RADIUS + 1);
    this.aimLine.lineStyle(2, 0xffffff, 0.9);
    this.aimLine.strokeCircle(prediction.cueBallImpactCenter.x, prediction.cueBallImpactCenter.y, BALL_RADIUS);

    this.aimLine.fillStyle(0xffffff, 0.9);
    this.aimLine.fillCircle(prediction.hitPoint.x, prediction.hitPoint.y, 4);
  }

  private strokeLine(start: Vector, end: Vector): void {
    this.aimLine.beginPath();
    this.aimLine.moveTo(start.x, start.y);
    this.aimLine.lineTo(end.x, end.y);
    this.aimLine.strokePath();
  }

  private scaleRouteEnd(start: Vector, edgeEnd: Vector, ratio: number): Vector {
    return {
      x: start.x + (edgeEnd.x - start.x) * ratio,
      y: start.y + (edgeEnd.y - start.y) * ratio,
    };
  }

  private raycastNearestTargetBall(
    origin: Vector,
    direction: Vector,
  ): { ballPos: Vector } | null {
    let nearest: { ballPos: Vector; distance: number } | null = null;

    for (const target of this.targetBalls) {
      if (target.pocketed) continue;
      const center = { x: target.x, y: target.y };
      const hit = rayCircleIntersection(origin, direction, center, BALL_RADIUS * 2);
      if (hit && (!nearest || hit.distance < nearest.distance)) {
        nearest = { ballPos: center, distance: hit.distance };
      }
    }

    return nearest;
  }

  private drawSpinAimFeedback(cue: Vector): void {
    if (contactOffsetMatchesPreset(this.selectedSpin, 'center')) {
      return;
    }

    this.aimLine.lineStyle(2, 0x2a2118, 0.5);
    this.aimLine.strokeCircle(cue.x, cue.y, BALL_RADIUS + 5);
    this.aimLine.fillStyle(0xd64b3c, 0.96);
    this.aimLine.fillCircle(cue.x + this.selectedSpin.x * 10, cue.y - this.selectedSpin.y * 10, 4.5);
  }

  private handlePhysicsEvents(events: PhysicsEvent[]): void {
    for (const event of events) {
      if (event.type === 'collision') {
        this.recordFirstCueContact(event.ballId, event.otherBallId);
        this.audio.play('collision');
        continue;
      }
      if (event.type === 'cushion') {
        this.rules = recordEightBallCushion(this.rules);
        this.audio.play('rail');
        continue;
      }
      if (event.type !== 'pocket') {
        continue;
      }
      this.rules = recordEightBallPocket(this.rules, event.ballId);
      this.audio.play('pocket');
      this.updateHud();
    }
  }

  private recordFirstCueContact(ballId: number, otherBallId?: number): void {
    if (otherBallId === undefined) {
      return;
    }

    if (ballId === 0 && otherBallId !== 0) {
      this.rules = recordEightBallFirstContact(this.rules, otherBallId);
    } else if (otherBallId === 0 && ballId !== 0) {
      this.rules = recordEightBallFirstContact(this.rules, ballId);
    }
  }

  private syncBallsFromPhysics(snapshots: PhysicsBallSnapshot[]): void {
    for (const snapshot of snapshots) {
      const ball = this.allBalls().find((candidate) => candidate.ballId === snapshot.id);
      if (!ball) {
        continue;
      }

      const prev = this.ballPrevPositions.get(snapshot.id);
      if (prev && !snapshot.pocketed) {
        const dx = snapshot.position.x - prev.x;
        const dy = snapshot.position.y - prev.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.05) {
          ball.rotation += dist / BALL_RADIUS;
        }
      }

      ball.setPosition(snapshot.position.x, snapshot.position.y);
      ball.pocketed = snapshot.pocketed;
      ball.setVisible(!snapshot.pocketed);

      if (!snapshot.pocketed) {
        this.ballPrevPositions.set(snapshot.id, {
          x: snapshot.position.x,
          y: snapshot.position.y,
        });
      } else {
        this.ballPrevPositions.delete(snapshot.id);
      }
    }
  }

  private handleSettledTable(settled: boolean): void {
    if (!settled) {
      this.wasMoving = true;
      return;
    }

    if (!this.wasMoving) {
      return;
    }

    this.wasMoving = false;

    if (this.rules.shot.pocketedBallIds.includes(0)) {
      this.physicsEngine.resetCueBall(CUE_START);
      this.syncBallsFromPhysics(this.physicsEngine.getBalls());
    }
    const playerBeforeResolve = this.rules.currentPlayer;
    this.rules = resolveEightBallShot(this.rules);

    if (this.rules.gameOver && this.rules.messageKey === 'eightBallLoss') {
      this.shotClockRemaining = 0;
    }

    if (!this.rules.gameOver && this.rules.currentPlayer !== playerBeforeResolve) {
      this.shotClockRemaining = SHOT_CLOCK_SECONDS;
    } else if (!this.rules.gameOver && !this.rules.cueBallInHand) {
      this.shotClockRemaining = SHOT_CLOCK_SECONDS;
    }
    this.updateHud();

    if (!this.rules.gameOver && this.isAITurn() && !this.aiThinking) {
      this.scheduleAITurn();
    }
  }

  private updateShotClock(deltaSeconds: number): void {
    if (!this.shouldRunShotClock()) {
      this.updateShotClockHud();
      return;
    }

    this.shotClockRemaining = Math.max(0, this.shotClockRemaining - deltaSeconds);
    if (this.shotClockRemaining === 0) {
      this.aimState = null;
      this.cuePlacementState = null;
      this.aimLine.clear();
      this.cueGraphics.clear();
      this.rules = recordEightBallTimeoutFoul(this.rules);
      this.shotClockRemaining = SHOT_CLOCK_SECONDS;
      this.updateHud();
      return;
    }

    this.updateShotClockHud();
  }

  private shouldRunShotClock(): boolean {
    return (
      !this.rules.gameOver &&
      !this.strikeLocked &&
      !this.isAITurn() &&
      this.physicsEngine.isSettled()
    );
  }

  private isAITurn(): boolean {
    return this.gameMode === 'ai' && this.rules.currentPlayer === 1;
  }

  private scheduleAITurn(): void {
    if (this.aiThinking || this.rules.gameOver) return;
    this.aiThinking = true;
    this.updateHud();
    setTimeout(() => {
      this.executeAITurn();
    }, 500);
  }

  private executeAITurn(): void {
    const ballPositions = this.getTableBallPositions();
    const decision = this.aiController.computeDecision(ballPositions, this.rules);

    if (!decision) {
      this.aiThinking = false;
      this.updateHud();
      return;
    }

    this.aiDecision = decision;

    if (decision.placementPosition) {
      this.physicsEngine.resetCueBall(decision.placementPosition);
      this.syncBallsFromPhysics(this.physicsEngine.getBalls());
      this.rules = clearEightBallBallInHand(this.rules);
    }

    this.showAIAimLine(decision);
    this.updateHud();
    setTimeout(() => this.executeAIShot(decision), 800);
  }

  private executeAIShot(decision: AIDecision): void {
    this.aimLine.clear();
    const shot = decision.shot;
    const cue = this.cuePosition();
    const cueAngle = Math.atan2(shot.direction.y, shot.direction.x);

    this.strikeLocked = true;
    this.tweens.addCounter({
      from: getCuePullback(shot.power),
      to: 12,
      duration: CUE.strikeDurationMs,
      ease: 'Cubic.easeIn',
      onUpdate: (tween) => {
        drawCueStick(this.cueGraphics, cue.x, cue.y, cueAngle, tween.getValue() ?? 12);
      },
      onComplete: () => {
        this.cueGraphics.clear();
        this.physicsEngine.strikeCueBall({
          direction: shot.direction,
          power: shot.power,
          contactOffset: shot.spin,
        });
        this.wasMoving = true;
        this.audio.play('cue');
        this.strikeLocked = false;
        this.aiThinking = false;
        this.aiDecision = null;
      },
    });

    this.state = recordStroke(this.state);
    this.rules = startEightBallShot(this.rules);
    this.shotClockRemaining = SHOT_CLOCK_SECONDS;
    this.updateHud();
  }

  private showAIAimLine(decision: AIDecision): void {
    const cue = this.cuePosition();
    const shot = decision.shot;

    const nearestHit = this.raycastNearestTargetBall(cue, shot.direction);
    if (nearestHit) {
      const prediction = predictCollisionDirections(cue, shot.direction, nearestHit.ballPos);
      if (prediction) {
        this.drawPredictedCollisionRoutes(cue, prediction, shot.power);
      }
    } else {
      const missEnd = projectRayToPlayArea(cue, shot.direction);
      this.aimLine.lineStyle(3, 0xf6e7b4, 0.42);
      this.aimLine.beginPath();
      this.aimLine.moveTo(cue.x + shot.direction.x * BALL_RADIUS, cue.y + shot.direction.y * BALL_RADIUS);
      this.aimLine.lineTo(missEnd.x, missEnd.y);
      this.aimLine.strokePath();
    }

    const cueAngle = Math.atan2(shot.direction.y, shot.direction.x);
    drawCueStick(this.cueGraphics, cue.x, cue.y, cueAngle, getCuePullback(shot.power));
  }

  private getTableBallPositions(): Map<number, Vector> {
    const positions = new Map<number, Vector>();
    positions.set(0, { x: this.cueBall.x, y: this.cueBall.y });
    for (const ball of this.targetBalls) {
      if (!ball.pocketed) {
        positions.set(ball.ballId, { x: ball.x, y: ball.y });
      }
    }
    return positions;
  }

  private allBalls(): PoolBall[] {
    return [this.cueBall, ...this.targetBalls];
  }

  private restartRack(): void {
    this.aiThinking = false;
    this.aiDecision = null;
    this.aimState = null;
    this.cuePlacementState = null;
    this.aimLine?.clear();
    this.cueGraphics?.clear();
    this.strikeLocked = false;
    this.setSelectedSpin(SPIN_PRESETS.center);
    this.forbiddenIcon?.setVisible(false);
    this.handSprite?.setVisible(false);
    this.cuePlacementValid = true;
    this.ballPrevPositions.clear();
    this.createBalls();
    this.state = restartGame(BALLS.length, null);
    this.rules = createEightBallState();
    this.shotClockRemaining = SHOT_CLOCK_SECONDS;
    this.wasMoving = false;
    this.hideVictoryScreen();
    this.updateHud();
  }

  private updateHud(): void {
    const copy = getCopy(this.language);
    const rawMessageValues =
      this.rules.messageKey === 'eightBallReady' && !this.rules.messageValues
        ? { player: this.rules.currentPlayer + 1 }
        : (this.rules.messageValues ?? {});
    const messageValues = {
      ...rawMessageValues,
      group:
        rawMessageValues.group === 'solids' || rawMessageValues.group === 'stripes'
          ? copy.hud.playerGroup(rawMessageValues.group)
          : rawMessageValues.group,
      reason:
        rawMessageValues.reason === 'cueBallPocketed' ||
        rawMessageValues.reason === 'noFirstContact' ||
        rawMessageValues.reason === 'wrongFirstContact' ||
        rawMessageValues.reason === 'shotClockExpired'
          ? copy.foulReason[rawMessageValues.reason]
          : rawMessageValues.reason,
    };
    const messageText = formatMessage(copy.message[this.rules.messageKey], messageValues);
    const currentPlayer = this.rules.players[this.rules.currentPlayer];
    const opponentPlayer = this.rules.players[this.rules.currentPlayer === 0 ? 1 : 0];
    const remainingObjectBalls = getRemainingEightBallCount(this.rules);
    document.documentElement.lang = this.language === 'zh' ? 'zh-CN' : 'en';
    document.title = copy.documentTitle;

    const eyebrow = document.querySelector('#eyebrow');
    const title = document.querySelector('#title');
    const playerLabel = document.querySelector('#player-label');
    const opponentLabel = document.querySelector('#opponent-label');
    const playerOneName = document.querySelector('#player-one-name');
    const playerTwoName = document.querySelector('#player-two-name');
    const playerOneTurn = document.querySelector('#player-one-turn');
    const playerTwoTurn = document.querySelector('#player-two-turn');
    const playerOneGroup = document.querySelector('#player-one-group');
    const playerTwoGroup = document.querySelector('#player-two-group');
    const playerOneTargetLabel = document.querySelector('#player-one-target-label');
    const playerTwoTargetLabel = document.querySelector('#player-two-target-label');
    const pocketedBallLabel = document.querySelector('#pocketed-ball-label');
    const languageLabel = document.querySelector('#language-label');
    const mode = document.querySelector('#mode');
    const groupStatus = document.querySelector('#group-status');
    const strokes = document.querySelector('#strokes');
    const best = document.querySelector('#best');
    const remaining = document.querySelector('#remaining');
    const aimLabel = document.querySelector('#aim-label');
    const aimState = document.querySelector('#aim-state');
    const spinLabel = document.querySelector('#spin-label');
    const message = document.querySelector('#message');

    if (eyebrow) eyebrow.textContent = copy.eyebrow;
    if (title) title.textContent = copy.title;
    if (playerLabel) playerLabel.textContent = copy.hud.currentPlayer(this.rules.currentPlayer + 1);
    if (opponentLabel) opponentLabel.textContent = copy.hud.currentPlayer(this.rules.currentPlayer === 0 ? 2 : 1);
    if (playerOneName) playerOneName.textContent = copy.hud.playerName(1);
    if (playerTwoName) playerTwoName.textContent = copy.hud.playerName(2);
    if (playerOneTurn) playerOneTurn.textContent = this.rules.currentPlayer === 0 ? copy.hud.activeTurn : copy.hud.waitingTurn;
    if (playerTwoTurn) playerTwoTurn.textContent = this.rules.currentPlayer === 1 ? copy.hud.activeTurn : copy.hud.waitingTurn;
    if (playerOneGroup) playerOneGroup.textContent = copy.hud.playerGroup(this.rules.players[0].group);
    if (playerTwoGroup) playerTwoGroup.textContent = copy.hud.playerGroup(this.rules.players[1].group);
    if (playerOneTargetLabel) playerOneTargetLabel.textContent = copy.hud.targetBalls;
    if (playerTwoTargetLabel) playerTwoTargetLabel.textContent = copy.hud.targetBalls;
    if (pocketedBallLabel) pocketedBallLabel.textContent = copy.hud.pocketedBalls;
    if (languageLabel) languageLabel.textContent = copy.languageLabel;
    if (this.languageButton) this.languageButton.textContent = copy.languageToggle;
    if (this.restartButton) this.restartButton.textContent = copy.hud.restart;
    if (mode) mode.textContent = copy.hud.eightBallMode;
    if (groupStatus) groupStatus.textContent = copy.hud.playerGroup(currentPlayer.group);
    if (strokes) strokes.textContent = copy.hud.strokes(this.state.strokes);
    if (best) best.textContent = copy.hud.playerGroup(opponentPlayer.group);
    if (remaining) remaining.textContent = copy.hud.remaining(remainingObjectBalls);
    if (aimLabel) aimLabel.textContent = copy.aimLabel;
    if (aimState) aimState.textContent = copy.aimOn;
    if (spinLabel) spinLabel.textContent = copy.spin.label;
    if (message) message.textContent = messageText;

    if (this.gameMode === 'ai') {
      if (playerTwoName) playerTwoName.textContent = copy.ai.playerName;
      if (mode) mode.textContent = copy.hud.modeAi;
    }
    if (this.modeToggleButton) {
      this.modeToggleButton.textContent = this.gameMode === 'ai' ? copy.hud.modePvp : copy.hud.modeAi;
    }
    if (this.aiThinking && message) {
      message.textContent = this.aiDecision ? copy.ai.aiming : copy.ai.thinking;
    }

    this.updateSpinControl();
    this.renderDomBallList('#pocketed-ball-strip', getPocketedDisplayBallIds(this.rules), copy.hud.noPocketedBalls);
    this.renderDomBallList('#player-one-targets', getPlayerTargetDisplayBallIds(this.rules, 0), copy.hud.openTargets);
    this.renderDomBallList('#player-two-targets', getPlayerTargetDisplayBallIds(this.rules, 1), copy.hud.openTargets);
    this.updateShotClockHud();
    if (this.rules.gameOver) {
      this.showVictoryScreen();
    }
  }

  private updateShotClockHud(): void {
    const progress = Math.max(0, Math.min(this.shotClockRemaining / SHOT_CLOCK_SECONDS, 1));
    const shotClock = document.querySelector('#shot-clock');
    const playerOneCard = document.querySelector<HTMLElement>('#player-one-card');
    const playerTwoCard = document.querySelector<HTMLElement>('#player-two-card');

    if (shotClock) shotClock.textContent = String(Math.ceil(this.shotClockRemaining));
    this.updatePlayerClockCard(playerOneCard, this.rules.currentPlayer === 0 && !this.rules.gameOver, progress);
    this.updatePlayerClockCard(playerTwoCard, this.rules.currentPlayer === 1 && !this.rules.gameOver, progress);
  }

  private updatePlayerClockCard(card: HTMLElement | null, active: boolean, progress: number): void {
    if (!card) {
      return;
    }

    card.classList.toggle('is-active-turn', active);
    card.style.setProperty('--turn-progress', active ? `${progress * 100}%` : '0%');
  }

  private setSpinFromPadEvent(event: PointerEvent): void {
    const rect = this.spinPadButton?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const radius = Math.min(rect.width, rect.height) / 2;
    const offset = normalizeCueContactOffset({
      x: (event.clientX - (rect.left + rect.width / 2)) / radius,
      y: ((rect.top + rect.height / 2) - event.clientY) / radius,
    });
    this.setSelectedSpin(offset);
  }

  private setSelectedSpin(offset: Vector): void {
    this.selectedSpin = normalizeCueContactOffset(offset);
    this.updateSpinControl();
  }

  private updateSpinControl(): void {
    const copy = getCopy(this.language);
    const presetName = this.selectedSpinPreset();
    const spinState = document.querySelector('#spin-state');
    const spinPadLabel = copy.spin.selected(this.spinDisplayName(presetName));

    if (spinState) spinState.textContent = spinPadLabel;
    if (this.spinPadButton) {
      this.spinPadButton.setAttribute('aria-label', `${copy.spin.label}: ${spinPadLabel}`);
      this.spinPadButton.style.setProperty('--spin-x', String(this.selectedSpin.x));
      this.spinPadButton.style.setProperty('--spin-y', String(this.selectedSpin.y));
    }
    if (this.spinMarker) {
      this.spinMarker.style.setProperty('--spin-x', String(this.selectedSpin.x));
      this.spinMarker.style.setProperty('--spin-y', String(this.selectedSpin.y));
    }
    this.spinPresetButtons.forEach((button) => {
      const preset = button.dataset.spinPreset as CueSpinPreset | undefined;
      const selected = preset ? presetName === preset : false;
      button.textContent = preset ? this.spinDisplayName(preset) : '';
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  private selectedSpinPreset(): CueSpinPreset | null {
    const presets = Object.keys(SPIN_PRESETS) as CueSpinPreset[];
    return presets.find((preset) => contactOffsetMatchesPreset(this.selectedSpin, preset)) ?? null;
  }

  private spinDisplayName(preset: CueSpinPreset | null): string {
    const copy = getCopy(this.language);
    if (preset) {
      return copy.spin[preset];
    }

    const horizontal = this.selectedSpin.x < -0.15 ? copy.spin.left : this.selectedSpin.x > 0.15 ? copy.spin.right : '';
    const vertical = this.selectedSpin.y > 0.15 ? copy.spin.high : this.selectedSpin.y < -0.15 ? copy.spin.low : '';

    return [vertical, horizontal].filter(Boolean).join(' / ') || copy.spin.center;
  }

  private renderDomBallList(selector: string, ballIds: number[], emptyText: string): void {
    const list = document.querySelector(selector);
    if (!list) {
      return;
    }

    list.replaceChildren(
      ...(ballIds.length === 0
        ? [this.createEmptyBallListNode(emptyText)]
        : ballIds.map((ballId) => this.createBallBadgeNode(ballId))),
    );
  }

  private createBallBadgeNode(ballId: number): HTMLSpanElement {
    const badge = document.createElement('span');
    badge.className = `ball-badge ball-badge-${ballId}`;
    badge.textContent = String(ballId);
    return badge;
  }

  private createEmptyBallListNode(text: string): HTMLSpanElement {
    const empty = document.createElement('span');
    empty.className = 'ball-list-empty';
    empty.textContent = text;
    return empty;
  }
}
