import type { Vec3 } from '../../splat-core/blobs.ts'
import { buildBody, mix, rng, spots, type Creature, type Part } from '../../splat-engine/body.ts'
import { axisAngle, mulQ, type Bone, type Skeleton } from '../../splat-engine/rig.ts'
import type { Kind } from './world.ts'

/**
 * The forest's plants: procedural trees, bushes, ferns, flowers, mushrooms
 * and rocks, each a small rig built with the creature body builder, so they
 * can grow out of the ground (bones that start at size 0) and sway in the
 * wind (a turn on their upper bones). Every plant stands on its root bone at
 * the origin; the stage places, turns and scales it.
 */

export type Season = 'summer' | 'spring' | 'autumn'
export const SEASONS: { id: Season; label: string }[] = [{ id: 'summer', label: 'Summer' }, { id: 'spring', label: 'Spring' }, { id: 'autumn', label: 'Autumn' }]

interface Palette {
  pine: Vec3[]
  leaves: Vec3[]
  birch: Vec3[]
  bush: Vec3[]
  fern: Vec3
  petals: Vec3[]
}

const PALETTES: Record<Season, Palette> = {
  summer: {
    pine: [[0.09, 0.27, 0.16], [0.13, 0.34, 0.18]],
    leaves: [[0.2, 0.45, 0.16], [0.3, 0.55, 0.2], [0.16, 0.38, 0.14]],
    birch: [[0.48, 0.66, 0.22], [0.58, 0.72, 0.28]],
    bush: [[0.17, 0.4, 0.17], [0.24, 0.48, 0.2]],
    fern: [0.3, 0.6, 0.2],
    petals: [[0.95, 0.42, 0.55], [0.98, 0.82, 0.25], [0.55, 0.5, 0.95], [0.97, 0.95, 0.92], [0.95, 0.5, 0.2]],
  },
  spring: {
    pine: [[0.12, 0.32, 0.18], [0.18, 0.4, 0.2]],
    leaves: [[0.48, 0.7, 0.3], [0.96, 0.75, 0.85], [0.98, 0.86, 0.9]],
    birch: [[0.62, 0.8, 0.36], [0.72, 0.86, 0.42]],
    bush: [[0.35, 0.6, 0.25], [0.95, 0.85, 0.92]],
    fern: [0.45, 0.72, 0.28],
    petals: [[0.98, 0.6, 0.75], [1, 0.9, 0.35], [0.62, 0.6, 1], [1, 1, 0.97], [0.85, 0.55, 0.95]],
  },
  autumn: {
    pine: [[0.09, 0.25, 0.15], [0.12, 0.3, 0.17]],
    leaves: [[0.85, 0.42, 0.1], [0.92, 0.62, 0.15], [0.7, 0.22, 0.08]],
    birch: [[0.95, 0.78, 0.2], [0.9, 0.66, 0.16]],
    bush: [[0.6, 0.2, 0.1], [0.75, 0.42, 0.12]],
    fern: [0.72, 0.5, 0.18],
    petals: [[0.75, 0.25, 0.4], [0.95, 0.68, 0.2], [0.55, 0.38, 0.75], [0.96, 0.92, 0.85], [0.9, 0.4, 0.15]],
  },
}

const BARK: Vec3 = [0.3, 0.2, 0.13]
const PINE_BARK: Vec3 = [0.36, 0.23, 0.15]
const BIRCH_BARK: Vec3 = [0.92, 0.9, 0.85]
const STEM: Vec3 = [0.25, 0.48, 0.18]
const STONE: Vec3 = [0.5, 0.5, 0.48]
const MOSS: Vec3 = [0.3, 0.45, 0.15]

/** A plant: its rig and blobs, plus how it grows and sways. */
export interface Plant extends Creature {
  kind: Kind
  /**
   * Poses it `grown` seconds after it started growing (Infinity: fully
   * grown) at time `now`, turned by `yaw` and scaled by `scale`.
   */
  pose: (grown: number, now: number, yaw: number, scale: number, wind: number) => void
}

const pick = <T,>(rand: () => number, xs: T[]) => xs[Math.floor(rand() * xs.length) % xs.length]
const vary = (c: Vec3, rand: () => number, by = 0.12): Vec3 => {
  const k = 1 + (rand() - 0.5) * by
  return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]
}
const root: Bone = { name: 'root', parent: -1, head: [0, 0, 0] }

/** 0 → 1 over `d` seconds from `start`, overshooting a little at the end like something springing up. */
export function sprung(t: number, start: number, d: number) {
  const u = Math.min(1, Math.max(0, (t - start) / d))
  if (u >= 1) return 1
  const c = 1.9, v = u - 1
  return Math.max(0, 1 + (c + 1) * v * v * v + c * v * v)
}

/** Leaves aren't one smooth colour: a fine mottle of darker and lighter patches. */
function leafy(c: Vec3, p: Vec3): Vec3 {
  const k = 0.72 + 0.5 * spots(p, 26, 3)
  return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]
}

const Y: Vec3 = [0, 1, 0]
const sway = (now: number, phase: number, rate: number) => Math.sin(now * rate + phase) + 0.35 * Math.sin(now * rate * 2.3 + phase * 1.7)

/** Sets the root: turned by yaw, scaled; the rest of the pose follows from the bones. */
function base(sk: Skeleton, yaw: number, scale: number, grow: number) {
  sk.reset()
  sk.setRotation(0, axisAngle(Y, yaw))
  sk.rootScale = scale * grow
}

/** A turn of bone b about a level axis, on top of its rotation: for swaying and bending. */
function bend(sk: Skeleton, b: number, axis: Vec3, rad: number) {
  sk.setRotation(b, mulQ(sk.rotation.subarray(b * 4, b * 4 + 4), axisAngle(axis, rad)))
}

function pine(seed: number, count: number, pal: Palette): Plant {
  const rand = rng(seed)
  const H = 3.6 + rand() * 1.8, rt = 0.12 + rand() * 0.05
  const bones: Bone[] = [root, { name: 'trunk', parent: 0, head: [0, 0.8, 0] }, { name: 'top', parent: 1, head: [0, H * 0.55, 0], tail: [0, H, 0] }]
  const green = vary(pick(rand, pal.pine), rand)
  const parts: Part[] = [
    { shape: { tube: [[0, -0.1, 0], [0, H * 0.9, 0]], r: [rt, rt * 0.3] }, colour: (p) => mix(PINE_BARK, [0.2, 0.12, 0.08], spots(p, 30, seed)), bones: ['root', 'trunk', 'top'], density: 0.6 },
  ]
  const tiers = 4 + Math.floor(rand() * 2)
  for (let k = 0; k < tiers; k++) {
    const u = k / tiers
    const y0 = 0.7 + u * (H - 1.1), tall = ((H - 0.7) / tiers) * 1.7
    const R = (1.35 - 1.05 * u) * (0.85 + rand() * 0.3) * (H / 4.4)
    parts.push({
      shape: { fill: [[0, y0, 0], [0, y0 + tall, 0]], r: [R, 0.06] },
      colour: (p, _n, along) => leafy(mix(mix(green, [0.04, 0.12, 0.08], 0.45 * (1 - along)), [0.35, 0.55, 0.25], 0.25 * spots(p, 9, seed) * along), p),
      bones: y0 > H * 0.5 ? ['trunk', 'top'] : ['trunk'],
      size: 1.25,
      opacity: 0.95,
    })
  }
  const body = buildBody({ bones, parts, blend: 0.6 }, count, seed)
  const phase = rand() * 6
  return {
    kind: 'pine', ...body,
    pose(grown, now, yaw, scale, wind) {
      const sk = body.skeleton
      base(sk, yaw, scale, sprung(grown, 0, 1.6))
      sk.size[2] = 0.35 + 0.65 * sprung(grown, 0.35, 1.4)
      bend(sk, 2, [1, 0, 0], 0.03 * wind * sway(now, phase, 1.1))
      bend(sk, 2, [0, 0, 1], 0.02 * wind * sway(now, phase + 2, 0.9))
      sk.update()
    },
  }
}

function broadleaf(seed: number, count: number, pal: Palette): Plant {
  const rand = rng(seed)
  const H = 3.4 + rand() * 1.4, lean = (rand() - 0.5) * 0.3
  const fork: Vec3 = [lean * 0.4, H * 0.48, 0]
  const branches = 3
  const bones: Bone[] = [root, { name: 'trunk', parent: 0, head: [0, 0.5, 0] }, { name: 'crown', parent: 1, head: fork, tail: [lean, H * 0.95, 0] }]
  const tips: Vec3[] = []
  for (let b = 0; b < branches; b++) {
    const a = (b / branches) * Math.PI * 2 + rand()
    const tip: Vec3 = [fork[0] + Math.cos(a) * (0.9 + rand() * 0.4), H * (0.72 + rand() * 0.1), Math.sin(a) * (0.9 + rand() * 0.4)]
    tips.push(tip)
    bones.push({ name: `b${b}`, parent: 2, head: fork, tail: tip })
  }
  const leaf = pick(rand, pal.leaves), leaf2 = pick(rand, pal.leaves)
  const parts: Part[] = [
    { shape: { tube: [[0, -0.1, 0], fork], r: [0.2, 0.13] }, colour: (p) => mix(BARK, [0.18, 0.12, 0.08], spots(p, 22, seed)), bones: ['root', 'trunk', 'crown'], density: 0.6 },
  ]
  tips.forEach((tip, b) => {
    parts.push({ shape: { tube: [fork, tip], r: [0.08, 0.04] }, colour: BARK, bones: ['crown', `b${b}`], density: 0.5 })
    parts.push({
      shape: { ball: [tip[0], tip[1] + 0.25, tip[2]], r: [0.85 + rand() * 0.3, 0.65 + rand() * 0.2, 0.85 + rand() * 0.3] },
      colour: (p, n) => leafy(mix(mix(leaf, leaf2, spots(p, 4, seed + b)), [0.03, 0.08, 0.03], 0.35 * Math.max(0, -n[1])), p),
      bones: [`b${b}`], size: 1.35, density: 1.3, opacity: 0.95,
    })
  })
  parts.push({
    shape: { ball: [lean, H * 0.9, 0], r: [1.05, 0.8, 1.05] },
    colour: (p) => leafy(mix(leaf, leaf2, spots(p, 4, seed + 9)), p), bones: ['crown'], size: 1.35, density: 1.3, opacity: 0.95,
  })
  const body = buildBody({ bones, parts, blend: 0.5 }, count, seed)
  const phase = rand() * 6
  return {
    kind: 'oak', ...body,
    pose(grown, now, yaw, scale, wind) {
      const sk = body.skeleton
      base(sk, yaw, scale, sprung(grown, 0, 1.5))
      for (let b = 0; b < branches; b++) {
        sk.size[3 + b] = sprung(grown, 0.5 + b * 0.15, 0.9)
        bend(sk, 3 + b, [1, 0, 0], 0.04 * wind * sway(now, phase + b, 1.3))
      }
      sk.size[2] = 0.3 + 0.7 * sprung(grown, 0.3, 1.2)
      bend(sk, 2, [0, 0, 1], 0.025 * wind * sway(now, phase, 0.8))
      sk.update()
    },
  }
}

function birch(seed: number, count: number, pal: Palette): Plant {
  const rand = rng(seed)
  const H = 3.6 + rand() * 1.6, lx = (rand() - 0.5) * 0.4
  const bones: Bone[] = [root, { name: 'trunk', parent: 0, head: [0, 0.6, 0] }, { name: 'top', parent: 1, head: [lx * 0.5, H * 0.5, 0], tail: [lx, H, 0] }]
  const leaf = pick(rand, pal.birch)
  const parts: Part[] = [
    {
      shape: { tube: [[0, -0.1, 0], [lx, H * 0.92, 0]], r: [0.1, 0.04] },
      // white bark with dark dashes running round the trunk
      colour: (p) => (Math.sin(p[1] * 23 + Math.sin(p[0] * 40 + p[2] * 30) * 2) > 0.82 ? [0.12, 0.1, 0.1] : BIRCH_BARK),
      bones: ['root', 'trunk', 'top'], density: 1.2,
    },
  ]
  const clumps = 5 + Math.floor(rand() * 3)
  for (let k = 0; k < clumps; k++) {
    const u = k / (clumps - 1), a = rand() * Math.PI * 2, r = 0.35 + (1 - Math.abs(u - 0.4)) * 0.35
    parts.push({
      shape: { ball: [lx * (0.5 + u * 0.5) + Math.cos(a) * r, H * (0.55 + u * 0.42), Math.sin(a) * r], r: [0.42 + rand() * 0.2, 0.34 + rand() * 0.15, 0.42 + rand() * 0.2] },
      colour: (p) => leafy(mix(leaf, [0.85, 0.85, 0.4], 0.3 * spots(p, 7, seed + k)), p), bones: ['top'], size: 1.2, opacity: 0.9,
    })
  }
  const body = buildBody({ bones, parts, blend: 0.6 }, count, seed)
  const phase = rand() * 6
  return {
    kind: 'birch', ...body,
    pose(grown, now, yaw, scale, wind) {
      const sk = body.skeleton
      base(sk, yaw, scale, sprung(grown, 0, 1.4))
      sk.size[2] = 0.25 + 0.75 * sprung(grown, 0.4, 1.1)
      bend(sk, 2, [1, 0, 0], 0.05 * wind * sway(now, phase, 1.6))
      bend(sk, 1, [0, 0, 1], 0.015 * wind * sway(now, phase + 1, 1.2))
      sk.update()
    },
  }
}

function bush(seed: number, count: number, pal: Palette): Plant {
  const rand = rng(seed)
  const bones: Bone[] = [root, { name: 'top', parent: 0, head: [0, 0.2, 0], tail: [0, 0.9, 0] }]
  const leaf = pick(rand, pal.bush), berries = rand() < 0.5
  const parts: Part[] = []
  const n = 3 + Math.floor(rand() * 2)
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rand(), r = k ? 0.3 + rand() * 0.15 : 0
    const R = (k ? 0.32 : 0.45) + rand() * 0.12
    parts.push({ shape: { ball: [Math.cos(a) * r, R * 0.75, Math.sin(a) * r], r: [R, R * 0.8, R] }, colour: (p, nn) => leafy(mix(mix(leaf, [0.5, 0.65, 0.25], 0.25 * spots(p, 9, seed)), [0.03, 0.08, 0.03], 0.4 * Math.max(0, -nn[1])), p), bones: ['top'], size: 1.2 })
  }
  if (berries) {
    for (let k = 0; k < 6; k++) {
      const a = rand() * Math.PI * 2, y = 0.3 + rand() * 0.4, rr = 0.42 + rand() * 0.1
      parts.push({ shape: { ball: [Math.cos(a) * rr, y, Math.sin(a) * rr], r: [0.035, 0.035, 0.035] }, colour: [0.8, 0.1, 0.15], bones: ['top'], density: 6, glow: true })
    }
  }
  const body = buildBody({ bones, parts, blend: 0.4 }, count, seed)
  const phase = rand() * 6
  return {
    kind: 'bush', ...body,
    pose(grown, now, yaw, scale, wind) {
      const sk = body.skeleton
      base(sk, yaw, scale, sprung(grown, 0, 0.9))
      bend(sk, 1, [1, 0, 0], 0.04 * wind * sway(now, phase, 1.7))
      sk.update()
    },
  }
}

function fern(seed: number, count: number, pal: Palette): Plant {
  const rand = rng(seed)
  const fronds = 6 + Math.floor(rand() * 3)
  const bones: Bone[] = [root]
  const parts: Part[] = []
  const green = vary(pal.fern, rand, 0.2)
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + rand() * 0.4
    const out: Vec3 = [Math.cos(a), 0, Math.sin(a)]
    const L = 0.55 + rand() * 0.3, up = 0.55
    const mid: Vec3 = [out[0] * L * 0.5, L * up, out[2] * L * 0.5]
    const tip: Vec3 = [out[0] * L, L * up * 0.75, out[2] * L]
    const side: Vec3 = [-out[2], 0, out[0]]
    const b = bones.length
    bones.push({ name: `f${f}`, parent: 0, head: [0, 0.03, 0] }, { name: `f${f}t`, parent: b, head: mid, tail: tip })
    const w = 0.13
    const at = (p: Vec3, s: number): Vec3 => [p[0] + side[0] * s, p[1], p[2] + side[2] * s]
    const p0: Vec3 = [0, 0.03, 0], q1: Vec3 = [out[0] * L * 0.25, L * up * 0.6, out[2] * L * 0.25]
    parts.push({
      shape: { sheet: [[p0, at(q1, w), at(q1, -w)], [at(q1, w), at(mid, w), at(q1, -w)], [at(q1, -w), at(mid, w), at(mid, -w)], [at(mid, w), tip, at(mid, -w)]] },
      // a darker vein down the middle of each frond
      colour: (p) => {
        const across = Math.abs(p[0] * side[0] + p[2] * side[2])
        return across < 0.012 ? mix(green, [0.1, 0.2, 0.05], 0.5) : mix(green, [0.7, 0.85, 0.35], 0.2 * Math.sin(Math.hypot(p[0], p[2]) * 60) ** 2)
      },
      bones: [`f${f}`, `f${f}t`], blend: 0.15, opacity: 0.95,
    })
  }
  const body = buildBody({ bones, parts, blend: 0.15 }, count, seed)
  const phase = rand() * 6
  const axes = Array.from({ length: fronds }, (_, f) => {
    const t = bones[2 + f * 2].tail!, l = Math.hypot(t[0], t[2])
    return [-t[2] / l, 0, t[0] / l] as Vec3
  })
  return {
    kind: 'fern', ...body,
    pose(grown, now, yaw, scale, wind) {
      const sk = body.skeleton
      base(sk, yaw, scale, sprung(grown, 0, 0.5))
      for (let f = 0; f < fronds; f++) {
        // each frond uncurls from upright, the tip last, one after another
        const open = sprung(grown, 0.15 + f * 0.07, 0.9)
        // turning about a frond's side axis by a positive angle lifts it, so closed is up and curled over
        bend(sk, 1 + f * 2, axes[f], 0.9 * (1 - open) + 0.04 * wind * sway(now, phase + f, 2))
        bend(sk, 2 + f * 2, axes[f], 1.8 * (1 - open) - 0.15 * open)
      }
      sk.update()
    },
  }
}

function flowers(seed: number, count: number, pal: Palette): Plant {
  const rand = rng(seed)
  const n = 3 + Math.floor(rand() * 3)
  const colour = pick(rand, pal.petals)
  const bones: Bone[] = [root]
  const parts: Part[] = []
  const heads: number[] = []
  for (let k = 0; k < n; k++) {
    const a = rand() * Math.PI * 2, r = k ? 0.08 + rand() * 0.16 : 0
    const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.25 + rand() * 0.3
    const top: Vec3 = [x * 1.3, h, z * 1.3]
    const s = bones.length
    bones.push({ name: `s${k}`, parent: 0, head: [x, 0, z] }, { name: `h${k}`, parent: s, head: top, tail: [top[0], top[1] + 0.05, top[2]] })
    heads.push(s + 1)
    parts.push({ shape: { tube: [[x, 0, z], top], r: [0.008, 0.006] }, colour: STEM, bones: [`s${k}`], density: 3 })
    const petal = vary(colour, rand, 0.15), petals = 5 + Math.floor(rand() * 2), R = 0.05 + rand() * 0.025
    const tri: Vec3[][] = []
    for (let p = 0; p < petals; p++) {
      const b0 = (p / petals) * Math.PI * 2, b1 = b0 + (Math.PI * 2) / petals
      const mid = (b0 + b1) / 2
      tri.push([top, [top[0] + Math.cos(b0 + 0.2) * R * 0.7, top[1] + 0.01, top[2] + Math.sin(b0 + 0.2) * R * 0.7], [top[0] + Math.cos(mid) * R, top[1] + 0.02, top[2] + Math.sin(mid) * R]])
      tri.push([top, [top[0] + Math.cos(mid) * R, top[1] + 0.02, top[2] + Math.sin(mid) * R], [top[0] + Math.cos(b1 - 0.2) * R * 0.7, top[1] + 0.01, top[2] + Math.sin(b1 - 0.2) * R * 0.7]])
    }
    parts.push({ shape: { sheet: tri }, colour: (p) => mix(petal, [1, 1, 1], 0.25 * (1 - Math.hypot(p[0] - top[0], p[2] - top[2]) / R)), bones: [`h${k}`], density: 4, glow: true, size: 0.9 })
    parts.push({ shape: { ball: [top[0], top[1] + 0.015, top[2]], r: [0.014, 0.01, 0.014] }, colour: [0.95, 0.75, 0.15], bones: [`h${k}`], density: 6, glow: true })
  }
  const body = buildBody({ bones, parts, blend: 0.04 }, count, seed)
  const phase = rand() * 6
  return {
    kind: 'flowers', ...body,
    pose(grown, now, yaw, scale, wind) {
      const sk = body.skeleton
      base(sk, yaw, scale, 1)
      for (let k = 0; k < n; k++) {
        const d = k * 0.12
        sk.size[heads[k] - 1] = sprung(grown, d, 0.6)
        // the head opens once the stem is up
        sk.size[heads[k]] = sprung(grown, d + 0.45, 0.5)
        bend(sk, heads[k] - 1, [1, 0, 0], 0.08 * wind * sway(now, phase + k, 2.4))
      }
      sk.update()
    },
  }
}

function mushrooms(seed: number, count: number): Plant {
  const rand = rng(seed)
  const n = 2 + Math.floor(rand() * 3)
  const red = rand() < 0.6
  const capColour: Vec3 = red ? [0.82, 0.12, 0.1] : [0.62, 0.4, 0.22]
  const bones: Bone[] = [root]
  const parts: Part[] = []
  for (let k = 0; k < n; k++) {
    const a = rand() * Math.PI * 2, r = k ? 0.08 + rand() * 0.1 : 0
    const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.08 + rand() * 0.1, R = 0.05 + rand() * 0.05
    bones.push({ name: `m${k}`, parent: 0, head: [x, 0, z], tail: [x, h, z] })
    parts.push({ shape: { tube: [[x, 0, z], [x, h, z]], r: [R * 0.32, R * 0.26] }, colour: [0.92, 0.88, 0.78], bones: [`m${k}`], density: 2 })
    parts.push({
      shape: { ball: [x, h, z], r: [R, R * 0.55, R] },
      colour: (p, nn) => (nn[1] < -0.2 ? [0.85, 0.8, 0.7] : red && spots(p, 90, k) > 0.72 ? [0.98, 0.96, 0.92] : capColour),
      bones: [`m${k}`], density: 3, glow: false,
    })
  }
  const body = buildBody({ bones, parts, blend: 0.05 }, count, seed)
  return {
    kind: 'mushrooms', ...body,
    pose(grown, _now, yaw, scale) {
      const sk = body.skeleton
      base(sk, yaw, scale, 1)
      for (let k = 0; k < n; k++) sk.size[1 + k] = sprung(grown, k * 0.15, 0.45)
      sk.update()
    },
  }
}

function rock(seed: number, count: number): Plant {
  const rand = rng(seed)
  const bones: Bone[] = [root]
  const parts: Part[] = []
  const n = 1 + Math.floor(rand() * 3)
  for (let k = 0; k < n; k++) {
    const R = (k ? 0.14 : 0.28) + rand() * 0.12, a = rand() * 6, r = k ? 0.3 : 0
    parts.push({
      shape: { ball: [Math.cos(a) * r, R * 0.35, Math.sin(a) * r], r: [R * (1 + rand() * 0.4), R * 0.7, R] },
      colour: (p, nn) => (nn[1] > 0.55 && spots(p, 14, k) > 0.45 ? MOSS : mix(STONE, [0.35, 0.34, 0.33], spots(p, 25, seed + k))),
      bones: ['root'], density: 1, size: 1.2,
    })
  }
  const body = buildBody({ bones, parts, blend: 0.3 }, count, seed)
  return {
    kind: 'rock', ...body,
    pose(grown, _now, yaw, scale) {
      const sk = body.skeleton
      // a rock rises out of the ground rather than growing
      base(sk, yaw, scale, 1)
      sk.offset[1] = -0.5 * (1 - sprung(grown, 0, 0.7))
      sk.update()
    },
  }
}

/** About how many blobs each kind gets at detail 1. */
export const BLOBS: Record<Kind, number> = { pine: 2200, oak: 2600, birch: 1600, bush: 700, fern: 500, flowers: 450, mushrooms: 300, rock: 260 }

export function makePlant(kind: Kind, seed: number, detail: number, season: Season): Plant {
  const pal = PALETTES[season]
  const n = Math.max(120, Math.round(BLOBS[kind] * detail))
  switch (kind) {
    case 'pine': return pine(seed, n, pal)
    case 'oak': return broadleaf(seed, n, pal)
    case 'birch': return birch(seed, n, pal)
    case 'bush': return bush(seed, n, pal)
    case 'fern': return fern(seed, n, pal)
    case 'flowers': return flowers(seed, n, pal)
    case 'mushrooms': return mushrooms(seed, n)
    case 'rock': return rock(seed, n)
  }
}
