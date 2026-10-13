export type SpriteBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
};
export function findSpriteBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): SpriteBounds | null {
  if (width < 1 || height < 1 || data.length < width * height * 4) return null;
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 8) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
  return right < left
    ? null
    : {
        x: left,
        y: top,
        width: right - left + 1,
        height: bottom - top + 1,
        imageWidth: width,
        imageHeight: height,
      };
}
const cache = new Map<string, SpriteBounds | null>();
export function readSpriteBounds(image: HTMLImageElement): SpriteBounds | null {
  const key = image.currentSrc || image.src;
  if (cache.has(key)) return cache.get(key)!;
  try {
    // Solo medimos transparencia. El archivo y sus colores no se modifican.
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    if (
      !canvas.width ||
      !canvas.height ||
      canvas.width * canvas.height > 4000000
    )
      return null;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0);
    const bounds = findSpriteBounds(
      context.getImageData(0, 0, canvas.width, canvas.height).data,
      canvas.width,
      canvas.height,
    );
    if (cache.size > 200) cache.clear();
    cache.set(key, bounds);
    return bounds;
  } catch {
    return null;
  }
}
