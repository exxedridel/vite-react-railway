export type ThrowPoint = { x: number; y: number };
export const THROW_ORIGIN: ThrowPoint = { x: 0.5, y: 0.7 };
export const THROW_TARGET: ThrowPoint = { x: 0.5, y: 0.3 };
/** The pull is measured from the resting ball, in the same coordinate space. */
export function captureSlingshotLanding(pull: ThrowPoint): ThrowPoint {
  return {
    x: THROW_ORIGIN.x - (pull.x - THROW_ORIGIN.x) * 3,
    y: THROW_ORIGIN.y - (pull.y - THROW_ORIGIN.y) * 3,
  };
}
export const THROW_TARGET_RADIUS = { x: 0.125, y: 0.105 };
/** Coordinates stay relative to the arena; the target is circular in pixels. */
export function captureThrowHits(
  point: ThrowPoint,
  width: number,
  height: number,
): boolean {
  if (
    ![point.x, point.y, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  )
    return false;
  const radius = Math.min(
    width * THROW_TARGET_RADIUS.x,
    height * THROW_TARGET_RADIUS.y,
  );
  return (
    Math.hypot(
      (point.x - THROW_TARGET.x) * width,
      (point.y - THROW_TARGET.y) * height,
    ) <= radius
  );
}
