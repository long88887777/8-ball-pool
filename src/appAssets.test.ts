import { describe, expect, it } from 'vitest';
import html from '../index.html?raw';
import favicon from '../public/favicon.svg?raw';

describe('app static assets', () => {
  it('declares an available favicon asset', async () => {
    expect(html).toContain('href="/favicon.svg"');
    expect(favicon).toContain('<svg');
  });

  it('declares the menu title artwork asset', () => {
    expect(html).toContain('src="/assets/eight-ball-title-art.webp"');
  });
});
