import { TABLE, PLAY_AREA } from '../constants';
import type { Vector } from '../constants';

export type LevelBall = {
  id: number;
  position: Vector;
};

export type ChallengeLevel = {
  id: number;
  name: { en: string; zh: string };
  balls: LevelBall[];
  maxShots: number;
  starThresholds: [number, number]; // [3-star, 2-star]
};

const cx = TABLE.width / 2;
const cy = TABLE.height / 2;
const left = PLAY_AREA.left;
const right = PLAY_AREA.right;
const top = PLAY_AREA.top;
const bottom = PLAY_AREA.bottom;

export const CHALLENGE_LEVELS: ChallengeLevel[] = [
  {
    id: 1,
    name: { en: 'Straight Shot', zh: '直线进球' },
    maxShots: 2,
    starThresholds: [1, 2],
    balls: [
      { id: 0, position: { x: left + 200, y: cy } },
      { id: 1, position: { x: right - 120, y: cy } },
    ],
  },
  {
    id: 2,
    name: { en: 'Angle Cut', zh: '角度切球' },
    maxShots: 2,
    starThresholds: [1, 2],
    balls: [
      { id: 0, position: { x: left + 180, y: cy } },
      { id: 1, position: { x: right - 150, y: cy - 80 } },
    ],
  },
  {
    id: 3,
    name: { en: 'Two-Ball Combo', zh: '两球连击' },
    maxShots: 3,
    starThresholds: [2, 3],
    balls: [
      { id: 0, position: { x: left + 150, y: cy } },
      { id: 1, position: { x: cx, y: cy - 60 } },
      { id: 2, position: { x: cx + 150, y: cy + 40 } },
    ],
  },
  {
    id: 4,
    name: { en: 'Rail Shot', zh: '贴库球' },
    maxShots: 2,
    starThresholds: [1, 2],
    balls: [
      { id: 0, position: { x: left + 200, y: cy + 60 } },
      { id: 1, position: { x: right - 140, y: top + 20 } },
    ],
  },
  {
    id: 5,
    name: { en: 'Three-Ball Clear', zh: '三球清台' },
    maxShots: 4,
    starThresholds: [3, 4],
    balls: [
      { id: 0, position: { x: left + 150, y: cy } },
      { id: 1, position: { x: cx - 80, y: cy - 50 } },
      { id: 2, position: { x: cx + 60, y: cy + 30 } },
      { id: 3, position: { x: right - 160, y: cy - 20 } },
    ],
  },
  {
    id: 6,
    name: { en: 'Bank Shot', zh: '翻袋' },
    maxShots: 2,
    starThresholds: [1, 2],
    balls: [
      { id: 0, position: { x: left + 200, y: cy + 80 } },
      { id: 1, position: { x: cx, y: cy - 40 } },
    ],
  },
  {
    id: 7,
    name: { en: 'Kick & Combo', zh: 'K球解球' },
    maxShots: 4,
    starThresholds: [2, 3],
    balls: [
      { id: 0, position: { x: left + 150, y: cy + 60 } },
      { id: 1, position: { x: cx - 40, y: cy } },
      { id: 2, position: { x: cx + 120, y: cy - 70 } },
    ],
  },
  {
    id: 8,
    name: { en: 'Five-Ball Clear', zh: '五球清台' },
    maxShots: 7,
    starThresholds: [5, 6],
    balls: [
      { id: 0, position: { x: left + 150, y: cy } },
      { id: 1, position: { x: cx - 120, y: cy - 60 } },
      { id: 2, position: { x: cx - 40, y: cy + 50 } },
      { id: 3, position: { x: cx + 60, y: cy - 30 } },
      { id: 4, position: { x: cx + 140, y: cy + 60 } },
      { id: 5, position: { x: right - 160, y: cy - 40 } },
    ],
  },
  {
    id: 9,
    name: { en: 'Long Range', zh: '长台精准' },
    maxShots: 4,
    starThresholds: [3, 4],
    balls: [
      { id: 0, position: { x: left + 120, y: cy } },
      { id: 1, position: { x: right - 120, y: top + 80 } },
      { id: 2, position: { x: right - 140, y: bottom - 80 } },
      { id: 3, position: { x: right - 100, y: cy } },
    ],
  },
  {
    id: 10,
    name: { en: 'Full Table', zh: '满台挑战' },
    maxShots: 12,
    starThresholds: [8, 10],
    balls: [
      { id: 0, position: { x: left + 150, y: cy } },
      { id: 1, position: { x: cx - 160, y: cy - 80 } },
      { id: 2, position: { x: cx - 80, y: cy + 60 } },
      { id: 3, position: { x: cx, y: cy - 40 } },
      { id: 4, position: { x: cx + 60, y: cy + 80 } },
      { id: 5, position: { x: cx + 140, y: cy - 60 } },
      { id: 6, position: { x: right - 200, y: cy + 40 } },
      { id: 7, position: { x: right - 140, y: cy - 80 } },
      { id: 8, position: { x: right - 120, y: cy + 60 } },
    ],
  },
];
