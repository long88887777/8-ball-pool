import { BALL_RADIUS, PLAY_AREA, type Vector } from '../constants';

const TABLE_HALF_WIDTH_METERS = 0.03275 * 43;
const TABLE_HALF_HEIGHT_METERS = 0.03275 * 21;

export type CoordinateMapper = {
  toPhysics(point: Vector): Vector;
  toPixels(point: Vector): Vector;
  pixelsPerMeter: number;
  ballRadiusMeters: number;
};

export function createCoordinateMapper(): CoordinateMapper {
  const playWidth = PLAY_AREA.right - PLAY_AREA.left;
  const playHeight = PLAY_AREA.bottom - PLAY_AREA.top;
  const pixelsPerMeterX = playWidth / (TABLE_HALF_WIDTH_METERS * 2);
  const pixelsPerMeterY = playHeight / (TABLE_HALF_HEIGHT_METERS * 2);
  const pixelsPerMeter = Math.min(pixelsPerMeterX, pixelsPerMeterY);
  const center = {
    x: PLAY_AREA.left + playWidth / 2,
    y: PLAY_AREA.top + playHeight / 2,
  };

  return {
    pixelsPerMeter,
    ballRadiusMeters: BALL_RADIUS / pixelsPerMeter,
    toPhysics(point) {
      return {
        x: (point.x - center.x) / pixelsPerMeter,
        y: (center.y - point.y) / pixelsPerMeter,
      };
    },
    toPixels(point) {
      return {
        x: center.x + point.x * pixelsPerMeter,
        y: center.y - point.y * pixelsPerMeter,
      };
    },
  };
}
