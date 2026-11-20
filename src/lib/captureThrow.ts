export type ThrowPoint = { x: number; y: number };
export const THROW_ORIGIN: ThrowPoint = { x: 0.5, y: 0.86 };
export const THROW_TARGET: ThrowPoint = { x: 0.5, y: 0.3 };
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
  const radius = Math.min(width * 0.17, height * 0.145);
  return (
    Math.hypot(
      (point.x - THROW_TARGET.x) * width,
      (point.y - THROW_TARGET.y) * height,
    ) <= radius
  );
}
