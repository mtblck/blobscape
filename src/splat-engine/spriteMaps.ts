/**
 * Normal and depth maps for sprite sheets: a sprite drawn with one, lit by a game's own lights, shades as the
 * creature turns toward or away from them, and sorts against other things by depth. Both come from the sheet's own
 * depth map (`SplatDepth`, each pixel's distance in front of the camera), shrunk to the sprite's pixels and read only
 * where the sprite has one. Pure, so Node tests can check it; the drawing is bakeSheet.ts.
 *
 * An idea from Silicon Jungle's Ink Studio.
 */
import type { Frame } from '../splat-core/pixel.ts'

/**
 * A depth map drawn `big` pixels a side (rows from the top, 0 where nothing is) shrunk by `by` to the sprite's size:
 * each sprite pixel takes the mean depth of the drawn samples under it. Where the sprite has a pixel (`mask`'s alpha)
 * and no sample was drawn (an outline, or a pixel the cleanup filled), it takes the nearest one that has a depth, so
 * every solid pixel has one; empty pixels are 0.
 */
export function shrinkDepth(depth: ArrayLike<number>, big: number, by: number, mask: Frame): Float32Array {
  const size = mask.width, out = new Float32Array(size * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let sum = 0, n = 0
    for (let j = 0; j < by; j++) for (let i = 0; i < by; i++) {
      const d = depth[(y * by + j) * big + x * by + i]
      if (d > 0) { sum += d; n++ }
    }
    out[y * size + x] = n ? sum / n : 0
  }
  // solid pixels with no depth take the nearest that has one, ring by ring
  const solid = (k: number) => mask.data[k * 4 + 3] > 0
  const filled = out.slice()
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const k = y * size + x
    if (!solid(k)) { filled[k] = 0; continue }
    if (out[k] > 0) continue
    for (let r = 1; r < size; r++) {
      let best = 0, bestD = Infinity
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const xx = x + dx, yy = y + dy
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue
        const d = out[yy * size + xx], far = dx * dx + dy * dy
        if (d > 0 && far < bestD) { best = d; bestD = far }
      }
      if (bestD < Infinity) { filled[k] = best; break }
    }
  }
  return filled
}

/**
 * A normal map from a sprite's depths (`shrinkDepth`), as RGBA: each solid pixel's facing in the camera's frame, x to
 * the right, y up and z toward the viewer, stored as 0.5 + half of each (the usual kind, as OpenGL and most 2D engines
 * read it). `pixel` is how wide one sprite pixel is at the creature, in the depth's units: the sheet's camera is nearly
 * orthographic, so one width does for every pixel. A slope is taken across both neighbors where both are solid and
 * not a step away (`STEP` pixels' width), from one where only one is, and as flat where neither is.
 */
export function normalMap(depth: ArrayLike<number>, size: number, pixel: number): Frame {
  const data = new Uint8ClampedArray(size * size * 4)
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= size || y >= size ? 0 : depth[y * size + x])
  // the slope of depth one way (in depth units a pixel), from whichever neighbors are on the same surface
  const slope = (x: number, y: number, dx: number, dy: number) => {
    const d = at(x, y), a = at(x - dx, y - dy), b = at(x + dx, y + dy)
    const near = (v: number) => v > 0 && Math.abs(v - d) < STEP * pixel
    if (near(a) && near(b)) return (b - a) / 2
    if (near(b)) return b - d
    if (near(a)) return d - a
    return 0
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const k = y * size + x
    if (!(depth[k] > 0)) continue
    // depth grows away from the viewer; rows run down while y runs up
    const gx = slope(x, y, 1, 0) / pixel, gy = -slope(x, y, 0, 1) / pixel
    const len = Math.hypot(gx, gy, 1)
    const n = [gx / len, gy / len, 1 / len]
    for (let c = 0; c < 3; c++) data[k * 4 + c] = Math.round((n[c] * 0.5 + 0.5) * 255)
    data[k * 4 + 3] = 255
  }
  return { width: size, height: size, data }
}

/** Neighbors further apart in depth than this many pixels' width are on two surfaces, and no slope is taken across them. */
export const STEP = 3

/**
 * A depth map as RGBA gray: white at `near`, black at `far`, solid pixels only (a pixel at `far` or beyond is 1, so
 * it stays apart from empty ones by its alpha alone).
 */
export function depthImage(depth: ArrayLike<number>, size: number, near: number, far: number): Frame {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let k = 0; k < size * size; k++) {
    if (!(depth[k] > 0)) continue
    const v = Math.round(Math.min(1, Math.max(0, (far - depth[k]) / (far - near))) * 254) + 1
    data[k * 4] = data[k * 4 + 1] = data[k * 4 + 2] = v
    data[k * 4 + 3] = 255
  }
  return { width: size, height: size, data }
}
