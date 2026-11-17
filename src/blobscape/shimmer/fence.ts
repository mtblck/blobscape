/**
 * Why small blobs shimmer (lesson 21): a wire fence drawn as 2D blobs on a
 * small grid of pixels, so each pixel shows. Pure, tested.
 *
 * A pixel looks at one point, its middle: α = opacity · exp(−½ dᵀ Σ⁻¹ d).
 * A blob thinner than a pixel is caught or missed as it slides between pixel
 * middles, so it blinks. Renderers blur every blob on screen by a little
 * (`blur`, a standard deviation in pixels: 3DGS adds 0.3 px² to Σ), which
 * stops the blinking, but a far wire blurred to a pixel wide and still drawn
 * solid covers far more than it should. Fading each blob by as much as the
 * blur spread it (`fade`: opacity · √(det Σ / det Σ′), Mip-Splatting's 2D
 * filter, Spark's "antialiased") keeps its total right.
 *
 * The truth is the same blobs without either, each pixel the average of
 * SUPER × SUPER points across it, which is what the pixel really covers.
 */

export const W = 160
export const H = 96
/** Pixels per meter at one meter away. */
const FOCAL = 100
/** Points a side per pixel for the truth. */
export const SUPER = 8
/** Where the drift slides the fence to and fro, in pixels. */
export const DRIFT = 3
/** The steps across one pixel that the measures look at. */
const STEPS = 8
export const SKY: [number, number, number] = [0.015, 0.02, 0.045]

export interface Blob2 { x: number; y: number; sx: number; sy: number; angle: number; color: [number, number, number]; opacity: number }

const WOOD: [number, number, number] = [0.78, 0.55, 0.32]
const WIRE: [number, number, number] = [0.86, 0.88, 0.92]

/** A post-and-wire fence, eight meters long, 1.2 high; posts 6 cm wide, wires 2 cm. */
export function fence(): Blob2[] {
  const out: Blob2[] = []
  for (let i = 0; i <= 8; i++) {
    const x = i - 4
    // a post is a stack of blobs, so it has ends rather than fading out
    for (let k = 0; k < 6; k++) out.push({ x, y: 0.1 + k * 0.2, sx: 0.03, sy: 0.09, angle: 0, color: WOOD, opacity: 0.9 })
  }
  for (const h of [0.35, 0.7, 1.05]) {
    for (let i = 0; i < 8; i++) {
      // each span sags a little between posts, in two pieces
      for (const half of [0.25, 0.75]) {
        const x = i - 4 + half
        const sag = 0.03 * Math.sin(Math.PI * half)
        out.push({ x, y: h - sag, sx: 0.2, sy: 0.01, angle: (half < 0.5 ? -1 : 1) * Math.atan2(0.03 * Math.PI * 0.5 * Math.cos(Math.PI * half), 1) * -1, color: WIRE, opacity: 0.9 })
      }
    }
  }
  return out
}

export interface Draw {
  /** How far away the fence is, meters. */
  distance: number
  /** Shift in pixels, across and down. */
  dx: number
  dy?: number
  /** Blur added to every blob on screen, as a standard deviation in pixels. */
  blur: number
  /** Fade each blob by as much as the blur spread it. */
  fade: boolean
}

export interface Picture { rgb: Float32Array; cover: Float32Array }

interface Screen { cx: number; cy: number; a: number; b: number; c: number; o: number; rx: number; ry: number; color: [number, number, number] }

/** A blob on screen: middle, inverse covariance (a b; b c), opacity, and how far out it reaches. */
function onScreen(f: Blob2, d: Draw): Screen | null {
  const s = FOCAL / d.distance
  const cos = Math.cos(f.angle), sin = Math.sin(f.angle)
  const vx = (f.sx * s) ** 2, vy = (f.sy * s) ** 2
  let xx = cos * cos * vx + sin * sin * vy, xy = cos * sin * (vx - vy), yy = sin * sin * vx + cos * cos * vy
  const det0 = xx * yy - xy * xy
  const blur2 = d.blur * d.blur
  xx += blur2; yy += blur2
  const det = xx * yy - xy * xy
  if (!(det > 0)) return null
  const o = f.opacity * (d.fade ? Math.sqrt(det0 / det) : 1)
  // reach: where it falls under 1/255
  const k = Math.sqrt(2 * Math.log(255 * Math.max(o, 1e-6)))
  if (!(k > 0)) return null
  return { cx: W / 2 + f.x * s + d.dx, cy: H / 2 - (f.y - 0.6) * s + (d.dy ?? 0), a: yy / det, b: -xy / det, c: xx / det, o, rx: k * Math.sqrt(xx), ry: k * Math.sqrt(yy), color: f.color }
}

/**
 * Draws the blobs over the sky, sampling each pixel at `n` × `n` points
 * (1: its middle, as a renderer does) and averaging.
 */
export function draw(blobs: readonly Blob2[], d: Draw, n = 1): Picture {
  const rgb = new Float32Array(W * H * 3), cover = new Float32Array(W * H)
  const shown = blobs.map((f) => onScreen(f, d)).filter((s): s is Screen => !!s)
  // one buffer of transmittance and color per sample point, row by row
  const m = n * n
  const T = new Float32Array(W * m), C = new Float32Array(W * m * 3)
  for (let y = 0; y < H; y++) {
    T.fill(1); C.fill(0)
    for (const s of shown) {
      if (y + 1 < s.cy - s.ry || y > s.cy + s.ry) continue
      const x0 = Math.max(0, Math.floor(s.cx - s.rx)), x1 = Math.min(W - 1, Math.ceil(s.cx + s.rx))
      for (let x = x0; x <= x1; x++) {
        for (let j = 0; j < n; j++) {
          const py = y + (j + 0.5) / n - s.cy
          for (let i = 0; i < n; i++) {
            const px = x + (i + 0.5) / n - s.cx
            const q = s.a * px * px + 2 * s.b * px * py + s.c * py * py
            if (q > 25) continue
            const alpha = Math.min(0.99, s.o * Math.exp(-0.5 * q))
            if (alpha < 1 / 255) continue
            const k = x * m + j * n + i
            const w = alpha * T[k]
            C[k * 3] += w * s.color[0]; C[k * 3 + 1] += w * s.color[1]; C[k * 3 + 2] += w * s.color[2]
            T[k] *= 1 - alpha
          }
        }
      }
    }
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, t = 0
      for (let k = x * m; k < x * m + m; k++) { r += C[k * 3] + T[k] * SKY[0]; g += C[k * 3 + 1] + T[k] * SKY[1]; b += C[k * 3 + 2] + T[k] * SKY[2]; t += T[k] }
      const p = y * W + x
      rgb[p * 3] = r / m; rgb[p * 3 + 1] = g / m; rgb[p * 3 + 2] = b / m
      cover[p] = 1 - t / m
    }
  }
  return { rgb, cover }
}

/** The truth: the blobs as they are, each pixel averaged over its whole area. */
export const truth = (blobs: readonly Blob2[], distance: number, dx: number, dy = 0) => draw(blobs, { distance, dx, dy, blur: 0, fade: false }, SUPER)

export interface Measures {
  /** How much the pixels blink as the fence slides across one pixel, beyond what the truth does, as a share of what's there. */
  flicker: number
  /** How much the fence covers, as a share of what it really covers (1 is right). */
  weight: number
}

/** The slide the measures look at: one pixel across and half a pixel down, in even steps. */
const step = (k: number) => ({ dx: k / STEPS, dy: k / (2 * STEPS) })

/** The truth at each step of the slide: it depends on the distance alone, so keep it. */
export function truthSteps(blobs: readonly Blob2[], distance: number): Float32Array[] {
  return Array.from({ length: STEPS }, (_, k) => truth(blobs, distance, step(k).dx, step(k).dy).cover)
}

const TILE = 4
/** Coverage added up over small squares of pixels. */
function tiles(cover: Float32Array): Float64Array {
  const tw = W / TILE
  const out = new Float64Array(tw * (H / TILE))
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[Math.floor(y / TILE) * tw + Math.floor(x / TILE)] += cover[y * W + x]
  return out
}

/** Points a side per pixel for the smooth drawing the blink is judged against. */
const SMOOTH = 4

/**
 * Flicker and weight for these settings against the truth's steps. Drawn the
 * same way but with each pixel averaged over its area, the fence slides
 * smoothly; flicker is how far each small square's coverage swings beyond
 * that, over all the fence there is. So blur counts only for what it does to
 * the blinking, not for being blurrier than the truth. Weight is how much the
 * drawing covers beside the truth.
 */
export function measure(blobs: readonly Blob2[], d: Omit<Draw, 'dx' | 'dy'>, real: Float32Array[]): Measures {
  const mine = Array.from({ length: STEPS }, (_, k) => tiles(draw(blobs, { ...d, ...step(k) }).cover))
  const smooth = Array.from({ length: STEPS }, (_, k) => tiles(draw(blobs, { ...d, ...step(k) }, SMOOTH).cover))
  const truthTiles = real.map(tiles)
  let wiggle = 0, sumMine = 0, sumReal = 0
  for (let t = 0; t < truthTiles[0].length; t++) {
    let mm = 0, sm = 0, rm = 0
    for (let k = 0; k < STEPS; k++) { mm += mine[k][t]; sm += smooth[k][t]; rm += truthTiles[k][t] }
    mm /= STEPS; sm /= STEPS; rm /= STEPS
    for (let k = 0; k < STEPS; k++) wiggle += Math.abs(mine[k][t] - mm - (smooth[k][t] - sm))
    sumMine += mm; sumReal += rm
  }
  return { flicker: sumReal ? wiggle / (STEPS * sumReal) : 0, weight: sumReal ? sumMine / sumReal : 1 }
}
