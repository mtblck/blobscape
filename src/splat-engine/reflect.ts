import type { Vec3 } from '../splat-core/blobs.ts'

/**
 * A flat mirror, and what is seen in it: the plain arithmetic of a planar reflection, apart from any drawing.
 *
 * The world seen in a mirror is the world itself, flipped through the mirror's plane, seen from where the eye
 * really stands. So `SplatMirror` (mirror.ts) draws the scene once more with every point flipped (`mirrorMatrix`),
 * leaving out what lies behind the mirror, and keeps the picture with the camera it belongs to (`MirrorImage`).
 * A point of the mirror's surface then finds what it reflects by asking that picture (`seenIn`) where its
 * mirrored line of sight lands: for a flat mirror that is the very pixel the surface point itself is drawn at, and
 * for a rippled one (water) the line is tipped by the ripple first, which is what makes reflections wobble.
 */

/** A plane: the points p with normal·p + offset = 0. `normal` is one long and points out of the mirror's face. */
export interface MirrorPlane {
  /** The way the mirror faces, one long. */
  normal: Vec3
  /** Minus how far the plane is from the origin along the normal. */
  offset: number
}

/** A level mirror at height y, facing up: a pond. */
export const levelPlane = (y: number): MirrorPlane => ({ normal: [0, 1, 0], offset: -y })

/** How far `p` stands in front of the plane (negative behind it). */
export const inFront = (p: ArrayLike<number>, m: MirrorPlane) => m.normal[0] * p[0] + m.normal[1] * p[1] + m.normal[2] * p[2] + m.offset

/** `p` flipped through the plane: where it is seen in the mirror. */
export function reflectPoint(p: ArrayLike<number>, m: MirrorPlane): Vec3 {
  const d = 2 * inFront(p, m)
  return [p[0] - d * m.normal[0], p[1] - d * m.normal[1], p[2] - d * m.normal[2]]
}

/** The matrix that flips every point through the plane, 16 numbers by columns (as three.js keeps a Matrix4). It is its own inverse. */
export function mirrorMatrix(m: MirrorPlane): number[] {
  const [a, b, c] = m.normal, d = m.offset
  return [
    1 - 2 * a * a, -2 * a * b, -2 * a * c, 0,
    -2 * a * b, 1 - 2 * b * b, -2 * b * c, 0,
    -2 * a * c, -2 * b * c, 1 - 2 * c * c, 0,
    -2 * a * d, -2 * b * d, -2 * c * d, 1,
  ]
}

/** A picture of the mirrored world, with the camera it was drawn for. */
export interface MirrorImage {
  /** Pixels across. */
  width: number
  /** Pixels down. */
  height: number
  /** Red, green, blue (linear, multiplied by cover) and cover, four numbers a pixel, rows from the top. Cover is 0 where the mirror shows nothing but sky. */
  pixels: Float32Array
  /** The eye's own projection times view matrix when the picture was drawn, 16 numbers by columns: where a point of the mirrored world lands in the picture. */
  viewProj: ArrayLike<number>
  /** The mirror. */
  plane: MirrorPlane
}

/**
 * What the picture shows where the world point (x, y, z) is seen in the mirror: writes red, green, blue (times
 * cover) and cover into `out` and returns true, or returns false (and writes zeros) when the point is behind the
 * eye or off the picture. Blended between the four pixels round it.
 */
export function seenIn(img: MirrorImage, x: number, y: number, z: number, out: Float32Array | Float64Array | number[]): boolean {
  // through the mirror, then through the eye's camera
  const n = img.plane.normal, d = 2 * (n[0] * x + n[1] * y + n[2] * z + img.plane.offset)
  const mx = x - d * n[0], my = y - d * n[1], mz = z - d * n[2]
  const e = img.viewProj
  const w = e[3] * mx + e[7] * my + e[11] * mz + e[15]
  out[0] = out[1] = out[2] = out[3] = 0
  if (w <= 1e-6) return false
  const u = ((e[0] * mx + e[4] * my + e[8] * mz + e[12]) / w * 0.5 + 0.5) * img.width - 0.5
  const v = (0.5 - (e[1] * mx + e[5] * my + e[9] * mz + e[13]) / w * 0.5) * img.height - 0.5
  if (u < -0.5 || v < -0.5 || u > img.width - 0.5 || v > img.height - 0.5) return false
  const i = Math.max(0, Math.min(img.width - 2, Math.floor(u))), j = Math.max(0, Math.min(img.height - 2, Math.floor(v)))
  const fu = Math.max(0, Math.min(1, u - i)), fv = Math.max(0, Math.min(1, v - j))
  const p = img.pixels, a = (j * img.width + i) * 4, b = a + img.width * 4
  const w00 = (1 - fu) * (1 - fv), w10 = fu * (1 - fv), w01 = (1 - fu) * fv, w11 = fu * fv
  for (let c = 0; c < 4; c++) out[c] = p[a + c] * w00 + p[a + 4 + c] * w10 + p[b + c] * w01 + p[b + 4 + c] * w11
  return true
}
