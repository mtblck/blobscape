import type { PaintDoc, PartDoc, SceneDoc } from '../../splat-engine/sceneDoc.ts'

/**
 * The materials library: what a thing is made of, as one named entry of data, so a biome recipe can say "oak,
 * granite, meadow turf" and carry no paint of its own. An entry has four parts:
 *
 * - **color**: a `ramp` from shade to light (each a palette step, so baked shade has a step of its own hue to snap
 *   to) and a `pattern`, how the ramp's steps lie over a surface;
 * - **surface**: the marks drawn on it (`ink`), strokes along its form, and what gathers in its cracks (`grime`);
 * - **light**: matte (nothing set), `glow` or `glass`;
 * - **body**: whether it is a solid, grains, a liquid or a gas. Only solids are made into things so far; the others
 *   say which solver an entry will be handed to (water.ts, mpm.ts, a scene's mist).
 *
 * `paintOf` and `dressed` turn an entry and a seed into what a scene description takes. A seed varies an entry
 * inside its family: which of the ramp's middle steps is commonest and how big its pattern is. It never makes a new
 * color, because a pixel-art palette has to hold every color an island uses.
 */

export type Body = 'solid' | 'grain' | 'liquid' | 'gas'
export type Family = 'turf' | 'soil' | 'rock' | 'wood' | 'leaf' | 'bloom' | 'moss' | 'snow' | 'ice' | 'crystal' | 'sand' | 'water' | 'cloud'

/** How a ramp's steps lie over a surface. Sizes are in scene units (about 1 is a small house). */
export type Pattern =
  /** One color: the ramp's main step. */
  | { kind: 'plain' }
  /** Small flecks of the steps: stone, leaves, sand. */
  | { kind: 'speckle'; size: number }
  /** Soft patches of the steps: turf, moss, snow. */
  | { kind: 'patches'; size: number }
  /** Stripes across the upright: bark rings, strata, layers of soil. */
  | { kind: 'layers'; size: number }

export interface Material {
  id: string
  /** What a list calls it. */
  name: string
  family: Family
  body: Body
  /** Its colors from shade to light, three or four steps. The second is its main color. */
  ramp: string[]
  pattern: Pattern
  /** Little drawn marks over it (a scene part's `ink`). */
  ink?: PartDoc['ink']
  /** Dabs that follow its form, 0 to 1. */
  strokes?: number
  /** A material that gathers in its corners and cracks: its main color is used. */
  grime?: string
  /** Gives off light and takes none. */
  glow?: boolean
  /** Shows what is behind it and mirrors what is over it. */
  glass?: PartDoc['glass']
}

const m = (id: string, name: string, family: Family, ramp: string[], pattern: Pattern, more: Partial<Material> = {}): Material => ({ id, name, family, body: 'solid', ramp, pattern, ...more })

export const MATERIALS: Material[] = [
  // ground
  m('meadow-turf', 'Meadow turf', 'turf', ['#2c5a38', '#3f7a45', '#69b05a', '#a8d67a'], { kind: 'patches', size: 0.2 }, { ink: { kind: 'tufts', amount: 0.3 } }),
  m('alpine-turf', 'Alpine turf', 'turf', ['#1f4a3c', '#2f6a4a', '#4f8c5a', '#86b478'], { kind: 'patches', size: 0.22 }, { ink: { kind: 'tufts', amount: 0.35 } }),
  m('dry-turf', 'Dry turf', 'turf', ['#5a5a2a', '#7e7a3a', '#a8a052', '#d0c878'], { kind: 'patches', size: 0.24 }, { ink: { kind: 'tufts', amount: 0.25 } }),
  m('loam', 'Loam', 'soil', ['#2a1c16', '#4a3020', '#6e4a2e', '#93693e'], { kind: 'layers', size: 0.045 }),
  m('red-earth', 'Red earth', 'soil', ['#4a1e18', '#7a3424', '#a04e30', '#c87a4a'], { kind: 'layers', size: 0.06 }),
  m('sand', 'Sand', 'sand', ['#a37a52', '#d8b07a', '#ecd9b0'], { kind: 'speckle', size: 0.05 }, { body: 'grain' }),
  // rock
  m('granite', 'Granite', 'rock', ['#2f2d3a', '#4a4758', '#6b6474', '#9d97a6'], { kind: 'speckle', size: 0.06 }, { grime: 'moss' }),
  m('slate', 'Slate', 'rock', ['#1e2430', '#34405a', '#566684', '#8a9ab4'], { kind: 'layers', size: 0.05 }),
  m('sandstone', 'Sandstone', 'rock', ['#8e3a26', '#b8542e', '#d8743a', '#f0c08a'], { kind: 'layers', size: 0.07 }),
  // wood
  m('oak', 'Oak', 'wood', ['#2a1c16', '#4e3a2a', '#6e4c30'], { kind: 'layers', size: 0.05 }, { ink: { kind: 'grain', amount: 0.4 }, strokes: 0.6 }),
  m('birch', 'Birch', 'wood', ['#4a4758', '#d3cfd6', '#f4f1e4'], { kind: 'layers', size: 0.07 }, { strokes: 0.6 }),
  m('driftwood', 'Bleached wood', 'wood', ['#6b6474', '#a89a88', '#d8ccb4'], { kind: 'layers', size: 0.05 }, { ink: { kind: 'grain', amount: 0.5 }, strokes: 0.6 }),
  m('pine', 'Pine', 'wood', ['#2a1c16', '#5a3e28', '#7a5234'], { kind: 'layers', size: 0.04 }, { ink: { kind: 'grain', amount: 0.3 }, strokes: 0.6 }),
  // leaves and plants
  m('oak-leaf', 'Oak leaves', 'leaf', ['#1b3a2a', '#2c5a38', '#466434', '#6c8a40'], { kind: 'speckle', size: 0.05 }),
  m('birch-leaf', 'Birch leaves', 'leaf', ['#466434', '#6c8a40', '#9aae52', '#c8d67a'], { kind: 'speckle', size: 0.04 }),
  m('pine-needle', 'Pine needles', 'leaf', ['#0e2a2a', '#1a4a40', '#2f7058'], { kind: 'speckle', size: 0.04 }),
  m('fern', 'Ferns', 'leaf', ['#14382a', '#22573a', '#3f7a45', '#69a058'], { kind: 'speckle', size: 0.045 }),
  m('sage', 'Sagebrush', 'leaf', ['#4a5a48', '#6e8068', '#98a888', '#c0c8a8'], { kind: 'speckle', size: 0.04 }),
  m('cactus', 'Cactus', 'leaf', ['#1c4030', '#2e6a48', '#4a9060', '#86b878'], { kind: 'layers', size: 0.03 }, { ink: { kind: 'stipple', amount: 0.4 } }),
  m('moss', 'Moss', 'moss', ['#2c4428', '#466434', '#6c8a40'], { kind: 'patches', size: 0.1 }),
  // blooms stay readable when small, so they glow a little (rule 3 of the scene guide)
  m('poppy', 'Poppies', 'bloom', ['#7d2836', '#c9485a', '#ff7a6a'], { kind: 'speckle', size: 0.03 }, { glow: true }),
  m('buttercup', 'Buttercups', 'bloom', ['#c98a1c', '#ffd166', '#fff3b0'], { kind: 'speckle', size: 0.03 }, { glow: true }),
  m('daisy', 'Daisies', 'bloom', ['#d3cfd6', '#f4f1e4', '#ffd166'], { kind: 'speckle', size: 0.03 }, { glow: true }),
  m('bluebell', 'Bluebells', 'bloom', ['#3f4aa8', '#6f7ae0', '#a8b0ff'], { kind: 'speckle', size: 0.03 }, { glow: true }),
  m('heather', 'Heather', 'bloom', ['#5a2a6a', '#9446ac', '#c070d0'], { kind: 'speckle', size: 0.03 }, { glow: true }),
  m('cactus-flower', 'Cactus flowers', 'bloom', ['#a02860', '#e04a88', '#ff9ac0'], { kind: 'speckle', size: 0.03 }, { glow: true }),
  // cold and bright things, and what is not solid: here for the biomes to come
  m('snow', 'Snow', 'snow', ['#8fa8d0', '#c8d8f0', '#f4f8ff'], { kind: 'patches', size: 0.3 }, { body: 'grain' }),
  m('ice', 'Ice', 'ice', ['#1c6a8c', '#3ab0d0', '#a0ecf8'], { kind: 'patches', size: 0.2 }, { glass: { see: 0.5, mirror: 0.4 } }),
  m('amethyst', 'Amethyst', 'crystal', ['#5a2a6a', '#9446ac', '#c070d0', '#e8a8ec'], { kind: 'plain' }),
  m('pond-water', 'Pond water', 'water', ['#12303a', '#1c5a6a', '#3a9aa8'], { kind: 'patches', size: 0.3 }, { body: 'liquid', glass: { see: 0.6, mirror: 0.3, top: true } }),
  m('cloud', 'Cloud', 'cloud', ['#9fb4d0', '#d8e6f4', '#ffffff'], { kind: 'patches', size: 0.3 }, { body: 'gas' }),
]

/**
 * How much light a material lets through by nature: what it shows of what lies behind it. Glass says; a gas lets it
 * all through; solids and grains none. A part of a material that lets none through must be cut `SOLID`, and the
 * islands' tests hold every such part to it from every side (`seeThrough`).
 */
export function letsThrough(mat: Material): number {
  if (mat.glass) return mat.glass.see ?? 0.5
  if (mat.body === 'gas') return 1
  return 0
}

/** Lets no light through: solid ground, rock, wood, stone. */
export const opaque = (mat: Material): boolean => letsThrough(mat) === 0

/**
 * How a scene with opaque things in it must be cut so nothing shows through them. A scene's skin of discs is hollow
 * and one cell deep: at the default disc size (0.55 of the grid) about a quarter of the light got through an island's
 * earth wall and rock seen at a slant, so the turf's underside showed through the earth, and rough shapes thinned the
 * skin further. Wider discs and a skin one cell deep in true distance bring it under one part in a hundred.
 */
export const SOLID: Required<Pick<SceneDoc, 'disc' | 'trueShell'>> = { disc: 0.75, trueShell: true }

const BY_ID = new Map(MATERIALS.map((x) => [x.id, x]))

/** A material by its id. Throws for one the library lacks, so a recipe's typo fails its test. */
export function material(id: string): Material {
  const found = BY_ID.get(id)
  if (!found) throw new Error(`no material called "${id}"`)
  return found
}

/** Every material of a family, in the library's order. */
export const family = (f: Family): Material[] => MATERIALS.filter((x) => x.family === f)

/** A whole number from a seed and a salt, evenly spread: the one hash the islands use, so a seed means one thing. */
export function hashOf(seed: number, salt: number): number {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul((salt | 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0
  return (h ^ (h >>> 15)) >>> 0
}

/** A number in 0 to 1 (never 1) from a seed and a salt. */
export const chance = (seed: number, salt: number): number => hashOf(seed, salt) / 4294967296

/** One of a list by a seed. */
export const pickOf = <T>(list: readonly T[], seed: number, salt = 0): T => list[hashOf(seed, salt) % list.length]

/**
 * A material's colors as a pattern lists them, commonest first: its main step, then one of its neighbors by the seed,
 * then the rest. So two oaks from two seeds lean a little darker or lighter, in the same colors.
 */
export function leaning(mat: Material, seed: number): string[] {
  const r = mat.ramp, main = Math.min(1, r.length - 1)
  const rest = r.map((_, i) => i).filter((i) => i !== main)
  // the lighter neighbor first for half the seeds
  if (rest.length > 1 && chance(seed, 11) < 0.5) rest.reverse()
  return [r[main], ...rest.map((i) => r[i])]
}

/** A material's paint for a scene part, varied by the seed within its own colors. `scale` sizes its pattern with the thing. */
export function paintOf(mat: Material, seed = 0, scale = 1): PaintDoc {
  const p = mat.pattern
  if (p.kind === 'plain') return mat.ramp[Math.min(1, mat.ramp.length - 1)]
  const colors = leaning(mat, seed)
  // a pattern a fifth bigger or smaller, rounded so a description stays short
  const size = Math.round(p.size * scale * (0.8 + 0.4 * chance(seed, 12)) * 1000) / 1000
  if (p.kind === 'layers') {
    // stripes take their colors in turn, so the main one is given twice to stay the commonest
    return { kind: 'bands', axis: 'y', size, colors: [colors[0], colors[1], colors[0], ...colors.slice(2)] }
  }
  return { kind: p.kind, size, colors }
}

/** What a scene part of this material takes besides its shape and bone: its paint and its surface and light. */
export function dressed(mat: Material, seed = 0, scale = 1): Pick<PartDoc, 'paint' | 'ink' | 'strokes' | 'grime' | 'glow' | 'glass' | 'bare'> {
  const out: Pick<PartDoc, 'paint' | 'ink' | 'strokes' | 'grime' | 'glow' | 'glass' | 'bare'> = { paint: paintOf(mat, seed, scale) }
  if (mat.ink) out.ink = mat.ink
  if (mat.strokes) out.strokes = mat.strokes
  if (mat.grime) out.grime = material(mat.grime).ramp[1]
  if (mat.glow) out.glow = true
  if (mat.glass) { out.glass = mat.glass; out.bare = true }
  return out
}

/** Every color some materials can paint, without repeats, in the order given: what an island's palette must hold. */
export function colorsOf(ids: readonly string[]): string[] {
  const out: string[] = []
  for (const id of ids) {
    const mat = material(id)
    for (const c of [...mat.ramp, ...(mat.grime ? [material(mat.grime).ramp[1]] : [])]) if (!out.includes(c)) out.push(c)
  }
  return out
}
