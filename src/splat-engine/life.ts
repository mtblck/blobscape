import type { Vec3 } from '../splat-core/blobs.ts'
import { hash } from './built.ts'
import { cone, many, sphere, union, type Shape } from './voxel.ts'

/**
 * Living forms (issue #178): trees grown by space colonization, ribbed cacti, succulent rosettes, bracket fungi,
 * brain coral, shells wound on a log spiral, horns that curl, antlers with tines and a spine of ribs. Pure numbers and
 * distance functions: each lights, shadows, grows (on a bone with a `sprout` move) and rigs like any other part.
 *
 * The idea comes from Silicon Jungle's Ink Studio living-forms kit; this is our own code.
 */

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const norm = (v: Vec3): Vec3 => { const l = len(v) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

/** A seeded random number source. */
function rng(seed: number) {
  let s = (Math.floor(seed) * 2654435761) >>> 0 || 1
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 }
}

/** Tubes through a list of points, each point with its own radius: the pieces of a horn, an antler, a shell. */
function tube(points: Vec3[], radii: number[], thin: number): Shape[] {
  const out: Shape[] = []
  for (let i = 1; i < points.length; i++) out.push(cone(points[i - 1], points[i], Math.max(radii[i - 1], thin), Math.max(radii[i], thin * 0.6)))
  return out
}

// --- Trees by space colonization

/** A tree for `tree`, grown by space colonization. */
export interface TreeSpec {
  /** The foot of the trunk. */
  at: Vec3
  /** How high the trunk rises before the crown. */
  height: number
  /** The crown's radii: the space its branches grow to fill. */
  crown: Vec3
  /** The trunk's radius at its foot; every limb is as thick as what it carries. */
  r: number
  /** Points scattered through the crown that the branches grow toward (160). More makes a finer tree. */
  points?: number
  /** The same seed gives the same result. */
  seed: number
}

/** One joint of a grown tree: its place, the joint it grew from and the limb's radius there. */
export interface TreeNode {
  /** Where the joint is. */
  p: Vec3
  /** The joint it grew from, or -1 for the foot. */
  parent: number
  /** The limb's radius here. */
  r: number
}

/**
 * Grows a tree by space colonization: points are scattered through the crown, and every point pulls the nearest
 * branch tip toward it until a branch reaches it. Then each limb is made as thick as what it carries (the pipe rule:
 * a limb's radius to the 2.5 is the sum of its children's), scaled so the trunk's foot is `r`.
 */
export function colonize(s: TreeSpec): { nodes: TreeNode[]; ends: number[] } {
  const rand = rng(s.seed + 1)
  const n = Math.min(400, Math.max(10, Math.round(s.points ?? 160)))
  const mid: Vec3 = [s.at[0], s.at[1] + s.height + s.crown[1] * 0.8, s.at[2]]
  const pts: Vec3[] = []
  while (pts.length < n) {
    const q: Vec3 = [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1]
    if (dot(q, q) <= 1) pts.push([mid[0] + q[0] * s.crown[0], mid[1] + q[1] * s.crown[1], mid[2] + q[2] * s.crown[2]])
  }
  const reachOf = Math.max(s.crown[0], s.crown[1], s.crown[2])
  const step = reachOf / 7, influence = step * 4, kill = step * 1.3
  const nodes: TreeNode[] = [{ p: s.at, parent: -1, r: 0 }]
  // the trunk rises until the crown's points can reach it
  for (let k = 0; k < 64; k++) {
    const top = nodes[nodes.length - 1].p
    if (pts.some((q) => len(sub(q, top)) < influence) || top[1] > mid[1]) break
    nodes.push({ p: [top[0], top[1] + step, top[2]], parent: nodes.length - 1, r: 0 })
  }
  let alive = pts.slice()
  for (let it = 0; it < 80 && alive.length && nodes.length < 700; it++) {
    const pull = new Map<number, Vec3>()
    for (const q of alive) {
      let best = -1, bd = influence
      for (let i = 0; i < nodes.length; i++) { const d = len(sub(q, nodes[i].p)); if (d < bd) { bd = d; best = i } }
      if (best < 0) continue
      const dir = norm(sub(q, nodes[best].p)), was = pull.get(best) ?? [0, 0, 0]
      pull.set(best, add(was, dir))
    }
    if (!pull.size) break
    const fresh: number[] = []
    for (const [i, d] of pull) {
      // a little pull toward the sky, and a wobble so limbs aren't ruler straight
      const dir = norm(add(norm(d), [(rand() - 0.5) * 0.3, 0.12, (rand() - 0.5) * 0.3]))
      const p = add(nodes[i].p, mul(dir, step))
      if (nodes.some((m) => len(sub(m.p, p)) < step * 0.3)) continue
      fresh.push(nodes.push({ p, parent: i, r: 0 }) - 1)
    }
    if (!fresh.length) break
    alive = alive.filter((q) => !fresh.some((i) => len(sub(q, nodes[i].p)) < kill))
  }
  // as thick as what it carries: tips first (children always come after their parents)
  const kids = nodes.map(() => 0)
  for (const m of nodes) if (m.parent >= 0) kids[m.parent]++
  const ends = nodes.map((_, i) => i).filter((i) => kids[i] === 0)
  const pow = nodes.map((_, i) => (kids[i] === 0 ? 1 : 0))
  for (let i = nodes.length - 1; i > 0; i--) pow[nodes[i].parent] += pow[i]
  const scale = s.r / pow[0] ** (1 / 2.5)
  for (let i = 0; i < nodes.length; i++) nodes[i].r = pow[i] ** (1 / 2.5) * scale
  return { nodes, ends }
}

/** A tree grown by space colonization (see colonize): its limbs, and if `leaves` is set a ball that size at each end. */
export function tree(s: TreeSpec & { leaves?: number; only?: 'limbs' | 'leaves' }, thin = 0): Shape {
  const { nodes, ends } = colonize(s)
  const parts: Shape[] = []
  if (s.only !== 'leaves') for (let i = 1; i < nodes.length; i++) {
    const m = nodes[i], up = nodes[m.parent]
    parts.push(cone(up.p, m.p, Math.max(up.r, thin), Math.max(m.r, thin * 0.6)))
  }
  if (s.only !== 'limbs' && s.leaves) for (const i of ends) parts.push(sphere(nodes[i].p, Math.max(s.leaves, thin * 1.2)))
  return parts.length ? many(parts) : sphere(s.at, thin * 1.2)
}

// --- Cacti and succulents

/** A ribbed cactus for `cactus`. */
export interface CactusSpec {
  /** Where it stands. */
  at: Vec3
  /** How tall the trunk is. */
  height: number
  /** The trunk's radius. */
  r: number
  /** Ribs round it (8). */
  ribs?: number
  /** Arms, 0 to 4. */
  arms?: number
  /** The same seed gives the same result. */
  seed: number
}

/** A ribbed tube along a path of points: the distance to its nearest segment, less a radius that ripples round it. */
function ribbed(path: Vec3[], r: number, ribs: number, depth: number): (x: number, y: number, z: number) => number {
  const segs = path.slice(1).map((b, i) => {
    const a = path[i], d = norm(sub(b, a)), l = len(sub(b, a))
    const u = norm(Math.abs(d[1]) < 0.9 ? cross(d, [0, 1, 0]) : cross(d, [1, 0, 0])), v = cross(d, u)
    return { a, d, l, u, v }
  })
  return (x, y, z) => {
    let best = Infinity
    for (let i = 0; i < segs.length; i++) {
      const g = segs[i], q = sub([x, y, z], g.a)
      const t = Math.min(g.l, Math.max(0, dot(q, g.d)))
      const off = sub(q, mul(g.d, t)), rho = len(off)
      const ang = Math.atan2(dot(off, g.v), dot(off, g.u))
      // only the far end of the last segment is rounded
      const end = i === segs.length - 1 && dot(q, g.d) > g.l
      const k = r * (1 - depth * (0.5 - 0.5 * Math.cos(ang * ribs)))
      best = Math.min(best, (end ? len(sub(q, mul(g.d, g.l))) : rho) - k)
      if (i === 0 && dot(q, g.d) < 0) best = Math.max(best, -dot(q, g.d))
    }
    // the ribs make the surface wavier than its distance: a little short of it, so it is never overstated
    return best * 0.85
  }
}

/** The arms of a cactus: out from the trunk, a bend, and up. */
export function cactusArms(s: CactusSpec): Vec3[][] {
  const n = Math.min(4, Math.max(0, Math.round(s.arms ?? 2)))
  return Array.from({ length: n }, (_, k) => {
    const r = (q: number) => hash(s.seed, k, q)
    const ang = (k / Math.max(1, n)) * Math.PI * 2 + r(1) * 1.2
    const out: Vec3 = [Math.cos(ang), 0, Math.sin(ang)]
    const y = s.at[1] + s.height * (0.32 + 0.3 * r(2))
    const reach = s.r * (1.5 + 0.9 * r(3)), rise = s.height * (0.18 + 0.25 * r(4))
    const p0: Vec3 = [s.at[0], y, s.at[2]]
    const p1 = add(p0, mul(out, reach))
    return [p0, p1, add(p1, [out[0] * s.r * 0.25, rise * 0.4, out[2] * s.r * 0.25]), add(p1, [out[0] * s.r * 0.25, rise, out[2] * s.r * 0.25])]
  })
}

/** A ribbed column of a cactus, with arms that bend up. */
export function cactus(s: CactusSpec): Shape {
  const ribs = Math.max(3, Math.round(s.ribs ?? 8))
  const trunk = ribbed([s.at, [s.at[0], s.at[1] + s.height - s.r, s.at[2]]], s.r, ribs, 0.14)
  const arms = cactusArms(s).map((p) => ribbed(p, s.r * 0.62, ribs, 0.14))
  const R = s.r * 4
  return {
    sdf: (x, y, z) => { let d = trunk(x, y, z); for (const a of arms) d = Math.min(d, a(x, y, z)); return d },
    min: [s.at[0] - R, s.at[1], s.at[2] - R], max: [s.at[0] + R, s.at[1] + s.height, s.at[2] + R],
  }
}

/** A succulent's rosette of leaves, for `rosette`. */
export interface RosetteSpec {
  /** Its middle, on the ground. */
  at: Vec3
  /** How far the outer leaves reach. */
  r: number
  /** How many leaves, 3 to 60. */
  leaves: number
  /** The same seed gives the same result. */
  seed: number
}

/** A succulent: thick pointed leaves set round a spiral by the golden angle, the inner ones short and upright. */
export function rosette(s: RosetteSpec, thin = 0): Shape {
  const n = Math.min(60, Math.max(3, Math.round(s.leaves)))
  const parts: Shape[] = []
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 1 : k / (n - 1), a = k * GOLDEN + hash(s.seed, k) * 0.2
    const l = s.r * (0.3 + 0.7 * t), tilt = (12 + 66 * t) * (Math.PI / 180)
    const dir: Vec3 = [Math.sin(tilt) * Math.cos(a), Math.cos(tilt), Math.sin(tilt) * Math.sin(a)]
    const base = add(s.at, [Math.cos(a) * s.r * 0.06 * t, 0, Math.sin(a) * s.r * 0.06 * t])
    parts.push(cone(base, add(base, mul(dir, l)), Math.max(l * 0.24, thin), thin * 0.6))
  }
  return many(parts)
}

// --- Fungi and coral

/** Bracket fungi up a trunk, for `brackets`. */
export interface BracketSpec {
  /** Where the lowest shelf meets the trunk. */
  at: Vec3
  /** The way the shelves face out from the trunk: [x, z]. */
  facing: [number, number]
  /** How far the biggest shelf stands out. */
  r: number
  /** How many shelves. */
  count: number
  /** The same seed gives the same result. */
  seed: number
}

/** Bracket fungi: half-round shelves stacked up a trunk, smaller as they go up, flat below and domed above. */
export function brackets(s: BracketSpec): Shape {
  const fl = Math.hypot(s.facing[0], s.facing[1]) || 1, f: Vec3 = [s.facing[0] / fl, 0, s.facing[1] / fl]
  const shelves = Array.from({ length: Math.min(8, Math.max(1, Math.round(s.count))) }, (_, k) => {
    const r = s.r * (1 - 0.18 * k) * (0.85 + 0.3 * hash(s.seed, k)), side = (hash(s.seed, k, 2) - 0.5) * s.r * 0.8
    const c: Vec3 = [s.at[0] - f[2] * side, s.at[1] + k * s.r * 0.55, s.at[2] + f[0] * side]
    return { c, r }
  })
  const sdf = (x: number, y: number, z: number) => {
    let d = Infinity
    for (const { c, r } of shelves) {
      const q = sub([x, y, z], c)
      const out = dot(q, f), along = q[0] * -f[2] + q[2] * f[0]
      // a flattened half dome: wide out from the trunk and along it, thin up and down
      const e = (Math.hypot(out / r, along / (r * 1.1), q[1] / (r * 0.3)) - 1) * r * 0.3
      d = Math.min(d, Math.max(e, -out, -q[1] - r * 0.04))
    }
    return d
  }
  const top = shelves[shelves.length - 1].c[1] + s.r * 0.3, R = s.r * 1.4
  return { sdf, min: [s.at[0] - R, s.at[1] - s.r * 0.1, s.at[2] - R], max: [s.at[0] + R, top, s.at[2] + R] }
}

/** A brain coral for `brain`. */
export interface BrainSpec {
  /** The middle of its foot. */
  at: Vec3
  /** Its radius. */
  r: number
  /** How wide a groove is; left out, about a sixth of the radius. */
  groove?: number
  /** The same seed gives the same result. */
  seed: number
}

/** Brain coral: a dome worn into meandering ridges and grooves. */
export function brain(s: BrainSpec): Shape {
  const g = s.groove ?? s.r * 0.16, k = Math.PI / g, ph = hash(s.seed, 1) * 6
  const sdf = (x: number, y: number, z: number) => {
    const q = sub([x, y, z], s.at)
    const m = Math.sin(q[0] * k + 1.6 * Math.sin(q[2] * k * 0.7 + ph)) * Math.sin(q[2] * k + 1.3 * Math.sin(q[1] * k * 0.8 - ph)) + 0.4 * Math.sin(q[1] * k * 1.1 + q[0] * k * 0.5)
    const groove = 1 - Math.min(1, Math.abs(m) / 0.45)
    const dome = len(q) - s.r + groove * g * 0.45
    return Math.max(dome * 0.7, -q[1] - s.r * 0.05)
  }
  return { sdf, min: [s.at[0] - s.r, s.at[1] - s.r * 0.05, s.at[2] - s.r], max: [s.at[0] + s.r, s.at[1] + s.r, s.at[2] + s.r] }
}

// --- Shells, horns, antlers and ribs

/** A coiled shell for `shell`. */
export interface ShellSpec {
  /** The middle of its coil. */
  at: Vec3
  /** About its width. */
  size: number
  /** Whorls (3). */
  turns?: number
  /** 0 a flat coil (nautilus) to 1 a tall spire (whelk). */
  spire?: number
  /** Which way it faces, in degrees about the upright. */
  facing?: number
}

/** Points and radii of a shell's coil: a tube wound on a log spiral, growing by the same share each turn. */
export function shellCoil(s: ShellSpec): { points: Vec3[]; radii: number[] } {
  const turns = s.turns ?? 3, spire = s.spire ?? 0
  const steps = Math.round(turns * 24), T = turns * Math.PI * 2
  // each whorl about 2.4 times the size of the one inside it
  const b = Math.log(2.4) / (Math.PI * 2)
  const R = s.size * 0.32, face = ((s.facing ?? 0) * Math.PI) / 180
  const points: Vec3[] = [], radii: number[] = []
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * T, g = Math.exp(b * (th - T))
    const rad = R * g, tubeR = rad * (0.62 - 0.22 * spire)
    // a nautilus coils upright; a whelk coils flat and runs down its spire
    const local: Vec3 = spire > 0.05 ? [Math.cos(th) * rad, -spire * (1 - g) * s.size * 1.2 + rad * 0.2, Math.sin(th) * rad] : [Math.cos(th) * rad, Math.sin(th) * rad, 0]
    points.push([s.at[0] + local[0] * Math.cos(face) - local[2] * Math.sin(face), s.at[1] + local[1], s.at[2] + local[0] * Math.sin(face) + local[2] * Math.cos(face)])
    radii.push(tubeR)
  }
  return { points, radii }
}

/** A shell wound on a log spiral; each stretch of the tube is a piece, so `pieces` paints it in bands. */
export function shell(s: ShellSpec, thin = 0): Shape {
  const { points, radii } = shellCoil(s)
  // a band a quarter turn long
  const parts: Shape[] = []
  for (let i = 0; i + 6 < points.length; i += 6) parts.push(union(...tube(points.slice(i, i + 7), radii.slice(i, i + 7), thin)))
  return many(parts)
}

/** A horn for `horn`. */
export interface HornSpec {
  /** The root, on the head. */
  at: Vec3
  /** The way it first grows. */
  dir: Vec3
  /** How long it is along its curl. */
  length: number
  /** At the root. */
  r: number
  /** Turns of its curl: 0 straight, 1 a full ram's curl. */
  curl?: number
  /** How far it winds sideways as it curls, as a corkscrew does, 0 to 1. */
  twist?: number
  /** Rings round it (12). */
  ridges?: number
}

/** The path of a horn: a curve that turns `curl` times in the plane its first way and the sky make, drifting sideways by `twist`. */
export function hornPath(s: HornSpec): { points: Vec3[]; radii: number[] } {
  const d0 = norm(s.dir)
  const up = norm(sub([0, 1, 0], mul(d0, d0[1])))
  const n = Math.abs(d0[1]) > 0.95 ? norm(cross(d0, [1, 0, 0])) : up
  const side = cross(d0, n)
  const steps = 32, curl = s.curl ?? 0.5, twist = s.twist ?? 0.2, ridges = s.ridges ?? 12
  let p = s.at
  const points: Vec3[] = [p], radii: number[] = [s.r]
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, phi = curl * Math.PI * 2 * t
    // curls down and back round (toward -n), as a ram's horn does
    const tan = norm(add(add(mul(d0, Math.cos(phi)), mul(n, -Math.sin(phi))), mul(side, twist * 0.6)))
    p = add(p, mul(tan, s.length / steps))
    points.push(p)
    radii.push(s.r * ((1 - t) ** 0.85 * 0.92 + 0.08) * (1 + 0.07 * Math.sin(t * ridges * Math.PI * 2)))
  }
  return { points, radii }
}

/**
 * A horn: a tapering tube that curls and can wind sideways. `thin` is the least radius it may have, so its tip never
 * slips between grid cells.
 */
export function horn(s: HornSpec, thin = 0): Shape {
  const { points, radii } = hornPath(s)
  return many(tube(points, radii, thin))
}

/** An antler for `antler`. */
export interface AntlerSpec {
  /** The root, on the head. */
  at: Vec3
  /** The way the main beam leaves the head. */
  dir: Vec3
  /** How long the main beam is. */
  length: number
  /** The beam's radius at the root. */
  r: number
  /** Tines off the main beam, 1 to 8. */
  tines: number
  /** The same seed gives the same result. */
  seed: number
}

/** An antler: a main beam that sweeps up, back and round, with tines rising off it, shorter toward the tip. */
export function antler(s: AntlerSpec, thin = 0): Shape {
  const beam = hornPath({ at: s.at, dir: s.dir, length: s.length, r: s.r, curl: -0.18, twist: 0.25, ridges: 0 })
  const parts = tube(beam.points, beam.radii.map((r, i) => Math.max(r, s.r * 0.35 * (1 - i / beam.points.length))), thin)
  const n = Math.min(8, Math.max(1, Math.round(s.tines)))
  for (let k = 0; k < n; k++) {
    const i = Math.round(((k + 1) / (n + 1)) * (beam.points.length - 2)) + 1
    const p = beam.points[i], along = norm(sub(beam.points[i + 1] ?? p, beam.points[i - 1]))
    const sideways = (hash(s.seed, k) - 0.5) * 0.6
    const dir = norm(add(add([0, 1, 0], mul(along, 0.35)), mul(norm(cross(along, [0, 1, 0])), sideways)))
    const l = s.length * (0.38 - 0.18 * (k / n)) * (0.8 + 0.4 * hash(s.seed, k, 2))
    parts.push(cone(p, add(p, mul(dir, l)), Math.max(beam.radii[i] * 0.75, thin), thin * 0.6))
  }
  return many(parts)
}

/** A rib cage for `ribs`. */
export interface RibsSpec {
  /** The ends of the spine. */
  from: Vec3
  /** The spine's other end. */
  to: Vec3
  /** Pairs of ribs. */
  count: number
  /** How far out each side the widest rib reaches. */
  span: number
  /** How far down they curve. */
  drop: number
  /** A rib's radius. */
  r: number
}

/** A spine of vertebrae with ribs curving out and down each side, widest in the middle: a whale's bones on a beach, a beast's chest. */
export function ribs(s: RibsSpec, thin = 0): Shape {
  const along = norm(sub(s.to, s.from)), l = len(sub(s.to, s.from))
  const side = norm(Math.abs(along[1]) > 0.95 ? cross(along, [1, 0, 0]) : cross(along, [0, 1, 0]))
  const down = cross(along, side)
  const n = Math.min(16, Math.max(1, Math.round(s.count)))
  const parts: Shape[] = []
  const bones = Math.max(n * 2, 4)
  for (let i = 0; i <= bones; i++) parts.push(sphere(add(s.from, mul(along, (l * i) / bones)), Math.max(s.r * 1.6, thin * 1.2)))
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n, v = add(s.from, mul(along, l * (0.08 + 0.84 * t)))
    const w = s.span * Math.sin(Math.PI * (0.15 + 0.7 * t)) ** 0.6, dr = s.drop * (0.6 + 0.4 * Math.sin(Math.PI * t))
    for (const sgn of [-1, 1]) {
      const sd = mul(side, sgn)
      const pts: Vec3[] = [v, add(add(v, mul(sd, w * 0.55)), mul(down, -dr * 0.1)), add(add(v, mul(sd, w)), mul(down, dr * 0.35)), add(add(v, mul(sd, w * 0.95)), mul(down, dr * 0.75)), add(add(v, mul(sd, w * 0.7)), mul(down, dr))]
      parts.push(...tube(pts, pts.map((_, i) => s.r * (1 - i * 0.12)), thin))
    }
  }
  return many(parts)
}
