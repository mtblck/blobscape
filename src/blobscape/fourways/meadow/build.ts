import { Blobs, type Quat, type Vec3 } from '../../../splat-core/blobs.ts'
import { srgbToLinear } from '../../../splat-core/color.ts'
import type { Built } from '../../../splat-engine/body.ts'
import type { PointLight } from '../../../splat-engine/engine.ts'
import { Skeleton, axisAngle, mulQ, type Bone } from '../../../splat-engine/rig.ts'
import { compileScene } from '../../../splat-engine/sceneDoc.ts'
import { buildVoxels } from '../../../splat-engine/voxel.ts'
import { makeFox, trot } from '../../../splat-engine/zoo/fox.ts'
import { MEADOW } from './doc.ts'

/**
 * The fox's meadow for Blobscape (and, as blobs handed over, for Spark): the description's turf, stone and sky, the
 * Creature page's furred fox trotting a ring round the stone with a wisp circling it, and tall grass, all one actor on one
 * skeleton. The wisp is a live light that casts shadows, so the stone's shadow sweeps the grass and the fox's falls
 * behind it. Everything is a function of the time, and repeats every `LOOP` seconds.
 */
export const SCENE = compileScene(MEADOW, { puffs: false })
export const LOOP = MEADOW.loop ?? 12
/** How many parts the description has: the fox is the part after them, and the grass the one after that. */
export const SCENE_PARTS = MEADOW.parts.length
const TAU = Math.PI * 2

/** The ring the fox trots, how big it is beside the Creature page's fox, and its strides a lap (a whole number, so the loop joins). */
export const RING = 1.05
export const FOX_SIZE = 0.5
export const STRIDES = 16
/** The wisp's path round the fox: how far it swings ahead and to the side, how high, and how many times a loop it goes round. */
export const WISP = { ahead: 1.1, aside: 0.5, height: 0.55, times: 5 }
export const WISP_LIGHT = { color: '#ffd9a0', strength: 3.4, range: 1.25 }
/** How much of its painted color everything keeps with no wisp near: the night. */
export const AMBIENT = 0.7
/** How far the grass tips swing, how many times a loop, and how many bones share the swinging out. */
const SWAY = 0.035, SWAY_TIMES = 4, SWAY_BONES = 8

/** Where the fox is `t` seconds in, and the turn about the upright that faces it along the ring. */
export function foxAt(t: number): { at: Vec3; turn: number } {
  const a = (TAU * t) / LOOP
  return { at: [RING * Math.sin(a), 0, RING * Math.cos(a)], turn: a + Math.PI / 2 }
}

/** Where the wisp is `t` seconds in: circling the fox as it goes, bobbing. `behind` trails it along the same path, for a mote. */
export function wispAt(t: number, behind = 0): Vec3 {
  const u = t / LOOP, { at, turn } = foxAt(t), b = TAU * WISP.times * u - behind
  const x = WISP.aside * Math.sin(b), z = WISP.ahead * Math.cos(b)
  return [at[0] + x * Math.cos(turn) + z * Math.sin(turn), WISP.height + 0.07 * Math.sin(TAU * 7 * u - behind * 3) - behind * 0.12, at[2] + z * Math.cos(turn) - x * Math.sin(turn)]
}

/** The wisp's light `t` seconds in, `gain` times as bright as written; `shadows` has it cast them. */
export function lightsAt(t: number, gain: number, shadows = true): PointLight[] {
  const [r, g, b] = [1, 3, 5].map((k) => srgbToLinear(parseInt(WISP_LIGHT.color.slice(k, k + 2), 16) / 255) * WISP_LIGHT.strength * gain)
  return [{ position: wispAt(t), color: [r, g, b], range: WISP_LIGHT.range, shadow: shadows }]
}

const hex = (h: string): Vec3 => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]
const GRASS = ['#10241c', '#1b3a2a', '#2c5a38', '#79a85a'].map(hex)
const mixed = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]

/** The moon's light on the grass, as the description has it for the turf and stone, and the parts that stand in its way: the stone and the rocks. */
const MOON = { ambient: MEADOW.light?.ambient ?? 0.5, casts: [1, 2, 3, 4, 5] }
const MOON_WAY: Vec3 = (() => { const [x, y, z] = MEADOW.light?.from ?? [-0.4, 0.8, 0.45], l = Math.hypot(x, y, z); return [x / l, y / l, z / l] })()
const DRY = hex('#6e7a3a'), HEAD = hex('#b5d67a')

/** Smooth noise over the ground, 0 to 1: the same wherever it is asked. */
function patch(x: number, z: number) {
  const at = (i: number, j: number) => { const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h) }
  const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v)
  return (at(i, j) * (1 - a) + at(i + 1, j) * a) * (1 - b) + (at(i, j + 1) * (1 - a) + at(i + 1, j + 1) * a) * b
}
/** How much taller or shorter than usual the grass stands at a spot: tussocks and hollows. */
const tussock = (x: number, z: number) => 0.6 + 0.8 * patch(x * 3.1, z * 3.1)
/** About how high the grass round a spot reaches: what a blade there is deep in. */
const canopy = (x: number, z: number) => Math.max(0.03, 0.17 * grassHeight(x, z) * tussock(x, z))

/** A small seeded generator: the same grass every time. */
function seeded(seed: number) {
  let s = seed >>> 0
  return () => { s = (s + 0x6d2b79f5) >>> 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296 }
}

/** How tall the grass grows at a spot, as a share of full height: none in the stone, short where the fox has worn its ring. */
export function grassHeight(x: number, z: number) {
  const r = Math.hypot(x, z)
  if (r < 0.26 || r > 1.7) return 0
  const worn = Math.abs(r - RING) / 0.2
  return (worn < 1 ? 0.22 + 0.78 * worn * worn * worn : 1) * (r > 1.5 ? (1.7 - r) / 0.2 * 0.5 + 0.5 : 1)
}

/** Which sway bone a blade at a spot follows: bands across the meadow, so the wind crosses it as a wave. */
const swayBone = (x: number, z: number) => Math.floor((((x * 0.9 + z * 0.5) % 1) + 1) % 1 * SWAY_BONES)

/** What `buildMeadow` gives: the actor, and the fox's own skeleton, which its trot is posed on before being copied over. */
export interface Meadow extends Built {
  /** The fox's own bones: `poseMeadow` trots these and copies the pose to the actor's. */
  fox: Skeleton
  /** Where the fox's bones start in the actor's skeleton (the carrier is the one before), and where the sway bones do. */
  foxFrom: number
  swayFrom: number
  /** How many blobs are fox, and how many grass. */
  counts: { scene: number; fox: number; grass: number }
}

/** Cuts the turf, stone and sky at `spacing`, builds the fox with `foxBlobs` blobs and `blades` blades of grass, and joins them on one skeleton. */
export function buildMeadow(spacing: number, foxBlobs: number, blades: number): Meadow {
  const scene = buildVoxels(SCENE.spec(spacing))
  // whiskers thick enough to be a pixel wide on a fox this small
  const fox = makeFox(foxBlobs, 'red', 0.011)
  const sceneBones = scene.skeleton.bones.length
  const carrier = sceneBones, foxFrom = sceneBones + 1, swayFrom = foxFrom + fox.skeleton.count
  const bones: Bone[] = [
    ...scene.skeleton.bones,
    { name: 'fox', parent: -1, head: [0, 0, 0] },
    ...fox.skeleton.bones.map((b) => ({ ...b, name: `fox/${b.name}`, parent: b.parent < 0 ? carrier : b.parent + foxFrom })),
    ...Array.from({ length: SWAY_BONES }, (_, k): Bone => ({ name: `sway${k}`, parent: -1, head: [0, 0, 0] })),
  ]
  // the bone the turf is on stays put: the grass roots there
  const still = scene.skin.joints[scene.partOf.indexOf(0) * 4]

  const total = scene.blobs.count + fox.blobs.count + blades * 3
  const blobs = new Blobs(total)
  const joints = new Uint8Array(total * 4), weights = new Float32Array(total * 4)
  const partOf = new Uint16Array(total), glow = new Uint8Array(total)
  const parts = MEADOW.parts.length
  for (let i = 0; i < scene.blobs.count; i++) blobs.push(scene.blobs.get(i))
  joints.set(scene.skin.joints.subarray(0, scene.blobs.count * 4))
  weights.set(scene.skin.weights.subarray(0, scene.blobs.count * 4))
  partOf.set(scene.partOf.subarray(0, scene.blobs.count))
  if (scene.glow) glow.set(scene.glow.subarray(0, scene.blobs.count))

  // the fox, a shade darker than by day: the wisp is what lights it
  for (let i = 0; i < fox.blobs.count; i++) {
    const b = fox.blobs.get(i)
    const at = blobs.push({ ...b, color: [b.color[0] * 0.85, b.color[1] * 0.85, b.color[2] * 0.88] })
    for (let k = 0; k < 4; k++) { joints[at * 4 + k] = fox.skin.joints[i * 4 + k] + foxFrom; weights[at * 4 + k] = fox.skin.weights[i * 4 + k] }
    partOf[at] = parts
  }

  // the grass: three blobs a blade, the foot on the turf, the tip on a sway bone and the middle shared between them.
  // Each blob is painted with the moon's light as the turf and stone are: less of the sky's light the deeper it sits
  // among its neighbors, the moon's by how it faces it, and none of that where the stone or a rock stands in the way.
  const rnd = seeded(7)
  const spec = SCENE.spec(spacing)
  const solid = MOON.casts.map((k) => spec.parts[k].shape)
  const blocked = (x: number, y: number, z: number) => {
    let seen = 1
    for (let t = 0.03; t < 1.4 && seen > 0.02; ) {
      let d = Infinity
      for (const s of solid) d = Math.min(d, s.sdf(x + MOON_WAY[0] * t, y + MOON_WAY[1] * t, z + MOON_WAY[2] * t))
      seen = Math.min(seen, (10 * d) / t)
      t += Math.max(0.02, d)
    }
    return Math.max(0, seen)
  }
  for (let n = 0; n < blades;) {
    const x = (rnd() * 2 - 1) * 1.7, z = (rnd() * 2 - 1) * 1.7
    const grown = grassHeight(x, z)
    if (grown <= 0 || rnd() > grown + 0.25) continue
    n++
    // the canopy here: tussocks and hollows, so the meadow is not one even lawn
    const top = canopy(x, z)
    const seedHead = rnd() < 0.08
    const height = (0.09 + 0.13 * rnd() * rnd() + (seedHead ? 0.14 : 0)) * grown * tussock(x, z), width = 0.014 + 0.009 * rnd()
    const yaw = rnd() * TAU, lean = 0.1 + 0.3 * rnd(), shade = rnd(), dry = patch(x * 2.3 + 9, z * 2.3 - 4)
    const turn = axisAngle([0, 1, 0], yaw)
    const sway = swayFrom + swayBone(x, z)
    for (let k = 0; k < 3; k++) {
      // the blade bends over more toward its tip
      const tilt = lean * (0.4 + 0.6 * k), up = (k + 0.5) / 3
      const out = Math.sin(tilt) * height * up * 0.8
      const quat = mulQ(turn, axisAngle([1, 0, 0], tilt)) as Quat
      let tone = mixed(mixed(GRASS[0], GRASS[1], shade), mixed(GRASS[2], GRASS[3], shade * shade * 0.75), up)
      // drier patches, and pale heads on the tallest blades
      tone = mixed(tone, DRY, dry * 0.55 * up)
      if (seedHead && k === 2) tone = mixed(tone, HEAD, 0.7)
      const center: Vec3 = [x + Math.sin(yaw) * out, height * up * Math.cos(tilt * 0.5), z + Math.cos(yaw) * out]
      // the flat of the blade: its thin axis, turned as the blade is
      const flat: Vec3 = [Math.sin(yaw) * Math.cos(tilt), -Math.sin(tilt), Math.cos(yaw) * Math.cos(tilt)]
      const deep = Math.min(1, center[1] / top)
      const sky = MOON.ambient * (0.3 + 0.7 * deep)
      // a blade is thin enough that the moon behind it still lights it
      const facing = 0.35 + 0.65 * Math.abs(flat[0] * MOON_WAY[0] + flat[1] * MOON_WAY[1] + flat[2] * MOON_WAY[2])
      const lit = (sky + (1 - MOON.ambient) * facing * Math.min(1, 0.25 + deep) * blocked(center[0], center[1] + 0.01, center[2])) * 0.82
      const at = blobs.push({
        center, scale: [width * (1 - 0.28 * k), height / 5.2, 0.004], quat, color: [tone[0] * lit, tone[1] * lit, tone[2] * lit], opacity: 1,
      })
      const w = k / 2
      joints[at * 4] = still; weights[at * 4] = 1 - w
      joints[at * 4 + 1] = sway; weights[at * 4 + 1] = w
      partOf[at] = parts + 1
    }
  }
  return {
    blobs, skin: { joints, weights }, skeleton: new Skeleton(bones), partOf, glow, fox: fox.skeleton, foxFrom, swayFrom,
    counts: { scene: scene.blobs.count, fox: fox.blobs.count, grass: blades * 3 },
  }
}

/** How many blobs the fox and how many blades the grass get on a grid of `spacing`: more as the scene is cut finer. */
export function sharesAt(spacing: number) {
  const k = 0.03 / spacing
  return { fox: Math.round(Math.min(50000, 30000 * k)), blades: Math.round(Math.min(12000, 8000 * k)) }
}

const foxes = new WeakMap<Skeleton, Pick<Meadow, 'fox' | 'foxFrom' | 'swayFrom'>>()
/**
 * Poses a meadow given only its skeleton, as Pixel Diorama does: the fox's own bones are read back out of it once
 * (the ones named `fox/…`) and kept.
 */
export function poseMeadowBones(sk: Skeleton, t: number) {
  let m = foxes.get(sk)
  if (!m) {
    const foxFrom = sk.index('fox') + 1, own = sk.bones.filter((b) => b.name.startsWith('fox/'))
    m = { fox: new Skeleton(own.map((b) => ({ ...b, name: b.name.slice(4), parent: b.parent < foxFrom ? -1 : b.parent - foxFrom }))), foxFrom, swayFrom: sk.index('sway0') }
    foxes.set(sk, m)
  }
  poseMeadow(m, sk, t)
}

/** Poses the meadow's skeleton `t` seconds in: the description's bones, the wisp and its motes, the fox on its ring, the grass. */
export function poseMeadow(m: Pick<Meadow, 'fox' | 'foxFrom' | 'swayFrom'>, sk: Skeleton, t: number) {
  SCENE.pose(sk, t)
  for (const [name, behind] of [['wisp', 0], ['mote0', 0.3], ['mote1', 0.55], ['mote2', 0.78]] as const) sk.offset.set(wispAt(t, behind), sk.index(name) * 3)
  // the fox trots on its own bones, and the pose is copied onto the actor's
  trot(m.fox, (t * STRIDES) / (1.4 * LOOP))
  const n = m.fox.count
  sk.rotation.set(m.fox.rotation.subarray(0, n * 4), m.foxFrom * 4)
  sk.offset.set(m.fox.offset.subarray(0, n * 3), m.foxFrom * 3)
  sk.size.set(m.fox.size.subarray(0, n), m.foxFrom)
  const { at, turn } = foxAt(t), carrier = m.foxFrom - 1
  sk.offset.set(at, carrier * 3)
  sk.setRotation(carrier, axisAngle([0, 1, 0], turn))
  sk.size[carrier] = FOX_SIZE
  const u = t / LOOP
  for (let k = 0; k < SWAY_BONES; k++) {
    const p = TAU * (SWAY_TIMES * u - k / SWAY_BONES)
    sk.offset.set([SWAY * Math.sin(p), 0, SWAY * 0.45 * Math.sin(p + 1.1)], (m.swayFrom + k) * 3)
  }
  sk.update()
}
