import type { EightBallFoulReason } from './eightBallRules';

export type Language = 'en' | 'zh';
export type LocalizedBallGroup = 'solids' | 'stripes' | null;

type MessageTemplate = string;

export type GameCopy = {
  documentTitle: string;
  eyebrow: string;
  title: string;
  languageLabel: string;
  languageToggle: string;
  aimLabel: string;
  aimOn: string;
  spin: {
    label: string;
    center: string;
    high: string;
    low: string;
    left: string;
    right: string;
    selected: (name: string) => string;
  };
  ai: {
    thinking: string;
    aiming: string;
    shooting: string;
    playerName: string;
    difficulty: {
      easy: string;
      normal: string;
      hard: string;
    };
    playerNameWithDifficulty: (difficulty: string) => string;
    thinkingWithDifficulty: (difficulty: string) => string;
    aimingWithDifficulty: (difficulty: string) => string;
  };
  challenge: {
    modeButton: string;
    title: string;
    back: string;
    locked: string;
    retry: string;
    nextLevel: string;
    levelSelect: string;
    shotsUsed: (used: number, max: number) => string;
    passed: string;
    failed: string;
    stars: (count: number) => string;
    level: (id: number) => string;
  };
  hud: {
    mode: string;
    eightBallMode: string;
    modeLabel: string;
    modePvp: string;
    modeAi: string;
    playerName: (player: number) => string;
    score: (score: number) => string;
    strokes: (strokes: number) => string;
    best: (best: number | null) => string;
    remaining: (remaining: number) => string;
    currentPlayer: (player: number) => string;
    playerGroup: (group: LocalizedBallGroup) => string;
    pocketedBalls: string;
    targetBalls: string;
    openTargets: string;
    noPocketedBalls: string;
    activeTurn: string;
    waitingTurn: string;
    restart: string;
  };
  foulReason: Record<EightBallFoulReason, string>;
  message: {
    ready: string;
    shotInMotion: string;
    targetPocketed: string;
    tableCleared: string;
    cuePocketed: string;
    cueReset: string;
    rackCleared: MessageTemplate;
    eightBallReady: MessageTemplate;
    eightBallShotInMotion: string;
    eightBallGroupsAssigned: MessageTemplate;
    eightBallKeepTurn: MessageTemplate;
    eightBallTurnPass: MessageTemplate;
    eightBallFoul: MessageTemplate;
    eightBallTimeoutFoul: MessageTemplate;
    eightBallBallInHand: MessageTemplate;
    eightBallWin: MessageTemplate;
    eightBallLoss: MessageTemplate;
  };
};

const COPY: Record<Language, GameCopy> = {
  en: {
    documentTitle: 'Realistic 2D Pool',
    eyebrow: 'Local Two-Player',
    title: 'Pool Hall',
    languageLabel: 'Language',
    languageToggle: '中文',
    aimLabel: 'Aim Line',
    aimOn: 'On',
    spin: {
      label: 'Cue Spin',
      center: 'Center',
      high: 'High',
      low: 'Low',
      left: 'Left',
      right: 'Right',
      selected: (name) => name,
    },
    ai: {
      thinking: 'AI thinking...',
      aiming: 'AI aiming...',
      shooting: 'AI shooting',
      playerName: 'AI',
      difficulty: {
        easy: 'Rookie',
        normal: 'Skilled',
        hard: 'Master',
      },
      playerNameWithDifficulty: (difficulty) => `AI · ${difficulty}`,
      thinkingWithDifficulty: (difficulty) => `AI thinking · ${difficulty}`,
      aimingWithDifficulty: (difficulty) => `AI aiming · ${difficulty}`,
    },
    challenge: {
      modeButton: 'Challenge',
      title: 'Challenge Mode',
      back: 'Back',
      locked: 'Locked',
      retry: 'Retry',
      nextLevel: 'Next Level',
      levelSelect: 'Level Select',
      shotsUsed: (used, max) => `Shots ${used}/${max}`,
      passed: 'Level Complete!',
      failed: 'Level Failed',
      stars: (count) => `${count} Star${count !== 1 ? 's' : ''}`,
      level: (id) => `Level ${id}`,
    },
    hud: {
      mode: 'Clear Table',
      eightBallMode: 'Local 8-Ball',
      modeLabel: 'Mode',
      modePvp: 'PVP',
      modeAi: 'VS AI',
      playerName: (player) => (player === 1 ? 'Player One' : 'Player Two'),
      score: (score) => `Score ${score}`,
      strokes: (strokes) => `Strokes ${strokes}`,
      best: (best) => `Best ${best ?? '--'}`,
      remaining: (remaining) => `Balls ${remaining}`,
      currentPlayer: (player) => `Player ${player}`,
      playerGroup: (group) => {
        if (group === 'solids') return 'Solids';
        if (group === 'stripes') return 'Stripes';
        return 'Open';
      },
      pocketedBalls: 'Pocketed Balls',
      targetBalls: 'Targets',
      openTargets: 'Open table',
      noPocketedBalls: 'No balls yet',
      activeTurn: 'Shooting',
      waitingTurn: 'Waiting',
      restart: 'New Rack',
    },
    foulReason: {
      cueBallPocketed: 'cue ball scratched',
      noFirstContact: 'cue ball did not contact a target ball',
      wrongFirstContact: 'wrong target ball was hit first',
      noCushionAfterContact: 'no ball reached a cushion after contact',
      shotClockExpired: 'shot clock expired',
    },
    message: {
      ready: 'Drag on the table to aim. Release to shoot.',
      shotInMotion: 'Shot in motion.',
      targetPocketed: 'Target ball pocketed.',
      tableCleared: 'Table cleared. Start a new rack when ready.',
      cuePocketed: 'Cue ball pocketed. It will reset after the table stops.',
      cueReset: 'Cue ball reset. Drag on the table to aim.',
      rackCleared: 'Rack cleared in {strokes} strokes. Start a new rack when ready.',
      eightBallReady: '{player}: drag on the table to aim. Release to shoot.',
      eightBallShotInMotion: 'Shot in motion.',
      eightBallGroupsAssigned: '{player} takes {group} and shoots again.',
      eightBallKeepTurn: '{player} made a legal ball and shoots again.',
      eightBallTurnPass: 'No ball made. {player} shoots.',
      eightBallFoul: 'Foul: {reason}. {player} has ball in hand.',
      eightBallTimeoutFoul: 'Shot clock expired. {player} has ball in hand.',
      eightBallBallInHand: '{player}: place the cue ball, then shoot.',
      eightBallWin: '{winner} wins.',
      eightBallLoss: '{loser} loses. {winner} wins.',
    },
  },
  zh: {
    documentTitle: '写实 2D 台球',
    eyebrow: '本地双人模式',
    title: '台球厅',
    languageLabel: '语言',
    languageToggle: 'EN',
    aimLabel: '瞄准线',
    aimOn: '开',
    spin: {
      label: '白球击点',
      center: '中心',
      high: '高杆',
      low: '低杆',
      left: '左塞',
      right: '右塞',
      selected: (name) => name,
    },
    ai: {
      thinking: 'AI 思考中...',
      aiming: 'AI 瞄准中...',
      shooting: 'AI 击球',
      playerName: '电脑',
      difficulty: {
        easy: '新手',
        normal: '熟练',
        hard: '大师',
      },
      playerNameWithDifficulty: (difficulty) => `电脑 · ${difficulty}`,
      thinkingWithDifficulty: (difficulty) => `AI 思考中 · ${difficulty}`,
      aimingWithDifficulty: (difficulty) => `AI 瞄准中 · ${difficulty}`,
    },
    challenge: {
      modeButton: '挑战',
      title: '挑战模式',
      back: '返回',
      locked: '未解锁',
      retry: '重试',
      nextLevel: '下一关',
      levelSelect: '选关',
      shotsUsed: (used, max) => `杆数 ${used}/${max}`,
      passed: '过关！',
      failed: '挑战失败',
      stars: (count) => `${count} 星`,
      level: (id) => `第 ${id} 关`,
    },
    hud: {
      mode: '清台练习',
      eightBallMode: '本地双人 8 球',
      modeLabel: '模式',
      modePvp: '双人对战',
      modeAi: '人机对战',
      playerName: (player) => (player === 1 ? '玩家一' : '玩家二'),
      score: (score) => `得分 ${score}`,
      strokes: (strokes) => `杆数 ${strokes}`,
      best: (best) => `最佳 ${best ?? '--'}`,
      remaining: (remaining) => `剩余 ${remaining}`,
      currentPlayer: (player) => `玩家 ${player}`,
      playerGroup: (group) => {
        if (group === 'solids') return '全色';
        if (group === 'stripes') return '花色';
        return '开放球局';
      },
      pocketedBalls: '已进球',
      targetBalls: '目标球',
      openTargets: '待分球',
      noPocketedBalls: '暂无进球',
      activeTurn: '击球中',
      waitingTurn: '等待',
      restart: '新开一局',
    },
    foulReason: {
      cueBallPocketed: '白球落袋',
      noFirstContact: '白球没有碰到目标球',
      wrongFirstContact: '先碰到错误目标球',
      noCushionAfterContact: '碰到目标球后没有球碰库边',
      shotClockExpired: '击球超时',
    },
    message: {
      ready: '在球桌上拖动瞄准，松开击球。',
      shotInMotion: '击球进行中。',
      targetPocketed: '目标球入袋。',
      tableCleared: '已清台。准备好后开始新一局。',
      cuePocketed: '白球入袋，球停止后会复位。',
      cueReset: '白球已复位，在球桌上拖动瞄准。',
      rackCleared: '{strokes} 杆清台。准备好后开始新一局。',
      eightBallReady: '{player}：在球桌上拖动瞄准，松开击球。',
      eightBallShotInMotion: '击球进行中。',
      eightBallGroupsAssigned: '{player} 分到{group}，继续击球。',
      eightBallKeepTurn: '{player} 合法进球，继续击球。',
      eightBallTurnPass: '未进球，{player} 击球。',
      eightBallFoul: '犯规：{reason}，{player} 获得自由球。',
      eightBallTimeoutFoul: '击球超时，{player} 获得自由球。',
      eightBallBallInHand: '{player}：摆放白球后击球。',
      eightBallWin: '{winner} 获胜。',
      eightBallLoss: '{loser} 输掉本局，{winner} 获胜。',
    },
  },
};

export function getCopy(language: Language): GameCopy {
  return COPY[language];
}

export function formatMessage(template: MessageTemplate, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
}

export function getInitialLanguage(language?: string): Language {
  return language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
