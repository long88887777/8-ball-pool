export type GameRuleset = 'eight-ball' | 'nine-ball';

export function normalizeGameRuleset(value: unknown): GameRuleset {
  return value === 'nine-ball' ? 'nine-ball' : 'eight-ball';
}
