import { emptyModel, logit, rng, type Model } from './train3d.ts'

/**
 * The thing being photographed: a little toy bird made of the same round
 * blobs the trainer uses. Its front and back differ on purpose (a face and
 * a cream belly in front, a red tail and a blue stripe behind) so a fit from
 * one side can't guess the other.
 */

type V3 = [number, number, number]
const YELLOW: V3 = [0.96, 0.74, 0.16]
const CREAM: V3 = [0.98, 0.93, 0.8]
const BLUE: V3 = [0.2, 0.42, 0.9]
const RED: V3 = [0.9, 0.2, 0.18]
const ORANGE: V3 = [0.98, 0.5, 0.1]
const WHITE: V3 = [0.97, 0.97, 0.97]
const DARK: V3 = [0.08, 0.08, 0.1]

interface Part { centre: V3; radius: V3; count: number; size: number; colour: (p: V3, n: V3) => V3 }

export function subject(seed = 5): Model {
  const parts: Part[] = [
    // Body: cream belly in front, a blue stripe down the back
    { centre: [0, -0.15, 0], radius: [0.48, 0.44, 0.52], count: 520, size: 0.06, colour: (_p, n) => (n[2] > 0.35 && n[1] < 0.5 ? CREAM : n[2] < -0.3 && Math.abs(n[0]) < 0.3 ? BLUE : YELLOW) },
    // Head
    { centre: [0, 0.42, 0.1], radius: [0.31, 0.3, 0.3], count: 260, size: 0.055, colour: () => YELLOW },
    // Wings, blue, on both sides
    { centre: [0.47, -0.12, -0.05], radius: [0.08, 0.26, 0.34], count: 70, size: 0.055, colour: () => BLUE },
    { centre: [-0.47, -0.12, -0.05], radius: [0.08, 0.26, 0.34], count: 70, size: 0.055, colour: () => BLUE },
    // Tail, sticking up and back
    { centre: [0, 0.02, -0.6], radius: [0.16, 0.2, 0.14], count: 60, size: 0.05, colour: () => RED },
    // Beak
    { centre: [0, 0.38, 0.43], radius: [0.08, 0.06, 0.1], count: 24, size: 0.035, colour: () => ORANGE },
    // Eyes and pupils
    { centre: [0.12, 0.5, 0.36], radius: [0.06, 0.06, 0.03], count: 12, size: 0.03, colour: () => WHITE },
    { centre: [-0.12, 0.5, 0.36], radius: [0.06, 0.06, 0.03], count: 12, size: 0.03, colour: () => WHITE },
    { centre: [0.12, 0.5, 0.39], radius: [0.03, 0.03, 0.01], count: 5, size: 0.022, colour: () => DARK },
    { centre: [-0.12, 0.5, 0.39], radius: [0.03, 0.03, 0.01], count: 5, size: 0.022, colour: () => DARK },
  ]
  const total = parts.reduce((s, p) => s + p.count, 0)
  const m = emptyModel(total)
  const r = rng(seed)
  let i = 0
  for (const part of parts) {
    for (let k = 0; k < part.count; k++, i++) {
      // Even spread over the part's surface (a Fibonacci sphere, stretched), with a little jitter
      const t = (k + 0.5) / part.count
      const y = 1 - 2 * t
      const ring = Math.sqrt(Math.max(0, 1 - y * y))
      const phi = k * 2.399963 + r() * 0.3
      const n: V3 = [ring * Math.sin(phi), y, ring * Math.cos(phi)]
      const p: V3 = [part.centre[0] + n[0] * part.radius[0], part.centre[1] + n[1] * part.radius[1], part.centre[2] + n[2] * part.radius[2]]
      m.pos.set(p, i * 3)
      m.logS[i] = Math.log(part.size)
      const c = part.colour(p, n)
      // Pull colours a hair in from 0 and 1 so the sigmoid can hold them
      m.col.set(c.map((v) => logit(Math.min(0.985, Math.max(0.015, v)))), i * 3)
      m.op[i] = logit(0.95)
    }
  }
  return m
}
