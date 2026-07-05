import { describe, expect, it } from 'vitest';

import { SPLASH_CURSOR_HOST_ID, createSplashCursorHost } from './splashCursor';

class FakeElement {
  id = '';
  className = '';
  readonly style: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();

  constructor(readonly tagName: string) {}

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

describe('splash cursor host', () => {
  it('creates a fixed full-screen canvas layer that does not intercept gameplay input', () => {
    const doc = {
      createElement: (tagName: string) => new FakeElement(tagName.toUpperCase()),
    };

    const { container, canvas } = createSplashCursorHost(doc);

    expect(container.id).toBe(SPLASH_CURSOR_HOST_ID);
    expect(container.attributes.get('aria-hidden')).toBe('true');
    expect(container.style).toMatchObject({
      position: 'fixed',
      inset: '0',
      zIndex: '50',
      pointerEvents: 'none',
      width: '100%',
      height: '100%',
    });
    expect(canvas.id).toBe('fluid');
    expect(canvas.style).toMatchObject({
      width: '100vw',
      height: '100vh',
      display: 'block',
    });
    expect(container.children).toEqual([canvas]);
  });
});
