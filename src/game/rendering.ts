import Phaser from 'phaser';
import { BALL_RADIUS, PLAY_AREA, POCKETS, TABLE } from './constants';

export type BallTextureOptions = {
  key: string;
  fill: string;
  label?: string;
};

export function createBallTexture(scene: Phaser.Scene, options: BallTextureOptions): void {
  const size = BALL_RADIUS * 2 + 12;
  const graphics = scene.make.graphics({ x: 0, y: 0 });

  graphics.fillStyle(0x000000, 0.28);
  graphics.fillCircle(size / 2 + 2, size / 2 + 3, BALL_RADIUS);
  graphics.fillStyle(Phaser.Display.Color.HexStringToColor(options.fill).color, 1);
  graphics.fillCircle(size / 2, size / 2, BALL_RADIUS);
  graphics.fillGradientStyle(0xffffff, 0xffffff, 0x000000, 0x000000, 0.42, 0.08, 0.16, 0.24);
  graphics.fillCircle(size / 2 - 2, size / 2 - 2, BALL_RADIUS - 2);
  graphics.fillStyle(0xffffff, 0.62);
  graphics.fillCircle(size / 2 - 5, size / 2 - 6, BALL_RADIUS * 0.28);

  if (options.label) {
    graphics.fillStyle(0xf8ecd6, 0.98);
    graphics.fillCircle(size / 2, size / 2, BALL_RADIUS * 0.43);
  }

  graphics.lineStyle(1, 0xffffff, 0.18);
  graphics.strokeCircle(size / 2, size / 2, BALL_RADIUS - 1);
  graphics.generateTexture(options.key, size, size);
  graphics.destroy();

  if (options.label) {
    const label = scene.add.text(size / 2, size / 2 + 1, options.label, {
      color: '#20160f',
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      fontStyle: 'bold',
    });
    label.setOrigin(0.5);
    const renderTexture = scene.add.renderTexture(0, 0, size, size);
    renderTexture.draw(options.key, size / 2, size / 2);
    renderTexture.draw(label, size / 2, size / 2);
    renderTexture.saveTexture(`${options.key}-numbered`);
    label.destroy();
    renderTexture.destroy();
    scene.textures.remove(options.key);
    scene.textures.renameTexture(`${options.key}-numbered`, options.key);
  }
}

export function drawPoolHall(scene: Phaser.Scene): void {
  const room = scene.add.graphics().setDepth(0);
  room.fillGradientStyle(0x21150f, 0x21150f, 0x090807, 0x090807, 1);
  room.fillRect(0, 0, TABLE.width, TABLE.height);
  room.fillStyle(0xe8b56c, 0.13);
  room.fillEllipse(TABLE.width / 2, 46, 560, 150);
  room.fillStyle(0x000000, 0.22);
  room.fillRect(0, TABLE.height - 74, TABLE.width, 74);
}

export function drawRefinedTable(scene: Phaser.Scene): void {
  const table = scene.add.graphics().setDepth(1);

  table.fillStyle(0x120a06, 1);
  table.fillRoundedRect(36, 38, TABLE.width - 72, TABLE.height - 76, 38);
  table.lineStyle(10, 0x070403, 0.95);
  table.strokeRoundedRect(36, 38, TABLE.width - 72, TABLE.height - 76, 38);

  table.fillGradientStyle(0x7d4a25, 0x4c2814, 0x2d150b, 0x6a381a, 1);
  table.fillRoundedRect(54, 56, TABLE.width - 108, TABLE.height - 112, 28);
  table.lineStyle(3, 0xd39a55, 0.34);
  table.strokeRoundedRect(62, 64, TABLE.width - 124, TABLE.height - 128, 22);

  table.fillStyle(0x0a5c3f, 1);
  table.fillRoundedRect(
    PLAY_AREA.left,
    PLAY_AREA.top,
    PLAY_AREA.right - PLAY_AREA.left,
    PLAY_AREA.bottom - PLAY_AREA.top,
    16,
  );

  table.fillStyle(0xffffff, 0.022);
  for (let y = PLAY_AREA.top + 12; y < PLAY_AREA.bottom; y += 12) {
    table.fillRect(PLAY_AREA.left + 12, y, PLAY_AREA.right - PLAY_AREA.left - 24, 1);
  }

  table.lineStyle(1, 0xffffff, 0.055);
  for (let x = PLAY_AREA.left + 20; x < PLAY_AREA.right; x += 30) {
    table.beginPath();
    table.moveTo(x, PLAY_AREA.top + 12);
    table.lineTo(x + 24, PLAY_AREA.bottom - 12);
    table.strokePath();
  }

  for (const pocket of POCKETS) {
    table.fillStyle(0x000000, 1);
    table.fillCircle(pocket.x, pocket.y, TABLE.pocketRadius + 5);
    table.fillStyle(0x140b06, 0.7);
    table.fillCircle(pocket.x, pocket.y + 4, TABLE.pocketRadius + 1);
    table.lineStyle(4, 0x2a1408, 0.95);
    table.strokeCircle(pocket.x, pocket.y, TABLE.pocketRadius + 1);
  }
}

export function drawCueStick(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  angle: number,
  pullback: number,
): void {
  graphics.clear();
  graphics.setDepth(6);
  graphics.save();
  graphics.translateCanvas(x, y);
  graphics.rotateCanvas(angle);

  graphics.lineStyle(11, 0x000000, 0.2);
  graphics.beginPath();
  graphics.moveTo(-pullback - 350, 8);
  graphics.lineTo(-pullback - 14, 2);
  graphics.strokePath();

  graphics.lineStyle(10, 0x3a1f10, 1);
  graphics.beginPath();
  graphics.moveTo(-pullback - 350, 0);
  graphics.lineTo(-pullback - 250, 0);
  graphics.strokePath();

  graphics.lineStyle(7, 0x7d4b25, 1);
  graphics.beginPath();
  graphics.moveTo(-pullback - 250, 0);
  graphics.lineTo(-pullback - 34, 0);
  graphics.strokePath();

  graphics.lineStyle(3, 0xd7b071, 0.95);
  graphics.beginPath();
  graphics.moveTo(-pullback - 240, -2);
  graphics.lineTo(-pullback - 42, -2);
  graphics.strokePath();

  graphics.lineStyle(7, 0xd8d0bd, 1);
  graphics.beginPath();
  graphics.moveTo(-pullback - 34, 0);
  graphics.lineTo(-pullback - 16, 0);
  graphics.strokePath();

  graphics.lineStyle(6, 0x2b1a0f, 1);
  graphics.beginPath();
  graphics.moveTo(-pullback - 16, 0);
  graphics.lineTo(-pullback - 6, 0);
  graphics.strokePath();

  graphics.restore();
}
