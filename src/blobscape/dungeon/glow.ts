import type { PointLight } from '../../splat-engine/engine.ts'

/**
 * Calm light for the fight (Matt found it flickery and unnatural with fire on the floor or magic in the air):
 * every light that comes and goes (the orb, bolts, bursts, flames on the floor and on bodies, ice) eases in
 * and out instead of popping, and the floor's many flames and clumps of ice are gathered into a few lights
 * (`gather`), so the engine's light budget is never what decides which of them shine this frame.
 * Pure and tested; the torches don't pass through here.
 */

/** A light the game wants, and what kind it is: lights only ever turn into lights of their own kind. */
export interface Want extends PointLight {
  kind: string
}

interface Held {
  kind: string
  position: [number, number, number]
  color: [number, number, number]
  range: number
  /** Where it is heading; null once its want has gone and it is fading out. */
  want: Want | null
}

/** Seconds for a light to come most of the way up, and to fade most of the way out. */
export const RISE = 0.12
export const FADE = 0.35
/** How far a light can be from the one it was last frame and still be taken for it, meters. */
const SAME = 1.2

const bright = (c: ArrayLike<number>) => c[0] + c[1] + c[2]

export class Glow {
  private held: Held[] = []

  /** Eases toward `wants` by `dt` seconds and returns the lights to draw, brightest first, at most `most`. */
  update(wants: Want[], dt: number, most = Infinity): PointLight[] {
    for (const h of this.held) h.want = null
    // each want takes the nearest held light of its kind not yet taken, or starts dark where it is
    const order = wants.map((w, i) => [i, bright(w.color)] as const).sort((a, b) => b[1] - a[1])
    for (const [i] of order) {
      const w = wants[i]
      let best: Held | null = null, d = SAME
      for (const h of this.held) {
        if (h.want || h.kind !== w.kind) continue
        const e = Math.hypot(h.position[0] - w.position[0], h.position[1] - w.position[1], h.position[2] - w.position[2])
        if (e < d) { d = e; best = h }
      }
      if (best) best.want = w
      else this.held.push({ kind: w.kind, position: [...w.position] as [number, number, number], color: [0, 0, 0], range: w.range, want: w })
    }
    const rise = 1 - Math.exp(-dt / RISE), fade = 1 - Math.exp(-dt / FADE), move = 1 - Math.exp(-dt / 0.08)
    for (const h of this.held) {
      const to = h.want?.color ?? [0, 0, 0]
      const k = bright(to) > bright(h.color) ? rise : fade
      for (let c = 0; c < 3; c++) h.color[c] += (to[c] - h.color[c]) * k
      if (h.want) {
        for (let c = 0; c < 3; c++) h.position[c] += (h.want.position[c] - h.position[c]) * move
        h.range += (h.want.range - h.range) * move
      }
    }
    this.held = this.held.filter((h) => h.want || bright(h.color) > 0.02)
    return [...this.held].sort((a, b) => bright(b.color) - bright(a.color)).slice(0, most)
      .map((h) => ({ position: [...h.position] as [number, number, number], color: [...h.color] as [number, number, number], range: h.range }))
  }

  /** Forgets every light (a new fight). */
  clear() { this.held = [] }
}

/**
 * Gathers lights of one kind that stand close together into at most `most` lights: each at the brightness-weighted
 * middle of its group, as bright as the brightest in it and a little more for the rest (a patch of fire lights
 * the floor more than one flame, but not ten times more), and reaching a little further.
 */
export function gather(lights: Want[], most: number, near = 1.6): Want[] {
  const left = [...lights].sort((a, b) => bright(b.color) - bright(a.color))
  const out: Want[] = []
  while (left.length && out.length < most) {
    const seed = left.shift()!
    const group = [seed, ...left.filter((l) => Math.hypot(l.position[0] - seed.position[0], l.position[2] - seed.position[2]) < near)]
    for (const g of group.slice(1)) left.splice(left.indexOf(g), 1)
    const w = group.reduce((s, l) => s + bright(l.color), 0) || 1
    const at = [0, 1, 2].map((c) => group.reduce((s, l) => s + l.position[c] * bright(l.color), 0) / w) as [number, number, number]
    const more = 1 + 0.35 * Math.log2(group.length)
    out.push({ kind: seed.kind, position: at, color: seed.color.map((c) => c * more) as [number, number, number], range: Math.max(...group.map((l) => l.range)) * (1 + 0.15 * Math.log2(group.length)) })
  }
  return out
}
