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

export function drawPoolHall(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const room = scene.add.graphics().setDepth(0);
  room.fillGradientStyle(0x172436, 0x0b121e, 0x05070c, 0x0b0e16, 1);
  room.fillRect(0, 0, TABLE.width, TABLE.height);

  room.fillGradientStyle(0x8fc7dc, 0x8fc7dc, 0x8fc7dc, 0x8fc7dc, 0.08);
  room.fillRect(TABLE.width * 0.18, 0, TABLE.width * 0.64, TABLE.height * 0.14);
  room.fillStyle(0x000000, 0.24);
  room.fillRect(0, TABLE.height * 0.84, TABLE.width, TABLE.height * 0.16);
  return room;
}

export function drawRefinedTable(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const table = scene.add.graphics().setDepth(1);
  const playW = PLAY_AREA.right - PLAY_AREA.left;
  const playH = PLAY_AREA.bottom - PLAY_AREA.top;

  // A real table reads as three stacked materials: a dark undercarriage,
  // warm hardwood rails, then the blue rubber cushion and cloth. Keeping the
  // layers separate also gives the pockets a believable lip to sit in.
  table.fillStyle(0x020406, 0.75);
  table.fillRoundedRect(18, 24, TABLE.width - 36, TABLE.height - 42, 26);

  table.fillGradientStyle(0x2c0b09, 0x160608, 0x090305, 0x210907, 1);
  table.fillRoundedRect(22, 18, TABLE.width - 44, TABLE.height - 36, 24);

  table.fillGradientStyle(0x7d2718, 0x4a120d, 0x2f0b09, 0x641b12, 1);
  table.fillRoundedRect(28, 24, TABLE.width - 56, TABLE.height - 48, 20);

  table.fillGradientStyle(0xb04727, 0x7f2418, 0x54130f, 0x982f1c, 1);
  table.fillRoundedRect(34, 30, TABLE.width - 68, TABLE.height - 60, 17);

  table.fillStyle(0xf08b55, 0.1);
  table.fillRoundedRect(38, 34, TABLE.width - 76, (TABLE.height - 68) * 0.3, 14);
  table.fillStyle(0x160405, 0.22);
  table.fillRoundedRect(38, TABLE.height - 34 - (TABLE.height - 68) * 0.22, TABLE.width - 76, (TABLE.height - 68) * 0.22, 14);

  drawWoodGrain(table);

  table.lineStyle(2, 0xe77f4a, 0.36);
  table.strokeRoundedRect(34, 30, TABLE.width - 68, TABLE.height - 60, 17);
  table.lineStyle(2, 0x180504, 0.74);
  table.strokeRoundedRect(28, 24, TABLE.width - 56, TABLE.height - 48, 20);

  table.fillStyle(0x061321, 0.96);
  table.fillRoundedRect(PLAY_AREA.left - 24, PLAY_AREA.top - 24, playW + 48, playH + 48, 12);

  table.fillGradientStyle(0x369fc2, 0x257fa8, 0x155d86, 0x2a8fb4, 1);
  table.fillRect(PLAY_AREA.left, PLAY_AREA.top, playW, playH);

  table.fillGradientStyle(0x66c1df, 0x66c1df, 0x66c1df, 0x66c1df, 0.11, 0.03, 0, 0);
  table.fillRect(PLAY_AREA.left + 2, PLAY_AREA.top + 2, playW - 4, playH * 0.34);
  table.fillStyle(0x031f38, 0.12);
  table.fillRect(PLAY_AREA.left, PLAY_AREA.bottom - playH * 0.24, playW, playH * 0.24);

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
  return table;
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
  table.lineStyle(0.42, 0x083d61, 0.12);
  for (let y = PLAY_AREA.top + 2; y < PLAY_AREA.bottom; y += 3) {
    table.beginPath();
    table.moveTo(PLAY_AREA.left + 2, y);
    table.lineTo(PLAY_AREA.right - 2, y);
    table.strokePath();
  }

  table.lineStyle(0.3, 0x8ed4e6, 0.035);
  for (let y = PLAY_AREA.top + 3.5; y < PLAY_AREA.bottom; y += 3) {
    table.beginPath();
    table.moveTo(PLAY_AREA.left + 2, y);
    table.lineTo(PLAY_AREA.right - 2, y);
    table.strokePath();
  }

  table.lineStyle(0.24, 0x083d61, 0.045);
  for (let x = PLAY_AREA.left + 4; x < PLAY_AREA.right; x += 6) {
    table.beginPath();
    table.moveTo(x, PLAY_AREA.top + 2);
    table.lineTo(x, PLAY_AREA.bottom - 2);
    table.strokePath();
  }

  table.fillStyle(0x8fd8eb, 0.045);
  table.fillRect(PLAY_AREA.left + playW * 0.12, PLAY_AREA.top + playH * 0.08, playW * 0.76, playH * 0.3);

  table.fillStyle(0x062e51, 0.07);
  table.fillRect(PLAY_AREA.left + playW * 0.1, PLAY_AREA.bottom - playH * 0.35, playW * 0.8, playH * 0.25);

  // Sparse fibers break up the digital flatness without competing with balls.
  for (let i = 0; i < 220; i += 1) {
    const seed = (i * 97) % 997;
    const x = PLAY_AREA.left + 8 + ((seed * 37) % Math.max(1, Math.floor(playW - 16)));
    const y = PLAY_AREA.top + 8 + ((seed * 53) % Math.max(1, Math.floor(playH - 16)));
    table.fillStyle(i % 3 === 0 ? 0xb7e7f2 : 0x062c4c, i % 3 === 0 ? 0.045 : 0.035);
    table.fillCircle(x, y, i % 4 === 0 ? 0.65 : 0.4);
  }
}

function drawPocketNets(table: Phaser.GameObjects.Graphics): void {
  const cornerR = TABLE.pocketRadius + 8;
  const middleR = TABLE.pocketRadius + 6;
  const holeR = BALL_RADIUS * 0.7;
  const netColor = 0x1a0d18;
  const netAlpha = 0.34;
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
  const netColor = 0x1a0d18;

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
  const cw = 20;
  const pocketClearance = TABLE.pocketRadius + 16;
  const jawAngle = 18;
  const midX = TABLE.width / 2;

  const topY = PLAY_AREA.top - cw;
  const botY = PLAY_AREA.bottom;
  const leftX = PLAY_AREA.left - cw;
  const rightX = PLAY_AREA.right;

  table.fillStyle(0x155d7f, 1);

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

  table.fillStyle(0x3ea9d0, 0.52);
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

  table.fillStyle(0x1c739a, 0.78);
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

  table.lineStyle(2.2, 0x082c46, 0.78);
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

  table.lineStyle(2.4, 0x72d4f2, 0.72);
  table.beginPath();
  table.moveTo(PLAY_AREA.left + pocketClearance + jawAngle, PLAY_AREA.top - 1);
  table.lineTo(midX - pocketClearance - jawAngle, PLAY_AREA.top - 1);
  table.moveTo(midX + pocketClearance + jawAngle, PLAY_AREA.top - 1);
  table.lineTo(PLAY_AREA.right - pocketClearance - jawAngle, PLAY_AREA.top - 1);
  table.moveTo(PLAY_AREA.left + pocketClearance + jawAngle, PLAY_AREA.bottom + 1);
  table.lineTo(midX - pocketClearance - jawAngle, PLAY_AREA.bottom + 1);
  table.moveTo(midX + pocketClearance + jawAngle, PLAY_AREA.bottom + 1);
  table.lineTo(PLAY_AREA.right - pocketClearance - jawAngle, PLAY_AREA.bottom + 1);
  table.strokePath();
  table.lineStyle(1.6, 0x08283f, 0.8);
  table.beginPath();
  table.moveTo(PLAY_AREA.left - 1, PLAY_AREA.top + pocketClearance + jawAngle);
  table.lineTo(PLAY_AREA.left - 1, PLAY_AREA.bottom - pocketClearance - jawAngle);
  table.moveTo(PLAY_AREA.right + 1, PLAY_AREA.top + pocketClearance + jawAngle);
  table.lineTo(PLAY_AREA.right + 1, PLAY_AREA.bottom - pocketClearance - jawAngle);
  table.strokePath();
}

function drawPockets(table: Phaser.GameObjects.Graphics): void {
  const cornerR = TABLE.pocketRadius + 9;
  const middleR = TABLE.pocketRadius + 7;

  for (let i = 0; i < POCKETS.length; i++) {
    const pocket = POCKETS[i];
    const isMiddle = i === 1 || i === 4;
    const r = isMiddle ? middleR : cornerR;

    if (isMiddle) {
      const isTop = i === 1;
      const startAngle = isTop ? Math.PI : 0;
      const endAngle = isTop ? 2 * Math.PI : Math.PI;

      // Side pockets are half-cut into the cushion: a blue bevel, a dark
      // throat, and a red-brown reflected liner give the opening depth.
      table.fillStyle(0x0b263b, 1);
      table.beginPath();
      table.arc(pocket.x, pocket.y, r + 3, startAngle, endAngle, false);
      table.closePath();
      table.fillPath();

      table.fillStyle(0x010306, 1);
      table.beginPath();
      table.arc(pocket.x, pocket.y, r, startAngle, endAngle, false);
      table.closePath();
      table.fillPath();

      table.fillStyle(0x000000, 1);
      table.beginPath();
      table.arc(pocket.x, pocket.y, r - 4, startAngle, endAngle, false);
      table.closePath();
      table.fillPath();

      table.fillStyle(0x8e1415, 0.38);
      table.fillEllipse(pocket.x - r * 0.22, pocket.y - r * 0.32, r * 0.46, r * 0.2);
      table.fillStyle(0x7b0d17, 0.72);
      table.fillEllipse(pocket.x + r * 0.16, pocket.y + (isTop ? r * 0.16 : -r * 0.16), r * 0.58, r * 0.2);
      table.lineStyle(2.5, 0x092036, 0.92);
      table.beginPath();
      table.arc(pocket.x, pocket.y, r + 1, startAngle, endAngle, false);
      table.strokePath();

      table.lineStyle(1.2, 0x43b2d7, 0.42);
      table.beginPath();
      table.arc(pocket.x, pocket.y, r + 3, startAngle, endAngle, false);
      table.strokePath();

      table.lineStyle(1.8, 0x07182b, 0.92);
      table.beginPath();
      table.moveTo(pocket.x - r - 1, pocket.y);
      table.lineTo(pocket.x + r + 1, pocket.y);
      table.strokePath();
    } else {
      // Corner pockets are recessed beyond the rail, so the red liner is
      // painted inside the black throat instead of on top of the cloth.
      table.fillStyle(0x101f32, 1);
      table.fillCircle(pocket.x, pocket.y, r + 3);

      table.fillStyle(0x090b0e, 1);
      table.fillCircle(pocket.x, pocket.y, r);

      table.fillStyle(0x000000, 1);
      table.fillCircle(pocket.x, pocket.y, r - 4);

      table.fillStyle(0x8e1415, 0.48);
      table.fillEllipse(pocket.x - r * 0.24, pocket.y - r * 0.3, r * 0.5, r * 0.22);
      table.fillStyle(0x5e0b13, 0.72);
      table.fillEllipse(pocket.x + r * 0.2, pocket.y + r * 0.28, r * 0.58, r * 0.18);

      table.lineStyle(2.5, 0x092036, 0.92);
      table.strokeCircle(pocket.x, pocket.y, r + 1);

      table.lineStyle(1.2, 0x43b2d7, 0.42);
      table.strokeCircle(pocket.x, pocket.y, r - 1);

      table.lineStyle(1.4, 0x07182b, 0.84);
      table.strokeCircle(pocket.x, pocket.y, r + 3);

      // Angled cushion jaws, matching the real table's cut-away corner.
      const sideX = pocket.x < TABLE.width / 2 ? 1 : -1;
      const sideY = pocket.y < TABLE.height / 2 ? 1 : -1;
      table.fillStyle(0x1b6e93, 0.9);
      table.beginPath();
      table.moveTo(pocket.x + sideX * (r + 2), pocket.y + sideY * 2);
      table.lineTo(pocket.x + sideX * (r + 22), pocket.y + sideY * 2);
      table.lineTo(pocket.x + sideX * (r + 10), pocket.y + sideY * (r + 14));
      table.closePath();
      table.fillPath();
      table.beginPath();
      table.moveTo(pocket.x + sideX * 2, pocket.y + sideY * (r + 2));
      table.lineTo(pocket.x + sideX * 2, pocket.y + sideY * (r + 22));
      table.lineTo(pocket.x + sideX * (r + 14), pocket.y + sideY * (r + 10));
      table.closePath();
      table.fillPath();
      table.lineStyle(1.4, 0x65c9e8, 0.7);
      table.beginPath();
      table.moveTo(pocket.x + sideX * (r + 4), pocket.y + sideY * 4);
      table.lineTo(pocket.x + sideX * (r + 18), pocket.y + sideY * 4);
      table.moveTo(pocket.x + sideX * 4, pocket.y + sideY * (r + 4));
      table.lineTo(pocket.x + sideX * 4, pocket.y + sideY * (r + 18));
      table.strokePath();
    }
  }
}
