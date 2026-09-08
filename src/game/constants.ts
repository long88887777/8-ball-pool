export type Vector = {
  x: number;
  y: number;
};

export const TABLE = {
  width: 1100,
  height: 640,
  rail: 98,
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
export const MIDDLE_POCKET_CENTER_OFFSET = 22;

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

// The accepted 3D table is not axis-symmetric after normalization: its
// straight short-rail noses are at x ~= 90/1010, while the long-rail noses
// remain at y ~= 98/542. Keep this separate from PLAY_AREA, which also owns
// the head string and pocket layout.
export const STRAIGHT_CUSHION_NOSE_BOUNDS = {
  left: 90,
  right: TABLE.width - 90,
  top: TABLE.rail,
  bottom: TABLE.height - TABLE.rail,
};

// A non-pocketed ball center stays one radius inside each straight cushion
// nose. Pocket throats override these limits inside their openings.
export const BALL_CENTER_BOUNDS = {
  left: STRAIGHT_CUSHION_NOSE_BOUNDS.left + BALL_RADIUS,
  right: STRAIGHT_CUSHION_NOSE_BOUNDS.right - BALL_RADIUS,
  top: STRAIGHT_CUSHION_NOSE_BOUNDS.top + BALL_RADIUS,
  bottom: STRAIGHT_CUSHION_NOSE_BOUNDS.bottom - BALL_RADIUS,
};

export const POCKETS: Vector[] = [
  // Corner centers sit one ball radius beyond both cushion noses. Middle
  // centers sit 22 units outside the horizontal nose line, leaving the inner
  // edge of each opening slightly overlapping the cloth like the reference.
  { x: PLAY_AREA.left - BALL_RADIUS, y: PLAY_AREA.top - BALL_RADIUS },
  { x: TABLE.width / 2, y: PLAY_AREA.top - MIDDLE_POCKET_CENTER_OFFSET },
  { x: PLAY_AREA.right + BALL_RADIUS, y: PLAY_AREA.top - BALL_RADIUS },
  { x: PLAY_AREA.left - BALL_RADIUS, y: PLAY_AREA.bottom + BALL_RADIUS },
  { x: TABLE.width / 2, y: PLAY_AREA.bottom + MIDDLE_POCKET_CENTER_OFFSET },
  { x: PLAY_AREA.right + BALL_RADIUS, y: PLAY_AREA.bottom + BALL_RADIUS },
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
  '#e0ad22',
  '#1556a3',
  '#b51f25',
  '#5a207e',
  '#d66020',
  '#16734d',
  '#7a1c22',
  '#141414',
  '#e0ad22',
  '#1556a3',
  '#b51f25',
  '#5a207e',
  '#d66020',
  '#16734d',
  '#7a1c22',
];

export const BALLS = Array.from({ length: 15 }, (_, index) => ({
  id: index + 1,
  color: BALL_COLORS[index],
}));
