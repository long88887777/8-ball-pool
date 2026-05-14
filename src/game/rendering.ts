import Phaser from 'phaser';
import { BALL_RADIUS, PLAY_AREA, POCKETS, TABLE } from './constants';
import { breakLineX } from './geometry';

export type BallTextureOptions = {
  key: string;
  fill: string;
  label?: string;
  stripe?: boolean;
  cueSpot?: boolean;
};

export function createBallTexture(scene: Phaser.Scene, options: BallTextureOptions): void {
  const size = BALL_RADIUS * 2 + 14;
  const texture = scene.textures.createCanvas(options.key, size, size);
  const canvas = texture?.getSourceImage() as HTMLCanvasElement | undefined;
  const context = canvas?.getContext('2d');

  if (!texture || !context) {
    return;
  }

  const center = size / 2;
  context.clearRect(0, 0, size, size);

  const shadowGrad = context.createRadialGradient(center + 1, center + 2, BALL_RADIUS * 0.3, center + 1, center + 2, BALL_RADIUS * 1.1);
  shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
  shadowGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.12)');
  shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = shadowGrad;
  context.beginPath();
  context.ellipse(center + 1, center + 2, BALL_RADIUS * 1.05, BALL_RADIUS * 0.85, 0, 0, Math.PI * 2);
  context.fill();

  context.save();
  context.beginPath();
  context.arc(center, center, BALL_RADIUS, 0, Math.PI * 2);
  context.clip();

  const base = context.createRadialGradient(center - 4, center - 5, 0, center + 2, center + 3, BALL_RADIUS * 1.4);
  base.addColorStop(0, tintColor(options.fill, 60));
  base.addColorStop(0.12, options.stripe ? '#fff4df' : tintColor(options.fill, 28));
  base.addColorStop(0.45, options.fill);
  base.addColorStop(0.78, shadeColor(options.fill, -30));
  base.addColorStop(1, shadeColor(options.fill, -65));
  context.fillStyle = base;
  context.fillRect(center - BALL_RADIUS, center - BALL_RADIUS, BALL_RADIUS * 2, BALL_RADIUS * 2);

  if (options.stripe) {
    const stripeHeight = BALL_RADIUS * 1.08;
    context.fillStyle = '#f5ead2';
    context.fillRect(center - BALL_RADIUS, center - BALL_RADIUS, BALL_RADIUS * 2, BALL_RADIUS * 2);

    const stripe = context.createLinearGradient(center - BALL_RADIUS, center, center + BALL_RADIUS, center);
    stripe.addColorStop(0, shadeColor(options.fill, -42));
    stripe.addColorStop(0.22, options.fill);
    stripe.addColorStop(0.56, tintColor(options.fill, 18));
    stripe.addColorStop(1, shadeColor(options.fill, -36));
    context.fillStyle = stripe;
    context.fillRect(center - BALL_RADIUS, center - stripeHeight / 2, BALL_RADIUS * 2, stripeHeight);

    context.strokeStyle = 'rgba(75, 46, 22, 0.2)';
    context.lineWidth = 1;
    context.beginPath();
    context.ellipse(center, center - stripeHeight / 2, BALL_RADIUS * 0.92, 2.1, 0, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.ellipse(center, center + stripeHeight / 2, BALL_RADIUS * 0.92, 2.1, 0, 0, Math.PI * 2);
    context.stroke();
  }

  drawRollingLatitudeLines(context, center);

  const shade = context.createRadialGradient(center - 4, center - 5, 0, center, center, BALL_RADIUS);
  shade.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
  shade.addColorStop(0.3, 'rgba(255, 255, 255, 0.08)');
  shade.addColorStop(0.7, 'rgba(0, 0, 0, 0.05)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
  context.fillStyle = shade;
  context.beginPath();
  context.arc(center, center, BALL_RADIUS - 0.5, 0, Math.PI * 2);
  context.fill();

  if (options.cueSpot) {
    context.fillStyle = '#d7352d';
    context.beginPath();
    context.arc(center, center, BALL_RADIUS * 0.18, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = 'rgba(255, 244, 224, 0.42)';
    context.beginPath();
    context.arc(center - 0.9, center - 1.1, BALL_RADIUS * 0.07, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = 'rgba(255, 255, 255, 0.82)';
  context.beginPath();
  context.arc(center - 4, center - 5, BALL_RADIUS * 0.15, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = 'rgba(255, 255, 255, 0.22)';
  context.beginPath();
  context.arc(center - 3, center - 4, BALL_RADIUS * 0.32, 0, Math.PI * 2);
  context.fill();

  if (options.label) {
    context.fillStyle = 'rgba(248, 236, 214, 0.98)';
    context.beginPath();
    context.arc(center, center, BALL_RADIUS * 0.43, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = '#20160f';
    context.font = 'bold 11px Georgia, serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(options.label, center, center + 0.5);
  }

  context.restore();

  context.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  context.lineWidth = 1;
  context.beginPath();
  context.arc(center, center, BALL_RADIUS - 1, 0, Math.PI * 2);
  context.stroke();

  texture.refresh();
}

function drawRollingLatitudeLines(context: CanvasRenderingContext2D, center: number): void {
  context.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  context.lineWidth = 0.8;
  for (const offset of [-8, -3, 4, 9]) {
    const width = BALL_RADIUS * (0.68 + Math.abs(offset) * 0.022);
    context.beginPath();
    context.ellipse(center, center + offset, width, 2.2, -0.26, 0.12 * Math.PI, 0.88 * Math.PI);
    context.stroke();
  }

  context.strokeStyle = 'rgba(25, 18, 12, 0.14)';
  for (const offset of [-6, 7]) {
    context.beginPath();
    context.ellipse(center, center + offset, BALL_RADIUS * 0.82, 2.5, 0.18, Math.PI, Math.PI * 1.9);
    context.stroke();
  }
}

function shadeColor(hex: string, amount: number): string {
  return shiftHexColor(hex, amount);
}

function tintColor(hex: string, amount: number): string {
  return shiftHexColor(hex, amount);
}

function shiftHexColor(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(value)) {
    return hex;
  }

  const channels = [0, 2, 4].map((start) => {
    const next = Number.parseInt(value.slice(start, start + 2), 16) + amount;
    return Math.max(0, Math.min(255, next)).toString(16).padStart(2, '0');
  });

  return `#${channels.join('')}`;
}

export function drawPoolHall(scene: Phaser.Scene): void {
  const room = scene.add.graphics().setDepth(0);
  room.fillGradientStyle(0x1a1210, 0x1a1210, 0x060404, 0x060404, 1);
  room.fillRect(0, 0, TABLE.width, TABLE.height);

  room.fillStyle(0xffffff, 0.015);
  room.fillRect(TABLE.width * 0.2, 0, TABLE.width * 0.6, TABLE.height * 0.15);
}

export function drawRefinedTable(scene: Phaser.Scene): void {
  const table = scene.add.graphics().setDepth(1);
  const playW = PLAY_AREA.right - PLAY_AREA.left;
  const playH = PLAY_AREA.bottom - PLAY_AREA.top;

  table.fillStyle(0x050302, 1);
  table.fillRoundedRect(26, 28, TABLE.width - 52, TABLE.height - 56, 22);

  table.fillGradientStyle(0x1a0c08, 0x140a06, 0x100804, 0x180b07, 1);
  table.fillRoundedRect(29, 31, TABLE.width - 58, TABLE.height - 62, 20);

  table.fillGradientStyle(0x6b2e1a, 0x5a2414, 0x4a1c10, 0x602818, 1);
  table.fillRoundedRect(32, 34, TABLE.width - 64, TABLE.height - 68, 18);

  table.fillGradientStyle(0x8c4228, 0x7a3620, 0x682c18, 0x843e24, 1);
  table.fillRoundedRect(36, 38, TABLE.width - 72, TABLE.height - 76, 16);

  table.fillGradientStyle(0x9e5030, 0x8a4226, 0x76381e, 0x944a2c, 1);
  table.fillRoundedRect(40, 42, TABLE.width - 80, TABLE.height - 84, 14);

  table.fillStyle(0xb86840, 0.12);
  table.fillRoundedRect(40, 42, TABLE.width - 80, (TABLE.height - 84) * 0.35, 14);

  table.fillStyle(0x1a0a04, 0.15);
  table.fillRoundedRect(40, TABLE.height - 42 - (TABLE.height - 84) * 0.25, TABLE.width - 80, (TABLE.height - 84) * 0.25, 14);

  drawWoodGrain(table);

  table.lineStyle(2, 0xc87850, 0.3);
  table.strokeRoundedRect(40, 42, TABLE.width - 80, TABLE.height - 84, 14);

  table.lineStyle(1.5, 0xd4885c, 0.15);
  table.strokeRoundedRect(42, 44, TABLE.width - 84, TABLE.height - 88, 13);

  table.lineStyle(1.5, 0x2a0e06, 0.6);
  table.strokeRoundedRect(32, 34, TABLE.width - 64, TABLE.height - 68, 18);

  table.lineStyle(1, 0x3a1a0e, 0.4);
  table.strokeRoundedRect(29, 31, TABLE.width - 58, TABLE.height - 62, 20);

  table.fillGradientStyle(0x0e5c68, 0x0c5460, 0x0a4e5a, 0x106066, 1);
  table.fillRect(PLAY_AREA.left - 16, PLAY_AREA.top - 16, playW + 32, playH + 32);

  table.fillGradientStyle(0x1a7a88, 0x187282, 0x156c7a, 0x1c7e8c, 1);
  table.fillRect(PLAY_AREA.left, PLAY_AREA.top, playW, playH);

  table.fillGradientStyle(0x1e8290, 0x1a7a88, 0x167080, 0x1c7e8c, 0.15, 0.15, 0, 0);
  table.fillRect(PLAY_AREA.left, PLAY_AREA.top, playW, playH * 0.4);

  table.fillStyle(0x000000, 0.06);
  table.fillRect(PLAY_AREA.left, PLAY_AREA.bottom - playH * 0.2, playW, playH * 0.2);

  table.fillStyle(0x000000, 0.03);
  table.fillRect(PLAY_AREA.left, PLAY_AREA.top, 30, playH);
  table.fillRect(PLAY_AREA.right - 30, PLAY_AREA.top, 30, playH);

  drawFeltTexture(table, playW, playH);

  drawCushionRails(table);
  drawPockets(table);
  drawPocketNets(table);
  drawSightingDots(table);

  const breakX = breakLineX();
  table.lineStyle(1.5, 0x8ecad8, 0.25);
  table.beginPath();
  table.moveTo(breakX, PLAY_AREA.top + 6);
  table.lineTo(breakX, PLAY_AREA.bottom - 6);
  table.strokePath();
  table.fillStyle(0x8ecad8, 0.5);
  table.fillCircle(breakX, TABLE.height / 2, 2.5);
}

function drawWoodGrain(table: Phaser.GameObjects.Graphics): void {
  const seed = 42;
  const pr = (i: number) => ((i * 1103515245 + seed) & 0x7fffffff) / 0x7fffffff;

  const frameLeft = 34;
  const frameRight = TABLE.width - 34;
  const frameTop = 36;
  const frameBot = TABLE.height - 36;
  const innerLeft = PLAY_AREA.left - 14;
  const innerRight = PLAY_AREA.right + 14;
  const innerTop = PLAY_AREA.top - 14;
  const innerBot = PLAY_AREA.bottom + 14;

  // --- Left rail: horizontal grain ---
  for (let y = frameTop; y < frameBot; y += 2) {
    const n = pr(y * 7 + 1);
    const drift = Math.sin(y * 0.04 + n * 6) * 1.5 + (n - 0.5) * 1.2;
    const thick = 0.5 + n * 1.0;
    const bright = n > 0.7;
    const color = bright ? 0xc47848 : (n < 0.3 ? 0x3a1608 : 0x8a4020);
    const alpha = bright ? 0.22 : (n < 0.3 ? 0.25 : 0.18);
    table.lineStyle(thick, color, alpha);
    table.beginPath();
    table.moveTo(frameLeft, y + drift);
    table.lineTo(innerLeft, y + drift * 0.6);
    table.strokePath();
  }

  // --- Right rail: horizontal grain ---
  for (let y = frameTop; y < frameBot; y += 2) {
    const n = pr(y * 7 + 500);
    const drift = Math.sin(y * 0.035 + n * 5) * 1.8 + (n - 0.5) * 1.0;
    const thick = 0.5 + n * 1.0;
    const bright = n > 0.7;
    const color = bright ? 0xc47848 : (n < 0.3 ? 0x3a1608 : 0x8a4020);
    const alpha = bright ? 0.22 : (n < 0.3 ? 0.25 : 0.18);
    table.lineStyle(thick, color, alpha);
    table.beginPath();
    table.moveTo(innerRight, y + drift);
    table.lineTo(frameRight, y + drift * 0.6);
    table.strokePath();
  }

  // --- Top rail: vertical grain ---
  for (let x = frameLeft; x < frameRight; x += 2) {
    const n = pr(x * 11 + 200);
    const drift = Math.sin(x * 0.03 + n * 4) * 1.5 + (n - 0.5) * 1.0;
    const thick = 0.5 + n * 1.0;
    const bright = n > 0.7;
    const color = bright ? 0xc47848 : (n < 0.3 ? 0x3a1608 : 0x8a4020);
    const alpha = bright ? 0.22 : (n < 0.3 ? 0.25 : 0.18);
    table.lineStyle(thick, color, alpha);
    table.beginPath();
    table.moveTo(x + drift, frameTop);
    table.lineTo(x + drift * 0.6, innerTop);
    table.strokePath();
  }

  // --- Bottom rail: vertical grain ---
  for (let x = frameLeft; x < frameRight; x += 2) {
    const n = pr(x * 11 + 800);
    const drift = Math.sin(x * 0.028 + n * 5) * 1.6 + (n - 0.5) * 1.2;
    const thick = 0.5 + n * 1.0;
    const bright = n > 0.7;
    const color = bright ? 0xc47848 : (n < 0.3 ? 0x3a1608 : 0x8a4020);
    const alpha = bright ? 0.22 : (n < 0.3 ? 0.25 : 0.18);
    table.lineStyle(thick, color, alpha);
    table.beginPath();
    table.moveTo(x + drift, innerBot);
    table.lineTo(x + drift * 0.6, frameBot);
    table.strokePath();
  }

  // --- Darker grain lines (annual rings) ---
  table.lineStyle(1.2, 0x2a0e04, 0.18);
  for (let y = frameTop + 8; y < frameBot; y += 12 + pr(y) * 8) {
    const wave = pr(y * 3 + 50) * 2;
    table.beginPath();
    table.moveTo(frameLeft + 2, y + wave);
    table.lineTo(innerLeft - 2, y + wave * 0.4);
    table.strokePath();
    table.beginPath();
    table.moveTo(innerRight + 2, y + wave);
    table.lineTo(frameRight - 2, y + wave * 0.4);
    table.strokePath();
  }
  for (let x = frameLeft + 8; x < frameRight; x += 12 + pr(x + 77) * 8) {
    const wave = pr(x * 3 + 150) * 2;
    table.beginPath();
    table.moveTo(x + wave, frameTop + 2);
    table.lineTo(x + wave * 0.4, innerTop - 2);
    table.strokePath();
    table.beginPath();
    table.moveTo(x + wave, innerBot + 2);
    table.lineTo(x + wave * 0.4, frameBot - 2);
    table.strokePath();
  }

  // --- Wood knots on side rails ---
  for (let k = 0; k < 4; k++) {
    const ky = frameTop + 30 + pr(k * 37 + 5) * (frameBot - frameTop - 60);
    const kxL = frameLeft + 4 + pr(k * 13) * (innerLeft - frameLeft - 12);
    const kxR = innerRight + 4 + pr(k * 19 + 9) * (frameRight - innerRight - 12);
    const rw = 5 + pr(k * 7) * 4;
    const rh = 3 + pr(k * 11) * 2;
    table.fillStyle(0x3a1608, 0.2);
    table.fillEllipse(kxL, ky, rw, rh);
    table.lineStyle(0.8, 0x2a0e04, 0.25);
    table.strokeEllipse(kxL, ky, rw + 2, rh + 1);
    table.fillStyle(0x3a1608, 0.18);
    table.fillEllipse(kxR, ky + 10, rw * 0.9, rh * 0.9);
    table.lineStyle(0.8, 0x2a0e04, 0.22);
    table.strokeEllipse(kxR, ky + 10, rw * 0.9 + 2, rh * 0.9 + 1);
  }

  // --- Wood knots on top/bottom rails ---
  for (let k = 0; k < 5; k++) {
    const kx = frameLeft + 50 + pr(k * 41 + 20) * (frameRight - frameLeft - 100);
    const kyT = frameTop + 3 + pr(k * 29 + 2) * (innerTop - frameTop - 8);
    const kyB = innerBot + 3 + pr(k * 23 + 15) * (frameBot - innerBot - 8);
    const rw = 4 + pr(k * 9 + 1) * 4;
    const rh = 3 + pr(k * 7 + 3) * 2;
    table.fillStyle(0x3a1608, 0.2);
    table.fillEllipse(kx, kyT, rw, rh);
    table.lineStyle(0.8, 0x2a0e04, 0.25);
    table.strokeEllipse(kx, kyT, rw + 2, rh + 1);
    table.fillStyle(0x3a1608, 0.18);
    table.fillEllipse(kx + 30, kyB, rw * 0.85, rh * 0.85);
    table.lineStyle(0.8, 0x2a0e04, 0.22);
    table.strokeEllipse(kx + 30, kyB, rw * 0.85 + 2, rh * 0.85 + 1);
  }

  // --- Highlight streaks (polished wood sheen) ---
  table.lineStyle(1, 0xd4945c, 0.08);
  for (let y = frameTop + 5; y < frameBot; y += 18 + pr(y + 999) * 12) {
    table.beginPath();
    table.moveTo(frameLeft + 3, y);
    table.lineTo(innerLeft - 3, y + 0.5);
    table.strokePath();
    table.beginPath();
    table.moveTo(innerRight + 3, y);
    table.lineTo(frameRight - 3, y + 0.5);
    table.strokePath();
  }
  table.lineStyle(1, 0xd4945c, 0.08);
  for (let x = frameLeft + 5; x < frameRight; x += 18 + pr(x + 777) * 12) {
    table.beginPath();
    table.moveTo(x, frameTop + 3);
    table.lineTo(x + 0.5, innerTop - 3);
    table.strokePath();
    table.beginPath();
    table.moveTo(x, innerBot + 3);
    table.lineTo(x + 0.5, frameBot - 3);
    table.strokePath();
  }
}

function drawFeltTexture(table: Phaser.GameObjects.Graphics, playW: number, playH: number): void {
  table.lineStyle(0.4, 0x0d5560, 0.07);
  for (let y = PLAY_AREA.top + 2; y < PLAY_AREA.bottom; y += 3) {
    table.beginPath();
    table.moveTo(PLAY_AREA.left + 2, y);
    table.lineTo(PLAY_AREA.right - 2, y);
    table.strokePath();
  }

  table.lineStyle(0.3, 0x0a4a54, 0.04);
  for (let y = PLAY_AREA.top + 3.5; y < PLAY_AREA.bottom; y += 3) {
    table.beginPath();
    table.moveTo(PLAY_AREA.left + 2, y);
    table.lineTo(PLAY_AREA.right - 2, y);
    table.strokePath();
  }

  table.lineStyle(0.25, 0x1a8a98, 0.025);
  for (let x = PLAY_AREA.left + 4; x < PLAY_AREA.right; x += 6) {
    table.beginPath();
    table.moveTo(x, PLAY_AREA.top + 2);
    table.lineTo(x, PLAY_AREA.bottom - 2);
    table.strokePath();
  }

  table.fillStyle(0x228898, 0.04);
  table.fillRect(PLAY_AREA.left + playW * 0.15, PLAY_AREA.top + playH * 0.1, playW * 0.7, playH * 0.3);

  table.fillStyle(0x0a4048, 0.03);
  table.fillRect(PLAY_AREA.left + playW * 0.1, PLAY_AREA.bottom - playH * 0.35, playW * 0.8, playH * 0.25);
}

function drawPocketNets(table: Phaser.GameObjects.Graphics): void {
  const cornerR = TABLE.pocketRadius + 8;
  const middleR = TABLE.pocketRadius + 6;
  const holeR = BALL_RADIUS * 0.7;
  const netColor = 0xffffff;
  const netAlpha = 0.6;
  const netWidth = 0.8;
  const segments = 12;

  for (let i = 0; i < POCKETS.length; i++) {
    const pocket = POCKETS[i];
    const isMiddle = i === 1 || i === 4;
    const r = isMiddle ? middleR - 2 : cornerR - 2;

    const rimPoints: { x: number; y: number }[] = [];

    if (isMiddle) {
      const isTop = i === 1;
      const startA = isTop ? Math.PI : 0;
      const endA = isTop ? 2 * Math.PI : Math.PI;
      for (let s = 0; s <= segments; s++) {
        const a = startA + (endA - startA) * (s / segments);
        rimPoints.push({ x: pocket.x + Math.cos(a) * r, y: pocket.y + Math.sin(a) * r });
      }
    } else {
      for (let s = 0; s <= segments; s++) {
        const a = (Math.PI * 2 * s) / segments;
        rimPoints.push({ x: pocket.x + Math.cos(a) * r, y: pocket.y + Math.sin(a) * r });
      }
    }

    const cx = pocket.x;
    const cy = isMiddle
      ? pocket.y + (i === 1 ? -1 : 1) * holeR * 0.3
      : pocket.y;

    const holePoints: { x: number; y: number }[] = [];
    const holeSegs = 8;
    if (isMiddle) {
      const isTop = i === 1;
      const startA = isTop ? Math.PI : 0;
      const endA = isTop ? 2 * Math.PI : Math.PI;
      for (let s = 0; s <= holeSegs; s++) {
        const a = startA + (endA - startA) * (s / holeSegs);
        holePoints.push({ x: cx + Math.cos(a) * holeR, y: cy + Math.sin(a) * holeR });
      }
    } else {
      for (let s = 0; s <= holeSegs; s++) {
        const a = (Math.PI * 2 * s) / holeSegs;
        holePoints.push({ x: cx + Math.cos(a) * holeR, y: cy + Math.sin(a) * holeR });
      }
    }

    table.lineStyle(netWidth, netColor, netAlpha);
    const rimLen = isMiddle ? rimPoints.length : rimPoints.length - 1;
    for (let ri = 0; ri < rimLen; ri++) {
      const rp = rimPoints[ri];
      let closest = 0;
      let minDist = Infinity;
      for (let hi = 0; hi < holePoints.length; hi++) {
        const dx = rp.x - holePoints[hi].x;
        const dy = rp.y - holePoints[hi].y;
        const dist = dx * dx + dy * dy;
        if (dist < minDist) { minDist = dist; closest = hi; }
      }
      const hp = holePoints[closest];
      const midX = (rp.x + hp.x) / 2;
      const midY = (rp.y + hp.y) / 2 + 2;
      table.beginPath();
      table.moveTo(rp.x, rp.y);
      table.lineTo(midX, midY);
      table.lineTo(hp.x, hp.y);
      table.strokePath();
    }

    const diamondRings = 2;
    for (let ring = 1; ring <= diamondRings; ring++) {
      const t = ring / (diamondRings + 1);
      const ringPoints: { x: number; y: number }[] = [];
      for (let ri = 0; ri < rimLen; ri++) {
        const rp = rimPoints[ri];
        let closest = 0;
        let minDist = Infinity;
        for (let hi = 0; hi < holePoints.length; hi++) {
          const dx = rp.x - holePoints[hi].x;
          const dy = rp.y - holePoints[hi].y;
          const dist = dx * dx + dy * dy;
          if (dist < minDist) { minDist = dist; closest = hi; }
        }
        const hp = holePoints[closest];
        ringPoints.push({
          x: rp.x + (hp.x - rp.x) * t,
          y: rp.y + (hp.y - rp.y) * t + 2 * Math.sin(t * Math.PI),
        });
      }
      table.lineStyle(netWidth * 0.8, netColor, netAlpha * 0.8);
      for (let k = 0; k < ringPoints.length - 1; k++) {
        table.beginPath();
        table.moveTo(ringPoints[k].x, ringPoints[k].y);
        table.lineTo(ringPoints[k + 1].x, ringPoints[k + 1].y);
        table.strokePath();
      }
    }

    table.lineStyle(1.2, netColor, netAlpha * 0.9);
    if (isMiddle) {
      const isTop = i === 1;
      const startA = isTop ? Math.PI : 0;
      const endA = isTop ? 2 * Math.PI : Math.PI;
      table.beginPath();
      table.arc(cx, cy, holeR, startA, endA, false);
      table.strokePath();
    } else {
      table.beginPath();
      table.arc(cx, cy, holeR, 0, Math.PI * 2, false);
      table.strokePath();
    }
  }
}

export function drawPocketNetDeformation(
  graphics: Phaser.GameObjects.Graphics,
  pocketIndex: number,
  progress: number,
): void {
  const pocket = POCKETS[pocketIndex];
  const isMiddle = pocketIndex === 1 || pocketIndex === 4;
  const cornerR = TABLE.pocketRadius + 8;
  const middleR = TABLE.pocketRadius + 6;
  const r = isMiddle ? middleR - 2 : cornerR - 2;
  const holeR = BALL_RADIUS * 0.7;
  const segments = 12;
  const netColor = 0xffffff;

  const stretch = Math.sin(progress * Math.PI);
  const maxSag = BALL_RADIUS * 1.2;
  const sag = stretch * maxSag;

  graphics.clear();

  const rimPoints: { x: number; y: number }[] = [];
  if (isMiddle) {
    const isTop = pocketIndex === 1;
    const startA = isTop ? Math.PI : 0;
    const endA = isTop ? 2 * Math.PI : Math.PI;
    for (let s = 0; s <= segments; s++) {
      const a = startA + (endA - startA) * (s / segments);
      rimPoints.push({ x: pocket.x + Math.cos(a) * r, y: pocket.y + Math.sin(a) * r });
    }
  } else {
    for (let s = 0; s <= segments; s++) {
      const a = (Math.PI * 2 * s) / segments;
      rimPoints.push({ x: pocket.x + Math.cos(a) * r, y: pocket.y + Math.sin(a) * r });
    }
  }

  const cx = pocket.x;
  const cy = pocket.y + sag * 0.3;

  const holeSegs = 8;
  const holePoints: { x: number; y: number }[] = [];
  if (isMiddle) {
    const isTop = pocketIndex === 1;
    const dir = isTop ? -1 : 1;
    const holeCy = pocket.y + dir * holeR * 0.3 + dir * sag * 0.5;
    const startA = isTop ? Math.PI : 0;
    const endA = isTop ? 2 * Math.PI : Math.PI;
    for (let s = 0; s <= holeSegs; s++) {
      const a = startA + (endA - startA) * (s / holeSegs);
      holePoints.push({
        x: cx + Math.cos(a) * (holeR + stretch * 3),
        y: holeCy + Math.sin(a) * (holeR + stretch * 3),
      });
    }
  } else {
    for (let s = 0; s <= holeSegs; s++) {
      const a = (Math.PI * 2 * s) / holeSegs;
      holePoints.push({
        x: cx + Math.cos(a) * (holeR + stretch * 3),
        y: cy + Math.sin(a) * (holeR + stretch * 3) + sag * 0.4,
      });
    }
  }

  const rimLen = isMiddle ? rimPoints.length : rimPoints.length - 1;
  for (let ri = 0; ri < rimLen; ri++) {
    const rp = rimPoints[ri];
    let closest = 0;
    let minDist = Infinity;
    for (let hi = 0; hi < holePoints.length; hi++) {
      const dx = rp.x - holePoints[hi].x;
      const dy = rp.y - holePoints[hi].y;
      const dist = dx * dx + dy * dy;
      if (dist < minDist) { minDist = dist; closest = hi; }
    }
    const hp = holePoints[closest];
    const midX = (rp.x + hp.x) / 2;
    const midY = (rp.y + hp.y) / 2 + sag * 0.6;
    graphics.lineStyle(0.8, netColor, 0.6);
    graphics.beginPath();
    graphics.moveTo(rp.x, rp.y);
    graphics.lineTo(midX, midY);
    graphics.lineTo(hp.x, hp.y);
    graphics.strokePath();
  }

  const diamondRings = 2;
  for (let ring = 1; ring <= diamondRings; ring++) {
    const t = ring / (diamondRings + 1);
    const ringPoints: { x: number; y: number }[] = [];
    for (let ri = 0; ri < rimLen; ri++) {
      const rp = rimPoints[ri];
      let closest = 0;
      let minDist = Infinity;
      for (let hi = 0; hi < holePoints.length; hi++) {
        const dx = rp.x - holePoints[hi].x;
        const dy = rp.y - holePoints[hi].y;
        const dist = dx * dx + dy * dy;
        if (dist < minDist) { minDist = dist; closest = hi; }
      }
      const hp = holePoints[closest];
      ringPoints.push({
        x: rp.x + (hp.x - rp.x) * t,
        y: rp.y + (hp.y - rp.y) * t + sag * t * 0.8,
      });
    }
    graphics.lineStyle(0.7, netColor, 0.5);
    for (let k = 0; k < ringPoints.length - 1; k++) {
      graphics.beginPath();
      graphics.moveTo(ringPoints[k].x, ringPoints[k].y);
      graphics.lineTo(ringPoints[k + 1].x, ringPoints[k + 1].y);
      graphics.strokePath();
    }
  }

  graphics.lineStyle(1.2, netColor, 0.7);
  if (isMiddle) {
    const isTop = pocketIndex === 1;
    const startA = isTop ? Math.PI : 0;
    const endA = isTop ? 2 * Math.PI : Math.PI;
    const holeCy = holePoints[Math.floor(holeSegs / 2)]?.y ?? cy;
    graphics.beginPath();
    graphics.arc(cx, holeCy, holeR + stretch * 3, startA, endA, false);
    graphics.strokePath();
  } else {
    graphics.beginPath();
    graphics.arc(cx, cy + sag * 0.4, holeR + stretch * 3, 0, Math.PI * 2, false);
    graphics.strokePath();
  }
}

function drawSightingDots(table: Phaser.GameObjects.Graphics): void {
  const dotRadius = 4;
  const railMid = (PLAY_AREA.left - 14 + PLAY_AREA.left) / 2;
  const railMidR = (PLAY_AREA.right + PLAY_AREA.right + 14) / 2;
  const railMidT = (PLAY_AREA.top - 14 + PLAY_AREA.top) / 2;
  const railMidB = (PLAY_AREA.bottom + PLAY_AREA.bottom + 14) / 2;

  const playW = PLAY_AREA.right - PLAY_AREA.left;
  const playH = PLAY_AREA.bottom - PLAY_AREA.top;

  table.fillStyle(0xf0e8d0, 0.7);

  for (let i = 1; i <= 3; i++) {
    const y = PLAY_AREA.top + (playH * i) / 4;
    table.fillCircle(railMid, y, dotRadius);
    table.fillCircle(railMidR, y, dotRadius);
  }

  for (let i = 1; i <= 7; i++) {
    if (i === 4) continue;
    const x = PLAY_AREA.left + (playW * i) / 8;
    table.fillCircle(x, railMidT, dotRadius);
    table.fillCircle(x, railMidB, dotRadius);
  }
}

function drawCushionRails(table: Phaser.GameObjects.Graphics): void {
  const cw = 16;
  const pocketClearance = 38;
  const jawAngle = 12;
  const midX = TABLE.width / 2;

  const topY = PLAY_AREA.top - cw;
  const botY = PLAY_AREA.bottom;
  const leftX = PLAY_AREA.left - cw;
  const rightX = PLAY_AREA.right;

  table.fillStyle(0x3d9aae, 1);

  table.beginPath();
  table.moveTo(PLAY_AREA.left + pocketClearance + jawAngle, topY);
  table.lineTo(midX - pocketClearance - jawAngle, topY);
  table.lineTo(midX - pocketClearance, PLAY_AREA.top);
  table.lineTo(PLAY_AREA.left + pocketClearance, PLAY_AREA.top);
  table.closePath();
  table.fillPath();

  table.beginPath();
  table.moveTo(midX + pocketClearance + jawAngle, topY);
  table.lineTo(PLAY_AREA.right - pocketClearance - jawAngle, topY);
  table.lineTo(PLAY_AREA.right - pocketClearance, PLAY_AREA.top);
  table.lineTo(midX + pocketClearance, PLAY_AREA.top);
  table.closePath();
  table.fillPath();

  table.beginPath();
  table.moveTo(PLAY_AREA.left + pocketClearance + jawAngle, botY + cw);
  table.lineTo(midX - pocketClearance - jawAngle, botY + cw);
  table.lineTo(midX - pocketClearance, PLAY_AREA.bottom);
  table.lineTo(PLAY_AREA.left + pocketClearance, PLAY_AREA.bottom);
  table.closePath();
  table.fillPath();

  table.beginPath();
  table.moveTo(midX + pocketClearance + jawAngle, botY + cw);
  table.lineTo(PLAY_AREA.right - pocketClearance - jawAngle, botY + cw);
  table.lineTo(PLAY_AREA.right - pocketClearance, PLAY_AREA.bottom);
  table.lineTo(midX + pocketClearance, PLAY_AREA.bottom);
  table.closePath();
  table.fillPath();

  table.beginPath();
  table.moveTo(leftX, PLAY_AREA.top + pocketClearance + jawAngle);
  table.lineTo(leftX, PLAY_AREA.bottom - pocketClearance - jawAngle);
  table.lineTo(PLAY_AREA.left, PLAY_AREA.bottom - pocketClearance);
  table.lineTo(PLAY_AREA.left, PLAY_AREA.top + pocketClearance);
  table.closePath();
  table.fillPath();

  table.beginPath();
  table.moveTo(rightX + cw, PLAY_AREA.top + pocketClearance + jawAngle);
  table.lineTo(rightX + cw, PLAY_AREA.bottom - pocketClearance - jawAngle);
  table.lineTo(PLAY_AREA.right, PLAY_AREA.bottom - pocketClearance);
  table.lineTo(PLAY_AREA.right, PLAY_AREA.top + pocketClearance);
  table.closePath();
  table.fillPath();

  table.fillStyle(0x4fb0c4, 0.4);
  table.beginPath();
  table.moveTo(PLAY_AREA.left + pocketClearance + jawAngle, topY);
  table.lineTo(midX - pocketClearance - jawAngle, topY);
  table.lineTo(midX - pocketClearance - jawAngle + 2, topY + 3);
  table.lineTo(PLAY_AREA.left + pocketClearance + jawAngle + 2, topY + 3);
  table.closePath();
  table.fillPath();
  table.beginPath();
  table.moveTo(midX + pocketClearance + jawAngle, topY);
  table.lineTo(PLAY_AREA.right - pocketClearance - jawAngle, topY);
  table.lineTo(PLAY_AREA.right - pocketClearance - jawAngle - 2, topY + 3);
  table.lineTo(midX + pocketClearance + jawAngle + 2, topY + 3);
  table.closePath();
  table.fillPath();

  table.fillStyle(0x3a8898, 0.5);
  table.beginPath();
  table.moveTo(PLAY_AREA.left + pocketClearance, PLAY_AREA.top);
  table.lineTo(midX - pocketClearance, PLAY_AREA.top);
  table.lineTo(midX - pocketClearance + 2, PLAY_AREA.top - 3);
  table.lineTo(PLAY_AREA.left + pocketClearance + 2, PLAY_AREA.top - 3);
  table.closePath();
  table.fillPath();
  table.beginPath();
  table.moveTo(midX + pocketClearance, PLAY_AREA.top);
  table.lineTo(PLAY_AREA.right - pocketClearance, PLAY_AREA.top);
  table.lineTo(PLAY_AREA.right - pocketClearance - 2, PLAY_AREA.top - 3);
  table.lineTo(midX + pocketClearance + 2, PLAY_AREA.top - 3);
  table.closePath();
  table.fillPath();

  table.lineStyle(1.5, 0x2a6878, 0.6);
  table.beginPath();
  table.moveTo(PLAY_AREA.left + pocketClearance, PLAY_AREA.top);
  table.lineTo(midX - pocketClearance, PLAY_AREA.top);
  table.strokePath();
  table.beginPath();
  table.moveTo(midX + pocketClearance, PLAY_AREA.top);
  table.lineTo(PLAY_AREA.right - pocketClearance, PLAY_AREA.top);
  table.strokePath();
  table.beginPath();
  table.moveTo(PLAY_AREA.left + pocketClearance, PLAY_AREA.bottom);
  table.lineTo(midX - pocketClearance, PLAY_AREA.bottom);
  table.strokePath();
  table.beginPath();
  table.moveTo(midX + pocketClearance, PLAY_AREA.bottom);
  table.lineTo(PLAY_AREA.right - pocketClearance, PLAY_AREA.bottom);
  table.strokePath();
  table.beginPath();
  table.moveTo(PLAY_AREA.left, PLAY_AREA.top + pocketClearance);
  table.lineTo(PLAY_AREA.left, PLAY_AREA.bottom - pocketClearance);
  table.strokePath();
  table.beginPath();
  table.moveTo(PLAY_AREA.right, PLAY_AREA.top + pocketClearance);
  table.lineTo(PLAY_AREA.right, PLAY_AREA.bottom - pocketClearance);
  table.strokePath();
}

function drawPockets(table: Phaser.GameObjects.Graphics): void {
  const cornerR = TABLE.pocketRadius + 8;
  const middleR = TABLE.pocketRadius + 6;

  for (let i = 0; i < POCKETS.length; i++) {
    const pocket = POCKETS[i];
    const isMiddle = i === 1 || i === 4;
    const r = isMiddle ? middleR : cornerR;

    if (isMiddle) {
      const isTop = i === 1;
      const startAngle = isTop ? Math.PI : 0;
      const endAngle = isTop ? 2 * Math.PI : Math.PI;

      table.fillStyle(0x0a0404, 1);
      table.beginPath();
      table.arc(pocket.x, pocket.y, r + 3, startAngle, endAngle, false);
      table.closePath();
      table.fillPath();

      table.fillStyle(0x000000, 1);
      table.beginPath();
      table.arc(pocket.x, pocket.y, r, startAngle, endAngle, false);
      table.closePath();
      table.fillPath();

      table.fillStyle(0x000000, 1);
      table.beginPath();
      table.arc(pocket.x, pocket.y, r - 4, startAngle, endAngle, false);
      table.closePath();
      table.fillPath();

      table.lineStyle(2.5, 0xb8a898, 0.85);
      table.beginPath();
      table.arc(pocket.x, pocket.y, r + 1, startAngle, endAngle, false);
      table.strokePath();

      table.lineStyle(1.5, 0x2a1008, 0.7);
      table.beginPath();
      table.arc(pocket.x, pocket.y, r + 3, startAngle, endAngle, false);
      table.strokePath();

      table.lineStyle(2, 0xb8a898, 0.7);
      table.beginPath();
      table.moveTo(pocket.x - r - 1, pocket.y);
      table.lineTo(pocket.x + r + 1, pocket.y);
      table.strokePath();
    } else {
      table.fillStyle(0x0a0404, 1);
      table.fillCircle(pocket.x, pocket.y, r + 3);

      table.fillStyle(0x000000, 1);
      table.fillCircle(pocket.x, pocket.y, r);

      table.fillStyle(0x0c0202, 0.9);
      table.fillCircle(pocket.x, pocket.y + 1, r - 3);

      table.fillStyle(0x000000, 1);
      table.fillCircle(pocket.x, pocket.y, r - 4);

      table.lineStyle(2.5, 0xb8a898, 0.85);
      table.strokeCircle(pocket.x, pocket.y, r + 1);

      table.lineStyle(1, 0xd4c8b8, 0.35);
      table.strokeCircle(pocket.x, pocket.y, r - 1);

      table.lineStyle(1.5, 0x2a1008, 0.7);
      table.strokeCircle(pocket.x, pocket.y, r + 3);
    }
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

  const tipX = -pullback - 5;
  const ferruleStart = tipX - 18;
  const shaftStart = ferruleStart - 178;
  const jointStart = shaftStart - 18;
  const forearmStart = jointStart - 122;
  const wrapStart = forearmStart - 92;
  const buttX = wrapStart - 36;

  graphics.lineStyle(16, 0x000000, 0.28);
  graphics.beginPath();
  graphics.moveTo(buttX + 8, 8);
  graphics.lineTo(tipX, 3);
  graphics.strokePath();

  graphics.fillGradientStyle(0x100d0b, 0x2f2319, 0x050403, 0x18100b, 1);
  graphics.fillRoundedRect(buttX, -9, 36, 18, 8);
  graphics.lineStyle(2, 0xc79a58, 0.7);
  graphics.strokeRoundedRect(buttX + 2, -7, 32, 14, 6);
  graphics.fillStyle(0xd2a46a, 0.95);
  graphics.fillRect(buttX + 8, -8, 3, 16);
  graphics.fillRect(buttX + 27, -8, 3, 16);

  graphics.fillGradientStyle(0x11100f, 0x272321, 0x050505, 0x151313, 1);
  graphics.fillRoundedRect(wrapStart, -8, forearmStart - wrapStart, 16, 5);
  graphics.lineStyle(1, 0xffffff, 0.06);
  for (let markX = wrapStart + 6; markX < forearmStart - 4; markX += 7) {
    graphics.beginPath();
    graphics.moveTo(markX, -7);
    graphics.lineTo(markX + 10, 7);
    graphics.strokePath();
  }
  graphics.lineStyle(2, 0x0a0908, 0.9);
  graphics.strokeRoundedRect(wrapStart, -8, forearmStart - wrapStart, 16, 5);

  graphics.fillGradientStyle(0xe0a75d, 0xc07a34, 0x6b3519, 0x9e5a24, 1);
  graphics.fillRoundedRect(forearmStart, -7, jointStart - forearmStart, 14, 4);
  graphics.lineStyle(1, 0xf6d08d, 0.42);
  graphics.beginPath();
  graphics.moveTo(forearmStart + 10, -4);
  graphics.lineTo(jointStart - 8, -4);
  graphics.strokePath();
  graphics.beginPath();
  graphics.moveTo(forearmStart + 16, 4);
  graphics.lineTo(jointStart - 12, 3);
  graphics.strokePath();

  for (const inlayX of [forearmStart + 28, forearmStart + 82]) {
    graphics.fillStyle(0x14110e, 0.95);
    graphics.beginPath();
    graphics.moveTo(inlayX - 22, 0);
    graphics.lineTo(inlayX, -6);
    graphics.lineTo(inlayX + 22, 0);
    graphics.lineTo(inlayX, 6);
    graphics.closePath();
    graphics.fillPath();
    graphics.lineStyle(1, 0xf0c46f, 0.72);
    graphics.strokePath();

    graphics.fillStyle(0xe7b36d, 0.92);
    graphics.beginPath();
    graphics.moveTo(inlayX - 14, 0);
    graphics.lineTo(inlayX, -4);
    graphics.lineTo(inlayX + 14, 0);
    graphics.lineTo(inlayX, 4);
    graphics.closePath();
    graphics.fillPath();
  }

  graphics.fillStyle(0x17110c, 1);
  graphics.fillRoundedRect(jointStart, -8, shaftStart - jointStart, 16, 3);
  graphics.fillStyle(0xc6924e, 1);
  graphics.fillRect(jointStart + 3, -8, 3, 16);
  graphics.fillRect(shaftStart - 6, -8, 3, 16);

  graphics.fillStyle(0x17100b, 0.9);
  graphics.beginPath();
  graphics.moveTo(shaftStart - 1, -6);
  graphics.lineTo(ferruleStart + 1, -4);
  graphics.lineTo(ferruleStart + 1, 4);
  graphics.lineTo(shaftStart - 1, 6);
  graphics.closePath();
  graphics.fillPath();

  graphics.fillGradientStyle(0xe8b76f, 0xc6843d, 0x9a5625, 0xc98a45, 1);
  graphics.beginPath();
  graphics.moveTo(shaftStart, -5);
  graphics.lineTo(ferruleStart, -3);
  graphics.lineTo(ferruleStart, 3);
  graphics.lineTo(shaftStart, 5);
  graphics.closePath();
  graphics.fillPath();

  graphics.lineStyle(1, 0x6d3919, 0.42);
  for (let grainX = shaftStart + 12; grainX < ferruleStart - 14; grainX += 22) {
    graphics.beginPath();
    graphics.moveTo(grainX, 2.8);
    graphics.lineTo(grainX + 14, 1.2);
    graphics.strokePath();
  }

  graphics.lineStyle(1, 0xf8d99b, 0.62);
  graphics.beginPath();
  graphics.moveTo(shaftStart + 8, -2.6);
  graphics.lineTo(ferruleStart - 5, -1.4);
  graphics.strokePath();

  graphics.fillStyle(0x17110d, 0.96);
  graphics.fillRect(ferruleStart - 13, -5, 10, 10);
  graphics.fillStyle(0xd0a060, 1);
  graphics.fillRect(ferruleStart - 13, -5, 2, 10);
  graphics.fillRect(ferruleStart - 5, -5, 2, 10);
  graphics.lineStyle(1, 0xf5d49b, 0.55);
  graphics.beginPath();
  graphics.moveTo(ferruleStart - 11, -3);
  graphics.lineTo(ferruleStart - 5, 3);
  graphics.strokePath();

  graphics.fillStyle(0xd8d0bd, 1);
  graphics.fillRoundedRect(ferruleStart, -3.5, tipX - ferruleStart - 4, 7, 2);
  graphics.lineStyle(1, 0x3f3327, 0.55);
  graphics.strokeRoundedRect(ferruleStart, -3.5, tipX - ferruleStart - 4, 7, 2);
  graphics.fillStyle(0x5aa0b7, 1);
  graphics.fillRoundedRect(tipX - 4, -3, 4, 6, 2);

  graphics.restore();
}
