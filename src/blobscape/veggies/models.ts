/**
 * Veggie Slayer's things as block models (pure, tested): every vegetable, the golden sprout and the treats, sculpted
 * cell by cell on a grid, with grumpy faces painted on the veggies' fronts; the cubes they burst into; and the blocky
 * words that pop up. Each is a blob a cell, so the Blocks style draws exactly these cubes. Every model, cube and word
 * is a bone of its own, parked far below the view at rest, and the page moves them into play (view.ts).
 */
import { Blobs } from '../../splat-core/blobs.ts'
import { LETTERS } from '../../splat-engine/voxel.ts'
import { Skeleton, emptySkin } from '../../splat-engine/rig.ts'
import { KINDS, type KindId } from './game.ts'

/** A model's cell, in the play plane's units: a veggie is about a dozen to twenty cells across. */
export const CELL = 0.07
/** The cubes a veggie bursts into are this big, and the words' letters are made of cubes this big. */
export const DEBRIS_CELL = 0.11, WORD_CELL = 0.085

type Cell = { x: number; y: number; z: number; c: string; part: number }

/** A model being cut: solid cells keyed by place. */
class Sculpt {
  readonly cells = new Map<string, Cell>()
  /** Fills every cell from `lo` to `hi` where `f` gives a color. */
  fill(r: number, f: (x: number, y: number, z: number) => string | undefined | null | false, part = 0, lo = [-r, -r, -r], hi = [r, r, r]) {
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      const c = f(x, y, z)
      if (c) this.cells.set(`${x},${y},${z}`, { x, y, z, c, part })
    }
    return this
  }
  has(x: number, y: number, z: number) { return this.cells.has(`${x},${y},${z}`) }
  /** Keeps only the cells within `thick` of the outside; those deeper than one are painted `inner` (a pumpkin's flesh). */
  shell(thick = 1, inner?: string) {
    const keep = new Map<string, Cell>()
    for (const [k, c] of this.cells) {
      let depth = Infinity
      for (let d = 1; d <= thick && depth === Infinity; d++) {
        for (const [dx, dy, dz] of SIX) if (!this.has(c.x + dx * d, c.y + dy * d, c.z + dz * d)) { depth = d; break }
      }
      if (depth === Infinity) continue
      keep.set(k, depth > 1 && inner ? { ...c, c: inner } : c)
    }
    this.cells.clear()
    for (const [k, c] of keep) this.cells.set(k, c)
    return this
  }
  /** Paints a face on the front (+z) at (cx, cy): each mark on the frontmost cell of its column, `size` cells a mark. */
  face(rows: readonly string[], cx: number, cy: number, size = 1) {
    const w = rows[0].length
    for (let r = 0; r < rows.length; r++) for (let i = 0; i < w; i++) {
      const color = FACE_INK[rows[r][i]]
      if (!color) continue
      for (let a = 0; a < size; a++) for (let b = 0; b < size; b++) {
        const x = cx + (i - (w - 1) / 2) * size + a - (size - 1) / 2, y = cy - (r - (rows.length - 1) / 2) * size - b + (size - 1) / 2
        const X = Math.round(x), Y = Math.round(y)
        let front: Cell | undefined
        for (const c of this.cells.values()) if (c.x === X && c.y === Y && (!front || c.z > front.z)) front = c
        if (front) front.c = color
      }
    }
    return this
  }
  list() { return [...this.cells.values()] }
}

const SIX = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const

/** A face's marks: brows, eye whites, pupils, mouth. */
const FACE_INK: Record<string, string> = { b: '#2b1a12', w: '#ffffff', k: '#1b1420', m: '#5a1622' }
/** Grumpy faces: brows down toward the middle, pupils squinting in, a frown. */
const GRUMPY = ['b.....b', '.bb.bb.', '.wk.kw.', '.ww.ww.', '.......', '..mmm..', '.m...m.']
const GRUMPY_SMALL = ['b...b', '.b.b.', 'k...k', '.....', '.mmm.', 'm...m']
/** The treats look pleased with themselves. */
const SMUG = ['.k.k.', '.....', 'm...m', '.mmm.']

/** A little hash of a cell, 0 to 1, for speckles that stay put. */
function hash(x: number, y: number, z: number, s = 0) {
  let h = Math.imul(x * 374761393 + y * 668265263 + z * 2147483647 + s * 1274126177, 1) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const ell = (x: number, y: number, z: number, rx: number, ry: number, rz: number) => (x * x) / (rx * rx) + (y * y) / (ry * ry) + (z * z) / (rz * rz) <= 1
const ang = (x: number, z: number) => Math.atan2(z, x)

/** A model: its cells (each a cube), which piece each belongs to, and the colors its burst throws. */
export interface Model {
  cells: Cell[]
  /** How many pieces it has: a pumpkin's sides crack off one hit at a time; everything else is one piece. */
  pieces: number
  /** The colors of the cubes it bursts into, with how many of each. */
  debris: [color: string, count: number][]
  /** How much of its own light it gives, 0 to 255 (the golden sprout shines). */
  glow?: number
}

/** The bell peppers' colors. */
export const PEPPERS = ['#e8322b', '#ffc72c', '#4caf3a'] as const

/** Every kind's model (and each pepper's), cut once. */
export function modelOf(kind: KindId, variant = 0): Model {
  switch (kind) {
    case 'carrot': {
      const s = new Sculpt().fill(13, (x, y, z) => {
        if (y >= -9 && y <= 7) {
          const r = 1 + (3.4 * (y + 9)) / 16
          if (x * x + z * z <= r * r) return (y + 9) % 4 === 0 ? '#dd6512' : '#f57c1f'
        }
        // three leafy fronds leaning out from the top
        if (y >= 8 && y <= 13) for (const [bx, lean] of [[0, 0], [-1, -0.55], [1, 0.55]] as const) {
          if (Math.round(bx + (y - 8) * lean) === x && Math.abs(z) <= (y < 11 ? 1 : 0)) return y % 2 ? '#46b83d' : '#2f8f2c'
        }
      }).shell()
      return { cells: s.face(GRUMPY_SMALL, 0, 2).list(), pieces: 1, debris: [['#f57c1f', 10], ['#46b83d', 4]] }
    }
    case 'tomato': {
      const s = new Sculpt().fill(9, (x, y, z) => {
        if (ell(x, y, z, 6.6, 5.6, 6.6)) {
          if (y >= 4 && x * x + z * z <= 10 && (Math.abs(x) <= 0 || Math.abs(z) <= 0 || Math.abs(x) === Math.abs(z))) return '#3c9a2f'
          return '#e63b2e'
        }
        if (y >= 6 && y <= 7 && x === 0 && z === 0) return '#2f7d26'
      }).shell()
      return { cells: s.face(GRUMPY, 0, -0.5).list(), pieces: 1, debris: [['#e63b2e', 10], ['#46b83d', 4]] }
    }
    case 'onion': {
      const s = new Sculpt().fill(10, (x, y, z) => {
        const r = y <= 0 ? Math.sqrt(Math.max(0, 36 - y * y)) : y <= 6 ? 6 * Math.sqrt(Math.max(0, 1 - (y / 7) ** 2)) + 0.6 : y <= 9 ? 1 : -1
        if (r >= 0 && y >= -6 && x * x + z * z <= r * r) return Math.floor(((ang(x, z) + Math.PI) / (2 * Math.PI)) * 12) % 2 ? '#d99a4e' : '#c7863d'
        if (y === -7 && Math.abs(x) + Math.abs(z) <= 2 && (x + z) % 2 === 0) return '#8a6a45'
      }).shell()
      return { cells: s.face(GRUMPY, 0, -0.5).list(), pieces: 1, debris: [['#d99a4e', 10], ['#f1e3c4', 4]] }
    }
    case 'cucumber': {
      const s = new Sculpt().fill(10, (x, y, z) => {
        const ax = Math.max(-6, Math.min(6, x))
        if ((x - ax) ** 2 + y * y + z * z <= 3.6 * 3.6) return hash(x, y, z, 1) < 0.14 ? '#8fc46a' : '#2f7a32'
      }).shell()
      return { cells: s.face(GRUMPY_SMALL, 0, 0).list(), pieces: 1, debris: [['#2f8a33', 10], ['#a6dc5c', 4]] }
    }
    case 'broccoli': {
      const balls: [number, number, number, number][] = [[0, 2, 0, 5], [-4.5, 0, 0, 3.6], [4.5, 0, 0, 3.6], [0, 1, 3, 4.2], [-2.5, 5, 0, 3.6], [2.5, 5, 0, 3.6], [0, 3, -3, 3.8]]
      const s = new Sculpt().fill(11, (x, y, z) => {
        for (const [bx, by, bz, r] of balls) if ((x - bx) ** 2 + (y - by) ** 2 + (z - bz) ** 2 <= r * r) {
          const h = hash(x, y, z, 2)
          return h < 0.18 ? '#237026' : h > 0.85 ? '#4caf50' : '#2f8a33'
        }
        if (y >= -9 && y < -1 && x * x + z * z <= 2.6 * 2.6) return '#9ccc4a'
      }).shell()
      return { cells: s.face(GRUMPY, 0, 1).list(), pieces: 1, debris: [['#2f8a33', 10], ['#a6dc5c', 4]] }
    }
    case 'lettuce': {
      const s = new Sculpt().fill(10, (x, y, z) => {
        const a = ang(x, z), r = 8 + 0.7 * Math.sin(a * 9 + y * 0.6)
        if ((x * x + z * z) / (r * r) + (y * y) / 49 <= 1) return Math.floor((a + Math.PI) / (2 * Math.PI) * 7 + y * 0.18) % 2 ? '#a6dc5c' : '#86c447'
      }).shell()
      return { cells: s.face(GRUMPY, 0, -1).list(), pieces: 1, debris: [['#a6dc5c', 10], ['#46b83d', 4]] }
    }
    case 'pepper': {
      const skin = PEPPERS[variant] ?? PEPPERS[0], stem = variant === 2 ? '#1f5e22' : '#2e7d32'
      const s = new Sculpt().fill(9, (x, y, z) => {
        if (y >= -7 && y <= 4) {
          const lobes = 5.4 + 0.9 * Math.cos(4 * ang(x, z))
          const r = lobes * (y < -4 ? Math.sqrt(1 - ((y + 4) / 3.4) ** 2) : y > 2 ? 1 - (y - 2) * 0.16 : 1)
          if (x * x + z * z <= r * r) return skin
        }
        if (y >= 5 && y <= 7 && x * x + z * z <= (y === 5 ? 2.5 : 1)) return stem
      }).shell()
      const debris: Model['debris'] = [[variant === 1 ? '#ffc72c' : variant === 2 ? '#46b83d' : '#e63b2e', 10], [variant === 2 ? '#f1e3c4' : '#46b83d', 4]]
      return { cells: s.face(GRUMPY, 0, -1.5).list(), pieces: 1, debris }
    }
    case 'mushroom': {
      const s = new Sculpt().fill(9, (x, y, z) => {
        if (y >= -1 && ell(x, Math.max(0, y), z, 7.6, 5.4, 7.6)) return y === -1 ? '#d8c39d' : hash(x, y, z, 3) < 0.08 ? '#c58a5e' : '#a86c45'
        if (y >= -9 && y < -1 && x * x + z * z <= 4.4 * 4.4) return '#f1e3c4'
      }).shell()
      return { cells: s.face(GRUMPY_SMALL, 0, -5).list(), pieces: 1, debris: [['#a86c45', 9], ['#f1e3c4', 5]] }
    }
    case 'eggplant': {
      const s = new Sculpt().fill(12, (x, y, z) => {
        // a cone between a fat bottom and a thinner neck, rounded at both ends
        const ay = -4, by = 3, ra = 5.4, rb = 3.2
        const t = Math.max(0, Math.min(1, (y - ay) / (by - ay)))
        const cy = ay + t * (by - ay), r = ra + (rb - ra) * t
        if (x * x + (y - cy) ** 2 + z * z <= r * r) return y >= 4 && x * x + z * z <= 9 ? '#4f8a2b' : hash(x, y, z, 4) < 0.05 ? '#7d47ad' : '#5e2b8a'
        if (y >= 4 && y <= 5 && x * x + z * z <= 14 && x * x + z * z >= 4) return '#4f8a2b'
        if (y >= 6 && y <= 8 && x === 0 && z === 0) return '#3d6e20'
      }).shell()
      return { cells: s.face(GRUMPY, 0, -3).list(), pieces: 1, debris: [['#5e2b8a', 10], ['#46b83d', 4]] }
    }
    case 'pumpkin': {
      // three pieces: the right side and the left side crack off with the first two hits, the rest bursts on the third
      const s = new Sculpt()
      const body = (x: number, y: number, z: number) => {
        const a = ang(x, z), r = 1 - 0.07 * (1 - Math.cos(8 * a)) / 2
        if (!ell(x / r, y, z / r, 11, 8.4, 11)) return
        return Math.cos(8 * a) > 0.82 ? '#dd6512' : '#f7901e'
      }
      for (const part of [0, 1, 2] as const) s.fill(12, (x, y, z) => {
        if (y >= 8 && y <= 11 && x * x + z * z <= (y === 8 ? 5 : 2.5)) return part === 0 && '#6b8e23'
        const side = x > Math.abs(z) * 0.8 ? 1 : x < -Math.abs(z) * 0.8 ? 2 : 0
        return side === part && body(x, y, z)
      }, part)
      s.shell(2, '#fbd48a')
      return { cells: s.face(GRUMPY, 0, 0, 2).list(), pieces: 3, debris: [['#f57c1f', 12], ['#f1e3c4', 5]] }
    }
    case 'sprout': {
      const s = new Sculpt().fill(7, (x, y, z) => {
        if (ell(x, y, z, 5.4, 5.6, 5.4)) return Math.floor((ang(x, y) + Math.PI) / (Math.PI / 3)) % 2 ? '#ffd84a' : '#f2b52a'
      }).shell()
      return { cells: s.face(GRUMPY_SMALL, 0, 0).list(), pieces: 1, debris: [['#ffcf33', 14]], glow: 150 }
    }
    case 'cookie': {
      const s = new Sculpt().fill(9, (x, y, z) => {
        if (x * x + y * y <= 7.5 * 7.5 && Math.abs(z) <= 1) return hash(x, y, z, 5) < 0.12 ? '#4a2c1a' : x * x + y * y > 6.6 * 6.6 ? '#c98a44' : '#e0a95f'
      })
      return { cells: s.face(SMUG, 0, 0).list(), pieces: 1, debris: [['#d99a4e', 10], ['#4a2c1a', 4]] }
    }
    case 'icecream': {
      const sprinkles = ['#ffffff', '#4fc3f7', '#ffeb3b', '#66bb6a']
      const s = new Sculpt().fill(11, (x, y, z) => {
        if (y >= -10 && y <= -1 && x * x + z * z <= (((y + 10) / 9) * 4.2) ** 2 + 0.3) return (x + y + z + 30) % 3 === 0 ? '#c98a3a' : '#e3a857'
        if (ell(x, y - 2.5, z, 5.6, 4.8, 5.6)) {
          const h = hash(x, y, z, 6)
          return h < 0.1 ? sprinkles[Math.floor(h * 40)] : '#ff8fc0'
        }
        if (y >= 7 && y <= 9 && x * x + (y - 8) ** 2 + z * z <= 2.2) return '#e6232e'
      }).shell()
      return { cells: s.face(SMUG, 0, 2).list(), pieces: 1, debris: [['#ff8fc0', 9], ['#d99a4e', 5]] }
    }
    case 'cupcake': {
      const s = new Sculpt().fill(10, (x, y, z) => {
        if (y >= -7 && y <= -1 && x * x + z * z <= (4.4 + (y + 7) * 0.18) ** 2) return Math.floor(((ang(x, z) + Math.PI) / (2 * Math.PI)) * 14) % 2 ? '#4fc3f7' : '#ffffff'
        if (y >= 0 && y <= 6 && x * x + z * z <= (6 - y * 0.8) ** 2) return (y + Math.round(ang(x, z) * 2)) % 3 === 0 ? '#ff9cc6' : '#ffb3d1'
        if (y >= 7 && y <= 8 && x * x + (y - 7.5) ** 2 + z * z <= 1.6) return '#e6232e'
      }).shell()
      return { cells: s.face(SMUG, 0, 1).list(), pieces: 1, debris: [['#ff8fc0', 9], ['#4fc3f7', 5]] }
    }
    case 'donut': {
      const sprinkles = ['#ffffff', '#4fc3f7', '#ffeb3b', '#66bb6a']
      const s = new Sculpt().fill(9, (x, y, z) => {
        const ring = Math.hypot(x, y) - 5
        if (ring * ring + z * z > 2.7 * 2.7) return
        if (z > 0) {
          const h = hash(x, y, z, 7)
          return h < 0.1 ? sprinkles[Math.floor(h * 40)] : '#ff7eb6'
        }
        return '#e0a45a'
      }).shell()
      return { cells: s.list(), pieces: 1, debris: [['#ff8fc0', 9], ['#d99a4e', 5]] }
    }
  }
}

/** The words that pop up out of a burst, and the one for each kind of thing that happened. */
export const WORDS = { veggie: ['YUCK!', 'EW!', 'GROSS!', 'BLEH!', 'ICK!'], golden: ['WOW!'], treat: ['OOPS!'] } as const
/** How many of each word can be on show at once. */
export const WORD_COPIES = 2
const WORD_FACE = '#ff4f9a', WORD_BACK = '#c2286b'

/** The cells of a word in the 3×5 letters, a cell a letter pixel, two cells deep: a bright face and a darker back. */
export function wordCells(word: string): Cell[] {
  const out: Cell[] = []
  const w = word.length * 4 - 1
  for (let i = 0; i < word.length; i++) {
    const glyph = LETTERS[word[i]]
    if (!glyph) continue
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (glyph[r * 3 + c] !== '#') continue
      const x = i * 4 + c - Math.floor(w / 2), y = 2 - r
      out.push({ x, y, z: 1, c: WORD_FACE, part: 0 }, { x, y, z: 0, c: WORD_BACK, part: 0 })
    }
  }
  return out
}

/** Where the models wait while not in play, far below the view. */
const PARK_Y = -60, PARK_GAP = 3

/** One actor the stage draws: blobs, skin, skeleton, and its own cube size. */
export interface Built {
  blobs: Blobs
  skin: ReturnType<typeof emptySkin>
  skeleton: Skeleton
  glow?: Uint8Array
  blockCell: number
}

/** Which bones a thrown thing is drawn with: its own, then one for each piece after the first. */
export interface Slot { bone: number; pieces: number[]; head: [number, number, number] }

/** The models of every kind, enough copies of each, all one actor. */
export interface Veggies extends Built {
  /** By `kind/variant/copy`. */
  slots: Map<string, Slot>
}

/** Pushes `cells` as blobs a cell on `bone`, round `head`, `cell` apart. */
function pushCells(b: Blobs, joints: number[], glows: number[], cells: Cell[], head: [number, number, number], cell: number, bone: (c: Cell) => number, glow = 0) {
  const s = cell * 0.3
  for (const c of cells) {
    b.push({ center: [head[0] + c.x * cell, head[1] + c.y * cell, head[2] + c.z * cell], scale: [s, s, s], quat: [0, 0, 0, 1], color: hex(c.c), opacity: 1 })
    joints.push(bone(c))
    glows.push(glow)
  }
}

function finish(b: Blobs, joints: number[], glows: number[], bones: ConstructorParameters<typeof Skeleton>[0], blockCell: number): Built {
  const skin = emptySkin(b.count)
  for (let i = 0; i < b.count; i++) { skin.joints[i * 4] = joints[i]; skin.weights[i * 4] = 1 }
  const glow = glows.some((g) => g > 0) ? Uint8Array.from(glows) : undefined
  return { blobs: b, skin, skeleton: new Skeleton(bones), glow, blockCell }
}

/** Every kind's models, `copies` of each color, parked in a row. */
export function buildVeggies(): Veggies {
  const b = new Blobs(40000), joints: number[] = [], glows: number[] = []
  // bone 0 holds nothing: it is the one the stage scales as a whole
  const bones: ConstructorParameters<typeof Skeleton>[0] = [{ name: 'stage', parent: -1, head: [0, PARK_Y, -40] }]
  const slots = new Map<string, Slot>()
  let n = 0
  for (const k of KINDS) for (let v = 0; v < k.variants; v++) {
    const model = modelOf(k.id, v)
    for (let copy = 0; copy < k.copies; copy++) {
      const head: [number, number, number] = [(n % 12) * PARK_GAP, PARK_Y - Math.floor(n / 12) * PARK_GAP, 0]
      n++
      const bone = bones.length
      bones.push({ name: `${k.id}${v}-${copy}`, parent: -1, head })
      const pieces: number[] = []
      for (let p = 1; p < model.pieces; p++) {
        pieces.push(bones.length)
        bones.push({ name: `${k.id}${v}-${copy}/piece${p}`, parent: bone, head })
      }
      pushCells(b, joints, glows, model.cells, head, CELL, (c) => (c.part ? pieces[c.part - 1] : bone), model.glow ?? 0)
      slots.set(`${k.id}/${v}/${copy}`, { bone, pieces, head })
    }
  }
  return { ...finish(b, joints, glows, bones, CELL), slots }
}

/** The cubes bursts throw, a pool of each color: a bone and one cube each. */
export interface Debris extends Built {
  /** By color: the bones of its cubes and where each rests. */
  pools: Map<string, { bone: number; head: [number, number, number] }[]>
}

/** How many cubes of each color can fly at once. */
export const DEBRIS_EACH = 16

/** Every color any model bursts into. */
export function debrisColors(): string[] {
  const all = new Set<string>()
  for (const k of KINDS) for (let v = 0; v < k.variants; v++) for (const [c] of modelOf(k.id, v).debris) all.add(c)
  return [...all]
}

export function buildDebris(colors = debrisColors()): Debris {
  const b = new Blobs(colors.length * DEBRIS_EACH), joints: number[] = [], glows: number[] = []
  const bones: ConstructorParameters<typeof Skeleton>[0] = [{ name: 'stage', parent: -1, head: [0, PARK_Y * 2, -40] }]
  const pools = new Map<string, { bone: number; head: [number, number, number] }[]>()
  colors.forEach((color, ci) => {
    const pool: { bone: number; head: [number, number, number] }[] = []
    for (let i = 0; i < DEBRIS_EACH; i++) {
      const head: [number, number, number] = [i * 1, PARK_Y * 2 - ci, 0]
      const bone = bones.length
      bones.push({ name: `cube${ci}-${i}`, parent: -1, head })
      pushCells(b, joints, glows, [{ x: 0, y: 0, z: 0, c: color, part: 0 }], head, DEBRIS_CELL, () => bone, color === '#ffcf33' ? 150 : 0)
      pool.push({ bone, head })
    }
    pools.set(color, pool)
  })
  return { ...finish(b, joints, glows, bones, DEBRIS_CELL), pools }
}

/** The pop-up words, `WORD_COPIES` of each. */
export interface Words extends Built {
  /** By word: its bones and where each rests, and how wide it is in the play plane. */
  pools: Map<string, { bones: { bone: number; head: [number, number, number] }[]; width: number }>
}

export function buildWords(): Words {
  const all = [...new Set(Object.values(WORDS).flat())]
  const b = new Blobs(4000), joints: number[] = [], glows: number[] = []
  const bones: ConstructorParameters<typeof Skeleton>[0] = [{ name: 'stage', parent: -1, head: [0, PARK_Y * 3, -40] }]
  const pools = new Map<string, { bones: { bone: number; head: [number, number, number] }[]; width: number }>()
  all.forEach((word, wi) => {
    const cells = wordCells(word)
    const list: { bone: number; head: [number, number, number] }[] = []
    for (let i = 0; i < WORD_COPIES; i++) {
      const head: [number, number, number] = [i * 8, PARK_Y * 3 - wi * 3, 0]
      const bone = bones.length
      bones.push({ name: `word${wi}-${i}`, parent: -1, head })
      pushCells(b, joints, glows, cells, head, WORD_CELL, () => bone)
      list.push({ bone, head })
    }
    pools.set(word, { bones: list, width: (word.length * 4 - 1) * WORD_CELL })
  })
  return { ...finish(b, joints, glows, bones, WORD_CELL), pools }
}

/** How far a model reaches from its middle, in the play plane: for checking it fits its kind's radius. */
export function reachOf(kind: KindId, variant = 0) {
  let most = 0
  for (const c of modelOf(kind, variant).cells) most = Math.max(most, Math.hypot(c.x, c.y))
  return most * CELL
}

/** sRGB hex to 0–1. */
export function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
