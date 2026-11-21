import type { Blobs } from '../splat-core/blobs.ts'
import { srgbToLinear } from '../splat-core/color.ts'
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
  /** The side of this source's blocks, where it was cut on a grid of its own (a finer cut of the place underfoot); left out, the look's `cell`. */
  blockCell?: number
}

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
}

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

/**
 * The sources as blocks: a mesh for each bone that carries any (see `BlockLook`). A cell two bones' blobs share goes
 * to the bone with more of them, so no two cubes ever stand in one place; faces between two cubes on one bone are
 * left out. Shadows and corners are worked out within each source, never from one to another.
 */
export function buildBlocks(sources: readonly BlockSource[], look: BlockLook): { pieces: BlockPiece[]; blocks: number; faces: number } {
  const least = look.least ?? 0.3, from = look.from ?? BLOCK_FROM
  const shade = look.shade ?? BLOCK_SHADE, corners = (look.corners ?? 0.5) * CORNER_MOST, vary = (look.vary ?? 0.35) * VARY_MOST
  const sun = faceLight(from)

  // every cell, over all the sources: where it is, whose it is, its color and its own light
  const where: number[] = [], owner: number[] = [], bones: number[] = [], loose: number[] = [], paint: number[] = [], glows: number[] = []
  const groups: Map<number, number>[] = []
  for (let a = 0; a < sources.length; a++) {
    const { blobs, skin, skeleton, glow } = sources[a]
    // twice: the grid's own blocks, then the loose specks on their finer grid
    for (const specks of [false, true]) {
      const own = sources[a].blockCell ?? look.cell, cell = specks ? own * SPECK_SIZE : own
      const at = new Map<number, number>()
      const first = where.length / 3
      const cellOf = new Int32Array(blobs.count).fill(-1), boneAt = new Uint8Array(blobs.count)
      const counts: number[] = []
      for (let i = 0; i < blobs.count; i++) {
        if (blobs.opacity[i] < least) continue
        const bone = boneOf(skin, i)
        if ((skeleton.bones[bone]?.name.startsWith('~') ?? false) !== specks) continue
        const x = Math.round(blobs.center[i * 3] / cell), y = Math.round(blobs.center[i * 3 + 1] / cell), z = Math.round(blobs.center[i * 3 + 2] / cell)
        const key = specks ? speckKey(x, y, z, bone) : keyOf(x, y, z)
        let k = at.get(key)
        if (k === undefined) { k = where.length / 3 - first; at.set(key, k); where.push(x, y, z); counts.push(0) }
        cellOf[i] = k
        boneAt[i] = bone
        counts[k]++
      }
      const n = counts.length
      // each cell's blobs, side by side
      const start = new Int32Array(n + 1)
      for (let k = 0; k < n; k++) start[k + 1] = start[k] + counts[k]
      const fill = start.slice(0, n), list = new Int32Array(start[n])
      for (let i = 0; i < blobs.count; i++) if (cellOf[i] >= 0) list[fill[cellOf[i]]++] = i
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
          const q = bucketOf(i), c = (tally.get(q) ?? 0) + 1
          tally.set(q, c)
          if (c > most) { most = c; bucket = q }
        }
        let r = 0, g = 0, b = 0, own = 0
        for (let j = start[k]; j < start[k + 1]; j++) {
          const i = list[j]
          if (boneAt[i] !== bone || bucketOf(i) !== bucket) continue
          r += blobs.color[i * 3]; g += blobs.color[i * 3 + 1]; b += blobs.color[i * 3 + 2]
          own += glow ? glow[i] / 255 : 0
        }
        owner.push(a); bones.push(bone); loose.push(specks ? 1 : 0)
        paint.push(srgbToLinear(r / most), srgbToLinear(g / most), srgbToLinear(b / most))
        glows.push(own / most)
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
  const solids = sources.map((_, a) => solidGrid(cells, count, (k) => owner[k] === a && !loose[k] && glows[k] < GLOW_CLEAR) as ((x: number, y: number, z: number) => boolean) & { lo?: number[]; hi?: number[] })

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
    const indices = new Uint32Array(p.faces * 6)
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
    pieces.push({ actor: p.actor, bone: p.bone, blocks: p.cells.length, positions, normals, colors, light, uvs, indices })
  }
  return { pieces, blocks: count, faces }
}
