import Phaser from 'phaser';
import { AIController } from './ai/aiController';
import type { AIDecision } from './ai/types';
import { PoolAudio } from './audio';
import { CHALLENGE_LEVELS, type ChallengeLevel } from './challenge/levels';
import {
  createChallengeState,
  recordChallengeShot,
  recordChallengePocket,
  recordChallengeOrderedPocket,
  recordChallengeCuePocket,
  recordChallengeCollision,
  recordChallengePocketWithRequired,
  checkKickChain,
  resetChallengeShot,
  revertCuePocketShot,
  resolveChallengeResult,
  type ChallengeState,
} from './challenge/challengeState';
import {
  readProgress,
  writeProgress,
  readProgressSupabase,
  writeProgressSupabase,
  isLevelUnlocked,
  type ChallengeProgress,
} from './challenge/progress';
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
  drawPocketNetDeformation,
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
import { GameChannel } from '../online/realtimeChannel';
import {
  createOnlineState,
  transitionToMyTurn,
  transitionToOpponentTurn,
  transitionToWatchingMyShot,
  transitionToWatchingOpponentShot,
  transitionToGameOver,
  tickTurnTimer,
  recordHeartbeat,
  checkDisconnect,
  type OnlineState,
} from '../online/onlineState';
import type { RoomInfo, OnlineMessage, ShotMessage, ResultMessage, TurnEndMessage, ChatMessage } from '../online/types';
import { supabase } from '../lib/supabase';

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
    if (this.gameMode === 'online') {
      this.surrenderOnlineMatch();
      return;
    }
    this.restartRack();
  };
  private victoryRestartHandler = (): void => {
    this.restartRack();
  };
  private rematchRequestHandler = (): void => {
    this.sendRematchRequest();
  };
  private rematchLeaveHandler = (): void => {
    this.leaveOnlineMatch();
  };
  private rematchCancelHandler = (): void => {
    this.cancelRematchRequest();
  };
  private rematchAcceptHandler = (): void => {
    this.respondToRematch(true);
  };
  private rematchDeclineHandler = (): void => {
    this.respondToRematch(false);
  };
  private languageHandler = (): void => {
    this.language = this.language === 'en' ? 'zh' : 'en';
    this.updateHud();
  };
  private gameMode: 'pvp' | 'ai' | 'challenge' | 'online' = 'ai';
  private aiController = new AIController();
  private aiThinking = false;
  private aiDecision: AIDecision | null = null;
  private challengeState: ChallengeState | null = null;
  private currentLevel: ChallengeLevel | null = null;
  private cachedProgress: ChallengeProgress | null = null;
  private challengeBtn?: HTMLButtonElement;
  private challengeSelectOverlay?: HTMLElement;
  private challengeResultOverlay?: HTMLElement;
  private challengeHud?: HTMLElement;
  private challengeBtnHandler = (): void => { this.showChallengeSelect(); };
  private ballPocketMap = new Map<number, number>();
  private pocketAnimatingBalls = new Set<number>();
  private netDeformGraphics!: Phaser.GameObjects.Graphics;
  private onlineChannel: GameChannel | null = null;
  private onlineState: OnlineState | null = null;
  private roomInfo: RoomInfo | null = null;
  private pendingResult: ResultMessage | null = null;
  private pendingTurnEnd: TurnEndMessage | null = null;
  private rematchPhase: 'idle' | 'awaiting_response' | 'prompted' | 'countdown' = 'idle';
  private rematchCountdownTimer: ReturnType<typeof setInterval> | null = null;
  private lastGameLoser: 0 | 1 | null = null;
  private chatTriggerP1!: HTMLButtonElement;
  private chatTriggerP2!: HTMLButtonElement;
  private chatPopover!: HTMLElement;
  private chatPopoverInput!: HTMLInputElement;
  private chatPopoverEmojiBtn!: HTMLButtonElement;
  private chatPopoverEmojis!: HTMLElement;
  private chatPopoverSendBtn!: HTMLButtonElement;
  private chatMyBubble!: HTMLElement;
  private chatMyBubbleSender!: HTMLElement;
  private chatMyBubbleText!: HTMLElement;
  private chatMyBubbleTimer: ReturnType<typeof setTimeout> | null = null;
  private chatOpponentBubble!: HTMLElement;
  private chatOpponentBubbleSender!: HTMLElement;
  private chatOpponentBubbleText!: HTMLElement;
  private chatOpponentBubbleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super('PoolScene');
  }

  preload(): void {
    this.load.image('hand-raw', 'assets/hand-raw.png');
  }

  create(): void {
    const registryMode = this.game.registry.get('initialMode') as 'pvp' | 'ai' | 'challenge' | 'online' | undefined;
    if (registryMode) {
      this.gameMode = registryMode;
    }
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
    this.netDeformGraphics = this.add.graphics().setDepth(DEPTH.ball - 1);
    this.forbiddenIcon = this.createForbiddenIcon();
    this.bindInput();
    this.bindRestart();
    this.bindLanguage();
    this.bindSpinControl();
    this.bindChallengeUI();
    this.updateHud();

    this.bindVictoryOverlay();
    this.bindChatUI();

    if (this.gameMode === 'challenge') {
      this.showChallengeSelect();
    }

    if (this.gameMode === 'online') {
      this.roomInfo = this.game.registry.get('roomInfo') as RoomInfo | null;
      if (this.roomInfo) this.initOnlineMode();
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.restartButton?.removeEventListener('click', this.restartHandler);
      this.languageButton?.removeEventListener('click', this.languageHandler);
      this.victoryRestartButton?.removeEventListener('click', this.victoryRestartHandler);
      this.challengeBtn?.removeEventListener('click', this.challengeBtnHandler);
      document.querySelector<HTMLButtonElement>('#rematch-request')?.removeEventListener('click', this.rematchRequestHandler);
      document.querySelector<HTMLButtonElement>('#rematch-leave')?.removeEventListener('click', this.rematchLeaveHandler);
      document.querySelector<HTMLButtonElement>('#rematch-cancel')?.removeEventListener('click', this.rematchCancelHandler);
      document.querySelector<HTMLButtonElement>('#rematch-accept')?.removeEventListener('click', this.rematchAcceptHandler);
      document.querySelector<HTMLButtonElement>('#rematch-decline')?.removeEventListener('click', this.rematchDeclineHandler);
      if (this.rematchCountdownTimer) {
        clearInterval(this.rematchCountdownTimer);
        this.rematchCountdownTimer = null;
      }
      this.unbindSpinControl();
      this.unbindChatUI();
      this.cleanupOnlineMode();
    });
  }

  update(): void {
    if (!this.cuePlacementState) {
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
    }
    this.updateShotClock(this.game.loop.delta / 1000);
    this.updateOnlineTick(this.game.loop.delta / 1000);
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

  private bindChallengeUI(): void {
    this.challengeBtn = document.querySelector<HTMLButtonElement>('#challenge-btn') ?? undefined;
    this.challengeBtn?.addEventListener('click', this.challengeBtnHandler);
    this.challengeSelectOverlay = document.querySelector<HTMLElement>('#challenge-select') ?? undefined;
    this.challengeResultOverlay = document.querySelector<HTMLElement>('#challenge-result') ?? undefined;
    this.challengeHud = document.querySelector<HTMLElement>('#challenge-hud') ?? undefined;

    document.querySelector('#challenge-back')?.addEventListener('click', () => {
      this.hideChallengeSelect();
    });
    document.querySelector('#challenge-retry')?.addEventListener('click', () => {
      this.retryChallengeLevel();
    });
    document.querySelector('#challenge-next')?.addEventListener('click', () => {
      this.nextChallengeLevel();
    });
    document.querySelector('#challenge-to-select')?.addEventListener('click', () => {
      this.hideChallengeResult();
      this.showChallengeSelect();
    });
  }

  private async showChallengeSelect(): Promise<void> {
    if (!this.challengeSelectOverlay) return;
    const copy = getCopy(this.language);
    const progress = await readProgressSupabase(supabase);
    this.cachedProgress = progress;
    const grid = document.querySelector('#challenge-grid');
    const title = document.querySelector('#challenge-title');
    if (title) title.textContent = copy.challenge.title;
    if (!grid) return;

    grid.innerHTML = '';
    for (const level of CHALLENGE_LEVELS) {
      const unlocked = isLevelUnlocked(progress, level.id);
      const result = progress.levels[String(level.id)];
      const card = document.createElement('div');
      card.className = `challenge-card${unlocked ? '' : ' is-locked'}`;

      const number = document.createElement('div');
      number.className = 'challenge-card-number';
      number.textContent = String(level.id);

      const name = document.createElement('div');
      name.className = 'challenge-card-name';
      name.textContent = this.language === 'zh' ? level.name.zh : level.name.en;

      const stars = document.createElement('div');
      stars.className = 'challenge-card-stars';
      if (result) {
        stars.innerHTML = Array.from({ length: 3 }, (_, i) =>
          `<span class="${i < result.stars ? 'star-gold' : 'star-gray'}">★</span>`
        ).join('');
      } else if (!unlocked) {
        stars.textContent = '🔒';
      }

      card.append(number, name, stars);
      if (unlocked) {
        card.addEventListener('click', () => this.startChallengeLevel(level));
      }
      grid.appendChild(card);
    }

    const backBtn = document.querySelector('#challenge-back');
    if (backBtn) backBtn.textContent = copy.challenge.back;
    this.challengeSelectOverlay.hidden = false;
  }

  private hideChallengeSelect(): void {
    if (this.challengeSelectOverlay) this.challengeSelectOverlay.hidden = true;
  }

  private startChallengeLevel(level: ChallengeLevel): void {
    this.hideChallengeSelect();
    this.hideChallengeResult();
    this.gameMode = 'challenge';
    this.currentLevel = level;
    this.challengeState = createChallengeState(level);

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
    this.wasMoving = false;

    this.cueBall?.destroy();
    this.targetBalls.forEach(b => b.destroy());
    this.targetBalls = [];

    const cueBallDef = level.balls.find(b => b.id === 0)!;
    this.cueBall = this.createBall(cueBallDef.position, 'cue-ball', 'cue');
    const targets = level.balls.filter(b => b.id !== 0);
    targets.forEach((def, index) => {
      this.targetBalls.push(
        this.createBall(def.position, `target-ball-${index}`, 'target', def.id)
      );
    });

    this.physicsEngine.rack([
      { id: 0, kind: 'cue', position: cueBallDef.position },
      ...targets.map(def => ({
        id: def.id,
        kind: 'target' as const,
        position: def.position,
        label: def.id,
      })),
    ]);

    this.updateChallengeHud();
    this.hideVictoryScreen();
  }

  private updateChallengeHud(): void {
    if (!this.challengeHud || !this.challengeState || !this.currentLevel) return;
    const copy = getCopy(this.language);
    this.challengeHud.hidden = this.gameMode !== 'challenge';

    const nameEl = document.querySelector('#challenge-level-name');
    const shotsEl = document.querySelector('#challenge-shots');
    const hintEl = document.querySelector('#challenge-hint');
    if (nameEl) {
      nameEl.textContent = this.language === 'zh'
        ? this.currentLevel.name.zh
        : this.currentLevel.name.en;
    }
    if (hintEl) {
      const hint = this.currentLevel.hint;
      hintEl.textContent = hint
        ? (this.language === 'zh' ? hint.zh : hint.en)
        : '';
    }
    if (shotsEl) {
      shotsEl.textContent = copy.challenge.shotsUsed(
        this.challengeState.shotsUsed,
        this.challengeState.maxShots
      );
    }
  }

  private async showChallengeResult(): Promise<void> {
    if (!this.challengeResultOverlay || !this.challengeState) return;
    const copy = getCopy(this.language);
    const result = resolveChallengeResult(this.challengeState);
    this.challengeState = { ...this.challengeState, result };

    if (result.passed) {
      const progress = this.cachedProgress ?? await readProgressSupabase(supabase);
      const key = String(this.challengeState.levelId);
      const prev = progress.levels[key];
      const bestStars = prev ? Math.max(prev.stars, result.stars) : result.stars;
      const bestShots = prev
        ? Math.min(prev.bestShots, this.challengeState.shotsUsed)
        : this.challengeState.shotsUsed;
      progress.levels[key] = { stars: bestStars, bestShots };
      this.cachedProgress = progress;
      void writeProgressSupabase(supabase, progress);
    }

    const titleEl = document.querySelector('#challenge-result-title');
    const starsEl = document.querySelector('#challenge-stars');
    const detailEl = document.querySelector('#challenge-result-detail');
    const nextBtn = document.querySelector<HTMLButtonElement>('#challenge-next');
    const retryBtn = document.querySelector<HTMLButtonElement>('#challenge-retry');
    const selectBtn = document.querySelector<HTMLButtonElement>('#challenge-to-select');

    if (titleEl) titleEl.textContent = result.passed ? copy.challenge.passed : copy.challenge.failed;
    if (starsEl) {
      starsEl.innerHTML = Array.from({ length: 3 }, (_, i) =>
        `<span class="${i < result.stars ? 'star-gold' : 'star-gray'}">★</span>`
      ).join('');
    }
    if (detailEl) {
      detailEl.textContent = copy.challenge.shotsUsed(
        this.challengeState.shotsUsed,
        this.challengeState.maxShots
      );
    }
    if (retryBtn) retryBtn.textContent = copy.challenge.retry;
    if (selectBtn) selectBtn.textContent = copy.challenge.levelSelect;
    if (nextBtn) {
      nextBtn.textContent = copy.challenge.nextLevel;
      const hasNext = this.challengeState.levelId < CHALLENGE_LEVELS.length;
      nextBtn.hidden = !result.passed || !hasNext;
    }

    this.challengeResultOverlay.hidden = false;
  }

  private hideChallengeResult(): void {
    if (this.challengeResultOverlay) this.challengeResultOverlay.hidden = true;
  }

  private retryChallengeLevel(): void {
    if (this.currentLevel) {
      this.hideChallengeResult();
      this.startChallengeLevel(this.currentLevel);
    }
  }

  private nextChallengeLevel(): void {
    if (!this.challengeState) return;
    const nextId = this.challengeState.levelId + 1;
    const next = CHALLENGE_LEVELS.find(l => l.id === nextId);
    if (next) {
      this.hideChallengeResult();
      this.startChallengeLevel(next);
    }
  }

  private bindVictoryOverlay(): void {
    this.victoryOverlay = document.querySelector<HTMLElement>('#victory-overlay') ?? undefined;
    this.victoryTitle = document.querySelector<HTMLElement>('#victory-title') ?? undefined;
    this.victoryDetail = document.querySelector<HTMLElement>('#victory-detail') ?? undefined;
    this.victoryRestartButton = document.querySelector<HTMLButtonElement>('#victory-restart') ?? undefined;
    this.victoryRestartButton?.addEventListener('click', this.victoryRestartHandler);

    document.querySelector<HTMLButtonElement>('#rematch-request')?.addEventListener('click', this.rematchRequestHandler);
    document.querySelector<HTMLButtonElement>('#rematch-leave')?.addEventListener('click', this.rematchLeaveHandler);
    document.querySelector<HTMLButtonElement>('#rematch-cancel')?.addEventListener('click', this.rematchCancelHandler);
    document.querySelector<HTMLButtonElement>('#rematch-accept')?.addEventListener('click', this.rematchAcceptHandler);
    document.querySelector<HTMLButtonElement>('#rematch-decline')?.addEventListener('click', this.rematchDeclineHandler);
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
      !this.isOnlineOpponentTurn() &&
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
      !this.isOnlineOpponentTurn() &&
      this.physicsEngine.isSettled()
    );
  }

  private canPlaceBallInHandCueBall(): boolean {
    return !this.strikeLocked && this.rules.cueBallInHand && !this.rules.gameOver && !this.isAITurn() && !this.isOnlineOpponentTurn() && this.physicsEngine.isSettled();
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
    if (this.gameMode === 'challenge' && this.challengeState) {
      this.challengeState = recordChallengeShot(this.challengeState);
      this.updateChallengeHud();
    }
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
        if (this.gameMode === 'online') {
          const dir = { x: -pull.x / dragDistance, y: -pull.y / dragDistance };
          this.sendOnlineShot(dir, power, this.selectedSpin, cue);
        }
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

    const aimLineEnabled = this.game.registry.get('aimLineEnabled') ?? true;
    if (aimLineEnabled) {
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
    const hideTarget = this.gameMode === 'challenge' && !!this.currentLevel?.hideTargetRoute;
    const impactDistance = Math.hypot(prediction.cueBallImpactCenter.x - cue.x, prediction.cueBallImpactCenter.y - cue.y);
    const inboundStart =
      impactDistance < 0.001
        ? cue
        : {
            x: cue.x + ((prediction.cueBallImpactCenter.x - cue.x) / impactDistance) * BALL_RADIUS,
            y: cue.y + ((prediction.cueBallImpactCenter.y - cue.y) / impactDistance) * BALL_RADIUS,
          };
    const targetEnd = hideTarget ? null : this.scaleRouteEnd(
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
    if (targetEnd) this.strokeLine(prediction.targetBallCenter, targetEnd);
    if (cueDeflectEnd) this.strokeLine(prediction.cueBallImpactCenter, cueDeflectEnd);

    this.aimLine.lineStyle(3, 0xf6e7b4, 0.92);
    this.strokeLine(inboundStart, prediction.cueBallImpactCenter);

    if (targetEnd) {
      this.aimLine.lineStyle(3, 0xffffff, 0.88);
      this.strokeLine(prediction.targetBallCenter, targetEnd);
    }

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
        if (this.gameMode === 'challenge' && this.challengeState && event.otherBallId !== undefined) {
          this.challengeState = recordChallengeCollision(this.challengeState, event.ballId, event.otherBallId);
        }
        this.audio.play('collision');
        continue;
      }
      if (event.type === 'cushion') {
        if (this.gameMode !== 'challenge') {
          this.rules = recordEightBallCushion(this.rules);
        }
        this.audio.play('rail');
        continue;
      }
      if (event.type !== 'pocket') {
        continue;
      }
      if (this.gameMode === 'online' && this.onlineState?.phase === 'watching_opponent_shot') {
        continue;
      }
      this.ballPocketMap.set(event.ballId, event.pocketIndex);
      if (this.gameMode === 'challenge' && this.challengeState) {
        if (event.ballId === 0) {
          this.challengeState = recordChallengeCuePocket(this.challengeState);
        } else if (this.currentLevel?.requiredPocket !== undefined) {
          this.challengeState = recordChallengePocketWithRequired(
            this.challengeState, event.ballId, event.pocketIndex, this.currentLevel.requiredPocket,
          );
        } else if (this.currentLevel?.orderedPocket) {
          const sortedIds = this.currentLevel.balls.filter(b => b.id !== 0).map(b => b.id).sort((a, b) => a - b);
          this.challengeState = recordChallengeOrderedPocket(this.challengeState, event.ballId, sortedIds);
        } else if (this.currentLevel?.requireKickChain) {
          const [, kickedBall] = this.currentLevel.requireKickChain;
          const kickedBallSnapshot = this.physicsEngine.getBalls().find(b => b.id === kickedBall);
          const kickedAlreadyPocketed = kickedBallSnapshot?.pocketed ?? false;
          const satisfied = kickedAlreadyPocketed || checkKickChain(this.challengeState, this.currentLevel.requireKickChain);
          if (satisfied) {
            this.challengeState = recordChallengePocket(this.challengeState, event.ballId);
          }
        } else {
          this.challengeState = recordChallengePocket(this.challengeState, event.ballId);
        }
        this.updateChallengeHud();
        this.audio.play('pocket');
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

      if (this.pocketAnimatingBalls.has(snapshot.id)) {
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

      if (snapshot.pocketed && !ball.pocketed) {
        ball.pocketed = true;
        if (this.gameMode !== 'online' || this.onlineState?.phase !== 'watching_opponent_shot') {
          this.startPocketAnimation(ball);
        } else {
          ball.setVisible(false);
        }
      } else if (!snapshot.pocketed) {
        ball.pocketed = false;
        ball.setVisible(true);
      }

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

  private static readonly PHYSICS_TO_RENDER_POCKET = [0, 2, 3, 5, 1, 4];

  private startPocketAnimation(ball: PoolBall): void {
    const physicsIndex = this.ballPocketMap.get(ball.ballId) ?? 0;
    const pocketIndex = PoolScene.PHYSICS_TO_RENDER_POCKET[physicsIndex] ?? physicsIndex;
    const pocket = POCKETS[pocketIndex];
    this.pocketAnimatingBalls.add(ball.ballId);

    ball.setDepth(DEPTH.ball + 2);

    this.tweens.add({
      targets: ball,
      x: pocket.x,
      y: pocket.y,
      scaleX: 0.3,
      scaleY: 0.3,
      alpha: 0,
      duration: 400,
      ease: 'Cubic.easeIn',
      onUpdate: (tween: Phaser.Tweens.Tween) => {
        this.drawNetDeform(pocketIndex, tween.progress);
      },
      onComplete: () => {
        ball.setVisible(false);
        ball.setScale(1);
        ball.setAlpha(1);
        ball.setDepth(DEPTH.ball);
        this.pocketAnimatingBalls.delete(ball.ballId);
        this.ballPocketMap.delete(ball.ballId);
        this.netDeformGraphics.clear();
      },
    });
  }

  private drawNetDeform(pocketIndex: number, progress: number): void {
    drawPocketNetDeformation(this.netDeformGraphics, pocketIndex, progress);
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

    if (this.gameMode === 'online') {
      this.handleOnlineSettled();
      return;
    }

    if (this.gameMode === 'challenge' && this.challengeState) {
      if (this.challengeState.orderViolation) {
        this.challengeState = { ...this.challengeState, result: { passed: false, stars: 0 } };
        this.showChallengeResult();
        return;
      }
      const cueBallSnapshot = this.physicsEngine.getBalls().find(b => b.id === 0);
      if (cueBallSnapshot?.pocketed || this.challengeState.cuePocketed) {
        const sortedIds = this.currentLevel!.balls.filter(b => b.id !== 0).map(b => b.id).sort((a, b) => a - b);
        for (const ballId of this.challengeState.ballsPocketedThisShot) {
          const ballDef = this.currentLevel!.balls.find(b => b.id === ballId);
          if (ballDef) {
            this.physicsEngine.resetBall(ballId, ballDef.position);
          }
        }
        this.challengeState = revertCuePocketShot(this.challengeState, sortedIds, !!this.currentLevel!.orderedPocket);
        const cueDef = this.currentLevel!.balls.find(b => b.id === 0)!;
        this.physicsEngine.resetCueBall(cueDef.position);
        this.syncBallsFromPhysics(this.physicsEngine.getBalls());
      }
      if (this.challengeState.requiredPocketViolation) {
        const pocketedSnapshots = this.physicsEngine.getBalls().filter(b => b.pocketed && b.id !== 0);
        for (const snap of pocketedSnapshots) {
          if (!this.challengeState.allPocketedBallIds.includes(snap.id)) {
            const ballDef = this.currentLevel!.balls.find(b => b.id === snap.id);
            if (ballDef) {
              this.physicsEngine.resetBall(snap.id, ballDef.position);
            }
          }
        }
        this.syncBallsFromPhysics(this.physicsEngine.getBalls());
      }
      if (this.currentLevel?.requireKickChain) {
        const [, kickedBall] = this.currentLevel.requireKickChain;
        const kickedAlreadyPocketed = this.challengeState.allPocketedBallIds.includes(kickedBall);
        const satisfied = kickedAlreadyPocketed || checkKickChain(this.challengeState, this.currentLevel.requireKickChain);
        this.challengeState = { ...this.challengeState, kickChainSatisfied: satisfied };
        if (!satisfied) {
          const pocketedSnapshots = this.physicsEngine.getBalls().filter(b => b.pocketed && b.id !== 0);
          for (const snap of pocketedSnapshots) {
            if (!this.challengeState.allPocketedBallIds.includes(snap.id)) {
              const ballDef = this.currentLevel!.balls.find(b => b.id === snap.id);
              if (ballDef) {
                this.physicsEngine.resetBall(snap.id, ballDef.position);
              }
            }
          }
          this.syncBallsFromPhysics(this.physicsEngine.getBalls());
        }
      }
      this.challengeState = resetChallengeShot(this.challengeState);
      if (this.challengeState.targetsPocketed >= this.challengeState.totalTargets) {
        this.showChallengeResult();
        return;
      }
      if (this.challengeState.shotsUsed >= this.challengeState.maxShots) {
        this.showChallengeResult();
        return;
      }
      this.updateChallengeHud();
      return;
    }

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

      if (!this.rules.gameOver && this.isAITurn() && !this.aiThinking) {
        this.scheduleAITurn();
      }
      return;
    }

    this.updateShotClockHud();
  }

  private shouldRunShotClock(): boolean {
    if (this.gameMode === 'online') return false;
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
    const matchPanel = document.querySelector('.match-panel') as HTMLElement | null;
    if (matchPanel) matchPanel.hidden = this.gameMode === 'challenge';
    if (this.gameMode === 'challenge') {
      this.updateChallengeHud();
      return;
    }
    const copy = getCopy(this.language);
    const messageText = this.formatCurrentMessageText();
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
    if (this.restartButton) this.restartButton.textContent = this.gameMode === 'online' ? '认输' : copy.hud.restart;
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
    if (this.gameMode === 'online' && this.roomInfo) {
      const hostName = this.roomInfo.isHost ? this.roomInfo.myNickname : this.roomInfo.opponentNickname;
      const guestName = this.roomInfo.isHost ? this.roomInfo.opponentNickname : this.roomInfo.myNickname;
      if (playerOneName) playerOneName.textContent = hostName;
      if (playerTwoName) playerTwoName.textContent = guestName;
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
    const maxTime = this.onlineState ? this.onlineState.turnTimeLimit : SHOT_CLOCK_SECONDS;
    const progress = Math.max(0, Math.min(this.shotClockRemaining / maxTime, 1));
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

  // --- Online Mode ---

  private isOnlineOpponentTurn(): boolean {
    if (!this.onlineState) return false;
    const phase = this.onlineState.phase;
    return phase === 'opponent_turn' || phase === 'watching_opponent_shot' || phase === 'waiting_opponent';
  }

  private initOnlineMode(): void {
    if (!this.roomInfo) return;
    this.onlineState = createOnlineState({
      isHost: this.roomInfo.isHost,
      turnTimeLimit: 30,
      disconnectTimeout: 30,
    });
    this.chatTriggerP1.hidden = !this.roomInfo.isHost;
    this.chatTriggerP2.hidden = this.roomInfo.isHost;
    this.onlineChannel = new GameChannel();
    this.onlineChannel.join({
      roomId: this.roomInfo.roomId,
      userId: this.roomInfo.isHost ? 'host' : 'guest',
      callbacks: {
        onMessage: (msg) => this.handleOnlineMessage(msg),
        onPresence: (event) => this.handleOnlinePresence(event),
      },
    });
  }

  private handleOnlinePresence(event: 'join' | 'leave'): void {
    if (!this.onlineState) return;
    if (event === 'join' && this.onlineState.phase === 'waiting_opponent') {
      if (this.roomInfo!.isHost) {
        this.onlineState = transitionToMyTurn(this.onlineState);
      } else {
        this.onlineState = transitionToOpponentTurn(this.onlineState);
      }
      this.shotClockRemaining = 30;
      this.updateHud();
    }
  }

  private handleOnlineMessage(msg: OnlineMessage): void {
    if (!this.onlineState) return;
    if (msg.type === 'heartbeat') {
      this.onlineState = recordHeartbeat(this.onlineState, Date.now());
      return;
    }
    if (msg.type === 'shot') {
      this.handleOpponentShot(msg);
      return;
    }
    if (msg.type === 'result') {
      this.handleOpponentResult(msg);
      return;
    }
    if (msg.type === 'turn_end') {
      this.handleOpponentTurnEnd(msg);
      return;
    }
    if (msg.type === 'game_over') {
      const myIndex = this.roomInfo!.isHost ? 0 : 1;
      const iWin = msg.winner === myIndex;
      this.onlineState = transitionToGameOver(this.onlineState, msg.winner, msg.reason);
      this.showOnlineGameOver(iWin, msg.reason);
      return;
    }
    if (msg.type === 'rematch_request') {
      this.handleRematchRequest();
      return;
    }
    if (msg.type === 'rematch_response') {
      this.handleRematchResponse(msg.accepted);
      return;
    }
    if (msg.type === 'rematch_start') {
      this.beginRematchCountdown(msg.startAt, msg.breaker);
    }
    if (msg.type === 'chat') {
      this.showOpponentBubble(msg.senderNickname, msg.text);
    }
  }

  private handleOpponentShot(msg: ShotMessage): void {
    if (!this.onlineState) return;
    this.onlineState = transitionToWatchingOpponentShot(this.onlineState);
    this.physicsEngine.resetCueBall(msg.cueBallPos);
    this.syncBallsFromPhysics(this.physicsEngine.getBalls());
    this.physicsEngine.strikeCueBall({
      direction: msg.direction,
      power: msg.power,
      contactOffset: msg.contactOffset,
    });
    this.wasMoving = true;
    this.state = recordStroke(this.state);
    this.rules = startEightBallShot(this.rules);
    this.audio.play('cue');
  }

  private handleOpponentResult(msg: ResultMessage): void {
    this.pendingResult = msg;
    if (this.physicsEngine.isSettled() && !this.wasMoving) {
      this.applyPendingOpponentResult();
    }
  }

  private handleOpponentTurnEnd(msg: TurnEndMessage): void {
    this.pendingTurnEnd = msg;
    if (this.physicsEngine.isSettled() && !this.wasMoving) {
      this.applyPendingOpponentResult();
    }
  }

  private formatCurrentMessageText(): string {
    const copy = getCopy(this.language);
    const rawMessageValues =
      this.rules.messageKey === 'eightBallReady' && !this.rules.messageValues
        ? { player: this.rules.currentPlayer + 1 }
        : (this.rules.messageValues ?? {});
    const messageValues = {
      ...rawMessageValues,
      player: this.formatPlayerMessageValue(rawMessageValues.player) ?? '',
      winner: this.formatPlayerMessageValue(rawMessageValues.winner) ?? '',
      loser: this.formatPlayerMessageValue(rawMessageValues.loser) ?? '',
      group:
        rawMessageValues.group === 'solids' || rawMessageValues.group === 'stripes'
          ? copy.hud.playerGroup(rawMessageValues.group)
          : rawMessageValues.group ?? '',
      reason:
        rawMessageValues.reason === 'cueBallPocketed' ||
        rawMessageValues.reason === 'noFirstContact' ||
        rawMessageValues.reason === 'wrongFirstContact' ||
        rawMessageValues.reason === 'shotClockExpired'
          ? copy.foulReason[rawMessageValues.reason]
          : rawMessageValues.reason ?? '',
    };
    return formatMessage(copy.message[this.rules.messageKey], messageValues);
  }

  private formatPlayerMessageValue(value: string | number | undefined): string | number | undefined {
    if (value !== 1 && value !== 2) {
      return value;
    }

    return this.playerDisplayName(value);
  }

  private playerDisplayName(player: number): string {
    if (this.gameMode === 'online' && this.roomInfo) {
      if (player === 1) {
        return this.roomInfo.isHost ? this.roomInfo.myNickname : this.roomInfo.opponentNickname;
      }
      if (player === 2) {
        return this.roomInfo.isHost ? this.roomInfo.opponentNickname : this.roomInfo.myNickname;
      }
    }

    return getCopy(this.language).hud.currentPlayer(player);
  }

  private sendOnlineShot(direction: Vector, power: number, contactOffset: Vector, cueBallPos: Vector): void {
    if (!this.onlineChannel || !this.onlineState) return;
    this.onlineChannel.send({
      type: 'shot',
      direction,
      power,
      contactOffset,
      cueBallPos,
    });
    this.onlineState = transitionToWatchingMyShot(this.onlineState);
  }

  private sendOnlineResult(): void {
    if (!this.onlineChannel) return;
    const balls = this.physicsEngine.getBalls().map((b) => ({
      id: b.id,
      x: b.position.x,
      y: b.position.y,
      pocketed: b.pocketed,
      pocketIndex: b.pocketed ? this.ballPocketMap.get(b.id) : undefined,
    }));
    this.onlineChannel.send({ type: 'result', balls });
  }

  private sendOnlineTurnEnd(foul: boolean, cueBallInHand: boolean, nextPlayer: 0 | 1, pocketedBallIds: number[], gameOver: boolean, winner: 0 | 1 | null): void {
    if (!this.onlineChannel) return;
    this.onlineChannel.send({
      type: 'turn_end',
      foul,
      cueBallInHand,
      nextPlayer,
      pocketedBallIds,
      gameOver,
      winner,
    });
  }

  private handleOnlineSettled(): void {
    if (!this.onlineState) return;

    if (this.onlineState.phase === 'watching_opponent_shot') {
      this.applyPendingOpponentResult();
      return;
    }

    if (this.onlineState.phase !== 'watching_my_shot') return;
    this.sendOnlineResult();
    const pocketedBallIds = this.rules.shot.pocketedBallIds.slice();
    if (pocketedBallIds.includes(0)) {
      this.physicsEngine.resetCueBall(CUE_START);
      this.syncBallsFromPhysics(this.physicsEngine.getBalls());
    }
    const playerBeforeResolve = this.rules.currentPlayer;
    this.rules = resolveEightBallShot(this.rules);
    const myIndex: 0 | 1 = this.roomInfo!.isHost ? 0 : 1;
    const opponentIndex: 0 | 1 = this.roomInfo!.isHost ? 1 : 0;
    const foul = this.rules.cueBallInHand;
    const gameOver = this.rules.gameOver;
    let winner: 0 | 1 | null = null;
    let nextPlayer: 0 | 1 = myIndex;
    if (gameOver) {
      const eightBallLoss = this.rules.messageKey === 'eightBallLoss';
      winner = eightBallLoss ? opponentIndex : myIndex;
    } else {
      nextPlayer = this.rules.currentPlayer === playerBeforeResolve ? myIndex : opponentIndex;
    }
    this.sendOnlineTurnEnd(foul, this.rules.cueBallInHand, nextPlayer, pocketedBallIds, gameOver, winner);
    if (gameOver) {
      this.onlineState = transitionToGameOver(this.onlineState, winner!, 'normal');
      this.showOnlineGameOver(winner === myIndex, 'normal');
      this.updateOnlineStats(winner === myIndex);
    } else if (nextPlayer === myIndex) {
      this.onlineState = transitionToMyTurn(this.onlineState);
      this.shotClockRemaining = 30;
    } else {
      this.onlineState = transitionToOpponentTurn(this.onlineState);
    }
    this.updateHud();
  }

  private applyPendingOpponentResult(): void {
    if (this.pendingResult) {
      for (const ballId of this.pocketAnimatingBalls) {
        const ball = this.allBalls().find((b) => b.ballId === ballId);
        if (ball && this.tweens) {
          this.tweens.killTweensOf(ball);
          ball.setVisible(false);
          ball.setScale(1);
          ball.setAlpha(1);
          ball.setDepth(DEPTH.ball);
        }
      }
      this.pocketAnimatingBalls.clear();
      this.netDeformGraphics?.clear();

      for (const ball of this.pendingResult.balls) {
        if (ball.pocketed) {
          this.ballPocketMap.set(ball.id, ball.pocketIndex ?? this.nearestPocketIndex({ x: ball.x, y: ball.y }));
          this.physicsEngine.pocketBall(ball.id);
        } else {
          this.physicsEngine.resetBall(ball.id, { x: ball.x, y: ball.y });
        }
      }
      this.syncBallsFromPhysics(this.physicsEngine.getBalls());
      this.pendingResult = null;
    }
    if (this.pendingTurnEnd) {
      const msg = this.pendingTurnEnd;
      this.pendingTurnEnd = null;
      if (!this.onlineState) return;
      if (msg.foul && msg.cueBallInHand) {
        this.rules = { ...this.rules, cueBallInHand: true };
        this.physicsEngine.resetCueBall(CUE_START);
        this.syncBallsFromPhysics(this.physicsEngine.getBalls());
      }
      for (const ballId of msg.pocketedBallIds) {
        this.rules = recordEightBallPocket(this.rules, ballId);
      }
      this.rules = resolveEightBallShot(this.rules);
      if (msg.gameOver) {
        const myIndex = this.roomInfo!.isHost ? 0 : 1;
        const iWin = msg.winner === myIndex;
        this.onlineState = transitionToGameOver(this.onlineState, msg.winner ?? 0, 'normal');
        this.showOnlineGameOver(iWin, 'normal');
        return;
      }
      const myIndex = this.roomInfo!.isHost ? 0 : 1;
      if (msg.nextPlayer === myIndex) {
        this.onlineState = transitionToMyTurn(this.onlineState);
      } else {
        this.onlineState = transitionToOpponentTurn(this.onlineState);
      }
      this.shotClockRemaining = 30;
      this.wasMoving = false;
      this.updateHud();
    }
  }

  private nearestPocketIndex(point: Vector): number {
    let nearest = 0;
    let nearestDistance = Infinity;
    POCKETS.forEach((pocket, index) => {
      const distance = Phaser.Math.Distance.Between(point.x, point.y, pocket.x, pocket.y);
      if (distance < nearestDistance) {
        nearest = index;
        nearestDistance = distance;
      }
    });
    return nearest;
  }

  private handleOnlineTimeout(): void {
    if (!this.onlineState || !this.onlineChannel) return;
    this.aimState = null;
    this.cuePlacementState = null;
    this.aimLine.clear();
    this.cueGraphics.clear();
    this.rules = recordEightBallTimeoutFoul(this.rules);
    const myIndex: 0 | 1 = this.roomInfo!.isHost ? 0 : 1;
    const opponentIndex: 0 | 1 = this.roomInfo!.isHost ? 1 : 0;
    this.sendOnlineTurnEnd(true, true, opponentIndex, [], false, null);
    this.onlineState = transitionToOpponentTurn(this.onlineState);
    this.shotClockRemaining = 30;
    this.updateHud();
  }

  private surrenderOnlineMatch(): void {
    if (!this.onlineState || this.onlineState.phase === 'game_over' || !this.roomInfo) return;
    this.aimState = null;
    this.cuePlacementState = null;
    this.aimLine?.clear();
    this.cueGraphics?.clear();
    const myIndex: 0 | 1 = this.roomInfo.isHost ? 0 : 1;
    const winner: 0 | 1 = myIndex === 0 ? 1 : 0;
    this.onlineChannel?.send({ type: 'game_over', reason: 'surrender', winner });
    this.onlineState = transitionToGameOver(this.onlineState, winner, 'surrender');
    this.showOnlineGameOver(false, 'surrender');
    void this.updateOnlineStats(false);
  }

  private handleOpponentDisconnect(): void {
    if (!this.onlineState || !this.onlineChannel) return;
    const myIndex: 0 | 1 = this.roomInfo!.isHost ? 0 : 1;
    this.onlineChannel.send({ type: 'game_over', reason: 'disconnect', winner: myIndex });
    this.onlineState = transitionToGameOver(this.onlineState, myIndex, 'disconnect');
    this.showOnlineGameOver(true, 'disconnect');
    this.updateOnlineStats(true);
  }

  private updateOnlineTick(deltaSeconds: number): void {
    if (!this.onlineState || this.onlineState.phase === 'game_over') return;
    if (this.onlineState.phase === 'my_turn') {
      this.onlineState = tickTurnTimer(this.onlineState, deltaSeconds);
      this.shotClockRemaining = this.onlineState.turnTimer;
      this.updateShotClockHud();
      if (this.onlineState.turnTimer <= 0) {
        this.handleOnlineTimeout();
        return;
      }
    }
    if (checkDisconnect(this.onlineState, Date.now())) {
      this.handleOpponentDisconnect();
    }
  }

  private showOnlineGameOver(iWin: boolean, reason: string): void {
    const myIndex: 0 | 1 = this.roomInfo!.isHost ? 0 : 1;
    const opponentIndex: 0 | 1 = this.roomInfo!.isHost ? 1 : 0;
    this.lastGameLoser = iWin ? opponentIndex : myIndex;

    if (this.victoryTitle) {
      this.victoryTitle.textContent = iWin ? 'You Win!' : 'You Lose';
    }
    if (this.victoryDetail) {
      this.victoryDetail.textContent = reason === 'disconnect' ? 'Opponent disconnected' : '';
    }
    if (this.victoryOverlay) {
      this.victoryOverlay.hidden = false;
    }

    this.rematchPhase = 'idle';
    this.setElementHidden('#victory-actions', true);
    if (reason === 'disconnect') {
      this.setElementHidden('#rematch-actions', true);
      this.setElementHidden('#rematch-waiting', true);
      this.setElementHidden('#rematch-prompt', true);
      this.setElementHidden('#rematch-countdown', true);
      this.setElementHidden('#victory-actions', false);
    } else {
      this.setElementHidden('#rematch-actions', false);
      this.setElementHidden('#rematch-waiting', true);
      this.setElementHidden('#rematch-prompt', true);
      this.setElementHidden('#rematch-countdown', true);
    }
  }

  private setElementHidden(selector: string, hidden: boolean): void {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) el.hidden = hidden;
  }

  private sendRematchRequest(): void {
    if (!this.onlineChannel || this.rematchPhase !== 'idle') return;
    this.onlineChannel.send({ type: 'rematch_request' });
    this.rematchPhase = 'awaiting_response';
    this.setElementHidden('#rematch-actions', true);
    this.setElementHidden('#rematch-waiting', false);
  }

  private cancelRematchRequest(): void {
    if (this.rematchPhase !== 'awaiting_response') return;
    if (this.onlineChannel) {
      this.onlineChannel.send({ type: 'rematch_response', accepted: false });
    }
    this.rematchPhase = 'idle';
    this.setElementHidden('#rematch-waiting', true);
    this.setElementHidden('#rematch-actions', false);
  }

  private respondToRematch(accepted: boolean): void {
    if (!this.onlineChannel || this.rematchPhase !== 'prompted') return;
    this.onlineChannel.send({ type: 'rematch_response', accepted });
    this.setElementHidden('#rematch-prompt', true);
    if (accepted) {
      if (this.roomInfo!.isHost) {
        this.startRematchCountdown();
      }
    } else {
      this.rematchPhase = 'idle';
      this.setElementHidden('#rematch-actions', false);
    }
  }

  private handleRematchRequest(): void {
    if (this.rematchPhase === 'awaiting_response') {
      this.onlineChannel?.send({ type: 'rematch_response', accepted: true });
      if (this.roomInfo!.isHost) {
        this.startRematchCountdown();
      }
      this.setElementHidden('#rematch-waiting', true);
      return;
    }
    if (this.rematchPhase === 'countdown') return;
    this.rematchPhase = 'prompted';
    this.setElementHidden('#rematch-actions', true);
    this.setElementHidden('#rematch-waiting', true);
    this.setElementHidden('#rematch-prompt', false);
  }

  private handleRematchResponse(accepted: boolean): void {
    if (accepted) {
      if (this.rematchPhase === 'awaiting_response' && this.roomInfo!.isHost) {
        this.startRematchCountdown();
      }
    } else {
      this.rematchPhase = 'idle';
      this.setElementHidden('#rematch-waiting', true);
      this.setElementHidden('#rematch-prompt', true);
      this.setElementHidden('#rematch-actions', false);
      if (this.victoryDetail) {
        this.victoryDetail.textContent = '对手已拒绝';
      }
    }
  }

  private startRematchCountdown(): void {
    if (!this.onlineChannel) return;
    const breaker: 0 | 1 = this.lastGameLoser ?? 0;
    const startAt = Date.now() + 3500;
    this.onlineChannel.send({ type: 'rematch_start', startAt, breaker });
    this.beginRematchCountdown(startAt, breaker);
  }

  private beginRematchCountdown(startAt: number, breaker: 0 | 1): void {
    this.rematchPhase = 'countdown';
    this.setElementHidden('#rematch-actions', true);
    this.setElementHidden('#rematch-waiting', true);
    this.setElementHidden('#rematch-prompt', true);
    this.setElementHidden('#rematch-countdown', false);
    const countdownEl = document.querySelector<HTMLElement>('#rematch-countdown');
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((startAt - Date.now()) / 1000));
      if (countdownEl) countdownEl.textContent = String(remaining);
      if (remaining <= 0) {
        if (this.rematchCountdownTimer) {
          clearInterval(this.rematchCountdownTimer);
          this.rematchCountdownTimer = null;
        }
        this.performRematch(breaker);
      }
    };
    tick();
    this.rematchCountdownTimer = setInterval(tick, 200);
  }

  private performRematch(breaker: 0 | 1): void {
    if (this.rematchCountdownTimer) {
      clearInterval(this.rematchCountdownTimer);
      this.rematchCountdownTimer = null;
    }
    this.rematchPhase = 'idle';
    this.setElementHidden('#rematch-countdown', true);
    this.restartRack();

    if (this.gameMode === 'online' && this.onlineState && this.roomInfo) {
      const myIndex: 0 | 1 = this.roomInfo.isHost ? 0 : 1;
      this.onlineState = createOnlineState({
        isHost: this.roomInfo.isHost,
        turnTimeLimit: 30,
        disconnectTimeout: 30,
      });
      if (breaker === myIndex) {
        this.onlineState = transitionToMyTurn(this.onlineState);
      } else {
        this.onlineState = transitionToOpponentTurn(this.onlineState);
      }
      this.shotClockRemaining = 30;
      this.updateHud();
    }
  }

  private leaveOnlineMatch(): void {
    this.cleanupOnlineMode();
    this.hideVictoryScreen();
    window.location.reload();
  }

  private async updateOnlineStats(won: boolean): Promise<void> {
    const stat = won ? 'wins' : 'losses';
    await supabase.rpc('increment_profile_stat', { stat_name: stat });
    if (this.roomInfo) {
      await supabase.from('rooms').update({ status: 'finished' }).eq('id', this.roomInfo.roomId);
    }
  }

  private cleanupOnlineMode(): void {
    if (this.onlineChannel) {
      this.onlineChannel.leave();
      this.onlineChannel = null;
    }
    this.onlineState = null;
    this.pendingResult = null;
    this.pendingTurnEnd = null;
    this.chatTriggerP1.hidden = true;
    this.chatTriggerP2.hidden = true;
    this.chatPopover.hidden = true;
    this.chatPopoverEmojis.hidden = true;
    this.chatMyBubble.hidden = true;
    this.chatOpponentBubble.hidden = true;
    if (this.chatMyBubbleTimer) {
      clearTimeout(this.chatMyBubbleTimer);
      this.chatMyBubbleTimer = null;
    }
    if (this.chatOpponentBubbleTimer) {
      clearTimeout(this.chatOpponentBubbleTimer);
      this.chatOpponentBubbleTimer = null;
    }
  }

  // --- Chat ---

  private static readonly CHAT_EMOJIS = ['😀','😂','🤣','😊','😎','😍','🤩','😤','😢','😡','👍','👎','🎱','🔥','💯','👏','🥇','🏆','🤝','🎉','💪','🙏','😅','🤔','👋','❤️','✨','⚡','🎯'];

  private bindChatUI(): void {
    this.chatTriggerP1 = document.querySelector<HTMLButtonElement>('#chat-trigger-p1')!;
    this.chatTriggerP2 = document.querySelector<HTMLButtonElement>('#chat-trigger-p2')!;
    this.chatPopover = document.querySelector<HTMLElement>('#chat-popover')!;
    this.chatPopoverInput = document.querySelector<HTMLInputElement>('#chat-popover-input')!;
    this.chatPopoverEmojiBtn = document.querySelector<HTMLButtonElement>('#chat-popover-emoji')!;
    this.chatPopoverEmojis = document.querySelector<HTMLElement>('#chat-popover-emojis')!;
    this.chatPopoverSendBtn = document.querySelector<HTMLButtonElement>('#chat-popover-send')!;
    this.chatMyBubble = document.querySelector<HTMLElement>('#chat-my-bubble')!;
    this.chatMyBubbleSender = this.chatMyBubble.querySelector<HTMLElement>('.chat-msg-sender-inline')!;
    this.chatMyBubbleText = this.chatMyBubble.querySelector<HTMLElement>('.chat-msg-text-inline')!;
    this.chatOpponentBubble = document.querySelector<HTMLElement>('#chat-opponent-bubble')!;
    this.chatOpponentBubbleSender = this.chatOpponentBubble.querySelector<HTMLElement>('.chat-msg-sender-inline')!;
    this.chatOpponentBubbleText = this.chatOpponentBubble.querySelector<HTMLElement>('.chat-msg-text-inline')!;

    this.chatTriggerP1.addEventListener('click', () => this.toggleChatPopover(this.chatTriggerP1));
    this.chatTriggerP2.addEventListener('click', () => this.toggleChatPopover(this.chatTriggerP2));
    this.chatPopoverSendBtn.addEventListener('click', () => this.sendChatMessage());
    this.chatPopoverInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.sendChatMessage();
      }
    });
    this.chatPopoverEmojiBtn.addEventListener('click', () => {
      this.chatPopoverEmojis.hidden = !this.chatPopoverEmojis.hidden;
    });

    for (const emoji of PoolScene.CHAT_EMOJIS) {
      const btn = document.createElement('button');
      btn.className = 'chat-emoji-item';
      btn.textContent = emoji;
      btn.type = 'button';
      btn.addEventListener('click', () => {
        this.chatPopoverInput.value += emoji;
        this.chatPopoverInput.focus();
        this.chatPopoverEmojis.hidden = true;
      });
      this.chatPopoverEmojis.appendChild(btn);
    }
  }

  private unbindChatUI(): void {
    const clone = (el: HTMLElement) => {
      const cloned = el.cloneNode(true);
      el.parentNode?.replaceChild(cloned, el);
      return cloned;
    };
    clone(this.chatTriggerP1);
    clone(this.chatTriggerP2);
    clone(this.chatPopoverSendBtn);
    clone(this.chatPopoverEmojiBtn);
    this.chatPopoverEmojis.innerHTML = '';
    const inputClone = this.chatPopoverInput.cloneNode(true);
    this.chatPopoverInput.parentNode?.replaceChild(inputClone, this.chatPopoverInput);
  }

  private toggleChatPopover(anchor?: HTMLElement): void {
    const show = this.chatPopover.hidden;
    this.chatPopover.hidden = !show;
    this.chatPopoverEmojis.hidden = true;
    if (show) {
      if (anchor) this.anchorElementTo(this.chatPopover, anchor);
      this.chatPopoverInput.value = '';
      this.chatPopoverInput.focus();
    }
  }

  private anchorElementTo(el: HTMLElement, anchor: HTMLElement): void {
    const shell = el.offsetParent as HTMLElement | null;
    if (!shell) return;
    const iconRect = anchor.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    el.style.top = `${iconRect.bottom - shellRect.top + 4}px`;
    el.style.left = `${iconRect.left - shellRect.left}px`;
  }

  private sendChatMessage(): void {
    const text = this.chatPopoverInput.value.trim();
    if (!text || !this.onlineChannel || !this.roomInfo) return;

    const msg: ChatMessage = {
      type: 'chat',
      ts: Date.now(),
      senderNickname: this.roomInfo.myNickname,
      text,
    };
    this.onlineChannel.send({ type: 'chat', senderNickname: msg.senderNickname, text: msg.text });
    this.showMyBubble(msg.text);
    this.chatPopover.hidden = true;
    this.chatPopoverEmojis.hidden = true;
    this.chatPopoverInput.value = '';
  }

  private myChatTrigger(): HTMLElement {
    if (!this.roomInfo) return this.chatTriggerP1;
    return this.roomInfo.isHost ? this.chatTriggerP1 : this.chatTriggerP2;
  }

  private opponentNameEl(): HTMLElement {
    if (!this.roomInfo) return document.querySelector<HTMLElement>('#player-two-name')!;
    return document.querySelector<HTMLElement>(
      this.roomInfo.isHost ? '#player-two-name' : '#player-one-name'
    )!;
  }

  private showMyBubble(text: string): void {
    if (this.chatMyBubbleTimer) {
      clearTimeout(this.chatMyBubbleTimer);
    }
    this.chatMyBubbleSender.textContent = '我:';
    this.chatMyBubbleText.textContent = text;
    this.chatMyBubble.hidden = false;
    this.anchorElementTo(this.chatMyBubble, this.myChatTrigger());
    this.chatMyBubbleTimer = setTimeout(() => {
      this.chatMyBubble.hidden = true;
      this.chatMyBubbleTimer = null;
    }, 8000);
  }

  private showOpponentBubble(sender: string, text: string): void {
    if (this.chatOpponentBubbleTimer) {
      clearTimeout(this.chatOpponentBubbleTimer);
    }
    this.chatOpponentBubbleSender.textContent = sender + ':';
    this.chatOpponentBubbleText.textContent = text;
    this.chatOpponentBubble.hidden = false;
    this.anchorElementTo(this.chatOpponentBubble, this.opponentNameEl());
    this.chatOpponentBubbleTimer = setTimeout(() => {
      this.chatOpponentBubble.hidden = true;
      this.chatOpponentBubbleTimer = null;
    }, 8000);
  }
}
