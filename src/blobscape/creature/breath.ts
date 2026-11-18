import { Blobs, quatFacing, type Vec3 } from '../../splat-core/blobs.ts'
import { buildBody, mix, rng, type Part } from '../../splat-engine/body.ts'
import { Skeleton, axisAngle, emptySkin, rotate, setWeights, type Bone, type Skin } from '../../splat-engine/rig.ts'
import type { PointLight } from '../../splat-engine/engine.ts'
import { FLAME, breathAt, type BreathKind } from '../../splat-engine/zoo/dragon.ts'
import { Ground, Patches } from '../dungeon/ground.ts'
import { Glow, gather, type Want } from '../dungeon/glow.ts'

/**
 * What a dragon's breath does to the world round it (Splat Creatures and the engine page). The dragon's own pose
 * is its move; this is everything that follows from it, each frame, from where the posed flame is:
 *
 * - the breath gives light: a glow in the throat as it gathers, two lights that ride the flame, and a few for
 *   whatever burns on the ground, eased so none of them pops (`Glow`);
 * - the ground catches: a real floor of blobs under the dragon, and the same grid of cells Dungeon Run's floor
 *   uses (`Ground`), lit wherever the flame comes down, spreading a little, burning out and leaving a scorch that
 *   fades. Frost lies as rime and grows ice; venom burns green and leaves a stain;
 * - sparks fly off the end of the flame, and smoke hangs at the mouth once it has shut and rises off the ground.
 *
 * Pure, and tested: it knows nothing of the stage. A page hands `step` the posed skeleton and takes back the lights
 * to set and whether the floor wants sending up again.
 */

/** An actor as the stage takes it, with the bytes that say which blobs give their own light. */
export interface Lit { blobs: Blobs; skin: Skin; skeleton: Skeleton; glow: Uint8Array }

/** The floor: a disc of flagstones this far across, its middle this far in front of the dragon's. */
export const FLOOR = { r: 7, z: 0.6 }
/** Half the width of the grid of cells that can burn, and a cell's size, in meters. */
const HALF = 8, CELL = 0.25
/** Tongues of flame (or clumps of ice) that stand on the ground, sparks in the air, and puffs of smoke. */
export const TONGUES = 10, SPARKS = 28, PUFFS = 22
const TONGUE_GAP = 0.55
/** Seconds a puff of smoke lasts. */
const PUFF_LIFE = 1.7
/**
 * The light the dragon stands in, linear: a dusk, cool and a third under full, so that what the breath lights shows.
 * At full light there is no room over a thing's own color for a flame to add to.
 */
export const DUSK: Vec3 = [0.6, 0.65, 0.76]

/** How each breath looks once it has left the mouth. */
interface Style {
  /** What it does to the ground's cells. */
  element: 'fire' | 'frost'
  /** Its light, linear. */
  light: Vec3
  /** The floor where it is at work, and what it leaves behind (a share of the stone's own color, and a tint). */
  hot: Vec3
  scar: { dark: number; tint: Vec3 }
  /** A tongue on the ground, root to tip, and how tall. */
  tongue: [Vec3, Vec3]
  spark: Vec3
  /** How a spark moves once it is off: how fast it climbs (under 0, falls), and how long it lasts. */
  lift: number
  life: number
  smoke: Vec3
  smokeOpacity: number
}

const STYLES: Record<BreathKind, Style> = {
  fire: { element: 'fire', light: [1, 0.5, 0.16], hot: [1, 0.5, 0.12], scar: { dark: 0.62, tint: [0.05, 0.04, 0.04] }, tongue: [[1, 0.92, 0.55], [1, 0.36, 0.07]], spark: [1, 0.72, 0.3], lift: 1.5, life: 1.1, smoke: [0.44, 0.42, 0.42], smokeOpacity: 0.15 },
  frost: { element: 'frost', light: [0.45, 0.75, 1], hot: [0.78, 0.9, 1], scar: { dark: 0, tint: [0, 0, 0] }, tongue: [[0.42, 0.66, 0.95], [0.93, 0.98, 1]], spark: [0.9, 0.97, 1], lift: -0.7, life: 1.5, smoke: [0.9, 0.95, 1], smokeOpacity: 0.07 },
  venom: { element: 'fire', light: [0.4, 1, 0.22], hot: [0.55, 0.98, 0.2], scar: { dark: 0.55, tint: [0.05, 0.12, 0.03] }, tongue: [[0.9, 1, 0.6], [0.2, 0.75, 0.1]], spark: [0.7, 1, 0.35], lift: -2.2, life: 0.9, smoke: [0.36, 0.5, 0.24], smokeOpacity: 0.1 },
}

/** A steady number from 0 to 1 for thing i. */
const hash = (i: number, k: number) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v) }
const smooth = (t: number, a: number, b: number) => { const u = Math.min(1, Math.max(0, (t - a) / (b - a))); return u * u * (3 - 2 * u) }

/**
 * The floor: flat blobs in rows, close enough to hide what lies under them, laid as flagstones a meter across (so
 * it still shows how big the creature is, as the grid lines did) and thinning away at the rim. `spacing` is how far
 * apart the blobs are. `base` keeps each blob's own color, for painting over.
 */
export function makeFloor(spacing = 0.085): { actor: Lit; base: Float32Array } {
  const blobs = new Blobs(Math.ceil((Math.PI * FLOOR.r * FLOOR.r) / (spacing * spacing * 0.866)) + 64)
  const up = quatFacing([0, 1, 0])
  const rowStep = spacing * 0.866
  let row = 0
  for (let z = -FLOOR.r; z <= FLOOR.r; z += rowStep, row++) {
    for (let x = -FLOOR.r + (row % 2) * spacing * 0.5; x <= FLOOR.r; x += spacing) {
      const i = blobs.count
      const px = x + (hash(i, 1) - 0.5) * spacing * 0.3, pz = z + (hash(i, 2) - 0.5) * spacing * 0.3
      const d = Math.hypot(px, pz)
      // a ragged rim: the stone thins out over the last meter and a half
      const solid = 1 - smooth(d + (hash(i, 3) - 0.5) * 0.5, FLOOR.r - 1.6, FLOOR.r - 0.1)
      if (solid < 0.04) continue
      // slabs in rows, every other row shifted by half a slab
      const wz = pz + FLOOR.z + 40
      const r = Math.floor(wz), sx = px + 40 + (r % 2) * 0.5, c = Math.floor(sx)
      const edge = Math.min(sx - c, 1 - (sx - c), wz - r, 1 - (wz - r))
      const slab = hash(r * 131 + c * 17, 4)
      let col = mix([0.37, 0.37, 0.39], [0.27, 0.27, 0.3], slab)
      col = mix(col, [0.2, 0.2, 0.22], 0.35 * hash(i, 5) * hash(Math.floor(px * 3) * 7 + Math.floor(pz * 3), 6))
      if (edge < 0.03) col = mix(col, [0.11, 0.11, 0.12], 0.8)
      blobs.push({ center: [px, edge < 0.03 ? -0.004 : 0, pz + FLOOR.z], scale: [spacing * 0.78, spacing * 0.78, 0.012], quat: up, color: col, opacity: solid })
    }
  }
  const skin = emptySkin(blobs.count)
  for (let i = 0; i < blobs.count; i++) setWeights(skin, i, [[0, 1]])
  return { actor: { blobs, skin, skeleton: new Skeleton([{ name: 'floor', parent: -1, head: [0, 0, 0] }]), glow: new Uint8Array(blobs.count) }, base: blobs.color.slice(0, blobs.count * 3) }
}

/**
 * Colors the floor from the ground's cells: bright where the breath is at work on it, darkened and tinted where it
 * has been. Each blob takes it a little differently: a grain, like embers or rime.
 */
export function paintFloor(floor: Lit, base: Float32Array, g: Ground, kind: BreathKind) {
  const st = STYLES[kind], c = floor.blobs.color, at = floor.blobs.center
  const level = st.element === 'fire' ? g.fire : g.frost
  for (let i = 0; i < floor.blobs.count; i++) {
    const x = at[i * 3], z = at[i * 3 + 2]
    let r = base[i * 3], gr = base[i * 3 + 1], b = base[i * 3 + 2]
    const on = g.sample(level, x, z), char = g.sample(g.char, x, z)
    if (char > 0.004) {
      const k = Math.min(1, char) * st.scar.dark
      r += (st.scar.tint[0] - r) * k; gr += (st.scar.tint[1] - gr) * k; b += (st.scar.tint[2] - b) * k
    }
    if (on > 0.004) {
      const k = Math.min(1, on * (0.55 + 0.45 * hash(i, 8))) * (st.element === 'frost' ? 0.55 + 0.3 * hash(i, 9) : 0.86)
      r += (st.hot[0] - r) * k; gr += (st.hot[1] - gr) * k; b += (st.hot[2] - b) * k
    }
    c[i * 3] = r; c[i * 3 + 1] = gr; c[i * 3 + 2] = b
  }
}

/**
 * Everything in the air, on one skeleton: `TONGUES` flames (or clumps of ice) to stand on the ground, `SPARKS`
 * sparks and `PUFFS` puffs of smoke, each on a bone of its own that stays at size 0 until it is wanted.
 */
export function makeAir(kind: BreathKind, count = 5200): Lit {
  const st = STYLES[kind]
  const bones: Bone[] = [{ name: 'root', parent: -1, head: [0, 0, 0] }]
  const parts: Part[] = []
  const rand = rng(57)
  for (let i = 0; i < TONGUES; i++) {
    const bone = `tongue${i}`
    bones.push({ name: bone, parent: 0, head: [0, 0, 0] })
    if (kind === 'frost') {
      // one tall block of ice and two short ones hard against it
      for (let j = 0; j < 3; j++) {
        const a = (j / 3 + rand() * 0.25) * Math.PI * 2, lean = j ? 0.05 + rand() * 0.05 : 0.02, h = j ? 0.17 + rand() * 0.1 : 0.4 + rand() * 0.12
        const d = j ? 0.09 + rand() * 0.03 : 0
        const foot: Vec3 = [Math.cos(a) * d, 0, Math.sin(a) * d]
        parts.push({ shape: { fill: [foot, [foot[0] + Math.cos(a) * lean, h, foot[2] + Math.sin(a) * lean]], r: [j ? 0.075 : 0.1, 0.012] }, color: (_p, _n, u) => mix(st.tongue[0], st.tongue[1], u), glow: true, opacity: 0.93, bones: [bone], density: 3, size: 0.75 })
      }
    } else {
      const tongues: [number, number, number, number][] = [[0, 0, 0.62, 0.15]]
      for (let j = 0; j < 2; j++) { const a = rand() * Math.PI * 2, d = 0.13 + rand() * 0.06; tongues.push([Math.cos(a) * d, Math.sin(a) * d, 0.3 + rand() * 0.14, 0.1]) }
      for (const [x, z, h, r] of tongues) {
        parts.push({ shape: { fill: [[x, 0, z], [x * 0.7, h, z * 0.7]], r: [r, 0.01] }, color: (_p, _n, u) => mix(st.tongue[0], st.tongue[1], u), glow: true, opacity: (_p, u) => 0.85 * (1 - u * 0.6), bones: [bone], density: 4, size: 0.8 })
      }
    }
  }
  for (let i = 0; i < SPARKS; i++) {
    bones.push({ name: `spark${i}`, parent: 0, head: [0, 0, 0] })
    parts.push({ shape: { ball: [0, 0, 0], r: [0.03, 0.03, 0.03] }, color: st.spark, glow: true, opacity: 0.95, bones: [`spark${i}`], density: 30, size: 0.45 })
  }
  for (let i = 0; i < PUFFS; i++) {
    const bone = `puff${i}`
    bones.push({ name: bone, parent: 0, head: [0, 0, 0] })
    // a wisp: a few soft balls, no two puffs alike, thin enough that several overlapping read as smoke
    for (let j = 0; j < 5; j++) {
      const at: Vec3 = [(rand() - 0.5) * 0.42, (rand() - 0.5) * 0.36, (rand() - 0.5) * 0.42], r = 0.09 + rand() * 0.08
      parts.push({ shape: { ball: at, r: [r, r * 0.8, r] }, color: st.smoke, opacity: st.smokeOpacity, bones: [bone], density: 0.7, size: 2 })
    }
  }
  const b = buildBody({ bones, parts, blend: 0.02 }, count, 31)
  const glow = new Uint8Array(b.blobs.count)
  for (let i = 0; i < b.blobs.count; i++) if (parts[b.partOf[i]].glow) glow[i] = 255
  for (let k = 1; k < bones.length; k++) b.skeleton.size[k] = 0
  b.skeleton.update()
  return { blobs: b.blobs, skin: b.skin, skeleton: b.skeleton, glow }
}

interface Spark { born: number; life: number; from: Vec3; go: Vec3; size: number }
interface Puff { born: number; from: Vec3; drift: Vec3; size: number }

/** What `step` hands back: the lights to set this frame, and whether the floor's colors changed. */
export interface BreathFrame { lights: PointLight[]; repaint: boolean }

/** How the show is built. */
export interface BreathOptions {
  /** How far apart the floor's blobs are: wider on a phone. */
  spacing?: number
  /** Whether the flame's light casts shadows (the engine's live shadows: WebGPU). */
  shadows?: boolean
}

/**
 * One dragon's breath and what it does: the floor and the air as actors to draw with the dragon (`extras`), and
 * `step`, called after each pose.
 */
export class BreathShow {
  readonly kind: BreathKind
  readonly floor: Lit
  readonly air: Lit
  readonly ground = new Ground(HALF, [], CELL, 5)
  private readonly base: Float32Array
  private readonly patches = new Patches(TONGUES, TONGUE_GAP)
  private readonly glow = new Glow()
  private readonly sparks: Spark[] = []
  private readonly puffs: Puff[] = []
  private readonly rand = rng(911)
  private readonly shadows: boolean
  private painted = -1
  private clock = 0
  private sparkDue = 0
  private puffDue = 0
  private nextSpark = 0
  private nextPuff = 0

  constructor(kind: BreathKind, opts: BreathOptions = {}) {
    this.kind = kind
    this.shadows = !!opts.shadows
    const f = makeFloor(opts.spacing)
    this.floor = f.actor
    this.base = f.base
    this.air = makeAir(kind)
    for (let i = 0; i < SPARKS; i++) this.sparks.push({ born: -99, life: 1, from: [0, 0, 0], go: [0, 0, 0], size: 1 })
    for (let i = 0; i < PUFFS; i++) this.puffs.push({ born: -99, from: [0, 0, 0], drift: [0, 0, 0], size: 1 })
  }

  /** The actors to draw with the dragon. */
  get extras(): Lit[] { return [this.floor, this.air] }

  /** How many cells of the ground the breath is at work on now. */
  get burning() { return this.ground.count(STYLES[this.kind].element) }

  /**
   * Moves everything on by `dt` seconds for the dragon as it is posed. `breath` is how many seconds into the breath
   * its move is, or null while it does something else (what burns goes on burning). Poses the air's skeleton, paints
   * the floor when its cells changed, and gives the lights.
   */
  step(dragon: Skeleton, breath: number | null, dt: number): BreathFrame {
    const st = STYLES[this.kind], g = this.ground
    dt = Math.min(0.1, Math.max(0, dt))
    const t = this.clock += dt
    const at = breath === null ? { inhale: 0, charge: 0, flame: 0, after: 0, away: 0 } : breathAt(breath)
    const bone = (name: string) => { const b = dragon.index(name); return { p: [dragon.posedHead[b * 3], dragon.posedHead[b * 3 + 1], dragon.posedHead[b * 3 + 2]] as Vec3, s: dragon.scale[b] } }
    const links = [1, 2, 3, 4, 5, 6].map((k) => bone(`fire${k}`))
    // how much of the flame is out: its first bone's size, 1 at rest and FLAME at life size
    const out = Math.min(1, Math.max(0, (links[0].s - 1) / (FLAME - 1)))
    const lit = out > 0.3

    // --- the ground: wherever a link of the flame comes down to its own girth above the floor, the cells under it catch
    if (lit && dt > 0) {
      for (let k = 1; k < links.length; k++) {
        const l = links[k], girth = (0.06 + 0.69 * (k / 6)) * (l.s / FLAME)
        if (l.p[1] - girth < 0.15 && l.s > FLAME * 0.5) g.light(l.p[0], l.p[2], st.element)
      }
    }
    g.step(dt)
    const level = st.element === 'fire' ? g.fire : g.frost
    this.patches.update(g, level)
    const repaint = g.version !== this.painted
    if (repaint) { paintFloor(this.floor, this.base, g, this.kind); this.painted = g.version }

    // --- the air
    const sk = this.air.skeleton
    const cells = this.patches.cells
    for (let i = 0; i < TONGUES; i++) {
      const b = 1 + i, cell = cells[i]
      if (cell < 0) { sk.size[b] = 0; continue }
      const [x, z] = g.center(cell)
      sk.offset.set([x + (hash(cell, 1) - 0.5) * 0.14, 0, z + (hash(cell, 2) - 0.5) * 0.14], b * 3)
      if (st.element === 'frost') {
        // ice grows and stays; it doesn't flicker
        sk.size[b] = (0.35 + 0.65 * level[cell]) * (0.8 + 0.5 * hash(cell, 3))
        sk.setRotation(b, axisAngle([0, 1, 0], hash(cell, 4) * 6.28))
      } else {
        const flick = 0.82 + 0.12 * Math.sin(t * 13 + i * 2.1) + 0.08 * Math.sin(t * 23 + i * 4.3)
        sk.size[b] = (0.3 + 0.7 * level[cell]) * flick * (0.85 + 0.3 * hash(cell, 3))
        sk.setRotation(b, axisAngle([1, 0, 0], 0.1 * Math.sin(t * 5.1 + i * 1.7) + 0.06 * Math.sin(t * 11 + i * 3)))
      }
    }
    // sparks leave the last third of the flame while it is out, thrown on the way it was going
    const end = links[5].p, before = links[3].p
    const way: Vec3 = [end[0] - before[0], end[1] - before[1], end[2] - before[2]]
    const wl = Math.hypot(...way) || 1
    // and more of them as the last of it runs out and breaks up
    const leaving = at.away > 0 && out > 0.03
    this.sparkDue += dt * (leaving ? 26 : out > 0.6 ? 16 : 0)
    while (this.sparkDue >= 1) {
      this.sparkDue -= 1
      const s = this.sparks[this.nextSpark++ % SPARKS], r = this.rand
      const l = links[(leaving ? 1 : 3) + Math.floor(r() * (leaving ? 5 : 3))], spread = Math.max(0.12, 0.45 * (l.s / FLAME))
      s.born = t
      s.life = st.life * (0.6 + 0.8 * r())
      s.from = [l.p[0] + (r() - 0.5) * spread, Math.max(0.05, l.p[1] + (r() - 0.3) * spread), l.p[2] + (r() - 0.5) * spread]
      s.go = [(way[0] / wl) * 1.6 + (r() - 0.5) * 1.6, 0.5 + r() * 0.9, (way[2] / wl) * 1.6 + (r() - 0.5) * 1.6]
      s.size = 0.6 + 0.9 * r()
    }
    for (let i = 0; i < SPARKS; i++) {
      const b = 1 + TONGUES + i, s = this.sparks[i], age = (t - s.born) / s.life
      if (age < 0 || age >= 1) { sk.size[b] = 0; continue }
      const a = age * s.life, slow = 1 - Math.exp(-a * 2.2)
      const y = s.from[1] + s.go[1] * slow * 0.45 + st.lift * a * a * 0.5
      sk.offset.set([s.from[0] + s.go[0] * slow * 0.45 + 0.05 * Math.sin(a * 9 + i), Math.max(0.03, y), s.from[2] + s.go[2] * slow * 0.45 + 0.05 * Math.cos(a * 7 + i * 2)], b * 3)
      sk.size[b] = s.size * Math.sqrt(Math.max(0, 1 - age)) * Math.min(1, age * 12)
    }
    // smoke: at the mouth once it has shut on the last of the flame, and now and then off whatever is burning
    // (the mouth is where the flame's first bone waits, whether or not the flame is there now)
    const f1 = dragon.index('fire1'), hd = dragon.bones[f1].parent, hp = bone(dragon.bones[hd].name)
    const rest = dragon.bones[f1].head, hr = dragon.bones[hd].head
    const jut = rotate(dragon.quat.subarray(hd * 4, hd * 4 + 4), [rest[0] - hr[0], rest[1] - hr[1], rest[2] - hr[2]])
    const mouth: Vec3 = [hp.p[0] + jut[0] * hp.s, hp.p[1] + jut[1] * hp.s, hp.p[2] + jut[2] * hp.s]
    this.puffDue += dt
    if (this.puffDue > 0.09) {
      const burning = [...cells].filter((c) => c >= 0)
      const r = this.rand
      if (leaving) {
        // the last of the breath comes apart where it is: a puff off some part of what is left of it
        const l = links[Math.floor(r() * links.length)], wide = Math.max(0.1, 0.5 * (l.s / FLAME))
        this.puff([l.p[0] + (r() - 0.5) * wide, Math.max(0.15, l.p[1] + (r() - 0.2) * wide), l.p[2] + (r() - 0.5) * wide], [(way[0] / wl) * 0.5 + (r() - 0.5) * 0.3, st.element === 'frost' ? 0.15 : 0.5 + 0.4 * r(), (way[2] / wl) * 0.5 + (r() - 0.5) * 0.3], 0.6 + 0.6 * r())
      } else if (at.after > 0.25 && !lit) this.puff([mouth[0] + (r() - 0.5) * 0.1, mouth[1] + 0.05, mouth[2]], [(r() - 0.5) * 0.25, 0.6 + 0.3 * r(), 0.2 + 0.2 * r()], 0.5 + 0.35 * at.after)
      else if (burning.length && r() < (st.element === 'frost' ? 0.1 : 0.45)) {
        const [x, z] = g.center(burning[Math.floor(r() * burning.length)])
        this.puff([x, st.element === 'frost' ? 0.12 : 0.5, z], [(r() - 0.5) * 0.3, st.element === 'frost' ? 0.12 : 0.8 + 0.4 * r(), (r() - 0.5) * 0.3], 0.7 + 0.5 * r())
      }
      this.puffDue = 0
    }
    for (let i = 0; i < PUFFS; i++) {
      const b = 1 + TONGUES + SPARKS + i, p = this.puffs[i], age = (t - p.born) / PUFF_LIFE
      if (age < 0 || age >= 1) { sk.size[b] = 0; continue }
      const a = age * PUFF_LIFE
      sk.offset.set([p.from[0] + p.drift[0] * a, p.from[1] + p.drift[1] * a, p.from[2] + p.drift[2] * a], b * 3)
      sk.size[b] = p.size * (0.5 + 1.4 * age) * Math.sqrt(Math.max(0, 1 - age)) * Math.min(1, age * 8)
      sk.setRotation(b, axisAngle([0, 1, 0], i * 1.3 + a * 0.5))
    }
    sk.update()

    // --- light
    const wants: Want[] = []
    const shine = (k: number): Vec3 => [st.light[0] * k, st.light[1] * k, st.light[2] * k]
    const heat = Math.max(at.charge, 0.45 * out)
    if (heat > 0.02) {
      // the breath gathering: a glow in the throat, and deeper in the chest, that shows through the hide
      const throat = bone('neck2').p, chest = bone('neck1').p
      wants.push({ kind: 'throat', follow: true, position: throat, color: shine(3.4 * heat), range: 0.6 })
      wants.push({ kind: 'chest', follow: true, position: [chest[0], chest[1] - 0.1, chest[2] - 0.15], color: shine(2 * at.charge + 0.4 * out), range: 0.65 })
    }
    if (out > 0.02) {
      const flick = 0.86 + 0.09 * Math.sin(t * 17) + 0.05 * Math.sin(t * 31 + 1)
      const a = links[1].p, b = links[4].p
      // one by the mouth for the jaw, the neck and the chest; one down the flame for the wings, the legs and the ground
      wants.push({ kind: 'mouth', follow: true, position: [a[0], a[1] + 0.2, a[2]], color: shine(2.2 * out * flick), range: 2.8 })
      wants.push({ kind: 'flame', follow: true, position: [b[0], b[1] + 0.6, b[2]], color: shine(3.4 * out * flick), range: 5, shadow: this.shadows })
    }
    const low: Want[] = []
    for (let i = 0; i < TONGUES; i++) {
      const cell = cells[i]
      if (cell < 0) continue
      const [x, z] = g.center(cell)
      low.push({ kind: 'ground', position: [x, 0.6, z], color: shine((st.element === 'frost' ? 0.25 : 0.9) * level[cell]), range: 1.9 })
    }
    wants.push(...gather(low, 3, 1.4))
    return { lights: this.glow.update(wants, dt, 8), repaint }
  }

  private puff(from: Vec3, drift: Vec3, size: number) {
    const p = this.puffs[this.nextPuff++ % PUFFS]
    p.born = this.clock
    p.from = from
    p.drift = drift
    p.size = size
  }
}
