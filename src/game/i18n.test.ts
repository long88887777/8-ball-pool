import { describe, expect, it } from 'vitest';
import { formatMessage, getCopy } from './i18n';

describe('localized copy', () => {
  it('formats HUD and game messages in English', () => {
    const copy = getCopy('en');

    expect(copy.eyebrow).toBe('Local Two-Player');
    expect(copy.hud.score(120)).toBe('Score 120');
    expect(copy.aimLabel).toBe('Aim Line');
    expect(copy.aimOn).toBe('On');
    expect(copy.spin.label).toBe('Cue Spin');
    expect(copy.spin.center).toBe('Center');
    expect(copy.spin.high).toBe('High');
    expect(copy.spin.low).toBe('Low');
    expect(copy.spin.left).toBe('Left');
    expect(copy.spin.right).toBe('Right');
    expect(copy.spin.selected(copy.spin.high)).toBe('High');
    expect(copy.hud.eightBallMode).toBe('Local 8-Ball');
    expect(copy.hud.playerName(1)).toBe('Player One');
    expect(copy.hud.pocketedBalls).toBe('Pocketed Balls');
    expect(copy.hud.targetBalls).toBe('Targets');
    expect(copy.hud.openTargets).toBe('Open table');
    expect(copy.hud.noPocketedBalls).toBe('No balls yet');
    expect(copy.hud.activeTurn).toBe('Shooting');
    expect(copy.hud.waitingTurn).toBe('Waiting');
    expect(copy.hud.currentPlayer(2)).toBe('Player 2');
    expect(copy.hud.playerGroup(null)).toBe('Open');
    expect(copy.hud.playerGroup('solids')).toBe('Solids');
    expect(copy.message.ready).toBe('Drag on the table to aim. Release to shoot.');
    expect(formatMessage(copy.message.eightBallFoul, { player: copy.hud.currentPlayer(2), reason: copy.foulReason.cueBallPocketed })).toBe(
      'Foul: cue ball scratched. Player 2 has ball in hand.',
    );
    expect(formatMessage(copy.message.eightBallTimeoutFoul, { player: copy.hud.currentPlayer(2) })).toBe(
      'Shot clock expired. Player 2 has ball in hand.',
    );
    expect(formatMessage(copy.message.eightBallWin, { winner: copy.hud.currentPlayer(1) })).toBe('Player 1 wins.');
    expect(formatMessage(copy.message.rackCleared, { strokes: 7 })).toBe(
      'Rack cleared in 7 strokes. Start a new rack when ready.',
    );
  });

  it('formats HUD and game messages in Chinese', () => {
    const copy = getCopy('zh');

    expect(copy.eyebrow).toBe('本地双人模式');
    expect(copy.hud.score(120)).toBe('得分 120');
    expect(copy.aimLabel).toBe('瞄准线');
    expect(copy.aimOn).toBe('开');
    expect(copy.spin.label).toBe('白球击点');
    expect(copy.spin.center).toBe('中心');
    expect(copy.spin.high).toBe('高杆');
    expect(copy.spin.low).toBe('低杆');
    expect(copy.spin.left).toBe('左塞');
    expect(copy.spin.right).toBe('右塞');
    expect(copy.spin.selected(copy.spin.left)).toBe('左塞');
    expect(copy.hud.eightBallMode).toBe('本地双人 8 球');
    expect(copy.hud.playerName(1)).toBe('玩家一');
    expect(copy.hud.pocketedBalls).toBe('已进球');
    expect(copy.hud.targetBalls).toBe('目标球');
    expect(copy.hud.openTargets).toBe('待分球');
    expect(copy.hud.noPocketedBalls).toBe('暂无进球');
    expect(copy.hud.activeTurn).toBe('击球中');
    expect(copy.hud.waitingTurn).toBe('等待');
    expect(copy.hud.currentPlayer(2)).toBe('玩家 2');
    expect(copy.hud.playerGroup(null)).toBe('开放球局');
    expect(copy.hud.playerGroup('stripes')).toBe('花色');
    expect(copy.message.ready).toBe('在球桌上拖动瞄准，松开击球。');
    expect(formatMessage(copy.message.eightBallFoul, { player: copy.hud.currentPlayer(2), reason: copy.foulReason.wrongFirstContact })).toBe(
      '犯规：先碰到错误目标球，玩家 2 获得自由球。',
    );
    expect(formatMessage(copy.message.eightBallTimeoutFoul, { player: copy.hud.currentPlayer(2) })).toBe(
      '击球超时，玩家 2 获得自由球。',
    );
    expect(formatMessage(copy.message.eightBallWin, { winner: copy.hud.currentPlayer(1) })).toBe('玩家 1 获胜。');
    expect(formatMessage(copy.message.rackCleared, { strokes: 7 })).toBe('7 杆清台。准备好后开始新一局。');
  });
});

describe('i18n AI keys', () => {
  it('English copy has AI keys', () => {
    const copy = getCopy('en');
    expect(copy.ai.thinking).toBe('AI thinking...');
    expect(copy.ai.aiming).toBe('AI aiming...');
    expect(copy.ai.shooting).toBe('AI shooting');
    expect(copy.ai.playerName).toBe('AI');
    expect(copy.ai.difficulty.easy).toBe('Rookie');
    expect(copy.ai.difficulty.normal).toBe('Skilled');
    expect(copy.ai.difficulty.hard).toBe('Master');
    expect(copy.ai.playerNameWithDifficulty('Master')).toBe('AI · Master');
    expect(copy.ai.thinkingWithDifficulty('Skilled')).toBe('AI thinking · Skilled');
    expect(copy.ai.aimingWithDifficulty('Skilled')).toBe('AI aiming · Skilled');
    expect(copy.hud.modeLabel).toBe('Mode');
    expect(copy.hud.modePvp).toBe('PVP');
    expect(copy.hud.modeAi).toBe('VS AI');
  });

  it('Chinese copy has AI keys', () => {
    const copy = getCopy('zh');
    expect(copy.ai.thinking).toBe('AI 思考中...');
    expect(copy.ai.aiming).toBe('AI 瞄准中...');
    expect(copy.ai.shooting).toBe('AI 击球');
    expect(copy.ai.playerName).toBe('电脑');
    expect(copy.ai.difficulty.easy).toBe('新手');
    expect(copy.ai.difficulty.normal).toBe('熟练');
    expect(copy.ai.difficulty.hard).toBe('大师');
    expect(copy.ai.playerNameWithDifficulty('大师')).toBe('电脑 · 大师');
    expect(copy.ai.thinkingWithDifficulty('熟练')).toBe('AI 思考中 · 熟练');
    expect(copy.ai.aimingWithDifficulty('熟练')).toBe('AI 瞄准中 · 熟练');
    expect(copy.hud.modeLabel).toBe('模式');
    expect(copy.hud.modePvp).toBe('双人对战');
    expect(copy.hud.modeAi).toBe('人机对战');
  });
});
