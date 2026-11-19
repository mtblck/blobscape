/**
 * Cel shading: the light on a picture cut into a few flat tones with clean edges, as an animation cel is painted, in
 * place of light that fades smoothly round a form.
 *
 * Nothing is faked on the finished picture. Each blob is drawn flat in its own color (the `flat` mark), and the engine
 * works out, for each blob, how it faces the light and how much of the light gets to it past what stands in the way
 * (`toneAt` in splat-engine/light.ts and its shader twin). Those two numbers are drawn as a picture of their own, and
 * smoothed a little over the surface they lie on before they are cut into tones: a blob is a disc some pixels across,
 * and cutting first would leave every shadow with an edge of discs.
 *
 * This file is the arithmetic of the cut, the CPU twin of the engine's pass (`CelPass` in splat-engine/celPass.ts):
 * change one, change both.
 */

import { fromOklab, toOklab } from './color.ts'

type Rgb = readonly [number, number, number]

/** How a picture is cel shaded (`Stage.setCel`). */
export interface CelLook {
  /** The way to the light, in the world (it needs no length). Default up, to the right and toward the front. */
  from?: Rgb
  /** How many tones the light is cut into: 2 is light and shade, 3 adds a brighter tone where a surface faces the light squarely (default 2). */
  tones?: 2 | 3
  /** What shade multiplies a color by, sRGB 0–1: a cool violet gray by default, as shadows are painted on a cel. */
  shade?: Rgb
  /** How far the brightest of three tones goes toward white, 0–1 (default 0.2). */
  bright?: number
  /** Whether things cast shadows on one another (default true). Without them a surface is only lit by how it faces the light. */
  shadows?: boolean
  /** How far the light is smoothed over a surface before it is cut into tones, in CSS pixels (default 8): more gives rounder, simpler shadow shapes. */
  smooth?: number
  /** How soft the edge between two tones is, 0–1 (default 0: as crisp as the screen's pixels allow). */
  soft?: number
  /** The outline's width in CSS pixels (default 1.5); 0 draws none. */
  line?: number
  /** The outline's color, sRGB 0–1 (default near black). */
  ink?: Rgb
  /**
   * What the scene's own lights add to a color where they reach it (linear, added to what the tone multiplies it by).
   * Left out, a `Stage` works it out from the lights set on it (`lampTint`); black takes the lamps away.
   */
  lamps?: Rgb
  /** What both tones are multiplied by (linear), such as a night's dim blue. On a `Stage` its ambient light multiplies them too, so a scene that dims dims here. */
  ambient?: Rgb
}

/** The default way to the light. */
export const CEL_FROM: Rgb = [0.45, 0.8, 0.5]
/** The default shade. */
export const CEL_SHADE: Rgb = [0.62, 0.6, 0.8]
/** The default outline color. */
export const CEL_INK: Rgb = [0.09, 0.08, 0.12]

/**
 * A surface is in the light when it faces the light by more than this: its `facing` is half the cosine of the angle
 * between its normal and the way to the light, plus a half, so 0.5 is edge on. A little past edge on, as it is drawn by
 * hand: a surface the light only grazes reads as shade.
 */
export const CEL_TURN = 0.54
/** With three tones, a surface facing the light by this much or more takes the brightest. */
export const CEL_BRIGHT = 0.9
/** A blob is in a cast shadow when less than this share of the light gets to it. */
export const CEL_CAST = 0.5
/** A surface is in a lamp's light when the scene's lamps reach it by this much or more (`toneAt`'s `lamps` in splat-engine/light.ts). */
export const CEL_LAMP = 0.16
/** From this much, what reaches a surface is its own light (a flame, a lit pane): it is never darker than its own color. */
export const CEL_GLOWS = 0.9
/** How strong the color lamps add is, where the lights set no more: the brightest channel of `lampTint`. */
export const LAMP_ADD = 1
/** The least width of a tone's edge, in the units of what is cut (facing and share of light, both 0–1), so the edge is not stepped. */
export const CEL_EDGE = 0.02
/** A blob with no flat side has no facing of its own; where nothing round a pixel has one, it is taken to face the light this much. */
export const CEL_UNSURE = 0.75

const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

/**
 * The tones at a point: `lit` is 0 in shade and 1 in the light, `bright` 1 where the third tone is. `facing` is how
 * the surface faces the light (0 away, 0.5 edge on, 1 toward) and `through` the share of the light that reaches it.
 */
export function celTones(facing: number, through: number, look: CelLook = {}): { lit: number; bright: number } {
  const e = CEL_EDGE + 0.2 * Math.max(0, Math.min(1, look.soft ?? 0))
  const cast = look.shadows === false ? 1 : smooth(CEL_CAST - e, CEL_CAST + e, through)
  const lit = smooth(CEL_TURN - e, CEL_TURN + e, facing) * cast
  const bright = (look.tones ?? 2) > 2 ? lit * smooth(CEL_BRIGHT - e, CEL_BRIGHT + e, facing) : 0
  return { lit, bright }
}

/**
 * A color (linear RGB) under the tones `celTones` gives: `shade` (linear) multiplies it in shade, and the brightest
 * tone goes toward white. `by` is the scene's own light: `ambient` multiplies both tones, `lamps` is added where the
 * scene's lamps reach (`reach`, from `toneAt`: one more tone, cut at `CEL_LAMP`), and from `CEL_GLOWS` the color is
 * never darker than itself.
 */
export function celColor(rgb: ArrayLike<number>, tones: { lit: number; bright: number }, shade: ArrayLike<number>, bright = 0.2, by?: { reach: number; lamps?: ArrayLike<number>; ambient?: ArrayLike<number> }): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0]
  const lamp = by ? smooth(CEL_LAMP - CEL_EDGE, CEL_LAMP + CEL_EDGE, by.reach) : 0, glows = by ? smooth(CEL_GLOWS - CEL_EDGE, CEL_GLOWS + CEL_EDGE, by.reach) : 0
  for (let k = 0; k < 3; k++) {
    let m = (by?.ambient?.[k] ?? 1) * (shade[k] + (1 - shade[k]) * tones.lit) + (by?.lamps?.[k] ?? 0) * lamp
    m += (Math.max(m, 1) - m) * glows
    const c = rgb[k] * m
    out[k] = c + Math.max(1 - c, 0) * bright * tones.bright
  }
  return out
}

/**
 * The color the scene's lamps add in cel shading (linear): the color of its point lights taken together, each by its
 * brightness, with its strongest channel at `LAMP_ADD`. Black where there are none.
 */
export function lampTint(lights: readonly { color: ArrayLike<number>; position?: unknown }[]): [number, number, number] {
  const sum = [0, 0, 0]
  for (const L of lights) if (L.position) for (let k = 0; k < 3; k++) sum[k] += L.color[k]
  const most = Math.max(sum[0], sum[1], sum[2])
  return most > 1e-6 ? [(sum[0] / most) * LAMP_ADD, (sum[1] / most) * LAMP_ADD, (sum[2] / most) * LAMP_ADD] : [0, 0, 0]
}

/** How many times the scene's size away the light's view of it is taken from: far enough that its shadows fall nearly side by side. */
export const SHADOW_FAR = 6

/**
 * Where to stand to see the scene as the light does, for a map of what the light reaches: a narrow view from
 * `SHADOW_FAR` sizes away along the way to the light, round a ball that holds the scene. The ball's middle and size
 * are rounded onto steps of their own, so a scene whose bounds wander as it moves keeps one view, and its shadows
 * keep their pixels. `fov` is in degrees.
 */
export function shadowView(center: ArrayLike<number>, radius: number, from: ArrayLike<number>) {
  // the size, up to the next step of an eighth; the middle, onto a grid an eighth of that
  const r = 1.125 ** Math.ceil(Math.log(Math.max(radius, 1e-6) * 1.05) / Math.log(1.125))
  const g = r / 8
  const target: [number, number, number] = [Math.round(center[0] / g) * g, Math.round(center[1] / g) * g, Math.round(center[2] / g) * g]
  // the grid moved the middle by up to half a step each way: the ball grows to hold the scene still
  const R = r + g
  const len = Math.hypot(from[0], from[1], from[2]) || 1
  const dir = [from[0] / len, from[1] / len, from[2] / len]
  const D = R * SHADOW_FAR
  return {
    eye: [target[0] + dir[0] * D, target[1] + dir[1] * D, target[2] + dir[2] * D] as [number, number, number],
    target,
    // straight overhead there is no up to keep: the view's top is toward the back
    up: (Math.abs(dir[1]) > 0.98 ? [0, 0, -1] : [0, 1, 0]) as [number, number, number],
    fov: (2 * Math.asin(1 / SHADOW_FAR) * 180) / Math.PI,
    near: D - R,
    far: D + R,
    radius: R,
  }
}

/** Two colors of one part nearer than this in OKLab are gathered into one: the mottle of a painted surface, not a stripe. */
export const SAME_COLOR = 0.07

/**
 * Flat fills for a cel: each part's colors gathered into a few, so a mottled or textured surface becomes areas of one
 * color and a stripe, a spot or a white chest stays its own. `color` holds a color a blob (sRGB, 0–1, three numbers
 * each) and `partOf` each blob's part (left out, the blobs are one part); a part keeps at most `most` colors, and
 * fewer where they are within `SAME_COLOR` of one another. The same blobs always give the same colors: the first
 * color of a part is its commonest, and each next the one furthest from those chosen, before a few rounds settle them.
 *
 * With `round` (where each blob is, three numbers each, and how far round it to look), a blob then takes the color most
 * of its part's blobs within that reach have, twice over: speckle finer than the reach goes, and anything wider (a
 * stripe, a patch, a checker) keeps its edge.
 */
export function gatherColors(color: ArrayLike<number>, partOf?: ArrayLike<number>, most = 3, round?: { at: ArrayLike<number>; reach: number }): Float32Array {
  const n = Math.floor(color.length / 3)
  const out = new Float32Array(n * 3)
  // the blobs of each part
  const lists = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const p = partOf ? partOf[i] : 0
    let l = lists.get(p)
    if (!l) lists.set(p, (l = []))
    l.push(i)
  }
  const lab = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) lab.set(toOklab([color[i * 3], color[i * 3 + 1], color[i * 3 + 2]]), i * 3)
  const far = (i: number, c: number[]) => (lab[i * 3] - c[0]) ** 2 + (lab[i * 3 + 1] - c[1]) ** 2 + (lab[i * 3 + 2] - c[2]) ** 2
  for (const list of lists.values()) {
    // a part with very many blobs is settled on every few of them
    const step = Math.max(1, Math.floor(list.length / 4000))
    const mean = [0, 0, 0]
    let m = 0
    for (let j = 0; j < list.length; j += step, m++) for (let k = 0; k < 3; k++) mean[k] += lab[list[j] * 3 + k]
    for (let k = 0; k < 3; k++) mean[k] /= m
    // the first center: the blob nearest the part's mean; then the one furthest from every center so far
    const centers: number[][] = []
    const near = new Float32Array(Math.ceil(list.length / step)).fill(Infinity)
    let pick = -1, best = Infinity
    for (let j = 0; j < list.length; j += step) { const d = far(list[j], mean); if (d < best) { best = d; pick = list[j] } }
    while (centers.length < Math.max(1, most)) {
      const c = [lab[pick * 3], lab[pick * 3 + 1], lab[pick * 3 + 2]]
      centers.push(c)
      let furthest = 0
      for (let j = 0, s = 0; j < list.length; j += step, s++) {
        near[s] = Math.min(near[s], far(list[j], c))
        if (near[s] > furthest) { furthest = near[s]; pick = list[j] }
      }
      // nothing left that is its own color
      if (furthest < SAME_COLOR * SAME_COLOR) break
    }
    const nearest = (i: number) => { let b = 0, bd = Infinity; for (let c = 0; c < centers.length; c++) { const d = far(i, centers[c]); if (d < bd) { bd = d; b = c } } return b }
    for (let turn = 0; turn < 6; turn++) {
      const sum = centers.map(() => [0, 0, 0, 0])
      for (let j = 0; j < list.length; j += step) {
        const s = sum[nearest(list[j])]
        for (let k = 0; k < 3; k++) s[k] += lab[list[j] * 3 + k]
        s[3]++
      }
      sum.forEach((s, c) => { if (s[3]) centers[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]] })
    }
    const flat = centers.map((c) => fromOklab(c))
    let which = Uint8Array.from(list, nearest)
    if (round && round.reach > 0 && centers.length > 1) {
      // the part's blobs in a grid of cells one reach a side: a blob's neighbors are in its cell and the 26 round it
      const { at, reach } = round
      const cellOf = (i: number) => `${Math.floor(at[i * 3] / reach)},${Math.floor(at[i * 3 + 1] / reach)},${Math.floor(at[i * 3 + 2] / reach)}`
      const cells = new Map<string, number[]>()
      list.forEach((i, j) => { const k = cellOf(i); let c = cells.get(k); if (!c) cells.set(k, (c = [])); c.push(j) })
      const votes = new Float32Array(centers.length)
      for (let pass = 0; pass < 2; pass++) {
        const next = new Uint8Array(which.length)
        list.forEach((i, j) => {
          votes.fill(0)
          // its own color counts a little more, so a tie leaves it be
          votes[which[j]] = 0.5
          const cx = Math.floor(at[i * 3] / reach), cy = Math.floor(at[i * 3 + 1] / reach), cz = Math.floor(at[i * 3 + 2] / reach)
          for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const cell = cells.get(`${cx + dx},${cy + dy},${cz + dz}`)
            if (!cell) continue
            for (const o of cell) {
              const q = list[o]
              if ((at[q * 3] - at[i * 3]) ** 2 + (at[q * 3 + 1] - at[i * 3 + 1]) ** 2 + (at[q * 3 + 2] - at[i * 3 + 2]) ** 2 <= reach * reach) votes[which[o]]++
            }
          }
          let b = 0
          for (let c = 1; c < votes.length; c++) if (votes[c] > votes[b]) b = c
          next[j] = b
        })
        which = next
      }
    }
    list.forEach((i, j) => out.set(flat[which[j]], i * 3))
  }
  return out
}
