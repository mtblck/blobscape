import type { Vec3 } from '../../splat-core/blobs.ts'
import { BLOOM, FLOWERS, PALETTES, flower, inSeason, type Flower, type Palette, type Role, type Season } from './flowers.ts'
import { reach } from './heads.ts'
import { rng, unit } from './make.ts'
import { SEASON_VASES, type VaseKind } from './vases.ts'
import type { TableKind } from './tables.ts'

/**
 * Arranging, the way a florist does it, in plain numbers. A bouquet is
 * picked by role: a few big focal blooms, some second blooms to support
 * them, line flowers for height, fillers for the gaps and greenery to frame
 * it all, in odd numbers and in colors from one palette. Then every stem is
 * given a way to lean and a length: focal blooms low and in the middle,
 * second blooms round them, fillers just proud of both, line flowers high,
 * greens out round the collar. Stems of a kind stay near each other, and
 * every head is put where it has the most room.
 */

export type Size = 'posy' | 'bouquet' | 'armful'
export const SIZES: { id: Size; label: string }[] = [{ id: 'posy', label: 'Posy' }, { id: 'bouquet', label: 'Bouquet' }, { id: 'armful', label: 'Armful' }]

export type Shape = 'round' | 'garden' | 'tall'
export const SHAPES: { id: Shape; label: string; note: string }[] = [
  { id: 'round', label: 'Round', note: 'an even dome, the same from every side' },
  { id: 'garden', label: 'Garden', note: 'loose and lopsided, high on one side and trailing on the other' },
  { id: 'tall', label: 'Tall', note: 'narrow and upright, led by its line flowers' },
]

/** What a bouquet is asked for with. Left out, the palette and the vase are picked from the season's own. */
export interface Choice {
  season: Season
  seed: number
  size: Size
  shape: Shape
  palette?: string
  vase?: VaseKind
  /** What it stands on; left out, the seed picks. It changes nothing else about the plan. */
  table?: TableKind
}

/** One stem's place in the arrangement. */
export interface StemPlan {
  flower: string
  variety: number
  role: Role
  /** Which way it leans from where the stems are held, and how long it is from there to its head, in units of the bouquet's height. */
  dir: Vec3
  length: number
  /** Its own run of random numbers. */
  seed: number
}

/** A line of the list of what went in: 'three blush peonies'. */
export interface Line { flower: string; variety: number; role: Role; count: number }

export interface Plan {
  choice: Choice
  palette: Palette
  vase: VaseKind
  stems: StemPlan[]
  lines: Line[]
}

/** How many of each role a size takes, as groups: each group is one kind of flower. Odd numbers, as florists count. */
export const COUNTS: Record<Size, Record<Role, number[]>> = {
  posy: { focal: [3], second: [3], line: [2], filler: [3, 2], green: [2, 2] },
  bouquet: { focal: [3], second: [5, 3], line: [3], filler: [5, 3], green: [4, 3] },
  armful: { focal: [3, 2], second: [5, 4], line: [3, 2], filler: [5, 4], green: [4, 3, 3] },
}

/** Where a role's heads go: how far it leans from upright (degrees), and how long, as a share of the bouquet's height. */
interface Zone { lean: [number, number]; long: [number, number] }
const ZONES: Record<Shape, Record<Role, Zone>> = {
  round: {
    focal: { lean: [14, 46], long: [0.7, 0.82] }, second: { lean: [24, 62], long: [0.76, 0.92] }, line: { lean: [0, 26], long: [1.08, 1.3] },
    filler: { lean: [10, 66], long: [0.9, 1.04] }, green: { lean: [22, 66], long: [0.6, 0.92] },
  },
  garden: {
    focal: { lean: [12, 52], long: [0.68, 0.86] }, second: { lean: [22, 70], long: [0.74, 1.02] }, line: { lean: [4, 40], long: [1.15, 1.5] },
    filler: { lean: [10, 74], long: [0.9, 1.18] }, green: { lean: [22, 68], long: [0.62, 1.1] },
  },
  tall: {
    focal: { lean: [10, 36], long: [0.66, 0.8] }, second: { lean: [16, 46], long: [0.78, 1] }, line: { lean: [0, 16], long: [1.3, 1.65] },
    filler: { lean: [6, 48], long: [0.95, 1.2] }, green: { lean: [16, 60], long: [0.62, 1] },
  },
}

const ROLES: Role[] = ['focal', 'second', 'line', 'filler', 'green']
/** Greens and browns go with any palette. */
const NEUTRAL = ['green', 'brown']
/** The bouquet's height in the bouquet's units, before the vase has its say: what `length` 1 comes to. */
export const HEIGHTS: Record<Size, number> = { posy: 0.5, bouquet: 0.62, armful: 0.74 }

/** The varieties of a flower that a palette takes. */
export function varietiesIn(f: Flower, p: Palette, role: Role): number[] {
  return f.varieties.map((v, i) => (p.hues.includes(v.hue) || (role === 'green' && NEUTRAL.includes(v.hue)) ? i : -1)).filter((i) => i >= 0)
}

/** How big a flower's head is in the bouquet's units, for giving it room. */
export function headRoom(f: Flower): number {
  return Math.min(0.26, reach(f.head(f.varieties[0])) * f.size * BLOOM)
}

/** Plans a bouquet: what goes in and where each stem leans. The same choice gives the same plan. */
export function plan(choice: Choice): Plan {
  const rand = rng(choice.seed * 2654435761 + 97)
  const palettes = PALETTES[choice.season]
  const palette = palettes.find((p) => p.id === choice.palette) ?? palettes[Math.floor(rand() * palettes.length)]
  const seasonVases = SEASON_VASES[choice.season]
  const vase = choice.vase ?? seasonVases[Math.floor(rand() * seasonVases.length)]
  const pool = inSeason(choice.season)
  const used = new Set<string>()
  const hues = new Map<string, number>()

  // one kind of flower for each group of each role
  const lines: Line[] = []
  for (const role of ROLES) {
    for (const count of COUNTS[choice.size][role]) {
      let fits = pool.filter((f) => f.roles.includes(role) && !used.has(f.id) && varietiesIn(f, palette, role).length)
      // a palette that has run out of a role takes any color, then any flower of the season again
      const strict = fits.length > 0
      if (!fits.length) fits = pool.filter((f) => f.roles.includes(role) && !used.has(f.id))
      if (!fits.length) fits = pool.filter((f) => f.roles.includes(role))
      if (!fits.length) continue
      // a flower at the height of its season is three times as likely as one at its edge
      // and one that brings a color the bouquet hasn't got yet, twice as likely again
      const brings = (f: Flower) => role !== 'green' && varietiesIn(f, palette, role).some((i) => !hues.has(f.varieties[i].hue))
      // and one in the palette's leading colors (they come first in its list) likelier than one only in its whites
      const lead = (f: Flower) => Math.max(0, ...varietiesIn(f, palette, role).map((i) => 1 - palette.hues.indexOf(f.varieties[i].hue) / palette.hues.length))
      const weights = fits.map((f) => (f.seasons[0] === choice.season ? 3 : 1) * (f.roles[0] === role ? 2 : 1) * (brings(f) ? 2 : 1) * (role === 'green' ? 1 : 0.4 + 2 * lead(f)))
      let pick = rand() * weights.reduce((a, b) => a + b, 0), k = 0
      while (k < fits.length - 1 && pick > weights[k]) { pick -= weights[k]; k++ }
      const f = fits[k]
      used.add(f.id)
      const all = f.varieties.map((_, i) => i)
      const ok = strict ? varietiesIn(f, palette, role) : all
      // the color the bouquet has least of so far, leaning to the palette's leading colors, so more than one of them shows
      const cost = (i: number) => (hues.get(f.varieties[i].hue) ?? 0) / 3 + Math.max(0, palette.hues.indexOf(f.varieties[i].hue)) * 0.5 + rand() * 0.8
      const costs = ok.map(cost)
      const variety = ok[costs.indexOf(Math.min(...costs))]
      if (role !== 'green') hues.set(f.varieties[variety].hue, (hues.get(f.varieties[variety].hue) ?? 0) + count)
      lines.push({ flower: f.id, variety, role, count })
    }
  }

  // where each stem goes: the best of a handful of tries, by how much room it leaves
  const H = HEIGHTS[choice.size]
  const high = rand() * Math.PI * 2
  const placed: { p: Vec3; r: number; flower: string; green: boolean }[] = []
  const stems: StemPlan[] = []
  for (const line of lines) {
    const f = flower(line.flower)
    const zone = ZONES[choice.shape][line.role]
    const trails = 'along' in f.head(f.varieties[0]) && ((f.head(f.varieties[0]) as { along: { droop?: number } }).along.droop ?? 0) > 120
    const r = headRoom(f) * (line.role === 'green' ? 0.6 : 1)
    for (let n = 0; n < line.count; n++) {
      let best: { dir: Vec3; length: number; p: Vec3 } | undefined, bestScore = -Infinity
      for (let c = 0; c < 28; c++) {
        const lo = Math.cos(((trails ? 72 : zone.lean[0]) * Math.PI) / 180), hi = Math.cos(((trails ? 96 : zone.lean[1]) * Math.PI) / 180)
        const cos = lo + (hi - lo) * rand(), sin = Math.sqrt(Math.max(0, 1 - cos * cos))
        const az = rand() * Math.PI * 2
        let length = trails ? 0.45 + 0.15 * rand() : zone.long[0] + (zone.long[1] - zone.long[0]) * rand()
        // a garden bouquet is taller on one side and wider on the other
        if (choice.shape === 'garden') length *= 1 + 0.26 * Math.cos(az - high) * (line.role === 'green' ? -0.8 : 1) * (0.4 + sin)
        const dir: Vec3 = [sin * Math.cos(az), cos, sin * Math.sin(az)]
        const p: Vec3 = [dir[0] * length * H, dir[1] * length * H, dir[2] * length * H]
        let room = 2, kin = Infinity
        for (const q of placed) {
          const d = Math.hypot(p[0] - q.p[0], p[1] - q.p[1], p[2] - q.p[2])
          // greens tuck in behind: they need less room from flowers than flowers do from each other
          room = Math.min(room, d / ((r + q.r) * (q.green !== (line.role === 'green') ? 0.7 : 1)))
          if (q.flower === f.id) kin = Math.min(kin, d)
        }
        // room first; then near its own kind, so a color sits in a patch instead of being dotted about
        const score = Math.min(room, 1.25) - (Number.isFinite(kin) ? 0.35 * Math.max(0, kin / H - 0.35) : 0) + rand() * 0.05
        if (score > bestScore) { bestScore = score; best = { dir, length, p } }
      }
      placed.push({ p: best!.p, r, flower: f.id, green: line.role === 'green' })
      stems.push({ flower: f.id, variety: line.variety, role: line.role, dir: unit(best!.dir), length: best!.length, seed: Math.floor(rand() * 1e9) })
    }
  }
  return { choice, palette, vase, stems, lines }
}

const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

/** A plan's lines in words: 'three blush peonies', 'two stems of eucalyptus'. */
export function inWords(line: Line): string {
  const f = flower(line.flower), v = f.varieties[line.variety]
  const one = f.varieties.length > 1 ? `${v.name} ${line.count === 1 ? f.name : f.plural}` : line.count === 1 ? f.name : f.plural
  return `${NUMBERS[line.count] ?? line.count} ${one}`
}

/** What a role is for, for the list under the view. */
export const ROLE_NOTES: Record<Role, { label: string; note: string }> = {
  focal: { label: 'Focal', note: 'the big blooms the eye goes to first, low and in the middle' },
  second: { label: 'Second', note: 'smaller blooms round the focal ones, picking up their colors' },
  line: { label: 'Line', note: 'tall stems that give the bouquet its height and outline' },
  filler: { label: 'Filler', note: 'small, airy flowers set just proud of the blooms to soften the gaps' },
  green: { label: 'Greenery', note: 'leaves round the collar that frame the flowers and hide the stems' },
}

export { FLOWERS }
