import { Blobs, quatFacing, type Vec3 } from './blobs.ts'
import type { Preset } from './presets.ts'

/** A point on a surface with its outward normal and colour. */
export interface Sample { p: Vec3; n: Vec3; c: Vec3 }

export type ShapeId = 'sphere' | 'torus' | 'cube'

export const SHAPES: { id: ShapeId; name: string; area: number }[] = [
  { id: 'sphere', name: 'Sphere', area: 4 * Math.PI * 0.8 ** 2 },
  { id: 'torus', name: 'Ring', area: 4 * Math.PI ** 2 * 0.65 * 0.28 },
  { id: 'cube', name: 'Cube', area: 6 * 1.2 ** 2 },
]

/**
 * The R2 sequence: point i of an even 2D spread over the unit square, where
 * any prefix of the sequence is also evenly spread (unlike a grid or a
 * Fibonacci spiral, whose first points bunch up at one end).
 */
const r2 = (i: number): [number, number] => [(0.5 + i * 0.7548776662466927) % 1, (0.5 + i * 0.5698402909980532) % 1]

/**
 * `n` points spread over a shape's surface. Any prefix of the list is also
 * spread out, so the "many blobs" lesson can show 10 or 10,000 from one list.
 */
export function sampleShape(id: ShapeId, n: number): Sample[] {
  const out: Sample[] = []
  for (let i = 0; i < n; i++) {
    const [u, v] = r2(i)
    if (id === 'sphere') {
      // Uniform in height and angle is uniform over a sphere's area (Archimedes)
      const y = 1 - 2 * u
      const r = Math.sqrt(1 - y * y)
      const t = v * Math.PI * 2
      const nn: Vec3 = [Math.cos(t) * r, y, Math.sin(t) * r]
      out.push({ p: [nn[0] * 0.8, nn[1] * 0.8 + 0.8, nn[2] * 0.8], n: nn, c: shade([0.36, 0.62, 0.95], nn) })
    } else if (id === 'torus') {
      const a = u * Math.PI * 2, b = v * Math.PI * 2
      const R = 0.65, r = 0.28
      const nn: Vec3 = [Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)]
      out.push({ p: [Math.cos(a) * (R + r * Math.cos(b)), 0.8 + r * Math.sin(b), Math.sin(a) * (R + r * Math.cos(b))], n: nn, c: shade([0.95, 0.62, 0.3], nn) })
    } else {
      // Six faces in turn, each with its own run of the sequence
      const face = i % 6
      const [fu, fv] = r2(Math.floor(i / 6))
      const axis = face >> 1, sign = face & 1 ? -1 : 1
      const s = 0.6
      const p: Vec3 = [0, 0, 0], nn: Vec3 = [0, 0, 0]
      p[axis] = sign * s
      nn[axis] = sign
      p[(axis + 1) % 3] = (fu * 2 - 1) * s
      p[(axis + 2) % 3] = (fv * 2 - 1) * s
      p[1] += 0.8
      const faceColours: Vec3[] = [[0.9, 0.35, 0.3], [0.35, 0.75, 0.45], [0.95, 0.8, 0.3]]
      out.push({ p, n: nn, c: shade(faceColours[axis], nn) })
    }
  }
  return out
}

const LIGHT: Vec3 = [-0.45, 0.75, 0.5]
/** Half-Lambert shading baked into the colour, as a capture would have it. */
function shade(c: Vec3, n: Vec3): Vec3 {
  const l = Math.hypot(...LIGHT)
  const d = (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / l
  const k = 0.45 + 0.55 * (d * 0.5 + 0.5)
  return [c[0] * k, c[1] * k, c[2] * k]
}

/**
 * Turns surface samples into blobs. `flat` lays each one on the surface as a
 * thin disc (what trained captures end up with); otherwise they're round balls.
 */
export function blobsFromSamples(samples: Sample[], size: number, flat: boolean, opacity = 0.95): Blobs {
  const b = new Blobs(samples.length)
  for (const s of samples) {
    b.push({ centre: s.p, scale: [size, size, flat ? size * 0.15 : size], quat: quatFacing(s.n), colour: s.c, opacity })
  }
  return b
}

/** The samples from Splat to Sprite, built into a `Blobs` list instead of Spark's packed array. */
export function blobsFromPreset(preset: Preset): Blobs {
  const b = new Blobs(40000)
  // The presets only ever call pushSplat, so a stand-in collects them.
  const sink = {
    pushSplat(c: { x: number; y: number; z: number }, s: { x: number; y: number; z: number }, q: { x: number; y: number; z: number; w: number }, opacity: number, col: { r: number; g: number; b: number }) {
      b.push({ centre: [c.x, c.y, c.z], scale: [s.x, s.y, s.z], quat: [q.x, q.y, q.z, q.w], colour: [col.r, col.g, col.b], opacity })
    },
  }
  preset.build(sink as never)
  return b
}
