import { Blobs, quatFacing, type Quat, type Vec3 } from '../../splat-core/blobs.ts'
import { buildBody, mix, rng, spots, type Creature, type Part } from '../../splat-engine/body.ts'
import { Skeleton, axisAngle, emptySkin, mulQ, setWeights } from '../../splat-engine/rig.ts'
import { DOORS, HALF, PILLARS } from './game.ts'

/**
 * The hall the fight happens in: a flagstone floor, brick walls with three
 * dark doorways, four pillars and eight torches. Torchlight is baked into
 * the stone's color (warm near a torch, cold and dim between), and the
 * torch flames are bones that flicker.
 */

export const WALL_H = 2.7
const DOOR_W = 0.85, DOOR_H = 2.05
/** Where the torches hang, just off the walls, at flame height. */
export const TORCHES: Vec3[] = [
  [3.2, 1.85, HALF - 0.12], [-3.2, 1.85, HALF - 0.12], [3.2, 1.85, -HALF + 0.12], [-3.2, 1.85, -HALF + 0.12],
  [HALF - 0.12, 1.85, 4.8], [HALF - 0.12, 1.85, -2.2], [-HALF + 0.12, 1.85, 4.8], [-HALF + 0.12, 1.85, -2.2],
]
const FLAME: Vec3 = [1, 0.6, 0.28]
const AMBIENT: Vec3 = [0.34, 0.34, 0.44]

/** Torchlight at a point facing `n`: a cool, dim ambient plus each torch, falling off with distance. */
export function torchLight(p: Vec3, n: Vec3 = [0, 1, 0]): Vec3 {
  let k = 0
  for (const t of TORCHES) {
    const d: Vec3 = [t[0] - p[0], t[1] - p[1], t[2] - p[2]]
    const l = Math.hypot(...d) || 1
    const facing = Math.max(0.15, (d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) / l)
    k += (2.2 * facing) / (1 + l * l * 0.22)
  }
  return [AMBIENT[0] + FLAME[0] * k, AMBIENT[1] + FLAME[1] * k, AMBIENT[2] + FLAME[2] * k]
}

/**
 * How the hall's stone is colored when built: with the torchlight baked in,
 * or (for live lights, which light it each frame) as the stone itself, a
 * little lifted so the shadows aren't black.
 */
const lighter = (live: boolean) => (c: Vec3, p: Vec3, n?: Vec3): Vec3 => {
  const l = live ? LIVE_STONE : torchLight(p, n)
  return [Math.min(1, c[0] * l[0]), Math.min(1, c[1] * l[1]), Math.min(1, c[2] * l[2])]
}
const LIVE_STONE: Vec3 = [1.1, 1.08, 1.15]

const STONE: Vec3[] = [[0.5, 0.48, 0.45], [0.44, 0.43, 0.42], [0.55, 0.5, 0.44], [0.4, 0.41, 0.44]]
const GROUT: Vec3 = [0.12, 0.11, 0.1]
const BRICK: Vec3[] = [[0.52, 0.44, 0.38], [0.46, 0.4, 0.36], [0.56, 0.5, 0.42], [0.42, 0.38, 0.36]]
const MOSS: Vec3 = [0.25, 0.36, 0.18]

/** One bone that never moves. */
function still(blobs: Blobs): Creature {
  const skeleton = new Skeleton([{ name: 'still', parent: -1, head: [0, 0, 0] }])
  const skin = emptySkin(blobs.count)
  for (let i = 0; i < blobs.count; i++) setWeights(skin, i, [[0, 1]])
  return { blobs, skin, skeleton }
}

/** Flagstones: a grid of slabs, each its own shade, with dark grout between and moss in the cracks. */
export function makeFloor(detail: number, live = false): Creature {
  const lit = lighter(live)
  const n = Math.max(4000, Math.round(26000 * detail))
  const rand = rng(41)
  const blobs = new Blobs(n)
  const k = Math.sqrt(1 / Math.max(detail, 0.2))
  const up: Vec3 = [0, 1, 0]
  const CELL = 0.95
  while (blobs.count < n) {
    const x = (rand() * 2 - 1) * HALF, z = (rand() * 2 - 1) * HALF
    // rows of slabs, every other row shifted by half a slab
    const row = Math.floor((z + HALF) / CELL)
    const sx = x + HALF + (row % 2) * CELL * 0.5
    const col = Math.floor(sx / CELL)
    const u = sx / CELL - col, v = (z + HALF) / CELL - row
    const edge = Math.min(u, 1 - u, v, 1 - v)
    const slab = rng(row * 131 + col * 17 + 3)
    const base = STONE[Math.floor(slab() * STONE.length)]
    const p: Vec3 = [x, 0, z]
    let c = edge < 0.035 ? GROUT : mix(base, mix(base, [0.3, 0.29, 0.28], 0.6), spots(p, 4.5, row) * 0.6)
    if (edge < 0.08 && spots(p, 2.2, 5) > 0.68) c = mix(c, MOSS, 0.7)
    const s = (edge < 0.035 ? 0.045 : 0.075 + rand() * 0.04) * k
    const a = rand() * Math.PI
    const q: Quat = mulQ([0, Math.sin(a / 2), 0, Math.cos(a / 2)], quatFacing(up))
    blobs.push({ center: [x, edge < 0.035 ? -0.004 : 0, z], scale: [s, s * (0.6 + rand() * 0.4), s * 0.12], quat: q, color: lit(shade(c, rand), p), opacity: 0.97 })
  }
  return still(blobs)
}

/** The four walls, in staggered brick, with an arched doorway where each door is. */
export function makeWalls(detail: number, live = false): Creature {
  const lit = lighter(live)
  const n = Math.max(6000, Math.round(38000 * detail))
  const rand = rng(77)
  const blobs = new Blobs(n)
  const k = Math.sqrt(1 / Math.max(detail, 0.2))
  const BH = 0.3, BL = 0.62
  const sides = [
    { n: [0, 0, -1] as Vec3, at: (s: number, y: number): Vec3 => [s, y, HALF] },
    { n: [0, 0, 1] as Vec3, at: (s: number, y: number): Vec3 => [s, y, -HALF] },
    { n: [-1, 0, 0] as Vec3, at: (s: number, y: number): Vec3 => [HALF, y, s] },
    { n: [1, 0, 0] as Vec3, at: (s: number, y: number): Vec3 => [-HALF, y, s] },
  ]
  // a door's opening, as distance along its wall and height: a rectangle with a round top
  const inDoor = (p: Vec3, pad: number) => DOORS.some((d) => {
    const along = Math.abs(d.x) > HALF - 1 ? p[2] - d.z : p[0] - d.x
    const onWall = Math.abs(d.x) > HALF - 1 ? Math.abs(p[0] - Math.sign(d.x) * HALF) < 0.01 : Math.abs(p[2] - Math.sign(d.z) * HALF) < 0.01
    if (!onWall) return false
    const w = DOOR_W + pad, top = DOOR_H - DOOR_W + pad
    if (Math.abs(along) > w) return false
    return p[1] < top || Math.hypot(along, p[1] - top) < w
  })
  while (blobs.count < n) {
    const side = sides[Math.floor(rand() * 4)]
    const s = (rand() * 2 - 1) * HALF, y = rand() * WALL_H
    const p = side.at(s, y)
    if (inDoor(p, 0)) continue
    const row = Math.floor(y / BH)
    const bs = s + HALF + (row % 2) * BL * 0.5
    const col = Math.floor(bs / BL)
    const u = bs / BL - col, v = y / BH - row
    const edge = Math.min(u * BL, (1 - u) * BL, v * BH, (1 - v) * BH)
    const brick = rng(row * 977 + col * 31 + Math.round(side.n[0] * 5 + side.n[2] * 11))
    const arch = inDoor(p, 0.22)
    let c = arch ? mix(BRICK[2], [0.6, 0.58, 0.55], 0.5) : mix(BRICK[Math.floor(brick() * BRICK.length)], [0.3, 0.27, 0.25], spots(p, 5, row) * 0.5)
    if (edge < 0.032 && !arch) c = GROUT
    // damp, dark and mossy along the foot of the wall
    if (y < 0.5) c = mix(c, spots(p, 3, 2) > 0.6 ? MOSS : [0.2, 0.19, 0.18], (1 - y / 0.5) * 0.6)
    const sz = (edge < 0.032 ? 0.03 : 0.055 + rand() * 0.03) * k
    const off = (rand() * 0.02) * (edge < 0.032 ? -1 : 1)
    const center: Vec3 = [p[0] + side.n[0] * off, p[1], p[2] + side.n[2] * off]
    blobs.push({ center, scale: [sz, sz * (0.6 + rand() * 0.4), sz * 0.15], quat: quatFacing(side.n), color: lit(shade(c, rand), center, side.n), opacity: 0.98 })
  }
  return still(blobs)
}

/**
 * Four round pillars, each a drum of stone courses on a wider base and under
 * a wider capital (sampled by hand: the body builder's tubes are capsules,
 * which made them look like mushrooms), with rubble at their feet.
 */
export function makePillars(detail: number, live = false): Creature {
  const lit = lighter(live)
  const n = Math.max(3000, Math.round(16000 * detail))
  const rand = rng(9)
  const blobs = new Blobs(n)
  const k = Math.sqrt(1 / Math.max(detail, 0.2))
  const COURSE = 0.42, BASE = 0.24, CAP = 0.26
  // a point on a drum's side (radius r, from y0 to y1), or on its flat top or bottom ring (r0 to r)
  const put = (c: Vec3, p: Vec3, nn: Vec3, s: number) =>
    blobs.push({ center: p, scale: [s, s * (0.6 + rand() * 0.4), s * 0.15], quat: quatFacing(nn), color: lit(shade(c, rand), p, nn), opacity: 0.98 })
  while (blobs.count < n) {
    const pl = PILLARS[Math.floor(rand() * PILLARS.length)]
    const a = rand() * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a)
    const pick = rand()
    if (pick < 0.7) {
      // the shaft, in courses of stone with dark joints
      const y = BASE + rand() * (WALL_H - BASE - CAP), r = pl.r
      const v = (y - BASE) / COURSE, joint = Math.min(v % 1, 1 - (v % 1)) * COURSE < 0.022
      const p: Vec3 = [pl.x + ca * r, y, pl.z + sa * r]
      const c = joint ? GROUT : mix([0.52, 0.5, 0.47], [0.36, 0.35, 0.35], spots(p, 5, Math.floor(v)) * 0.7)
      put(c, p, [ca, 0, sa], (joint ? 0.035 : 0.06 + rand() * 0.03) * k)
    } else {
      // base or capital: a wider drum, its side and its flat ring
      const cap = pick > 0.85
      const R = pl.r + 0.13, y0 = cap ? WALL_H - CAP : 0, y1 = cap ? WALL_H : BASE
      const c: Vec3 = [0.6, 0.57, 0.52]
      if (rand() < 0.6) {
        const y = y0 + rand() * (y1 - y0)
        put(y > y1 - 0.03 || y < y0 + 0.03 ? mix(c, GROUT, 0.5) : c, [pl.x + ca * R, y, pl.z + sa * R], [ca, 0, sa], (0.05 + rand() * 0.02) * k)
      } else {
        const r = pl.r + rand() * 0.13
        put(c, [pl.x + ca * r, cap ? y0 : y1, pl.z + sa * r], cap ? [0, -1, 0] : [0, 1, 0], (0.05 + rand() * 0.02) * k)
      }
    }
  }
  // rubble at their feet
  const parts: Part[] = []
  const stone = (p: Vec3, nn: Vec3): Vec3 => lit(mix([0.5, 0.48, 0.46], [0.34, 0.33, 0.33], spots(p, 6, 1) * 0.7), p, nn)
  for (const pl of PILLARS) for (let j = 0; j < 4; j++) {
    const a = rand() * Math.PI * 2, d = pl.r + 0.3 + rand() * 0.4, s = 0.05 + rand() * 0.08
    parts.push({ shape: { ball: [pl.x + Math.cos(a) * d, s * 0.5, pl.z + Math.sin(a) * d], r: [s * 1.3, s * 0.8, s] }, color: stone, bones: ['still'] })
  }
  const rubble = buildBody({ bones: [{ name: 'still', parent: -1, head: [0, 0, 0] }], parts, blend: 1 }, Math.round(1500 * Math.max(0.4, detail)), 13)
  return still(concat(blobs, rubble.blobs))
}

function concat(a: Blobs, b: Blobs): Blobs {
  const out = new Blobs(a.count + b.count)
  for (const src of [a, b]) for (let i = 0; i < src.count; i++) out.push(src.get(i))
  return out
}

/** The torches: an iron bracket and a cup on the wall, and a flame on its own bone so it can flicker. */
export function makeTorches(detail: number, live = false): Creature {
  const lit = lighter(live)
  const bones = [{ name: 'root', parent: -1, head: [0, 0, 0] as Vec3 }]
  const parts: Part[] = []
  const IRON: Vec3 = [0.16, 0.14, 0.13]
  TORCHES.forEach((t, i) => {
    // out from the wall the torch hangs on
    const out: Vec3 = Math.abs(t[0]) > HALF - 1 ? [-Math.sign(t[0]), 0, 0] : [0, 0, -Math.sign(t[2])]
    const wall: Vec3 = [t[0] - out[0] * 0.14, t[1] - 0.45, t[2] - out[2] * 0.14]
    const cup: Vec3 = [t[0], t[1] - 0.1, t[2]]
    bones.push({ name: `flame${i}`, parent: 0, head: [t[0], t[1] - 0.08, t[2]] })
    parts.push(
      { shape: { tube: [wall, [cup[0], cup[1] - 0.12, cup[2]]], r: [0.025, 0.02] }, color: (p, n) => lit(IRON, p, n), bones: ['root'], density: 3 },
      { shape: { tube: [[cup[0], cup[1] - 0.12, cup[2]], cup], r: [0.035, 0.07] }, color: (p, n) => lit(IRON, p, n), bones: ['root'], density: 3 },
      // the flame: white-yellow at the root, orange and thin at the tip
      {
        shape: { fill: [[t[0], t[1] - 0.1, t[2]], [t[0], t[1] + 0.32, t[2]]], r: [0.07, 0.01] },
        color: (_p, _n, u) => mix([1, 0.92, 0.55], [1, 0.38, 0.08], u), glow: true, opacity: (_p, u) => 0.85 * (1 - u * 0.6),
        bones: [`flame${i}`], density: 5, size: 0.7,
      },
      { shape: { ball: [t[0], t[1] + 0.02, t[2]], r: [0.16, 0.2, 0.16] }, color: [1, 0.5, 0.15], glow: true, opacity: 0.1, bones: [`flame${i}`], density: 0.6, size: 2 },
    )
  })
  const b = buildBody({ bones, parts, blend: 0.05 }, Math.max(1600, Math.round(5000 * detail)), 21)
  return { blobs: b.blobs, skin: b.skin, skeleton: b.skeleton }
}

/** How tall torch i's flame is at time t (about 0.7–1.06): its own rhythm, and the strength of its light when lights are live. */
export const flicker = (t: number, i: number) => 0.88 + 0.08 * Math.sin(t * 13 + i * 2.1) + 0.06 * Math.sin(t * 23.7 + i * 5.3) + 0.04 * Math.sin(t * 41 + i)

/** Flames flickering: each its own rhythm, stretching and leaning. */
export function poseTorches(sk: Skeleton, t: number) {
  for (let i = 0; i < TORCHES.length; i++) {
    const b = i + 1
    sk.size[b] = flicker(t, i)
    const lean = 0.08 * Math.sin(t * 5.1 + i * 1.7) + 0.05 * Math.sin(t * 11 + i * 3)
    sk.setRotation(b, mulQ(axisAngle([1, 0, 0], lean), axisAngle([0, 0, 1], 0.6 * lean)))
  }
  sk.update()
}

function shade(c: Vec3, rand: () => number): Vec3 {
  const k = 0.85 + rand() * 0.25
  return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]
}
