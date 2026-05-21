type GameShellDocument = Pick<Document, 'getElementById' | 'querySelector'>;

export function showGameShellForNewGame(doc: GameShellDocument = document): void {
  const staleVictoryOverlay = doc.getElementById('victory-overlay');
  const menu = doc.getElementById('main-menu');
  const shell = doc.querySelector<HTMLElement>('.game-shell');
  const challengeSelect = doc.getElementById('challenge-select');

  if (staleVictoryOverlay) staleVictoryOverlay.hidden = true;
  if (menu) menu.hidden = true;
  if (shell) shell.hidden = false;
  if (challengeSelect) challengeSelect.hidden = true;
}
