import { Blobs, quatFacing, type Quat, type Vec3 } from '../splat-core/blobs.ts'
import { quatFromAxes } from './fur.ts'
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
  /**
   * For a shape made of many pieces (the bricks of a wall, the posts of a fence, the columns of a basalt
   * causeway): which piece a surface point belongs to, as a whole number 0 or more, or -1 for what lies between
   * them (mortar). The `pieces` paint gives every piece a color of its own.
   */
  pieceAt?: (p: Vec3) => number
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
  /** Takes none of the scene's `cover`: water, glass, anything that moves through it or was just made. */
  bare?: boolean
  /** Little drawn marks over the surface: see Ink. */
  ink?: Ink
  /** Water, ice or glass: see Glass. Needs the spec's `eye`. */
  glass?: Glass
  /**
   * Dabs that follow the form: 0 leaves each cell a round disc; up to 1 draws it as a stroke along the level line
   * round the shape, as a painter's brush goes round a pot or a trunk. Seen as blobs it reads as brushwork; in pixel
   * mode it barely shows.
   */
  strokes?: number
}

/**
 * A surface you see into and that mirrors what is over it, baked for one place to look from (the spec's `eye`, the
 * scene's camera): pixel mode cuts anything faint, so instead of being drawn see-through, each cell takes the color
 * of what lies behind it on the line from the eye (`see`) and of what its mirror line meets (`mirror`, stronger at a
 * glancing look, as on real water). Seen from far off the scene's own view it is a painting of glass, not glass.
 */
export interface Glass {
  /** How much of what is behind shows through: 0 to 1. */
  see?: number
  /** How much it mirrors, looked at straight on; more at a glancing look. 0 to 1. */
  mirror?: number
  /** Only its upturned faces: a pond cut as one slab whose sides are earth. */
  top?: boolean
}

/**
 * Inked detail: the surface is taken in blocks of 4×4 cells (one picture pixel each in pixel mode), and a share of
 * the blocks (`amount`) each carry one small mark of the kind, picked, turned and flipped at random per block and with
 * the blocks of each row shifted, so a big wall never shows a repeat. `color` is the ink; left out, a darker step of
 * the paint under it.
 */
export interface Ink {
  kind: InkKind
  amount?: number
  color?: Vec3
}

export type InkKind = 'hatch' | 'stipple' | 'cracks' | 'grain' | 'tufts' | 'scales'

/** The marks of each kind, 4×4, top row first. Kinds in UPRIGHT only ever flip side to side: grass grows up, wood grain runs along. */
export const INK_MARKS: Record<InkKind, string[]> = {
  hatch: ['#....#....#.....', '......#....#....', '#....#.......#..', '.#....#.........'],
  stipple: ['.......#........', '#.........#.....', '.#.......#....#.', '.....#..........'],
  cracks: ['#....##....#....', '.#...#..#.#....#', '....##....##....', '..#..#..##......'],
  grain: ['....###.........', '##........##....', '....####........', '.........###....'],
  tufts: ['#.#..#..........', '..#...#.........', '.....#.#..#.....', '#...#...........'],
  scales: ['.##.#..#........', '.........##.#..#', '.#..#.#.........', '..........#..#.#'],
}
const UPRIGHT = new Set<InkKind>(['grain', 'tufts', 'scales'])

const ihash = (a: number, b: number, c: number, d: number) => { const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + d * 19.3) * 43758.5453; return v - Math.floor(v) }

/** Whether the cell at grid (gx, gy, gz) with normal `n` carries ink of this kind: see Ink. `seed` keeps parts apart. */
export function inkedAt(ink: Ink, gx: number, gy: number, gz: number, n: Vec3, seed: number) {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2])
  // across the face and up it, and the way through it
  const [u, v, w] = ay >= ax && ay >= az ? [gx, gz, gy] : ax >= az ? [gz, gy, gx] : [gx, gy, gz]
  const ty = Math.floor(v / 4), shifted = u + Math.floor(ihash(ty, w >> 2, seed, 7) * 4), tx = Math.floor(shifted / 4), tw = w >> 2
  if (ihash(tx, ty, tw, seed) >= (ink.amount ?? 0.5)) return false
  const marks = INK_MARKS[ink.kind]
  const mark = marks[Math.floor(ihash(tx, ty, tw, seed + 1) * marks.length)]
  const turn = Math.floor(ihash(tx, ty, tw, seed + 2) * 8) & (UPRIGHT.has(ink.kind) ? 1 : 7)
  let a = shifted - tx * 4, b = v - ty * 4
  if (turn & 4) [a, b] = [b, a]
  if (turn & 1) a = 3 - a
  if (turn & 2) b = 3 - b
  return mark[(3 - b) * 4 + a] === '#'
}

/** The ink a color takes by default: a darker, slightly richer step of it. */
export function inkOf(c: Vec3): Vec3 {
  const [L, a, b] = toOklab(c)
  return fromOklab([L * 0.45, a * 1.1, b * 1.1])
}

/**
 * Something laid over the whole scene once it is cut: `snow` settles on tops that the sky can reach, `moss` creeps
 * over shut-in and up-turned faces in patches, `dust` lies thin on every upturned face, under cover or not.
 */
export interface Cover {
  kind: 'snow' | 'moss' | 'dust'
  /** sRGB, 0–1. */
  color: Vec3
  /** 0–1: how much of the scene it takes, from a dusting to most of what faces up. */
  amount: number
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
  /** How much color surfaces throw onto what faces them, as a red wall warms the floor beside it: 0 to 1. */
  bounce?: number
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
  /** Snow, moss or dust over every part that isn't `bare` or `glow`: see Cover. */
  cover?: Cover
  /**
   * Where the eye goes: within `r` of `at` the grid is as fine as `spacing`; further out it is twice as coarse, with
   * discs twice the size, so the subject keeps its detail and the rest is painted broadly in a quarter of the blobs. Only parts at least
   * eight cells across every way go coarse: a thinner one could miss every coarse cell.
   */
  focus?: { at: Vec3; r: number }
  /** Where `glass` parts are looked at from: the scene's camera. */
  eye?: Vec3
  /** The sky a `glass` part mirrors where its mirror line meets nothing: [overhead, at the horizon]. Dark when left out. */
  sky?: [Vec3, Vec3]
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

/** How far bounced light comes from, in world units. */
const BOUNCE_REACH = 0.5

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
    pieceAt: nearestPiece(s),
  }
}

/** The pieces of whichever shape is nearest the point, offset so two shapes' pieces never share a number; undefined when none has pieces. */
function nearestPiece(s: Shape[], always = false): Shape['pieceAt'] {
  if (!always && !s.some((k) => k.pieceAt)) return undefined
  return (p) => {
    let best = Infinity, at = 0
    s.forEach((k, i) => { const d = k.sdf(p[0], p[1], p[2]); if (d < best) { best = d; at = i } })
    const k = s[at]
    if (!k.pieceAt) return at * 7919
    const id = k.pieceAt(p)
    return id < 0 ? id : id + at * 7919
  }
}

/** A shape's box as low and high corners. */
const boxBetween = (a: Shape) => ({ lo: a.min, hi: a.max })

/** The distance between two boxes, 0 when they touch. */
function boxGap(a: { lo: Vec3; hi: Vec3 }, b: { lo: Vec3; hi: Vec3 }) {
  let q = 0
  for (let i = 0; i < 3; i++) { const g = Math.max(a.lo[i] - b.hi[i], b.lo[i] - a.hi[i], 0); q += g * g }
  return Math.sqrt(q)
}

/**
 * Many shapes made one, fast however many there are: the shapes are sorted into a grid of buckets, and a point asks
 * only the shapes near its bucket (`union` asks every one). The distance is exact near any surface and never more
 * than the true distance elsewhere, which is all the builder and the sun's march need. For a wall's fallen bricks, a
 * fence's posts and rails, a field of stalagmites: anything scattered of many small pieces.
 */
export function many(shapes: Shape[]): Shape {
  if (shapes.length <= 6) return { ...union(...shapes), pieceAt: nearestPiece(shapes, true) }
  const all = union(...shapes)
  const lo = all.min, hi = all.max
  const ext = [0, 1, 2].map((i) => Math.max(hi[i] - lo[i], 1e-6))
  // buckets about as big as a typical piece, and not more than about 4096 of them
  const sizes = shapes.map((k) => Math.max(k.max[0] - k.min[0], k.max[1] - k.min[1], k.max[2] - k.min[2])).sort((a, b) => a - b)
  let cell = sizes[sizes.length >> 1] / 3
  while (ext.reduce((n, e) => n * Math.ceil(e / cell), 1) > 4096) cell *= 1.25
  const n = ext.map((e) => Math.max(1, Math.ceil(e / cell)))
  const near: number[][] = [], clear: number[] = []
  const boxes = shapes.map(boxBetween)
  for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
    const b = { lo: [lo[0] + i * cell, lo[1] + j * cell, lo[2] + k * cell] as Vec3, hi: [lo[0] + (i + 1) * cell, lo[1] + (j + 1) * cell, lo[2] + (k + 1) * cell] as Vec3 }
    const list: number[] = []
    let c = Infinity
    boxes.forEach((s, si) => { const g = boxGap(s, b); if (g <= cell) list.push(si); else c = Math.min(c, g) })
    near.push(list); clear.push(c)
  }
  /** The shapes listed for the bucket round (qx, qy, qz) asked at (x, y, z), `out` from it; the rest are at least their gap less `out` away. */
  const ask = (qx: number, qy: number, qz: number, x: number, y: number, z: number, out: number) => {
    const i = Math.min(n[0] - 1, Math.max(0, Math.floor((qx - lo[0]) / cell)))
    const j = Math.min(n[1] - 1, Math.max(0, Math.floor((qy - lo[1]) / cell)))
    const k = Math.min(n[2] - 1, Math.max(0, Math.floor((qz - lo[2]) / cell)))
    let d = clear[(k * n[1] + j) * n[0] + i] - out
    for (const si of near[(k * n[1] + j) * n[0] + i]) d = Math.min(d, shapes[si].sdf(x, y, z))
    return d
  }
  return {
    sdf: (x, y, z) => {
      const qx = Math.min(hi[0], Math.max(lo[0], x)), qy = Math.min(hi[1], Math.max(lo[1], y)), qz = Math.min(hi[2], Math.max(lo[2], z))
      const out = Math.hypot(x - qx, y - qy, z - qz)
      // just outside the box (where the builder still looks), the shapes near its edge give the exact distance
      if (out <= cell / 2) { const d = ask(qx, qy, qz, x, y, z, out); return out > 0 ? Math.max(out, d) : d }
      // far outside: from the nearest point on the box, which no shape is nearer than (the box is convex)
      const d = ask(qx, qy, qz, qx, qy, qz, 0)
      return d <= 0 ? out : Math.hypot(out, d)
    },
    min: lo, max: hi,
    // each shape is a piece (or its own pieces, numbered apart)
    pieceAt: (p) => {
      // the nearest shape in the point's bucket
      const i = Math.min(n[0] - 1, Math.max(0, Math.floor((p[0] - lo[0]) / cell)))
      const j = Math.min(n[1] - 1, Math.max(0, Math.floor((p[1] - lo[1]) / cell)))
      const k = Math.min(n[2] - 1, Math.max(0, Math.floor((p[2] - lo[2]) / cell)))
      let best = Infinity, at = -1
      for (const si of near[(k * n[1] + j) * n[0] + i]) { const d = shapes[si].sdf(p[0], p[1], p[2]); if (d < best) { best = d; at = si } }
      if (at < 0) return 0
      const id = shapes[at].pieceAt?.(p) ?? 0
      return id < 0 ? id : id + at * 7919
    },
  }
}

/**
 * A box turned any way: `axes` are its three edge directions (unit length, square to each other) and `half` its half
 * size along each. Fallen bricks, leaning posts, rails between them.
 */
export function orientedBox(c: Vec3, axes: [Vec3, Vec3, Vec3], h: Vec3, round = 0): Shape {
  const [a, b, w] = axes
  const ex: Vec3 = [0, 0, 0]
  for (let i = 0; i < 3; i++) ex[i] = Math.abs(a[i]) * h[0] + Math.abs(b[i]) * h[1] + Math.abs(w[i]) * h[2]
  return {
    sdf: (x, y, z) => {
      const px = x - c[0], py = y - c[1], pz = z - c[2]
      const qx = Math.abs(px * a[0] + py * a[1] + pz * a[2]) - h[0] + round
      const qy = Math.abs(px * b[0] + py * b[1] + pz * b[2]) - h[1] + round
      const qz = Math.abs(px * w[0] + py * w[1] + pz * w[2]) - h[2] + round
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - round
    },
    min: [c[0] - ex[0], c[1] - ex[1], c[2] - ex[2]], max: [c[0] + ex[0], c[1] + ex[1], c[2] + ex[2]],
  }
}

/** How a `blend` meets where its shapes touch: a rounded fillet, a flat bevel, or a run of little steps. */
export type BlendKind = 'smooth' | 'chamfer' | 'stairs'

/** Shapes joined so the seam between them is filled in: `r` is how far the fillet, bevel or stairs reach. */
export function blend(kind: BlendKind, r: number, shapes: Shape[], steps = 3): Shape {
  const two = (a: number, b: number) => {
    if (kind === 'chamfer') return Math.min(a, b, (a + b - r) * Math.SQRT1_2)
    if (kind === 'stairs') {
      const st = r / steps, u = b - r, m = u - a + st
      return Math.min(a, b, 0.5 * (u + a + Math.abs(m - 2 * st * Math.floor(m / (2 * st)) - st)))
    }
    const h = Math.max(r - Math.abs(a - b), 0) / r
    return Math.min(a, b) - (h * h * r) / 4
  }
  const all = union(...shapes)
  return {
    sdf: (x, y, z) => { let d = shapes[0].sdf(x, y, z); for (let i = 1; i < shapes.length; i++) d = two(d, shapes[i].sdf(x, y, z)); return d },
    min: [all.min[0] - r, all.min[1] - r, all.min[2] - r], max: [all.max[0] + r, all.max[1] + r, all.max[2] + r],
    pieceAt: all.pieceAt,
  }
}

/** The signed distance from (px, py) to a closed polygon, negative inside. */
function polygonDistance(v: [number, number][], px: number, py: number) {
  let d = (px - v[0][0]) ** 2 + (py - v[0][1]) ** 2, sign = 1
  for (let i = 0, j = v.length - 1; i < v.length; j = i, i++) {
    const ex = v[j][0] - v[i][0], ey = v[j][1] - v[i][1], wx = px - v[i][0], wy = py - v[i][1]
    const t = Math.min(1, Math.max(0, (wx * ex + wy * ey) / (ex * ex + ey * ey || 1e-12)))
    d = Math.min(d, (wx - ex * t) ** 2 + (wy - ey * t) ** 2)
    const a = py >= v[i][1], b = py < v[j][1], c = ex * wy > ey * wx
    if ((a && b && c) || (!a && !b && !c)) sign = -sign
  }
  return sign * Math.sqrt(d)
}

/**
 * A turned shape, as from a lathe: `profile` is [radius, height] pairs from the bottom up, standing on `c`, and the
 * outline is spun about the upright axis through it. Vases, bells, bottles, chess pieces, lamp posts.
 */
export function lathe(c: Vec3, profile: [number, number][]): Shape {
  const v: [number, number][] = [[0, profile[0][1]], ...profile, [0, profile[profile.length - 1][1]]]
  const R = Math.max(...profile.map((q) => q[0])), lo = Math.min(...profile.map((q) => q[1])), hi = Math.max(...profile.map((q) => q[1]))
  return {
    sdf: (x, y, z) => polygonDistance(v, Math.hypot(x - c[0], z - c[2]), y - c[1]),
    min: [c[0] - R, c[1] + lo, c[2] - R], max: [c[0] + R, c[1] + hi, c[2] + R],
  }
}

/** A tube along a path of points, `r0` thick at the start and `r1` at the end: vines, pipes, rails, a dragon's tail. */
export function sweep(path: Vec3[], r0: number, r1 = r0): Shape {
  const lens = path.slice(1).map((q, i) => Math.hypot(q[0] - path[i][0], q[1] - path[i][1], q[2] - path[i][2]))
  const total = lens.reduce((a, b) => a + b, 0) || 1
  let run = 0
  const bits = lens.map((l, i) => {
    const ra = r0 + ((r1 - r0) * run) / total
    run += l
    return cone(path[i], path[i + 1], ra, r0 + ((r1 - r0) * run) / total)
  })
  return union(...bits)
}

/** The 3×5 letters `pixelText` knows, top row first. */
export const LETTERS: Record<string, string> = {
  A: '.#.#.#####.##.#', B: '##.#.###.#.###.', C: '.###..#..#...##', D: '##.#.##.##.###.', E: '####..##.#..###', F: '####..##.#..#..',
  G: '.###..#.##.#.##', H: '#.##.#####.##.#', I: '###.#..#..#.###', J: '..#..#..##.#.#.', K: '#.##.###.#.##.#', L: '#..#..#..#..###',
  M: '#.########.##.#', N: '##.#.##.##.##.#', O: '.#.#.##.##.#.#.', P: '##.#.###.#..#..', Q: '.#.#.##.###..##', R: '##.#.###.#.##.#',
  S: '.###...#...###.', T: '###.#..#..#..#.', U: '#.##.##.##.####', V: '#.##.##.##.#.#.', W: '#.##.########.#', X: '#.##.#.#.#.##.#',
  Y: '#.##.#.#..#..#.', Z: '###..#.#.#..###', 0: '####.##.##.####', 1: '.#.##..#..#.###', 2: '##...#.#.#..###', 3: '##...#.#...###.',
  4: '#.##.####..#..#', 5: '####..##...###.', 6: '.###..####.####', 7: '###..#.#..#..#.', 8: '####.#####.####', 9: '####.####..###.',
  ' ': '...............', '.': '.............#.', '!': '.#..#..#.....#.', '?': '##...#.#.....#.', '-': '......###......', ':': '....#.....#....',
  ',': '..........#.#..',
}

/** A filled grid of cells `size` across, with distances good enough to cut it: negative inside, the far side of a filled cell beside an empty one. */
function gridDistance(filled: (i: number, j: number, k: number) => boolean, size: number, gx: number, gy: number, gz: number, flat: boolean) {
  const i = Math.floor(gx), j = Math.floor(gy), k = Math.floor(gz)
  const inside = filled(i, j, k)
  let best = Infinity
  for (let dk = flat ? 0 : -1; dk <= (flat ? 0 : 1); dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    if ((di | dj | dk) === 0 || filled(i + di, j + dj, k + dk) === inside) continue
    // distance (in cells) from the point to that neighbor's box
    const ox = Math.max(i + di - gx, gx - (i + di + 1), 0), oy = Math.max(j + dj - gy, gy - (j + dj + 1), 0), oz = flat ? 0 : Math.max(k + dk - gz, gz - (k + dk + 1), 0)
    best = Math.min(best, Math.hypot(ox, oy, oz))
  }
  return (inside ? -1 : 1) * Math.min(best, 1) * size
}

/**
 * Words in blocky 3×5 letters (`LETTERS`; lower case is read as upper), `size` tall and `depth` thick, centered on
 * `at` and reading along +x, or along -z when `facing` is 'x'. A letter needs about five grid cells of height to read.
 */
export function pixelText(at: Vec3, text: string, size: number, depth: number, facing: 'z' | 'x' = 'z'): Shape {
  const px = size / 5, chars = [...text.toUpperCase()].map((ch) => LETTERS[ch] ?? LETTERS[' '])
  const wide = chars.length * 4 - 1, half = (wide * px) / 2
  const lit = (i: number, j: number) => {
    if (i < 0 || j < 0 || j > 4 || i >= wide || i % 4 === 3) return false
    return chars[(i / 4) | 0][(4 - j) * 3 + (i % 4)] === '#'
  }
  const fx = facing === 'x'
  return {
    sdf: (x, y, z) => {
      const u = fx ? at[2] - z : x - at[0], w = fx ? x - at[0] : z - at[2]
      const d2 = gridDistance((i, j) => lit(i, j), px, (u + half) / px, (y - at[1] + size / 2) / px, 0, true)
      const dw = Math.abs(w) - depth / 2
      return Math.hypot(Math.max(d2, 0), Math.max(dw, 0)) + Math.min(Math.max(d2, dw), 0)
    },
    min: fx ? [at[0] - depth / 2, at[1] - size / 2, at[2] - half] : [at[0] - half, at[1] - size / 2, at[2] - depth / 2],
    max: fx ? [at[0] + depth / 2, at[1] + size / 2, at[2] + half] : [at[0] + half, at[1] + size / 2, at[2] + depth / 2],
  }
}

/**
 * A model drawn as letters: `layers` from the bottom up, each a list of rows from the back (-z) to the front, each
 * row a string read along +x; any character but '.' or a space fills a cube `size` across. Standing on `at`, centered
 * on it across. `letterAt` says which letter a point is in, so a paint can color the model by letter.
 */
export function letterGrid(at: Vec3, size: number, layers: string[][]): Shape & { letterAt: (p: Vec3, n: Vec3) => string | undefined } {
  const nx = Math.max(...layers.flatMap((l) => l.map((r) => r.length))), nz = Math.max(...layers.map((l) => l.length)), ny = layers.length
  const x0 = at[0] - (nx * size) / 2, z0 = at[2] - (nz * size) / 2, y0 = at[1]
  const ch = (i: number, j: number, k: number) => {
    const c = layers[j]?.[k]?.[i]
    return c === undefined || c === '.' || c === ' ' ? undefined : c
  }
  const filled = (i: number, j: number, k: number) => ch(i, j, k) !== undefined
  return {
    sdf: (x, y, z) => gridDistance(filled, size, (x - x0) / size, (y - y0) / size, (z - z0) / size, false),
    min: [x0, y0, z0], max: [x0 + nx * size, y0 + ny * size, z0 + nz * size],
    letterAt: (p, n) => {
      // a little way in from the surface, then the nearest filled cell round it
      const gx = (p[0] - n[0] * size * 0.25 - x0) / size, gy = (p[1] - n[1] * size * 0.25 - y0) / size, gz = (p[2] - n[2] * size * 0.25 - z0) / size
      const i = Math.floor(gx), j = Math.floor(gy), k = Math.floor(gz)
      let best: string | undefined, bd = Infinity
      for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const c = ch(i + di, j + dj, k + dk)
        if (c === undefined) continue
        const d = (i + di + 0.5 - gx) ** 2 + (j + dj + 0.5 - gy) ** 2 + (k + dk + 0.5 - gz) ** 2
        if (d < bd) { bd = d; best = c }
      }
      return best
    },
  }
}

/** `a` with `b` cut out of it. */
export function cut(a: Shape, b: Shape): Shape {
  return { sdf: (x, y, z) => Math.max(a.sdf(x, y, z), -b.sdf(x, y, z)), min: a.min, max: a.max, pieceAt: a.pieceAt }
}

/** A shape pushed in or out by `f(x, y, z)` world units: ripples, rough rock. `reach` is the most it moves. */
export function displace(s: Shape, f: (x: number, y: number, z: number) => number, reach: number): Shape {
  return {
    sdf: (x, y, z) => s.sdf(x, y, z) - f(x, y, z),
    min: [s.min[0] - reach, s.min[1] - reach, s.min[2] - reach], max: [s.max[0] + reach, s.max[1] + reach, s.max[2] + reach],
    pieceAt: s.pieceAt,
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

/** Smooth noise in 0–1 with lumps about `size` across, for patches that don't follow the grid. */
function patches(x: number, y: number, z: number, size: number) {
  const h = (i: number, j: number, k: number) => { const v = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v) }
  const fx = x / size, fy = y / size, fz = z / size
  const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz)
  const u = fx - i, v = fy - j, w = fz - k
  const a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v), c = w * w * (3 - 2 * w)
  const lerp = (p: number, q: number, t: number) => p + (q - p) * t
  const face = (kk: number) => lerp(lerp(h(i, j, kk), h(i + 1, j, kk), a), lerp(h(i, j + 1, kk), h(i + 1, j + 1, kk), a), b)
  return lerp(face(k), face(k + 1), c)
}

const smooth = (lo: number, hi: number, t: number) => { const u = Math.min(1, Math.max(0, (t - lo) / (hi - lo))); return u * u * (3 - 2 * u) }

/**
 * How much of a cover lies on a surface point, 0–1. `open` is its openness (moss wants it low) and `sky` how much
 * of the sky straight up it sees (snow wants it high); each is only asked for when the kind needs it.
 */
export function coverAt(cover: Cover, p: Vec3, n: Vec3, spacing: number, open: () => number, sky: () => number) {
  const a = Math.min(1, Math.max(0, cover.amount))
  if (a <= 0) return 0
  const lumpy = patches(p[0], p[1], p[2], spacing * 4) - 0.5
  if (cover.kind === 'snow') {
    // a top takes it first, steeper faces as the amount grows; ragged where it gives out
    const from = 1 - a * 1.1
    const k = smooth(from, from + 0.2, n[1] + lumpy * 0.35)
    return k > 0 ? k * smooth(0.25, 0.7, sky()) : 0
  }
  if (cover.kind === 'dust') return Math.min(0.85, a * smooth(0.2, 0.9, n[1] + lumpy * 0.3))
  // moss: up-turned and shut-in faces, in patches; nothing on the underside of things
  if (n[1] < -0.3) return 0
  const want = 0.45 * smooth(-0.3, 0.8, n[1]) + 0.55 * (1 - open()) + lumpy * 0.9
  return smooth(1 - a, 1.15 - a, want)
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
  // what a line from a glass cell meets: any part that casts a shadow or glows, but not the glass itself
  const lookable = spec.parts.map((q, qi) => ({ q, qi })).filter(({ q }) => q.glow || !q.noShadow)
  const sky = spec.sky ?? [[0.05, 0.06, 0.1], [0.1, 0.1, 0.14]]
  // `deep` is what shows once the line leaves the glass's own part with nothing met inside it: the bottom of a pond
  const lookAlong = (from: Vec3, dir: Vec3, skip: number, deep?: Vec3, reach = far): Vec3 | undefined => {
    let t = s * 0.5
    for (let step = 0; step < 64 && t < reach; step++) {
      const x = from[0] + dir[0] * t, y = from[1] + dir[1] * t, z = from[2] + dir[2] * t
      if (deep && spec.parts[skip].shape.sdf(x, y, z) > 0) return deep
      let d = Infinity, hit = -1
      for (const { q, qi } of lookable) {
        if (qi === skip || boxDistance(q.shape, x, y, z) >= d) continue
        const k = q.shape.sdf(x, y, z)
        if (k < d) { d = k; hit = qi }
      }
      if (d < s * 0.5 && hit >= 0) {
        const q = spec.parts[hit], f = q.shape.sdf, h = s * 0.5
        const n = norm([f(x + h, y, z) - f(x - h, y, z), f(x, y + h, z) - f(x, y - h, z), f(x, y, z + h) - f(x, y, z - h)])
        const at: Vec3 = [x, y, z]
        const c = typeof q.color === 'function' ? q.color(at, n) : q.color
        if (q.glow) return c
        const facing = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2])
        return bakedColor(c, (light.ambient + (1 - light.ambient) * facing) * LIT_MAX, facing, ramp)
      }
      t += Math.max(d, s * 0.5)
    }
    if (reach < far) return undefined
    const up = Math.min(1, Math.max(0, dir[1]))
    return [0, 1, 2].map((i) => sky[1][i] + (sky[0][i] - sky[1][i]) * up) as Vec3
  }
  /** A cell's disc: round and lying on the surface, or a stroke along the level line round the shape. */
  const dab = (n: Vec3, strokes: number, k: number): { scale: Vec3; quat: Quat } => {
    if (strokes <= 0 || Math.abs(n[1]) > 0.97) return { scale: [s * disc * k, s * disc * k, s * 0.3 * k], quat: quatFacing(n) }
    const t = norm([n[2], 0, -n[0]]), b: Vec3 = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]]
    return { scale: [s * disc * k * (1 + strokes), s * disc * k * (1 - strokes * 0.25), s * 0.3 * k], quat: quatFromAxes(t, b, n) }
  }
  const glassSeen = new Map<number, [Vec3, Vec3]>()
  const bounce = light.bounce ?? 0
  const bounceSeen = new Map<number, Vec3>()
  /** The color thrown onto a point facing `n` by what is within BOUNCE_REACH in front of it: five looks, a miss counting as none. */
  const thrown = (p: Vec3, n: Vec3, pi: number): Vec3 => {
    const B = s * 2.5
    const key = ((pi * 4096 + (Math.floor(p[0] / B) & 4095)) * 4096 + (Math.floor(p[1] / B) & 4095)) * 4096 + (Math.floor(p[2] / B) & 4095)
    const got = bounceSeen.get(key)
    if (got) return got
    const a = norm(Math.abs(n[1]) < 0.9 ? [n[2], 0, -n[0]] : [1, 0, 0]), b: Vec3 = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]]
    const sum: Vec3 = [0, 0, 0]
    for (const [u, v] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const dir = norm([n[0] + (a[0] * u + b[0] * v) * 1.2, n[1] + (a[1] * u + b[1] * v) * 1.2, n[2] + (a[2] * u + b[2] * v) * 1.2])
      const c = lookAlong([p[0] + n[0] * s, p[1] + n[1] * s, p[2] + n[2] * s], dir, pi, undefined, BOUNCE_REACH)
      if (c) for (let i = 0; i < 3; i++) sum[i] += c[i] / 5
    }
    bounceSeen.set(key, sum)
    return sum
  }
  const blobs = new Blobs(4096)
  const parts: number[] = []
  const e = s * 0.5
  spec.parts.forEach((part, pi) => {
    const { sdf, min, max } = part.shape
    // parts on the same bone never move apart, so a cell buried in a neighbor is never seen
    const same = spec.parts.filter((q, qi) => qi !== pi && boneOf[qi] === boneOf[pi] && !q.glow && (q.opacity ?? 1) >= 0.9).map((q) => q.shape)
    // only shapes within reach of this part can shut its surface in
    const reach = Math.max(SHUT_REACH[SHUT_REACH.length - 1], s * 1.5) + s
    const cover = part.bare || part.glow ? undefined : spec.cover
    const near = crevice > 0 || part.grime || cover?.kind === 'moss' ? casters.filter((c) => [0, 1, 2].every((i) => c.min[i] <= max[i] + reach && c.max[i] >= min[i] - reach)) : []
    const i0 = Math.floor(min[0] / s), i1 = Math.ceil(max[0] / s)
    const j0 = Math.floor(min[1] / s), j1 = Math.ceil(max[1] / s)
    const k0 = Math.floor(min[2] / s), k1 = Math.ceil(max[2] / s)
    // only a part at least eight cells thick each way can be painted broadly: a thinner one could miss every coarse cell
    const broad = spec.focus !== undefined && [0, 1, 2].every((i) => max[i] - min[i] >= s * 8)
    const cell = (x: number, y: number, z: number) => {
      const d = sdf(x, y, z)
      // the outermost layer of cells inside the shape
      // out of focus, only every other grid point, in a shell two cells deep
      const wide = broad && Math.hypot(x - spec.focus!.at[0], y - spec.focus!.at[1], z - spec.focus!.at[2]) > spec.focus!.r
      if (wide && ((Math.round(x / s) | Math.round(y / s) | Math.round(z / s)) & 1)) return
      if (d > 0 || d <= -s * (spec.trueShell ? 4 : 1) * (wide ? 2 : 1)) return
      if (same.some((q) => boxDistance(q, x, y, z) === 0 && q.sdf(x, y, z) < buried)) return
      const xa = sdf(x + e, y, z), xb = sdf(x - e, y, z), ya = sdf(x, y + e, z), yb = sdf(x, y - e, z), za = sdf(x, y, z + e), zb = sdf(x, y, z - e)
      const g: Vec3 = [xa - xb, ya - yb, za - zb]
      // the distance in world units, from how fast the shape's distance changes here
      if (spec.trueShell && (d * s) / (Math.hypot(g[0], g[1], g[2]) || s) <= -s) return
      const n = norm(g)
      const p: Vec3 = [x, y, z]
      let base = typeof part.color === 'function' ? part.color(p, n) : part.color
      if (part.ink && !part.glow && inkedAt(part.ink, Math.round(x / s), Math.round(y / s), Math.round(z / s), n, pi * 13 + 5)) base = part.ink.color ?? inkOf(base)
      let color = base
      if (!part.glow) {
        const facing = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2])
        const sun = facing > 0 ? 1 - light.shadow * (1 - sunlight(casters, [x + n[0] * s, y + n[1] * s, z + n[2] * s], L, s, far)) : 0
        let ambient = light.ambient
        let opened: number | undefined
        // looked at from the surface itself, not from the cell's middle, so a flat face is fully open
        const openHere = () => (opened ??= openness(near, [x - n[0] * d, y - n[1] * d, z - n[2] * d], n, s))
        if (cover) {
          const k = coverAt(cover, p, n, s, openHere, () => sunlight(casters, [x + n[0] * s, y + n[1] * s, z + n[2] * s], [0, 1, 0], s, far))
          const c = cover.color
          if (k > 0) base = [base[0] + (c[0] - base[0]) * k, base[1] + (c[1] - base[1]) * k, base[2] + (c[2] - base[2]) * k]
        }
        if (crevice > 0 || part.grime) {
          const open = openHere()
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
        if (bounce > 0) {
          const t = thrown(p, n, pi)
          color = [0, 1, 2].map((i) => Math.min(LIT_MAX, color[i] + base[i] * t[i] * bounce * 0.6)) as Vec3
        }
        if (beams.length) color = inBeams(beams, p, n, base, color)
        if (part.glass && spec.eye && (!part.glass.top || n[1] > 0.5)) {
          const v = norm([spec.eye[0] - x, spec.eye[1] - y, spec.eye[2] - z])
          const cos = Math.max(0, n[0] * v[0] + n[1] * v[1] + n[2] * v[2])
          const mirror = part.glass.mirror ?? 0.3, see = part.glass.see ?? 0.6
          const kr = Math.min(1, mirror * (0.35 + 0.65 * (1 - cos) ** 3)), ks = see * (1 - kr)
          // behind: from just inside the surface, on along the line from the eye; tinted by the glass's own color
          // neighbors two cells a side share their looks: a glass face is smooth, and the looks are what it costs
          const key = ((pi * 4096 + (Math.floor(x / (2 * s)) & 4095)) * 4096 + (Math.floor(y / (2 * s)) & 4095)) * 4096 + (Math.floor(z / (2 * s)) & 4095)
          let looks = glassSeen.get(key)
          if (!looks) {
            const r: Vec3 = [2 * cos * n[0] - v[0], 2 * cos * n[1] - v[1], 2 * cos * n[2] - v[2]]
            looks = [ks > 0 ? lookAlong([x - n[0] * s, y - n[1] * s, z - n[2] * s], [-v[0], -v[1], -v[2]], pi, inkOf(color))! : color, kr > 0 ? lookAlong([x + n[0] * s, y + n[1] * s, z + n[2] * s], norm(r), pi)! : color]
            glassSeen.set(key, looks)
          }
          const [back, over] = looks
          color = [0, 1, 2].map((i) => Math.min(LIT_MAX, color[i] * (1 - ks - kr) + (back[i] * 0.7 + color[i] * 0.3) * ks + over[i] * kr)) as Vec3
        }
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
        center: p, ...dab(n, part.strokes ?? 0, wide ? 2 : 1),
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
