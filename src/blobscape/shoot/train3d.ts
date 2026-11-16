/**
 * A tiny 3D Gaussian splat trainer, the whole of what a real one does in
 * miniature: render blobs from a photo's camera, compare with the photo, push
 * every number downhill (hand-derived backward pass, Adam), and move blobs
 * that faded to nothing to where the picture needs more.
 *
 * Unlike Fit a Picture's flat blobs, these sit in 3D and are drawn front to
 * back, so a blob can hide the ones behind it:
 *   pixel = Σ cᵢ αᵢ Tᵢ + T·background,   Tᵢ = Π_{j<i} (1 − αⱼ)
 * Blobs are round (one size each) to keep the math short: on screen each is a
 * circle of radius f·s/z pixels.
 *
 * The "real thing" is made of the same kind of blobs and drawn by the same
 * renderer, so the trainer could match it exactly given enough photos.
 * Pure typed arrays: it runs on the page and in Node tests.
 */

export interface Cam {
  /** Where the camera stands, and its right/up/forward axes. */
  eye: [number, number, number]
  right: [number, number, number]
  up: [number, number, number]
  fwd: [number, number, number]
  /** Focal length in pixels, and the image size. */
  f: number
  w: number
  h: number
}

/** Camera distance from the middle of the object, in world units. */
export const DISTANCE = 3.2
/** Vertical field of view in degrees. */
export const FOV = 36
/** Every photo is this many pixels square. */
export const PHOTO = 56
/** The backdrop the photos are taken against (linear 0–1). */
export const BACKGROUND: [number, number, number] = [0.16, 0.18, 0.26]

/** A camera on a circle round the object, looking at its middle. Azimuth 0 looks at the front (from +z). */
export function orbitCam(azimuthDeg: number, elevationDeg: number, w: number, h = w, distance = DISTANCE): Cam {
  const a = (azimuthDeg * Math.PI) / 180, e = (elevationDeg * Math.PI) / 180
  const eye: [number, number, number] = [distance * Math.sin(a) * Math.cos(e), distance * Math.sin(e), distance * Math.cos(a) * Math.cos(e)]
  const fwd = norm([-eye[0], -eye[1], -eye[2]])
  const right = norm(cross(fwd, [0, 1, 0]))
  const up = cross(right, fwd)
  const f = h / 2 / Math.tan(((FOV / 2) * Math.PI) / 180)
  return { eye, right, up, fwd, f, w, h }
}

function cross(a: number[], b: number[]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
function norm(v: number[]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

/**
 * The trainable numbers. Sizes are stored as logs and color/opacity as raw
 * values through a sigmoid, so every number can roam freely and still mean
 * something valid.
 */
export interface Model {
  count: number
  pos: Float64Array // 3 per blob
  logS: Float64Array // 1 per blob
  col: Float64Array // 3 per blob, raw (sigmoid → 0–1)
  op: Float64Array // 1 per blob, raw (sigmoid → 0–1)
}

export function emptyModel(count: number): Model {
  return { count, pos: new Float64Array(count * 3), logS: new Float64Array(count), col: new Float64Array(count * 3), op: new Float64Array(count) }
}

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))
export const logit = (p: number) => Math.log(p / (1 - p))

/** A small seeded random generator, so a run can be repeated exactly. */
export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Where training starts: blobs scattered at random through a ball round the
 * object, gray and faint. Real trainers start from points a structure-from-
 * motion step found in the photos; with none, a random cloud still works.
 */
export function randomStart(count: number, seed: number, radius = 1): Model {
  const m = emptyModel(count)
  const r = rng(seed)
  for (let i = 0; i < count; i++) {
    let x = 0, y = 0, z = 0
    do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1 } while (x * x + y * y + z * z > 1)
    m.pos.set([x * radius, y * radius, z * radius], i * 3)
    m.logS[i] = Math.log(0.07)
    m.col.set([(r() - 0.5) * 0.4, (r() - 0.5) * 0.4, (r() - 0.5) * 0.4], i * 3)
    m.op[i] = logit(0.15)
  }
  return m
}

const BLUR = 0.3
const NEAR = 0.2
/** Blobs are drawn out to this many standard deviations. */
const REACH = 3
const MAX_ALPHA = 0.99
const MIN_ALPHA = 1 / 255
const MIN_T = 1e-4

/** Every blob as it lands in one camera: screen center, depth, variance in pixels², opacity, color. */
interface Screen {
  /** Indices of blobs in front of the camera, nearest first. */
  order: Int32Array
  u: Float64Array
  v: Float64Array
  z: Float64Array
  /** Camera-space x and y (for the backward pass). */
  x: Float64Array
  y: Float64Array
  s2: Float64Array
  o: Float64Array
  c: Float64Array
}

function toScreen(m: Model, cam: Cam): Screen {
  const n = m.count
  const S: Screen = { order: new Int32Array(0), u: new Float64Array(n), v: new Float64Array(n), z: new Float64Array(n), x: new Float64Array(n), y: new Float64Array(n), s2: new Float64Array(n), o: new Float64Array(n), c: new Float64Array(n * 3) }
  const { eye, right, up, fwd, f } = cam
  const keep: number[] = []
  for (let i = 0; i < n; i++) {
    const dx = m.pos[i * 3] - eye[0], dy = m.pos[i * 3 + 1] - eye[1], dz = m.pos[i * 3 + 2] - eye[2]
    const x = dx * right[0] + dy * right[1] + dz * right[2]
    const y = dx * up[0] + dy * up[1] + dz * up[2]
    const z = dx * fwd[0] + dy * fwd[1] + dz * fwd[2]
    const sc = Math.exp(m.logS[i])
    S.x[i] = x
    S.y[i] = y
    S.z[i] = z
    S.u[i] = cam.w / 2 + (f * x) / z
    S.v[i] = cam.h / 2 - (f * y) / z
    // A little blur so tiny blobs still cover a pixel
    S.s2[i] = (f * f * sc * sc) / (z * z) + BLUR
    S.o[i] = sigmoid(m.op[i])
    for (let c = 0; c < 3; c++) S.c[i * 3 + c] = sigmoid(m.col[i * 3 + c])
    if (z > NEAR) keep.push(i)
  }
  keep.sort((a, b) => S.z[a] - S.z[b]) // front to back
  S.order = Int32Array.from(keep)
  return S
}

/** The pixel box a blob reaches: x0, x1, y0, y1 (inclusive), or null when it's off screen. */
function box(S: Screen, i: number, w: number, h: number): [number, number, number, number] | null {
  const r = REACH * Math.sqrt(S.s2[i])
  const x0 = Math.max(0, Math.floor(S.u[i] - r)), x1 = Math.min(w - 1, Math.ceil(S.u[i] + r))
  const y0 = Math.max(0, Math.floor(S.v[i] - r)), y1 = Math.min(h - 1, Math.ceil(S.v[i] + r))
  return x0 > x1 || y0 > y1 ? null : [x0, x1, y0, y1]
}

/** Draws the model from a camera: linear RGB, 3 floats per pixel, on the background. */
export function render(m: Model, cam: Cam, bg = BACKGROUND): Float64Array {
  const { w, h } = cam
  const n = w * h
  const out = new Float64Array(n * 3)
  const T = new Float64Array(n).fill(1)
  const S = toScreen(m, cam)
  const cut = REACH * REACH
  for (const i of S.order) {
    const bx = box(S, i, w, h)
    if (!bx) continue
    const u = S.u[i], v = S.v[i], inv = 1 / S.s2[i], o = S.o[i]
    const c0 = S.c[i * 3], c1 = S.c[i * 3 + 1], c2 = S.c[i * 3 + 2]
    for (let py = bx[2]; py <= bx[3]; py++) {
      const dy = py + 0.5 - v
      for (let px = bx[0]; px <= bx[1]; px++) {
        const dx = px + 0.5 - u
        const q = (dx * dx + dy * dy) * inv
        if (q > cut) continue
        let a = o * Math.exp(-0.5 * q)
        if (a < MIN_ALPHA) continue
        if (a > MAX_ALPHA) a = MAX_ALPHA
        const k = py * w + px
        const t = T[k]
        if (t < MIN_T) continue
        out[k * 3] += c0 * a * t
        out[k * 3 + 1] += c1 * a * t
        out[k * 3 + 2] += c2 * a * t
        T[k] = t * (1 - a)
      }
    }
  }
  for (let k = 0; k < n; k++) {
    out[k * 3] += T[k] * bg[0]
    out[k * 3 + 1] += T[k] * bg[1]
    out[k * 3 + 2] += T[k] * bg[2]
  }
  return out
}

/** Gradients, the same shape as the model. */
export type Grads = Model

/**
 * Mean squared error against a photo, and (into `g`, added on) how the error
 * changes with every number in the model.
 */
export function lossAndGrad(m: Model, cam: Cam, photo: Float64Array, g: Grads, bg = BACKGROUND): number {
  const { w, h, right, up, fwd, f } = cam
  const n = w * h
  const full = render(m, cam, bg)
  const inv3 = 1 / (n * 3)
  let loss = 0
  const G = new Float64Array(n * 3) // dLoss/dPixel
  for (let k = 0; k < n * 3; k++) {
    const d = full[k] - photo[k]
    loss += d * d * inv3
    G[k] = 2 * d * inv3
  }
  // Walk front to back again: at each blob we know the light still getting
  // through (T) and, from the finished pixel, everything drawn behind it
  const T = new Float64Array(n).fill(1)
  const sofar = new Float64Array(n * 3)
  const S = toScreen(m, cam)
  const cut = REACH * REACH
  for (const i of S.order) {
    const bx = box(S, i, w, h)
    if (!bx) continue
    const u = S.u[i], v = S.v[i], s2 = S.s2[i], inv = 1 / s2, o = S.o[i]
    const c0 = S.c[i * 3], c1 = S.c[i * 3 + 1], c2 = S.c[i * 3 + 2]
    let gu = 0, gv = 0, gs2 = 0, go = 0, gc0 = 0, gc1 = 0, gc2 = 0
    for (let py = bx[2]; py <= bx[3]; py++) {
      const dy = py + 0.5 - v
      for (let px = bx[0]; px <= bx[1]; px++) {
        const dx = px + 0.5 - u
        const q = (dx * dx + dy * dy) * inv
        if (q > cut) continue
        const gauss = Math.exp(-0.5 * q)
        let a = o * gauss
        if (a < MIN_ALPHA) continue
        const clamped = a > MAX_ALPHA
        if (clamped) a = MAX_ALPHA
        const k = py * w + px
        const t = T[k]
        if (t < MIN_T) continue
        const k3 = k * 3
        const r0 = G[k3], r1 = G[k3 + 1], r2 = G[k3 + 2]
        const at = a * t
        gc0 += at * r0
        gc1 += at * r1
        gc2 += at * r2
        const now0 = sofar[k3] + c0 * at, now1 = sofar[k3 + 1] + c1 * at, now2 = sofar[k3 + 2] + c2 * at
        // What lies behind this blob at this pixel (already dimmed by it)
        const behind = (full[k3] - now0) * r0 + (full[k3 + 1] - now1) * r1 + (full[k3 + 2] - now2) * r2
        sofar[k3] = now0
        sofar[k3 + 1] = now1
        sofar[k3 + 2] = now2
        T[k] = t * (1 - a)
        if (clamped) continue
        const ga = t * (c0 * r0 + c1 * r1 + c2 * r2) - behind / (1 - a)
        go += ga * gauss
        // a = o·exp(−q/2), q = (dx² + dy²)/s², dx = pixel − u
        const gaa = ga * a * inv
        gu += gaa * dx
        gv += gaa * dy
        gs2 += gaa * 0.5 * q
      }
    }
    const x = S.x[i], y = S.y[i], z = S.z[i]
    const sc = Math.exp(m.logS[i])
    // u = w/2 + f·x/z, v = h/2 − f·y/z, s² = f²·sc²/z² + blur
    const gx = (gu * f) / z
    const gy = (-gv * f) / z
    const gz = (-gu * f * x) / (z * z) + (gv * f * y) / (z * z) - (gs2 * 2 * f * f * sc * sc) / (z * z * z)
    g.pos[i * 3] += gx * right[0] + gy * up[0] + gz * fwd[0]
    g.pos[i * 3 + 1] += gx * right[1] + gy * up[1] + gz * fwd[1]
    g.pos[i * 3 + 2] += gx * right[2] + gy * up[2] + gz * fwd[2]
    g.logS[i] += (gs2 * 2 * f * f * sc * sc) / (z * z)
    g.col[i * 3] += gc0 * c0 * (1 - c0)
    g.col[i * 3 + 1] += gc1 * c1 * (1 - c1)
    g.col[i * 3 + 2] += gc2 * c2 * (1 - c2)
    g.op[i] += go * o * (1 - o)
  }
  return loss
}

/** Mean squared error of a render against a photo. */
export function mse(a: Float64Array, b: Float64Array): number {
  let e = 0
  for (let k = 0; k < a.length; k++) {
    const d = a[k] - b[k]
    e += d * d
  }
  return e / a.length
}

const KEYS = ['pos', 'logS', 'col', 'op'] as const
/** Step sizes per kind of number. */
const RATE = { pos: 0.006, logS: 0.02, col: 0.05, op: 0.05 }

/** Steps for a run from this many photos: enough for every photo to be seen 50 times, and never fewer than 600. */
export const stepsFor = (photos: number) => Math.max(600, photos * 50)

/** Blobs in a trained model. */
export const BLOBS = 500

/**
 * How close renders come to the real thing, as a share of the error you'd
 * have with no blobs at all: 1 is a perfect match, 0 no better than nothing.
 */
export function match(m: Model, truth: Model, cams: Cam[]): number {
  let none = 0, err = 0
  for (const c of cams) {
    const real = render(truth, c)
    let e = 0
    for (let k = 0; k < real.length; k += 3) for (let j = 0; j < 3; j++) { const d = real[k + j] - BACKGROUND[j]; e += d * d }
    none += e / real.length
    err += mse(render(m, c), real)
  }
  return none > 0 ? Math.max(0, 1 - err / none) : 1
}

/** Where every-side scores are judged from: between the photo spots, low and high. */
export const CHECK_VIEWS: [number, number][] = []
for (let a = 15; a < 360; a += 30) for (const e of [5, 45]) CHECK_VIEWS.push([a, e])

/** A training run: the model, Adam's running averages, and the photos it learns from. */
export class Trainer {
  m: Model
  step = 0
  private g: Grads
  private m1: Grads
  private m2: Grads
  private rand: () => number
  /** The most recent loss per photo, for the readout. */
  last: number[]

  readonly cams: Cam[]
  readonly photos: Float64Array[]

  /** How many steps the run will take: positions settle and blobs stop moving house toward the end. */
  readonly total: number

  constructor(cams: Cam[], photos: Float64Array[], count: number, total: number, seed = 1) {
    this.total = total
    this.cams = cams
    this.photos = photos
    this.m = randomStart(count, seed)
    this.g = emptyModel(count)
    this.m1 = emptyModel(count)
    this.m2 = emptyModel(count)
    this.rand = rng(seed * 7919 + 13)
    this.last = cams.map(() => NaN)
  }

  /** One step: one photo (taken in turn), one nudge of every number. */
  tick(): number {
    if (this.cams.length === 0) return 0
    const v = this.step % this.cams.length
    for (const k of KEYS) this.g[k].fill(0)
    const loss = lossAndGrad(this.m, this.cams[v], this.photos[v], this.g)
    this.last[v] = loss
    this.step++
    const b1 = 0.9, b2 = 0.999
    const c1 = 1 - b1 ** this.step, c2 = 1 - b2 ** this.step
    // Positions settle as training goes on, like 3DGS's decaying position rate
    const decay = Math.max(0.15, 1 - this.step / this.total)
    for (const k of KEYS) {
      const p = this.m[k], g = this.g[k], a = this.m1[k], s = this.m2[k]
      const rate = RATE[k] * (k === 'pos' ? decay : 1)
      for (let j = 0; j < p.length; j++) {
        a[j] = b1 * a[j] + (1 - b1) * g[j]
        s[j] = b2 * s[j] + (1 - b2) * g[j] * g[j]
        p[j] -= (rate * (a[j] / c1)) / (Math.sqrt(s[j] / c2) + 1e-10)
      }
    }
    // Keep sizes in a sane range: no blob bigger than the object or smaller than a speck
    for (let i = 0; i < this.m.count; i++) this.m.logS[i] = Math.min(Math.log(0.4), Math.max(Math.log(0.004), this.m.logS[i]))
    if (this.step % 50 === 0 && this.step < this.total * 0.8) this.relocate()
    return loss
  }

  /**
   * Blobs that faded out are moved next to a visible one, which splits its
   * work with the newcomer: how real trainers put more blobs where detail is.
   */
  private relocate() {
    const m = this.m
    const alive: number[] = [], dead: number[] = []
    for (let i = 0; i < m.count; i++) (sigmoid(m.op[i]) < 0.02 ? dead : alive).push(i)
    if (!alive.length) return
    let total = 0
    for (const i of alive) total += sigmoid(m.op[i])
    for (const d of dead) {
      let pick = this.rand() * total, src = alive[0]
      for (const i of alive) { pick -= sigmoid(m.op[i]); if (pick <= 0) { src = i; break } }
      const sc = Math.exp(m.logS[src])
      for (let c = 0; c < 3; c++) {
        m.pos[d * 3 + c] = m.pos[src * 3 + c] + (this.rand() - 0.5) * sc
        m.col[d * 3 + c] = m.col[src * 3 + c]
      }
      m.logS[src] -= 0.2
      m.logS[d] = m.logS[src]
      // Two blobs where one was: each gets the opacity that leaves the pair as solid as the one
      const o = sigmoid(m.op[src]), half = 1 - Math.sqrt(1 - o)
      m.op[src] = m.op[d] = logit(Math.min(0.99, Math.max(0.03, half)))
      for (const k of KEYS) {
        const w = k === 'pos' || k === 'col' ? 3 : 1
        for (let c = 0; c < w; c++) {
          this.m1[k][d * w + c] = this.m2[k][d * w + c] = 0
        }
      }
    }
  }
}
