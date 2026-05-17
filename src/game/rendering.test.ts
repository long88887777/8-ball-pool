import { describe, expect, it, vi } from 'vitest';
import { BALL_RADIUS } from './constants';
import { createBallTexture, drawCueStick } from './rendering';
import type { CueStyle } from './economy';

type DrawCall = {
  op: string;
  fillStyle?: string | FakeGradient;
  x?: number;
  y?: number;
  radius?: number;
  width?: number;
  height?: number;
};

class FakeGradient {
  readonly stops: string[] = [];

  addColorStop(_offset: number, color: string): void {
    this.stops.push(color);
  }
}

class FakeContext {
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  font = '';
  textAlign = 'start';
  textBaseline = 'alphabetic';
  readonly calls: DrawCall[] = [];

  clearRect(): void {}
  beginPath(): void {}
  closePath(): void {}
  fill(): void {
    this.calls.push({ op: 'fill', fillStyle: this.fillStyle });
  }
  stroke(): void {}
  save(): void {}
  restore(): void {}
  clip(): void {}
  translate(): void {}
  rotate(): void {}
  scale(): void {}
  moveTo(): void {}
  lineTo(): void {}
  quadraticCurveTo(): void {}
  bezierCurveTo(): void {}
  fillText(): void {}
  strokeText(): void {}
  createRadialGradient(): FakeGradient {
    return new FakeGradient();
  }
  createLinearGradient(): FakeGradient {
    return new FakeGradient();
  }
  arc(x: number, y: number, radius: number): void {
    this.calls.push({ op: 'arc', fillStyle: this.fillStyle, x, y, radius });
  }
  ellipse(x: number, y: number, radiusX: number, radiusY: number): void {
    this.calls.push({ op: 'ellipse', fillStyle: this.fillStyle, x, y, width: radiusX * 2, height: radiusY * 2 });
  }
  fillRect(x: number, y: number, width: number, height: number): void {
    this.calls.push({ op: 'fillRect', fillStyle: this.fillStyle, x, y, width, height });
  }
}

function renderTextureCalls(options: Parameters<typeof createBallTexture>[1]): DrawCall[] {
  const context = new FakeContext();
  const texture = {
    getSourceImage: () => ({
      getContext: () => context,
    }),
    refresh: vi.fn(),
  };
  const scene = {
    textures: {
      createCanvas: vi.fn(() => texture),
    },
  };

  createBallTexture(scene as unknown as Phaser.Scene, options);
  expect(texture.refresh).toHaveBeenCalledOnce();

  return context.calls;
}

describe('createBallTexture', () => {
  it('draws a colored equator band for striped balls so rotation is visible', () => {
    const calls = renderTextureCalls({
      key: 'target-ball-8',
      fill: '#d8b33f',
      label: '9',
      stripe: true,
    });

    const stripeBand = calls.find(
      (call) => call.op === 'fillRect' && Math.abs((call.height ?? 0) - BALL_RADIUS * 1.08) < 0.001,
    );

    expect(stripeBand?.fillStyle).toBeInstanceOf(FakeGradient);
    expect((stripeBand?.fillStyle as FakeGradient).stops).toContain('#d8b33f');
  });

  it('draws a red center spot on the cue ball', () => {
    const calls = renderTextureCalls({
      key: 'cue-ball',
      fill: '#f8f0dd',
      cueSpot: true,
    } as Parameters<typeof createBallTexture>[1] & { cueSpot: true });

    expect(
      calls.some(
        (call) =>
          call.op === 'arc' &&
          call.fillStyle === '#d7352d' &&
          call.x === BALL_RADIUS + 7 &&
          call.y === BALL_RADIUS + 7 &&
          (call.radius ?? 0) > 2,
      ),
    ).toBe(true);
  });
});

class FakeGraphics {
  readonly fillColors: number[] = [];
  readonly lineColors: number[] = [];

  clear(): this { return this; }
  setDepth(): this { return this; }
  save(): this { return this; }
  restore(): this { return this; }
  translateCanvas(): this { return this; }
  rotateCanvas(): this { return this; }
  beginPath(): this { return this; }
  closePath(): this { return this; }
  moveTo(): this { return this; }
  lineTo(): this { return this; }
  strokePath(): this { return this; }
  fillPath(): this { return this; }
  fillRect(): this { return this; }
  fillRoundedRect(): this { return this; }
  strokeRoundedRect(): this { return this; }

  lineStyle(_width: number, color?: number): this {
    if (typeof color === 'number') this.lineColors.push(color);
    return this;
  }

  fillStyle(color: number): this {
    this.fillColors.push(color);
    return this;
  }

  fillGradientStyle(topLeft: number, topRight: number, bottomLeft: number, bottomRight: number): this {
    this.fillColors.push(topLeft, topRight, bottomLeft, bottomRight);
    return this;
  }
}

describe('drawCueStick', () => {
  it('uses the equipped cue style colors for the cue body and jewels', () => {
    const graphics = new FakeGraphics();
    const cueStyle: CueStyle = {
      id: 'test-cue',
      name: 'Test Cue',
      price: 100,
      rarity: 'epic',
      shaftColor: 0x123456,
      forearmColor: 0xabcdef,
      wrapColor: 0x345678,
      accentColor: 0xfedcba,
      gemColor: 0x55aaee,
    };

    drawCueStick(graphics as unknown as Phaser.GameObjects.Graphics, 100, 100, 0, 20, cueStyle);

    expect(graphics.fillColors).toContain(cueStyle.shaftColor);
    expect(graphics.fillColors).toContain(cueStyle.forearmColor);
    expect(graphics.fillColors).toContain(cueStyle.wrapColor);
    expect(graphics.fillColors).toContain(cueStyle.accentColor);
    expect(graphics.fillColors).toContain(cueStyle.gemColor);
  });
});
