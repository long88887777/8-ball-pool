import type { AimControlSettings } from './game/shotControl';
import {
  createDefaultAimControlSettings,
  sanitizeAimControlSettings,
} from './game/shotControl';
import type { Language } from './game/i18n';
import type { RecentMatchRecord } from './game/growth/stats';
import type { ShotHistoryEntry } from './game/matchHistory';

export type MenuStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type MatchSummaryCopy = {
  title: string;
  meta: string;
  detail: string;
};

export const AIM_CONTROL_SETTINGS_KEY = 'pool.aimControlSettings.v1';

export type ChallengeSelectElements = {
  overlay: HTMLElement;
  grid: HTMLElement;
  title?: HTMLElement | null;
  backBtn?: HTMLElement | null;
};

export function showChallengeSelectLoadingState(
  elements: ChallengeSelectElements,
  doc: Pick<Document, 'createElement'> = document,
): void {
  const loading = doc.createElement('div');
  loading.className = 'challenge-loading';
  loading.textContent = '正在加载关卡...';

  elements.grid.replaceChildren(loading);
  if (elements.title) elements.title.textContent = '挑战模式';
  if (elements.backBtn) elements.backBtn.textContent = '返回';
  elements.overlay.hidden = false;
}

export function readStoredAimControlSettings(
  storage: Pick<MenuStorage, 'getItem'>,
): AimControlSettings {
  try {
    const raw = storage.getItem(AIM_CONTROL_SETTINGS_KEY);
    if (!raw) {
      return createDefaultAimControlSettings();
    }
    return sanitizeAimControlSettings(JSON.parse(raw) as unknown);
  } catch {
    return createDefaultAimControlSettings();
  }
}

export function writeStoredAimControlSettings(
  storage: MenuStorage,
  settings: AimControlSettings,
): AimControlSettings {
  const sanitized = sanitizeAimControlSettings(settings);
  try {
    storage.setItem(AIM_CONTROL_SETTINGS_KEY, JSON.stringify(sanitized));
  } catch {
    // Settings remain usable for the current session even if storage is unavailable.
  }
  return sanitized;
}

export function formatRecentMatchSummary(
  match: RecentMatchRecord,
  language: Language,
): MatchSummaryCopy {
  const result = language === 'zh'
    ? match.won ? '胜' : '负'
    : match.won ? 'Win' : 'Loss';
  const mode = modeLabel(match.mode, language);
  const ruleset = rulesetLabel(match.ruleset, language);
  const strokes = language === 'zh' ? `${match.strokes} 杆` : `${match.strokes} strokes`;

  return {
    title: `${result} · ${match.opponentName}`,
    meta: `${mode} · ${ruleset} · ${strokes}`,
    detail: formatPlayedAt(match.playedAt),
  };
}

export function formatShotHistoryEntry(
  entry: ShotHistoryEntry,
  language: Language,
): string {
  const player = language === 'zh'
    ? entry.playerIndex === 0 ? '玩家一' : '玩家二'
    : entry.playerIndex === 0 ? 'Player One' : 'Player Two';
  const pocketed = entry.pocketedBallIds.length > 0
    ? language === 'zh'
      ? `进球 ${entry.pocketedBallIds.join(', ')}`
      : `potted ${entry.pocketedBallIds.join(', ')}`
    : language === 'zh'
      ? '未进球'
      : 'no pot';
  const foul = entry.foulReason
    ? language === 'zh' ? `犯规 ${entry.foulReason}` : `foul ${entry.foulReason}`
    : language === 'zh' ? '合法' : 'legal';
  const power = language === 'zh'
    ? `力度 ${entry.powerPercent}%`
    : `power ${entry.powerPercent}%`;

  return `${player} · ${power} · ${pocketed} · ${foul}`;
}

export function resolveHistorySelectionIndex(
  matches: RecentMatchRecord[],
  selectedIndex: number | null,
): number | null {
  if (matches.length === 0) {
    return null;
  }
  if (selectedIndex !== null && selectedIndex >= 0 && selectedIndex < matches.length) {
    return selectedIndex;
  }
  return 0;
}

function modeLabel(mode: RecentMatchRecord['mode'], language: Language): string {
  if (language === 'zh') {
    if (mode === 'ai') return '人机';
    if (mode === 'pvp') return '本地';
    if (mode === 'challenge') return '挑战';
    return '联网';
  }
  if (mode === 'ai') return 'AI';
  if (mode === 'pvp') return 'Local';
  if (mode === 'challenge') return 'Challenge';
  return 'Online';
}

function rulesetLabel(ruleset: RecentMatchRecord['ruleset'], language: Language): string {
  if (language === 'zh') {
    return ruleset === 'nine-ball' ? '9 球' : '8 球';
  }
  return ruleset === 'nine-ball' ? '9-Ball' : '8-Ball';
}

function formatPlayedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}/${month}/${day} ${hour}:${minute}`;
}
