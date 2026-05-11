export interface LeaveReporter {
  dispose(): void;
}

export interface LeaveReporterOptions {
  onLeave: () => void;
  target?: EventTarget;
}

export function createLeaveReporter(opts: LeaveReporterOptions): LeaveReporter {
  const target: EventTarget = opts.target ?? window;
  let fired = false;
  let disposed = false;

  const handler = (): void => {
    if (fired || disposed) return;
    fired = true;
    try {
      opts.onLeave();
    } catch {
      // swallow; page is unloading, logging is unreliable
    }
  };

  target.addEventListener('pagehide', handler);
  target.addEventListener('beforeunload', handler);

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      target.removeEventListener('pagehide', handler);
      target.removeEventListener('beforeunload', handler);
    },
  };
}
