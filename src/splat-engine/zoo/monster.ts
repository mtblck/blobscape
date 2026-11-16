import type { Vec3 } from '../../splat-core/blobs.ts'
import { buildBody, mirror, mix, rng, spots, type BodySpec, type Part } from '../body.ts'
import type { Bone, Skeleton } from '../rig.ts'
import { X, Y, Z, env, set, turn } from '../posing.ts'
import type { Species } from './species.ts'

/**
 * Make me a monster: a creature drawn up from a seed. The seed picks a body
 * plan (two, four or six legs; how long, how round, how tall), a head (one to
 * three eyes, a snout, horns, ears or feelers), a tail, back spikes and a
 * coat, then builds it with body.ts like the hand-made zoo. Every monster can
 * walk on the spot, stand and breathe, and roar, and the same seed always
 * makes the same monster, so a link can share one.
 *
 * Monsters face +z and stand on the floor (y = 0) at rest.
 */

export interface Plan {
  seed: number
  legs: 2 | 4 | 6
  /** Height of the hips above the floor. */
  hip: number
  /** Hips to chest. */
  length: number
  /** Body radius. */
  girth: number
  /** Chest radius over hip radius. */
  chest: number
  neck: number
  head: number
  /** How far the snout sticks out, relative to the head. */
  snout: number
  eyes: 1 | 2 | 3
  eye: number
  top: 'none' | 'horns' | 'ears' | 'feelers'
  /** Tail length, relative to the body (0 for none). */
  tail: number
  spikes: boolean
  arms: boolean
  coat: 'spots' | 'stripes' | 'plain'
  colors: { back: Vec3; belly: Vec3; accent: Vec3; iris: Vec3 }
  name: string
}

const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length) % xs.length]
const between = (r: () => number, a: number, b: number) => a + (b - a) * r()

/** HSL (0–1 each) to linear-ish RGB in 0–1, the way the zoo writes colors. */
function hsl(h: number, s: number, l: number): Vec3 {
  const k = (n: number) => (n + h * 12) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)]
}

const START = ['gr', 'sn', 'bl', 'pl', 'fl', 'gl', 'sk', 'w', 'm', 'z', 'b', 'qu', 'tr', 'cr', 'v', 'dr']
const MIDDLE = ['o', 'u', 'a', 'i', 'oo', 'ee', 'au', 'y']
const END = ['mble', 'rk', 'zzle', 'nch', 'b', 'rp', 'ggle', 'mp', 'x', 'lch', 'rt', 'ff', 'mpus', 'ndle']

/** Names that read as rude, a slur or a politician: a monster never gets one. */
const AVOID = /boob|moob|queer|quim|grundle|trump|wank|skank|cum|tit|fag|nig|spic/

/** A made-up name; one that reads as something else is drawn again (from the same seed, so it stays the same). */
function nameOf(r: () => number) {
  for (;;) {
    const n = pick(r, START) + pick(r, MIDDLE) + pick(r, END)
    if (!AVOID.test(n)) return n
  }
}

/** The seed's plan: everything about the monster before any blob is placed. */
export function planMonster(seed: number): Plan {
  const r = rng(seed * 7919 + 13)
  r(); r()
  const legs = pick(r, [2, 4, 4, 6] as const)
  const length = legs === 2 ? between(r, 0.32, 0.48) : between(r, 0.42, 0.75)
  const girth = between(r, 0.11, 0.2) * (legs === 2 ? 1.05 : 1)
  const hip = legs === 2 ? between(r, 0.28, 0.45) : between(r, 0.2, 0.4) + girth * 0.4
  const hue = r()
  const back = hsl(hue, between(r, 0.45, 0.8), between(r, 0.38, 0.55))
  const belly = hsl((hue + between(r, -0.06, 0.06) + 1) % 1, between(r, 0.25, 0.5), between(r, 0.7, 0.85))
  const accent = hsl((hue + pick(r, [0.33, 0.5, 0.67])) % 1, between(r, 0.6, 0.9), between(r, 0.4, 0.55))
  const iris = hsl(r(), 0.85, 0.5)
  const name = nameOf(r)
  return {
    seed, legs, hip, length, girth,
    chest: between(r, 0.8, 1.3),
    neck: between(r, 0.04, 0.2),
    head: between(r, 0.1, 0.17) * (legs === 2 ? 1.15 : 1),
    snout: between(r, 0, 1),
    eyes: pick(r, [1, 2, 2, 2, 3] as const),
    eye: between(r, 0.22, 0.4),
    top: pick(r, ['none', 'horns', 'horns', 'ears', 'feelers'] as const),
    tail: r() < 0.2 ? 0 : between(r, 0.5, 1.4),
    spikes: r() < 0.45,
    arms: legs === 2 && r() < 0.8,
    coat: pick(r, ['spots', 'stripes', 'plain'] as const),
    colors: { back, belly, accent, iris },
    name,
  }
}

const SIDES = [['l', 1], ['r', -1]] as const
const side = (x: number, p: Vec3): Vec3 => (x > 0 ? p : mirror(p))
const along = (a: Vec3, b: Vec3, t: number): Vec3 => mix(a, b, t)

/** Where each pair of legs joins the body, front to back, as a share of the way from hips (0) to chest (1). */
function legSpots(p: Plan): number[] {
  return p.legs === 6 ? [1, 0.5, 0] : p.legs === 4 ? [1, 0] : [0]
}

export interface Layout { bones: Bone[]; hips: Vec3; chest: Vec3; neckTop: Vec3; headC: Vec3; legPairs: number }

/** The skeleton, from the plan: every point the parts hang on. */
export function layout(p: Plan): Layout {
  const upright = p.legs === 2
  const hips: Vec3 = [0, p.hip, upright ? -0.02 : -p.length / 2]
  const chest: Vec3 = upright ? [0, p.hip + p.length, 0.04] : [0, p.hip + p.girth * 0.25, p.length / 2]
  const neckTop: Vec3 = upright ? [0, chest[1] + p.girth * p.chest * 0.6 + p.neck, chest[2] + 0.02] : [0, chest[1] + p.girth * 0.5 + p.neck * 0.8, chest[2] + p.girth * 0.5 + p.neck * 0.6]
  const headC: Vec3 = [0, neckTop[1] + p.head * 0.6, neckTop[2] + p.head * 0.35]
  const bones: Bone[] = [
    { name: 'body', parent: -1, head: hips, tail: chest },
    { name: 'chest', parent: 0, head: chest, tail: neckTop },
    { name: 'neck', parent: 1, head: along(chest, neckTop, 0.5), tail: neckTop },
    { name: 'head', parent: 2, head: neckTop, tail: [headC[0], headC[1], headC[2] + p.head * (1 + p.snout)] },
    { name: 'jaw', parent: 3, head: [0, headC[1] - p.head * 0.35, headC[2]], tail: [0, headC[1] - p.head * 0.45, headC[2] + p.head * (0.9 + p.snout)] },
  ]
  if (p.tail > 0) {
    const tl = p.tail * p.length
    let prev = 0
    for (let k = 0; k < 3; k++) {
      const a = k / 3, b = (k + 1) / 3
      const at = (t: number): Vec3 => [0, hips[1] + (upright ? -0.3 : 0.05) * tl * t + 0.04 * Math.sin(t * 3), hips[2] - tl * t]
      bones.push({ name: `tail${k + 1}`, parent: prev, head: at(a), tail: at(b) })
      prev = bones.length - 1
    }
  }
  const spots = legSpots(p)
  spots.forEach((u, i) => {
    const base = along(hips, chest, u)
    for (const [s, x] of SIDES) {
      const top = side(x, [p.girth * 0.75, base[1] - p.girth * 0.2, base[2]])
      const footY = 0.02
      const kneeZ = upright ? 0.03 : (u > 0.5 ? -1 : 1) * 0.04
      const knee = side(x, [p.girth * 0.8, (top[1] + footY) / 2, base[2] + kneeZ])
      const ankle = side(x, [p.girth * 0.8, footY + 0.025, base[2] - kneeZ * 0.5])
      const toe = side(x, [p.girth * 0.8, 0.01, base[2] + 0.07 + p.girth * 0.2])
      const t = bones.length
      bones.push(
        { name: `${s}Thigh${i}`, parent: u > 0.5 ? 1 : 0, head: top },
        { name: `${s}Shin${i}`, parent: t, head: knee },
        { name: `${s}Foot${i}`, parent: t + 1, head: ankle, tail: toe },
      )
    }
  })
  if (p.arms) {
    for (const [s, x] of SIDES) {
      const shoulder = side(x, [p.girth * p.chest * 0.95, chest[1] + p.girth * 0.2, chest[2]])
      const elbow = side(x, [p.girth * p.chest * 1.15, chest[1] - p.length * 0.35, chest[2] + 0.02])
      const hand = side(x, [p.girth * p.chest * 1.15, chest[1] - p.length * 0.7, chest[2] + 0.06])
      const a = bones.length
      bones.push(
        { name: `${s}Arm`, parent: 1, head: shoulder },
        { name: `${s}Forearm`, parent: a, head: elbow, tail: hand },
      )
    }
  }
  return { bones, hips, chest, neckTop, headC, legPairs: spots.length }
}

function spec(p: Plan): BodySpec {
  const L = layout(p)
  const { back, belly, accent, iris } = p.colors
  const dark = mix(back, [0.04, 0.03, 0.05], 0.55)
  const coat = (q: Vec3, n: Vec3): Vec3 => {
    if (n[1] < -0.35) return belly
    if (p.coat === 'spots') return spots(q, 45, p.seed % 7) > 0.74 ? accent : back
    if (p.coat === 'stripes') return Math.sin(q[2] * 55 + q[1] * 12) > 0.45 ? dark : back
    return back
  }
  const bone = (n: string) => L.bones.findIndex((b) => b.name === n) >= 0
  const parts: Part[] = []
  const hipR = p.girth, chestR = p.girth * p.chest
  // body, neck, head
  parts.push({ shape: { tube: [L.hips, L.chest], r: [hipR, chestR], flat: 0.88 }, color: coat, bones: ['body', 'chest'] })
  parts.push({ shape: { tube: [L.chest, L.neckTop], r: [Math.min(chestR, p.head) * 0.75, p.head * 0.6] }, color: coat, bones: ['chest', 'neck', 'head'] })
  const hc = L.headC, hr = p.head
  parts.push({ shape: { ball: hc, r: [hr, hr * 0.9, hr * 1.05] }, color: coat, bones: ['head'] })
  if (p.snout > 0.15) {
    const tip: Vec3 = [0, hc[1] - hr * 0.15, hc[2] + hr * (0.8 + p.snout * 0.9)]
    parts.push({ shape: { tube: [[0, hc[1] - hr * 0.05, hc[2] + hr * 0.3], tip], r: [hr * 0.6, hr * 0.38], flat: 0.8 }, color: coat, bones: ['head'] })
    parts.push({ shape: { ball: [0, tip[1] + hr * 0.12, tip[2] + hr * 0.3], r: [hr * 0.12, hr * 0.09, hr * 0.08] }, color: dark, bones: ['head'], density: 4 })
  }
  // the jaw and the inside of the mouth, seen when it roars
  const jawTip: Vec3 = [0, hc[1] - hr * 0.5, hc[2] + hr * (0.75 + p.snout * 0.8)]
  parts.push({ shape: { tube: [[0, hc[1] - hr * 0.45, hc[2] - hr * 0.1], jawTip], r: [hr * 0.55, hr * 0.32], flat: 0.55 }, color: (q, n) => (n[1] < 0 ? belly : coat(q, n)), bones: ['jaw'] })
  parts.push({ shape: { ball: [0, hc[1] - hr * 0.32, hc[2] + hr * 0.45], r: [hr * 0.45, hr * 0.08, hr * 0.5 + p.snout * hr * 0.4] }, color: [0.45, 0.08, 0.12], bones: ['head'], density: 1.5 })
  // eyes, looking ahead
  const er = hr * p.eye
  const eyeAt: Vec3[] = p.eyes === 1 ? [[0, hc[1] + hr * 0.45, hc[2] + hr * 0.7]]
    : p.eyes === 2 ? SIDES.map(([, x]) => side(x, [hr * 0.48, hc[1] + hr * 0.4, hc[2] + hr * 0.68]))
      : [[0, hc[1] + hr * 0.62, hc[2] + hr * 0.6], ...SIDES.map(([, x]) => side(x, [hr * 0.55, hc[1] + hr * 0.28, hc[2] + hr * 0.7]))]
  for (const at of eyeAt) {
    const out: Vec3 = [at[0] * 0.6 / hr, 0.15, 1]
    const ol = Math.hypot(...out)
    const o: Vec3 = [out[0] / ol, out[1] / ol, out[2] / ol]
    parts.push({
      shape: { ball: at, r: [er, er, er * 0.9] }, bones: ['head'], density: 6,
      color: (_q, n) => {
        const d = n[0] * o[0] + n[1] * o[1] + n[2] * o[2]
        if (d > 0.95 && n[1] > o[1] + 0.08) return [1, 1, 0.97]
        return d > 0.86 ? [0.03, 0.03, 0.04] : d > 0.6 ? iris : [0.96, 0.95, 0.9]
      },
    })
  }
  // on top of the head
  for (const [, x] of SIDES) {
    const root = side(x, [hr * 0.55, hc[1] + hr * 0.6, hc[2] - hr * 0.15])
    if (p.top === 'horns') parts.push({ shape: { tube: [root, side(x, [hr * 1.1, hc[1] + hr * 1.45, hc[2] - hr * 0.7])], r: [hr * 0.18, hr * 0.03] }, color: (_q, _n, u) => mix([0.92, 0.88, 0.76], [0.35, 0.3, 0.25], u), bones: ['head'], density: 2 })
    if (p.top === 'ears') parts.push({ shape: { sheet: [[root, side(x, [hr * 0.95, hc[1] + hr * 1.35, hc[2] - hr * 0.3]), side(x, [hr * 0.2, hc[1] + hr * 0.95, hc[2] - hr * 0.35])]] }, color: accent, bones: ['head'], density: 2, opacity: 0.9 })
    if (p.top === 'feelers') {
      const tip = side(x, [hr * 0.9, hc[1] + hr * 1.9, hc[2] + hr * 0.4])
      parts.push({ shape: { tube: [root, tip], r: [hr * 0.05, hr * 0.03] }, color: dark, bones: ['head'], density: 3 })
      parts.push({ shape: { ball: tip, r: [hr * 0.13, hr * 0.13, hr * 0.13] }, color: accent, bones: ['head'], density: 4, glow: true })
    }
  }
  // tail
  if (p.tail > 0) {
    const tb = L.bones.filter((b) => b.name.startsWith('tail'))
    tb.forEach((b, k) => {
      const r0 = hipR * 0.55 * (1 - k / 3), r1 = hipR * 0.55 * (1 - (k + 1) / 3) + 0.008
      const names = [b.name, ...(k > 0 ? [tb[k - 1].name] : ['body']), ...(k < 2 ? [tb[k + 1].name] : [])]
      parts.push({ shape: { tube: [b.head, b.tail!], r: [r0, r1] }, color: coat, bones: names })
    })
  }
  // spikes down the back
  if (p.spikes) {
    const n = 6
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n
      const c = along(L.hips, L.chest, t)
      const r = hipR + (chestR - hipR) * t
      const base: Vec3 = [0, c[1] + r * 0.82, c[2]]
      parts.push({ shape: { tube: [base, [0, base[1] + r * 0.55, base[2] - r * 0.25]], r: [r * 0.16, 0.004] }, color: accent, bones: ['body', 'chest'], density: 2 })
    }
  }
  // legs and feet
  for (let i = 0; i < L.legPairs; i++) {
    for (const [s] of SIDES) {
      const th = L.bones.find((b) => b.name === `${s}Thigh${i}`)!, sh = L.bones.find((b) => b.name === `${s}Shin${i}`)!, ft = L.bones.find((b) => b.name === `${s}Foot${i}`)!
      const lr = Math.max(0.025, p.girth * (p.legs === 6 ? 0.28 : 0.38))
      const body = p.legs === 2 || i === 0 ? (L.bones[th.parent].name) : 'body'
      parts.push({ shape: { tube: [th.head, sh.head], r: [lr, lr * 0.75] }, color: coat, bones: [body, `${s}Thigh${i}`, `${s}Shin${i}`] })
      parts.push({ shape: { tube: [sh.head, ft.head], r: [lr * 0.75, lr * 0.55] }, color: coat, bones: [`${s}Thigh${i}`, `${s}Shin${i}`, `${s}Foot${i}`] })
      parts.push({ shape: { tube: [ft.head, ft.tail!], r: [lr * 0.6, lr * 0.45], flat: 0.5 }, color: mix(coat(ft.head, [0, 1, 0]), dark, 0.3), bones: [`${s}Shin${i}`, `${s}Foot${i}`] })
    }
  }
  if (p.arms && bone('lArm')) {
    for (const [s] of SIDES) {
      const a = L.bones.find((b) => b.name === `${s}Arm`)!, f = L.bones.find((b) => b.name === `${s}Forearm`)!
      const ar = Math.max(0.02, p.girth * 0.28)
      parts.push({ shape: { tube: [a.head, f.head], r: [ar, ar * 0.8] }, color: coat, bones: ['chest', `${s}Arm`, `${s}Forearm`] })
      parts.push({ shape: { tube: [f.head, f.tail!], r: [ar * 0.8, ar * 0.6] }, color: coat, bones: [`${s}Arm`, `${s}Forearm`] })
      parts.push({ shape: { ball: f.tail!, r: [ar, ar * 0.8, ar] }, color: mix(back, dark, 0.3), bones: [`${s}Forearm`] })
    }
  }
  return { bones: L.bones, parts, blend: Math.max(0.025, p.girth * 0.25) }
}

export function makeMonster(seed: number, count = 10000) {
  const p = planMonster(seed)
  const b = buildBody(spec(p), count, seed)
  return { blobs: b.blobs, skin: b.skin, skeleton: b.skeleton }
}

/** One stride, in seconds: little monsters step quicker. */
export const strideOf = (p: Plan) => Math.max(0.55, Math.min(1.1, p.hip * 2.2))

/** Each leg's place in the gait, as a phase: two legs alternate, four trot (diagonals together), six walk in tripods. */
function legPhase(p: Plan, i: number, left: boolean): number {
  if (p.legs === 2) return left ? 0 : Math.PI
  if (p.legs === 4) return (i === 0) === left ? 0 : Math.PI
  return (i % 2 === 0) === left ? 0 : Math.PI
}

/** Walking on the spot: legs swing, knees lift the swinging foot, the body bobs, tail and head sway against it. */
export function monsterWalk(p: Plan) {
  const T = strideOf(p)
  return (sk: Skeleton, t: number) => {
    sk.reset()
    const ph = (t / T) * Math.PI * 2
    const pairs = legSpots(p).length
    for (let i = 0; i < pairs; i++) {
      for (const [s] of SIDES) {
        const a = ph + legPhase(p, i, s === 'l')
        set(sk, `${s}Thigh${i}`, X, -0.45 * Math.sin(a))
        set(sk, `${s}Shin${i}`, X, 0.8 * Math.max(0, Math.cos(a)))
        set(sk, `${s}Foot${i}`, X, -0.3 * Math.max(0, Math.cos(a)))
      }
    }
    const bob = Math.sin(ph * 2)
    sk.offset.set([0, 0.015 * bob, 0], 0)
    set(sk, 'body', Z, (p.legs === 2 ? 0.06 : 0.03) * Math.sin(ph))
    set(sk, 'chest', Z, -0.04 * Math.sin(ph))
    set(sk, 'neck', X, 0.06 * bob)
    set(sk, 'head', X, -0.08 * bob)
    if (p.arms) for (const [s, x] of SIDES) { set(sk, `${s}Arm`, X, 0.5 * Math.sin(ph) * x); set(sk, `${s}Forearm`, X, -0.35 - 0.15 * Math.cos(ph)) }
    if (p.tail > 0) for (let k = 1; k <= 3; k++) set(sk, `tail${k}`, Y, 0.25 * Math.sin(ph - k * 0.7))
    sk.update()
  }
}

const IDLE = 4

/** Standing: breathing, looking round now and then, the tail swishing. Loops every four seconds. */
export function monsterIdle(p: Plan) {
  return (sk: Skeleton, t: number) => {
    sk.reset()
    const u = (t % IDLE) / IDLE
    const breath = Math.sin(u * Math.PI * 2 * 2)
    sk.offset.set([0, 0.006 * breath, 0], 0)
    set(sk, 'chest', X, -0.02 * breath)
    set(sk, 'head', Y, 0.5 * (env(u, 0.15, 0.3, 0.4, 0.5) - env(u, 0.55, 0.7, 0.8, 0.95)))
    set(sk, 'jaw', X, 0.04 + 0.03 * breath)
    if (p.arms) for (const [s] of SIDES) set(sk, `${s}Forearm`, X, -0.3 - 0.05 * breath)
    if (p.tail > 0) for (let k = 1; k <= 3; k++) set(sk, `tail${k}`, Y, 0.18 * Math.sin(u * Math.PI * 2 - k * 0.6))
    sk.update()
  }
}

const ROAR = 2

/** It rears back, then throws its head forward with the jaw wide open, and settles. */
export function monsterRoar(p: Plan) {
  return (sk: Skeleton, t: number) => {
    const u = (t % ROAR) / ROAR
    monsterIdle(p)(sk, u * IDLE)
    const rear = env(u, 0.1, 0.3, 0.32, 0.42)
    const roar = env(u, 0.32, 0.42, 0.7, 0.85)
    set(sk, 'chest', X, -0.25 * rear + 0.12 * roar)
    set(sk, 'neck', X, -0.3 * rear + 0.15 * roar)
    turn(sk, 'head', X, -0.4 * roar)
    set(sk, 'jaw', X, 0.05 + 0.75 * roar)
    if (p.arms) for (const [s, x] of SIDES) { set(sk, `${s}Arm`, Z, -0.9 * roar * x); set(sk, `${s}Forearm`, X, -0.3 - 0.8 * roar) }
    if (p.tail > 0) for (let k = 1; k <= 3; k++) turn(sk, `tail${k}`, X, -0.2 * roar)
    sk.offset.set([0, 0.02 * rear, 0], 0)
    sk.update()
  }
}

const NUMBERS = ['', 'one', 'two', 'three', 'four', 'five', 'six']

/** The seed as a creature for the Creature page and its sprite sheets. */
export function monsterSpecies(seed: number): Species {
  const p = planMonster(seed)
  const height = layout(p).headC[1] + p.head
  const reach = Math.max(height, p.length * (1 + p.tail * 0.6) + p.head * 2)
  const bits = [
    `${NUMBERS[p.legs]}-legged`,
    p.eyes === 2 ? '' : `${NUMBERS[p.eyes]}-eyed`,
  ].filter(Boolean).join(', ')
  const extras = [p.top === 'horns' ? 'horns' : p.top === 'ears' ? 'pointed ears' : p.top === 'feelers' ? 'glowing feelers' : '', p.spikes ? 'a spiky back' : '', p.tail > 0 ? (p.tail > 1 ? 'a long tail' : 'a tail') : ''].filter(Boolean)
  const w = extras.length ? ` with ${extras.length > 1 ? `${extras.slice(0, -1).join(', ')} and ${extras[extras.length - 1]}` : extras[0]}` : ''
  return {
    id: 'monster',
    seed,
    name: p.name,
    blurb: `A ${bits} ${p.name}${w}, made up from seed ${seed}. Every seed makes a different monster.`,
    detail: [3000, 10000, 30000, 60000],
    start: 10000,
    looks: [{ id: 'own', label: 'Its own colors' }],
    make: (count) => makeMonster(seed, count),
    moves: [
      { name: 'walk', label: 'Walk', doing: 'walking on the spot', seconds: strideOf(p), fps: 24, pose: monsterWalk(p) },
      { name: 'idle', label: 'Stand', doing: 'standing and breathing', seconds: IDLE, fps: 12, pose: monsterIdle(p) },
      { name: 'roar', label: 'Roar', doing: 'roaring', seconds: ROAR, fps: 24, pose: monsterRoar(p) },
    ],
    view: { target: [0, height * 0.5, 0], distance: Math.max(1.4, reach * 2.6), azimuth: 35, elevation: 12 },
  }
}

/** Seeds run from 1 to this; the button picks one and a link may name any. */
export const MAX_SEED = 99999

/** A fresh seed for the button. */
export const newSeed = () => 1 + Math.floor(Math.random() * MAX_SEED)
