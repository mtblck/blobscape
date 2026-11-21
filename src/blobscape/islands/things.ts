import type { Vec3 } from '../../splat-core/blobs.ts'
import type { BoneDoc, MoveDoc, PartDoc, ShapeDoc } from '../../splat-engine/sceneDoc.ts'
import type { ThingKind } from './biomes.ts'
import { chance, dressed, material } from './materials.ts'

/**
 * The things that stand on an island, each made by a rule from where it stands, how big it is, a seed and the
 * materials picked for it. Every thing is on a bone of its own, marked as a prop (rule 13 of the scene guide), so
 * Scene Creator can lift it off the island and a visitor can poke it.
 */

/** One thing set down on an island. */
export interface Thing {
  kind: ThingKind
  /** What a list calls one of them, and several. */
  name: string
  plural: string
  /** The point on the ground it stands on. */
  at: Vec3
  /** 1 is the thing's own size. */
  size: number
  seed: number
  /** The material picked for each use (`wood`, `leaf`, `rock`, `bloom`). */
  made: Record<string, string>
}

/** How much ground a thing of each kind keeps to itself at size 1: nothing else stands within it. */
export const ROOM: Record<ThingKind, number> = { tree: 0.2, pine: 0.18, bush: 0.26, boulder: 0.3, flowers: 0.18, stump: 0.17, cactus: 0.16, stones: 0.42, tor: 0.4, hoodoos: 0.4 }

/**
 * How much bigger than its own size each kind is drawn on an island, so things stand right beside the elf (Matt,
 * 2026-11-20: with the elf four blocks tall, a trunk must be at least that, and trees big enough to walk under). The
 * planner multiplies a population's size by it, so the room a thing keeps grows with it.
 */
export const BIGGER: Record<ThingKind, number> = { tree: 2, pine: 2, bush: 1.4, boulder: 1.8, flowers: 1.3, stump: 1.6, cactus: 1.8, stones: 1.6, tor: 1.7, hoodoos: 1.7 }

/** The bones, parts and moves of one thing, and which of its parts are opaque bodies (`solid`, by index in `parts`), which must let no light through. */
export interface Piece { bones: BoneDoc[]; parts: PartDoc[]; moves: MoveDoc[]; solid: number[] }

/** A number rounded to a thousandth, so a description stays short and holds no -0. */
export const r3 = (v: number): number => Math.round(v * 1000) / 1000 || 0
const v3 = (x: number, y: number, z: number): Vec3 => [r3(x), r3(y), r3(z)]
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

/** How a tree of each wood grows: a broad oak, a tall narrow birch. */
const TREE_FORMS: Record<string, { height: number; crown: Vec3; r: number; leaves: number }> = {
  driftwood: { height: 0.3, crown: [0.3, 0.2, 0.3], r: 0.045, leaves: 0.04 },
  oak: { height: 0.4, crown: [0.45, 0.32, 0.45], r: 0.06, leaves: 0.06 },
  birch: { height: 0.5, crown: [0.26, 0.42, 0.26], r: 0.035, leaves: 0.045 },
}

/**
 * Thing `i` of an island as bones, parts and moves. `n` counts it among those of its name, for the prop's name
 * (a prop's name is used once in a scene).
 */
export function makeThing(t: Thing, i: number, n: number): Piece {
  const [x, y, z] = t.at, s = t.size, bone = `${t.kind}${i}`
  const prop = `${cap(t.name)} ${n}`
  const rnd = (salt: number) => chance(t.seed, salt)
  const on = (shape: ShapeDoc, mat: string, more: Partial<PartDoc> = {}, to = bone, scale = 1): PartDoc => ({ shape, ...dressed(material(mat), t.seed, scale), bone: to, ...more })
  switch (t.kind) {
    case 'tree': {
      const f = TREE_FORMS[t.made.wood] ?? TREE_FORMS.oak
      // its foot a little under the turf, so it never floats on a slope
      const at = v3(x, y - 0.03 * s, z)
      const tree = { kind: 'tree' as const, at, height: r3(f.height * s), crown: v3(f.crown[0] * s, f.crown[1] * s, f.crown[2] * s), r: r3(f.r * s), points: 120, seed: 1 + (t.seed % 9999) }
      return {
        bones: [{ name: bone, at, prop }, { name: `${bone}Crown`, at: v3(x, y + f.height * s, z), parent: bone }],
        parts: [
          on({ ...tree, only: 'limbs' }, t.made.wood, {}, bone, s),
          on({ ...tree, leaves: r3(f.leaves * s), only: 'leaves' }, t.made.leaf, { noShadow: true }, `${bone}Crown`),
        ],
        moves: [{ kind: 'sway', bone: `${bone}Crown`, axis: rnd(1) < 0.5 ? 'x' : 'z', degrees: r3(1 + rnd(2)), times: 1 + Math.floor(rnd(3) * 3), phase: r3(rnd(4)) }],
        solid: [],
      }
    }
    case 'pine': {
      // a straight trunk under three or four tiers of needles, each narrower than the one under it
      const h = (0.62 + 0.12 * rnd(1)) * s, tiers = 3 + Math.floor(rnd(2) * 2), wide = (0.2 + 0.04 * rnd(3)) * s
      const at = v3(x, y - 0.03 * s, z), cones: ShapeDoc[] = []
      for (let k = 0; k < tiers; k++) {
        const lo = y + h * (0.34 + (0.52 * k) / tiers), r = wide * (1 - (0.55 * k) / tiers)
        cones.push({ kind: 'cone', from: v3(x, lo, z), to: v3(x, lo + h * 0.42, z), r: r3(r), rTo: r3(r * 0.08) })
      }
      return {
        bones: [{ name: bone, at, prop }, { name: `${bone}Crown`, at: v3(x, y + h * 0.3, z), parent: bone }],
        parts: [
          on({ kind: 'cylinder', at, height: r3(h * 0.5), r: r3(0.035 * s), rTop: r3(0.025 * s) }, t.made.wood, {}, bone, s),
          on({ kind: 'join', blend: 'smooth', by: r3(0.03 * s), shapes: cones }, t.made.leaf, {}, `${bone}Crown`),
        ],
        moves: [{ kind: 'sway', bone: `${bone}Crown`, axis: rnd(4) < 0.5 ? 'x' : 'z', degrees: r3(0.8 + rnd(5)), times: 1 + Math.floor(rnd(6) * 2), phase: r3(rnd(7)) }],
        solid: [1],
      }
    }
    case 'cactus':
      return {
        bones: [{ name: bone, at: v3(x, y, z), prop }],
        parts: [on({ kind: 'cactus', at: v3(x, y - 0.03 * s, z), height: r3((0.34 + 0.14 * rnd(1)) * s), r: r3(0.045 * s), ribs: 8, arms: Math.floor(rnd(2) * 3), seed: 1 + (t.seed % 9999) }, t.made.leaf)],
        moves: [],
        solid: [0],
      }
    case 'tor': {
      // granite blocks piled up, the biggest at the foot
      const shapes: ShapeDoc[] = []
      let h = y - 0.04 * s
      for (let k = 0, n = 3 + Math.floor(rnd(1) * 2); k < n; k++) {
        const w = (0.3 - 0.05 * k) * s * (0.85 + 0.3 * rnd(10 + k)), tall = w * (0.5 + 0.2 * rnd(20 + k))
        const off = (rnd(30 + k) - 0.5) * 0.12 * s
        shapes.push({ kind: 'box', at: v3(x + off, h + tall, z - off), half: v3(w, tall, w * (0.8 + 0.3 * rnd(40 + k))), round: 0.5 })
        h += tall * 1.9
      }
      return {
        bones: [{ name: bone, at: v3(x, y, z), prop }],
        parts: [on({ kind: 'rough', shape: { kind: 'join', shapes }, by: r3(0.03 * s), scale: 0.3 }, t.made.rock, { ink: { kind: 'cracks', amount: 0.3 } })],
        moves: [],
        solid: [0],
      }
    }
    case 'hoodoos': {
      // a few spires of soft rock under hard caps, the middle one tallest
      const shapes: ShapeDoc[] = []
      for (let k = 0, n = 3 + Math.floor(rnd(1) * 2); k < n; k++) {
        const a = rnd(10 + k) * Math.PI * 2, d = k === 0 ? 0 : (0.16 + 0.1 * rnd(20 + k)) * s
        shapes.push({ kind: 'hoodoo', at: v3(x + Math.cos(a) * d, y - 0.04 * s, z + Math.sin(a) * d), height: r3((k === 0 ? 0.9 : 0.45 + 0.3 * rnd(30 + k)) * s), r: r3(0.07 * s), seed: 1 + ((t.seed + k) % 9999) })
      }
      return {
        bones: [{ name: bone, at: v3(x, y, z), prop }],
        parts: [on({ kind: 'join', shapes }, t.made.rock)],
        moves: [],
        solid: [0],
      }
    }
    case 'bush':
      return {
        bones: [{ name: bone, at: v3(x, y, z), prop }],
        parts: [on({ kind: 'rough', shape: { kind: 'ball', at: v3(x, y + 0.14 * s, z), r: v3((0.26 + 0.08 * rnd(1)) * s, 0.2 * s, (0.24 + 0.08 * rnd(2)) * s) }, by: r3(0.05 * s), scale: 0.25 }, t.made.leaf)],
        moves: [],
        solid: [0],
      }
    case 'boulder':
      return {
        bones: [{ name: bone, at: v3(x, y, z), prop }],
        parts: [on({ kind: 'rough', shape: { kind: 'ball', at: v3(x, y + 0.08 * s, z), r: v3((0.26 + 0.1 * rnd(1)) * s, (0.18 + 0.1 * rnd(2)) * s, (0.24 + 0.08 * rnd(3)) * s) }, by: r3(0.04 * s), scale: 0.35 }, t.made.rock)],
        moves: [],
        solid: [0],
      }
    case 'stump':
      return {
        bones: [{ name: bone, at: v3(x, y, z), prop }],
        parts: [{ shape: { kind: 'cylinder', at: v3(x, y - 0.03, z), height: r3(0.2 * s), r: r3(0.15 * s), rTop: r3(0.12 * s) }, paint: { kind: 'faces', top: material(t.made.wood).ramp[2], side: dressed(material(t.made.wood), t.seed).paint }, bone }],
        moves: [],
        solid: [0],
      }
    case 'flowers': {
      // a handful of stems within a hand's reach of each other: heads one part, stems another
      const count = 6 + Math.floor(rnd(1) * 4), heads: ShapeDoc[] = [], stems: ShapeDoc[] = []
      for (let k = 0; k < count; k++) {
        const a = rnd(10 + k) * Math.PI * 2, d = Math.sqrt(rnd(30 + k)) * 0.15 * s, h = (0.07 + 0.05 * rnd(50 + k)) * s
        const fx = x + Math.cos(a) * d, fz = z + Math.sin(a) * d
        heads.push({ kind: 'sphere', at: v3(fx, y + h, fz), r: r3(0.024 * s) })
        stems.push({ kind: 'cone', from: v3(fx, y - 0.02, fz), to: v3(fx, y + h, fz), r: 0.006 })
      }
      return {
        bones: [{ name: bone, at: v3(x, y, z), prop }],
        parts: [
          on({ kind: 'join', shapes: stems }, t.made.leaf, { noShadow: true }),
          on({ kind: 'join', shapes: heads }, t.made.bloom, { noShadow: true }),
        ],
        moves: [{ kind: 'sway', bone, axis: rnd(2) < 0.5 ? 'x' : 'z', degrees: r3(3 + 3 * rnd(3)), times: 2 + Math.floor(rnd(4) * 3), phase: r3(rnd(5)) }],
        solid: [],
      }
    }
    case 'stones': {
      // a ring of standing stones, one fallen: tall rough slabs, each a little different
      const count = 5 + Math.floor(rnd(1) * 3), ring = 0.34 * s, shapes: ShapeDoc[] = []
      const turn = rnd(2) * Math.PI * 2
      for (let k = 0; k < count; k++) {
        const a = turn + (k / count) * Math.PI * 2, sx = x + Math.cos(a) * ring, sz = z + Math.sin(a) * ring
        const tall = (0.26 + 0.14 * rnd(10 + k)) * s, wide = (0.06 + 0.02 * rnd(20 + k)) * s
        if (k === 1) shapes.push({ kind: 'ball', at: v3(sx, y + wide * 0.6, sz), r: v3(tall * 0.5, wide * 0.8, wide) })
        else shapes.push({ kind: 'ball', at: v3(sx, y + tall * 0.42, sz), r: v3(wide * (0.8 + 0.4 * Math.abs(Math.sin(a))), tall * 0.6, wide * (0.8 + 0.4 * Math.abs(Math.cos(a)))) })
      }
      return {
        bones: [{ name: bone, at: v3(x, y, z), prop }],
        parts: [on({ kind: 'rough', shape: { kind: 'join', shapes }, by: r3(0.015 * s), scale: 0.2 }, t.made.rock, { ink: { kind: 'cracks', amount: 0.3 } })],
        moves: [],
        solid: [0],
      }
    }
  }
}
