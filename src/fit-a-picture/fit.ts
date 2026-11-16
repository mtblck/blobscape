/**
 * Fit a picture with 2D Gaussians, the way a splat capture is trained:
 * render the blobs, compare with the photo, push the error back through the
 * renderer as gradients, take an Adam step, and now and then prune weak blobs
 * and add new ones where the picture is still wrong.
 *
 * A flat picture has no depth to sort by, so the blobs simply add up
 * (pixel = Σ opacity·color·falloff), as in GaussianImage (Zhang et al., 2024).
 * Everything else is the 3DGS loop.
 *
 * Plain TypeScript on typed arrays: runs in a worker in the page and in Node
 * for the tests. Images are RGB floats in [0, 1], row-major.
 */

/** Parameters per blob: center x, y (px); log scale along its two axes; angle; raw color r, g, b; raw opacity. */
export const P = 9
const X = 0, Y = 1, SX = 2, SY = 3, TH = 4, R = 5, G = 6, B = 7, O = 8

/** Blobs are drawn out to this many standard deviations; past it the falloff is under 0.2%. */
const REACH = 3.5
const REACH_Q = REACH * REACH
const MIN_LOG_SCALE = Math.log(0.35)

const sigmoid = (v: number) => 1 / (1 + Math.exp(-v))
const logit = (p: number) => Math.log(p / (1 - p))

export type Rng = () => number

/** Small seeded PRNG (mulberry32), so a run can be repeated and tests are stable. */
export function rng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Rates = { position: number; scale: number; angle: number; color: number; opacity: number }

/** Adam step sizes per parameter group, tuned on the samples (see fit.test.ts). */
export const BASE_RATES: Rates = { position: 0.15, scale: 0.012, angle: 0.02, color: 0.04, opacity: 0.03 }

export class Fitter {
  readonly width: number
  readonly height: number
  readonly target: Float32Array
  /** Blob parameters, P floats per blob; only the first `count` blobs are live. */
  params: Float32Array
  count = 0
  iteration = 0
  /** Learning-rate multiplier the page's slider sets. */
  rate = 1
  private m: Float32Array
  private v: Float32Array
  /** Adam's step counter per blob, so a newly added blob gets a fresh bias correction. */
  private age: Uint32Array
  private grad: Float32Array
  /** Running |gradient| of each blob's position: where 3DGS decides to densify. */
  readonly out: Float32Array
  private residual: Float32Array
  private maxLogScale: number

  constructor(target: Float32Array, width: number, height: number, capacity = 8192) {
    if (target.length !== width * height * 3) throw new Error('target must be width × height × 3')
    this.width = width
    this.height = height
    this.target = target
    this.params = new Float32Array(capacity * P)
    this.m = new Float32Array(capacity * P)
    this.v = new Float32Array(capacity * P)
    this.grad = new Float32Array(capacity * P)
    this.age = new Uint32Array(capacity)
    this.out = new Float32Array(width * height * 3)
    this.residual = new Float32Array(width * height * 3)
    this.maxLogScale = Math.log(Math.max(width, height) / 2)
  }

  get capacity() {
    return this.params.length / P
  }

  /** Throw away every blob and scatter `n` new ones at random: the "noise" a fit starts from. */
  seed(n: number, random: Rng) {
    this.count = 0
    this.iteration = 0
    n = Math.min(n, this.capacity)
    // Size the blobs so together they roughly cover the picture once
    const s = Math.sqrt((this.width * this.height) / n) * 0.6
    for (let i = 0; i < n; i++) {
      const sx = s * (0.6 + random() * 0.8)
      const sy = s * (0.6 + random() * 0.8)
      this.add(
        random() * this.width,
        random() * this.height,
        sx,
        sy,
        random() * Math.PI,
        [random(), random(), random()],
        0.3 + random() * 0.4,
      )
    }
  }

  /** Add one blob. Color and opacity are in [0, 1]; returns false when full. */
  add(x: number, y: number, sx: number, sy: number, angle: number, rgb: ArrayLike<number>, opacity: number) {
    if (this.count >= this.capacity) return false
    const i = this.count++
    const p = this.params
    const o = i * P
    const clampC = (c: number) => Math.min(0.97, Math.max(0.03, c))
    p[o + X] = x
    p[o + Y] = y
    p[o + SX] = Math.min(this.maxLogScale, Math.max(MIN_LOG_SCALE, Math.log(sx)))
    p[o + SY] = Math.min(this.maxLogScale, Math.max(MIN_LOG_SCALE, Math.log(sy)))
    p[o + TH] = angle
    p[o + R] = logit(clampC(rgb[0]))
    p[o + G] = logit(clampC(rgb[1]))
    p[o + B] = logit(clampC(rgb[2]))
    p[o + O] = logit(Math.min(0.99, Math.max(0.01, opacity)))
    this.m.fill(0, o, o + P)
    this.v.fill(0, o, o + P)
    this.age[i] = 0
    return true
  }

  /** Remove blob i by moving the last live blob into its place. */
  private removeAt(i: number) {
    const last = --this.count
    if (i === last) return
    this.params.copyWithin(i * P, last * P, last * P + P)
    this.m.copyWithin(i * P, last * P, last * P + P)
    this.v.copyWithin(i * P, last * P, last * P + P)
    this.age[i] = this.age[last]
  }

  /** A blob's opacity, in [0, 1]. */
  opacity(i: number) {
    return sigmoid(this.params[i * P + O])
  }

  /** A blob as the page draws it: center, the two standard deviations, angle, color, opacity. */
  blob(i: number) {
    const p = this.params
    const o = i * P
    return {
      x: p[o + X], y: p[o + Y],
      sx: Math.exp(p[o + SX]), sy: Math.exp(p[o + SY]), angle: p[o + TH],
      r: sigmoid(p[o + R]), g: sigmoid(p[o + G]), b: sigmoid(p[o + B]),
      opacity: sigmoid(p[o + O]),
    }
  }

  /**
   * Draw the blobs into `out` (RGB floats, (width·scale) × (height·scale)).
   * The training pass uses scale 1; the page draws a sharper copy for display.
   */
  render(out: Float32Array, scale = 1) {
    const W = Math.round(this.width * scale)
    const H = Math.round(this.height * scale)
    out.fill(0, 0, W * H * 3)
    const p = this.params
    for (let i = 0; i < this.count; i++) {
      const o = i * P
      const g = geometry(p, o, scale)
      if (!g) continue
      const a = sigmoid(p[o + O])
      const cr = sigmoid(p[o + R]) * a, cg = sigmoid(p[o + G]) * a, cb = sigmoid(p[o + B]) * a
      const x0 = Math.max(0, Math.floor(g.cx - g.ex)), x1 = Math.min(W - 1, Math.ceil(g.cx + g.ex))
      const y0 = Math.max(0, Math.floor(g.cy - g.ey)), y1 = Math.min(H - 1, Math.ceil(g.cy + g.ey))
      for (let py = y0; py <= y1; py++) {
        const dy = py + 0.5 - g.cy
        let k = (py * W + x0) * 3
        for (let px = x0; px <= x1; px++, k += 3) {
          const dx = px + 0.5 - g.cx
          const u = g.c * dx + g.s * dy
          const v = -g.s * dx + g.c * dy
          const q = u * u * g.ia + v * v * g.ib
          if (q > REACH_Q) continue
          const f = Math.exp(-0.5 * q)
          out[k] += cr * f
          out[k + 1] += cg * f
          out[k + 2] += cb * f
        }
      }
    }
    return { width: W, height: H }
  }

  /** One training step: render, measure, backpropagate, Adam. Returns the mean squared error before the step. */
  step() {
    const W = this.width, H = this.height
    const out = this.out, t = this.target, res = this.residual
    this.render(out)

    // Loss = Σ (out − target)²; dLoss/dout = 2 (out − target)
    let sse = 0
    for (let k = 0; k < res.length; k++) {
      const d = out[k] - t[k]
      sse += d * d
      res[k] = 2 * d
    }

    const p = this.params, gr = this.grad
    gr.fill(0, 0, this.count * P)
    for (let i = 0; i < this.count; i++) {
      const o = i * P
      const g = geometry(p, o, 1)
      if (!g) continue
      const a = sigmoid(p[o + O])
      const cr = sigmoid(p[o + R]), cg = sigmoid(p[o + G]), cb = sigmoid(p[o + B])
      let gx = 0, gy = 0, gsx = 0, gsy = 0, gth = 0, gr_ = 0, gg = 0, gb = 0, go = 0
      const x0 = Math.max(0, Math.floor(g.cx - g.ex)), x1 = Math.min(W - 1, Math.ceil(g.cx + g.ex))
      const y0 = Math.max(0, Math.floor(g.cy - g.ey)), y1 = Math.min(H - 1, Math.ceil(g.cy + g.ey))
      for (let py = y0; py <= y1; py++) {
        const dy = py + 0.5 - g.cy
        let k = (py * W + x0) * 3
        for (let px = x0; px <= x1; px++, k += 3) {
          const dx = px + 0.5 - g.cx
          const u = g.c * dx + g.s * dy
          const v = -g.s * dx + g.c * dy
          const q = u * u * g.ia + v * v * g.ib
          if (q > REACH_Q) continue
          const f = Math.exp(-0.5 * q)
          const er = res[k], eg = res[k + 1], eb = res[k + 2]
          const af = a * f
          gr_ += er * af
          gg += eg * af
          gb += eb * af
          const ew = er * cr + eg * cg + eb * cb // dLoss/d(weight), where weight = a·f
          go += ew * f
          const gq = ew * a * f * -0.5 // dLoss/dq
          const uia = u * g.ia, vib = v * g.ib
          // q = u²/sx² + v²/sy², with u, v the offset in the blob's own frame
          gx += gq * (-2 * uia * g.c + 2 * vib * g.s)
          gy += gq * (-2 * uia * g.s - 2 * vib * g.c)
          gsx += gq * (-2 * u * uia)
          gsy += gq * (-2 * v * vib)
          gth += gq * 2 * u * v * (g.ia - g.ib)
        }
      }
      gr[o + X] = gx
      gr[o + Y] = gy
      gr[o + SX] = gsx
      gr[o + SY] = gsy
      gr[o + TH] = gth
      gr[o + R] = gr_ * cr * (1 - cr)
      gr[o + G] = gg * cg * (1 - cg)
      gr[o + B] = gb * cb * (1 - cb)
      gr[o + O] = go * a * (1 - a)
    }
    this.adam()
    this.iteration++
    return sse / res.length
  }

  /** Gradient of the summed squared error, for the tests' finite-difference check. */
  gradient() {
    return this.grad.subarray(0, this.count * P)
  }

  /** Loss without stepping, for the tests. */
  loss() {
    this.render(this.out)
    let sse = 0
    for (let k = 0; k < this.out.length; k++) {
      const d = this.out[k] - this.target[k]
      sse += d * d
    }
    return sse
  }

  /** Compute gradients only (no Adam step), for the tests. */
  computeGradient() {
    const saved = { rate: this.rate, it: this.iteration }
    const before = this.params.slice(0, this.count * P)
    const m = this.m.slice(0, this.count * P), v = this.v.slice(0, this.count * P), age = this.age.slice(0, this.count)
    this.step()
    this.params.set(before)
    this.m.set(m)
    this.v.set(v)
    this.age.set(age)
    this.rate = saved.rate
    this.iteration = saved.it
    return this.gradient()
  }

  private adam() {
    const b1 = 0.9, b2 = 0.99, eps = 1e-8
    const r = BASE_RATES
    const lr = [r.position, r.position, r.scale, r.scale, r.angle, r.color, r.color, r.color, r.opacity]
    const p = this.params, gr = this.grad, m = this.m, v = this.v
    for (let i = 0; i < this.count; i++) {
      const t = ++this.age[i]
      const c1 = 1 - Math.pow(b1, t), c2 = 1 - Math.pow(b2, t)
      const o = i * P
      for (let j = 0; j < P; j++) {
        const k = o + j
        const g = gr[k]
        m[k] = b1 * m[k] + (1 - b1) * g
        v[k] = b2 * v[k] + (1 - b2) * g * g
        p[k] -= (this.rate * lr[j] * (m[k] / c1)) / (Math.sqrt(v[k] / c2) + eps)
      }
      // Keep blobs on the picture and between a third of a pixel and half the picture across
      p[o + X] = Math.min(this.width, Math.max(0, p[o + X]))
      p[o + Y] = Math.min(this.height, Math.max(0, p[o + Y]))
      p[o + SX] = Math.min(this.maxLogScale, Math.max(MIN_LOG_SCALE, p[o + SX]))
      p[o + SY] = Math.min(this.maxLogScale, Math.max(MIN_LOG_SCALE, p[o + SY]))
    }
  }

  /**
   * Remove blobs whose opacity has fallen under `threshold`: training has
   * decided they don't help. Blobs younger than `grace` steps are spared, so
   * new ones get a chance to find their place. Returns the removed blobs, so
   * the page can show them go.
   */
  prune(threshold: number, grace = 0) {
    const removed: ReturnType<Fitter['blob']>[] = []
    const cut = logit(threshold)
    for (let i = this.count - 1; i >= 0; i--) {
      if (this.params[i * P + O] < cut && this.age[i] >= grace) {
        removed.push(this.blob(i))
        this.removeAt(i)
      }
    }
    return removed
  }

  /**
   * Add up to `n` small blobs where the picture is still most wrong: pixels
   * are picked at random, weighted by their squared error. Uses the error
   * from the last step. Returns how many were added.
   */
  densify(n: number, random: Rng) {
    n = Math.min(n, this.capacity - this.count)
    if (n <= 0) return 0
    const W = this.width, H = this.height
    const out = this.out, t = this.target
    const cdf = new Float64Array(W * H)
    let total = 0
    for (let i = 0; i < W * H; i++) {
      const k = i * 3
      const dr = t[k] - out[k], dg = t[k + 1] - out[k + 1], db = t[k + 2] - out[k + 2]
      total += dr * dr + dg * dg + db * db
      cdf[i] = total
    }
    if (total <= 0) return 0
    const s = Math.max(0.8, Math.sqrt((W * H) / (this.count + n)) * 0.35)
    let added = 0
    for (let j = 0; j < n; j++) {
      const pick = random() * total
      let lo = 0, hi = cdf.length - 1
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (cdf[mid] < pick) lo = mid + 1
        else hi = mid
      }
      const x = lo % W, y = (lo / W) | 0
      if (this.addPatch(x + random(), y + random(), s)) added++
    }
    return added
  }

  /**
   * Add one blob at (x, y), colored with what the picture is missing there:
   * what the user's click does, and what densify adds.
   */
  addPatch(x: number, y: number, size: number) {
    const W = this.width, H = this.height
    const k = (Math.min(H - 1, Math.max(0, y | 0)) * W + Math.min(W - 1, Math.max(0, x | 0))) * 3
    const t = this.target, out = this.out
    // Too dark: paint the target color in. Too bright: a blob can't subtract, so add a faint one and let training sort it out.
    const missing = Math.max(0, t[k] - out[k]) + Math.max(0, t[k + 1] - out[k + 1]) + Math.max(0, t[k + 2] - out[k + 2])
    const opacity = Math.min(0.9, Math.max(0.05, missing / 1.5))
    return this.add(x, y, size, size, 0, [t[k], t[k + 1], t[k + 2]], opacity)
  }
}

/**
 * The blob's center and inverse squared scales in the drawing's pixels, its
 * rotation, and how far its drawn ellipse reaches along x and y. Null when it
 * has shrunk to nothing.
 */
function geometry(p: Float32Array, o: number, scale: number) {
  const sx = Math.exp(p[o + SX]) * scale, sy = Math.exp(p[o + SY]) * scale
  if (!(sx > 0 && sy > 0)) return null
  const th = p[o + TH]
  const c = Math.cos(th), s = Math.sin(th)
  // Bounding box of the REACH-σ ellipse: √(Σxx), √(Σyy)
  const ex = REACH * Math.sqrt(c * c * sx * sx + s * s * sy * sy)
  const ey = REACH * Math.sqrt(s * s * sx * sx + c * c * sy * sy)
  return { cx: p[o + X] * scale, cy: p[o + Y] * scale, c, s, ia: 1 / (sx * sx), ib: 1 / (sy * sy), ex, ey }
}

/** Mean squared error to PSNR in dB, for images in [0, 1]. */
export const psnr = (mse: number) => (mse > 0 ? -10 * Math.log10(mse) : Infinity)
