import Phaser from 'phaser';
import { PoolScene } from './game/PoolScene';
import { type GameRuleset } from './game/gameRules';
import { normalizeAIDifficulty, type AIDifficulty } from './game/ai/difficulty';
import { getCopy, type Language } from './game/i18n';
import type { AimSensitivity } from './game/shotControl';
import { supabase } from './lib/supabase';
import { initAuthPage, showAuthPage, hideAuthPage } from './auth/authPage';
import { initMatchmaking, openMatchModal } from './online/matchmaking';
import type { RoomInfo } from './online/types';
import { CHALLENGE_LEVELS } from './game/challenge/levels';
import { isLevelUnlocked, readProgressSupabase } from './game/challenge/progress';
import { summarizeChallengeStars } from './game/growth/challengeSummary';
import { readDailyTaskStateSupabase, readPlayerStatsSupabase } from './game/growth/persistence';
import { getRankProgress, summarizeStats, type PlayerStats } from './game/growth/stats';
import { DAILY_TASKS, summarizeDailyTasks, type DailyTaskState } from './game/growth/tasks';
import {
  CUE_CATALOG,
  DEFAULT_PLAYER_WALLET,
  buyCue,
  equipCue,
  readPlayerWalletSupabase,
  writePlayerWallet,
  writePlayerWalletSupabase,
  type CueStyle,
  type PlayerWallet,
  type StorageAdapter,
} from './game/economy';
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
import {
  formatRecentMatchSummary,
  formatShotHistoryEntry,
  readStoredAimControlSettings,
  resolveHistorySelectionIndex,
  writeStoredAimControlSettings,
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
let currentAvatarSelection: AvatarSelection = createDefaultAvatarSelection();
let pendingAvatarSelection: AvatarSelection = currentAvatarSelection;
let cropState: CropState | null = null;
let cropImageElement: HTMLImageElement | null = null;
let cropSourceImage: HTMLImageElement | null = null;
let cropObjectUrl: string | null = null;
let cropDragStart: { x: number; y: number; state: CropState } | null = null;

const shellLanguage: Language = 'zh';

const rechargeClient = supabase as unknown as SupabaseRechargeClient;

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
  showGameShellForNewGame();
  hideEconomyPanels();

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: 'game',
    width: 1100,
    height: 640,
    backgroundColor: '#10100e',
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

  currentGame = new Phaser.Game(config);
}

function backToMenu(): void {
  if (currentGame) {
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
    title.textContent = mode === 'online' ? '联网对战' : mode === 'ai' ? '人机对战' : '双人对战';
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
  overlay.hidden = true;
  if (title) title.textContent = '挑战模式';
  if (backBtn) backBtn.textContent = '返回';

  const progress = await readProgressSupabase(supabase);
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
  overlay.hidden = false;
}

function hideChallengeSelect(): void {
  const overlay = document.getElementById('challenge-select');
  if (overlay) overlay.hidden = true;
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

document.getElementById('btn-back')?.addEventListener('click', requestBackToMenu);
window.addEventListener('pool:return-to-menu', backToMenu);

document.getElementById('btn-pause')?.addEventListener('click', () => {
  const pauseOverlay = document.getElementById('pause-overlay');
  if (pauseOverlay) {
    pauseOverlay.hidden = false;
    if (currentGame) {
      currentGame.scene.getScene('PoolScene')?.scene.pause();
    }
  }
});

document.getElementById('pause-resume')?.addEventListener('click', () => {
  const pauseOverlay = document.getElementById('pause-overlay');
  if (pauseOverlay) {
    pauseOverlay.hidden = true;
    if (currentGame) {
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
}

function hideSettingsPanel(): void {
  const overlay = document.getElementById('settings-panel');
  if (overlay) overlay.hidden = true;
}

function renderSettingsPanel(): void {
  const settings = readStoredAimControlSettings(browserStorage());
  const sensitivity = document.getElementById('settings-sensitivity') as HTMLSelectElement | null;
  const powerStep = document.getElementById('settings-power-step') as HTMLInputElement | null;
  const powerLock = document.getElementById('settings-power-lock') as HTMLInputElement | null;

  if (sensitivity) sensitivity.value = settings.sensitivity;
  if (powerStep) powerStep.value = String(settings.powerStep);
  if (powerLock) powerLock.checked = settings.powerLocked;
}

function saveAimControlSettingsFromPanel(): void {
  const sensitivity = document.getElementById('settings-sensitivity') as HTMLSelectElement | null;
  const powerStep = document.getElementById('settings-power-step') as HTMLInputElement | null;
  const powerLock = document.getElementById('settings-power-lock') as HTMLInputElement | null;

  const saved = writeStoredAimControlSettings(browserStorage(), {
    sensitivity: (sensitivity?.value ?? 'normal') as AimSensitivity,
    powerStep: Number(powerStep?.value ?? 5),
    powerLocked: powerLock?.checked === true,
  });
  currentGame?.registry.set('aimControlSettings', saved);
  renderSettingsPanel();
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
  setText('settings-sensitivity-label', copy.sensitivity);
  setText('settings-power-step-label', copy.powerStep);
  setText('settings-power-lock-label', copy.powerLock);
  setText('settings-sensitivity-fine', copy.sensitivityFine);
  setText('settings-sensitivity-normal', copy.sensitivityNormal);
  setText('settings-sensitivity-fast', copy.sensitivityFast);
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
  setText('cue-shop-balance', `金币 ${currentWallet.coins}`);
  setText('recharge-balance', `金币 ${currentWallet.coins}`);
  setText('cue-shop-open', getCopy(shellLanguage).shell.cueCollection);
  renderCueShop();
  renderRechargePanel();
}

function showCueShop(): void {
  renderCueShop();
  const overlay = document.getElementById('cue-shop');
  if (overlay) overlay.hidden = false;
  void loadMenuWallet();
}

function hideCueShop(): void {
  const overlay = document.getElementById('cue-shop');
  if (overlay) overlay.hidden = true;
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

  const grid = document.getElementById('cue-shop-grid');
  if (!grid) return;
  grid.replaceChildren(...CUE_CATALOG.map((cue) => createCueCard(cue)));
}

function createCueCard(cue: CueStyle): HTMLElement {
  const owned = currentWallet.unlockedCueIds.includes(cue.id);
  const equipped = currentWallet.equippedCueId === cue.id;
  const card = document.createElement('article');
  card.className = `cue-card cue-rarity-${cue.rarity}${equipped ? ' is-equipped' : ''}`;
  card.style.setProperty('--cue-shaft', cssColor(cue.shaftColor));
  card.style.setProperty('--cue-forearm', cssColor(cue.forearmColor));
  card.style.setProperty('--cue-wrap', cssColor(cue.wrapColor));
  card.style.setProperty('--cue-accent', cssColor(cue.accentColor));
  card.style.setProperty('--cue-gem', cssColor(cue.gemColor));

  const preview = document.createElement('div');
  preview.className = 'cue-preview';
  preview.setAttribute('aria-hidden', 'true');
  preview.append(
    createCueSegment('cue-preview-butt'),
    createCueSegment('cue-preview-wrap'),
    createCueSegment('cue-preview-forearm'),
    createCueSegment('cue-preview-shaft'),
    createCueSegment('cue-preview-tip'),
  );

  const name = document.createElement('h3');
  name.textContent = cue.name;

  const meta = document.createElement('p');
  meta.className = 'cue-meta';
  meta.textContent = `${rarityLabel(cue.rarity)} · ${cue.price === 0 ? '默认拥有' : `${cue.price} 金币`}`;

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.cueId = cue.id;
  if (equipped) {
    button.textContent = '已装备';
    button.disabled = true;
  } else if (owned) {
    button.textContent = '装备';
    button.dataset.cueAction = 'equip';
  } else {
    button.textContent = currentWallet.coins >= cue.price ? '解锁' : '金币不足';
    button.dataset.cueAction = 'buy';
    button.disabled = currentWallet.coins < cue.price;
  }

  card.append(preview, name, meta, button);
  return card;
}

function createCueSegment(className: string): HTMLSpanElement {
  const segment = document.createElement('span');
  segment.className = className;
  return segment;
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
  renderCueShop(result.equipped ? '已装备。' : '这支球杆还没有解锁。');
}

function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function rarityLabel(rarity: CueStyle['rarity']): string {
  if (rarity === 'legendary') return '传说';
  if (rarity === 'epic') return '史诗';
  if (rarity === 'rare') return '稀有';
  return '基础';
}

function showMenu(): void {
  const menu = document.getElementById('main-menu');
  if (menu) menu.hidden = false;
}

async function init(): Promise<void> {
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
      showAuthPage();
    }
  });

  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    if (guestMode) {
      guestMode = false;
      backToMenu();
      showAuthPage();
      return;
    }
    await supabase.auth.signOut();
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
  document.getElementById('settings-sensitivity')?.addEventListener('change', saveAimControlSettingsFromPanel);
  document.getElementById('settings-power-step')?.addEventListener('change', saveAimControlSettingsFromPanel);
  document.getElementById('settings-power-lock')?.addEventListener('change', saveAimControlSettingsFromPanel);
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
    const button = target?.closest<HTMLButtonElement>('[data-cue-action]');
    if (!button) return;
    const cueId = button.dataset.cueId;
    const action = button.dataset.cueAction;
    if (!cueId) return;
    if (action === 'buy') {
      buyCueStyle(cueId);
    } else if (action === 'equip') {
      equipCueStyle(cueId);
    }
  });
}

init();
