export type ImageSize = {
  width: number;
  height: number;
};

export type CropState = {
  imageWidth: number;
  imageHeight: number;
  frameSize: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
};

export type CropSourceRect = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

export const MIN_AVATAR_ZOOM = 0.01;
export const MAX_AVATAR_ZOOM = 4;
export const AVATAR_OUTPUT_SIZE = 320;

export function createInitialCropState(image: ImageSize, frameSize: number): CropState {
  const zoom = Math.max(frameSize / image.width, frameSize / image.height);
  return clampCropState({
    imageWidth: image.width,
    imageHeight: image.height,
    frameSize,
    zoom,
    offsetX: 0,
    offsetY: 0,
  });
}

export function updateCropZoom(state: CropState, zoom: number): CropState {
  return clampCropState({
    ...state,
    zoom: clampNumber(zoom, minimumCoverZoom(state), MAX_AVATAR_ZOOM),
  });
}

export function moveCrop(state: CropState, deltaX: number, deltaY: number): CropState {
  return clampCropState({
    ...state,
    offsetX: state.offsetX + deltaX,
    offsetY: state.offsetY + deltaY,
  });
}

export function clampCropState(state: CropState): CropState {
  const zoom = clampNumber(state.zoom, minimumCoverZoom(state), MAX_AVATAR_ZOOM);
  const renderedWidth = state.imageWidth * zoom;
  const renderedHeight = state.imageHeight * zoom;
  const maxOffsetX = Math.max(0, (renderedWidth - state.frameSize) / 2);
  const maxOffsetY = Math.max(0, (renderedHeight - state.frameSize) / 2);

  return {
    ...state,
    zoom,
    offsetX: clampNumber(state.offsetX, -maxOffsetX, maxOffsetX),
    offsetY: clampNumber(state.offsetY, -maxOffsetY, maxOffsetY),
  };
}

export function resolveCropSourceRect(state: CropState): CropSourceRect {
  const clamped = clampCropState(state);
  const sourceSize = clamped.frameSize / clamped.zoom;
  const centerX = clamped.imageWidth / 2 - clamped.offsetX / clamped.zoom;
  const centerY = clamped.imageHeight / 2 - clamped.offsetY / clamped.zoom;
  const sx = clampNumber(centerX - sourceSize / 2, 0, clamped.imageWidth - sourceSize);
  const sy = clampNumber(centerY - sourceSize / 2, 0, clamped.imageHeight - sourceSize);

  return {
    sx: Math.round(sx),
    sy: Math.round(sy),
    sw: Math.round(sourceSize),
    sh: Math.round(sourceSize),
  };
}

function minimumCoverZoom(state: Pick<CropState, 'imageWidth' | 'imageHeight' | 'frameSize'>): number {
  return Math.max(MIN_AVATAR_ZOOM, state.frameSize / state.imageWidth, state.frameSize / state.imageHeight);
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
