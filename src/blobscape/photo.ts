import { Blobs, type Vec3 } from '../splat-core/blobs.ts'
import { quatFromAxes } from '../splat-engine/fur.ts'

/**
 * One photo to a shallow scene (issue #211), pure and tested. Given a picture and a guess at how near each pixel is,
 * every pixel becomes one flat blob pushed back along its own line of sight, so from where the photo was taken the
 * scene is the photo, and a small turn of the view shows its depth. It is 2.5D: what the camera never saw is not
 * there, so a wide turn opens gaps behind things.
 */

export interface PhotoOptions {
  /** The camera's field of view across the picture's longer side, in degrees. Phones are about 65. */
  fov?: number
  /** How far the nearest thing is, and the furthest, in world units. */
  near?: number
  far?: number
  /** A blob whose depth changes by more than this share of its own depth to a neighbor sits on an edge between a near and a far thing. Edge blobs keep their pixel's size and face the camera, rather than stretching across the gap. */
  edge?: number
  /** Where the camera stood. The scene is laid out in front of it, looking along -z, level. */
  eye?: Vec3
}

export const PHOTO_FOV = 65
/** The longest side a photo is shrunk to, in pixels: a blob a pixel. */
export const PHOTO_SIDE = 256
export const PHOTO_SIDE_PHONE = 176

/** The size a picture of `w` by `h` is shrunk to so its longer side is at most `side`, keeping its shape. */
export function fitSide(w: number, h: number, side: number): [number, number] {
  const k = Math.min(1, side / Math.max(w, h))
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))]
}

/**
 * A depth model's answer made ready: `nearness` (any range, bigger is nearer, as depth models give it; `w` by `h`,
 * resampled here if the model's own size differs) spread over 0 to 1 between its 1st and 99th percentile, so one
 * stray pixel doesn't flatten the rest.
 */
export function nearnessFor(values: ArrayLike<number>, vw: number, vh: number, w: number, h: number): Float32Array {
  const sorted = Float32Array.from(values).sort()
  const lo = sorted[Math.floor((sorted.length - 1) * 0.01)], hi = sorted[Math.floor((sorted.length - 1) * 0.99)]
  const span = hi - lo || 1
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // bilinear, sampling at pixel centers
    const fx = Math.min(vw - 1, Math.max(0, ((x + 0.5) / w) * vw - 0.5)), fy = Math.min(vh - 1, Math.max(0, ((y + 0.5) / h) * vh - 0.5))
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(vw - 1, x0 + 1), y1 = Math.min(vh - 1, y0 + 1), tx = fx - x0, ty = fy - y0
    const v = (values[y0 * vw + x0] * (1 - tx) + values[y0 * vw + x1] * tx) * (1 - ty) + (values[y1 * vw + x0] * (1 - tx) + values[y1 * vw + x1] * tx) * ty
    out[y * w + x] = Math.min(1, Math.max(0, (v - lo) / span))
  }
  return out
}

/**
 * The scene of a photo: `rgba` is `w` by `h` pixels (sRGB bytes, rows from the top), `nearness` one number a pixel
 * from 0 (furthest) to 1 (nearest). Nearness is taken as a depth model gives it, as one over the distance, so far
 * things bunch up and near things spread, the way they do in a real view. See-through pixels are left out.
 */
export function photoBlobs(rgba: ArrayLike<number>, w: number, h: number, nearness: ArrayLike<number>, o: PhotoOptions = {}): Blobs {
  const near = o.near ?? 1.5, far = o.far ?? 6, edge = o.edge ?? 0.12, eye = o.eye ?? [0, 0, 0]
  // one pixel's width at a distance of 1
  const px = (2 * Math.tan(((o.fov ?? PHOTO_FOV) * Math.PI) / 360)) / Math.max(w, h)
  const depthAt = (x: number, y: number) => 1 / (1 / far + nearness[y * w + x] * (1 / near - 1 / far))
  const at = (x: number, y: number, z = depthAt(x, y)): Vec3 => [(x + 0.5 - w / 2) * px * z, (h / 2 - y - 0.5) * px * z, -z]
  const b = new Blobs(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    if (rgba[i + 3] < 128) continue
    const z = depthAt(x, y), p = at(x, y, z)
    const size = px * z
    // across and down the surface, from the neighbors either side (one side at the picture's border)
    const xa = Math.max(0, x - 1), xb = Math.min(w - 1, x + 1), ya = Math.max(0, y - 1), yb = Math.min(h - 1, y + 1)
    const za = depthAt(xa, y), zb = depthAt(xb, y), zc = depthAt(x, ya), zd = depthAt(x, yb)
    const cliff = Math.max(Math.abs(za - z), Math.abs(zb - z), Math.abs(zc - z), Math.abs(zd - z)) > edge * z
    let du: Vec3 = [size, 0, 0], dv: Vec3 = [0, -size, 0]
    if (!cliff) {
      const pa = at(xa, y, za), pb = at(xb, y, zb), pc = at(x, ya, zc), pd = at(x, yb, zd)
      du = [(pb[0] - pa[0]) / (xb - xa), (pb[1] - pa[1]) / (xb - xa), (pb[2] - pa[2]) / (xb - xa)]
      dv = [(pd[0] - pc[0]) / (yb - ya), (pd[1] - pc[1]) / (yb - ya), (pd[2] - pc[2]) / (yb - ya)]
    }
    // a frame on the surface: along du, then the part of dv square to it, then the way it faces
    const lu = Math.hypot(du[0], du[1], du[2]) || size
    const ax: Vec3 = [du[0] / lu, du[1] / lu, du[2] / lu]
    const along = dv[0] * ax[0] + dv[1] * ax[1] + dv[2] * ax[2]
    let ay: Vec3 = [dv[0] - ax[0] * along, dv[1] - ax[1] * along, dv[2] - ax[2] * along]
    const lv = Math.hypot(ay[0], ay[1], ay[2]) || size
    ay = [ay[0] / lv, ay[1] / lv, ay[2] / lv]
    const az: Vec3 = [ax[1] * ay[2] - ax[2] * ay[1], ax[2] * ay[0] - ax[0] * ay[2], ax[0] * ay[1] - ax[1] * ay[0]]
    // a blob shows to about twice its size either way: 0.6 of the spacing closes the gaps without blurring the picture
    const su = Math.min(lu, size * 3) * 0.6, sv = Math.min(lv, size * 3) * 0.6
    b.push({
      center: [eye[0] + p[0], eye[1] + p[1], eye[2] + p[2]],
      scale: [su, sv, Math.min(su, sv) * 0.15],
      quat: quatFromAxes(ax, ay, az),
      color: [rgba[i] / 255, rgba[i + 1] / 255, rgba[i + 2] / 255],
      opacity: 1,
    })
  }
  return b
}
