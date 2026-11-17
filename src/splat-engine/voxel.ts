import { Blobs, quatFacing, type Vec3 } from '../splat-core/blobs.ts'
import { fromOklab, toOklab } from '../splat-core/color.ts'
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
 * color and cast no shadow. Three optional touches a pixel artist would paint
 * (all off unless the light asks): `ramp` turns shade cool and light warm
 * instead of only darker, `crevice` darkens what is shut in by other surfaces,
 * and `wear` lightens edges. A part's `grime` collects where it is shut in.
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
  /** A color (sRGB, 0–1) that gathers in its hollows and creases, as moss or dirt does. Needs the light's `crevice` to find them. */
  grime?: Vec3
}

/**
 * A blob placed as it is, not cut from a shape: soft, faint things in the air such as mist or a beam of light. Kept
 * under LOOSE_MAX opacity, so pixel mode's map of parts never takes one for a surface.
 */
export interface LooseBlob {
  center: Vec3
  /** Its radii along x, y and z. */
  scale: Vec3
  color: Vec3
  opacity: number
  bone: string
}

/**
 * A beam of light falling through the scene, as from a window or a gap in the leaves: surfaces inside it that face
 * back up it are lit by its color, on top of the sun, so the beam shows where it lands.
 */
export interface Beam {
  from: Vec3
  to: Vec3
  /** Its radius. */
  r: number
  color: Vec3
  /** 0–1. */
  strength: number
}

/** The most a loose blob may cover: under the engine's PART_CUT, so it never shows in the map of parts. */
export const LOOSE_MAX = 0.13

export interface VoxelLight {
  /** Direction toward the sun. */
  dir: Vec3
  /** Light that reaches everywhere, 0–1. */
  ambient: number
  /** How dark a cast shadow is: 0 leaves no shadow, 1 leaves only the ambient light. */
  shadow: number
  /** How far shade turns its hue toward cool violet and full sun toward warm yellow, as a painter's ramp does: 0 only darkens. */
  ramp?: number
  /** How much surfaces shut in by others (corners, cracks, the foot of a wall) darken: 0 to 1. */
  crevice?: number
  /** How much sharp outer edges lighten, as worn stone and wood do: 0 to 1. */
  wear?: number
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
  /** Blobs placed as they are, after the cut ones: see LooseBlob. */
  loose?: LooseBlob[]
  beams?: Beam[]
  /**
   * Lamps whose shadows are baked, in the order of the live lights they stand for (at most four; a gap is a light
   * that casts none): for each blob, how much of lamp k it can see goes in byte k of `seen`, and the engine's live
   * light pass scales that light by it, so a lamp's shadows flicker with it and cost nothing a frame.
   */
  lamps?: (Lamp | null | undefined)[]
}

export interface Lamp {
  at: Vec3
  /** How far its light reaches: blobs further off are not looked at (their byte stays full). */
  reach: number
}

/** How many lamps' shadows a blob carries, one byte each. */
export const MAX_LAMPS = 4
/** How far short of a lamp the look toward it stops, so the lamp's own housing doesn't shade everything. */
const LAMP_CLEAR = 0.15
/** Cells a side of the blocks that share one look toward a lamp. */
const LAMP_BLOCK = 2.5

/**
 * The brightest the baked sun makes a surface, as a share of its color. Only
 * `glow` parts are built brighter, so pixel mode can tell a lamp from a white
 * wall in the sun (GLOW_FROM in splat-core/pixel.ts sits just over it). Live
 * lights add on top: a surface under a strong one does pass the line and glow.
 */
export const LIT_MAX = 0.9

/** The painted touches pixel scenes use unless they say otherwise: hue-turning shade, dark crevices, worn edges. */
export const PAINTED = { ramp: 0.7, crevice: 0.5, wear: 0.5 }

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

/** How far out from a surface `openness` looks for others, in world units, and how much each look counts. */
const SHUT_REACH = [0.03, 0.06, 0.11, 0.18]
const SHUT_WEIGHT = [0.3, 0.3, 0.25, 0.15]

/**
 * How open a surface point is: 1 with nothing near in front of it, falling toward 0 in a corner, a crack or under
 * an overhang. Looks a few steps out along the normal and asks how much nearer than that the scene's surfaces are.
 */
function openness(casters: Shape[], p: Vec3, n: Vec3, spacing: number) {
  let shut = 0
  for (let k = 0; k < SHUT_REACH.length; k++) {
    const h = Math.max(SHUT_REACH[k], spacing * 1.5)
    const x = p[0] + n[0] * h, y = p[1] + n[1] * h, z = p[2] + n[2] * h
    // only a surface nearer than h counts, so a box further off than that is never asked
    let d = h
    for (const c of casters) {
      if (boxDistance(c, x, y, z) >= d) continue
      d = Math.min(d, c.sdf(x, y, z))
    }
    shut += SHUT_WEIGHT[k] * Math.min(1, Math.max(0, (h - d) / h))
  }
  return 1 - shut
}

type ReadyBeam = Beam & { axis: Vec3; len: number; dir: Vec3 }

/** A surface color with the beams it stands in added: brighter toward the beam's middle, only on faces turned back up it. */
function inBeams(beams: ReadyBeam[], p: Vec3, n: Vec3, base: Vec3, color: Vec3): Vec3 {
  let out = color
  for (const b of beams) {
    const q: Vec3 = [p[0] - b.from[0], p[1] - b.from[1], p[2] - b.from[2]]
    const along = q[0] * b.dir[0] + q[1] * b.dir[1] + q[2] * b.dir[2]
    // a little past its end, so the floor it ends on is lit
    if (along < 0 || along > b.len + b.r) continue
    const off = Math.hypot(q[0] - b.dir[0] * along, q[1] - b.dir[1] * along, q[2] - b.dir[2] * along)
    if (off >= b.r) continue
    const facing = -(n[0] * b.dir[0] + n[1] * b.dir[1] + n[2] * b.dir[2])
    if (facing <= 0) continue
    const soft = 1 - (off / b.r) ** 2
    // light falls on the surface's own color: a beam brightens what it lands on, and tints it
    const k = b.strength * soft * Math.min(1, facing * 1.4)
    out = [0, 1, 2].map((i) => out[i] + (base[i] * 0.6 + 0.4) * b.color[i] * k * 0.7) as Vec3
  }
  const top = Math.max(out[0], out[1], out[2])
  return top > LIT_MAX ? (out.map((v) => (v * LIT_MAX) / top) as Vec3) : out
}

/** Hues (OKLab, radians) that shade turns toward and full sun turns toward: a cool violet and a warm yellow. */
const COOL = (295 * Math.PI) / 180
const WARM = (75 * Math.PI) / 180

/**
 * A surface color under the baked light. `shade` is how bright (0 to LIT_MAX), `lit` how much straight sun it takes
 * (0–1). With `ramp` the color doesn't only darken: shade turns its hue toward violet and gains a little chroma in the
 * middle tones, full sun leans warm, and even a gray goes cool in shadow, so a palette's cool darks get picked over its
 * browns. `lift` lightens it (a worn edge). Never brighter than LIT_MAX, which keeps it under pixel mode's glow line.
 */
export function bakedColor(base: Vec3, shade: number, lit: number, ramp: number, lift = 0): Vec3 {
  const c: Vec3 = [base[0] * shade, base[1] * shade, base[2] * shade]
  if (ramp <= 0 && lift <= 0) return c
  const [L, a, b] = toOklab(c)
  const dark = Math.min(1, Math.max(0, 1 - shade / LIT_MAX))
  const warm = Math.max(0, lit - 0.6) / 0.4
  let C = Math.hypot(a, b), h = Math.atan2(b, a)
  const turn = (to: number, by: number) => {
    const d = Math.atan2(Math.sin(to - h), Math.cos(to - h))
    h += Math.sign(d) * Math.min(Math.abs(d), by)
  }
  turn(COOL, ramp * dark * 0.6)
  turn(WARM, ramp * warm * 0.12)
  C *= 1 + ramp * dark * (1 - dark) * 1.4
  // a tint of the light's own color on top, which is what gives a gray a hue at all
  const cool = ramp * dark * 0.03, sun = ramp * warm * 0.012
  const out = fromOklab([
    Math.min(1, L + lift * 0.08),
    C * Math.cos(h) + cool * Math.cos(COOL) + sun * Math.cos(WARM),
    C * Math.sin(h) + cool * Math.sin(COOL) + sun * Math.sin(WARM),
  ])
  const top = Math.max(out[0], out[1], out[2])
  if (top > LIT_MAX) for (let i = 0; i < 3; i++) out[i] *= LIT_MAX / top
  return out
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
  let cutCount = 0
  const boneOf = spec.parts.map((p) => skeleton.index(p.bone))
  const casters = spec.parts.filter((p) => !p.glow && !p.noShadow).map((p) => p.shape)
  // far enough to cross the whole scene
  const far = Math.hypot(...[0, 1, 2].map((i) => Math.max(...spec.parts.map((p) => p.shape.max[i])) - Math.min(...spec.parts.map((p) => p.shape.min[i]))))

  const disc = spec.disc ?? 0.55
  const beams = (spec.beams ?? []).map((b) => {
    const axis: Vec3 = [b.to[0] - b.from[0], b.to[1] - b.from[1], b.to[2] - b.from[2]]
    return { ...b, axis, len: Math.hypot(...axis) || 1, dir: norm(axis) }
  })
  const lamps = (spec.lamps ?? []).slice(0, MAX_LAMPS)
  // grown as cells are made: four bytes a cell, one per lamp
  let sight = new Uint8Array(lamps.some(Boolean) ? 4096 * MAX_LAMPS : 0)
  const lampSeen = new Map<number, number>()
  // only shapes inside a lamp's reach can come between it and what it lights
  const lampCasters = lamps.map((l) => l && casters.filter((c) => boxDistance(c, l.at[0], l.at[1], l.at[2]) < l.reach * 2))
  const ramp = light.ramp ?? 0, crevice = light.crevice ?? 0, wear = light.wear ?? 0
  const buried = -Math.max(s, spec.keepBuried ?? 0)
  const blobs = new Blobs(4096)
  const parts: number[] = []
  const e = s * 0.5
  spec.parts.forEach((part, pi) => {
    const { sdf, min, max } = part.shape
    // parts on the same bone never move apart, so a cell buried in a neighbor is never seen
    const same = spec.parts.filter((q, qi) => qi !== pi && boneOf[qi] === boneOf[pi] && !q.glow && (q.opacity ?? 1) >= 0.9).map((q) => q.shape)
    // only shapes within reach of this part can shut its surface in
    const reach = Math.max(SHUT_REACH[SHUT_REACH.length - 1], s * 1.5) + s
    const near = crevice > 0 || part.grime ? casters.filter((c) => [0, 1, 2].every((i) => c.min[i] <= max[i] + reach && c.max[i] >= min[i] - reach)) : []
    const i0 = Math.floor(min[0] / s), i1 = Math.ceil(max[0] / s)
    const j0 = Math.floor(min[1] / s), j1 = Math.ceil(max[1] / s)
    const k0 = Math.floor(min[2] / s), k1 = Math.ceil(max[2] / s)
    const cell = (x: number, y: number, z: number) => {
      const d = sdf(x, y, z)
      // the outermost layer of cells inside the shape
      if (d > 0 || d <= -s * (spec.trueShell ? 4 : 1)) return
      if (same.some((q) => boxDistance(q, x, y, z) === 0 && q.sdf(x, y, z) < buried)) return
      const xa = sdf(x + e, y, z), xb = sdf(x - e, y, z), ya = sdf(x, y + e, z), yb = sdf(x, y - e, z), za = sdf(x, y, z + e), zb = sdf(x, y, z - e)
      const g: Vec3 = [xa - xb, ya - yb, za - zb]
      // the distance in world units, from how fast the shape's distance changes here
      if (spec.trueShell && (d * s) / (Math.hypot(g[0], g[1], g[2]) || s) <= -s) return
      const n = norm(g)
      const p: Vec3 = [x, y, z]
      let base = typeof part.color === 'function' ? part.color(p, n) : part.color
      let color = base
      if (!part.glow) {
        const facing = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2])
        const sun = facing > 0 ? 1 - light.shadow * (1 - sunlight(casters, [x + n[0] * s, y + n[1] * s, z + n[2] * s], L, s, far)) : 0
        let ambient = light.ambient
        if (crevice > 0 || part.grime) {
          // looked at from the surface itself, not from the cell's middle, so a flat face is fully open
          const open = openness(near, [x - n[0] * d, y - n[1] * d, z - n[2] * d], n, s)
          // a corner keeps out the light from all round, not the sun: a sunlit foot of a wall stays bright
          ambient *= 1 - crevice * (1 - open)
          if (part.grime) {
            const k = Math.min(1, Math.max(0, (1 - open) * 2.2 - 0.1)), gr = part.grime
            base = [base[0] + (gr[0] - base[0]) * k, base[1] + (gr[1] - base[1]) * k, base[2] + (gr[2] - base[2]) * k]
          }
        }
        const shade = (ambient + (1 - light.ambient) * facing * sun) * LIT_MAX
        // how sharply the surface bends outward here (from the samples the normal came from): 0 flat, over 1 at an edge
        const edge = wear > 0 ? Math.min(1, Math.max(0, (((xa + xb + ya + yb + za + zb - 6 * d) / (e * e)) * s - 0.5) / 1.5)) : 0
        color = bakedColor(base, shade, facing * sun, ramp, wear * edge)
        if (beams.length) color = inBeams(beams, p, n, base, color)
      }
      if (sight.length) {
        const at = blobs.count * MAX_LAMPS
        if (at + MAX_LAMPS > sight.length) { const g = new Uint8Array(sight.length * 2); g.set(sight); sight = g }
        for (let k = 0; k < MAX_LAMPS; k++) {
          const l = lamps[k]
          let v = 255
          if (l && !part.glow) {
            const q: Vec3 = [x + n[0] * s, y + n[1] * s, z + n[2] * s]
            const to: Vec3 = [l.at[0] - q[0], l.at[1] - q[1], l.at[2] - q[2]]
            const dist = Math.hypot(to[0], to[1], to[2])
            // past twice its reach the light is gone anyway (see the engine's falloff)
            if (dist < l.reach * 2 && dist > LAMP_CLEAR) {
              // shadows from a lamp are soft, so neighbors share one look: cells are taken a few at a time
              const B = s * LAMP_BLOCK
              const key = ((k * 2048 + Math.floor(q[0] / B) + 1024) * 2048 + Math.floor(q[1] / B) + 1024) * 2048 + Math.floor(q[2] / B) + 1024
              let got = lampSeen.get(key)
              if (got === undefined) { got = Math.round(255 * sunlight(lampCasters[k] ?? casters, q, norm(to), s, dist - LAMP_CLEAR)); lampSeen.set(key, got) }
              v = got
            }
          }
          sight[at + k] = v
        }
      }
      blobs.push({
        // a disc lying on the surface: flat along the normal, which is what live lights read as the way it faces
        center: p, scale: [s * disc, s * disc, s * 0.3], quat: quatFacing(n),
        color, opacity: part.opacity ?? 0.96,
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

  cutCount = blobs.count
  // loose blobs come last, each counted as a part of its own after the shapes
  for (const [k, b] of (spec.loose ?? []).entries()) {
    blobs.push({ center: b.center, scale: b.scale, quat: [0, 0, 0, 1], color: b.color, opacity: Math.min(b.opacity, LOOSE_MAX) })
    parts.push(spec.parts.length + k)
  }
  const looseBone = (spec.loose ?? []).map((b) => skeleton.index(b.bone))

  const skin = emptySkin(blobs.count)
  const partOf = new Uint16Array(blobs.count)
  let seen: Uint8Array | undefined
  if (lamps.some(Boolean)) {
    seen = new Uint8Array(blobs.count * MAX_LAMPS).fill(255)
    seen.set(sight.subarray(0, Math.min(sight.length, cutCount * MAX_LAMPS)))
  }
  for (let i = 0; i < blobs.count; i++) {
    partOf[i] = parts[i]
    const pi = parts[i]
    setWeights(skin, i, [[pi < boneOf.length ? boneOf[pi] : looseBone[pi - boneOf.length], 1]])
  }
  return { blobs, skin, skeleton, partOf, seen }
}
