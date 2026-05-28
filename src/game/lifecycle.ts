type GameLike = {
  isPaused: boolean;
  pause: () => void;
  resume: () => void;
  events?: {
    once: (event: string, listener: () => void) => void;
  };
};

type LifecycleDocument = Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
type LifecycleWindow = Pick<Window, 'addEventListener' | 'removeEventListener'>;

export type LifecycleOptions = {
  documentRef?: LifecycleDocument;
  windowRef?: LifecycleWindow;
  isUserPaused?: () => boolean;
};

export function bindGamePowerLifecycle(game: GameLike, options: LifecycleOptions = {}): () => void {
  const doc = options.documentRef ?? document;
  const win = options.windowRef ?? window;
  const isUserPaused = options.isUserPaused ?? (() => false);
  let powerPaused = false;

  const pauseForPower = () => {
    if (game.isPaused) return;
    game.pause();
    powerPaused = true;
  };

  const resumeFromPower = () => {
    if (!powerPaused || isUserPaused()) return;
    game.resume();
    powerPaused = false;
  };

  const handleVisibilityChange = () => {
    if (doc.hidden) {
      pauseForPower();
    } else {
      resumeFromPower();
    }
  };
  const handleBlur = () => pauseForPower();
  const handleFocus = () => resumeFromPower();

  doc.addEventListener('visibilitychange', handleVisibilityChange);
  win.addEventListener('blur', handleBlur);
  win.addEventListener('focus', handleFocus);

  const dispose = () => {
    doc.removeEventListener('visibilitychange', handleVisibilityChange);
    win.removeEventListener('blur', handleBlur);
    win.removeEventListener('focus', handleFocus);
  };

  game.events?.once('destroy', dispose);

  return dispose;
}
