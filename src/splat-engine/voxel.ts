import { Blobs, quatFacing, type Vec3 } from '../splat-core/blobs.ts'
import { Skeleton, emptySkin, setWeights, type Bone } from './rig.ts'
import type { Built } from './body.ts'

/**
 * A voxel builder for pixel-art scenes: shapes given as distance functions are
 * cut into a grid, and every grid cell on a shape's surface becomes one small,
 * nearly solid blob, a disc lying flat on the surface. Drawn small and snapped to a palette (pixelPass.ts)
 * a scene of these reads as chunky pixel art with real depth.
 *
 * Where body.ts scatters flat blobs over a creature's skin and blends them
 * between bones, this fills a regular grid and hangs each part on one bone, so
 * parts move rigidly (a lamp turns, a boat bobs) and the grid stays crisp.
 *
 * Light is baked into the colors: one sun, an ambient floor, and shadows cast
 * by every part on every other, found by marching from each blob toward the
 * sun through the scene's shapes in the rest pose. `glow` parts keep their
 * color and cast no shadow.
 */
export interface Shape {
  /** Distance to the surface: negative inside. */
  sdf: (x: number, y: number, z: number) => number
  /** A box that holds the whole shape. */
  min: Vec3
  max: Vec3
}

export interface VoxelPart {
  shape: Shape
  /** Color (0–1, sRGB) or color at a surface point given its outward normal. */
  color: Vec3 | ((p: Vec3, n: Vec3) => Vec3)
  /** The bone that carries it. */
  bone: string
  /** Unlit and casting no shadow: lamps, windows, beams of light. */
  glow?: boolean
  opacity?: number
  /** Casts no shadow on other parts (thin things far from the ground, like birds). */
  noShadow?: boolean
}

export interface VoxelLight {
  /** Direction toward the sun. */
  dir: Vec3
  /** Light that reaches everywhere, 0–1. */
  ambient: number
  /** How dark a cast shadow is: 0 leaves no shadow, 1 leaves only the ambient light. */
  shadow: number
}

export interface VoxelSpec {
  bones: Bone[]
  parts: VoxelPart[]
  /** Grid cell size in world units: one blob per surface cell. */
  spacing: number
  light?: Partial<VoxelLight>
  /** Skip blocks of cells far from a surface: much quicker for big smooth shapes, sound only for honest distance functions (sculpt.ts). */
  blocks?: boolean
  /**
   * Keep the outermost layer one cell thick in true distance, not in the shape's own units. A shape pushed in and
   * out (`displace`) can have a distance that changes faster than one unit per unit; read raw, its layer comes out
   * thinner than a cell and leaves holes you see the far side through. Creatures (sculpt.ts) turn this on.
   */
  trueShell?: boolean
  /** How deep (world units) a cell may sit inside a neighbor on its bone and still be made: a skirt that keeps a joint closed as parts move. */
  keepBuried?: number
  /**
   * A disc's radius (its blob's scale across the surface) as a share of `spacing`. The default leaves the grid
   * crisp for pixel mode, which cuts alpha; drawn smooth, discs that small let about a tenth of what lies behind
   * show between them, so a creature seen as blobs wants them wider.
   */
  disc?: number
}

/**
 * The brightest the baked sun makes a surface, as a share of its color. Only
 * `glow` parts are built brighter, so pixel mode can tell a lamp from a white
 * wall in the sun (GLOW_FROM in splat-core/pixel.ts sits just over it). Live
 * lights add on top: a surface under a strong one does pass the line and glow.
 */
export const LIT_MAX = 0.9

export const DEFAULT_LIGHT: VoxelLight = { dir: [-0.45, 0.75, 0.5], ambient: 0.35, shadow: 0.75 }

// --- Shapes

export function sphere(c: Vec3, r: number): Shape {
  return {
    sdf: (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r,
    min: [c[0] - r, c[1] - r, c[2] - r], max: [c[0] + r, c[1] + r, c[2] + r],
  }
}

/** An ellipsoid with radii along x, y and z (the distance is approximate, exact on the surface). */
export function ellipsoid(c: Vec3, r: Vec3): Shape {
  const m = Math.min(r[0], r[1], r[2])
  return {
    sdf: (x, y, z) => (Math.hypot((x - c[0]) / r[0], (y - c[1]) / r[1], (z - c[2]) / r[2]) - 1) * m,
    min: [c[0] - r[0], c[1] - r[1], c[2] - r[2]], max: [c[0] + r[0], c[1] + r[1], c[2] + r[2]],
  }
}

/** A box with half sizes `h`, its edges rounded by `round`. */
export function box(c: Vec3, h: Vec3, round = 0): Shape {
  return {
    sdf: (x, y, z) => {
      const qx = Math.abs(x - c[0]) - h[0] + round, qy = Math.abs(y - c[1]) - h[1] + round, qz = Math.abs(z - c[2]) - h[2] + round
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - round
    },
    min: [c[0] - h[0], c[1] - h[1], c[2] - h[2]], max: [c[0] + h[0], c[1] + h[1], c[2] + h[2]],
  }
}

/** A rounded cone from a (radius ra) to b (radius rb); equal radii make a capsule. */
export function cone(a: Vec3, b: Vec3, ra: number, rb = ra): Shape {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]
  const len2 = dx * dx + dy * dy + dz * dz || 1e-12
  const r = Math.max(ra, rb)
  return {
    sdf: (x, y, z) => {
      const px = x - a[0], py = y - a[1], pz = z - a[2]
      const t = Math.min(1, Math.max(0, (px * dx + py * dy + pz * dz) / len2))
      return Math.hypot(px - dx * t, py - dy * t, pz - dz * t) - (ra + (rb - ra) * t)
    },
    min: [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r],
    max: [Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r],
  }
}

/** A upright cylinder with flat ends, from y0 to y1; `r1` tapers it. */
export function cylinder(c: [x: number, z: number], y0: number, y1: number, r0: number, r1 = r0): Shape {
  const r = Math.max(r0, r1), mid = (y0 + y1) / 2, half = (y1 - y0) / 2
  return {
    sdf: (x, y, z) => {
      const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)))
      const side = Math.hypot(x - c[0], z - c[1]) - (r0 + (r1 - r0) * t)
      const cap = Math.abs(y - mid) - half
      return Math.hypot(Math.max(side, 0), Math.max(cap, 0)) + Math.min(Math.max(side, cap), 0)
    },
    min: [c[0] - r, y0, c[1] - r], max: [c[0] + r, y1, c[1] + r],
  }
}

/** A ring lying flat (about the y axis): `R` to the middle of the tube, `r` the tube's radius. */
export function torus(c: Vec3, R: number, r: number): Shape {
  return {
    sdf: (x, y, z) => Math.hypot(Math.hypot(x - c[0], z - c[2]) - R, y - c[1]) - r,
    min: [c[0] - R - r, c[1] - r, c[2] - R - r], max: [c[0] + R + r, c[1] + r, c[2] + R + r],
  }
}

/** A roof: a ridge along x at `top`, sloping down to `y0` at `hz` either side. */
export function roof(c: [x: number, z: number], y0: number, top: number, hx: number, hz: number): Shape {
  const k = (top - y0) / hz, len = Math.hypot(1, k)
  return {
    sdf: (x, y, z) => Math.max((Math.abs(z - c[1]) * k + (y - top)) / len, y0 - y, Math.abs(x - c[0]) - hx),
    min: [c[0] - hx, y0, c[1] - hz], max: [c[0] + hx, top, c[1] + hz],
  }
}

export function union(...s: Shape[]): Shape {
  return {
    sdf: (x, y, z) => { let d = Infinity; for (const k of s) d = Math.min(d, k.sdf(x, y, z)); return d },
    min: [0, 1, 2].map((i) => Math.min(...s.map((k) => k.min[i]))) as Vec3,
    max: [0, 1, 2].map((i) => Math.max(...s.map((k) => k.max[i]))) as Vec3,
  }
}

/** `a` with `b` cut out of it. */
export function cut(a: Shape, b: Shape): Shape {
  return { sdf: (x, y, z) => Math.max(a.sdf(x, y, z), -b.sdf(x, y, z)), min: a.min, max: a.max }
}

/** A shape pushed in or out by `f(x, y, z)` world units: ripples, rough rock. `reach` is the most it moves. */
export function displace(s: Shape, f: (x: number, y: number, z: number) => number, reach: number): Shape {
  return {
    sdf: (x, y, z) => s.sdf(x, y, z) - f(x, y, z),
    min: [s.min[0] - reach, s.min[1] - reach, s.min[2] - reach], max: [s.max[0] + reach, s.max[1] + reach, s.max[2] + reach],
  }
}

// --- Building

const norm = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] }

/** Distance from a point to a shape's box: never more than the distance to the shape. */
function boxDistance(s: Shape, x: number, y: number, z: number) {
  // written out plainly: this runs for every caster at every step of every cell's march to the sun
  const a = s.min, b = s.max
  const dx = x < a[0] ? a[0] - x : x > b[0] ? x - b[0] : 0
  const dy = y < a[1] ? a[1] - y : y > b[1] ? y - b[1] : 0
  const dz = z < a[2] ? a[2] - z : z > b[2] ? z - b[2] : 0
  return dx === 0 && dy === 0 && dz === 0 ? 0 : Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * How much sun reaches `p`: 1 in the open, 0 behind something. Marches toward
 * the sun through the casters, and softens the edge by how nearly the ray
 * grazed a shape.
 */
function sunlight(casters: Shape[], p: Vec3, L: Vec3, spacing: number, far: number) {
  let t = spacing * 2, lit = 1
  for (let step = 0; step < 48 && t < far; step++) {
    const x = p[0] + L[0] * t, y = p[1] + L[1] * t, z = p[2] + L[2] * t
    let d = Infinity
    for (const c of casters) {
      // the box is a cheap lower bound, so most shapes are never asked
      if (boxDistance(c, x, y, z) >= d) continue
      d = Math.min(d, c.sdf(x, y, z))
    }
    if (d < spacing * 0.25) return 0
    lit = Math.min(lit, (6 * d) / t)
    t += Math.max(d, spacing * 0.5)
  }
  return Math.min(1, Math.max(0, lit))
}

/**
 * Builds the scene's blobs, skin and skeleton. Cells sit on one grid shared by
 * every part (multiples of `spacing` from the origin), so parts line up, and
 * the same spec always gives the same blobs.
 */
export function buildVoxels(spec: VoxelSpec): Built {
  const s = spec.spacing
  const light = { ...DEFAULT_LIGHT, ...spec.light }
  const L = norm(light.dir)
  const skeleton = new Skeleton(spec.bones)
  const boneOf = spec.parts.map((p) => skeleton.index(p.bone))
  const casters = spec.parts.filter((p) => !p.glow && !p.noShadow).map((p) => p.shape)
  // far enough to cross the whole scene
  const far = Math.hypot(...[0, 1, 2].map((i) => Math.max(...spec.parts.map((p) => p.shape.max[i])) - Math.min(...spec.parts.map((p) => p.shape.min[i]))))

  const disc = spec.disc ?? 0.55
  const buried = -Math.max(s, spec.keepBuried ?? 0)
  const blobs = new Blobs(4096)
  const parts: number[] = []
  const e = s * 0.5
  spec.parts.forEach((part, pi) => {
    const { sdf, min, max } = part.shape
    // parts on the same bone never move apart, so a cell buried in a neighbor is never seen
    const same = spec.parts.filter((q, qi) => qi !== pi && boneOf[qi] === boneOf[pi] && !q.glow && (q.opacity ?? 1) >= 0.9).map((q) => q.shape)
    const i0 = Math.floor(min[0] / s), i1 = Math.ceil(max[0] / s)
    const j0 = Math.floor(min[1] / s), j1 = Math.ceil(max[1] / s)
    const k0 = Math.floor(min[2] / s), k1 = Math.ceil(max[2] / s)
    const cell = (x: number, y: number, z: number) => {
      const d = sdf(x, y, z)
      // the outermost layer of cells inside the shape
      if (d > 0 || d <= -s * (spec.trueShell ? 4 : 1)) return
      if (same.some((q) => boxDistance(q, x, y, z) === 0 && q.sdf(x, y, z) < buried)) return
      const g: Vec3 = [sdf(x + e, y, z) - sdf(x - e, y, z), sdf(x, y + e, z) - sdf(x, y - e, z), sdf(x, y, z + e) - sdf(x, y, z - e)]
      // the distance in world units, from how fast the shape's distance changes here
      if (spec.trueShell && (d * s) / (Math.hypot(g[0], g[1], g[2]) || s) <= -s) return
      const n = norm(g)
      const p: Vec3 = [x, y, z]
      const base = typeof part.color === 'function' ? part.color(p, n) : part.color
      let shade = 1
      if (!part.glow) {
        const facing = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2])
        const sun = facing > 0 ? 1 - light.shadow * (1 - sunlight(casters, [x + n[0] * s, y + n[1] * s, z + n[2] * s], L, s, far)) : 0
        shade = (light.ambient + (1 - light.ambient) * facing * sun) * LIT_MAX
      }
      blobs.push({
        // a disc lying on the surface: flat along the normal, which is what live lights read as the way it faces
        center: p, scale: [s * disc, s * disc, s * 0.3], quat: quatFacing(n),
        color: [base[0] * shade, base[1] * shade, base[2] * shade], opacity: part.opacity ?? 0.96,
      })
      parts.push(pi)
    }
    if (spec.blocks) {
      // Whole blocks of cells well clear of the surface are passed over on one reading at their middle.
      // That is only sound for shapes whose `sdf` never overstates the distance by much, hence the slack.
      const B = 4
      const reach = B * s * 0.87 * 1.5 + s
      for (let j = j0; j <= j1; j += B) {
        for (let k = k0; k <= k1; k += B) {
          for (let i = i0; i <= i1; i += B) {
            const d = sdf((i + (B - 1) / 2) * s, (j + (B - 1) / 2) * s, (k + (B - 1) / 2) * s)
            if (d > reach || d < -reach - s) continue
            for (let jj = j; jj < j + B && jj <= j1; jj++) for (let kk = k; kk < k + B && kk <= k1; kk++) for (let ii = i; ii < i + B && ii <= i1; ii++) cell(ii * s, jj * s, kk * s)
          }
        }
      }
    } else {
      for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) cell(i * s, j * s, k * s)
    }
  })

  const skin = emptySkin(blobs.count)
  const partOf = new Uint16Array(blobs.count)
  for (let i = 0; i < blobs.count; i++) {
    partOf[i] = parts[i]
    setWeights(skin, i, [[boneOf[parts[i]], 1]])
  }
  return { blobs, skin, skeleton, partOf }
}
