import type { CueStyle } from './economy';
import type { Vector } from './constants';

const SOURCE_WIDTH = 2172;
const SOURCE_HEIGHT = 160;
const DISPLAY_WIDTH = 470;
const TIP_GAP = 5;

export type CueSpritePose = {
  textureKey: string;
  x: number;
  y: number;
  rotation: number;
  originX: number;
  originY: number;
  displayWidth: number;
  displayHeight: number;
};

export function computeCueSpritePose(
  cuePosition: Vector,
  angle: number,
  pullback: number,
  cueStyle: CueStyle,
): CueSpritePose {
  const tipDistance = pullback + TIP_GAP;

  return {
    textureKey: cueStyle.textureKey,
    x: cuePosition.x - Math.cos(angle) * tipDistance,
    y: cuePosition.y - Math.sin(angle) * tipDistance,
    rotation: angle + Math.PI,
    originX: cueStyle.tipOffsetX / SOURCE_WIDTH,
    originY: 0.5,
    displayWidth: DISPLAY_WIDTH,
    displayHeight: (DISPLAY_WIDTH * SOURCE_HEIGHT) / SOURCE_WIDTH,
  };
}
