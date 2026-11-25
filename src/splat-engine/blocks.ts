import type { Blobs } from '../splat-core/blobs.ts'
import { srgbToLinear } from '../splat-core/color.ts'
import { paletteSnap } from '../splat-core/paints.ts'
import type { Skin } from './rig.ts'

/**
 * Blocks: a scene's blobs snapped onto a grid and drawn as cubes (`Stage.setBlocks`). Every grid cell that holds a
 * blob becomes one cube in the commonest color among its blobs, on the bone most of them ride, so a scene still
 * moves: its still parts stay on the grid and a moving part carries its cubes with it. The light is worked out here,
 * once, for the rest pose: each face is flat in one tone by which way it faces the light, a face something stands
 * in front of is in shade as a whole, and corners where blocks meet are a little darker. That wants blobs with no
 * light baked into them. This file is the arithmetic (pure, tested); blockView.ts draws it.
 */
export interface BlockLook {
  /** A block's side, in the blobs' units: the grid a scene was cut on, or a whole number of it for bigger blocks. */
  cell: number
  /** The way to the light (any length; default up, right and toward the front). */
  from?: readonly [number, number, number]
  /** How much light a face in shade keeps, 0 to 1 (default 0.45). */
  shade?: number
  /** Whether blocks cast shadows on the faces behind them (default true). */
  shadows?: boolean
  /** How much darker a face gets in a corner where blocks meet, 0 to 1 (default 0.5). */
  corners?: number
  /** How much one block's color differs from the next's, 0 to 1 (default 0.35). */
  vary?: number
  /** How dark the line round each face is, 0 to 1 (default 0.3); 0 for none. */
  edge?: number
  /** What the stage's ambient light is multiplied by, linear (a night's dim blue; default none). */
  ambient?: readonly [number, number, number]
  /** Blobs fainter than this are left out (mist, haze; default 0.3). */
  least?: number
  /**
   * How a surface that moves by itself is drawn (a source with `flows`: a pond): 'blocks', as columns of cubes whose
   * tops rise and fall with it in steps, or 'blobs', left as the blobs it is among the cubes (default 'blobs': Matt found
   * they have more definition, 2026-11-21).
   */
  flow?: 'blocks' | 'blobs'
  /** How weather laid over a scene (an actor with `weather`: clouds, rain, snow) is drawn: as cubes too, or left the blobs it is among the cubes (default 'blobs'). */
  weather?: 'blocks' | 'blobs'
  /** How many times higher than it stands a ripple is drawn as blocks (default `FLOW_SWELL`); 0 keeps the tops level, so only their color moves. */
  swell?: number
  /** Paints every block takes its color from (sRGB 0–255): a cell's commonest color is snapped to the nearest in OKLab before light falls on it (`paletteSnap`). Left out, blocks keep their own colors. Water columns and soft actors keep theirs. */
  palette?: readonly (readonly [number, number, number])[]
}

/** The default way to the light. */
export const BLOCK_FROM: readonly [number, number, number] = [0.45, 0.8, 0.5]
/** The default light a face in shade keeps. */
export const BLOCK_SHADE = 0.45
/** How much of its light a face loses with all of a corner shut in, at `corners` 1. */
export const CORNER_MOST = 0.6
/** How far a block's lightness is from its color's own at most, at `vary` 1. */
export const VARY_MOST = 0.09
/** A face in shade is this much darker again when it faces straight down, and as much lighter facing up. */
export const SKY_SHARE = 0.16
/**
 * Loose things in the air (rain, sparks, fireflies: bones whose names start with `~`) are cubes this share of a block
 * across, on a grid of their own, and take no part in shadows or corners.
 */
export const SPECK_SIZE = 0.4
/**
 * How many blobs one blob that glows or is laid over another (`laid`) counts for when a cell's color is picked: a
 * window is a small pane in a bigger dark frame, and by count the frame took every cell (Matt saw windows as solid
 * black blocks, 2026-11-21).
 */
export const FACE_VOTE = 4

/** A block that gives this much of its own light or more (the mean of its blobs' `glow`) casts no shadow. */
export const GLOW_CLEAR = 0.5

/** What blocks are made from: an actor's blobs, its skin, the names of its bones and the light its blobs give. */
export interface BlockSource {
  /** The blobs in the rest pose. */
  blobs: Blobs
  /** Which bones move each blob: a block rides the bone most of its blobs do. */
  skin: Skin
  /** The bones, for their names: one whose name starts with `~` carries loose specks. */
  skeleton: { bones: readonly { name: string }[] }
  /** How much of its own light each blob gives, a byte a blob (`Actor.glow`). */
  glow?: Uint8Array
  /** Blobs of a face laid over another part (voxel.ts `laid`: a pane on its frame), a byte a blob: drawn as blocks, a cell takes their color before the color of what they lie on. */
  laid?: Uint8Array
  /** How much of each of the first four lights each blob sees, four bytes a blob (`Actor.seen`): a light some blob sees less than all of is a lamp that stays put, and casts block shadows (`lampSight`). */
  seen?: Uint8Array
  /** A surface that moves by itself (a pond): its blobs are sent up again as they change, and its cubes are columns that follow them (`planFlow`). */
  flows?: boolean
  /** The side of this source's blocks, where it was cut on a grid of its own (a finer cut of the place underfoot); left out, the look's `cell`. */
  blockCell?: number
  /**
   * Cubes whose middles stand in this square (x and z, in the source's rest units) are not drawn: where a finer cut of
   * the same ground is laid in their place (a patch round the place looked at). The cubes are still made, and nothing
   * else changes, so moving the square only picks other faces to draw (`holed`).
   */
  hole?: BlockHole
  /**
   * Its blobs never change in place, so its cubes are kept with them and made once (`keptBlocks`): a stage that makes
   * its cubes again for a new actor beside it (a patch moved underfoot) takes these as they were, not over a second's
   * work again. A source whose colors are changed in place (weather shaded under the sky) must leave it out.
   */
  keepCubes?: boolean
}

/** A square of ground, x and z, in a source's rest units. */
export interface BlockHole { min: readonly [number, number]; max: readonly [number, number] }

/** The cubes on one bone of one actor, as a mesh: four corners a face, two triangles. */
export interface BlockPiece {
  /** Which of the sources it came from. */
  actor: number
  /** Which of that source's bones carries it. */
  bone: number
  /** How many cubes. */
  blocks: number
  /** Corner places in the rest pose, three numbers each. */
  positions: Float32Array
  /** Each corner's face normal. */
  normals: Float32Array
  /** Each corner's color, linear, the block's own with no light on it. */
  colors: Float32Array
  /** Three numbers a corner: the light its face has from the look's light (shade and shadow in), what is left of any light in its corner, and how much of its own light the block gives. */
  light: Float32Array
  /** Each corner's place on its face, 0 or 1 each way. */
  uvs: Float32Array
  /** Three corners a triangle. */
  indices: Uint32Array
  /** Each face's cell and which of the six faces it is, four whole numbers a face in the order of the corners; the face is -1 for a loose speck. */
  faceCells: Int32Array
  /** The side of its cubes. */
  side: number
}

/** What is solid in a source's rest pose, a cell at a time, and the box that holds it all. */
export type SolidCells = ((x: number, y: number, z: number) => boolean) & { lo?: number[]; hi?: number[] }

/** A cell's place as one number: three signed whole numbers of up to 17 bits (so it stays exact in a double). */
const SPAN = 1 << 17, HALF = SPAN / 2
const keyOf = (x: number, y: number, z: number) => ((x + HALF) * SPAN + (y + HALF)) * SPAN + (z + HALF)
/** A speck's cell and its bone as one number (15 bits a way and 8 for the bone, still exact): specks pass through each other, so a cell is its bone's own. */
const SMALL = 1 << 15
const speckKey = (x: number, y: number, z: number, bone: number) => ((((x + SMALL / 2) * SMALL + (y + SMALL / 2)) * SMALL + (z + SMALL / 2)) * 256) + bone

/** The six faces of a cube: the outward way, and the two ways along it, so that u × v points out. */
const FACES: { n: [number, number, number]; u: [number, number, number]; v: [number, number, number] }[] = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
]
/** A face's four corners, counterclockwise from outside: along u and v, each -1 or 1. */
const CORNERS: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]]

/** A number from 0 to 1 for a cell, the same each time. */
export function blockHash(x: number, y: number, z: number): number {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/**
 * How much of the look's light each of a cube's six faces has when nothing is in the way, 0 to 1, in the order
 * +x, -x, +y, -y, +z, -z: by how squarely it faces the light, with the face that faces it most at 1, so no two of
 * the three faces a view shows are alike unless the light lies evenly between them.
 */
export function faceLight(from: readonly [number, number, number] = BLOCK_FROM): number[] {
  const most = Math.max(Math.abs(from[0]), Math.abs(from[1]), Math.abs(from[2])) || 1
  return FACES.map((f) => Math.max(0, f.n[0] * from[0] + f.n[1] * from[1] + f.n[2] * from[2]) / most)
}

/** The light a face has: its shade (a little more of it facing the sky, less facing the ground) and its share of the light where that reaches it. */
export function faceTone(face: number, lit: number, shade: number, sun: readonly number[]): number {
  return shade * (1 + SKY_SHARE * FACES[face].n[1]) + (1 - shade) * sun[face] * lit
}

/** Which bone carries a blob: the one with the most weight. */
function boneOf(skin: Skin, i: number): number {
  let best = 0
  for (let k = 1; k < 4; k++) if (skin.weights[i * 4 + k] > skin.weights[i * 4 + best]) best = k
  return skin.joints[i * 4 + best]
}

/** What is solid, for shadows and corners: a bit a cell over the box that holds every block, or a set where that would be too big. */
function solidGrid(cells: Int32Array, count: number, keep: (k: number) => boolean): (x: number, y: number, z: number) => boolean {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let k = 0; k < count; k++) {
    if (!keep(k)) continue
    for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], cells[k * 3 + c]); hi[c] = Math.max(hi[c], cells[k * 3 + c]) }
  }
  if (!(lo[0] <= hi[0])) return () => false
  const nx = hi[0] - lo[0] + 1, ny = hi[1] - lo[1] + 1, nz = hi[2] - lo[2] + 1
  if (nx * ny * nz > 2 ** 28) {
    const set = new Set<number>()
    for (let k = 0; k < count; k++) if (keep(k)) set.add(keyOf(cells[k * 3], cells[k * 3 + 1], cells[k * 3 + 2]))
    const far = (x: number, y: number, z: number) => x < lo[0] || y < lo[1] || z < lo[2] || x > hi[0] || y > hi[1] || z > hi[2]
    const has = (x: number, y: number, z: number) => !far(x, y, z) && set.has(keyOf(x, y, z))
    return Object.assign(has, { lo, hi })
  }
  const bits = new Uint8Array(Math.ceil((nx * ny * nz) / 8))
  for (let k = 0; k < count; k++) {
    if (!keep(k)) continue
    const i = ((cells[k * 3] - lo[0]) * ny + (cells[k * 3 + 1] - lo[1])) * nz + (cells[k * 3 + 2] - lo[2])
    bits[i >> 3] |= 1 << (i & 7)
  }
  const has = (x: number, y: number, z: number) => {
    const a = x - lo[0], b = y - lo[1], c = z - lo[2]
    if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) return false
    const i = (a * ny + b) * nz + c
    return (bits[i >> 3] & (1 << (i & 7))) !== 0
  }
  return Object.assign(has, { lo, hi })
}

/**
 * Whether the look's light reaches the face `face` of the cell at x, y, z: a walk from the face's middle toward the
 * light, half a cell at a time, until a solid cell is met or the walk is out of the box that holds them all.
 */
export function faceLit(solid: (x: number, y: number, z: number) => boolean, x: number, y: number, z: number, face: number, from: readonly [number, number, number], lo: readonly number[], hi: readonly number[]): boolean {
  const n = FACES[face].n
  const len = Math.hypot(from[0], from[1], from[2]) || 1
  const d = [from[0] / len / 2, from[1] / len / 2, from[2] / len / 2]
  // from just outside the face, so the block itself is never in its own way
  let px = x + n[0] * 0.56, py = y + n[1] * 0.56, pz = z + n[2] * 0.56
  for (let step = 0; step < 4096; step++) {
    const cx = Math.round(px), cy = Math.round(py), cz = Math.round(pz)
    if ((d[0] > 0 ? cx > hi[0] : cx < lo[0]) || (d[1] > 0 ? cy > hi[1] : cy < lo[1]) || (d[2] > 0 ? cz > hi[2] : cz < lo[2])) return true
    if (solid(cx, cy, cz)) return false
    px += d[0]; py += d[1]; pz += d[2]
  }
  return true
}

/** How far a blob's disc fills, in its own scale: as far as voxel.ts's solid reach. */
const DISC_REACH = 1.18
/** How far past a cell a blob's disc must reach to fill the cells round its own (a fine disc reaches at most 0.9). */
const SPREAD_FROM = 1.25
/** The most cells a wide blob fills each way from its middle. */
const SPREAD_MOST = 3
/**
 * A loose thing this many blocks across or more, two ways, is a body with a surface (a moon, a sun), not a speck: its
 * blobs stand a block apart and each made one small cube, so it was drawn as a grid of dots with the sky showing
 * between them (Matt saw the campfire's moon as a scratchy disc, 2026-11-24). Each of its blobs fills the small cells
 * its disc covers.
 */
const BODY_FROM = 1.5

/** A blob's two widest axes (its first and second), from its facing. */
function discAxes(q: Float32Array, i: number): [[number, number, number], [number, number, number]] {
  const x = q[i * 4], y = q[i * 4 + 1], z = q[i * 4 + 2], w = q[i * 4 + 3]
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)],
    [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)],
  ]
}

/**
 * The sources as blocks: a mesh for each bone that carries any (see `BlockLook`). A cell two bones' blobs share goes
 * to the bone with more of them, so no two cubes ever stand in one place; faces between two cubes on one bone are
 * left out. Shadows and corners are worked out within each source, never from one to another.
 */
export function buildBlocks(sources: readonly BlockSource[], look: BlockLook): { pieces: BlockPiece[]; blocks: number; faces: number; solids: SolidCells[] } {
  const least = look.least ?? 0.3, from = look.from ?? BLOCK_FROM
  const shade = look.shade ?? BLOCK_SHADE, corners = (look.corners ?? 0.5) * CORNER_MOST, vary = (look.vary ?? 0.35) * VARY_MOST
  const sun = faceLight(from)
  const snap = paletteSnap(look.palette as [number, number, number][] | undefined)

  // every cell, over all the sources: where it is, whose it is, its color and its own light
  const where: number[] = [], owner: number[] = [], bones: number[] = [], loose: number[] = [], paint: number[] = [], glows: number[] = []
  const groups: Map<number, number>[] = []
  for (let a = 0; a < sources.length; a++) {
    const { blobs, skin, skeleton, glow, laid } = sources[a]
    // a lamp, a lit window or a pane laid on its frame is what the eye reads there, however small beside its housing
    const vote = (i: number) => (glow?.[i] || laid?.[i] ? FACE_VOTE : 1)
    // a surface that moves is columns of its own (`planFlow`), or stays blobs
    if (sources[a].flows) { groups.push(new Map(), new Map()); continue }
    // twice: the grid's own blocks, then the loose specks on their finer grid
    for (const specks of [false, true]) {
      const own = sources[a].blockCell ?? look.cell, cell = specks ? own * SPECK_SIZE : own
      const at = new Map<number, number>()
      const first = where.length / 3
      // a blob in each cell it fills: the cell of its middle, and where its disc reaches a cell or more across (a part
      // cut broadly out of focus, `VoxelSpec.focus`, has every other grid point with discs twice the size) the cells it
      // covers along its own plane too, or blocks a cell of the fine grid show the gaps between them
      const entBlob: number[] = [], entCell: number[] = [], boneAt = new Uint8Array(blobs.count)
      const counts: number[] = []
      const put = (i: number, bone: number, px: number, py: number, pz: number) => {
        const x = Math.round(px / cell), y = Math.round(py / cell), z = Math.round(pz / cell)
        const key = specks ? speckKey(x, y, z, bone) : keyOf(x, y, z)
        let k = at.get(key)
        if (k === undefined) { k = where.length / 3 - first; at.set(key, k); where.push(x, y, z); counts.push(0) }
        // once a cell for each blob
        for (let e = entBlob.length - 1; e >= 0 && entBlob[e] === i; e--) if (entCell[e] === k) return
        entBlob.push(i); entCell.push(k)
        counts[k]++
      }
      // the loose bones that carry a body: their blobs' box is over `BODY_FROM` blocks across in two ways or more
      const body = new Set<number>()
      if (specks) {
        const box = new Map<number, number[]>()
        for (let i = 0; i < blobs.count; i++) {
          if (blobs.opacity[i] < least) continue
          const bone = boneOf(skin, i)
          if (!skeleton.bones[bone]?.name.startsWith('~')) continue
          let b = box.get(bone)
          if (!b) box.set(bone, b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity])
          for (let c = 0; c < 3; c++) { const v = blobs.center[i * 3 + c]; if (v < b[c]) b[c] = v; if (v > b[c + 3]) b[c + 3] = v }
        }
        for (const [bone, b] of box) if ([b[3] - b[0], b[4] - b[1], b[5] - b[2]].sort((p, q) => q - p)[1] >= own * BODY_FROM) body.add(bone)
      }
      for (let i = 0; i < blobs.count; i++) {
        if (blobs.opacity[i] < least) continue
        const bone = boneOf(skin, i)
        if ((skeleton.bones[bone]?.name.startsWith('~') ?? false) !== specks) continue
        boneAt[i] = bone
        const cx = blobs.center[i * 3], cy = blobs.center[i * 3 + 1], cz = blobs.center[i * 3 + 2]
        put(i, bone, cx, cy, cz)
        const ra = blobs.scale[i * 3] * DISC_REACH, rb = blobs.scale[i * 3 + 1] * DISC_REACH
        const whole = specks && body.has(bone)
        if (specks ? !whole : Math.max(ra, rb) < cell * SPREAD_FROM) continue
        // in half cells, so a disc turned across the grid misses no cell of its square; a body's disc fills every
        // small cell it touches, since its blobs stand further apart than those cells are wide
        const reach = (r: number) => 2 * Math.min(SPREAD_MOST, whole ? Math.ceil(r / cell) : Math.floor(r / cell))
        const [u, v] = discAxes(blobs.quat, i), na = reach(ra), nb = reach(rb)
        for (let a = -na; a <= na; a++) for (let b = -nb; b <= nb; b++) {
          // the square it stands for, so four of them on every other grid point leave no hole between them
          if (a || b) {
            const da = a * cell * 0.5, db = b * cell * 0.5
            put(i, bone, cx + u[0] * da + v[0] * db, cy + u[1] * da + v[1] * db, cz + u[2] * da + v[2] * db)
          }
        }
      }
      const n = counts.length
      // each cell's blobs, side by side
      const start = new Int32Array(n + 1)
      for (let k = 0; k < n; k++) start[k + 1] = start[k] + counts[k]
      const fill = start.slice(0, n), list = new Int32Array(start[n])
      for (let e = 0; e < entBlob.length; e++) list[fill[entCell[e]]++] = entBlob[e]
      const tally = new Map<number, number>()
      for (let k = 0; k < n; k++) {
        // the bone most of its blobs ride
        tally.clear()
        let bone = 0, most = 0
        for (let j = start[k]; j < start[k + 1]; j++) {
          const b = boneAt[list[j]], c = (tally.get(b) ?? 0) + 1
          tally.set(b, c)
          if (c > most) { most = c; bone = b }
        }
        // the commonest color among that bone's blobs (to 32 steps a channel), then the mean of the blobs that have it
        tally.clear()
        let bucket = -1
        most = 0
        const bucketOf = (i: number) => (Math.min(31, Math.floor(blobs.color[i * 3] * 32)) << 10) | (Math.min(31, Math.floor(blobs.color[i * 3 + 1] * 32)) << 5) | Math.min(31, Math.floor(blobs.color[i * 3 + 2] * 32))
        for (let j = start[k]; j < start[k + 1]; j++) {
          const i = list[j]
          if (boneAt[i] !== bone) continue
          const q = bucketOf(i), c = (tally.get(q) ?? 0) + vote(i)
          tally.set(q, c)
          if (c > most) { most = c; bucket = q }
        }
        let r = 0, g = 0, b = 0, own = 0, had = 0
        for (let j = start[k]; j < start[k + 1]; j++) {
          const i = list[j]
          if (boneAt[i] !== bone || bucketOf(i) !== bucket) continue
          r += blobs.color[i * 3]; g += blobs.color[i * 3 + 1]; b += blobs.color[i * 3 + 2]
          own += glow ? glow[i] / 255 : 0
          had++
        }
        owner.push(a); bones.push(bone); loose.push(specks ? 1 : 0)
        const [pr, pg, pb] = snap ? snap(r / had, g / had, b / had) : [r / had, g / had, b / had]
        paint.push(srgbToLinear(pr), srgbToLinear(pg), srgbToLinear(pb))
        glows.push(own / had)
      }
      // which cells are one bone's, for leaving out the faces between them
      const group = new Map<number, number>()
      for (let k = 0; k < n; k++) {
        const x = where[(first + k) * 3], y = where[(first + k) * 3 + 1], z = where[(first + k) * 3 + 2]
        group.set(specks ? speckKey(x, y, z, bones[first + k]) : keyOf(x, y, z), bones[first + k])
      }
      groups.push(group)
    }
  }
  const count = owner.length
  const cells = Int32Array.from(where)
  // what is solid, a source at a time: each source has its own rest pose and may be stood anywhere, so one never shades another
  const solids = sources.map((_, a) => solidGrid(cells, count, (k) => owner[k] === a && !loose[k] && glows[k] < GLOW_CLEAR) as SolidCells)

  // which faces show, cell by cell, and how many each piece gets
  const open = new Uint8Array(count)
  const pieceOf = new Map<number, { actor: number; bone: number; cells: number[]; faces: number }>()
  let faces = 0
  for (let k = 0; k < count; k++) {
    const group = groups[owner[k] * 2 + loose[k]], x = cells[k * 3], y = cells[k * 3 + 1], z = cells[k * 3 + 2]
    for (let f = 0; f < 6; f++) {
      const n = FACES[f].n
      if (group.get(loose[k] ? speckKey(x + n[0], y + n[1], z + n[2], bones[k]) : keyOf(x + n[0], y + n[1], z + n[2])) !== bones[k]) open[k] |= 1 << f
    }
    if (!open[k]) continue
    const id = owner[k] * 256 + bones[k]
    let p = pieceOf.get(id)
    if (!p) pieceOf.set(id, p = { actor: owner[k], bone: bones[k], cells: [], faces: 0 })
    p.cells.push(k)
    for (let f = 0; f < 6; f++) if (open[k] & (1 << f)) { p.faces++; faces++ }
  }

  const pieces: BlockPiece[] = []
  for (const p of pieceOf.values()) {
    const nv = p.faces * 4
    const positions = new Float32Array(nv * 3), normals = new Float32Array(nv * 3), colors = new Float32Array(nv * 3), light = new Float32Array(nv * 3), uvs = new Float32Array(nv * 2)
    const indices = new Uint32Array(p.faces * 6), faceCells = new Int32Array(p.faces * 4)
    let v = 0, t = 0
    const solid = solids[p.actor], lo = solid.lo ?? [0, 0, 0], hi = solid.hi ?? [0, 0, 0]
    for (const k of p.cells) {
      const x = cells[k * 3], y = cells[k * 3 + 1], z = cells[k * 3 + 2], speck = !!loose[k]
      const own = sources[p.actor].blockCell ?? look.cell, side = speck ? own * SPECK_SIZE : own
      const tint = 1 + (blockHash(x, y, z) * 2 - 1) * vary
      for (let f = 0; f < 6; f++) {
        if (!(open[k] & (1 << f))) continue
        const { n, u, v: w } = FACES[f]
        const lit = speck || look.shadows === false || sun[f] <= 0 ? 1 : faceLit(solid, x, y, z, f, from, lo, hi) ? 1 : 0
        const tone = faceTone(f, lit, shade, sun)
        faceCells.set([x, y, z, speck ? -1 : f], v)
        const shut = [0, 0, 0, 0]
        for (let c = 0; c < 4; c++) {
          const [a, b] = CORNERS[c]
          if (!speck) {
            const ax = x + n[0], ay = y + n[1], az = z + n[2]
            const s1 = solid(ax + u[0] * a, ay + u[1] * a, az + u[2] * a), s2 = solid(ax + w[0] * b, ay + w[1] * b, az + w[2] * b)
            shut[c] = s1 && s2 ? 3 : +s1 + +s2 + +solid(ax + u[0] * a + w[0] * b, ay + u[1] * a + w[1] * b, az + u[2] * a + w[2] * b)
          }
          for (let j = 0; j < 3; j++) {
            positions[(v + c) * 3 + j] = ([x, y, z][j] + (n[j] + u[j] * a + w[j] * b) / 2) * side
            normals[(v + c) * 3 + j] = n[j]
            colors[(v + c) * 3 + j] = paint[k * 3 + j] * tint
          }
          light[(v + c) * 3] = tone
          light[(v + c) * 3 + 1] = 1 - (shut[c] / 3) * corners
          light[(v + c) * 3 + 2] = glows[k]
          uvs[(v + c) * 2] = (a + 1) / 2
          uvs[(v + c) * 2 + 1] = (b + 1) / 2
        }
        // the diagonal runs between the two corners that are alike, so a dark corner is not smeared over the face
        if (shut[0] + shut[2] > shut[1] + shut[3]) indices.set([v + 1, v + 2, v + 3, v + 1, v + 3, v], t)
        else indices.set([v, v + 1, v + 2, v, v + 2, v + 3], t)
        v += 4
        t += 6
      }
    }
    pieces.push({ actor: p.actor, bone: p.bone, blocks: p.cells.length, positions, normals, colors, light, uvs, indices, faceCells, side: sources[p.actor].blockCell ?? look.cell })
  }
  return { pieces, blocks: count, faces, solids }
}

/** A piece's triangles, leaving out every face of a cube whose middle stands in `hole`: all of them when there is none. */
export function holed(piece: BlockPiece, hole?: BlockHole): Uint32Array {
  if (!hole) return piece.indices
  const faces = piece.indices.length / 6, keep = new Uint32Array(piece.indices.length)
  let t = 0
  for (let f = 0; f < faces; f++) {
    const x = piece.faceCells[f * 4] * piece.side, z = piece.faceCells[f * 4 + 2] * piece.side
    if (x >= hole.min[0] && x <= hole.max[0] && z >= hole.min[1] && z <= hole.max[1]) continue
    keep.set(piece.indices.subarray(f * 6, f * 6 + 6), t)
    t += 6
  }
  return keep.slice(0, t)
}

type Built = ReturnType<typeof buildBlocks>
const kept = new WeakMap<Blobs, { source: BlockSource; key: string; built: Built }[]>()

/**
 * One source's cubes (`buildBlocks` of it alone, which gives the same cubes as among others, since no source shades or
 * joins another), kept with its blobs when it says they never change (`keepCubes`) and asked for again with the same
 * look (its ambient aside), the same grid and the same skin, glow and lamps.
 */
export function keptBlocks(source: BlockSource, look: BlockLook): Built {
  if (!source.keepCubes) return buildBlocks([source], look)
  const key = JSON.stringify({ ...look, ambient: undefined, cell: source.blockCell ?? look.cell })
  const list = kept.get(source.blobs) ?? []
  const same = (s: BlockSource) => s.skin === source.skin && s.glow === source.glow && s.laid === source.laid && s.seen === source.seen && s.skeleton.bones === source.skeleton.bones
  const hit = list.find((e) => e.key === key && same(e.source))
  if (hit) return hit.built
  const built = buildBlocks([source], look)
  // a few looks a set of blobs (block sizes, lights), the newest first
  kept.set(source.blobs, [{ source, key, built }, ...list].slice(0, 3))
  return built
}

/** Which of the first four lights are lamps that stay put, by a source's `seen`: those some blob of it sees less than all of. */
export function lampsOf(seen: Uint8Array | undefined): boolean[] {
  const casts = [false, false, false, false]
  if (seen) for (let i = 0; i < seen.length; i++) if (seen[i] < 255) casts[i & 3] = true
  return casts
}

/**
 * Whether a lamp at `at` (in cells) lights the face `face` of the cell at x, y, z: not when the face is turned away
 * from it, and not when a walk from just outside the face toward the lamp, half a cell at a time, meets a solid cell
 * before it is within a cell of the lamp. The lamp's own cell never counts, since a lamp sits inside its housing.
 */
export function faceSeesLamp(solid: SolidCells, x: number, y: number, z: number, face: number, at: readonly [number, number, number]): boolean {
  const n = FACES[face].n
  let px = x + n[0] * 0.56, py = y + n[1] * 0.56, pz = z + n[2] * 0.56
  let dx = at[0] - px, dy = at[1] - py, dz = at[2] - pz
  if (dx * n[0] + dy * n[1] + dz * n[2] <= 0) return false
  const dist = Math.hypot(dx, dy, dz), steps = Math.floor((dist - 1) * 2)
  dx /= dist * 2; dy /= dist * 2; dz /= dist * 2
  const lx = Math.round(at[0]), ly = Math.round(at[1]), lz = Math.round(at[2])
  for (let step = 0; step < steps; step++) {
    px += dx; py += dy; pz += dz
    const cx = Math.round(px), cy = Math.round(py), cz = Math.round(pz)
    if (cx === x && cy === y && cz === z) continue
    if (cx === lx && cy === ly && cz === lz) return true
    if (solid(cx, cy, cz)) return false
  }
  return true
}

/**
 * How much of a lamp each of a piece's faces sees, 1 or 0 a face (`faceSeesLamp`), for a lamp at `at` in the rest
 * pose's own units with a reach of `range`: faces further than twice its reach are left lit, since its light is gone
 * there anyway, and so are loose specks.
 */
export function lampSight(piece: BlockPiece, solid: SolidCells, at: readonly [number, number, number], range: number): Float32Array {
  const n = piece.faceCells.length / 4, out = new Float32Array(n).fill(1)
  const c: [number, number, number] = [at[0] / piece.side, at[1] / piece.side, at[2] / piece.side], far = (range * 2) / piece.side
  for (let i = 0; i < n; i++) {
    const x = piece.faceCells[i * 4], y = piece.faceCells[i * 4 + 1], z = piece.faceCells[i * 4 + 2], f = piece.faceCells[i * 4 + 3]
    if (f < 0 || Math.hypot(x - c[0], y - c[1], z - c[2]) > far + 1) continue
    out[i] = faceSeesLamp(solid, x, y, z, f, c) ? 1 : 0
  }
  return out
}

/** A ripple's height as blocks is snapped to this many steps a block. */
export const FLOW_STEPS = 4
/** How many times higher than it stands a ripple is drawn as blocks, when the look does not say. */
export const FLOW_SWELL = 6
/** How far under its layer's top a surface rests, as a share of a block: the banks beside it stand a little proud, and no two faces lie in one plane. */
export const FLOW_DROP = 1 / 8
/** A column's top is never further than this many blocks from where it rests. */
export const FLOW_MOST = 1

/** A blob of a moving surface lies over a cell's middle when it is within this many of its own sizes of it. */
export const FLOW_REACH = 1.5

/** A moving surface as columns on the blocks' grid: which columns there are and which of its blobs each one reads. */
export interface FlowPlan {
  /** A column's side. */
  cell: number
  /** How many columns. */
  count: number
  /** Each column's place on the grid: along x then along z, a pair a column. */
  cells: Int32Array
  /** The height the blobs lay at, on the whole, when the plan was made: a ripple is measured from it. */
  level: number
  /** Where a column's top is with the surface at rest. */
  rest: number
  /** The columns beside each one, toward +x, -x, +z and -z: four a column, -1 where there is none. */
  beside: Int32Array
  /** Where each column's blobs start in `list`, and one more for the end. */
  start: Int32Array
  /** The blobs each column reads, a column after another. */
  list: Int32Array
}

const flatKey = (x: number, z: number) => (x + HALF) * SPAN + (z + HALF)

/**
 * Plans a moving surface's columns: one for every cell of the grid, seen from above, that holds one of its blobs
 * or whose middle one of them reaches over, so a grid finer than the blobs are spread still has no holes. A column
 * reads every blob in it or over its middle.
 */
export function planFlow(blobs: Blobs, cell: number): FlowPlan {
  const at = new Map<number, number>(), cells: number[] = [], lists: number[][] = []
  const col = (x: number, z: number) => {
    const key = flatKey(x, z)
    let k = at.get(key)
    if (k === undefined) { k = lists.length; at.set(key, k); cells.push(x, z); lists.push([]) }
    return k
  }
  let level = 0
  for (let i = 0; i < blobs.count; i++) {
    const x = blobs.center[i * 3], z = blobs.center[i * 3 + 2]
    level += blobs.center[i * 3 + 1] / blobs.count
    const ix = Math.round(x / cell), iz = Math.round(z / cell)
    lists[col(ix, iz)].push(i)
    // and the cells beside it whose middles it lies over
    const r = Math.max(blobs.scale[i * 3], blobs.scale[i * 3 + 1], blobs.scale[i * 3 + 2]) * FLOW_REACH
    const reach = Math.ceil(r / cell)
    for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) {
      if (!dx && !dz) continue
      const cx = (ix + dx) * cell - x, cz = (iz + dz) * cell - z
      if (cx * cx + cz * cz <= r * r) lists[col(ix + dx, iz + dz)].push(i)
    }
  }
  const count = lists.length
  const start = new Int32Array(count + 1)
  for (let k = 0; k < count; k++) start[k + 1] = start[k] + lists[k].length
  const list = new Int32Array(start[count])
  for (let k = 0; k < count; k++) list.set(lists[k], start[k])
  const beside = new Int32Array(count * 4)
  for (let k = 0; k < count; k++) {
    const x = cells[k * 2], z = cells[k * 2 + 1]
    beside[k * 4] = at.get(flatKey(x + 1, z)) ?? -1
    beside[k * 4 + 1] = at.get(flatKey(x - 1, z)) ?? -1
    beside[k * 4 + 2] = at.get(flatKey(x, z + 1)) ?? -1
    beside[k * 4 + 3] = at.get(flatKey(x, z - 1)) ?? -1
  }
  return { cell, count, cells: Int32Array.from(cells), level, rest: (Math.round(level / cell) + 0.5 - FLOW_DROP) * cell, beside, start, list }
}

/**
 * How far from rest a column's top stands for a surface `lift` over its level there: `swell` times as high, in
 * whole steps of a block's `FLOW_STEPS`th, and never more than `FLOW_MOST` blocks.
 */
export function flowStep(lift: number, cell: number, swell = FLOW_SWELL): number {
  const step = cell / FLOW_STEPS, most = FLOW_MOST * FLOW_STEPS
  return Math.max(-most, Math.min(most, Math.round((lift * swell) / step))) * step
}

/** A moving surface's columns as a mesh: a top and four sides each, twenty corners a column in that order (top, +x, -x, +z, -z), which `shapeFlow` moves and colors. */
export interface FlowMesh {
  /** Corner places, three numbers each: `shapeFlow` writes the heights. */
  positions: Float32Array
  /** Each corner's face normal. */
  normals: Float32Array
  /** Each corner's color, linear, and how solid it is: four numbers, written by `shapeFlow`. */
  colors: Float32Array
  /** As a block's (`BlockPiece.light`): the face's light, 1 for no corner, 0 for no light of its own. */
  light: Float32Array
  /** Each corner's place on its face. */
  uvs: Float32Array
  /** Three corners a triangle. */
  indices: Uint32Array
  /** Each column's top as `shapeFlow` last left it. */
  tops: Float32Array
}

/** The faces of a column, in the mesh's order: its top, then the sides in `FlowPlan.beside`'s order. */
const FLOW_FACES = [2, 0, 1, 4, 5]

/** The mesh for a plan's columns, level at rest and with no color yet: `shapeFlow` it before drawing. */
export function flowMesh(plan: FlowPlan, look: BlockLook): FlowMesh {
  const n = plan.count, cell = plan.cell
  const sun = faceLight(look.from ?? BLOCK_FROM), shade = look.shade ?? BLOCK_SHADE
  const positions = new Float32Array(n * 60), normals = new Float32Array(n * 60), colors = new Float32Array(n * 80), light = new Float32Array(n * 60), uvs = new Float32Array(n * 40)
  const indices = new Uint32Array(n * 30)
  for (let k = 0; k < n; k++) {
    const x = plan.cells[k * 2], z = plan.cells[k * 2 + 1]
    for (let q = 0; q < 5; q++) {
      const f = FLOW_FACES[q], { n: fn, u, v: w } = FACES[f]
      const tone = faceTone(f, 1, shade, sun)
      for (let c = 0; c < 4; c++) {
        const [a, b] = CORNERS[c], v = k * 20 + q * 4 + c
        positions[v * 3] = (x + (fn[0] + u[0] * a + w[0] * b) / 2) * cell
        positions[v * 3 + 1] = plan.rest
        positions[v * 3 + 2] = (z + (fn[2] + u[2] * a + w[2] * b) / 2) * cell
        for (let j = 0; j < 3; j++) normals[v * 3 + j] = fn[j]
        light[v * 3] = tone
        light[v * 3 + 1] = 1
        uvs[v * 2] = (a + 1) / 2
        uvs[v * 2 + 1] = (b + 1) / 2
      }
      const v = k * 20 + q * 4
      indices.set([v, v + 1, v + 2, v, v + 2, v + 3], (k * 5 + q) * 6)
    }
  }
  return { positions, normals, colors, light, uvs, indices, tops: new Float32Array(n).fill(plan.rest) }
}

/**
 * Lays a mesh's columns to the surface as its blobs stand now: each top at its blobs' mean height over the level,
 * in steps (`flowStep`); each side from its own top down to the top of the column beside it, so only the risers
 * between columns are drawn (where it is the lower of the two it has no height; where there is no column beside it,
 * it goes a block down, into the bank); and each column in the mean of its blobs' colors, as solid as they make it
 * two deep.
 */
export function shapeFlow(plan: FlowPlan, mesh: FlowMesh, blobs: Blobs, look: BlockLook) {
  const { count, cell, start, list, cells, beside } = plan, { positions, colors, tops } = mesh
  const vary = (look.vary ?? 0.35) * VARY_MOST, swell = look.swell ?? FLOW_SWELL
  for (let k = 0; k < count; k++) {
    let y = 0, r = 0, g = 0, b = 0, o = 0
    const m = start[k + 1] - start[k]
    for (let j = start[k]; j < start[k + 1]; j++) {
      const i = list[j]
      y += blobs.center[i * 3 + 1]
      r += srgbToLinear(blobs.color[i * 3]); g += srgbToLinear(blobs.color[i * 3 + 1]); b += srgbToLinear(blobs.color[i * 3 + 2])
      o += blobs.opacity[i]
    }
    tops[k] = plan.rest + flowStep(y / m - plan.level, cell, swell)
    const tint = (1 + (blockHash(cells[k * 2], 0, cells[k * 2 + 1]) * 2 - 1) * vary) / m
    const solid = 1 - (1 - Math.min(1, o / m)) ** 2
    for (let v = k * 20; v < k * 20 + 20; v++) {
      colors[v * 4] = r * tint; colors[v * 4 + 1] = g * tint; colors[v * 4 + 2] = b * tint; colors[v * 4 + 3] = solid
    }
  }
  for (let k = 0; k < count; k++) {
    const top = tops[k]
    for (let c = 0; c < 4; c++) positions[(k * 20 + c) * 3 + 1] = top
    for (let q = 1; q < 5; q++) {
      const nb = beside[k * 4 + q - 1], low = nb < 0 ? plan.rest - cell : Math.min(top, tops[nb])
      const { u, v: w } = FACES[FLOW_FACES[q]]
      for (let c = 0; c < 4; c++) {
        const [a, b2] = CORNERS[c]
        positions[(k * 20 + q * 4 + c) * 3 + 1] = u[1] * a + w[1] * b2 > 0 ? top : low
      }
    }
  }
}
