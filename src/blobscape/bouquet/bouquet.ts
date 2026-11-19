import type { Blobs, Quat, Vec3 } from '../../splat-core/blobs.ts'
import { fromTo } from '../../splat-engine/posing.ts'
import { Skeleton, axisAngle, emptySkin, mulQ, rotate, setWeights, type Bone, type Skin } from '../../splat-engine/rig.ts'
import { HEIGHTS, plan, type Choice, type Plan } from './arrange.ts'
import { BLOOM, flower } from './flowers.ts'
import { head, petal } from './heads.ts'
import { Maker, add, arc, clamp, cross, dot, lerp, mix, mul, rng, smooth, sub, unit, upTo } from './make.ts'
import { makeTable, makeVase, type VaseInfo } from './vases.ts'

/**
 * A whole bouquet as one actor: the table, the vase, and every stem with its
 * leaves and its head, on one skeleton. Each stem is three bones (where it
 * leaves the vase, halfway up, and its head), so it can sway; a few outer
 * petals have a bone of their own, so they can let go and fall to the table.
 * It is posed from the time alone.
 */

/** How far apart blobs lie at each level of detail, in the bouquet's units (a rose is about 0.2 across). */
export const DETAILS: { id: string; label: string; spacing: number }[] = [
  { id: 'light', label: 'Light', spacing: 0.0095 },
  { id: 'fine', label: 'Fine', spacing: 0.0072 },
  { id: 'finest', label: 'Finest', spacing: 0.0055 },
]

/** How many petals at most have a bone of their own and may fall. */
export const MAX_FALLING = 18
/** The table's top is at height 0; a lying petal's lowest blob is this far above it. */
const LIE = 0.004

/** A petal that may fall. */
export interface Falling {
  bone: number
  /** The head bone it rides on until it lets go. */
  rides: number
  /** Where it joins the flower, at rest. */
  base: Vec3
  /** When it lets go, in seconds (Infinity: not yet planned). */
  at: number
  /** How long the fall takes. */
  takes: number
  /** Where its foot comes to rest, and its turn there. */
  land: Vec3
  lies: Quat
  /** What it tumbles about on the way. */
  spin: Vec3
  flutter: number
}

export interface Bouquet {
  plan: Plan
  vase: VaseInfo
  blobs: Blobs
  skin: Skin
  skeleton: Skeleton
  /** Which part (a petal, a leaf, the vase) each blob belongs to. */
  partOf: Uint16Array
  /** The stems' bones: where each leaves the vase, its middle, its head; and how readily it sways. */
  stems: { a: number; b: number; head: number; sway: number; phase: number; flower: string }[]
  falling: Falling[]
  /** How strong the draft is, 0 to 2 (1 at first). */
  draft: number
  /** The top of the tallest stem and how wide the bouquet is, for the camera. */
  height: number
  width: number
}

const UP: Vec3 = [0, 1, 0]
/** Stem leaves are made this share of their recipe's size: a florist strips most of them, and big ones hide the flowers. */
const LEAVES = 0.7

/** Builds the bouquet a choice asks for, with blobs `spacing` apart. */
export function makeBouquet(choice: Choice, spacing: number): Bouquet {
  const p = plan(choice)
  const m = new Maker(spacing)
  const rand = rng(choice.seed * 48271 + 11)
  const bones: Bone[] = [{ name: 'root', parent: -1, head: [0, 0, 0], tail: [0, 0.3, 0] }]

  m.onBone = 0
  const vase = makeVase(m, p.vase, choice.seed)
  makeTable(m, vase.foot, choice.seed)
  const flowersFrom = m.blobs.count

  // a tall vase carries a taller bouquet, a squat one a lower one: about one and a half times the vase, as florists reckon
  const H = HEIGHTS[choice.size] * clamp(0.75 + vase.top * 0.45, 0.9, 1.2)
  const hold: Vec3 = [0, vase.top - 0.05, 0]
  const stems: Bouquet['stems'] = []

  p.stems.forEach((s, i) => {
    const f = flower(s.flower), v = f.varieties[s.variety]
    const h = f.head(v), size = f.size * BLOOM
    // a spike or a frond is part of the stem's length: its foot sits lower so its middle is where the plan put it
    const own = 'along' in h ? h.along.len * size * ((h.along.droop ?? 0) > 120 ? 0.1 : 0.75) : 'blades' in h ? h.blades.blade.len * size * 0.7 : 'spray' in h ? h.spray.len * size * 0.6 : 0
    const flat = unit([s.dir[0], 0, s.dir[2]]), lean = Math.sqrt(Math.max(0, 1 - s.dir[1] * s.dir[1]))
    const droop = 'along' in h ? h.along.droop ?? 0 : 0
    // a tassel that hangs must start clear of the vase's widest part
    // and any stem's head starts beyond the rim it leans on, or a long frond in a wide bucket would set off back across the mouth
    const long = Math.max(0.12, vase.mouth * 0.62 + 0.1, s.length * H - own, droop > 120 ? (vase.foot + 0.06) / Math.max(0.3, lean) : 0)
    // stems cross in the vase's neck: one that leans left leaves the mouth on the left and stands on the right inside
    const mouth: Vec3 = [hold[0] + flat[0] * vase.mouth * 0.62 * lean, vase.top - 0.01, hold[2] + flat[2] * vase.mouth * 0.62 * lean]
    const tip = add(hold, mul(s.dir, long))
    const knee = add(add(mouth, mul(sub(tip, mouth), 0.45)), [0, long * 0.2 * lean, 0])
    const path = arc(mouth, knee, tip, 14)
    const a = bones.length
    bones.push({ name: `s${i}a`, parent: 0, head: mouth, tail: path[7] })
    bones.push({ name: `s${i}b`, parent: a, head: path[7], tail: tip })
    const last = unit(sub(tip, path[13]))
    const end = dot(last, s.dir) > 0.3 ? last : s.dir
    bones.push({ name: `s${i}h`, parent: a + 1, head: tip, tail: add(tip, mul(end, 0.08)) })
    stems.push({ a, b: a + 1, head: a + 2, sway: f.sway ?? 1, phase: rand() * 100, flower: f.id })

    // the stem, bending between its two lower bones; in a clear vase it shows all the way down
    let along = 0
    m.newPart()
    if (vase.clear) {
      m.onBone = 0
      m.blend = undefined
      const footR = Math.max(0.02, vase.mouth * 0.7)
      const foot: Vec3 = [-flat[0] * footR * (0.3 + 0.7 * lean) + (rand() - 0.5) * 0.03, vase.floor + 0.01, -flat[2] * footR * (0.3 + 0.7 * lean) + (rand() - 0.5) * 0.03]
      m.tube([foot, mouth], () => f.stem.r, () => mul(f.stem.color, 0.8))
    }
    m.onBone = a
    m.blend = () => [a + 1, smooth((along - 0.3) / 0.4)]
    m.tube(path, () => f.stem.r, (t, _a, q) => { along = t; return mul(f.stem.color, 0.9 + 0.2 * Math.sin(q[1] * 60 + i)) })
    m.blend = undefined

    // leaves, each standing off the stem and turned a little further round than the last
    const lv = f.stem.leaves
    if (lv) {
      for (let k = 0; k < lv.n; k++) {
        const t = lerp(lv.from ?? 0.35, lv.to ?? 0.8, lv.n > 1 ? k / (lv.n - 1) : 0.5)
        const j = Math.min(13, Math.floor(t * 14)), at = mix(path[j], path[j + 1], t * 14 - j), d = unit(sub(path[j + 1], path[j]))
        m.onBone = t < 0.5 ? a : a + 1
        m.within(at, mulQ(upTo(d), axisAngle(UP, k * 2.4 + i)), LEAVES, () => petal(m, lv.shape, lv.paint, s.seed + k))
      }
    }

    // the head: along the stem for a spike, turned out and up for a face
    m.onBone = a + 2
    const out = unit(add(s.dir, [0, 0.45, 0]))
    let axis = unit(mix(end, out, f.face))
    // what bends over or fans out starts more upright, so it arches out of the bouquet instead of hanging down the vase
    const lift = 'blades' in h ? 0.5 : droop > 120 ? 0.6 : droop / 110
    if (lift) axis = unit(mix(axis, UP, Math.min(0.75, lift)))
    if (f.stem.nod) {
      // a nodding flower tips over toward the outside of the bouquet
      const side = Math.hypot(flat[0], flat[2]) > 0.1 ? flat : unit([Math.cos(i), 0, Math.sin(i)])
      const nod = (f.stem.nod * Math.PI) / 180
      axis = unit(add(mul(end, Math.cos(nod)), mul(unit(sub(side, mul(end, dot(side, end)))), Math.sin(nod))))
    }
    // a drooping spike or frond hangs toward the outside: its bend is turned to face away from the middle
    let turn = upTo(axis)
    if (droop) {
      const want = Math.hypot(flat[0], flat[2]) > 0.1 ? flat : ([1, 0, 0] as Vec3)
      const x = rotate(turn, [1, 0, 0]), z = rotate(turn, [0, 0, 1])
      turn = mulQ(turn, axisAngle(UP, Math.atan2(-dot(want, z), dot(want, x))))
    } else turn = mulQ(turn, axisAngle(UP, rand() * 6.28))
    m.within(tip, turn, size, () => head(m, h, s.seed))
  })

  // a few of the loose petals get a bone of their own: spread over the bouquet, not all from one flower
  const loose = [...m.loose]
  for (let i = loose.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [loose[i], loose[j]] = [loose[j], loose[i]] }
  const perHead = new Map<number, number>()
  const chosen = loose.filter((l) => { const n = perHead.get(l.bone) ?? 0; if (n >= 2) return false; perHead.set(l.bone, n + 1); return true }).slice(0, MAX_FALLING)
  const falling: Falling[] = chosen.map((l, k) => {
    const bone = bones.length
    bones.push({ name: `p${k}`, parent: 0, head: l.base, tail: add(l.base, mul(l.normal, 0.03)) })
    for (let i = l.from; i < l.to; i++) m.bone[i] = bone
    // it comes down outside the vase's foot, a little further out than it started, and lies flat, either way up
    const away = Math.hypot(l.base[0], l.base[2]) > 0.03 ? unit([l.base[0], 0, l.base[2]]) : unit([Math.cos(k * 2.4), 0, Math.sin(k * 2.4)])
    const far = clamp(Math.hypot(l.base[0], l.base[2]) + 0.06 + 0.3 * rand(), vase.foot + 0.08, 0.78)
    const bearing = Math.atan2(away[2], away[0]) + (rand() - 0.5) * 0.9
    const lies = mulQ(axisAngle(UP, rand() * 6.28), fromTo(unit(l.normal), rand() < 0.5 ? UP : [0, -1, 0]))
    let low = Infinity
    for (let i = l.from; i < l.to; i++) low = Math.min(low, rotate(lies, sub(m.blobs.center.subarray(i * 3, i * 3 + 3), l.base))[1])
    const land: Vec3 = [far * Math.cos(bearing), LIE - low, far * Math.sin(bearing)]
    return { bone, rides: l.bone, base: l.base, at: Infinity, takes: 1.1 + 0.9 * Math.max(0, l.base[1]) + 0.5 * rand(), land, lies, spin: unit([rand() - 0.5, (rand() - 0.5) * 0.4, rand() - 0.5]), flutter: 0.03 + 0.05 * rand() }
  })

  const blobs = m.blobs
  // how high and how wide the flowers come, for framing them
  let height = 0, width = 0
  for (let i = flowersFrom; i < blobs.count; i++) {
    height = Math.max(height, blobs.center[i * 3 + 1])
    width = Math.max(width, Math.hypot(blobs.center[i * 3], blobs.center[i * 3 + 2]))
  }
  const skin = emptySkin(blobs.count)
  const partOf = new Uint16Array(blobs.count)
  for (let i = 0; i < blobs.count; i++) {
    const s = m.share2[i]
    setWeights(skin, i, s > 0.001 ? [[m.bone[i], 1 - s], [m.bone2[i], s]] : [[m.bone[i], 1]])
    partOf[i] = m.part[i] % 65536
  }
  return { plan: p, vase, blobs, skin, skeleton: new Skeleton(bones), partOf, stems, falling, draft: 1, height, width }
}

/** How long between petals, in seconds: the first after `FIRST`, then one every `EVERY` or so. */
export const FIRST = 4, EVERY = 6

/** Plans when the petals still on the flowers let go, counting from `now`: one every few seconds. `on` false holds them all. */
export function setShedding(b: Bouquet, on: boolean, now: number, seed = b.plan.choice.seed) {
  const rand = rng(seed + 5)
  let t = now + FIRST
  for (const f of b.falling) {
    if (f.at <= now) continue
    f.at = on ? t : Infinity
    t += EVERY * (0.5 + rand())
  }
}

/** Lets the next petal go now. Returns false when every one has fallen. */
export function shedOne(b: Bouquet, now: number): boolean {
  const next = b.falling.filter((f) => f.at > now).sort((x, y) => x.at - y.at)[0]
  if (!next) return false
  next.at = now
  return true
}

/** How many petals have let go by `now`. */
export const fallen = (b: Bouquet, now: number) => b.falling.filter((f) => f.at <= now).length

const nlerp = (a: ArrayLike<number>, b: ArrayLike<number>, t: number): Quat => {
  const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1
  const q = [lerp(a[0], b[0] * s, t), lerp(a[1], b[1] * s, t), lerp(a[2], b[2] * s, t), lerp(a[3], b[3] * s, t)]
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]
}

/** How far a stem's bones turn in a draft of 1, in radians: the middle of the stem, and as much again at the head. */
export const SWAY = 0.035

/** Poses the bouquet for a time: stems swaying in the draft, petals riding their flowers or on their way down. */
export function poseBouquet(b: Bouquet, sk: Skeleton, t: number) {
  sk.reset()
  // the draft comes and goes, and every stem answers it in its own time
  const gust = 0.6 + 0.4 * Math.sin(t * 0.37) * Math.sin(t * 0.23 + 1)
  const wx = Math.sin(t * 0.31) * 0.6, wz = Math.cos(t * 0.19 + 0.7) * 0.6
  for (const s of b.stems) {
    const k = SWAY * b.draft * s.sway
    const ax = k * (gust * (0.7 * Math.sin(t * 1.1 + s.phase) + 0.3 * Math.sin(t * 2.3 + s.phase * 1.7)) + wx)
    const az = k * (gust * (0.7 * Math.sin(t * 0.9 + s.phase * 1.3) + 0.3 * Math.sin(t * 2.7 + s.phase * 0.6)) + wz)
    const q = mulQ(axisAngle([1, 0, 0], ax), axisAngle([0, 0, 1], az))
    sk.setRotation(s.a, nlerp([0, 0, 0, 1], q, 0.3))
    sk.setRotation(s.b, q)
    sk.setRotation(s.head, mulQ(axisAngle([1, 0, 0], k * 0.8 * Math.sin(t * 1.7 + s.phase * 2.1)), axisAngle([0, 0, 1], k * 0.8 * Math.sin(t * 1.4 + s.phase * 0.9))))
  }
  if (!b.falling.length) { sk.update(); return }
  sk.update()
  for (const f of b.falling) {
    // riding: wherever its flower's bone has carried the place it joins on
    const M = sk.matrix.subarray(f.rides * 16, f.rides * 16 + 16), p = f.base
    const rode: Vec3 = [M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14]]
    const turned = sk.quat.subarray(f.rides * 4, f.rides * 4 + 4)
    const s = clamp((t - f.at) / f.takes)
    if (s <= 0) {
      sk.setRotation(f.bone, turned)
      sk.offset.set(sub(rode, p), f.bone * 3)
      continue
    }
    // falling: slow at first, drifting out and rocking from side to side, tumbling less as it nears the table
    const e = smooth(s), drop = Math.pow(s, 1.5)
    const side = unit(cross(sub(f.land, f.base), UP))
    const rock = Math.sin(s * Math.PI * 5) * f.flutter * (1 - s)
    const at: Vec3 = [lerp(rode[0], f.land[0], e) + side[0] * rock, lerp(rode[1], f.land[1], drop), lerp(rode[2], f.land[2], e) + side[2] * rock]
    const q = mulQ(nlerp(turned, f.lies, e), axisAngle(f.spin, Math.sin(s * Math.PI) * 2.4 + Math.sin(s * Math.PI * 5) * 0.5 * (1 - s)))
    sk.setRotation(f.bone, q)
    sk.offset.set(sub(at, p), f.bone * 3)
  }
  sk.update()
}

/** The lowest point any blob of a fallen petal has at `t`, for tests: it should rest on the table, not in it. */
export function lowestOf(b: Bouquet, f: Falling, sk: Skeleton): number {
  let low = Infinity
  const M = sk.matrix.subarray(f.bone * 16, f.bone * 16 + 16)
  for (let i = 0; i < b.blobs.count; i++) {
    if (b.skin.joints[i * 4] !== f.bone) continue
    const c = b.blobs.center.subarray(i * 3, i * 3 + 3)
    low = Math.min(low, M[1] * c[0] + M[5] * c[1] + M[9] * c[2] + M[13])
  }
  return low
}

