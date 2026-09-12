import './monitoring';
import Phaser from 'phaser';
import { validatePasswordChange } from './accountSettings';
import { gameAudio, type GameSound } from './audioDirector';
import {
  DEFAULT_AUDIO_PREFERENCES,
  readAudioPreferences,
  writeAudioPreferences,
  type AudioPreferences,
} from './audioPreferences';
import { PoolScene } from './game/PoolScene';
import { type GameRuleset } from './game/gameRules';
import { normalizeAIDifficulty, type AIDifficulty } from './game/ai/difficulty';
import { getCopy, type Language } from './game/i18n';
import { bindGamePowerLifecycle } from './game/lifecycle';
import { applyPerformanceProfileToConfig, createBrowserPerformanceProfile } from './game/performance';
import { supabase } from './lib/supabase';
import { initAuthPage, showAuthPage, hideAuthPage } from './auth/authPage';
import { initMatchmaking, openMatchModal } from './online/matchmaking';
import type { RoomInfo } from './online/types';
import { CHALLENGE_LEVELS } from './game/challenge/levels';
import { isLevelUnlocked, readProgressSupabase, type ChallengeProgress } from './game/challenge/progress';
import {
  ALL_STARS_COIN_REWARD,
  claimChallengeReward,
  getChallengeRewardStatus,
  getUnownedRareCues,
  type ChallengeRewardResult,
} from './game/challenge/reward';
import { summarizeChallengeStars } from './game/growth/challengeSummary';
import { readDailyTaskStateSupabase, readPlayerStatsSupabase, writeDailyTaskStateSupabase } from './game/growth/persistence';
import { getRankProgress, summarizeStats, type PlayerStats } from './game/growth/stats';
import { DAILY_TASKS, completeDailyTask, summarizeDailyTasks, type DailyTaskState } from './game/growth/tasks';
import {
  CUE_CATALOG,
  DEFAULT_PLAYER_WALLET,
  buyCue,
  equipCue,
  getCueDurability,
  readPlayerWalletSupabase,
  repairCue,
  writePlayerWallet,
  writePlayerWalletSupabase,
  type PlayerWallet,
  type StorageAdapter,
} from './game/economy';
import {
  CHECK_IN_CYCLE_LENGTH,
  DAILY_CHECK_IN_REWARD,
  MATCHES_PER_MAKEUP_CARD,
  MAX_CYCLE_MAKEUPS,
  applyDailyCheckIn,
  applyMakeupCheckIn,
  getCheckInClaimKey,
  getCheckInMilestones,
  getSequentialCheckInState,
  openCheckInChest,
  type CheckInMilestone,
  type CheckInRarity,
} from './game/checkIn';
import {
  createRechargeOrder,
  fetchRechargePackages,
  fetchRecentRechargeOrders,
  formatCny,
  mockPayRechargeOrder,
  selectDefaultRechargePackage,
  type CreatedRechargeOrder,
  type RechargeOrder,
  type RechargePackage,
  type SupabaseRechargeClient,
} from './game/recharge';
import {
  createModeSelectionState,
  selectGameMode,
  selectRuleset,
  type MenuGameMode,
  type ModeSelectionState,
} from './menuFlow';
import { showGameShellForNewGame } from './gameShellVisibility';
import { installSplashCursor } from './splashCursor';
import { closeCuePreview, isCuePreviewEscape, openCuePreview, type CuePreviewState } from './cuePreview';
import { createCueCollection, getCueRarityLabel } from './game/cueShopView';
import {
  formatRecentMatchSummary,
  formatShotHistoryEntry,
  readStoredAimControlSettings,
  resolveHistorySelectionIndex,
  showChallengeSelectLoadingState,
} from './menuShell';
import {
  DEFAULT_AVATARS,
  createDefaultAvatarSelection,
  readStoredAvatarSelection,
  resolveAvatarSrc,
  writeStoredAvatarSelection,
  type AvatarSelection,
  type DefaultAvatarId,
} from './player/avatar';
import {
  AVATAR_OUTPUT_SIZE,
  createInitialCropState,
  moveCrop,
  resolveCropSourceRect,
  updateCropZoom,
  type CropState,
} from './player/avatarCrop';
import {
  readProfileAvatarSelection,
  uploadProfileAvatar,
  writeProfileAvatarSelection,
  type AvatarUploadFailureReason,
} from './player/avatarPersistence';
import './styles.css';

type GameMode = 'pvp' | 'ai' | 'challenge' | 'online';

let currentGame: Phaser.Game | null = null;
let currentGameLifecycleDispose: (() => void) | null = null;
let guestMode = false;
let currentProfileName = '游客玩家';
let currentWallet: PlayerWallet = DEFAULT_PLAYER_WALLET;
let currentStats: PlayerStats = {
  totalGames: 0,
  wins: 0,
  losses: 0,
  currentStreak: 0,
  bestStreak: 0,
  clearances: 0,
  totalStrokes: 0,
  bestSingleGameStrokes: null,
  rankPoints: 1000,
  recentMatches: [],
};
let walletSaveQueue: Promise<void> = Promise.resolve();
let rechargePackages: RechargePackage[] = [];
let rechargeOrders: RechargeOrder[] = [];
let selectedRechargePackageId: string | null = null;
let pendingRechargeOrder: CreatedRechargeOrder | null = null;
let rechargeBusy = false;
let modeSelectionState: ModeSelectionState = createModeSelectionState();
let selectedHistoryIndex: number | null = null;
let challengeSelectRequestId = 0;
let currentChallengeProgress: ChallengeProgress | null = null;
let challengeRewardClaimBusy = false;
let currentAvatarSelection: AvatarSelection = createDefaultAvatarSelection();
let pendingAvatarSelection: AvatarSelection = currentAvatarSelection;
let cropState: CropState | null = null;
let cropImageElement: HTMLImageElement | null = null;
let cropSourceImage: HTMLImageElement | null = null;
let cropObjectUrl: string | null = null;
let cropDragStart: { x: number; y: number; state: CropState } | null = null;
let cuePreviewState: CuePreviewState = closeCuePreview();
let cuePreviewPreviousOverflow = '';
let cuePreviewReturnFocus: HTMLElement | null = null;
let selectedCheckInDay: number | null = null;
let pendingCheckInMilestone: CheckInMilestone | null = null;
let checkInOpening = false;
let audioPreferences: AudioPreferences = { ...DEFAULT_AUDIO_PREFERENCES };

const shellLanguage: Language = 'zh';

const rechargeClient = supabase as unknown as SupabaseRechargeClient;
let disposeSplashCursor: (() => void) | null = null;

function showMenuSplashCursor(): void {
  if (disposeSplashCursor) return;
  disposeSplashCursor = installSplashCursor({
    DENSITY_DISSIPATION: 5,
    VELOCITY_DISSIPATION: 1,
    PRESSURE: 0.15,
    CURL: 9,
    SPLAT_RADIUS: 0.09,
    SPLAT_FORCE: 3000,
    COLOR_UPDATE_SPEED: 2,
    RAINBOW_MODE: true,
    COLOR: '#24484d',
  });
}

function hideMenuSplashCursor(): void {
  disposeSplashCursor?.();
  disposeSplashCursor = null;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    hideMenuSplashCursor();
    gameAudio.dispose();
  });
}

function selectedAIDifficulty(): AIDifficulty {
  const selected = document.querySelector<HTMLInputElement>('input[name="ai-difficulty"]:checked');
  return normalizeAIDifficulty(selected?.value, 'normal');
}

function startGame(
  mode: GameMode,
  roomInfo?: RoomInfo,
  ruleset: GameRuleset = roomInfo?.ruleset ?? 'eight-ball',
  challengeLevelId?: number,
): void {
  hideMenuSplashCursor();
  gameAudio.setScene('game');
  showGameShellForNewGame();
  hideEconomyPanels();

  const baseConfig: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: 'game',
    width: 1100,
    height: 640,
    transparent: true,
    backgroundColor: '#10100e',
    audio: { noAudio: true },
    scene: [PoolScene],
    physics: {
      default: 'matter',
      matter: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    callbacks: {
      preBoot: (game) => {
        game.registry.set('initialMode', mode);
        game.registry.set('gameRuleset', ruleset);
        game.registry.set('aimControlSettings', readStoredAimControlSettings(browserStorage()));
        if (challengeLevelId !== undefined) game.registry.set('challengeLevelId', challengeLevelId);
        if (mode === 'ai') game.registry.set('aiDifficulty', selectedAIDifficulty());
        if (roomInfo) game.registry.set('roomInfo', roomInfo);
      },
    },
  };
  const config = applyPerformanceProfileToConfig(baseConfig, createBrowserPerformanceProfile());

  currentGame = new Phaser.Game(config);
  currentGameLifecycleDispose = bindGamePowerLifecycle(currentGame, {
    isUserPaused: () => document.getElementById('pause-overlay')?.hidden === false,
  });
}

function backToMenu(): void {
  if (currentGame) {
    currentGameLifecycleDispose?.();
    currentGameLifecycleDispose = null;
    // Phaser completes destruction on its next frame. The game loop may be
    // sleeping after a browser blur or visibility change, so wake it before
    // hiding the shell to guarantee Scene shutdown and Three.js disposal.
    currentGame.loop.wake();
    currentGame.scene.stop('PoolScene');
    currentGame.destroy(true);
    currentGame = null;
  }
  const menu = document.getElementById('main-menu');
  const shell = document.querySelector<HTMLElement>('.game-shell');
  const pauseOverlay = document.getElementById('pause-overlay');
  const challengeSelect = document.getElementById('challenge-select');
  if (menu) menu.hidden = false;
  if (shell) shell.hidden = true;
  if (pauseOverlay) pauseOverlay.hidden = true;
  if (challengeSelect) challengeSelect.hidden = true;
  gameAudio.setScene('menu');
  showMenuSplashCursor();
  void loadGrowthOverview();
}

function requestBackToMenu(): void {
  const scene = currentGame?.scene.getScene('PoolScene') as PoolScene | undefined;
  const isOnlineMatch = currentGame?.registry.get('initialMode') === 'online';
  if (isOnlineMatch) {
    const confirmed = window.confirm('返回主菜单将视为认输，确定要返回吗？');
    if (!confirmed) {
      return;
    }
    scene?.forfeitOnlineMatchToMenu();
  }
  backToMenu();
}

function showRulesetMenu(mode: MenuGameMode): void {
  modeSelectionState = selectGameMode(modeSelectionState, mode);
  const selector = document.getElementById('ruleset-menu');
  const title = document.getElementById('ruleset-title');
  const hint = document.getElementById('ruleset-hint');
  if (title) {
    title.textContent = mode === 'online' ? '联网对战' : mode === 'ai' ? '人机对战' : '自我练习';
  }
  if (hint) {
    hint.textContent = mode === 'online' ? '选择玩法后进入匹配菜单' : '选择玩法后开始对局';
  }
  if (selector) selector.hidden = false;
}

function hideRulesetMenu(): void {
  const selector = document.getElementById('ruleset-menu');
  if (selector) selector.hidden = true;
}

function handleRulesetSelection(ruleset: GameRuleset): void {
  const pendingMode = modeSelectionState.pendingMode;
  const result = selectRuleset(modeSelectionState, ruleset);
  modeSelectionState = result;
  hideRulesetMenu();

  if (result.start) {
    startGame(result.start.mode, undefined, result.start.ruleset);
    return;
  }

  if (pendingMode === 'online') {
    openMatchModal(ruleset);
  }
}

async function showChallengeSelect(): Promise<void> {
  modeSelectionState = selectGameMode(modeSelectionState, 'challenge');
  hideRulesetMenu();
  hideEconomyPanels();

  const menu = document.getElementById('main-menu');
  const shell = document.querySelector<HTMLElement>('.game-shell');
  const overlay = document.getElementById('challenge-select');
  const title = document.getElementById('challenge-title');
  const grid = document.getElementById('challenge-grid');
  const backBtn = document.getElementById('challenge-back');
  if (!overlay || !grid) return;

  if (menu) menu.hidden = true;
  if (shell) shell.hidden = true;
  const requestId = ++challengeSelectRequestId;
  showChallengeSelectLoadingState({ overlay, grid, title, backBtn });

  const [progress, wallet] = await Promise.all([
    readProgressSupabase(supabase),
    readPlayerWalletSupabase(supabase),
  ]);
  if (requestId !== challengeSelectRequestId || overlay.hidden) return;
  currentChallengeProgress = progress;
  currentWallet = wallet;

  grid.replaceChildren(...CHALLENGE_LEVELS.map((level) => {
    const unlocked = isLevelUnlocked(progress, level.id);
    const result = progress.levels[String(level.id)];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `challenge-card${unlocked ? '' : ' is-locked'}`;
    card.disabled = !unlocked;

    const number = document.createElement('div');
    number.className = 'challenge-card-number';
    number.textContent = String(level.id);

    const name = document.createElement('div');
    name.className = 'challenge-card-name';
    name.textContent = level.name.zh;

    const stars = document.createElement('div');
    stars.className = 'challenge-card-stars';
    if (result) {
      stars.innerHTML = Array.from({ length: 3 }, (_, i) =>
        `<span class="${i < result.stars ? 'star-gold' : 'star-gray'}">★</span>`,
      ).join('');
    } else if (!unlocked) {
      stars.textContent = '🔒';
    }

    card.append(number, name, stars);
    if (unlocked) {
      card.addEventListener('click', () => startChallengeLevel(level.id));
    }
    return card;
  }));
  renderChallengeRewardPanel(progress, currentWallet);
  overlay.hidden = false;
}

function hideChallengeSelect(): void {
  challengeSelectRequestId += 1;
  const overlay = document.getElementById('challenge-select');
  if (overlay) overlay.hidden = true;
  hideChallengeRewardModal();
}

async function refreshChallengeRewardPanel(): Promise<void> {
  const scene = currentGame?.scene.getScene('PoolScene') as PoolScene | undefined;
  if (scene) {
    const context = await scene.getChallengeRewardContext();
    currentChallengeProgress = context.progress;
    currentWallet = context.wallet;
  } else if (!currentChallengeProgress) {
    [currentChallengeProgress, currentWallet] = await Promise.all([
      readProgressSupabase(supabase),
      readPlayerWalletSupabase(supabase),
    ]);
  }
  if (currentChallengeProgress) {
    renderChallengeRewardPanel(currentChallengeProgress, currentWallet);
  }
}

function renderChallengeRewardPanel(progress: ChallengeProgress, wallet: PlayerWallet): void {
  const card = document.getElementById('challenge-reward-card');
  const detail = document.getElementById('challenge-reward-detail');
  const action = document.querySelector<HTMLButtonElement>('#challenge-reward-open');
  if (!card || !detail || !action) return;

  const summary = summarizeChallengeStars(progress, CHALLENGE_LEVELS);
  const status = getChallengeRewardStatus(progress, CHALLENGE_LEVELS, wallet);
  card.dataset.status = status;
  card.hidden = false;
  if (status === 'claimed') {
    detail.textContent = '满星宝箱已领取';
    action.textContent = '已领取';
    action.disabled = true;
    return;
  }
  if (status === 'locked') {
    detail.textContent = `集齐全部 ${summary.totalStars} 颗星即可开启 · 当前 ${summary.earnedStars}/${summary.totalStars}`;
    action.textContent = '尚未解锁';
    action.disabled = true;
    return;
  }

  detail.textContent = status === 'coins'
    ? `稀有球杆已全部拥有，开启后获得 ${ALL_STARS_COIN_REWARD} 金币`
    : `从 ${getUnownedRareCues(wallet).length} 支未拥有的稀有球杆中任选 1 支`;
  action.textContent = '开启宝箱';
  action.disabled = false;
}

async function showChallengeRewardModal(): Promise<void> {
  await refreshChallengeRewardPanel();
  if (!currentChallengeProgress) return;
  const overlay = document.getElementById('challenge-reward-modal');
  const options = document.getElementById('challenge-reward-options');
  const hint = document.getElementById('challenge-reward-hint');
  if (!overlay || !options || !hint) return;

  const status = getChallengeRewardStatus(currentChallengeProgress, CHALLENGE_LEVELS, currentWallet);
  if (status === 'locked' || status === 'claimed') return;
  options.replaceChildren();
  if (status === 'coins') {
    hint.textContent = `你的稀有球杆已集齐，本次宝箱将发放 ${ALL_STARS_COIN_REWARD} 金币。`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'challenge-reward-coin-action';
    button.dataset.rewardAction = 'claim-coins';
    button.textContent = `领取 ${ALL_STARS_COIN_REWARD} 金币`;
    options.append(button);
  } else {
    hint.textContent = '请选择一支尚未拥有的稀有球杆，确认后不可更换。';
    options.replaceChildren(...getUnownedRareCues(currentWallet).map((cue) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'challenge-reward-cue';
      button.dataset.rewardAction = 'claim-cue';
      button.dataset.cueId = cue.id;
      const image = document.createElement('img');
      image.src = cue.assetPath;
      image.alt = cue.name;
      const name = document.createElement('strong');
      name.textContent = cue.name;
      const stats = document.createElement('span');
      stats.textContent = `力量 ${cue.power} · 准度 ${cue.accuracy} · 加塞 ${cue.spin}`;
      button.append(image, name, stats);
      return button;
    }));
  }
  overlay.hidden = false;
}

function hideChallengeRewardModal(): void {
  const overlay = document.getElementById('challenge-reward-modal');
  if (overlay) overlay.hidden = true;
}

async function claimSelectedChallengeReward(cueId?: string): Promise<void> {
  if (!currentChallengeProgress || challengeRewardClaimBusy) return;
  challengeRewardClaimBusy = true;
  const buttons = document.querySelectorAll<HTMLButtonElement>('#challenge-reward-options button');
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const scene = currentGame?.scene.getScene('PoolScene') as PoolScene | undefined;
    const result = scene
      ? await scene.claimAllStarsReward(cueId)
      : claimChallengeReward(currentChallengeProgress, CHALLENGE_LEVELS, currentWallet, cueId);
    if (result.claimed && !scene) {
      saveMenuWallet(result.wallet);
    } else if (result.claimed) {
      currentWallet = result.wallet;
    }
    renderChallengeRewardReceipt(result);
    renderChallengeRewardPanel(currentChallengeProgress, currentWallet);
  } finally {
    challengeRewardClaimBusy = false;
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function renderChallengeRewardReceipt(result: ChallengeRewardResult): void {
  if (!result.claimed) return;
  const options = document.getElementById('challenge-reward-options');
  const hint = document.getElementById('challenge-reward-hint');
  if (!options || !hint) return;
  hint.textContent = result.cue
    ? `已获得稀有球杆「${result.cue.name}」，可前往球杆收藏装备。`
    : `已获得 ${result.coinsAwarded} 金币。`;
  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'challenge-reward-coin-action';
  done.dataset.rewardAction = 'close';
  done.textContent = '收下奖励';
  options.replaceChildren(done);
}

function returnFromChallengeSelect(): void {
  if (currentGame) return;
  hideChallengeSelect();
  const menu = document.getElementById('main-menu');
  if (menu) menu.hidden = false;
  void loadGrowthOverview();
}

function startChallengeLevel(levelId: number): void {
  hideChallengeSelect();
  startGame('challenge', undefined, 'eight-ball', levelId);
}

document.querySelectorAll<HTMLButtonElement>('.menu-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode as GameMode;
    if (mode === 'ai' || mode === 'pvp' || mode === 'online') {
      showRulesetMenu(mode);
      return;
    }
    void showChallengeSelect();
  });
});

document.querySelectorAll<HTMLButtonElement>('[data-ruleset]').forEach((btn) => {
  btn.addEventListener('click', () => {
    handleRulesetSelection(btn.dataset.ruleset === 'nine-ball' ? 'nine-ball' : 'eight-ball');
  });
});

document.getElementById('ruleset-back')?.addEventListener('click', hideRulesetMenu);
document.getElementById('challenge-back')?.addEventListener('click', returnFromChallengeSelect);
document.getElementById('challenge-reward-open')?.addEventListener('click', () => void showChallengeRewardModal());
document.getElementById('challenge-reward-close')?.addEventListener('click', hideChallengeRewardModal);
document.getElementById('challenge-reward-options')?.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-reward-action]');
  if (!button) return;
  if (button.dataset.rewardAction === 'close') {
    hideChallengeRewardModal();
    return;
  }
  void claimSelectedChallengeReward(button.dataset.cueId);
});
window.addEventListener('pool:challenge-select-ready', () => void refreshChallengeRewardPanel());

document.getElementById('btn-back')?.addEventListener('click', requestBackToMenu);
window.addEventListener('pool:return-to-menu', backToMenu);

document.getElementById('btn-pause')?.addEventListener('click', () => {
  const pauseOverlay = document.getElementById('pause-overlay');
  if (pauseOverlay) {
    pauseOverlay.hidden = false;
    if (currentGame) {
      currentGame.scene.getScene('PoolScene')?.scene.pause();
      currentGame.pause();
    }
  }
});

document.getElementById('pause-resume')?.addEventListener('click', () => {
  const pauseOverlay = document.getElementById('pause-overlay');
  if (pauseOverlay) {
    pauseOverlay.hidden = true;
    if (currentGame) {
      currentGame.resume();
      currentGame.scene.getScene('PoolScene')?.scene.resume();
    }
  }
});

document.getElementById('btn-aim')?.addEventListener('click', () => {
  const btn = document.getElementById('btn-aim');
  if (!btn) return;
  const isActive = btn.classList.toggle('is-active');
  if (currentGame) {
    currentGame.registry.set('aimLineEnabled', isActive);
  }
});

function localDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function loadUserProfile(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    currentProfileName = '游客玩家';
    currentAvatarSelection = readStoredAvatarSelection(browserStorage());
    renderAvatarSelection(currentAvatarSelection);
    renderProfileSummary(null, null, true);
    await loadGrowthOverview();
    return;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('nickname, wins, losses')
    .eq('id', user.id)
    .single();

  if (profile) {
    currentProfileName = profile.nickname;
    const infoEl = document.getElementById('user-info');
    if (infoEl) {
      const total = profile.wins + profile.losses;
      const winRate = total > 0 ? Math.round((profile.wins / total) * 100) : 0;
      infoEl.textContent = `${profile.nickname} | ${profile.wins}胜 ${profile.losses}负 (${winRate}%)`;
      infoEl.hidden = false;
    }
  }
  const remoteAvatar = await readProfileAvatarSelection(supabase);
  currentAvatarSelection = remoteAvatar ?? readStoredAvatarSelection(browserStorage());
  renderAvatarSelection(currentAvatarSelection);
  await loadGrowthOverview();
}

async function loadGrowthOverview(): Promise<void> {
  const dateKey = localDateKey();
  const [stats, tasks, progress, wallet] = await Promise.all([
    readPlayerStatsSupabase(supabase),
    readDailyTaskStateSupabase(supabase, dateKey),
    readProgressSupabase(supabase),
    readPlayerWalletSupabase(supabase),
  ]);
  renderGrowthOverview(stats, tasks, summarizeChallengeStars(progress, CHALLENGE_LEVELS), wallet);
}

function renderProfileSummary(stats: PlayerStats | null, tasks: DailyTaskState | null, isGuest: boolean): void {
  const infoEl = document.getElementById('user-info');
  if (!infoEl) return;
  if (!stats || !tasks) {
    infoEl.textContent = isGuest ? '游客玩家 | 本地存档' : currentProfileName;
    infoEl.hidden = false;
    return;
  }

  const summary = summarizeStats(stats);
  infoEl.textContent = `${currentProfileName} | ${summary.wins}胜 ${summary.losses}负 (${summary.winRate}%)`;
  infoEl.hidden = false;
}

function renderAvatarSelection(selection: AvatarSelection): void {
  currentAvatarSelection = selection;
  const src = resolveAvatarSrc(selection);
  const menuAvatar = document.getElementById('menu-avatar') as HTMLImageElement | null;
  const profilePreview = document.getElementById('profile-avatar-preview') as HTMLImageElement | null;
  if (menuAvatar) menuAvatar.src = src;
  if (profilePreview) profilePreview.src = src;
}

function renderProfileAvatarPreview(selection: AvatarSelection): void {
  const src = resolveAvatarSrc(selection);
  const profilePreview = document.getElementById('profile-avatar-preview') as HTMLImageElement | null;
  if (profilePreview) profilePreview.src = src;
}

function renderProfilePanel(): void {
  pendingAvatarSelection = currentAvatarSelection;
  const name = document.getElementById('profile-name');
  const record = document.getElementById('profile-record');
  if (name) name.textContent = currentProfileName;
  if (record) {
    const summary = summarizeStats(currentStats);
    record.textContent = guestMode
      ? '游客玩家 | 本地存档'
      : `${summary.wins}胜 ${summary.losses}负 (${summary.winRate}%)`;
  }
  renderProfileAvatarGrid();
  renderProfileAvatarPreview(pendingAvatarSelection);
  setProfileFeedback('');
}

function renderProfileAvatarGrid(): void {
  const grid = document.getElementById('profile-avatar-grid');
  if (!grid) return;
  grid.replaceChildren(...DEFAULT_AVATARS.map((avatar) => {
    const isSelected = pendingAvatarSelection.kind === 'default' && pendingAvatarSelection.id === avatar.id;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `profile-avatar-option${isSelected ? ' is-selected' : ''}`;
    button.dataset.avatarId = avatar.id;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(isSelected));

    const img = document.createElement('img');
    img.src = avatar.src;
    img.alt = avatar.label;
    button.append(img);
    return button;
  }));
}

function setProfileFeedback(message: string): void {
  const feedback = document.getElementById('profile-feedback');
  if (feedback) feedback.textContent = message;
}

function showProfilePanel(): void {
  renderProfilePanel();
  const panel = document.getElementById('profile-panel');
  if (panel) panel.hidden = false;
}

function hideProfilePanel(): void {
  const panel = document.getElementById('profile-panel');
  if (panel) panel.hidden = true;
  resetProfileCropper();
  renderAvatarSelection(currentAvatarSelection);
}

async function saveProfileAvatar(): Promise<void> {
  setProfileFeedback('正在保存头像...');
  const cropped = await saveCroppedAvatar();
  if (!cropped) {
    const feedback = document.getElementById('profile-feedback')?.textContent?.trim();
    if (!feedback) setProfileFeedback('头像生成失败。');
    return;
  }
  pendingAvatarSelection = cropped;

  if (guestMode) {
    currentAvatarSelection = writeStoredAvatarSelection(browserStorage(), pendingAvatarSelection);
    renderAvatarSelection(currentAvatarSelection);
    hideProfilePanel();
    return;
  }

  const saved = await writeProfileAvatarSelection(supabase, pendingAvatarSelection);
  if (!saved) {
    setProfileFeedback('头像保存失败，请稍后重试。');
    return;
  }
  currentAvatarSelection = pendingAvatarSelection;
  writeStoredAvatarSelection(browserStorage(), currentAvatarSelection);
  renderAvatarSelection(currentAvatarSelection);
  hideProfilePanel();
}

function resetProfileCropper(): void {
  cropState = null;
  cropImageElement = null;
  cropSourceImage = null;
  cropDragStart = null;
  if (cropObjectUrl) {
    URL.revokeObjectURL(cropObjectUrl);
    cropObjectUrl = null;
  }
  const cropper = document.getElementById('profile-cropper');
  if (cropper) cropper.hidden = true;
}

async function handleProfileUpload(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) {
    setProfileFeedback('请选择图片文件。');
    return;
  }

  const image = new Image();
  const url = URL.createObjectURL(file);
  let shouldRevokeUrl = true;
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('decode failed'));
      image.src = url;
    });
    resetProfileCropper();
    cropObjectUrl = url;
    cropSourceImage = image;
    cropState = createInitialCropState({ width: image.naturalWidth, height: image.naturalHeight }, 320);
    cropImageElement = document.getElementById('profile-crop-image') as HTMLImageElement | null;
    if (cropImageElement) cropImageElement.src = url;
    const cropper = document.getElementById('profile-cropper');
    if (cropper) cropper.hidden = false;
    updateCropperDom();
    setProfileFeedback('');
    shouldRevokeUrl = false;
  } catch {
    setProfileFeedback('图片读取失败，请换一张再试。');
  } finally {
    if (shouldRevokeUrl) URL.revokeObjectURL(url);
  }
}

function updateCropperDom(): void {
  if (!cropState || !cropImageElement) return;
  cropImageElement.style.width = `${cropState.imageWidth * cropState.zoom}px`;
  cropImageElement.style.height = `${cropState.imageHeight * cropState.zoom}px`;
  cropImageElement.style.transform = `translate(calc(-50% + ${cropState.offsetX}px), calc(-50% + ${cropState.offsetY}px))`;
  const zoom = document.getElementById('profile-crop-zoom') as HTMLInputElement | null;
  if (zoom) {
    zoom.min = String(Math.max(320 / cropState.imageWidth, 320 / cropState.imageHeight));
    zoom.value = String(cropState.zoom);
  }
}

async function saveCroppedAvatar(): Promise<AvatarSelection | null> {
  if (!cropState || !cropSourceImage) return pendingAvatarSelection;
  const rect = resolveCropSourceRect(cropState);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_OUTPUT_SIZE;
  canvas.height = AVATAR_OUTPUT_SIZE;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(
    cropSourceImage,
    rect.sx,
    rect.sy,
    rect.sw,
    rect.sh,
    0,
    0,
    AVATAR_OUTPUT_SIZE,
    AVATAR_OUTPUT_SIZE,
  );

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', 0.9);
  });
  if (!blob) return null;

  if (guestMode) {
    const dataUrl = canvas.toDataURL('image/webp', 0.9);
    return { kind: 'uploaded', url: dataUrl };
  }

  const uploadedUrl = await uploadProfileAvatar(supabase, blob);
  if (!uploadedUrl.ok) {
    setProfileFeedback(avatarUploadFailureMessage(uploadedUrl.reason));
    return null;
  }
  return { kind: 'uploaded', url: uploadedUrl.url };
}

function avatarUploadFailureMessage(reason: AvatarUploadFailureReason): string {
  if (reason === 'storage-unavailable') {
    return '头像存储尚未配置，请先选择默认头像。';
  }
  if (reason === 'not-signed-in') {
    return '请先登录后再上传头像。';
  }
  return '头像上传失败，请稍后重试。';
}

function renderGrowthOverview(
  stats: PlayerStats,
  tasks: DailyTaskState,
  challengeSummary: ReturnType<typeof summarizeChallengeStars>,
  wallet: PlayerWallet,
): void {
  currentStats = stats;
  renderProfileSummary(stats, tasks, guestMode);
  currentWallet = wallet;
  renderMenuEconomy();
  const summary = summarizeStats(stats);
  const rank = getRankProgress(stats.rankPoints);
  const taskSummary = summarizeDailyTasks(tasks);

  setText('menu-growth-rank', `${rank.rankName} · ${rank.points} 分`);
  setText('menu-growth-rank-gap', rank.pointsToNext > 0 ? `下一段还差 ${rank.pointsToNext} 分` : '已达最高段位');
  setStyle('menu-growth-rank-fill', '--growth-rank-progress', `${rank.progressPercent}%`);
  setText('menu-growth-record', `${summary.totalGames} 局 · ${summary.wins}胜${summary.losses}负 · 胜率 ${summary.winRate}%`);
  setText('menu-growth-streak', `连胜 ${summary.currentStreak} · 最佳 ${summary.bestStreak}`);
  setText('menu-growth-tasks', `每日任务 ${taskSummary.completed}/${taskSummary.total}`);
  setText('menu-growth-stars', `挑战 ${challengeSummary.earnedStars}/${challengeSummary.totalStars} 星`);

  setText('growth-detail-rank', rank.rankName);
  setText('growth-detail-points', `${rank.points} 分`);
  setText('growth-detail-next', rank.pointsToNext > 0 ? `下一段还差 ${rank.pointsToNext} 分` : '最高段位');
  setStyle('growth-detail-next', '--growth-rank-progress', `${rank.progressPercent}%`);
  setText('growth-stat-games', String(summary.totalGames));
  setText('growth-stat-coins', String(wallet.coins));
  setText('growth-stat-record', `${summary.wins}胜 ${summary.losses}负`);
  setText('growth-stat-winrate', `${summary.winRate}%`);
  setText('growth-stat-streak', `${summary.currentStreak} / ${summary.bestStreak}`);
  setText('growth-stat-clear', `${summary.clearRate}%`);
  setText('growth-stat-strokes', `${summary.averageStrokes}`);
  setText('growth-stat-best', summary.bestSingleGameStrokes === null ? '-' : String(summary.bestSingleGameStrokes));
  setText('growth-challenge-stars', `${challengeSummary.earnedStars}/${challengeSummary.totalStars}`);
  setText('growth-challenge-levels', `${challengeSummary.completedLevels}/${challengeSummary.totalLevels}`);

  renderTaskList(tasks);
  renderRecentMatches(stats);
  const historyPanel = document.getElementById('history-panel');
  if (historyPanel && !historyPanel.hidden) {
    renderHistoryPanel(stats);
  }
}

function renderTaskList(tasks: DailyTaskState): void {
  const list = document.getElementById('growth-task-list');
  if (!list) return;
  list.replaceChildren(...DAILY_TASKS.map((task) => {
    const status = tasks.tasks[task.id];
    const item = document.createElement('li');
    item.className = status.completed ? 'is-complete' : '';
    item.innerHTML = `<span>${task.title}</span><strong>${status.completed ? '已完成' : `+${task.rewardCoins} 金币`}</strong>`;
    return item;
  }));
}

function renderRecentMatches(stats: PlayerStats): void {
  const list = document.getElementById('growth-recent-list');
  if (!list) return;
  if (stats.recentMatches.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'growth-empty-row';
    empty.textContent = '还没有对局记录';
    list.replaceChildren(empty);
    return;
  }

  list.replaceChildren(...stats.recentMatches.slice(0, 6).map((match) => {
    const item = document.createElement('li');
    const time = new Date(match.playedAt);
    const date = Number.isNaN(time.getTime()) ? '' : `${time.getMonth() + 1}/${time.getDate()}`;
    item.innerHTML = `<span>${match.won ? '胜' : '负'} · ${match.opponentName}</span><strong>${match.strokes}杆 ${date}</strong>`;
    return item;
  }));
}

function showHistoryPanel(): void {
  const overlay = document.getElementById('history-panel');
  if (!overlay) return;
  overlay.hidden = false;
  renderHistoryPanel(currentStats);
  void loadGrowthOverview();
}

function hideHistoryPanel(): void {
  const overlay = document.getElementById('history-panel');
  if (overlay) overlay.hidden = true;
}

function renderHistoryPanel(stats: PlayerStats): void {
  const list = document.getElementById('history-list');
  const detail = document.getElementById('history-detail');
  if (!list || !detail) return;

  const copy = getCopy(shellLanguage).shell;
  if (stats.recentMatches.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'history-empty-row';
    empty.textContent = copy.noHistory;
    list.replaceChildren(empty);
    detail.hidden = true;
    selectedHistoryIndex = null;
    return;
  }

  selectedHistoryIndex = resolveHistorySelectionIndex(stats.recentMatches, selectedHistoryIndex);

  list.replaceChildren(...stats.recentMatches.map((match, index) => createHistoryRow(match, index)));
  const selected = stats.recentMatches[selectedHistoryIndex ?? 0] ?? stats.recentMatches[0];
  renderHistoryDetail(selected);
}

function createHistoryRow(match: PlayerStats['recentMatches'][number], index: number): HTMLLIElement {
  const summary = formatRecentMatchSummary(match, shellLanguage);
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `history-row${index === selectedHistoryIndex ? ' is-selected' : ''}`;
  button.dataset.matchIndex = String(index);

  const title = document.createElement('strong');
  title.textContent = summary.title;
  const meta = document.createElement('span');
  meta.textContent = summary.meta;
  const detail = document.createElement('small');
  detail.textContent = summary.detail;

  button.append(title, meta, detail);
  item.append(button);
  return item;
}

function renderHistoryDetail(match: PlayerStats['recentMatches'][number]): void {
  const detail = document.getElementById('history-detail');
  if (!detail) return;

  const copy = getCopy(shellLanguage).shell;
  const summary = formatRecentMatchSummary(match, shellLanguage);
  const title = document.createElement('h3');
  title.textContent = summary.title;
  const meta = document.createElement('p');
  meta.className = 'history-detail-meta';
  meta.textContent = `${summary.meta} · ${summary.detail}`;

  if (!match.shotHistory || match.shotHistory.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'history-detail-empty';
    empty.textContent = copy.noShotHistory;
    detail.replaceChildren(title, meta, empty);
    detail.hidden = false;
    return;
  }

  const heading = document.createElement('h4');
  heading.textContent = copy.shotHistory;
  const shots = document.createElement('ol');
  shots.className = 'history-shot-list';
  shots.replaceChildren(...match.shotHistory.map((entry) => {
    const item = document.createElement('li');
    item.textContent = formatShotHistoryEntry(entry, shellLanguage);
    if (entry.message) {
      const message = document.createElement('small');
      message.textContent = entry.message;
      item.append(message);
    }
    return item;
  }));

  detail.replaceChildren(title, meta, heading, shots);
  detail.hidden = false;
}

function selectHistoryMatch(index: number): void {
  selectedHistoryIndex = index;
  renderHistoryPanel(currentStats);
}

function showSettingsPanel(): void {
  renderSettingsPanel();
  const overlay = document.getElementById('settings-panel');
  if (overlay) overlay.hidden = false;
  hideMenuSplashCursor();
  void renderSettingsAccount();
}

function hideSettingsPanel(): void {
  const overlay = document.getElementById('settings-panel');
  if (overlay) overlay.hidden = true;
  const passwordForm = document.getElementById('settings-password-form') as HTMLFormElement | null;
  passwordForm?.reset();
  setSettingsFeedback('');
  const menu = document.getElementById('main-menu');
  if (!currentGame && menu && !menu.hidden) showMenuSplashCursor();
}

function renderSettingsPanel(): void {
  setText('settings-controls-note', getCopy(shellLanguage).shell.smoothAimNote);
  renderAudioPreferences();
}

function renderAudioPreferences(): void {
  const musicInput = document.getElementById('settings-music-volume') as HTMLInputElement | null;
  const soundInput = document.getElementById('settings-sound-volume') as HTMLInputElement | null;
  if (musicInput) {
    musicInput.value = String(audioPreferences.musicVolume);
    musicInput.style.setProperty('--range-progress', `${audioPreferences.musicVolume}%`);
  }
  if (soundInput) {
    soundInput.value = String(audioPreferences.soundVolume);
    soundInput.style.setProperty('--range-progress', `${audioPreferences.soundVolume}%`);
  }
  setText('settings-music-value', volumeLabel(audioPreferences.musicVolume));
  setText('settings-sound-value', volumeLabel(audioPreferences.soundVolume));
}

function updateAudioPreferencesFromControls(): void {
  const musicInput = document.getElementById('settings-music-volume') as HTMLInputElement | null;
  const soundInput = document.getElementById('settings-sound-volume') as HTMLInputElement | null;
  audioPreferences = writeAudioPreferences(browserStorage(), {
    musicVolume: Number(musicInput?.value ?? audioPreferences.musicVolume),
    soundVolume: Number(soundInput?.value ?? audioPreferences.soundVolume),
  });
  gameAudio.setPreferences(audioPreferences);
  renderAudioPreferences();
}

function volumeLabel(volume: number): string {
  return volume === 0 ? '静音' : `${volume}%`;
}

async function renderSettingsAccount(): Promise<void> {
  const passwordInputs = document.querySelectorAll<HTMLInputElement>('#settings-password-form input');
  const passwordButton = document.getElementById('settings-password-save') as HTMLButtonElement | null;

  if (guestMode) {
    setText('settings-account-email', '游客模式');
    setText('settings-account-note', '登录账号后可修改密码并同步游戏进度。');
    passwordInputs.forEach((input) => { input.disabled = true; });
    if (passwordButton) passwordButton.disabled = true;
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();
  setText('settings-account-email', user?.email ?? '已登录账号');
  setText('settings-account-note', '密码更新后，下次登录请使用新密码。');
  passwordInputs.forEach((input) => { input.disabled = !user; });
  if (passwordButton) passwordButton.disabled = !user;
}

async function updateAccountPassword(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const nextPassword = document.getElementById('settings-new-password') as HTMLInputElement | null;
  const confirmPassword = document.getElementById('settings-confirm-password') as HTMLInputElement | null;
  const submitButton = document.getElementById('settings-password-save') as HTMLButtonElement | null;
  const password = nextPassword?.value ?? '';
  const validation = validatePasswordChange(password, confirmPassword?.value ?? '');

  if (guestMode) {
    setSettingsFeedback('游客模式不能修改密码，请先登录账号。', 'error');
    gameAudio.play('warning');
    return;
  }
  if (!validation.valid) {
    setSettingsFeedback(validation.message, 'error');
    gameAudio.play('warning');
    if (validation.field === 'password') nextPassword?.focus();
    else confirmPassword?.focus();
    return;
  }

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = '正在更新…';
  }
  setSettingsFeedback('');
  const { error } = await supabase.auth.updateUser({ password });
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = '更新密码';
  }

  if (error) {
    setSettingsFeedback(`修改失败：${error.message}`, 'error');
    gameAudio.play('warning');
    return;
  }

  (event.currentTarget as HTMLFormElement).reset();
  setSettingsFeedback('密码已更新。', 'success');
  gameAudio.play('success');
}

function setSettingsFeedback(message: string, tone: 'neutral' | 'success' | 'error' = 'neutral'): void {
  const feedback = document.getElementById('settings-account-feedback');
  if (!feedback) return;
  feedback.textContent = message;
  feedback.dataset.tone = tone;
}

function installUiAudioFeedback(): void {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const control = target?.closest<HTMLElement>('button, [role="button"]');
    if (!control || control.getAttribute('aria-disabled') === 'true' || (control as HTMLButtonElement).disabled) return;
    gameAudio.play(resolveUiSound(control));
  });
}

function resolveUiSound(control: HTMLElement): GameSound {
  const requested = control.dataset.audioCue as GameSound | undefined;
  if (requested) return requested;

  const identity = `${control.id} ${control.className}`;
  if (/close|back|logout|cancel|challenge-menu|victory-menu/.test(identity)) return 'back';
  if (/menu-btn|ruleset-option|challenge-card|mm-option|package-card|cue-shop-card/.test(identity)) return 'select';
  return 'tap';
}

function applyShellCopy(): void {
  const copy = getCopy(shellLanguage).shell;
  setText('menu-secondary-title', copy.secondaryActions);
  setText('growth-panel-toggle', copy.progress);
  setText('history-open', copy.history);
  setText('settings-open', copy.settings);
  setText('recharge-open', copy.recharge);
  setText('cue-shop-open', copy.cueCollection);
  setText('history-title', copy.history);
  setText('settings-title', copy.settings);
  setText('settings-controls-title', copy.controls);
  setText('settings-controls-note', copy.smoothAimNote);
  document.getElementById('history-close')?.setAttribute('aria-label', copy.close);
  document.getElementById('settings-close')?.setAttribute('aria-label', copy.close);
}

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setStyle(id: string, property: string, value: string): void {
  const el = document.getElementById(id) as HTMLElement | null;
  el?.style.setProperty(property, value);
}

async function loadMenuWallet(): Promise<void> {
  currentWallet = await readPlayerWalletSupabase(supabase);
  renderMenuEconomy();
}

function saveMenuWallet(wallet: PlayerWallet): void {
  const storage = browserStorage();
  currentWallet = writePlayerWallet(storage, wallet);
  renderMenuEconomy();
  const walletToSave = currentWallet;
  walletSaveQueue = walletSaveQueue
    .catch(() => undefined)
    .then(async () => {
      currentWallet = await writePlayerWalletSupabase(supabase, walletToSave, storage);
      renderMenuEconomy();
    })
    .catch(() => undefined);
}

function browserStorage(): StorageAdapter {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Fall back to an in-memory no-op store when browser storage is unavailable.
  }

  return {
    getItem: () => null,
    setItem: () => undefined,
  };
}

function renderMenuEconomy(): void {
  setText('growth-stat-coins', String(currentWallet.coins));
  setText('coin-balance', `金币 ${currentWallet.coins}`);
  setText('cue-shop-balance', currentWallet.coins.toLocaleString('zh-CN'));
  setText('recharge-balance', `金币 ${currentWallet.coins}`);
  setText('cue-shop-open', getCopy(shellLanguage).shell.cueCollection);
  renderCheckInPanel();
  renderCueShop();
  renderRechargePanel();
}

const CHECK_IN_CHEST_ASSETS: Record<CheckInRarity, string> = {
  rare: '/assets/check-in/chest-rare.webp',
  epic: '/assets/check-in/chest-epic.webp',
  legendary: '/assets/check-in/chest-legendary.webp',
};

const CHECK_IN_RARITY_COPY: Record<CheckInRarity, { en: string; zh: string }> = {
  rare: { en: 'RARE', zh: '稀有' },
  epic: { en: 'EPIC', zh: '史诗' },
  legendary: { en: 'LEGENDARY', zh: '传说' },
};

async function showCheckInPanel(): Promise<void> {
  const overlay = document.getElementById('checkin-panel');
  if (!overlay) return;
  overlay.hidden = false;
  document.documentElement.classList.add('checkin-open');
  document.body.classList.add('checkin-open');
  selectedCheckInDay = null;
  closeCheckInRules();
  setCheckInFeedback('正在同步签到记录…');
  renderCheckInPanel();
  currentWallet = await readPlayerWalletSupabase(supabase);
  if (overlay.hidden) return;
  setCheckInFeedback('');
  renderMenuEconomy();
}

function hideCheckInPanel(): void {
  const overlay = document.getElementById('checkin-panel');
  if (overlay) overlay.hidden = true;
  document.documentElement.classList.remove('checkin-open');
  document.body.classList.remove('checkin-open');
  selectedCheckInDay = null;
  closeCheckInRules();
}

function renderCheckInPanel(): void {
  const calendar = document.getElementById('checkin-calendar');
  const milestones = document.getElementById('checkin-milestones');
  if (!calendar || !milestones) return;

  const todayKey = localDateKey();
  const state = getSequentialCheckInState(currentWallet);
  const milestoneDefinitions = getCheckInMilestones();
  const selectedDay = selectedCheckInDay && selectedCheckInDay >= 1 && selectedCheckInDay <= CHECK_IN_CYCLE_LENGTH
    ? selectedCheckInDay
    : state.progress >= CHECK_IN_CYCLE_LENGTH ? CHECK_IN_CYCLE_LENGTH : state.nextDay;
  selectedCheckInDay = selectedDay;

  setText('checkin-month-title', '每日');
  setText('checkin-month-label', `从第 1 天开始，每天推进 1 格 · 每格领取 ${DAILY_CHECK_IN_REWARD} 金币`);
  setText('checkin-cycle-label', `第 ${state.cycle} 轮`);
  setText('checkin-coin-balance', currentWallet.coins.toLocaleString('zh-CN'));
  setText('checkin-total', `${state.progress}/${CHECK_IN_CYCLE_LENGTH} 天`);
  setText('checkin-card-count', `${currentWallet.makeupCards} 张`);
  setText('checkin-match-progress', `${currentWallet.makeupMatchProgress}/${MATCHES_PER_MAKEUP_CARD} 局`);
  setText('checkin-makeup-count', `${state.makeupCount}/${MAX_CYCLE_MAKEUPS} 次`);
  const cycleMeter = document.getElementById('checkin-cycle-meter');
  if (cycleMeter) cycleMeter.style.width = `${(state.progress / CHECK_IN_CYCLE_LENGTH) * 100}%`;
  document.querySelectorAll<HTMLElement>('#checkin-match-lights i').forEach((light, index) => {
    light.classList.toggle('is-filled', index < currentWallet.makeupMatchProgress);
  });
  const hasDailyClaim = hasSequentialDailyCheckInToday(currentWallet, todayKey, state.cycle);
  const makeupReady = hasDailyClaim
    && currentWallet.makeupCards > 0
    && state.progress < CHECK_IN_CYCLE_LENGTH
    && currentWallet.lastMakeupDate !== todayKey
    && state.makeupCount < MAX_CYCLE_MAKEUPS;
  const canClaimNext = !hasDailyClaim || makeupReady;

  const calendarNodes: HTMLElement[] = [];
  for (let day = 1; day <= CHECK_IN_CYCLE_LENGTH; day += 1) {
    const isChecked = day <= state.progress;
    const isNext = state.progress < CHECK_IN_CYCLE_LENGTH && day === state.nextDay;
    const isFuture = day > state.nextDay && !isChecked;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = [
      'checkin-day',
      milestoneDefinitions.some((milestone) => milestone.days === day) ? 'is-milestone-day' : '',
      isChecked ? 'is-checked' : '',
      isNext ? 'is-today is-next' : '',
      isFuture ? 'is-future' : '',
      day === selectedDay ? 'is-selected' : '',
    ].filter(Boolean).join(' ');
    button.dataset.checkinDay = String(day);
    button.disabled = !isNext || !canClaimNext || milestoneDefinitions.some((milestone) => milestone.days === day);
    button.setAttribute('role', 'gridcell');
    button.setAttribute('aria-label', `第${day}天${isChecked ? '，已签到' : isNext && canClaimNext ? '，点击签到' : isNext ? '，今日不可签到' : '，尚未开放'}`);

    const number = document.createElement('span');
    number.className = 'checkin-day-number';
    number.textContent = String(day);
    const reward = document.createElement('span');
    reward.className = 'checkin-day-reward';
    reward.textContent = isChecked ? '已领取' : '+66';
    button.append(number, reward);
    if (isChecked) {
      const stamp = document.createElement('span');
      stamp.className = 'checkin-day-stamp';
      stamp.textContent = '✓';
      stamp.setAttribute('aria-hidden', 'true');
      button.append(stamp);
    }
    if (isNext) {
      const label = document.createElement('span');
      label.className = 'checkin-day-today-label';
      label.textContent = '下一签';
      label.setAttribute('aria-hidden', 'true');
      const cue = document.createElement('img');
      cue.className = 'checkin-day-cue';
      cue.src = '/assets/cues/cue-comet-tail.png';
      cue.alt = '';
      cue.setAttribute('aria-hidden', 'true');
      button.append(label, cue);
    }
    calendarNodes.push(button);
  }
  calendar.replaceChildren(...calendarNodes);

  const nextMilestone = milestoneDefinitions.find((milestone) => state.progress < milestone.days);
  if (nextMilestone) {
    const rarityCopy = CHECK_IN_RARITY_COPY[nextMilestone.rarity];
    setText('checkin-next-reward', `${rarityCopy.zh}宝箱 · 还差 ${nextMilestone.days - state.progress} 天`);
  } else {
    setText('checkin-next-reward', '本轮里程碑已全部达成');
  }

  const milestoneNodes = milestoneDefinitions.map((milestone) => {
    const rarityCopy = CHECK_IN_RARITY_COPY[milestone.rarity];
    const claimKey = getCheckInClaimKey(state.cycle, milestone.days);
    const opened = currentWallet.checkInRewardClaims.includes(claimKey);
    const ready = !opened && state.progress >= milestone.days;
    const isNext = state.progress < CHECK_IN_CYCLE_LENGTH && state.nextDay === milestone.days;
    const isNextClaimable = isNext && canClaimNext;
    const card = document.createElement('article');
    card.className = `checkin-milestone${ready ? ' is-ready' : ''}${opened ? ' is-opened' : ''}${isNextClaimable ? ' is-next' : ''}`;
    card.dataset.rarity = milestone.rarity;
    card.dataset.checkinDay = String(milestone.days);
    card.setAttribute('aria-label', `第${milestone.days}天，${rarityCopy.zh}球杆宝箱${opened ? '，已领取' : ready ? '，可开启' : isNext ? '，点击签到' : '，尚未解锁'}`);

    const image = document.createElement('img');
    image.src = CHECK_IN_CHEST_ASSETS[milestone.rarity];
    image.alt = `${rarityCopy.zh}球杆宝箱`;

    const copy = document.createElement('div');
    copy.className = 'checkin-milestone-copy';
    const kicker = document.createElement('span');
    kicker.textContent = `第 ${milestone.days} 天`;
    const title = document.createElement('strong');
    title.textContent = `${rarityCopy.zh}球杆宝箱`;
    const detail = document.createElement('small');
    detail.textContent = `随机获得 1 支${rarityCopy.zh}球杆`;
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'checkin-milestone-action';
    action.dataset.checkinChestDays = String(milestone.days);
    action.disabled = opened || (!ready && !isNextClaimable);
    action.textContent = opened ? '已领取' : ready ? '开启宝箱' : isNextClaimable ? `签到 +${DAILY_CHECK_IN_REWARD}` : `${state.progress}/${milestone.days}`;
    copy.append(kicker, title, detail, action);
    card.append(image, copy);
    return card;
  });
  milestones.replaceChildren(...milestoneNodes);

  const hasReadyReward = !hasDailyClaim || makeupReady || milestoneDefinitions.some((milestone) => (
    state.progress >= milestone.days
      && !currentWallet.checkInRewardClaims.includes(getCheckInClaimKey(state.cycle, milestone.days))
  ));
  const readyDot = document.getElementById('checkin-ready-dot');
  if (readyDot) readyDot.hidden = !hasReadyReward;
}

function selectCheckInDay(day: number): void {
  selectedCheckInDay = day;
  setCheckInFeedback('');
  renderCheckInPanel();
}

function claimNextCheckIn(): { claimed: boolean; day?: number; cycle?: number } {
  const todayKey = localDateKey();
  const state = getSequentialCheckInState(currentWallet);
  const isDaily = !hasSequentialDailyCheckInToday(currentWallet, todayKey, state.cycle);
  const result = isDaily
    ? applyDailyCheckIn(currentWallet, todayKey)
    : applyMakeupCheckIn(currentWallet, todayKey);
  if (!result.claimed) {
    setCheckInFeedback(checkInFailureCopy(result.reason));
    renderCheckInPanel();
    return result;
  }

  saveMenuWallet(result.wallet);
  selectedCheckInDay = result.day ?? null;
  playCheckInClaimAnimation();
  setCheckInFeedback(isDaily
    ? `第 ${result.day} 天签到成功，${DAILY_CHECK_IN_REWARD} 金币已到账。`
    : `补签成功，已消耗 1 张补签卡并获得 ${DAILY_CHECK_IN_REWARD} 金币。`);
  if (isDaily) void completeMenuDailyCheckInTask();
  return result;
}

function activateCheckInMilestone(days: number): void {
  const state = getSequentialCheckInState(currentWallet);
  const claimKey = getCheckInClaimKey(state.cycle, days);
  if (currentWallet.checkInRewardClaims.includes(claimKey)) {
    setCheckInFeedback(`第 ${days} 天宝箱已经领取。`);
    return;
  }
  if (state.progress >= days) {
    showCheckInChest(days);
    return;
  }
  if (state.nextDay !== days) {
    setCheckInFeedback(`再签到 ${days - state.progress} 天即可解锁这个宝箱。`);
    return;
  }

  const result = claimNextCheckIn();
  if (result.claimed && result.day === days) {
    window.setTimeout(() => showCheckInChest(days), 520);
  }
}

function hasSequentialDailyCheckInToday(wallet: PlayerWallet, todayKey: string, cycle: number): boolean {
  return wallet.lastCheckInDate === todayKey && wallet.checkInRewardClaims.some((entry) => (
    entry.startsWith(`daily-v2:${cycle}:day:`) && entry.endsWith(':daily')
  ));
}

function playCheckInClaimAnimation(): void {
  const dialog = document.querySelector<HTMLElement>('.checkin-dialog');
  if (!dialog) return;
  dialog.classList.remove('is-rewarding');
  void dialog.offsetWidth;
  dialog.classList.add('is-rewarding');
  window.setTimeout(() => dialog.classList.remove('is-rewarding'), 1_100);
}

function closeCheckInRules(): void {
  const rules = document.getElementById('checkin-rule-note');
  const toggle = document.getElementById('checkin-rules-toggle');
  if (rules) rules.hidden = true;
  toggle?.setAttribute('aria-expanded', 'false');
}

function toggleCheckInRules(): void {
  const rules = document.getElementById('checkin-rule-note');
  const toggle = document.getElementById('checkin-rules-toggle');
  if (!rules || !toggle) return;
  const shouldOpen = rules.hidden;
  rules.hidden = !shouldOpen;
  toggle.setAttribute('aria-expanded', String(shouldOpen));
}

function checkInFailureCopy(reason: string | undefined): string {
  switch (reason) {
    case 'no-card': return '补签卡不足，完整完成 3 场对局可获得 1 张。';
    case 'daily-limit': return '今天已经补签过了，每天最多补签 1 次。';
    case 'cycle-limit': return '每轮最多使用 7 次补签，额度已经用完。';
    case 'cycle-complete': return '本轮签到已经完成。';
    case 'daily-check-in-required': return '请先完成今天的正常签到。';
    case 'pending-reward': return '请先领取本轮尚未开启的宝箱。';
    case 'already-checked-in': return '今天已经签到过了。';
    default: return '当前无法签到，请稍后再试。';
  }
}

async function completeMenuDailyCheckInTask(): Promise<void> {
  const dateKey = localDateKey();
  const tasks = await readDailyTaskStateSupabase(supabase, dateKey, browserStorage());
  const result = completeDailyTask(tasks, 'daily_check_in');
  if (!result.completedNow) return;
  await Promise.all([
    walletSaveQueue,
    writeDailyTaskStateSupabase(supabase, result.state, browserStorage()),
  ]);
  await loadGrowthOverview();
}

function setCheckInFeedback(message: string): void {
  setText('checkin-feedback', message);
}

function showCheckInChest(days: number): void {
  const milestone = getCheckInMilestones().find((entry) => entry.days === days);
  if (!milestone) return;
  pendingCheckInMilestone = milestone;
  checkInOpening = false;
  const rarityCopy = CHECK_IN_RARITY_COPY[milestone.rarity];
  const overlay = document.getElementById('checkin-chest-modal');
  const dialog = document.getElementById('checkin-chest-dialog');
  const image = document.getElementById('checkin-chest-image') as HTMLImageElement | null;
  const intro = document.getElementById('checkin-chest-intro');
  const roulette = document.getElementById('checkin-roulette');
  const result = document.getElementById('checkin-reward-result');
  if (!overlay || !dialog || !image || !intro || !roulette || !result) return;

  dialog.dataset.rarity = milestone.rarity;
  image.src = CHECK_IN_CHEST_ASSETS[milestone.rarity];
  image.alt = `${rarityCopy.zh}球杆宝箱`;
  setText('checkin-chest-kicker', `${rarityCopy.zh}奖励`);
  setText('checkin-chest-title', `${rarityCopy.zh}球杆宝箱`);
  setText('checkin-chest-subtitle', `仅包含${rarityCopy.zh}品质球杆 · 重复球杆自动折算金币`);
  intro.hidden = false;
  roulette.hidden = true;
  result.hidden = true;
  (document.getElementById('checkin-chest-open') as HTMLButtonElement | null)?.removeAttribute('disabled');
  (document.getElementById('checkin-chest-close') as HTMLButtonElement | null)?.removeAttribute('disabled');
  overlay.hidden = false;
}

function hideCheckInChest(): void {
  if (checkInOpening) return;
  const overlay = document.getElementById('checkin-chest-modal');
  if (overlay) overlay.hidden = true;
  pendingCheckInMilestone = null;
  renderCheckInPanel();
}

function openPendingCheckInChest(): void {
  if (!pendingCheckInMilestone || checkInOpening) return;
  const milestone = pendingCheckInMilestone;
  const state = getSequentialCheckInState(currentWallet);
  const result = openCheckInChest(currentWallet, CUE_CATALOG, {
    cycle: state.cycle,
    days: milestone.days,
  });
  if (!result.opened || !result.cue) {
    setCheckInFeedback(result.reason === 'already-opened' ? '这个宝箱已经领取过了。' : '宝箱尚未解锁。');
    hideCheckInChest();
    return;
  }

  checkInOpening = true;
  saveMenuWallet(result.wallet);
  const intro = document.getElementById('checkin-chest-intro');
  const roulette = document.getElementById('checkin-roulette');
  const rewardResult = document.getElementById('checkin-reward-result');
  const track = document.getElementById('checkin-roulette-track');
  const windowEl = document.querySelector<HTMLElement>('.checkin-roulette-window');
  const close = document.getElementById('checkin-chest-close') as HTMLButtonElement | null;
  if (!intro || !roulette || !rewardResult || !track || !windowEl) return;
  if (close) close.disabled = true;
  intro.hidden = true;
  roulette.hidden = false;
  rewardResult.hidden = true;

  const rarityCopy = CHECK_IN_RARITY_COPY[milestone.rarity];
  setText('checkin-roulette-kicker', `${rarityCopy.zh}奖池`);
  const pool = CUE_CATALOG.filter((cue) => cue.rarity === milestone.rarity);
  const winnerIndex = 34;
  const nodes = Array.from({ length: 40 }, (_, index) => {
    const cue = index === winnerIndex ? result.cue! : pool[Math.floor(Math.random() * pool.length)];
    const item = document.createElement('div');
    item.className = `checkin-roulette-cue${index === winnerIndex ? ' is-winner' : ''}`;
    item.dataset.rouletteIndex = String(index);
    const image = document.createElement('img');
    image.src = cue.assetPath;
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.textContent = cue.name;
    item.append(image, name);
    return item;
  });
  track.style.transition = 'none';
  track.style.transform = 'translate3d(0, 0, 0)';
  track.replaceChildren(...nodes);

  const finish = (): void => {
    if (!checkInOpening) return;
    checkInOpening = false;
    if (close) close.disabled = false;
    setText('checkin-reward-rarity', `${rarityCopy.zh}品质`);
    setText('checkin-reward-name', result.cue!.name);
    setText('checkin-reward-detail', result.duplicate
      ? `抽到重复球杆，已自动转换为 ${result.coinsAwarded.toLocaleString('zh-CN')} 金币。`
      : '新球杆已加入收藏，可在球杆收藏中装备。');
    rewardResult.hidden = false;
    renderCheckInPanel();
  };

  requestAnimationFrame(() => requestAnimationFrame(() => {
    const winner = track.querySelector<HTMLElement>(`[data-roulette-index="${winnerIndex}"]`);
    if (!winner) {
      finish();
      return;
    }
    const target = (windowEl.clientWidth / 2) - (winner.offsetLeft + winner.offsetWidth / 2);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reducedMotion ? 450 : 5_600;
    track.style.transition = `transform ${duration}ms cubic-bezier(0.06, 0.74, 0.12, 1)`;
    track.style.transform = `translate3d(${target}px, 0, 0)`;
    track.addEventListener('transitionend', (event) => {
      if (event.propertyName === 'transform') finish();
    }, { once: true });
    window.setTimeout(finish, duration + 180);
  }));
}

function parseLocalDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function showCueShop(): void {
  renderCueShop();
  const overlay = document.getElementById('cue-shop');
  if (overlay) overlay.hidden = false;
  void loadMenuWallet();
}

function hideCueShop(): void {
  hideCueDetailPreview();
  const overlay = document.getElementById('cue-shop');
  if (overlay) overlay.hidden = true;
}

function showCueDetailPreview(cueId: string, returnFocus?: HTMLElement | null): void {
  const cue = CUE_CATALOG.find((item) => item.id === cueId);
  const overlay = document.getElementById('cue-detail-preview');
  const image = document.getElementById('cue-detail-preview-image') as HTMLImageElement | null;
  const title = document.getElementById('cue-detail-preview-title');
  const meta = document.getElementById('cue-detail-preview-meta');
  if (!cue || !overlay || !image || !title || !meta) return;

  cuePreviewState = openCuePreview(cue);
  cuePreviewReturnFocus = returnFocus ?? (document.activeElement as HTMLElement | null);
  cuePreviewPreviousOverflow = document.body.style.overflow;
  image.src = cue.assetPath;
  image.alt = `${cue.name} 球杆大图`;
  title.textContent = cue.name;
  const durability = currentWallet.unlockedCueIds.includes(cue.id)
    ? getCueDurability(currentWallet, cue.id)
    : cue.durability;
  meta.textContent = `${getCueRarityLabel(cue.rarity)} · 力量 ${cue.power} · 准度 ${cue.accuracy} · 加塞 ${cue.spin} · 耐用 ${durability}/${cue.durability}`;
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  document.getElementById('cue-detail-preview-close')?.focus();
}

function hideCueDetailPreview(): void {
  if (!cuePreviewState.open) return;
  cuePreviewState = closeCuePreview();
  const overlay = document.getElementById('cue-detail-preview');
  if (overlay) {
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
  }
  document.body.style.overflow = cuePreviewPreviousOverflow;
  cuePreviewReturnFocus?.focus();
  cuePreviewReturnFocus = null;
}

function handleCuePreviewKeydown(event: KeyboardEvent): void {
  if (cuePreviewState.open && isCuePreviewEscape(event.key)) {
    event.preventDefault();
    hideCueDetailPreview();
  }
}

function showRechargePanel(): void {
  renderRechargePanel();
  const overlay = document.getElementById('recharge-panel');
  if (overlay) overlay.hidden = false;
  void loadMenuWallet();
  void loadRechargeData();
}

function hideRechargePanel(): void {
  const overlay = document.getElementById('recharge-panel');
  if (overlay) overlay.hidden = true;
}

function hideEconomyPanels(): void {
  hideCheckInPanel();
  hideCheckInChest();
  hideCueShop();
  hideRechargePanel();
  hideHistoryPanel();
  hideSettingsPanel();
}

async function loadRechargeData(): Promise<void> {
  setRechargeBusy(true);
  setRechargeFeedback('正在加载充值档位...');
  try {
    rechargePackages = await fetchRechargePackages(rechargeClient);
    selectedRechargePackageId = selectDefaultRechargePackage(rechargePackages, selectedRechargePackageId);
    setRechargeFeedback(rechargePackages.length > 0 ? '' : '暂无可用充值档位。');
    try {
      rechargeOrders = await fetchRecentRechargeOrders(rechargeClient);
    } catch {
      rechargeOrders = [];
    }
  } catch (error) {
    setRechargeFeedback(error instanceof Error ? error.message : '充值信息加载失败。');
  } finally {
    setRechargeBusy(false);
    renderRechargePanel();
  }
}

async function createSelectedRechargeOrder(): Promise<void> {
  if (!selectedRechargePackageId || rechargeBusy) return;
  setRechargeBusy(true);
  setRechargeFeedback('正在创建订单...');
  try {
    const result = await createRechargeOrder(rechargeClient, selectedRechargePackageId);
    pendingRechargeOrder = result.order;
    setRechargeFeedback('订单已创建，请完成测试支付。');
  } catch (error) {
    setRechargeFeedback(error instanceof Error ? error.message : '订单创建失败。');
  } finally {
    setRechargeBusy(false);
    renderRechargePanel();
  }
}

async function completeMockRechargePayment(): Promise<void> {
  if (!pendingRechargeOrder || rechargeBusy) return;
  setRechargeBusy(true);
  setRechargeFeedback('正在确认测试支付...');
  try {
    const result = await mockPayRechargeOrder(rechargeClient, pendingRechargeOrder.id);
    currentWallet = { ...currentWallet, coins: result.wallet.coins };
    pendingRechargeOrder = null;
    rechargeOrders = await fetchRecentRechargeOrders(rechargeClient);
    setRechargeFeedback(`充值成功，到账 ${result.grantedCoins} 金币。`);
    await loadMenuWallet();
  } catch (error) {
    setRechargeFeedback(error instanceof Error ? error.message : '测试支付确认失败。');
  } finally {
    setRechargeBusy(false);
    renderMenuEconomy();
  }
}

function setRechargeBusy(busy: boolean): void {
  rechargeBusy = busy;
  const createButton = document.getElementById('recharge-create') as HTMLButtonElement | null;
  const mockPayButton = document.getElementById('recharge-mock-pay') as HTMLButtonElement | null;
  if (createButton) createButton.disabled = busy || !selectedRechargePackageId;
  if (mockPayButton) mockPayButton.disabled = busy || !pendingRechargeOrder;
}

function setRechargeFeedback(message: string): void {
  setText('recharge-feedback', message);
}

function renderRechargePanel(): void {
  const packagesEl = document.getElementById('recharge-packages');
  if (packagesEl) {
    packagesEl.replaceChildren(...rechargePackages.map((item) => createRechargePackageButton(item)));
  }

  const orderEl = document.getElementById('recharge-order');
  if (orderEl) {
    if (pendingRechargeOrder) {
      orderEl.hidden = false;
      orderEl.textContent = `待支付订单 ${pendingRechargeOrder.id.slice(0, 8)} · ${formatCny(pendingRechargeOrder.package.amountCents, pendingRechargeOrder.package.currency)}`;
    } else {
      const latest = rechargeOrders[0];
      orderEl.hidden = !latest;
      orderEl.textContent = latest
        ? `最近订单 ${latest.status === 'paid' ? '已支付' : latest.status} · ${latest.coinAmount} 金币`
        : '';
    }
  }

  const createButton = document.getElementById('recharge-create') as HTMLButtonElement | null;
  const mockPayButton = document.getElementById('recharge-mock-pay') as HTMLButtonElement | null;
  if (createButton) createButton.disabled = rechargeBusy || !selectedRechargePackageId;
  if (mockPayButton) {
    mockPayButton.hidden = !pendingRechargeOrder;
    mockPayButton.disabled = rechargeBusy || !pendingRechargeOrder;
  }
}

function createRechargePackageButton(item: RechargePackage): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `recharge-package${item.id === selectedRechargePackageId ? ' is-selected' : ''}`;
  button.dataset.rechargePackageId = item.id;
  button.setAttribute('role', 'option');
  button.setAttribute('aria-selected', String(item.id === selectedRechargePackageId));

  const title = document.createElement('strong');
  title.textContent = item.title;
  const price = document.createElement('span');
  price.textContent = formatCny(item.amountCents, item.currency);
  const bonus = document.createElement('small');
  bonus.textContent = item.bonusCoins > 0 ? `含赠送 ${item.bonusCoins} 金币` : '基础档位';

  button.append(title, price, bonus);
  return button;
}

function renderCueShop(feedback = ''): void {
  const feedbackEl = document.getElementById('cue-shop-feedback');
  if (feedbackEl) feedbackEl.textContent = feedback;

  setText('cue-shop-balance', currentWallet.coins.toLocaleString('zh-CN'));

  const grid = document.getElementById('cue-shop-grid');
  if (!grid) return;
  grid.replaceChildren(createCueCollection(currentWallet));
}

function buyCueStyle(cueId: string): void {
  const result = buyCue(currentWallet, cueId);
  if (result.purchased) {
    const equipped = equipCue(result.wallet, cueId);
    saveMenuWallet(equipped.wallet);
    renderCueShop('已解锁并装备新球杆。');
    return;
  }
  renderCueShop(result.reason === 'not-enough-coins' ? '金币不足，赢几局再来。' : '这支球杆已经在你的收藏里。');
}

function equipCueStyle(cueId: string): void {
  const result = equipCue(currentWallet, cueId);
  if (result.equipped) {
    saveMenuWallet(result.wallet);
  }
  renderCueShop(result.equipped
    ? '已装备。'
    : result.reason === 'needs-repair'
      ? '球杆耐用度为 0，请先维修。'
      : '这支球杆还没有解锁。');
}

function repairCueStyle(cueId: string): void {
  const result = repairCue(currentWallet, cueId);
  if (result.repaired) {
    saveMenuWallet(result.wallet);
  }
  renderCueShop(result.repaired
    ? '维修完成，耐用度已恢复。'
    : result.reason === 'not-enough-coins'
      ? '金币不足，无法维修。'
      : '这支球杆目前不需要维修。');
}

function showMenu(): void {
  const menu = document.getElementById('main-menu');
  if (menu) menu.hidden = false;
  gameAudio.setScene('menu');
  showMenuSplashCursor();
}

async function signOutCurrentPlayer(): Promise<string | null> {
  if (guestMode) {
    guestMode = false;
    backToMenu();
    const menu = document.getElementById('main-menu');
    if (menu) menu.hidden = true;
    hideMenuSplashCursor();
    gameAudio.setScene('silent');
    showAuthPage();
    return null;
  }

  const { error } = await supabase.auth.signOut();
  return error?.message ?? null;
}

async function init(): Promise<void> {
  audioPreferences = readAudioPreferences(browserStorage());
  gameAudio.setPreferences(audioPreferences);
  installUiAudioFeedback();
  applyShellCopy();
  renderSettingsPanel();
  const { data: { session } } = await supabase.auth.getSession();

  const onAuthSuccess = () => {
    guestMode = false;
    hideAuthPage();
    showMenu();
    loadUserProfile();
  };

  const onGuest = () => {
    guestMode = true;
    hideAuthPage();
    showMenu();
    loadUserProfile();
  };

  initAuthPage(onAuthSuccess, onGuest);

  initMatchmaking((roomInfo: RoomInfo) => {
    startGame('online', roomInfo, roomInfo.ruleset);
  });

  if (session) {
    onAuthSuccess();
  } else {
    gameAudio.setScene('silent');
    showAuthPage();
    const menu = document.getElementById('main-menu');
    if (menu) menu.hidden = true;
  }

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      guestMode = false;
      backToMenu();
      const menu = document.getElementById('main-menu');
      if (menu) menu.hidden = true;
      hideMenuSplashCursor();
      gameAudio.setScene('silent');
      showAuthPage();
    }
  });

  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await signOutCurrentPlayer();
  });

  document.getElementById('growth-panel-toggle')?.addEventListener('click', () => {
    const panel = document.getElementById('growth-panel');
    if (panel) panel.hidden = false;
    loadGrowthOverview();
  });

  document.getElementById('growth-panel-close')?.addEventListener('click', () => {
    const panel = document.getElementById('growth-panel');
    if (panel) panel.hidden = true;
  });

  document.getElementById('checkin-open')?.addEventListener('click', () => {
    void showCheckInPanel();
  });
  document.getElementById('checkin-close')?.addEventListener('click', hideCheckInPanel);
  document.getElementById('checkin-rules-toggle')?.addEventListener('click', toggleCheckInRules);
  document.getElementById('checkin-panel')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) hideCheckInPanel();
  });
  document.getElementById('checkin-calendar')?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>('[data-checkin-day]');
    const day = Number(button?.dataset.checkinDay);
    if (!Number.isInteger(day) || button?.disabled) return;
    const state = getSequentialCheckInState(currentWallet);
    if (day === state.nextDay) claimNextCheckIn();
  });
  document.getElementById('checkin-milestones')?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>('[data-checkin-chest-days]');
    const card = target?.closest<HTMLElement>('[data-checkin-day]');
    const days = Number(button?.dataset.checkinChestDays ?? card?.dataset.checkinDay);
    if (Number.isInteger(days)) {
      activateCheckInMilestone(days);
    }
  });
  document.getElementById('checkin-chest-open')?.addEventListener('click', openPendingCheckInChest);
  document.getElementById('checkin-chest-close')?.addEventListener('click', hideCheckInChest);
  document.getElementById('checkin-reward-accept')?.addEventListener('click', hideCheckInChest);
  document.getElementById('checkin-chest-modal')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) hideCheckInChest();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const checkInRules = document.getElementById('checkin-rule-note');
    if (checkInRules && !checkInRules.hidden) {
      closeCheckInRules();
      return;
    }
    const chest = document.getElementById('checkin-chest-modal');
    if (chest && !chest.hidden) {
      hideCheckInChest();
      return;
    }
    const panel = document.getElementById('checkin-panel');
    if (panel && !panel.hidden) {
      hideCheckInPanel();
      return;
    }
    const settingsPanel = document.getElementById('settings-panel');
    if (settingsPanel && !settingsPanel.hidden) hideSettingsPanel();
  });

  document.getElementById('history-open')?.addEventListener('click', showHistoryPanel);
  document.getElementById('history-close')?.addEventListener('click', hideHistoryPanel);
  document.getElementById('history-list')?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>('[data-match-index]');
    const matchIndex = Number(button?.dataset.matchIndex);
    if (Number.isInteger(matchIndex)) selectHistoryMatch(matchIndex);
  });
  document.getElementById('settings-open')?.addEventListener('click', showSettingsPanel);
  document.getElementById('settings-close')?.addEventListener('click', hideSettingsPanel);
  document.getElementById('settings-panel')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) hideSettingsPanel();
  });
  document.getElementById('settings-music-volume')?.addEventListener('input', updateAudioPreferencesFromControls);
  document.getElementById('settings-sound-volume')?.addEventListener('input', updateAudioPreferencesFromControls);
  document.getElementById('settings-sound-volume')?.addEventListener('change', () => gameAudio.play('select'));
  document.getElementById('settings-audio-reset')?.addEventListener('click', () => {
    audioPreferences = writeAudioPreferences(browserStorage(), DEFAULT_AUDIO_PREFERENCES);
    gameAudio.setPreferences(audioPreferences);
    renderAudioPreferences();
  });
  document.getElementById('settings-password-form')?.addEventListener('submit', (event) => {
    void updateAccountPassword(event as SubmitEvent);
  });
  document.getElementById('settings-logout')?.addEventListener('click', async () => {
    const button = document.getElementById('settings-logout') as HTMLButtonElement | null;
    if (button) button.disabled = true;
    const errorMessage = await signOutCurrentPlayer();
    if (button) button.disabled = false;
    if (errorMessage) {
      setSettingsFeedback(`退出失败：${errorMessage}`, 'error');
      gameAudio.play('warning');
      return;
    }
    hideSettingsPanel();
  });
  document.getElementById('profile-open')?.addEventListener('click', showProfilePanel);
  document.getElementById('profile-close')?.addEventListener('click', hideProfilePanel);
  document.getElementById('profile-cancel')?.addEventListener('click', hideProfilePanel);
  document.getElementById('profile-save')?.addEventListener('click', () => {
    void saveProfileAvatar();
  });
  document.getElementById('profile-avatar-grid')?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>('[data-avatar-id]');
    const avatarId = button?.dataset.avatarId as DefaultAvatarId | undefined;
    if (!avatarId) return;
    pendingAvatarSelection = { kind: 'default', id: avatarId };
    resetProfileCropper();
    renderProfileAvatarGrid();
    renderProfileAvatarPreview(pendingAvatarSelection);
  });
  document.getElementById('profile-avatar-upload-btn')?.addEventListener('click', () => {
    (document.getElementById('profile-avatar-upload') as HTMLInputElement | null)?.click();
  });
  document.getElementById('profile-avatar-upload')?.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void handleProfileUpload(file);
    input.value = '';
  });
  document.getElementById('profile-crop-zoom')?.addEventListener('input', (event) => {
    if (!cropState) return;
    const input = event.target as HTMLInputElement;
    cropState = updateCropZoom(cropState, Number(input.value));
    updateCropperDom();
  });

  const cropFrame = document.getElementById('profile-crop-frame');
  cropFrame?.addEventListener('pointerdown', (event) => {
    if (!cropState) return;
    cropDragStart = { x: event.clientX, y: event.clientY, state: cropState };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  });
  cropFrame?.addEventListener('pointermove', (event) => {
    if (!cropDragStart) return;
    cropState = moveCrop(
      cropDragStart.state,
      event.clientX - cropDragStart.x,
      event.clientY - cropDragStart.y,
    );
    updateCropperDom();
  });
  cropFrame?.addEventListener('pointerup', () => {
    cropDragStart = null;
  });
  cropFrame?.addEventListener('pointercancel', () => {
    cropDragStart = null;
  });

  document.getElementById('cue-shop-open')?.addEventListener('click', showCueShop);
  document.getElementById('cue-shop-close')?.addEventListener('click', hideCueShop);
  document.getElementById('cue-detail-preview-close')?.addEventListener('click', hideCueDetailPreview);
  document.getElementById('cue-detail-preview')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) hideCueDetailPreview();
  });
  document.addEventListener('keydown', handleCuePreviewKeydown);
  document.getElementById('recharge-open')?.addEventListener('click', showRechargePanel);
  document.getElementById('recharge-close')?.addEventListener('click', hideRechargePanel);
  document.getElementById('recharge-packages')?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>('[data-recharge-package-id]');
    if (!button) return;
    selectedRechargePackageId = button.dataset.rechargePackageId ?? null;
    pendingRechargeOrder = null;
    renderRechargePanel();
  });
  document.getElementById('recharge-create')?.addEventListener('click', () => {
    void createSelectedRechargeOrder();
  });
  document.getElementById('recharge-mock-pay')?.addEventListener('click', () => {
    void completeMockRechargePayment();
  });
  document.getElementById('cue-shop-grid')?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const previewTrigger = target?.closest<HTMLElement>('[data-cue-preview-id]');
    if (previewTrigger) {
      showCueDetailPreview(previewTrigger.dataset.cuePreviewId ?? '', previewTrigger);
      return;
    }
    if (currentGame) return;
    const button = target?.closest<HTMLButtonElement>('[data-cue-action]');
    if (!button) return;
    const cueId = button.dataset.cueId;
    const action = button.dataset.cueAction;
    if (!cueId) return;
    if (action === 'buy') {
      buyCueStyle(cueId);
    } else if (action === 'equip') {
      equipCueStyle(cueId);
    } else if (action === 'repair') {
      repairCueStyle(cueId);
    }
  });
  document.getElementById('cue-shop-grid')?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target as HTMLElement | null;
    const previewTrigger = target?.closest<HTMLElement>('[data-cue-preview-id]');
    if (!previewTrigger) return;
    event.preventDefault();
    showCueDetailPreview(previewTrigger.dataset.cuePreviewId ?? '', previewTrigger);
  });
}

init();
