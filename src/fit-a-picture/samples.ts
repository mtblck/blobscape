/**
 * Sample pictures, drawn in code pixel by pixel so there are no image files
 * or licences, and the tests can use them in Node. Each returns RGB floats
 * in [0, 1], `width` × `height`, row-major.
 */

export type Sample = { id: string; name: string; aspect: number; draw: (x: number, y: number) => [number, number, number] }

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t) as [number, number, number]
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number]

export const SAMPLES: Sample[] = [
  {
    // Soft gradients and one hard horizon: what blobs find easy, then hard
    id: 'sunset',
    name: 'Sunset',
    aspect: 4 / 3,
    draw: (x, y) => {
      const sky = y < 0.45 ? mix(hex('#2b1f5c'), hex('#f2708a'), y / 0.45) : mix(hex('#f2708a'), hex('#ffc46b'), (y - 0.45) / 0.25)
      const sunD = Math.hypot(x - 0.62, (y - 0.58) * 1.1)
      let c = mix(sky, hex('#fff1c2'), 1 - smooth(0.11, 0.125, sunD))
      const ridge = 0.66 + 0.05 * Math.sin(x * 9) + 0.03 * Math.sin(x * 23 + 1)
      if (y > ridge) c = mix(hex('#3a2340'), hex('#1b1226'), smooth(ridge, 1, y))
      const sea = 0.82
      if (y > sea) c = mix(hex('#2a2a55'), hex('#120f22'), (y - sea) / 0.18)
      return c
    },
  },
  {
    // Shaded balls: round, smooth shapes that blobs fit in a few hundred steps
    id: 'marbles',
    name: 'Marbles',
    aspect: 1,
    draw: (x, y) => {
      let c = mix(hex('#e9e2d4'), hex('#c9bfae'), y)
      const balls: [number, number, number, string][] = [
        [0.3, 0.35, 0.18, '#d94f3d'],
        [0.68, 0.3, 0.13, '#3d7fd9'],
        [0.55, 0.68, 0.2, '#e8b33a'],
        [0.22, 0.75, 0.1, '#3aa676'],
      ]
      for (const [bx, by, r, col] of balls) {
        // shadow, then the ball lit from the top left
        const sh = Math.hypot((x - bx - r * 0.25) / 1.4, y - by - r * 0.85)
        c = mix(c, hex('#8d8476'), 0.5 * (1 - smooth(r * 0.45, r * 0.9, sh)))
        const d = Math.hypot(x - bx, y - by) / r
        if (d < 1) {
          const nz = Math.sqrt(1 - d * d)
          const light = Math.max(0, (-(x - bx) / r) * 0.5 + (-(y - by) / r) * 0.6 + nz * 0.62)
          const base = hex(col)
          c = mix(c, base.map((v) => v * (0.25 + 0.85 * light)), smooth(1, 0.96, d))
          const spec = Math.hypot(x - (bx - r * 0.35), y - (by - r * 0.4)) / r
          c = mix(c, [1, 1, 1], 0.8 * (1 - smooth(0, 0.22, spec)))
        }
      }
      return c
    },
  },
  {
    // Hard edges and flat colour, the opposite of a blob: watch them line up along the edges
    id: 'blocks',
    name: 'Blocks',
    aspect: 1,
    draw: (x, y) => {
      const line = (v: number, at: number) => Math.abs(v - at) < 0.018
      if (line(x, 0.32) || line(y, 0.62) || (x > 0.32 && line(y, 0.28)) || (y > 0.62 && line(x, 0.78)) || (x < 0.32 && line(y, 0.4)))
        return hex('#1d1a17')
      if (x < 0.32 && y < 0.4) return hex('#f2c230')
      if (x > 0.32 && y < 0.28) return hex('#2f5fb3')
      if (x > 0.78 && y > 0.62) return hex('#d2392b')
      return hex('#f4efe4')
    },
  },
  {
    // Rings get finer towards the edge, so you can see where the blob budget runs out
    id: 'rings',
    name: 'Rings',
    aspect: 1,
    draw: (x, y) => {
      const d = Math.hypot(x - 0.5, y - 0.5)
      const t = 0.5 + 0.5 * Math.cos(d * d * 140)
      return mix(hex('#173d3a'), hex('#9fe0c9'), t)
    },
  },
]

export function drawSample(s: Sample, width: number, height: number) {
  const out = new Float32Array(width * height * 3)
  // 2×2 samples per pixel, so hard edges are anti-aliased like a photo's
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0
      for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const c = s.draw((x + ox) / width, (y + oy) / height)
        r += c[0]
        g += c[1]
        b += c[2]
      }
      const k = (y * width + x) * 3
      out[k] = r / 4
      out[k + 1] = g / 4
      out[k + 2] = b / 4
    }
  }
  return out
}

/** The training size for a picture of this aspect: the long side is `long` pixels. */
export function fitSize(aspect: number, long: number) {
  return aspect >= 1 ? { width: long, height: Math.max(8, Math.round(long / aspect)) } : { width: Math.max(8, Math.round(long * aspect)), height: long }
}
