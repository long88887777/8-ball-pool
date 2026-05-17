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
import './styles.css';

type GameMode = 'pvp' | 'ai' | 'challenge' | 'online';

let currentGame: Phaser.Game | null = null;
let guestMode = false;
let currentProfileName = '游客玩家';

function selectedAIDifficulty(): AIDifficulty {
  const selected = document.querySelector<HTMLInputElement>('input[name="ai-difficulty"]:checked');
  return normalizeAIDifficulty(selected?.value, 'normal');
}

function startGame(mode: GameMode, roomInfo?: RoomInfo): void {
  const menu = document.getElementById('main-menu');
  const shell = document.querySelector<HTMLElement>('.game-shell');
  if (menu) menu.hidden = true;
  if (shell) shell.hidden = false;

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
  const [stats, tasks, progress] = await Promise.all([
    readPlayerStatsSupabase(supabase),
    readDailyTaskStateSupabase(supabase, dateKey),
    readProgressSupabase(supabase),
  ]);
  renderGrowthOverview(stats, tasks, summarizeChallengeStars(progress, CHALLENGE_LEVELS));
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
): void {
  renderProfileSummary(stats, tasks, guestMode);
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
}

init();
