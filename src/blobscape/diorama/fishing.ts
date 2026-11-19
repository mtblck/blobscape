import type { Vec3 } from '../../splat-core/blobs.ts'
import type { Rgb } from '../../splat-core/pixel.ts'
import type { PointLight } from '../../splat-engine/engine.ts'
import { fromTo } from '../../splat-engine/posing.ts'
import { axisAngle, mulQ, posedPoint, type Skeleton } from '../../splat-engine/rig.ts'
import { BODY_R, HOLE, LANTERN, LINE_PIECE, LINE_PIECES, LOOP, PUFFS, ROD_REST, SKIES, STARS, TIP, WEST, ZENITH } from './scenes/fishing.ts'

/**
 * The story of the sky fishing scene (scenes/fishing.ts holds what is in the picture). A scene description's moves
 * each repeat by themselves, and this is a story told in order, so it is posed here, from the time alone:
 *
 * A boy on the edge of a floating island casts his line into a cloud. It tugs twice, he heaves, and the moon comes up
 * out of the cloud on the line and is flung over his head into the sky, where it rocks and settles as the sun goes
 * down into the clouds in the west and the day turns to night. Then he casts again and pulls up the sun, the moon
 * goes down and the day comes back. One catch takes `HALF` seconds and the two make the loop.
 *
 * What goes down in the west travels back under the clouds to the hole as a glow, so the same two go round.
 */

/** Seconds for one catch: half the loop. */
export const HALF = LOOP / 2
/** The moments of one catch, in seconds from its start. */
export const AT = { back: 0.7, cast: 1.15, lands: 1.65, tug1: 4.0, tug2: 5.0, heave: 6.0, free: 7.0, hung: 7.7, rest: 8.8 } as const
/** When the one in the sky starts down, and when it is gone. */
const SETS = 5.8, SET = 7.9
/** When the sky starts to turn, and when it has. */
const TURNS = 6.1, TURNED = 8.6

const clamp = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const mix = (a: readonly number[], b: readonly number[], k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
const add = (a: readonly number[], b: readonly number[]): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const bezier = (p: readonly Vec3[], u: number): Vec3 => {
  const v = 1 - u
  return [0, 1, 2].map((i) => v * v * v * p[0][i] + 3 * v * v * u * p[1][i] + 3 * v * u * u * p[2][i] + u * u * u * p[3][i]) as Vec3
}
/** A bump that rises and falls once between `a` and `b`. */
const bump = (a: number, b: number, x: number) => (x <= a || x >= b ? 0 : Math.sin(((x - a) / (b - a)) * Math.PI) ** 2)

/** Which catch `t` is in (0 the moon's, 1 the sun's) and how far into it, in seconds. */
export function catchAt(t: number): { half: 0 | 1; s: number } {
  const u = ((t % LOOP) + LOOP) % LOOP
  return { half: u < HALF ? 0 : 1, s: u % HALF }
}

/** The rod's lean, in degrees from upright out over the clouds, by the seconds into a catch: keys eased one to the next. */
const ROD_KEYS: [number, number][] = [
  [0, 25], [AT.back, -40], [AT.cast, 76], [AT.lands, 55], [AT.tug1, 55], [AT.tug1 + 0.16, 30], [AT.tug1 + 0.5, 56], [AT.tug2, 55], [AT.tug2 + 0.16, 27], [AT.tug2 + 0.5, 58],
  [AT.heave - 0.05, 63], [AT.free - 0.05, -40], [AT.hung, -30], [AT.rest + 0.4, 25], [HALF, 25],
]
export function rodAt(s: number): number {
  let i = 0
  while (i < ROD_KEYS.length - 2 && s >= ROD_KEYS[i + 1][0]) i++
  const [a, b] = [ROD_KEYS[i], ROD_KEYS[i + 1]]
  return a[1] + (b[1] - a[1]) * smooth(a[0], b[0], s)
}

/** Where a catch is drawn from as it comes up: down inside the cloud under the hole. */
const DEEP: Vec3 = [HOLE[0], HOLE[1] - 0.45, HOLE[2]]
/** A catch's way up: out of the cloud, round over the boy's head and to its place in the sky. */
const UP: Vec3[] = [DEEP, [-2.0, 1.7, 0.3], [-1.0, 4.1, -0.2], ZENITH]
/** The way down in the west. */
const DOWN: Vec3[] = [ZENITH, [1.9, 3.1, -1.0], [2.9, 1.6, -1.2], WEST]

/** How far along its way up a catch is, `s` seconds into its catch: hauled slowly, flung, then rocking to rest past 1 and back. */
function risen(s: number): number {
  const haul = 0.75, k = 3.2, w = 5.2
  if (s <= AT.heave) return 0
  if (s <= AT.heave + haul) return 0.32 * ((s - AT.heave) / haul) ** 2
  // a spring that takes over at the haul's last speed
  const x = s - AT.heave - haul, v = (0.64 / haul) / 0.68, b = (k - v) / w
  return 1 - 0.68 * Math.exp(-k * x) * (Math.cos(w * x) + b * Math.sin(w * x))
}

/** One of the two that are fished up: where it is, how big (0 hidden), how far it is turned, and how bright its light. */
export interface Body { at: Vec3; size: number; turn: number; light: number }

/**
 * The moon (`which` 0) or the sun (1) at `t`. In its own catch it waits in the west under the clouds, comes along
 * under them to the hole as the line tugs, and is hauled up and flung into the sky; through the other's catch it hangs
 * there until that one is heaved up, then goes down in the west.
 */
export function bodyAt(which: 0 | 1, t: number): Body {
  const { half, s } = catchAt(t)
  if (half === which) {
    if (s < AT.heave) {
      // under the clouds, on its way to the hook: only its glow shows
      const k = smooth(AT.lands, AT.heave - 0.3, s)
      const under = mix([WEST[0], -0.25, 0.2], DEEP, k)
      return { at: under, size: 0, turn: 0, light: 0.22 * smooth(AT.lands, AT.tug1, s) + 0.14 * (bump(AT.tug1, AT.tug1 + 0.6, s) + bump(AT.tug2, AT.tug2 + 0.6, s)) }
    }
    const u = risen(s)
    return { at: bezier(UP, u), size: 0.55 * smooth(AT.heave, AT.heave + 0.45, s) + 0.45 * smooth(AT.heave + 0.5, AT.hung, s), turn: (1 - u) * 2.4, light: 0.22 + 0.78 * smooth(AT.heave + 0.4, AT.hung, s) }
  }
  if (s < SETS) return { at: ZENITH, size: 1, turn: 0, light: 1 }
  const u = smooth(SETS, SET, s), gone = 1 - smooth(SET - 0.7, SET, s)
  return { at: bezier(DOWN, u * (0.4 + 0.6 * u)), size: gone, turn: -u * 1.2, light: gone }
}

/** How much of the day there is, 1 at noon and 0 at night: it goes as the moon is flung up and comes back with the sun. */
export function dayAt(t: number): number {
  const { half, s } = catchAt(t), k = smooth(TURNS, TURNED, s)
  return half === 0 ? 1 - k : k
}

const rgbOf = (hex: string): Rgb => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
const DAY = SKIES.day.map(rgbOf), NIGHT = SKIES.night.map(rgbOf), DUSK = SKIES.dusk.map(rgbOf), PLUM = rgbOf(SKIES.plum)
/** The sky at `t`, top and bottom: day and night by turns, through a warm horizon as one becomes the other. */
export function skyAt(t: number): [Rgb, Rgb] {
  const d = dayAt(t)
  const one = (i: number): Rgb => {
    // low in the sky the night warms through plum before the orange, so the blend never passes through mud
    const c = d > 0.5 ? mix(DUSK[i], DAY[i], d * 2 - 1) : i === 0 ? mix(NIGHT[0], DUSK[0], d * 2) : d > 0.25 ? mix(PLUM, DUSK[1], d * 4 - 1) : mix(NIGHT[1], PLUM, d * 4)
    return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])]
  }
  return [one(0), one(1)]
}

/** How much of its painted daylight everything keeps at `t`: all of it by day, a dim blue at night, warmer in between. */
export function ambientAt(t: number): [number, number, number] {
  const d = dayAt(t), warm = 4 * d * (1 - d)
  const c = mix([0.2, 0.25, 0.46], [0.96, 0.96, 0.96], d)
  return [c[0] + 0.1 * warm, c[1] - 0.03 * warm, c[2] - 0.06 * warm]
}

const LINEAR = { moon: [0.62, 0.74, 1.0], sun: [1.0, 0.72, 0.36], lantern: [1.0, 0.62, 0.25] }
/** The live lights at `t`: the moon's, the sun's and the lantern's, always these three in this order. */
export function lightsAt(t: number): PointLight[] {
  const moon = bodyAt(0, t), sun = bodyAt(1, t), night = 1 - dayAt(t)
  const of = (b: Body, c: number[], k: number, range: number): PointLight => ({ position: b.at, color: [c[0] * k * b.light, c[1] * k * b.light, c[2] * k * b.light], range })
  return [
    of(moon, LINEAR.moon, 1.5, 3.4),
    of(sun, LINEAR.sun, 0.5 + 0.9 * (1 - dayAt(t)), 3.2),
    { position: [LANTERN[0] + 0.75, LANTERN[1] - 0.02, LANTERN[2]] as Vec3, color: LINEAR.lantern.map((c) => c * (0.25 + 1.1 * night)) as Vec3, range: 0.9 },
  ]
}

/** When wisps are thrown up at the hole, seconds into a catch, and how hard. */
const BURSTS: [number, number][] = [[AT.lands - 0.05, 0.6], [AT.tug1, 0.7], [AT.tug2, 0.8], [AT.heave + 0.05, 1.5]]
const BURST = 0.95

const Z: Vec3 = [0, 0, 1]
const DOWNWARD: Vec3 = [0, -1, 0]
const rad = (deg: number) => (deg * Math.PI) / 180

/**
 * Lays the story over the scene's own pose (`base`, the description's moves): the boy, his rod and line, the two
 * catches, the stars and the wisps, all from the time alone.
 */
export function poseFishing(sk: Skeleton, t: number, base: (sk: Skeleton, t: number) => void) {
  base(sk, t)
  const { half, s } = catchAt(t)
  const rod = rodAt(s), day = dayAt(t)
  const turnZ = (name: string, deg: number) => { const b = sk.index(name); sk.setRotation(b, mulQ(sk.rotation.subarray(b * 4, b * 4 + 4), axisAngle(Z, rad(deg)))) }

  // the boy leans with the rod, kicks his legs as he heaves, and looks up after what he has flung
  turnZ('boy', (rod - 25) * 0.13)
  turnZ('arms', rod - ROD_REST)
  const up = smooth(AT.heave + 0.3, AT.free + 0.2, s) * (1 - smooth(AT.rest + 0.8, AT.rest + 2, s))
  turnZ('head', -30 * up + 4 * Math.sin((t / LOOP) * Math.PI * 2 * 5))
  const kick = bump(AT.heave, AT.free + 0.3, s)
  turnZ('leg0', 14 * Math.sin((t / LOOP) * Math.PI * 2 * 14) * (1 - kick) - 55 * kick)
  turnZ('leg1', 14 * Math.sin((t / LOOP) * Math.PI * 2 * 14 + 2.2) * (1 - kick) - 40 * kick)
  sk.update()

  // the two catches
  const bodies = [bodyAt(0, t), bodyAt(1, t)]
  ;(['moon', 'sun'] as const).forEach((name, i) => {
    const b = sk.index(name), body = bodies[i]
    for (let k = 0; k < 3; k++) sk.offset[b * 3 + k] = body.at[k] - ZENITH[k]
    sk.size[b] = body.size
    sk.setRotation(b, axisAngle(Z, body.turn))
  })

  // the float: hanging from the tip, flying out to the cloud, riding on it, hooked to the catch, then swinging back
  const tip = posedPoint(sk, sk.index('arms'), TIP)
  const hang = add(tip, [0.05 * Math.sin((t / LOOP) * Math.PI * 2 * 8), -0.7, 0])
  const caught = bodies[half]
  const hooked = add(caught.at, [0, BODY_R * 0.9 * caught.size, 0])
  let float: Vec3
  if (s < AT.cast - 0.1) float = hang
  else if (s < AT.heave) {
    const k = smooth(AT.cast - 0.1, AT.lands, s)
    const bobbing = add(HOLE, [0, 0.015 * Math.sin((t / LOOP) * Math.PI * 2 * 20) + 0.1 * (bump(AT.tug1, AT.tug1 + 0.5, s) + bump(AT.tug2, AT.tug2 + 0.5, s)) - 0.12 * smooth(AT.heave - 0.4, AT.heave, s), 0])
    float = add(mix(hang, bobbing, k), [0, 0.55 * Math.sin(Math.PI * k) * (1 - k), 0])
  } else if (s < AT.free) float = mix(add(HOLE, [0, -0.12, 0]), hooked, smooth(AT.heave, AT.heave + 0.2, s))
  else float = mix(hooked, hang, smooth(AT.free, AT.free + 0.9, s))
  const fb = sk.index('float')
  for (let k = 0; k < 3; k++) sk.offset[fb * 3 + k] = float[k] - sk.bones[fb].head[k]
  // hidden while it is down in the cloud with the catch on it
  sk.size[fb] = 1 - 0.99 * bump(AT.heave - 0.3, AT.heave + 0.5, s)

  // the line: straight pieces laid end over end from the tip to the float, drawn out when it must reach further
  const way: Vec3 = [float[0] - tip[0], float[1] - tip[1], float[2] - tip[2]]
  const far = Math.hypot(...way) || 1e-6, dir: Vec3 = [way[0] / far, way[1] / far, way[2] / far]
  const q = fromTo(DOWNWARD, dir), size = Math.max(far / (LINE_PIECES * LINE_PIECE), Math.min(1, far / LINE_PIECE))
  const piece = LINE_PIECE * size
  for (let i = 0; i < LINE_PIECES; i++) {
    const b = sk.index(`line${i}`), from = (i / (LINE_PIECES - 1)) * Math.max(0, far - piece), head = sk.bones[b].head
    for (let k = 0; k < 3; k++) sk.offset[b * 3 + k] = tip[k] + dir[k] * from - head[k]
    sk.setRotation(b, q)
    sk.size[b] = size
  }

  // stars come out one by one as the day goes, and twinkle
  STARS.forEach((_, i) => {
    const out = smooth(0.25 + 0.45 * (i / STARS.length), 0.5 + 0.45 * (i / STARS.length), 1 - day)
    sk.size[sk.index(`star${i}`)] = out * (0.78 + 0.22 * Math.sin((t / LOOP) * Math.PI * 2 * (5 + (i % 4)) + i * 1.7))
  })

  // wisps of cloud thrown up from the hole
  for (let i = 0; i < PUFFS; i++) {
    const b = sk.index(`puff${i}`)
    let size = 0
    for (const [at, hard] of BURSTS) {
      const life = (s - at - (i % 3) * 0.04) / BURST
      if (life <= 0 || life >= 1) continue
      const a = (i / PUFFS) * Math.PI * 2 + at, out = (0.16 + 0.1 * (i % 2)) * hard * (1 - (1 - life) ** 2)
      sk.offset[b * 3] = Math.cos(a) * out
      sk.offset[b * 3 + 1] = (0.2 + 0.12 * (i % 3)) * hard * Math.sin(Math.PI * life * 0.8) - 0.06
      sk.offset[b * 3 + 2] = Math.sin(a) * out * 0.7
      size = Math.sin(Math.PI * life) ** 0.7 * (0.6 + 0.4 * hard) * (0.75 + 0.25 * (i % 2))
    }
    sk.size[b] = size
  }
  sk.update()
}
