import type { Vec3 } from '../splat-core/blobs.ts'
import { buildBody, mix, type BodySpec, type Built, type Part } from './body.ts'
import { set, Z } from './posing.ts'
import type { Bone, Skeleton } from './rig.ts'

/**
 * A watch movement made of blobs, every wheel turning as a real one does.
 *
 * The going train is a real one: the barrel drives the centre wheel (one turn
 * an hour, the minute hand), which drives the third wheel, then the fourth
 * (one turn a minute, the small seconds), then the escape wheel. The pallet
 * fork lets the escape wheel through half a tooth each time the balance swings
 * past its centre, five times a second (18,000 beats an hour, as in many
 * real watches), so the whole train ticks forward in small steps.
 *
 * Each moving arbor is one bone that turns about the watch's axis (z, towards
 * you). Teeth are placed so they mesh: where a wheel meets a pinion, a tooth
 * of one sits in a gap of the other, at every moment, because both turn by
 * the train's ratios from that start.
 *
 * Pure, so Node tests can check the ratios, the meshing and the beat.
 */

/** Tooth size (module, in world units): pitch radius = module × teeth / 2. */
const M = 0.0085

export interface Wheel {
  /** The bone that turns it. */
  arbor: string
  teeth: number
  z: number
  /** Where its first tooth points at rest (radians from +x). */
  phase: number
}

interface Arbor { name: string; at: [number, number]; back: number; front: number }

/** Beats a second: 18,000 an hour. */
export const BEATS = 5
/** Half a tooth of the 15-tooth escape wheel per beat. */
const ESCAPE_STEP = Math.PI / 15

const pitch = (teeth: number) => (M * teeth) / 2
const polar = (from: [number, number], d: number, a: number): [number, number] => [from[0] + d * Math.cos(a), from[1] + d * Math.sin(a)]
const angleOf = (a: [number, number], b: [number, number]) => Math.atan2(b[1] - a[1], b[0] - a[0])

// The train: tooth counts, and which wheel drives which pinion
export const TEETH = {
  barrel: 72, centrePinion: 10,
  centre: 64, thirdPinion: 8,
  third: 60, fourthPinion: 8,
  fourth: 80, escapePinion: 8,
  escape: 15,
} as const

/** Arbor positions: each one placed so the wheel and pinion that meet are exactly their pitch radii apart. */
export function layout() {
  const centre: [number, number] = [0, 0]
  const barrel = polar(centre, pitch(TEETH.barrel) + pitch(TEETH.centrePinion), (3 * Math.PI) / 4)
  const third = polar(centre, pitch(TEETH.centre) + pitch(TEETH.thirdPinion), -Math.PI / 6)
  const fourth = polar(third, pitch(TEETH.third) + pitch(TEETH.fourthPinion), (-2 * Math.PI) / 3)
  const escape = polar(fourth, pitch(TEETH.fourth) + pitch(TEETH.escapePinion), (13 * Math.PI) / 12)
  // the pallet fork sits between the escape wheel and the balance
  const pallet = polar(escape, 0.19, (8 * Math.PI) / 9)
  const balance = polar(pallet, 0.215, (8 * Math.PI) / 9)
  return { centre, barrel, third, fourth, escape, pallet, balance }
}

export type Layout = ReturnType<typeof layout>

/**
 * Every meshing pair: the driver's teeth and the driven's, on their arbors and
 * layers. The driver's first tooth points at the driven arbor, the driven one
 * is turned half a tooth so a gap meets it.
 */
export function meshes(L = layout()) {
  const pair = (driver: keyof Layout, dt: number, driven: keyof Layout, nt: number, z: number) => {
    const a = angleOf(L[driver], L[driven])
    return {
      driver: { arbor: driver, teeth: dt, z, phase: a } as Wheel,
      driven: { arbor: driven, teeth: nt, z, phase: a + Math.PI + Math.PI / nt } as Wheel,
    }
  }
  return [
    pair('barrel', TEETH.barrel, 'centre', TEETH.centrePinion, 0),
    pair('centre', TEETH.centre, 'third', TEETH.thirdPinion, 0.06),
    pair('third', TEETH.third, 'fourth', TEETH.fourthPinion, 0),
    pair('fourth', TEETH.fourth, 'escape', TEETH.escapePinion, 0.12),
  ]
}

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
/** The share of a beat the escape wheel takes to move: the rest of the time it is locked. */
const DROP = 0.14

export interface Angles { barrel: number; centre: number; third: number; fourth: number; escape: number; pallet: number; balance: number; hour: number }

/**
 * Every arbor's turn (radians, about +z, so clockwise is negative) at `s`
 * seconds past twelve: the hands read that time.
 */
export function anglesAt(s: number): Angles {
  const b = s * BEATS
  const n = Math.floor(b)
  const step = smooth((b - n) / DROP)
  const escape = (n + step) * ESCAPE_STEP
  const fourth = -escape * (TEETH.escapePinion / TEETH.fourth)
  const third = -fourth * (TEETH.fourthPinion / TEETH.third)
  const centre = -third * (TEETH.thirdPinion / TEETH.centre)
  const barrel = -centre * (TEETH.centrePinion / TEETH.barrel)
  // the fork flips to the other banking pin as the balance swings through
  const side = (k: number) => (k % 2 === 0 ? 1 : -1)
  // the fork is pushed by the balance's impulse pin, so it turns the other way to the balance as it passes
  const pallet = -0.17 * (side(n - 1) + (side(n) - side(n - 1)) * step)
  // two swings (a beat each) per period, through the centre at each beat
  const balance = 3.6 * Math.sin(Math.PI * b)
  return { barrel, centre, third, fourth, escape, pallet, balance, hour: centre / 12 }
}

/** Seconds past twelve (on a 12-hour dial) for a Date: where the hands should point. */
export const secondsOf = (d: Date) => ((d.getHours() % 12) * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000)

const MOVING = ['barrel', 'centre', 'third', 'fourth', 'escape', 'pallet', 'balance'] as const

/** Sets every arbor and hand for the time `s` seconds past twelve. */
export function poseClock(sk: Skeleton, s: number) {
  sk.reset()
  const a = anglesAt(s)
  for (const name of MOVING) set(sk, name, Z, a[name])
  set(sk, 'hour', Z, a.hour)
  sk.update()
}

// --- Looks

const BRASS: Vec3 = [0.86, 0.64, 0.3], GOLD: Vec3 = [0.95, 0.76, 0.38], ROSE: Vec3 = [0.93, 0.6, 0.45]
const STEEL: Vec3 = [0.78, 0.8, 0.84], BLUED: Vec3 = [0.12, 0.2, 0.62], RUBY: Vec3 = [0.85, 0.06, 0.2]
const NICKEL: Vec3 = [0.72, 0.74, 0.78], SLATE: Vec3 = [0.17, 0.18, 0.21], ENAMEL: Vec3 = [0.96, 0.94, 0.88], INK: Vec3 = [0.08, 0.08, 0.1]

/** Perlage: overlapping circular grain, as on a hand-finished main plate. */
function perlage(p: Vec3): Vec3 {
  const g = 0.07
  const cx = Math.round(p[0] / g) * g, cy = Math.round(p[1] / g) * g
  const r = Math.hypot(p[0] - cx, p[1] - cy) / g
  return mix(SLATE, [0.3, 0.32, 0.36], 0.5 + 0.5 * Math.sin(r * 22))
}

/** Côtes de Genève: wide stripes across the bridges. */
const stripes = (base: Vec3) => (p: Vec3): Vec3 => mix(base, [1, 1, 1], 0.12 + 0.12 * Math.sin((p[0] * 0.8 + p[1]) * 55))

/** Sunburst: a brass wheel's grain, from its centre. */
const sunburst = (c: [number, number], base: Vec3) => (p: Vec3): Vec3 => mix(base, [1, 0.92, 0.7], 0.2 + 0.15 * Math.sin(Math.atan2(p[1] - c[1], p[0] - c[0]) * 48))

// --- Shapes, as flat sheets (double-sided) and tubes

type V2 = [number, number]
const at3 = (p: V2, z: number): Vec3 => [p[0], p[1], z]

function annulus(c: V2, z: number, r0: number, r1: number, seg = 48): Vec3[][] {
  const t: Vec3[][] = []
  for (let k = 0; k < seg; k++) {
    const a = (k / seg) * Math.PI * 2, b = ((k + 1) / seg) * Math.PI * 2
    const p = (r: number, ang: number) => at3(polar(c, r, ang), z)
    if (r0 > 0) t.push([p(r0, a), p(r1, a), p(r1, b)], [p(r0, a), p(r1, b), p(r0, b)])
    else t.push([at3(c, z), p(r1, a), p(r1, b)])
  }
  return t
}

const disc = (c: V2, z: number, r: number, seg = 32) => annulus(c, z, 0, r, seg)

/** A flat bar from a to b, `w` wide, with rounded ends. */
function bar(a: V2, b: V2, w: number, z: number): Vec3[][] {
  const ang = angleOf(a, b) + Math.PI / 2
  const o: V2 = [Math.cos(ang) * w / 2, Math.sin(ang) * w / 2]
  const q = (p: V2, s: number): Vec3 => [p[0] + o[0] * s, p[1] + o[1] * s, z]
  return [[q(a, 1), q(b, 1), q(b, -1)], [q(a, 1), q(b, -1), q(a, -1)], ...disc(a, z, w / 2, 12), ...disc(b, z, w / 2, 12)]
}

const tube = (a: Vec3, b: Vec3, ra: number, rb = ra) => ({ tube: [a, b] as [Vec3, Vec3], r: [ra, rb] as [number, number] })

// --- Wheels and pinions

function wheel(w: Wheel, c: V2, colour: Vec3, spokes = 5): Part[] {
  const r = pitch(w.teeth)
  const root = r - 1.25 * M, tip = r + M
  const rim = Math.max(0.018, r * 0.12)
  const tw = Math.min(M * 0.8, (Math.PI * r) / w.teeth * 0.45)
  const parts: Part[] = [
    { shape: { sheet: [...annulus(c, w.z, root - rim, root, Math.max(48, w.teeth))] }, colour: sunburst(c, colour), bones: [w.arbor], density: 2, size: 0.7 },
    { shape: { sheet: disc(c, w.z, Math.max(0.025, r * 0.16), 24) }, colour: sunburst(c, colour), bones: [w.arbor] },
  ]
  // curved spokes, each two bars, as on a fine movement
  for (let k = 0; k < spokes; k++) {
    const a = w.phase + (k / spokes) * Math.PI * 2 + 0.2
    const mid = polar(c, (root - rim) * 0.55, a + 0.25)
    parts.push({ shape: { sheet: [...bar(polar(c, r * 0.14, a), mid, rim * 0.7, w.z), ...bar(mid, polar(c, root - rim * 0.5, a + 0.38), rim * 0.7, w.z)] }, colour: sunburst(c, colour), bones: [w.arbor], density: 2, size: 0.7 })
  }
  const teeth: Vec3[][] = []
  for (let k = 0; k < w.teeth; k++) {
    const a = w.phase + (k / w.teeth) * Math.PI * 2
    // a tooth: wide at the root, narrowing to the tip
    const side = (rr: number, s: number, wd: number) => at3(polar(c, rr, a + (s * wd) / rr), w.z)
    teeth.push([side(root, 1, tw), side(tip, 1, tw * 0.55), side(tip, -1, tw * 0.55)], [side(root, 1, tw), side(tip, -1, tw * 0.55), side(root, -1, tw)])
  }
  parts.push({ shape: { sheet: teeth }, colour, bones: [w.arbor], density: 7, size: 0.4 })
  return parts
}

/** A pinion: steel leaves along the arbor, `depth` deep at layer z. */
function pinion(w: Wheel, c: V2, depth = 0.035): Part[] {
  const r = pitch(w.teeth)
  const leaves: Part[] = [{ shape: tube(at3(c, w.z - depth / 2), at3(c, w.z + depth / 2), r - 1.25 * M), colour: STEEL, bones: [w.arbor], density: 3, size: 0.5 }]
  for (let k = 0; k < w.teeth; k++) {
    const a = w.phase + (k / w.teeth) * Math.PI * 2
    const p = polar(c, r - 0.2 * M, a)
    leaves.push({ shape: tube(at3(p, w.z - depth / 2), at3(p, w.z + depth / 2), M * 0.55), colour: STEEL, bones: [w.arbor], density: 7, size: 0.4 })
  }
  return leaves
}

const BACK = -0.06, BRIDGE = 0.17, DIAL = 0.24

/** The bones: the plate (still), one per moving arbor, and the hour hand on the centre arbor. */
function bones(L: Layout): Bone[] {
  const out: Bone[] = [{ name: 'plate', parent: -1, head: [0, -1, BACK], tail: [0, 1, BACK] }]
  for (const name of MOVING) out.push({ name, parent: 0, head: at3(L[name], BACK), tail: at3(L[name], DIAL) })
  out.push({ name: 'hour', parent: 0, head: [0, 0, DIAL], tail: [0, 0.4, DIAL] })
  return out
}

const arbors = (L: Layout): Arbor[] => MOVING.map((name) => ({ name, at: L[name], back: BACK, front: name === 'barrel' ? 0.06 : BRIDGE }))

export function clockSpec(): BodySpec {
  const L = layout()
  const parts: Part[] = []
  const mesh = meshes(L)

  // the main plate, grained, and the case's two rims (open between, so the layers show edge on)
  parts.push({ shape: { sheet: disc([0, 0], BACK, 0.95, 96) }, colour: perlage, bones: ['plate'], density: 0.12 })
  for (const z of [BACK - 0.02, DIAL]) {
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2, b = ((k + 1) / 72) * Math.PI * 2
      parts.push({ shape: tube(at3(polar([0, 0], 1.0, a), z), at3(polar([0, 0], 1.0, b), z), 0.045), colour: STEEL, bones: ['plate'], density: 0.3 })
    }
  }
  // the crown at three o'clock, knurled
  parts.push({ shape: tube([1.05, 0, 0.09], [1.2, 0, 0.09], 0.075), colour: (p) => mix(STEEL, [0.4, 0.42, 0.46], Math.sin(Math.atan2(p[2] - 0.09, p[1]) * 18) > 0 ? 0.4 : 0), bones: ['plate'] })

  // the going train
  const wheelColour: Record<string, Vec3> = { barrel: BRASS, centre: GOLD, third: GOLD, fourth: GOLD, escape: STEEL }
  for (const { driver, driven } of mesh) {
    parts.push(...wheel(driver, L[driver.arbor as keyof Layout], wheelColour[driver.arbor], driver.arbor === 'barrel' ? 6 : 5))
    parts.push(...pinion(driven, L[driven.arbor as keyof Layout]))
  }
  // the barrel drum and its static ratchet wheel (the mainspring's click holds it while the watch runs)
  parts.push({ shape: { sheet: disc(L.barrel, 0.035, pitch(TEETH.barrel) - 2.2 * M, 64) }, colour: sunburst(L.barrel, BRASS), bones: ['barrel'], density: 0.5 })
  const ratchet: Vec3[][] = []
  const rr = 0.2
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2, b = ((k + 1) / 40) * Math.PI * 2
    ratchet.push([at3(L.barrel, 0.05), at3(polar(L.barrel, rr, a), 0.05), at3(polar(L.barrel, rr + 0.02, b), 0.05)])
  }
  parts.push({ shape: { sheet: ratchet }, colour: (p) => mix(STEEL, [1, 1, 1], 0.2 + 0.2 * Math.sin(Math.hypot(p[0] - L.barrel[0], p[1] - L.barrel[1]) * 160)), bones: ['plate'] })
  parts.push({ shape: tube(at3(polar(L.barrel, 0.24, 0.3), 0.05), at3(polar(L.barrel, 0.215, 0.05), 0.05), 0.012, 0.006), colour: BLUED, bones: ['plate'], density: 3 })

  // the escape wheel: fifteen raked club teeth
  const E = L.escape, ez = 0.06, er = 0.12
  parts.push({ shape: { sheet: [...annulus(E, ez, 0.07, 0.085, 45), ...disc(E, ez, 0.025, 16)] }, colour: STEEL, bones: ['escape'] })
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    parts.push({ shape: { sheet: bar(polar(E, 0.02, a), polar(E, 0.075, a), 0.012, ez) }, colour: STEEL, bones: ['escape'] })
  }
  for (let k = 0; k < TEETH.escape; k++) {
    const a = (k / TEETH.escape) * Math.PI * 2
    parts.push({ shape: tube(at3(polar(E, 0.083, a), ez), at3(polar(E, er, a + 0.16), ez), 0.006, 0.0045), colour: STEEL, bones: ['escape'], density: 7, size: 0.4 })
    parts.push({ shape: { ball: at3(polar(E, er, a + 0.16), ez), r: [0.007, 0.007, 0.006] }, colour: STEEL, bones: ['escape'], density: 7, size: 0.4 })
  }

  // the pallet fork: an anchor with two ruby stones over the escape wheel and a fork round the balance's impulse pin
  const P = L.pallet, pz = 0.06
  const toE = angleOf(P, E), toB = angleOf(P, L.balance)
  const entry = polar(E, er + 0.005, toE + Math.PI + 0.62), exit = polar(E, er + 0.005, toE + Math.PI - 0.62)
  parts.push({ shape: { sheet: [...bar(P, entry, 0.018, pz), ...bar(P, exit, 0.018, pz), ...bar(P, polar(P, 0.15, toB), 0.012, pz), ...disc(P, pz, 0.02, 16)] }, colour: STEEL, bones: ['pallet'] })
  for (const s of [entry, exit]) parts.push({ shape: { ball: at3(polar(s, -0.008, angleOf(s, E)), pz + 0.004), r: [0.011, 0.011, 0.008] }, colour: RUBY, bones: ['pallet'], density: 4, glow: true })
  const horn = polar(P, 0.16, toB)
  for (const s of [-1, 1]) parts.push({ shape: tube(at3(polar(horn, 0.016, toB + s * 1.4), pz), at3(polar(horn, 0.03, toB + s * 0.6), pz), 0.004), colour: STEEL, bones: ['pallet'], density: 3 })

  // the balance: a gold rim with timing screws, three arms, and a blued hairspring under it
  const B = L.balance, bz = 0.1, br = 0.17
  parts.push({ shape: { sheet: [...annulus(B, bz, br - 0.022, br, 64), ...disc(B, bz, 0.03, 16)] }, colour: sunburst(B, GOLD), bones: ['balance'], density: 2.5, size: 0.6 })
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4
    parts.push({ shape: { sheet: bar(polar(B, 0.02, a), polar(B, br - 0.02, a), 0.016, bz) }, colour: sunburst(B, GOLD), bones: ['balance'], density: 2.5, size: 0.6 })
  }
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2
    parts.push({ shape: { ball: at3(polar(B, br + 0.006, a), bz), r: [0.009, 0.009, 0.009] }, colour: k % 2 ? GOLD : ROSE, bones: ['balance'], density: 3 })
  }
  parts.push({ shape: { ball: at3(polar(B, 0.045, toB + Math.PI), bz - 0.012), r: [0.006, 0.006, 0.01] }, colour: RUBY, bones: ['balance'], density: 4, glow: true })
  const spring: Vec3[] = []
  const turnsN = 9
  for (let k = 0; k <= 360; k++) {
    const u = k / 360
    spring.push(at3(polar(B, 0.025 + 0.105 * u, u * turnsN * Math.PI * 2), 0.085))
  }
  for (let k = 0; k < spring.length - 1; k++) parts.push({ shape: tube(spring[k], spring[k + 1], 0.0028), colour: BLUED, bones: ['balance'], density: 10, size: 0.3 })

  // arbors, with ruby jewels in gold chatons where they meet the bridges
  for (const a of arbors(L)) {
    parts.push({ shape: tube(at3(a.at, a.back), at3(a.at, a.front), 0.007), colour: STEEL, bones: [a.name], density: 2 })
    if (a.front === BRIDGE) {
      parts.push({ shape: { sheet: annulus(a.at, BRIDGE + 0.004, 0.018, 0.03, 24) }, colour: GOLD, bones: ['plate'], density: 2 })
      parts.push({ shape: { ball: at3(a.at, BRIDGE + 0.006), r: [0.017, 0.017, 0.008] }, colour: RUBY, bones: ['plate'], density: 3, glow: true })
    }
  }

  // bridges: slim, striped, screwed down with blued screws
  const rim = (a: number): V2 => polar([0, 0], 0.93, a)
  const bridges: [V2, V2][] = [
    [rim(-0.15), L.third], [L.fourth, rim(-1.6)], [L.escape, rim(-2.2)], [L.pallet, rim(-2.6)], [rim(0.25), [0, 0]],
  ]
  const ends = new Set<string>()
  for (const [a, b] of bridges) {
    parts.push({ shape: { sheet: bar(a, b, 0.05, BRIDGE) }, colour: stripes(NICKEL), bones: ['plate'], density: 0.7, size: 0.7 })
    for (const p of [a, b]) {
      if (Math.hypot(p[0], p[1]) < 0.9) continue
      const key = p.join()
      if (ends.has(key)) continue
      ends.add(key)
      parts.push({ shape: { ball: at3(p, BRIDGE + 0.006), r: [0.022, 0.022, 0.008] }, colour: (q) => (Math.abs((q[0] - p[0]) * 0.7 + (q[1] - p[1]) * 0.7) < 0.004 ? INK : BLUED), bones: ['plate'], density: 3 })
    }
  }
  // the balance cock: one bar out over the balance, engraved
  parts.push({ shape: { sheet: [...bar(rim(Math.atan2(B[1], B[0]) + 0.25), B, 0.035, BRIDGE + 0.01), ...disc(B, BRIDGE + 0.01, 0.028, 24)] }, colour: (p) => mix(GOLD, ROSE, 0.5 + 0.5 * Math.sin(p[0] * 90) * Math.sin(p[1] * 90)), bones: ['plate'], density: 1.2 })

  // the chapter ring: enamel, with hour batons, minute ticks and a small-seconds track round the fourth arbor
  parts.push({ shape: { sheet: annulus([0, 0], DIAL, 0.8, 0.94, 120) }, colour: ENAMEL, bones: ['plate'], density: 0.9 })
  for (let k = 0; k < 60; k++) {
    const a = Math.PI / 2 - (k / 60) * Math.PI * 2
    const major = k % 5 === 0
    parts.push({ shape: tube(at3(polar([0, 0], major ? 0.82 : 0.88, a), DIAL + 0.004), at3(polar([0, 0], 0.92, a), DIAL + 0.004), major ? 0.01 : 0.004), colour: INK, bones: ['plate'], density: major ? 2 : 2.5 })
  }
  const F = L.fourth
  parts.push({ shape: { sheet: annulus(F, DIAL, 0.11, 0.13, 60) }, colour: ENAMEL, bones: ['plate'] })
  for (let k = 0; k < 12; k++) {
    const a = Math.PI / 2 - (k / 12) * Math.PI * 2
    parts.push({ shape: tube(at3(polar(F, 0.112, a), DIAL + 0.004), at3(polar(F, 0.128, a), DIAL + 0.004), 0.003), colour: INK, bones: ['plate'], density: 3 })
  }

  // hands, blued steel, pointing at twelve at rest
  const up = Math.PI / 2
  parts.push({ shape: tube([0, -0.08, DIAL + 0.03], [0, 0.5, DIAL + 0.03], 0.016, 0.004), colour: BLUED, bones: ['hour'], density: 1.5 })
  parts.push({ shape: { ball: [0, 0.36, DIAL + 0.03], r: [0.032, 0.045, 0.006] }, colour: BLUED, bones: ['hour'], density: 1.5 })
  parts.push({ shape: tube([0, -0.12, DIAL + 0.05], [0, 0.8, DIAL + 0.05], 0.012, 0.003), colour: BLUED, bones: ['centre'], density: 1.5 })
  parts.push({ shape: { ball: [0, 0, DIAL + 0.06], r: [0.02, 0.02, 0.01] }, colour: BLUED, bones: ['centre'], density: 2 })
  parts.push({ shape: tube(at3(polar(F, -0.03, up), DIAL + 0.03), at3(polar(F, 0.11, up), DIAL + 0.03), 0.006, 0.002), colour: RUBY, bones: ['fourth'], density: 3 })
  parts.push({ shape: { ball: at3(F, DIAL + 0.032), r: [0.01, 0.01, 0.006] }, colour: RUBY, bones: ['fourth'], density: 3 })
  return { bones: bones(L), parts, blend: 0.01 }
}

/** The watch, `count` blobs. Every blob hangs on one bone, so nothing bends. */
export function makeClock(count = 200000): Built {
  return buildBody(clockSpec(), count, 17)
}
