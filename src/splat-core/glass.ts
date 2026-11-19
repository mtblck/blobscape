/**
 * Stained glass (Matt picked it, 2026-11-19): a scene drawn as a leaded window. Every surface is cut into panes of
 * flat colored glass that stay on it as the view turns, with lead between the panes, round every part, wherever
 * the color changes and round the subject, and the light comes from behind. The arithmetic here is pure; `splat-engine/glassPass.ts` is its
 * shader twin (change both).
 */

/** How a stage draws stained glass (`Stage.setGlass`). */
export interface GlassLook {
  /** How big a pane is, as a share of the scene's size (0.06). */
  pane?: number
  /** How wide the lead is, in CSS pixels (3). */
  lead?: number
  /** The lead's color (sRGB 0–1). */
  ink?: readonly [number, number, number]
  /** The window round the subject, top and bottom (sRGB 0–1): empty pixels are panes of these. Left out, pale blue over warm white. */
  sky?: readonly [readonly [number, number, number], readonly [number, number, number]]
  /** Where the light behind the window is brightest, across and down the picture (0–1; [0.5, 0.3]). */
  light?: readonly [number, number]
  /** How much brighter the glass is at the light than far from it: 0 lights the window evenly (0.5). */
  shine?: number
  /** How much one pane's glass differs from the next's, 0 to 1 (0.5). */
  vary?: number
}

/** Glass is richer than paint: its color is made this much stronger about its gray. */
export const GLASS_RICH = 1.45
/** And lighter, since the light comes through it: its color is raised to this power (under 1 lightens). */
export const GLASS_LIFT = 0.8
/** One pane's glass is lighter or darker than the next's by up to this share, at full `vary`. */
export const GLASS_VARY = 0.3
/** The window round the subject is cut into panes this many times a scene pane's size on screen, as a share of the picture's height. */
export const GLASS_SKY_PANE = 0.11
/** Lead also runs where the picture's own color (linear) changes by more than this from one pixel to one a lead's width away. */
export const GLASS_JUMP = 0.18
/** The lead (sRGB 0–1): near black, a little warm. */
export const GLASS_LEAD: readonly [number, number, number] = [0.07, 0.06, 0.06]
/** The window with no sky of the subject's own, top and bottom (sRGB 0–1). */
export const GLASS_SKY: readonly [readonly [number, number, number], readonly [number, number, number]] = [[0.5, 0.72, 0.9], [0.98, 0.9, 0.7]]

const fract = (x: number) => x - Math.floor(x)
/** A number from 0 to 1 for a grid cell, different for each `salt`. */
export function cellHash(x: number, y: number, z: number, salt: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + salt * 19.19) * 43758.5453)
}

/** Where a grid cell's pane has its middle: somewhere in the cell. */
export function seedOf(x: number, y: number, z: number): [number, number, number] {
  return [x + cellHash(x, y, z, 1), y + cellHash(x, y, z, 2), z + cellHash(x, y, z, 3)]
}

/**
 * The pane a point is in, with panes one unit across: the grid cell whose seed is nearest (`cell`, `seed`) and how
 * far the point is from the nearest other pane (`edge`: its distance to the plane halfway between the two seeds).
 * Lead is drawn where `edge` is under half the lead's width.
 */
export function paneOf(p: readonly number[]): { cell: [number, number, number]; seed: [number, number, number]; edge: number } {
  const base = [Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2])]
  let best = Infinity, cell: [number, number, number] = [0, 0, 0], seed: [number, number, number] = [0, 0, 0]
  const all: [number, number, number][] = []
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const c: [number, number, number] = [base[0] + dx, base[1] + dy, base[2] + dz], s = seedOf(c[0], c[1], c[2])
    all.push(s)
    const d = (s[0] - p[0]) ** 2 + (s[1] - p[1]) ** 2 + (s[2] - p[2]) ** 2
    if (d < best) { best = d; cell = c; seed = s }
  }
  let edge = Infinity
  for (const s of all) {
    if (s === seed) continue
    const w = [s[0] - seed[0], s[1] - seed[1], s[2] - seed[2]], len = Math.hypot(w[0], w[1], w[2])
    if (!(len > 1e-6)) continue
    const mid = [(s[0] + seed[0]) / 2, (s[1] + seed[1]) / 2, (s[2] + seed[2]) / 2]
    edge = Math.min(edge, ((mid[0] - p[0]) * w[0] + (mid[1] - p[1]) * w[1] + (mid[2] - p[2]) * w[2]) / len)
  }
  return { cell, seed, edge }
}

/** A color (linear, 0–1) as glass with the light behind it: richer and lighter. */
export function glassColor(rgb: readonly number[]): [number, number, number] {
  const gray = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
  const one = (x: number) => Math.min(1, Math.max(0, gray + (x - gray) * GLASS_RICH)) ** GLASS_LIFT
  return [one(rgb[0]), one(rgb[1]), one(rgb[2])]
}

/** What a pane's glass is multiplied by: each pane a little lighter or darker than the next, by its cell. */
export function paneTint(cell: readonly number[], vary = 0.5): number {
  return 1 + (cellHash(cell[0], cell[1], cell[2], 4) - 0.5) * 2 * GLASS_VARY * vary
}

/** How bright the light behind the window is at a place in the picture (`at` and `light` across and down, 0–1; `aspect` is width over height): 1 at the light, falling to 1 − `shine` far from it. */
export function backLight(at: readonly number[], light: readonly number[], shine = 0.5, aspect = 1): number {
  const d = Math.hypot((at[0] - light[0]) * aspect, at[1] - light[1])
  return 1 - shine * (1 - Math.exp(-d * d * 2.2))
}
