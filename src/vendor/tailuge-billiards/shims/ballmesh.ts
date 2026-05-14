// @ts-nocheck
export class BallMesh {
  readonly trace = {
    reset: (): void => undefined,
    forceTrace: (): void => undefined,
  };

  readonly spinAxisArrow = { visible: false };

  constructor(_color?: number, _label?: number) {}

  updateAll(): void {}

  addToScene(): void {}

  updateRotation(): void {}

  freezeTrace(): void {}
}
