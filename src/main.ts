import Phaser from 'phaser';
import { PoolScene } from './game/PoolScene';
import { normalizeAIDifficulty, type AIDifficulty } from './game/ai/difficulty';
import { supabase } from './lib/supabase';
import { initAuthPage, showAuthPage, hideAuthPage } from './auth/authPage';
import { initMatchmaking, openMatchModal } from './online/matchmaking';
import type { RoomInfo } from './online/types';
import { CHALLENGE_LEVELS } from './game/challenge/levels';
import { readProgressSupabase } from './game/challenge/progress';
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
import './styles.css';

type GameMode = 'pvp' | 'ai' | 'challenge' | 'online';

let currentGame: Phaser.Game | null = null;
let guestMode = false;
let currentProfileName = '游客玩家';
let currentWallet: PlayerWallet = DEFAULT_PLAYER_WALLET;
let walletSaveQueue: Promise<void> = Promise.resolve();
let rechargePackages: RechargePackage[] = [];
let rechargeOrders: RechargeOrder[] = [];
let selectedRechargePackageId: string | null = null;
let pendingRechargeOrder: CreatedRechargeOrder | null = null;
let rechargeBusy = false;

const rechargeClient = supabase as unknown as SupabaseRechargeClient;

function selectedAIDifficulty(): AIDifficulty {
  const selected = document.querySelector<HTMLInputElement>('input[name="ai-difficulty"]:checked');
  return normalizeAIDifficulty(selected?.value, 'normal');
}

function startGame(mode: GameMode, roomInfo?: RoomInfo): void {
  const menu = document.getElementById('main-menu');
  const shell = document.querySelector<HTMLElement>('.game-shell');
  const challengeSelect = document.getElementById('challenge-select');
  if (menu) menu.hidden = true;
  if (shell) shell.hidden = false;
  if (challengeSelect) challengeSelect.hidden = mode !== 'challenge';
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
  if (menu) menu.hidden = false;
  if (shell) shell.hidden = true;
  if (pauseOverlay) pauseOverlay.hidden = true;
  void loadGrowthOverview();
}

document.querySelectorAll<HTMLButtonElement>('.menu-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode as GameMode;
    if (mode === 'online') {
      openMatchModal();
      return;
    }
    startGame(mode);
  });
});

document.getElementById('btn-back')?.addEventListener('click', backToMenu);
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

function renderGrowthOverview(
  stats: PlayerStats,
  tasks: DailyTaskState,
  challengeSummary: ReturnType<typeof summarizeChallengeStars>,
  wallet: PlayerWallet,
): void {
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
  setText('cue-shop-open', '球杆收藏');
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
    startGame('online', roomInfo);
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
