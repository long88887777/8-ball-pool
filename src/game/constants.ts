export type Vector = {
  x: number;
  y: number;
};

export const TABLE = {
  width: 1100,
  height: 640,
  rail: 74,
  cushion: 38,
  pocketRadius: 26,
  readySpeed: 0.055,
  snapSpeed: 0.088,
  minShotPower: 0.06,
  maxDragDistance: 200,
  maxImpulse: 0.039,
};

export const BALL_RADIUS = 15;
export const CUSHION_NOSE_INSET = 12;

export const POCKET_MOUTHS = {
  cornerVisual: 116,
  middleVisualHalf: 16,
  cornerCapture: TABLE.pocketRadius + BALL_RADIUS * 0.9,
  middleCaptureHalf: TABLE.pocketRadius + 6,
};

export const PLAY_AREA = {
  left: TABLE.rail,
  right: TABLE.width - TABLE.rail,
  top: TABLE.rail,
  bottom: TABLE.height - TABLE.rail,
};

export const POCKETS: Vector[] = [
  { x: PLAY_AREA.left + 2, y: PLAY_AREA.top + 2 },
  { x: TABLE.width / 2, y: PLAY_AREA.top - 2 },
  { x: PLAY_AREA.right - 2, y: PLAY_AREA.top + 2 },
  { x: PLAY_AREA.left + 2, y: PLAY_AREA.bottom - 2 },
  { x: TABLE.width / 2, y: PLAY_AREA.bottom + 2 },
  { x: PLAY_AREA.right - 2, y: PLAY_AREA.bottom - 2 },
];

export const CUE_START: Vector = {
  x: PLAY_AREA.left + (PLAY_AREA.right - PLAY_AREA.left) * 0.2,
  y: TABLE.height / 2,
};

export const RACK_CENTER: Vector = {
  x: PLAY_AREA.left + (PLAY_AREA.right - PLAY_AREA.left) * 0.64,
  y: TABLE.height / 2,
};

export const CUE = {
  minPullback: 28,
  maxPullback: 136,
  strikeDurationMs: 120,
};

export const TARGET_STARTS: Vector[] = [
  { x: PLAY_AREA.left + (PLAY_AREA.right - PLAY_AREA.left) * 0.68, y: TABLE.height / 2 },
  { x: PLAY_AREA.left + (PLAY_AREA.right - PLAY_AREA.left) * 0.72, y: TABLE.height / 2 - BALL_RADIUS * 1.1 },
  { x: PLAY_AREA.left + (PLAY_AREA.right - PLAY_AREA.left) * 0.72, y: TABLE.height / 2 + BALL_RADIUS * 1.1 },
  { x: PLAY_AREA.left + (PLAY_AREA.right - PLAY_AREA.left) * 0.76, y: TABLE.height / 2 - BALL_RADIUS * 2.2 },
  { x: PLAY_AREA.left + (PLAY_AREA.right - PLAY_AREA.left) * 0.76, y: TABLE.height / 2 },
  { x: PLAY_AREA.left + (PLAY_AREA.right - PLAY_AREA.left) * 0.76, y: TABLE.height / 2 + BALL_RADIUS * 2.2 },
];

export const BALL_COLORS = [
  '#d8b33f',
  '#2469b3',
  '#b52d27',
  '#5b2a83',
  '#d46b2c',
  '#1d7f5f',
  '#7d2323',
  '#141414',
  '#d8b33f',
  '#2469b3',
  '#b52d27',
  '#5b2a83',
  '#d46b2c',
  '#1d7f5f',
  '#7d2323',
];

export const BALLS = Array.from({ length: 15 }, (_, index) => ({
  id: index + 1,
  color: BALL_COLORS[index],
}));
