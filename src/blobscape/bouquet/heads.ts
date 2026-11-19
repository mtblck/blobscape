import type { Vec3 } from '../../splat-core/blobs.ts'
import { axisAngle, mulQ } from '../../splat-engine/rig.ts'
import { Maker, add, clamp, cross, hash, lerp, mix, mul, noise, smooth, unit, upTo, type Finish } from './make.ts'

/**
 * How flowers are grown. A petal is a surface with a handful of numbers: how
 * long and wide, where it is widest, how it stands at its foot and at its tip,
 * how its edges cup, ruffle and twist. A flower head is one of five plans that
 * set petals (or beads, or leaves) out: a rosette round a center, things along
 * a stalk, a dome of small florets, a spray of thin twigs, and a tuft of
 * blades. Every flower in `flowers.ts` is one of these with its own numbers.
 *
 * Heads are written standing on the origin with the y axis as the flower's
 * own axis, in units of the head's size; the bouquet sets each on its stem.
 */

const D = Math.PI / 180
/** The golden angle: each petal of a spiral is this far round from the last, so none hides another. */
export const GOLDEN = 137.50776 * D

/** One petal, or a leaf. Angles are degrees above level: 0 lies flat, 90 stands straight up. */
export interface Petal {
  /** Length from foot to tip. */
  len: number
  /** Width at its widest. */
  width: number
  /** Where along it is widest, 0 to 1 (0.6 left out). */
  widest?: number
  /** How its tip ends: 0.4 blunt and round, 1 plain, 2 and more drawn to a point. */
  point?: number
  /** Width at the foot, as a share of the widest. */
  claw?: number
  /** A notch in the tip, as a share of the length (a cherry petal's). */
  notch?: number
  /** The angle it leaves the flower at. */
  open: number
  /** The angle at its tip: under `open` it curls back, over it curls in. */
  tip: number
  /** Where the bend happens: 1 evenly, 2 and more toward the tip, under 1 at the foot. */
  bend?: number
  /** Edges lifted (or, below 0, dropped), as a share of the half width. */
  cup?: number
  /** A wavy edge: how high, as a share of the half width. */
  ruffle?: number
  /** How many waves across. */
  ruffles?: number
  /** A turn about its own length by the tip, in degrees. */
  twist?: number
  /** A crease down the middle, as a share of the half width: leaves. */
  fold?: number
  /** Lobes along each edge (an oak leaf), and how deep they cut, 0 to 1. */
  lobes?: number
  lobed?: number
}

/** A petal's paint. */
export interface Paint {
  /** Color at the foot and at the tip. */
  base: Vec3
  tip: Vec3
  /** Where the change falls: 1 evenly, more keeps the foot's color longer. */
  run?: number
  /** A different color along the rim, and how far in from it (0 to 1) it starts. */
  edge?: Vec3
  edgeAt?: number
  /** A color deep in the throat, and how far up it reaches. */
  throat?: Vec3
  throatTo?: number
  /** Darker veins fanning out, 0 to 1. */
  veins?: number
  /** Fine streaks along the petal, 0 to 1. */
  streak?: number
  /** How dark the foot of the petal is, where the others shade it: 1 is not at all (0.72 left out). */
  deep?: number
  /** Spots near the throat (a lily's), 0 to 1. */
  spots?: number
}

const widthAt = (s: Petal, u: number) => {
  const widest = s.widest ?? 0.6, claw = s.claw ?? 0.12
  const a = Math.log(0.5) / Math.log(clamp(widest, 0.05, 0.95))
  let w = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(clamp(u, 0, 1), a))), 0.5 * (s.point ?? 1))
  if (u < widest) w = claw + (1 - claw) * w
  if (s.lobes) w *= 1 - (s.lobed ?? 0.4) * (0.5 + 0.5 * Math.cos(2 * Math.PI * s.lobes * u)) * smooth(u * 5)
  return (s.width / 2) * w
}

/** Mixes two petals: `t` 0 is the first, 1 the second. */
export function between(a: Petal, b: Petal, t: number): Petal {
  const f = (k: keyof Petal, d: number) => lerp((a[k] as number | undefined) ?? d, (b[k] as number | undefined) ?? d, t)
  return {
    len: f('len', 1), width: f('width', 1), widest: f('widest', 0.6), point: f('point', 1), claw: f('claw', 0.12), notch: f('notch', 0),
    open: f('open', 0), tip: f('tip', 0), bend: f('bend', 1), cup: f('cup', 0), ruffle: f('ruffle', 0), ruffles: f('ruffles', 3), twist: f('twist', 0), fold: f('fold', 0),
    lobes: a.lobes ?? b.lobes, lobed: f('lobed', 0),
  }
}

const SPINE = 20

/** The paint of a petal at a place on it: `u` along, `s` across from -1 to 1. */
export function painted(paint: Paint, u: number, s: number, seed: number): Vec3 {
  let c = mix(paint.base, paint.tip, smooth(Math.pow(u, paint.run ?? 1)))
  if (paint.throat) c = mix(paint.throat, c, smooth(u / (paint.throatTo ?? 0.35)))
  if (paint.edge) {
    const rim = Math.max(Math.abs(s), u * u)
    c = mix(c, paint.edge, smooth((rim - (paint.edgeAt ?? 0.75)) / (1 - (paint.edgeAt ?? 0.75))))
  }
  let k = 1
  if (paint.veins) k *= 1 - paint.veins * Math.pow(Math.abs(Math.sin(s * (5.5 + u * 2) + (seed % 7))), 8) * (1 - u * 0.4)
  if (paint.streak) k *= 1 + paint.streak * (hash(seed, Math.floor((s + 1) * 9), Math.floor(u * 2.5)) - 0.5)
  if (paint.spots && u < 0.6 && hash(seed + 3, Math.floor((s + 1) * 11), Math.floor(u * 22)) < paint.spots * (1 - u / 0.6)) k *= 0.45
  k *= lerp(paint.deep ?? 0.72, 1, smooth(u / 0.55))
  return [c[0] * k, c[1] * k, c[2] * k]
}

/**
 * Makes one petal with its foot at the origin, growing out along x and up
 * along y. Returns the blobs it took (from, to) so a flower can let it fall.
 */
export function petal(m: Maker, s: Petal, paint: Paint, seed: number, fin: Finish = {}): [number, number] {
  m.newPart()
  const from = m.blobs.count
  // the spine: a curve in the x-y plane whose slope goes from `open` to `tip`
  const xs = [0], ys = [0], bend = s.bend ?? 1
  for (let i = 1; i <= SPINE; i++) {
    const a = lerp(s.open, s.tip, Math.pow((i - 0.5) / SPINE, bend)) * D
    xs.push(xs[i - 1] + (Math.cos(a) * s.len) / SPINE)
    ys.push(ys[i - 1] + (Math.sin(a) * s.len) / SPINE)
  }
  const phase = hash(seed, 11) * 6.28, phase2 = hash(seed, 12) * 6.28
  const at = (u: number, v: number): Vec3 => {
    // across runs from +z to -z, so that along × across is the petal's upper face
    const sx = 1 - v * 2
    const ue = clamp(u * (1 - (s.notch ?? 0) * Math.exp(-((sx / 0.3) ** 2)) * u))
    const f = ue * SPINE, i = Math.min(SPINE - 1, Math.floor(f)), t = f - i
    const x = lerp(xs[i], xs[i + 1], t), y = lerp(ys[i], ys[i + 1], t)
    const a = lerp(s.open, s.tip, Math.pow(clamp(ue, 0.001), bend)) * D
    const w = widthAt(s, ue)
    const tw = (s.twist ?? 0) * D * ue
    // across is z, turned about the spine by the twist; the upper face is the spine's left
    const nx = -Math.sin(a), ny = Math.cos(a)
    const ax: Vec3 = [nx * Math.sin(tw), ny * Math.sin(tw), Math.cos(tw)]
    const up: Vec3 = [nx * Math.cos(tw), ny * Math.cos(tw), -Math.sin(tw)]
    let lift = (s.cup ?? 0) * w * sx * sx + (s.fold ?? 0) * w * Math.abs(sx)
    if (s.ruffle) lift += s.ruffle * w * (ue * ue * Math.sin((s.ruffles ?? 3) * Math.PI * sx + phase) * (0.3 + 0.7 * Math.abs(sx)) + 0.5 * ue * Math.sin((s.ruffles ?? 3) * 2.2 * Math.PI * ue + phase2) * Math.abs(sx))
    return [x + ax[0] * sx * w + up[0] * lift, y + ax[1] * sx * w + up[1] * lift, ax[2] * sx * w + up[2] * lift]
  }
  const step = m.step
  m.cover(at, Math.max(2, Math.round(s.len / step)), (u) => (2 * widthAt(s, u)) / step, (u, v) => painted(paint, u, 1 - v * 2, seed), { thin: true, ...fin }, { seed })
  return [from, m.blobs.count]
}

/** What sits in the middle of a rosette. */
export type Center =
  /** A low dome of tiny florets: a daisy's eye, a sunflower's face. `rim` colors its outer ring. */
  | { disc: number; height: number; color: Vec3; rim?: Vec3; heart?: Vec3 }
  /** Thin filaments with a dot of pollen each, fanned out by `spread` degrees. */
  | { stamens: number; len: number; spread: number; color: Vec3; anther: Vec3; pistil?: Vec3; dot?: number }
  /** A trumpet or cup: a daffodil's. */
  | { corona: number; len: number; flare: number; color: Vec3; rim?: Vec3; ruffle?: number }
  /** A raised cone of beads: a coneflower's, a thistle's. */
  | { cone: number; height: number; color: Vec3; tip?: Vec3 }
  /** A few big soft balls: an open cotton boll. */
  | { bolls: number; r: number; color: Vec3 }

/** A flower head with its petals set round a center. */
export interface Rosette {
  /** How many petals. */
  n: number
  /** Petals in each ring; left out, they go round in one spiral. */
  whorl?: number
  /** The innermost and the outermost petal; those between are in between. */
  inner: Petal
  outer: Petal
  /** How the petals between are shared out: over 1 keeps more of them like the inner one. */
  ease?: number
  /** How far from the axis the inner and outer petals join. */
  r: [number, number]
  /** How much higher the innermost petals join than the outermost. */
  rise?: number
  /** Paint of the outer petals, and of the inner ones if they differ. */
  paint: Paint
  paintIn?: Paint
  /** How unalike the petals are, 0 to 1. */
  wild?: number
  center?: Center
  /** Green sepals under the head: how many, how long, their color. */
  sepals?: { n: number; len: number; color: Vec3; open?: number }
  /** How many of the outermost petals may fall. */
  loose?: number
  /** The petals' finish (a waxy shine, a pale flower's lighter shade). */
  finish?: Finish
}

const about = (deg: number) => axisAngle([0, 1, 0], -deg)

/** Makes a rosette standing on the origin. */
export function rosette(m: Maker, f: Rosette, seed: number) {
  const wild = f.wild ?? 0.3
  for (let i = 0; i < f.n; i++) {
    const ring = f.whorl ? Math.floor(i / f.whorl) : 0, rings = f.whorl ? Math.ceil(f.n / f.whorl) : 1
    const t0 = f.whorl ? (rings > 1 ? ring / (rings - 1) : 1) : f.n > 1 ? i / (f.n - 1) : 1
    const t = Math.pow(t0, f.ease ?? 1)
    const az = f.whorl ? ((i % f.whorl) / f.whorl) * 2 * Math.PI + ring * (Math.PI / f.whorl) * (1 + 0.15 * ring) : i * GOLDEN
    const h = (k: number) => hash(seed, i, k) - 0.5
    const p = between(f.inner, f.outer, t)
    p.open += h(1) * 14 * wild
    p.tip += h(2) * 22 * wild
    p.len *= 1 + h(3) * 0.22 * wild
    p.width *= 1 + h(4) * 0.2 * wild
    p.twist = (p.twist ?? 0) + h(5) * 30 * wild
    const r = lerp(f.r[0], f.r[1], t), a = az + h(6) * 0.25 * wild
    const paint: Paint = f.paintIn ? { ...f.paint, base: mix(f.paintIn.base, f.paint.base, t), tip: mix(f.paintIn.tip, f.paint.tip, t), deep: lerp(f.paintIn.deep ?? 0.72, f.paint.deep ?? 0.72, t) } : f.paint
    const tone = 1 + h(7) * 0.16
    const mine: Paint = { ...paint, base: mul(paint.base, tone), tip: mul(paint.tip, tone) }
    m.within([r * Math.cos(a), (f.rise ?? 0) * (1 - t), r * Math.sin(a)], mulQ(about(a), axisAngle([1, 0, 0], h(8) * 0.35 * wild)), 1, () => {
      const [from, to] = petal(m, p, mine, seed * 31 + i, f.finish)
      if (f.loose && i >= f.n - f.loose) m.loose.push({ from, to, base: m.out([0, 0, 0]), normal: m.way(unit([-Math.sin(((p.open + p.tip) / 2) * D), Math.cos(((p.open + p.tip) / 2) * D), 0])), bone: m.onBone })
    })
  }
  if (f.center) center(m, f.center, seed)
  if (f.sepals) {
    const s = f.sepals
    m.newPart()
    m.ball([0, -0.1 * s.len, 0], [f.r[1] + 0.12 * s.len, 0.3 * s.len, f.r[1] + 0.12 * s.len], () => s.color, {}, (p) => p[1] < 0)
    for (let i = 0; i < s.n; i++) {
      const a = (i / s.n) * 2 * Math.PI + 0.3
      m.within([f.r[1] * 0.8 * Math.cos(a), -0.02, f.r[1] * 0.8 * Math.sin(a)], about(a), 1, () => {
        petal(m, { len: s.len, width: s.len * 0.42, widest: 0.35, point: 2.2, open: s.open ?? -25, tip: (s.open ?? -25) - 30, cup: 0.3 }, { base: s.color, tip: mul(s.color, 1.15), deep: 1 }, seed + 900 + i)
      })
    }
  }
}

function center(m: Maker, c: Center, seed: number) {
  m.newPart()
  if ('disc' in c || 'cone' in c) {
    const r = 'disc' in c ? c.disc : c.cone, h = c.height
    const rim = 'disc' in c ? c.rim : undefined, heart = 'disc' in c ? c.heart : c.tip
    // a dome of beads in a sunflower's spiral, a little proud of the surface so they catch the light
    const n = Math.max(12, Math.round((Math.PI * r * (r + h)) / (m.step * m.step * 1.4)))
    for (let i = 0; i < n; i++) {
      const t = Math.sqrt((i + 0.5) / n), a = i * GOLDEN
      const rr = r * t, y = h * (1 - t * t) ** ('cone' in c ? 0.7 : 1)
      let col = heart ? mix(heart, c.color, smooth(t * 1.6)) : c.color
      if (rim) col = mix(col, rim, smooth((t - 0.72) / 0.2))
      const size = Math.max(m.step * 0.55, r * 0.05)
      m.dot([rr * Math.cos(a), y, rr * Math.sin(a)], size, mul(col, 0.8 + 0.4 * hash(seed, i)), { shade: 0.6 })
    }
    return
  }
  if ('stamens' in c) {
    for (let i = 0; i < c.stamens; i++) {
      const a = i * GOLDEN, lean = c.spread * D * Math.sqrt((i + 0.5) / c.stamens)
      const d: Vec3 = [Math.sin(lean) * Math.cos(a), Math.cos(lean), Math.sin(lean) * Math.sin(a)]
      const l = c.len * (0.8 + 0.4 * hash(seed, i, 3))
      const side = unit(cross(d, [0.3, 0.2, 0.9]))
      m.put(mul(d, l / 2), d, side, l / 2 * 0.6, Math.max(m.step * 0.25, l * 0.03), c.color, { thin: true, shade: 0.5 }, 1)
      m.dot(mul(d, l), Math.max(m.step * 0.5, c.dot ?? l * 0.09), c.anther, { shade: 0.5 })
    }
    if (c.pistil) m.ball([0, c.len * 0.25, 0], [c.len * 0.22, c.len * 0.3, c.len * 0.22], () => c.pistil!, { shade: 0.7 })
    return
  }
  if ('corona' in c) {
    const rows = Math.max(3, Math.round(c.len / m.step))
    m.cover(
      (u, v) => {
        const a = v * 2 * Math.PI
        const r = c.corona * (0.55 + 0.45 * Math.pow(u, c.flare)) * (1 + (c.ruffle ?? 0) * u * u * Math.sin(a * 9 + seed))
        return [r * Math.cos(a), u * c.len, r * Math.sin(a)]
      },
      rows, () => (2 * Math.PI * c.corona) / m.step,
      (u) => mul(c.rim ? mix(c.color, c.rim, smooth((u - 0.6) / 0.35)) : c.color, lerp(0.6, 1, u)),
      { thin: true }, { wrap: true, seed },
    )
    m.dot([0, c.len * 0.25, 0], c.corona * 0.3, mul(c.color, 0.55))
    return
  }
  for (let i = 0; i < c.bolls; i++) {
    const a = (i / c.bolls) * 2 * Math.PI + seed
    const p: Vec3 = [c.r * 0.75 * Math.cos(a), c.r * 0.55, c.r * 0.75 * Math.sin(a)]
    m.ball(p, [c.r, c.r * 0.95, c.r], (_n, q) => mul(c.color, 0.86 + 0.14 * noise(q, 9 / c.r, seed)), { shade: 0.45 })
  }
}

/** A bead: a berry, a bud, a grain. */
export interface Bead {
  /** Radii across and along. */
  r: [number, number]
  color: Vec3
  /** A second color it shades to at its tip. */
  tip?: Vec3
  shine?: number
  /** A small dark star where the flower was: berries. */
  eye?: Vec3
  /** Ribs running along it (a lantern pod). */
  ribs?: number
}

/** One of the small things a head carries many of. */
export type Item =
  | { rosette: Rosette }
  | { bead: Bead }
  | { leaf: Petal; paint: Paint; finish?: Finish }
  /** A tuft of thin needles or hairs fanned by `spread` degrees. */
  | { needles: number; len: number; spread: number; color: Vec3; width?: number }

/** Makes one item standing on the origin, pointing along y. */
export function item(m: Maker, it: Item, seed: number) {
  if ('rosette' in it) return rosette(m, it.rosette, seed)
  if ('leaf' in it) { petal(m, it.leaf, it.paint, seed, it.finish); return }
  if ('bead' in it) {
    const b = it.bead
    m.newPart()
    const ribs = b.ribs
    m.ball([0, b.r[1], 0], [b.r[0], b.r[1], b.r[0]], (_n, p) => {
      let c = b.tip ? mix(b.color, b.tip, smooth(p[1] / (2 * b.r[1]))) : b.color
      if (ribs) c = mul(c, 0.8 + 0.2 * Math.abs(Math.cos((Math.atan2(p[2], p[0]) * ribs) / 2)))
      return c
    }, { shine: b.shine, shade: 0.8 })
    if (b.eye) m.dot([0, 2 * b.r[1], 0], Math.max(m.step * 0.5, b.r[0] * 0.3), b.eye)
    return
  }
  m.newPart()
  for (let i = 0; i < it.needles; i++) {
    const a = i * GOLDEN + seed, lean = it.spread * D * Math.sqrt((i + 0.5) / it.needles)
    const d: Vec3 = [Math.sin(lean) * Math.cos(a), Math.cos(lean), Math.sin(lean) * Math.sin(a)]
    const l = it.len * (0.75 + 0.5 * hash(seed, i))
    const side = unit(cross(d, [0.37, 0.11, 0.92]))
    // a needle is a few long blobs end to end, so it stays thin however long it is
    const parts = Math.max(1, Math.round(l / (m.step * 5)))
    for (let k = 0; k < parts; k++) m.put(mul(d, (l * (k + 0.5)) / parts), d, side, (l / parts) * 0.5, Math.max(m.step * 0.22, it.width ?? l * 0.02), mul(it.color, 0.85 + 0.3 * hash(seed, i, 2)), { thin: true, shade: 0.6 }, 1)
  }
}

/** Things set along a stalk: a spike of florets, a branch of blossom, a frond, an ear of wheat. */
export interface Along {
  /** How long the stalk is, and its radius at the foot and the tip. */
  len: number
  stalk: [number, number]
  stalkColor: Vec3
  /** How far it bends over by its tip, in degrees (a hanging tassel is 150 and more). */
  droop?: number
  /** A kink at each joint, in degrees: twigs. */
  zigzag?: number
  /** How many items, and the share of the stalk they start and stop at. */
  n: number
  from?: number
  to?: number
  item: Item
  /** A different item for the last `buds` places: unopened buds at the tip. */
  bud?: Item
  buds?: number
  /** Item size at the foot and at the tip. */
  size: [number, number]
  /** How far round each is from the last, in degrees: 137.5 a spiral, 180 two ranks, 90 pairs crossing. */
  step?: number
  /** Items at each place (2 is opposite pairs). */
  per?: number
  /** The angle items stand off the stalk at, in degrees: 90 square to it, 20 close along it; foot and tip. */
  tilt: [number, number]
  /** How far off the stalk's middle each item's foot is. */
  off?: number
  /** A leaf or two below the items. */
  wild?: number
}

/** Where a stalk is at share `t` of its length, and which way it heads there. */
function stalkAt(f: { len: number; droop?: number }, t: number): [Vec3, Vec3] {
  const droop = (f.droop ?? 0) * D
  if (Math.abs(droop) < 1e-3) return [[0, f.len * t, 0], [0, 1, 0]]
  // an arc in the x-y plane that has turned `droop` by its end: most of the bend comes early, so a long tassel hangs straight
  const turnAt = (u: number) => droop * (1 - Math.pow(1 - u, 2.2))
  let x = 0, y = 0
  const n = 16, upTo = Math.max(1, Math.ceil(t * n))
  for (let i = 0; i < upTo; i++) {
    const a = turnAt((i + 0.5) / n), d = (Math.min(t, (i + 1) / n) - i / n) * f.len
    x += Math.sin(a) * d
    y += Math.cos(a) * d
  }
  const a = turnAt(t)
  return [[x, y, 0], [Math.sin(a), Math.cos(a), 0]]
}

export function along(m: Maker, f: Along, seed: number) {
  m.newPart()
  const path: Vec3[] = []
  for (let i = 0; i <= 12; i++) path.push(stalkAt(f, i / 12)[0])
  m.tube(path, (t) => lerp(f.stalk[0], f.stalk[1], t), () => f.stalkColor)
  const per = f.per ?? 1, from = f.from ?? 0.1, to = f.to ?? 1, wild = f.wild ?? 0.3
  for (let i = 0; i < f.n; i++) {
    const t = f.n > 1 ? i / (f.n - 1) : 0.5
    const [p, d] = stalkAt(f, lerp(from, to, t))
    // a frame round the stalk here: d along it, and two across
    const sx = unit(cross(d, [0, 0, 1])), sz = cross(sx, d)
    for (let k = 0; k < per; k++) {
      const az = i * (f.step ?? 137.5) * D + (k / per) * 2 * Math.PI + (hash(seed, i, k) - 0.5) * wild
      const tilt = (lerp(f.tilt[0], f.tilt[1], t) + (hash(seed, i, k + 9) - 0.5) * 30 * wild) * D
      const out = add(mul(sx, Math.cos(az)), mul(sz, Math.sin(az)))
      const axis = unit(add(mul(d, Math.cos(tilt)), mul(out, Math.sin(tilt))))
      const size = lerp(f.size[0], f.size[1], t) * (1 + (hash(seed, i, k + 5) - 0.5) * 0.3 * wild)
      const isBud = f.bud && i >= f.n - (f.buds ?? 0)
      // the item's own x axis (a leaf's length runs along x) is turned to point away from the stalk
      const turn = mulQ(upTo(axis), axisAngle([0, 1, 0], twistFor(axis, out)))
      m.within(add(p, mul(out, f.off ?? lerp(f.stalk[0], f.stalk[1], t))), turn, size, () => item(m, isBud ? f.bud! : f.item, seed * 17 + i * 3 + k))
    }
  }
}

/** The turn about y that, after `upTo(axis)`, leaves the x axis pointing as nearly along `out` as it can. */
function twistFor(axis: Vec3, out: Vec3) {
  const q = upTo(axis)
  // where x and z land under q
  const x = rot(q, [1, 0, 0]), z = rot(q, [0, 0, 1])
  return Math.atan2(-(out[0] * z[0] + out[1] * z[1] + out[2] * z[2]), out[0] * x[0] + out[1] * x[1] + out[2] * x[2])
}
function rot(q: ArrayLike<number>, v: Vec3): Vec3 {
  const [x, y, z, w] = [q[0], q[1], q[2], q[3]]
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0])
  return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx]
}

/** A dome or ball of small florets: a hydrangea, an umbel, a lilac's cone. */
export interface Cluster {
  /** How many florets. */
  n: number
  /** The dome's radii: across and up. */
  r: [number, number]
  /** How much of a ball it is, in degrees from the top: 90 a half, 150 nearly all. */
  cap: number
  item: Item
  size: number
  /** Thin stalks from the foot to each floret, in this color: an umbel. */
  rays?: Vec3
  /** A soft green heart that fills the gaps between florets. */
  heart?: Vec3
  wild?: number
}

export function cluster(m: Maker, f: Cluster, seed: number) {
  const wild = f.wild ?? 0.3
  if (f.heart) { m.newPart(); m.ball([0, f.r[1] * 0.45, 0], [f.r[0] * 0.8, f.r[1] * 0.55, f.r[0] * 0.8], (_n, p) => mul(f.heart!, 0.7 + 0.5 * noise(p, 8 / f.r[0], seed)), { shade: 0.8 }) }
  const top = Math.cos(f.cap * D)
  for (let i = 0; i < f.n; i++) {
    const c = 1 - ((i + 0.5) / f.n) * (1 - top), s = Math.sqrt(Math.max(0, 1 - c * c)), a = i * GOLDEN
    const n: Vec3 = [s * Math.cos(a), c, s * Math.sin(a)]
    const k = 1 + (hash(seed, i) - 0.5) * 0.25 * wild
    const base: Vec3 = [0, f.r[1] * 0.2, 0]
    const p: Vec3 = [n[0] * f.r[0] * k, base[1] + n[1] * f.r[1] * k * (f.cap > 90 ? 0.85 : 1) + (f.cap > 90 ? f.r[1] * 0.25 : 0), n[2] * f.r[0] * k]
    if (f.rays) {
      const d = unit(p), l = Math.hypot(...p)
      m.newPart()
      m.put(mul(p, 0.5), d, unit(cross(d, [0.3, 0.1, 0.9])), l * 0.3, Math.max(m.step * 0.22, l * 0.012), f.rays, { thin: true, shade: 0.5 }, 1)
    }
    const axis = unit([n[0] + (hash(seed, i, 1) - 0.5) * wild, n[1] + 0.25 + (hash(seed, i, 2) - 0.5) * wild, n[2] + (hash(seed, i, 3) - 0.5) * wild])
    m.within(p, mulQ(upTo(axis), axisAngle([0, 1, 0], hash(seed, i, 4) * 6.28)), f.size * (1 + (hash(seed, i, 5) - 0.5) * 0.3), () => item(m, f.item, seed * 13 + i))
  }
}

/** A spray of thin twigs, each ending in a floret or a few: baby's breath, waxflower, a berry stem. */
export interface Spray {
  /** How many twigs, how long, and how far they fan out, in degrees. */
  n: number
  len: number
  spread: number
  twig: Vec3
  twigR?: number
  item: Item
  size: number
  /** Florets at each twig's end. */
  per?: number
  /** A small leaf at each twig's foot. */
  leaf?: { shape: Petal; paint: Paint }
}

export function spray(m: Maker, f: Spray, seed: number) {
  for (let i = 0; i < f.n; i++) {
    const a = i * GOLDEN + seed, lean = f.spread * D * Math.sqrt((i + 0.35) / f.n)
    const l = f.len * (0.65 + 0.5 * hash(seed, i))
    const d: Vec3 = [Math.sin(lean) * Math.cos(a), Math.cos(lean), Math.sin(lean) * Math.sin(a)]
    // the twig leaves the stem at a third of its length up and bows out
    const foot: Vec3 = [0, -f.len * 0.25 * (1 - hash(seed, i, 6) * 0.6), 0]
    const tip = mul(d, l)
    const mid = add(mul(add(foot, tip), 0.5), [0, l * 0.14, 0])
    m.newPart()
    const path: Vec3[] = []
    for (let k = 0; k <= 6; k++) { const t = k / 6, s = 1 - t; path.push([s * s * foot[0] + 2 * s * t * mid[0] + t * t * tip[0], s * s * foot[1] + 2 * s * t * mid[1] + t * t * tip[1], s * s * foot[2] + 2 * s * t * mid[2] + t * t * tip[2]]) }
    m.tube(path, () => f.twigR ?? 0.012, () => f.twig)
    const per = f.per ?? 1
    for (let k = 0; k < per; k++) {
      const off: Vec3 = per > 1 ? [(hash(seed, i, k) - 0.5) * f.size * 1.6, (hash(seed, i, k + 20) - 0.6) * f.size * 1.4, (hash(seed, i, k + 40) - 0.5) * f.size * 1.6] : [0, 0, 0]
      const axis = unit(add(d, [off[0] * 2, 0.4, off[2] * 2]))
      m.within(add(tip, off), mulQ(upTo(axis), axisAngle([0, 1, 0], hash(seed, i, k + 60) * 6.28)), f.size * (0.8 + 0.4 * hash(seed, i, k + 80)), () => item(m, f.item, seed * 7 + i * 5 + k))
    }
    if (f.leaf) m.within(mul(add(foot, mid), 0.5), mulQ(upTo(unit(add(d, [0, 0.6, 0]))), axisAngle([0, 1, 0], a)), 1, () => petal(m, f.leaf!.shape, f.leaf!.paint, seed + i))
  }
}

/** A tuft of long blades or leaves from one point: grass, a fan of fern, a rosette of leaves. */
export interface Blades {
  n: number
  blade: Petal
  paint: Paint
  /** How far they fan out from the axis, in degrees, and how unalike they are. */
  spread: number
  wild?: number
  finish?: Finish
}

export function blades(m: Maker, f: Blades, seed: number) {
  const wild = f.wild ?? 0.4
  for (let i = 0; i < f.n; i++) {
    const a = i * GOLDEN + seed
    const lean = f.spread * Math.sqrt((i + 0.4) / f.n)
    const b: Petal = { ...f.blade, open: 90 - lean + (hash(seed, i) - 0.5) * 20 * wild, tip: f.blade.tip - lean + (hash(seed, i, 1) - 0.5) * 40 * wild, len: f.blade.len * (1 + (hash(seed, i, 2) - 0.5) * 0.5 * wild), twist: (f.blade.twist ?? 0) + (hash(seed, i, 3) - 0.5) * 60 * wild }
    const tone = 0.9 + 0.2 * hash(seed, i, 4)
    m.within([0, 0, 0], about(a), 1, () => petal(m, b, { ...f.paint, base: mul(f.paint.base, tone), tip: mul(f.paint.tip, tone) }, seed * 5 + i, f.finish))
  }
}

/** A flower head: one of the five plans. */
export type Head = { rosette: Rosette } | { along: Along } | { cluster: Cluster } | { spray: Spray } | { blades: Blades }

/** Makes a head standing on the origin. */
export function head(m: Maker, h: Head, seed: number) {
  if ('rosette' in h) rosette(m, h.rosette, seed)
  else if ('along' in h) along(m, h.along, seed)
  else if ('cluster' in h) cluster(m, h.cluster, seed)
  else if ('spray' in h) spray(m, h.spray, seed)
  else blades(m, h.blades, seed)
}

/** About how far a head reaches from its foot, in its own units: for keeping heads apart. */
export function reach(h: Head): number {
  if ('rosette' in h) return Math.max(h.rosette.r[1] + h.rosette.outer.len * Math.max(0.35, Math.cos(((h.rosette.outer.open + h.rosette.outer.tip) / 2) * D)), h.rosette.inner.len * 0.6)
  if ('along' in h) return Math.max(h.along.len * 0.5, Math.max(...h.along.size) * 1.1 + h.along.len * 0.2)
  if ('cluster' in h) return Math.max(h.cluster.r[0], h.cluster.r[1]) + h.cluster.size * 0.5
  if ('spray' in h) return h.spray.len * 0.8
  return h.blades.blade.len * (0.5 + 0.5 * Math.sin((Math.min(90, h.blades.spread) * Math.PI) / 180))
}
