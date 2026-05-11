import { describe, expect, it, vi } from 'vitest';
import { createLeaveReporter } from './leaveReporter';

describe('createLeaveReporter', () => {
  it('calls onLeave when pagehide fires', () => {
    const target = new EventTarget();
    const onLeave = vi.fn();
    createLeaveReporter({ onLeave, target });

    target.dispatchEvent(new Event('pagehide'));

    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('calls onLeave when beforeunload fires', () => {
    const target = new EventTarget();
    const onLeave = vi.fn();
    createLeaveReporter({ onLeave, target });

    target.dispatchEvent(new Event('beforeunload'));

    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('only calls onLeave once even if pagehide then beforeunload both fire', () => {
    const target = new EventTarget();
    const onLeave = vi.fn();
    createLeaveReporter({ onLeave, target });

    target.dispatchEvent(new Event('pagehide'));
    target.dispatchEvent(new Event('beforeunload'));

    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('does not call onLeave after dispose', () => {
    const target = new EventTarget();
    const onLeave = vi.fn();
    const reporter = createLeaveReporter({ onLeave, target });

    reporter.dispose();
    target.dispatchEvent(new Event('pagehide'));
    target.dispatchEvent(new Event('beforeunload'));

    expect(onLeave).not.toHaveBeenCalled();
  });

  it('dispose is idempotent', () => {
    const target = new EventTarget();
    const onLeave = vi.fn();
    const reporter = createLeaveReporter({ onLeave, target });

    reporter.dispose();
    expect(() => reporter.dispose()).not.toThrow();
  });
});
