import type { Vec3 } from '../../splat-core/blobs.ts'
import { buildBody, mix, spots, type Creature, type Part } from '../../splat-engine/body.ts'
import { axisAngle, type Bone, type Skeleton } from '../../splat-engine/rig.ts'
import { BURST, RULES, SPAWN, hopShape, type Slime, type SlimeKind } from './game.ts'

/**
 * A slime: a see-through dome of jelly with a darker core, a shine and two
 * eyes. Its bones are a body (a top and four sides about a core, pulled in
 * and out for squash and stretch) and a ring of shards: drops of the same
 * jelly, hidden while it lives, that fly out and splat on the floor when it
 * bursts.
 */

export const COLOURS: Record<SlimeKind, { skin: Vec3; deep: Vec3 }> = {
  green: { skin: [0.42, 0.9, 0.35], deep: [0.1, 0.45, 0.12] },
  blue: { skin: [0.35, 0.65, 1], deep: [0.08, 0.22, 0.6] },
  red: { skin: [1, 0.38, 0.3], deep: [0.55, 0.06, 0.08] },
  purple: { skin: [0.72, 0.42, 1], deep: [0.3, 0.1, 0.5] },
  gold: { skin: [1, 0.85, 0.3], deep: [0.7, 0.42, 0.05] },
}

const R = 0.36, H = 0.3, CY = 0.27
export const SHARDS = 16
const SIDES: [string, Vec3][] = [['f', [0, 0, 1]], ['b', [0, 0, -1]], ['l', [1, 0, 0]], ['r', [-1, 0, 0]]]

/** Where each shard starts, on the dome: spread evenly by a golden spiral over the upper part. */
function shardHome(i: number): Vec3 {
  const y = 1 - (i + 0.5) / SHARDS * 1.3
  const r = Math.sqrt(Math.max(0, 1 - y * y))
  const a = i * 2.399963
  return [Math.cos(a) * r * R * 0.9, CY + Math.max(-0.6, y) * H * 0.9, Math.sin(a) * r * R * 0.9]
}

const BONES: Bone[] = [
  { name: 'root', parent: -1, head: [0, 0, 0] },
  { name: 'body', parent: 0, head: [0, 0.02, 0] },
  { name: 'core', parent: 1, head: [0, CY, 0] },
  { name: 'top', parent: 1, head: [0, CY + H, 0] },
  ...SIDES.map(([name, d]): Bone => ({ name, parent: 1, head: [d[0] * R, CY - 0.03, d[2] * R] })),
  ...Array.from({ length: SHARDS }, (_, i): Bone => ({ name: `shard${i}`, parent: 0, head: shardHome(i) })),
]
const BODY = ['core', 'top', 'f', 'b', 'l', 'r']

export function makeSlime(kind: SlimeKind, count = 2600): Creature {
  const { skin, deep } = COLOURS[kind]
  const jelly = (p: Vec3, n: Vec3): Vec3 => {
    // lighter at the top and towards the light, deeper underneath, with a faint mottle
    const t = Math.max(0, Math.min(1, (p[1] - 0.02) / (2 * H)))
    return mix(mix(deep, skin, 0.35 + 0.65 * t), [1, 1, 1], 0.12 * Math.max(0, n[1]) + 0.08 * spots(p, 18, 2))
  }
  const parts: Part[] = [
    { shape: { ball: [0, CY, 0], r: [R, H, R] }, colour: jelly, bones: BODY, opacity: 0.55, size: 1.2 },
    { shape: { ball: [0, CY - 0.02, 0], r: [R * 0.82, H * 0.78, R * 0.82] }, colour: (p) => mix(deep, skin, 0.3 + 0.3 * spots(p, 9, 1)), bones: BODY, opacity: 0.4, density: 0.5, size: 1.4 },
    // a darker heart, seen through the jelly
    { shape: { ball: [0, CY - 0.02, -0.02], r: [0.12, 0.1, 0.12] }, colour: mix(deep, [0, 0, 0], 0.3), bones: ['core'], opacity: 0.8, density: 1.5 },
    // the shine, high on the front
    { shape: { ball: [0.13, CY + H * 0.72, 0.15], r: [0.07, 0.035, 0.05] }, colour: [1, 1, 1], glow: true, opacity: 0.85, bones: ['top', 'f'], density: 3 },
    { shape: { ball: [0.2, CY + H * 0.45, 0.25], r: [0.025, 0.02, 0.02] }, colour: [1, 1, 1], glow: true, opacity: 0.7, bones: ['top', 'f', 'l'], density: 4 },
    // a little smile
    { shape: { tube: [[-0.06, CY - 0.01, R * 1.0], [0.06, CY - 0.01, R * 1.0]], r: [0.014, 0.014], flat: 0.6 }, colour: [0.06, 0.04, 0.05], bones: ['f', 'core'], density: 5, opacity: 1 },
  ]
  for (const x of [-1, 1]) {
    parts.push(
      { shape: { ball: [0.11 * x, CY + 0.09, R * 0.98], r: [0.045, 0.065, 0.025] }, colour: [0.04, 0.03, 0.05], bones: ['top', 'f'], density: 6, opacity: 1 },
      { shape: { ball: [0.11 * x + 0.015, CY + 0.12, R * 1.04], r: [0.012, 0.015, 0.008] }, colour: [1, 1, 1], glow: true, bones: ['top', 'f'], density: 10, opacity: 1 },
    )
  }
  // the shards: drops of jelly, one per bone, hidden until it bursts
  for (let i = 0; i < SHARDS; i++) {
    const s = 0.045 + (i % 3) * 0.015
    parts.push({ shape: { ball: shardHome(i), r: [s, s * 0.9, s] }, colour: (p, n) => jelly([p[0], CY + (p[1] - CY) * 0.5 + 0.15, p[2]], n), bones: [`shard${i}`], opacity: 0.8, density: 2.2 })
  }
  const b = buildBody({ bones: BONES, parts, blend: 0.16 }, count, 3 + kind.length)
  return { blobs: b.blobs, skin: b.skin, skeleton: b.skeleton }
}

const SHARD0 = BONES.findIndex((b) => b.name === 'shard0')
const BODY_I = 1, TOP = 3, SIDE0 = 4

/** Hides a slime that isn't out: no size, standing at `at` so it doesn't stretch the scene's bounds. */
export function hideSlime(sk: Skeleton, at: Vec3) {
  sk.reset()
  sk.rootScale = 0
  sk.place.set(at)
  sk.update()
}

/** Poses a slime from the game's state of it, at game time `time` (for the wobble). */
export function poseSlime(sk: Skeleton, s: Slime, hasteHop: number) {
  sk.reset()
  const rule = RULES[s.kind]
  sk.place.set([s.x, 0, s.z])
  sk.setRotation(0, axisAngle([0, 1, 0], s.heading))
  sk.size[0] = rule.size
  for (let i = 0; i < SHARDS; i++) sk.size[SHARD0 + i] = 0
  let squash = 0, y = 0
  if (s.phase === 'spawn') {
    // grows in at the door with a wobble
    const u = Math.min(1, s.t / SPAWN)
    sk.size[BODY_I] = Math.max(0.001, 1 - Math.cos(u * Math.PI * 1.5) * Math.exp(-u * 3.5) * (1 - u) - (1 - u) ** 3)
    squash = 0.3 * Math.sin(u * 9) * (1 - u)
  } else if (s.phase === 'live') {
    const hop = hopShape(s.hopT, hasteHop)
    squash = hop.squash
    y = hop.y
    // struck: a hard wobble that dies away
    squash += 0.55 * Math.exp(-s.struck * 7) * Math.cos(s.struck * 32)
  } else {
    burst(sk, s.t)
    sk.update()
    return
  }
  sk.offset[1] = y
  sk.offset[TOP * 3 + 1] = -0.2 * squash
  sk.offset[2 * 3 + 1] = -0.08 * squash
  SIDES.forEach(([, d], k) => {
    const b = SIDE0 + k
    sk.offset[b * 3] = d[0] * 0.13 * squash
    sk.offset[b * 3 + 2] = d[2] * 0.13 * squash
    sk.offset[b * 3 + 1] = -0.05 * squash
  })
  sk.update()
}

/** The burst: the body swells and is gone, and the shards fly out, fall and lie on the floor as splats, then fade. */
function burst(sk: Skeleton, t: number) {
  sk.size[BODY_I] = t < 0.08 ? 1 + t * 4 : 0
  const fade = 1 - Math.max(0, (t - (BURST - 0.6)) / 0.6)
  for (let i = 0; i < SHARDS; i++) {
    const b = SHARD0 + i
    const home = BONES[b].head
    const out: Vec3 = [home[0], 0, home[2]]
    const l = Math.hypot(out[0], out[2]) || 1
    // each shard its own speed and lift, the same every time
    const sp = 1.6 + ((i * 0.618) % 1) * 2.2
    const vy = 1.5 + ((i * 0.381) % 1) * 2.4
    const g = 9.8
    const y0 = home[1]
    const land = (vy + Math.sqrt(vy * vy + 2 * g * (y0 - 0.03))) / g
    const tt = Math.min(t, land)
    const y = y0 + vy * tt - 0.5 * g * tt * tt
    sk.offset.set([(out[0] / l) * sp * tt, y - y0, (out[2] / l) * sp * tt], b * 3)
    // landed: a splat, flattened as far as one size can (wider, so it reads as spread)
    sk.size[b] = Math.max(0, (t >= land ? 1.35 : 1) * fade)
  }
}
