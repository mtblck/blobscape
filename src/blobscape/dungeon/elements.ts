import type { Blobs, Vec3 } from '../../splat-core/blobs.ts'
import { buildBody, mix, rng, type Creature, type Part } from '../../splat-engine/body.ts'
import { axisAngle, mulQ, type Bone, type Skeleton } from '../../splat-engine/rig.ts'
import { LAYER, LAYERS, type Ground } from './ground.ts'
import { flicker } from './hall.ts'

/**
 * How fire and frost on the hall's floor are drawn: the flagstones themselves
 * change color (glowing where they burn, scorched after, white-blue where
 * they freeze), a few flames stand on the hottest cells and a few clumps of
 * ice on the most frozen. Flames and ice are built once, each on its own
 * bone, and stand hidden (size 0) until the floor needs them.
 */

export const FLAMES = 12
export const CRYSTALS = 10
/** Flames that ride on burning slimes and props, and puffs of steam (as many as the ground keeps). */
export const BODY_FLAMES = 6
export const PUFFS = 16
/** How far apart they stand, meters. */
export const FLAME_GAP = 0.8
export const CRYSTAL_GAP = 0.95

const EMBER: Vec3 = [1, 0.5, 0.12]
const ICE: Vec3 = [0.74, 0.88, 1]

/** `flames` fires at the origin: three tongues each, white-yellow at the root and orange at the tip. */
export function makeBlaze(count = 4200, flames = FLAMES, seed = 57): Creature {
  const bones: Bone[] = [{ name: 'root', parent: -1, head: [0, 0, 0] }]
  const parts: Part[] = []
  const rand = rng(seed)
  for (let i = 0; i < flames; i++) {
    const bone = `flame${i}`
    bones.push({ name: bone, parent: 0, head: [0, 0, 0] })
    const tongues: [number, number, number, number][] = [[0, 0, 0.62, 0.15]]
    for (let j = 0; j < 2; j++) { const a = rand() * Math.PI * 2, d = 0.13 + rand() * 0.06; tongues.push([Math.cos(a) * d, Math.sin(a) * d, 0.3 + rand() * 0.14, 0.1]) }
    for (const [x, z, h, r] of tongues) {
      parts.push({
        shape: { fill: [[x, 0, z], [x * 0.7, h, z * 0.7]], r: [r, 0.01] },
        color: (_p, _n, u) => mix([1, 0.92, 0.55], [1, 0.36, 0.07], u), glow: true, opacity: (_p, u) => 0.85 * (1 - u * 0.6),
        bones: [bone], density: 4, size: 0.8,
      })
    }
    parts.push({ shape: { ball: [0, 0.2, 0], r: [0.3, 0.3, 0.3] }, color: [1, 0.48, 0.14], glow: true, opacity: 0.09, bones: [bone], density: 0.5, size: 2.2 })
  }
  const b = buildBody({ bones, parts, blend: 0.02 }, count, 31)
  return { blobs: b.blobs, skin: b.skin, skeleton: b.skeleton }
}

/** `PUFFS` puffs of steam at the origin: a few soft pale balls each, faint, so they read as vapor, not smoke. */
export function makeSteam(count = 1400): Creature {
  const bones: Bone[] = [{ name: 'root', parent: -1, head: [0, 0, 0] }]
  const parts: Part[] = []
  const rand = rng(91)
  for (let i = 0; i < PUFFS; i++) {
    const bone = `puff${i}`
    bones.push({ name: bone, parent: 0, head: [0, 0, 0] })
    for (let j = 0; j < 5; j++) {
      const at: Vec3 = [(rand() - 0.5) * 0.3, 0.08 + j * 0.08, (rand() - 0.5) * 0.3]
      parts.push({ shape: { ball: at, r: [0.16, 0.12, 0.16] }, color: [0.9, 0.93, 0.96], opacity: 0.13, bones: [bone], density: 0.7, size: 2.4 })
    }
  }
  const b = buildBody({ bones, parts, blend: 0.02 }, count, 35)
  return { blobs: b.blobs, skin: b.skin, skeleton: b.skeleton }
}

/** `CRYSTALS` clumps of ice at the origin: three blocks each, blue to white at the tip. */
export function makeIce(count = 3000): Creature {
  const bones: Bone[] = [{ name: 'root', parent: -1, head: [0, 0, 0] }]
  const parts: Part[] = []
  const rand = rng(83)
  for (let i = 0; i < CRYSTALS; i++) {
    const bone = `ice${i}`
    bones.push({ name: bone, parent: 0, head: [0, 0, 0] })
    // one tall block and two short ones hard against it: thick and close, so a clump reads as ice and not as fingers
    for (let j = 0; j < 3; j++) {
      const a = (j / 3 + rand() * 0.25) * Math.PI * 2, lean = j ? 0.05 + rand() * 0.05 : 0.02, h = j ? 0.17 + rand() * 0.1 : 0.38 + rand() * 0.1
      const d = j ? 0.09 + rand() * 0.03 : 0
      const foot: Vec3 = [Math.cos(a) * d, 0, Math.sin(a) * d]
      parts.push({
        shape: { fill: [foot, [foot[0] + Math.cos(a) * lean, h, foot[2] + Math.sin(a) * lean]], r: [j ? 0.075 : 0.1, 0.012] },
        color: (_p, _n, u) => mix([0.42, 0.66, 0.95], [0.93, 0.98, 1], u), glow: true, opacity: 0.93, bones: [bone], density: 3, size: 0.75,
      })
    }
  }
  const b = buildBody({ bones, parts, blend: 0.02 }, count, 33)
  return { blobs: b.blobs, skin: b.skin, skeleton: b.skeleton }
}

/** A steady number from 0 to 1 for thing i, so each stands a little off its cell's middle and faces its own way. */
const hash = (i: number, k: number) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v) }

/** Stands each flame on its cell, as tall as the cell burns, flickering; `calm` (reduced motion) holds them steady. */
export function poseBlaze(sk: Skeleton, g: Ground, cells: Int32Array, t: number, calm = false) {
  for (let i = 0; i < FLAMES; i++) {
    const b = i + 1, cell = cells[i]
    if (cell < 0) { sk.size[b] = 0; continue }
    const [x, z] = g.center(cell)
    sk.offset.set([x + (hash(cell, 1) - 0.5) * 0.2, 0, z + (hash(cell, 2) - 0.5) * 0.2], b * 3)
    sk.size[b] = (0.3 + 0.7 * g.fire[cell]) * (calm ? 0.9 : flicker(t, i + 3)) * (0.85 + 0.3 * hash(cell, 3))
    const lean = calm ? 0 : 0.1 * Math.sin(t * 5.1 + i * 1.7) + 0.06 * Math.sin(t * 11 + i * 3)
    sk.setRotation(b, mulQ(axisAngle([1, 0, 0], lean), axisAngle([0, 0, 1], 0.6 * lean)))
  }
  sk.update()
}

/**
 * Stands flames on whatever burns (slimes and props, each with its `alight` and how high its middle is), the most
 * alight first; the rest stand hidden.
 */
export function poseBodyFlames(sk: Skeleton, burning: { x: number; z: number; alight: number; top: number }[], t: number, calm = false) {
  const on = burning.filter((b) => b.alight > 0.04).sort((a, b) => b.alight - a.alight)
  for (let i = 0; i < sk.count - 1; i++) {
    const b = i + 1, o = on[i]
    if (!o) { sk.size[b] = 0; continue }
    sk.offset.set([o.x, o.top * 0.85, o.z], b * 3)
    sk.size[b] = (0.45 + 0.55 * o.alight) * (calm ? 0.9 : flicker(t, i + 11))
    const lean = calm ? 0 : 0.12 * Math.sin(t * 6.3 + i * 2.1)
    sk.setRotation(b, axisAngle([1, 0, 0], lean))
  }
  sk.update()
}

/** Each puff of steam rises, swells and thins away over its life (`age` 0 to 1); `calm` lets them stand still and fade. */
export function poseSteam(sk: Skeleton, puffs: { x: number; y: number; z: number; age: number }[], calm = false) {
  for (let i = 0; i < sk.count - 1; i++) {
    const b = i + 1, p = puffs[i]
    if (!p) { sk.size[b] = 0; continue }
    sk.offset.set([p.x, p.y + (calm ? 0.2 : 1.1 * p.age), p.z], b * 3)
    sk.size[b] = (0.6 + 1.3 * p.age) * Math.sqrt(Math.max(0, 1 - p.age))
  }
  sk.update()
}

/**
 * Which layer of which column up a wall or a pillar each blob of a wall or pillar actor lies in (column × LAYERS +
 * layer), or −1 for one too high or too far from any column: found once, as the blobs don't move.
 */
export function climbCells(blobs: Blobs, g: Ground): Int32Array {
  const byCell = new Map<number, number[]>()
  g.columns.forEach((c, k) => { if (!byCell.has(c.cell)) byCell.set(c.cell, []); byCell.get(c.cell)!.push(k) })
  const out = new Int32Array(blobs.count).fill(-1)
  const lim = g.half - 0.01
  for (let i = 0; i < blobs.count; i++) {
    const x = blobs.center[i * 3], y = blobs.center[i * 3 + 1], z = blobs.center[i * 3 + 2]
    const layer = Math.floor(y / LAYER)
    if (layer < 0 || layer >= LAYERS) continue
    const cx = Math.min(lim, Math.max(-lim, x)), cz = Math.min(lim, Math.max(-lim, z))
    let best = -1, near = 0.45
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      for (const k of byCell.get(g.index(cx + dx * g.cell, cz + dz * g.cell)) ?? []) {
        const d = Math.hypot(g.columns[k].x - x, g.columns[k].z - z)
        if (d < near) { near = d; best = k }
      }
    }
    if (best >= 0) out[i] = best * LAYERS + layer
  }
  return out
}

/** Colors wall and pillar blobs from the layers above the floor: rime where frozen, a glow where flames lick. Returns how many changed. */
export function paintClimb(blobs: Blobs, base: Float32Array, at: Int32Array, g: Ground, live: boolean) {
  let changed = 0
  const c = blobs.color
  for (let i = 0; i < blobs.count; i++) {
    let r = base[i * 3], gr = base[i * 3 + 1], b = base[i * 3 + 2]
    const k = at[i]
    if (k >= 0 && (g.upFire[k] > 0.004 || g.upFrost[k] > 0.004)) {
      changed++
      const frost = g.upFrost[k], fire = g.upFire[k]
      if (frost > 0) {
        const m = Math.min(1, frost * (0.5 + 0.5 * hash(i, 10))) * 0.75
        const l = live ? 1 : Math.max(0.3, Math.min(1.15, Math.max(r, gr, b) / 0.42))
        r += (ICE[0] * l - r) * m; gr += (ICE[1] * l - gr) * m; b += (ICE[2] * l - b) * m
      }
      if (fire > 0) {
        const m = Math.min(1, fire * (0.5 + 0.5 * hash(i, 11))) * 0.8
        r += (EMBER[0] - r) * m; gr += (EMBER[1] - gr) * m; b += (EMBER[2] - b) * m
      }
    }
    c[i * 3] = r; c[i * 3 + 1] = gr; c[i * 3 + 2] = b
  }
  return changed
}

/** Stands each clump of ice on its cell: it grows as the cell freezes and sinks as it melts. */
export function poseIce(sk: Skeleton, g: Ground, cells: Int32Array) {
  for (let i = 0; i < CRYSTALS; i++) {
    const b = i + 1, cell = cells[i]
    if (cell < 0) { sk.size[b] = 0; continue }
    const [x, z] = g.center(cell)
    sk.offset.set([x + (hash(cell, 4) - 0.5) * 0.24, 0, z + (hash(cell, 5) - 0.5) * 0.24], b * 3)
    sk.size[b] = g.frost[cell] * (0.8 + 0.5 * hash(cell, 6))
    sk.setRotation(b, axisAngle([0, 1, 0], hash(cell, 7) * Math.PI * 2))
  }
  sk.update()
}

/**
 * Colors the floor's blobs from the ground: `base` is each blob's own color
 * as built. Scorched stone is darker, burning stone glows, frozen stone is
 * pale blue with a grain to it. With torchlight baked into the floor (`live`
 * false) frost is as dim as the stone it lies on, so it doesn't shine in a
 * dark corner. Returns how many blobs are not their own color.
 */
export function paintFloor(blobs: Blobs, base: Float32Array, g: Ground, live: boolean) {
  let changed = 0
  const c = blobs.color
  for (let i = 0; i < blobs.count; i++) {
    const x = blobs.center[i * 3], z = blobs.center[i * 3 + 2]
    const fire = g.sample(g.fire, x, z), frost = g.sample(g.frost, x, z), char = g.sample(g.char, x, z)
    let r = base[i * 3], gr = base[i * 3 + 1], b = base[i * 3 + 2]
    if (fire > 0.004 || frost > 0.004 || char > 0.004) {
      changed++
      const dark = 1 - 0.62 * char
      r *= dark; gr *= dark; b *= dark
      if (frost > 0) {
        // each blob takes the frost a little differently: a grain, like rime
        const k = Math.min(1, frost * (0.55 + 0.45 * hash(i, 8))) * 0.8
        const l = live ? 1 : Math.max(0.3, Math.min(1.15, Math.max(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]) / 0.42))
        r += (ICE[0] * l - r) * k; gr += (ICE[1] * l - gr) * k; b += (ICE[2] * l - b) * k
      }
      if (fire > 0) {
        const k = Math.min(1, fire * (0.6 + 0.4 * hash(i, 9))) * 0.88
        r += (EMBER[0] - r) * k; gr += (EMBER[1] - gr) * k; b += (EMBER[2] - b) * k
      }
    }
    c[i * 3] = r; c[i * 3 + 1] = gr; c[i * 3 + 2] = b
  }
  return changed
}
