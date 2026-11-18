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
const TAU = Math.PI * 2

/** The ring the fox trots, how big it is beside the Creature page's fox, and its strides a lap (a whole number, so the loop joins). */
export const RING = 1.05
export const FOX_SIZE = 0.5
export const STRIDES = 16
/** The wisp's path round the fox: how far it swings ahead and to the side, how high, and how many times a loop it goes round. */
export const WISP = { ahead: 0.95, aside: 0.5, height: 0.55, times: 5 }
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
  const fox = makeFox(foxBlobs)
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

  // the grass: three blobs a blade, the foot on the turf, the tip on a sway bone and the middle shared between them
  const rnd = seeded(7)
  for (let n = 0; n < blades;) {
    const x = (rnd() * 2 - 1) * 1.7, z = (rnd() * 2 - 1) * 1.7
    const grown = grassHeight(x, z)
    if (grown <= 0 || rnd() > grown + 0.25) continue
    n++
    const height = (0.09 + 0.13 * rnd() * rnd() + (rnd() < 0.1 ? 0.14 : 0)) * grown, width = 0.014 + 0.009 * rnd()
    const yaw = rnd() * TAU, lean = 0.1 + 0.3 * rnd(), shade = rnd()
    const turn = axisAngle([0, 1, 0], yaw)
    const sway = swayFrom + swayBone(x, z)
    for (let k = 0; k < 3; k++) {
      // the blade bends over more toward its tip
      const tilt = lean * (0.4 + 0.6 * k), up = (k + 0.5) / 3
      const out = Math.sin(tilt) * height * up * 0.8
      const quat = mulQ(turn, axisAngle([1, 0, 0], tilt)) as Quat
      const tone = mixed(mixed(GRASS[0], GRASS[1], shade), mixed(GRASS[2], GRASS[3], shade * shade), up)
      const at = blobs.push({
        center: [x + Math.sin(yaw) * out, height * up * Math.cos(tilt * 0.5), z + Math.cos(yaw) * out],
        scale: [width * (1 - 0.28 * k), height / 5.2, 0.004], quat, color: tone, opacity: 1,
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
