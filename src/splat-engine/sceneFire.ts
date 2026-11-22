import { Blobs } from '../splat-core/blobs.ts'
import type { Actor, PointLight } from './engine.ts'
import { Skeleton, emptySkin, setWeights } from './rig.ts'
import { flickerAt, type CompiledScene, type FirePlan } from './sceneDoc.ts'
import { FIRE_FLAMES, FIRE_SPARKS, fireColor, playFire, powerAt, runFire, type FireLoop, type FireShape } from './fire.ts'
import { WIND_WAY, type SkyState } from './skyRecipes.ts'

/** A flame tracer's size at its biggest, and a spark's, in bed radii. */
const FLAME_SIZE = 0.2, SPARK_SIZE = 0.07
/** How much longer than wide a tracer is drawn for each bed radius a second it moves, and the most. */
const STRETCH = 0.16, STRETCH_MOST = 1.6
/** How far to the side of a line of sight gas still counts toward what is seen along it, in bed radii, and how quickly hot gas along it adds up to white heat. */
const SIGHT = 0.3, DEPTH = 0.12
/** The bed radius of a campfire, which burns at the simulation's own pace (`FireShape.quick` 1). */
const CAMPFIRE = 0.11
/** A puff of smoke's size at its biggest, in bed radii, how see-through it is, and its color with no light on it changed. */
const SMOKE_SIZE = 0.34, SMOKE_OPACITY = 0.55, SMOKE: readonly [number, number, number] = [0.52, 0.5, 0.5]
/** Embers on a fire's bed, their size in bed radii, and how far from the bed's middle they lie. */
const EMBERS = 14, EMBER_SIZE = 0.13, EMBER_REACH = 0.8
/** The light a fire's embers give once the flames are out, beside the fire's own. */
const EMBER_LIGHT = 0.05

/** A number from 0 to 1 for two whole numbers, the same everywhere. */
function hash(i: number, j = 0): number {
  let x = Math.imul((i + 1) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((j + 7) | 0, 0xc2b2ae35)
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35)
  x = Math.imul(x ^ (x >>> 15), 0x27d4eb2f)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

/** Loops already played, by shape and length: a scene set in another time of day, or the same fire set down twice, plays nothing again. */
const played = new Map<string, FireLoop>()
/** Loops being played a little each frame, so a change of weather does not hold the page still. */
const playing = new Map<string, Generator<undefined, FireLoop>>()
/** Milliseconds a frame given to playing a loop that is wanted and not there yet. */
const PLAY_BUDGET = 8

/** The loop of a shape: there already, or played now (`until` Infinity), or played on until the clock reaches `until` and not there yet. */
function loopOf(shape: FireShape, loop: number, until: number): FireLoop | undefined {
  const key = `${JSON.stringify(shape)}/${loop}`
  const have = played.get(key)
  if (have) return have
  let run = playing.get(key)
  if (until === Infinity && !run) { const k = runFire(shape, loop); played.set(key, k); return k }
  if (until !== Infinity && performance.now() >= until) return undefined
  if (!run) playing.set(key, (run = playFire(shape, loop)))
  for (;;) {
    const step = run.next()
    if (step.done) { playing.delete(key); played.set(key, step.value); return step.value }
    if (until !== Infinity && performance.now() >= until) return undefined
  }
}

/** What of the sky a fire answers to (a `SkyState` has them): how much rain and snow fall, 0 to 1, and the wind's level. */
export type FireWeather = Pick<SkyState, 'rain' | 'snow' | 'wind'>

/** How much of its fuel a fire burns when it burns low, on its way out, and as embers with the flames gone (`FireShape.fuel`; 1 with nothing against it). */
export const FUEL_LOW = 0.5, FUEL_DYING = 0.36, FUEL_EMBERS = 0.15
/** The rain (a share of all there can be) a fire still burns well in, burns low in, and is put out by: light rain, rain, and anything heavier. */
export const RAIN_FINE = 0.15, RAIN_LOW = 0.4, RAIN_OUT = 0.7
/** The snow a fire burns well in; in the heaviest it burns low. */
export const SNOW_FINE = 0.4
/** The wind's level a fire still burns in, and the level that blows it out (a gale). */
export const WIND_FINE = 2, WIND_OUT = 2.8
/** How fast the wind crosses a fire at each of its levels, in bed radii a second. */
export const FIRE_WIND = [0, 0.5, 2, 3]
/** Seconds a fire takes to die down from full to out, and to catch again, and to change from one way of burning to another. */
export const DIE = 3.5, CATCH = 3, CHANGE = 1
/** Ways of burning shown at once while a fire changes from one to another. */
const LAYERS = 3

/**
 * How much of its fuel a fire burns under a sky (Matt, 2026-11-22): all of it in light rain and in snow, half in rain
 * and in heavy snow, none in heavy rain or a thunderstorm, and none in a gale, which blows it out.
 */
export function fuelUnder(sky: FireWeather): number {
  const between = (v: number, a: number, b: number, from: number, to: number) => from + (to - from) * Math.min(1, Math.max(0, (v - a) / (b - a)))
  const rain = sky.rain <= RAIN_LOW ? between(sky.rain, RAIN_FINE, RAIN_LOW, 1, FUEL_LOW) : between(sky.rain, RAIN_LOW, RAIN_OUT, FUEL_LOW, 0)
  const snow = between(sky.snow, SNOW_FINE, 1, 1, FUEL_LOW)
  const wind = between(sky.wind, WIND_FINE, WIND_OUT, 1, 0)
  return Math.min(rain, snow, wind)
}

/**
 * The ways of burning that make up a fire burning `fuel` of its fuel, each with its share: the two it lies between of
 * burning well, burning low, dying and embers. A fire that is out is its embers, which still warm the air over them.
 */
export function burningAt(fuel: number): { fuel: number; share: number }[] {
  const stops = [[1, 1], [FUEL_LOW, FUEL_LOW], [FUEL_DYING, FUEL_DYING], [0, FUEL_EMBERS]]
  if (fuel >= 1) return [{ fuel: 1, share: 1 }]
  for (let k = 1; k < stops.length; k++) {
    if (fuel < stops[k][0]) continue
    const share = (fuel - stops[k][0]) / (stops[k - 1][0] - stops[k][0])
    return share > 0 ? [{ fuel: stops[k - 1][1], share }, { fuel: stops[k][1], share: 1 - share }] : [{ fuel: stops[k][1], share: 1 }]
  }
  return [{ fuel: FUEL_EMBERS, share: 1 }]
}

/** How much smoke a fire burning `fuel` of its fuel gives, 0 to 1: none burning well, the most burning low, a wisp off its embers. */
export function smokeAt(fuel: number): number {
  return fuel >= 1 ? 0 : fuel >= FUEL_LOW ? (1 - fuel) / (1 - FUEL_LOW) : 0.45 + 0.55 * (fuel / FUEL_LOW)
}

/** A planned fire's shape under a wind of a level (a whole one) burning a share of its fuel: a harder wind throws more sparks. */
export function shapeUnder(base: FireShape, level: number, fuel: number): FireShape {
  const blow = FIRE_WIND[Math.min(FIRE_WIND.length - 1, Math.max(0, level))]
  return { ...base, ...(blow ? { sparks: Math.round(base.sparks * (1 + 0.6 * level) * 10) / 10, wind: [Math.round(WIND_WAY[0] * blow * 100) / 100, Math.round(WIND_WAY[1] * blow * 100) / 100] as const } : {}), ...(fuel < 1 ? { fuel } : {}) }
}

/** One way of burning on show: its kept loop and how much of the fire it is, 0 to 1. */
interface Burning { key: string; kept: FireLoop; share: number }

/** What decides how a planned fire burns, wherever it is. */
export function fireShape(f: FirePlan): FireShape {
  return { tall: Math.round((f.height / f.r) * 10) / 10, quick: Math.round(Math.min(1.6, Math.max(0.4, Math.sqrt(CAMPFIRE / f.r))) * 20) / 20, sparks: f.sparks, seed: f.seed }
}

/**
 * The fires of a scene written as data (`SceneDoc.fires`), played as the scene plays: from the time alone.
 *
 * A scene repeats and can be shown at any moment of its loop in any order, so its fires can't be stepped along with
 * the clock. One whole loop of each is worked out here, once (`runFire`), and `show(t)` puts every tracer where the
 * loop has it at that moment. The tracers are blobs of an actor of their own beside the scene's (`actor`: glowing,
 * and `soft`, so they stay blobs among a Blocks scene's cubes), which the page hands the stage with the scene and
 * sends up again after each `show`. `shine` makes each fire's light as bright as the fire burns at that moment.
 */
export class SceneFire {
  /** Every fire's tracers as blobs on one still bone: hand it to the stage beside the scene. */
  readonly actor: Actor
  /** The fires it plays. */
  readonly plans: readonly FirePlan[]
  /** Seconds the scene's loop lasts. */
  readonly loop: number
  /** One kept loop a fire, burning in still air with nothing against it. */
  readonly kept: FireLoop[]
  /** How much of its fuel each fire burns just now, 1 with nothing against it and 0 when it is out (`under` moves it). */
  readonly fuel: number[]
  /** The ways each fire burns just now: one, or several while it changes. */
  private readonly burning: Burning[][]
  private fresh = true
  /** Each tracer's own heat at the moment on show, times how much of the fire its way of burning is. */
  private readonly hot: Float32Array
  private readonly heat: Float32Array
  /** What each blob is: 0 flame, 1 spark, 2 smoke, 3 an ember. */
  private readonly kind: Uint8Array

  constructor(scene: Pick<CompiledScene, 'fires' | 'loop'>) {
    this.plans = scene.fires
    this.loop = scene.loop
    this.kept = this.plans.map((f) => loopOf(fireShape(f), scene.loop, Infinity)!)
    this.fuel = this.plans.map(() => 1)
    this.burning = this.kept.map((kept) => [{ key: 'calm', kept, share: 1 }])
    const count = this.kept.reduce((n, k) => n + k.count * LAYERS + EMBERS, 0)
    this.hot = new Float32Array(count); this.heat = new Float32Array(count); this.kind = new Uint8Array(count)
    const glow = new Uint8Array(count).fill(255)
    let o = 0
    for (const k of this.kept) {
      for (let layer = 0; layer < LAYERS; layer++) for (let i = 0; i < k.count; i++, o++) { this.kind[o] = i < FIRE_FLAMES ? 0 : i < FIRE_FLAMES + FIRE_SPARKS ? 1 : 2; if (this.kind[o] === 2) glow[o] = 0 }
      for (let i = 0; i < EMBERS; i++, o++) this.kind[o] = 3
    }
    const blobs = new Blobs(count), mid = this.plans[0]?.at ?? [0, 0, 0]
    for (let k = 0; k < count; k++) blobs.push({ center: mid, scale: [1e-5, 1e-5, 1e-5], quat: [0, 0, 0, 1], color: [1, 1, 1], opacity: 0 })
    const skin = emptySkin(count)
    for (let k = 0; k < count; k++) setWeights(skin, k, [[0, 1]])
    this.actor = { blobs, skin, skeleton: new Skeleton([{ name: 'fire', parent: -1, head: [mid[0], mid[1], mid[2]] }]), soft: true, glow }
  }

  /**
   * Sets the fires under a sky, `seconds` after the last time it was told (Infinity, or the first time: at once).
   * Rain and wind take the fuel they burn (`fuelUnder`) and a fire dies down over `DIE` seconds, to nothing when it is
   * put out, and catches again over `CATCH`; the wind's level picks a loop played in that wind, so the flame is
   * really blown over, in the weather's own gusts. A loop not played yet is played a little each call and the fire
   * burns as it did until it is there. Call it before `show`; never called, the fires burn in still air.
   */
  under(sky: FireWeather, seconds: number) {
    const once = this.fresh || !Number.isFinite(seconds)
    this.fresh = false
    const until = once ? Infinity : performance.now() + PLAY_BUDGET
    const wanted = fuelUnder(sky), level = Math.min(FIRE_WIND.length - 1, Math.max(0, Math.round(sky.wind)))
    this.plans.forEach((plan, fi) => {
      const was = this.fuel[fi], base = fireShape(plan), calm = JSON.stringify(base)
      const ways = (fuel: number): Burning[] | undefined => {
        const out: Burning[] = []
        for (const b of burningAt(fuel)) {
          const shape = shapeUnder(base, level, b.fuel), key = JSON.stringify(shape)
          const kept = key === calm ? this.kept[fi] : loopOf(shape, this.loop, until)
          if (!kept) return undefined
          out.push({ key: key === calm ? 'calm' : key, kept, share: b.share })
        }
        return out
      }
      const fuel = once ? wanted : wanted < was ? Math.max(wanted, was - seconds / DIE) : Math.min(wanted, was + seconds / CATCH)
      // a loop not played yet: it burns as it did until it is, and the ones it is heading for are played meanwhile
      const want = ways(fuel)
      for (const stop of wanted < was ? [FUEL_LOW, FUEL_DYING, 0] : [FUEL_DYING, FUEL_LOW, 1]) if ((stop - fuel) * (stop - wanted) <= 0 && stop !== fuel) ways(stop)
      if (!want) return
      this.fuel[fi] = fuel
      const now = this.burning[fi], step = once ? 1 : seconds / CHANGE
      for (const w of want) if (!now.some((b) => b.key === w.key)) now.push({ ...w, share: 0 })
      for (let i = now.length - 1; i >= 0; i--) {
        const b = now[i], to = want.find((w) => w.key === b.key)?.share ?? 0
        b.share += Math.min(step, Math.max(-step, to - b.share))
        if (b.share <= 0 && to <= 0) now.splice(i, 1)
      }
    })
  }

  /**
   * Puts every tracer where it is `t` seconds into the loop: between the two kept moments either side, a blob as hot
   * as its gas, drawn longer along the way it is moving, as a lick of flame is, in the color of all the hot gas seen
   * through it from `eye` (with no eye, of its own heat).
   */
  show(t: number, eye?: ArrayLike<number>) {
    const { center, scale, quat, color, opacity } = this.actor.blobs
    let n = 0
    this.plans.forEach((plan, fi) => {
      const from = n, r = plan.r
      // the ways it burns just now, the most of it first: each is a layer of tracers, as big as its share of the fire
      const ways = [...this.burning[fi]].sort((x, y) => y.share - x.share), smoke = smokeAt(this.fuel[fi])
      for (let layer = 0; layer < LAYERS; layer++) {
      const way = ways[layer], k = way?.kept ?? this.kept[fi], share = way?.share ?? 0
      const at = (((t / k.loop) % 1) + 1) % 1 * k.frames, a = Math.floor(at) % k.frames, b = (a + 1) % k.frames, w = at - Math.floor(at)
      const per = k.frames / k.loop
      for (let i = 0; i < k.count; i++, n++) {
        const p = a * k.count + i, q = b * k.count + i, sa = k.size[p], sb = k.size[q]
        // out at either moment: it is let go again somewhere else between the two, so it is not drawn flying there
        const what = this.kind[n], part = what === 2 ? share * smoke : share
        if (part <= 0 || sa <= 0 || sb <= 0) { opacity[n] = 0; scale[n * 3] = scale[n * 3 + 1] = scale[n * 3 + 2] = 1e-5; center[n * 3] = plan.at[0]; center[n * 3 + 1] = plan.at[1]; center[n * 3 + 2] = plan.at[2]; continue }
        const ax = k.place[p * 3], ay = k.place[p * 3 + 1], az = k.place[p * 3 + 2]
        const dx = k.place[q * 3] - ax, dy = k.place[q * 3 + 1] - ay, dz = k.place[q * 3 + 2] - az
        center[n * 3] = plan.at[0] + (ax + dx * w) * r; center[n * 3 + 1] = plan.at[1] + (ay + dy * w) * r; center[n * 3 + 2] = plan.at[2] + (az + dz * w) * r
        const flame = what === 0, size = (sa + (sb - sa) * w) * r * (flame ? FLAME_SIZE : what === 2 ? SMOKE_SIZE : SPARK_SIZE) * Math.sqrt(part)
        // its long axis (its own y) lies along the way it moves
        const speed = Math.hypot(dx, dy, dz) * per, long = what === 2 ? 1 : 1 + Math.min(STRETCH_MOST, speed * STRETCH) * (flame ? 1 : 0.5)
        scale[n * 3] = size; scale[n * 3 + 1] = size * long; scale[n * 3 + 2] = size
        if (speed > 1e-4) {
          const ux = (dx * per) / speed, uy = (dy * per) / speed, uz = (dz * per) / speed
          // the turn that takes up onto (ux, uy, uz): about up × that way, by half the angle between them
          let qx = uz, qz = -ux, qw = 1 + uy
          if (qw < 1e-4) { qx = 1; qz = 0; qw = 0 }
          const len = Math.hypot(qx, qz, qw)
          quat[n * 4] = qx / len; quat[n * 4 + 1] = 0; quat[n * 4 + 2] = qz / len; quat[n * 4 + 3] = qw / len
        }
        this.heat[n] = k.heat[p] + (k.heat[q] - k.heat[p]) * w
        this.hot[n] = this.heat[n] * share
        opacity[n] = what === 2 ? SMOKE_OPACITY : 0.95
      }
      }
      // the embers lie on the bed whatever the flames do, each glowing and dimming in its own time, a whole number of times a loop
      const lowest = fireShape(plan).seed
      for (let i = 0; i < EMBERS; i++, n++) {
        const turn = hash(lowest + 31, i) * Math.PI * 2, far = Math.sqrt(hash(lowest + 37, i)) * EMBER_REACH * r
        center[n * 3] = plan.at[0] + Math.cos(turn) * far; center[n * 3 + 1] = plan.at[1] + r * 0.1; center[n * 3 + 2] = plan.at[2] + Math.sin(turn) * far
        const size = r * EMBER_SIZE * (0.7 + 0.6 * hash(lowest + 41, i))
        scale[n * 3] = size; scale[n * 3 + 1] = size * 0.5; scale[n * 3 + 2] = size
        quat[n * 4] = quat[n * 4 + 1] = quat[n * 4 + 2] = 0; quat[n * 4 + 3] = 1
        const times = 1 + Math.floor(hash(lowest + 43, i) * 4)
        this.heat[n] = this.hot[n] = 0.24 + 0.1 * Math.sin((t / this.loop * times + hash(lowest + 47, i)) * Math.PI * 2)
        opacity[n] = 0.95
      }
      // a flame is glowing gas you see into: how bright a spot looks is all the hot gas along the line of sight
      // through it, so its middle, where there is most behind, is brightest and its thin edges are deep orange
      for (let i = from; i < n; i++) {
        if (!opacity[i]) continue
        let heat = this.heat[i]
        if (this.kind[i] === 2) { color[i * 3] = SMOKE[0]; color[i * 3 + 1] = SMOKE[1]; color[i * 3 + 2] = SMOKE[2]; continue }
        if (eye && this.kind[i] === 0) {
          const px = center[i * 3], py = center[i * 3 + 1], pz = center[i * 3 + 2]
          let ex = eye[0] - px, ey = eye[1] - py, ez = eye[2] - pz
          const far = Math.hypot(ex, ey, ez) || 1
          ex /= far; ey /= far; ez /= far
          const reach = SIGHT * r, reach2 = reach * reach
          let column = 0
          for (let j = from; j < n; j++) {
            if (!opacity[j] || this.kind[j] !== 0) continue
            const vx = center[j * 3] - px, vy = center[j * 3 + 1] - py, vz = center[j * 3 + 2] - pz
            const along = vx * ex + vy * ey + vz * ez, off2 = vx * vx + vy * vy + vz * vz - along * along
            if (off2 >= reach2) continue
            const near = 1 - off2 / reach2
            column += this.hot[j] * near * near
          }
          heat = 1 - Math.exp(-column * DEPTH)
        }
        fireColor(heat, plan.colors, color, i * 3)
      }
    })
  }

  /**
   * The scene's lights with each fire's own as bright as the fire burns `t` seconds into the loop: its strength times
   * the fire's power at that moment beside its mean, in place of the flicker it was written with.
   */
  shine(lights: PointLight[], t: number): PointLight[] {
    const u = t / this.loop
    this.plans.forEach((plan, fi) => {
      // every way it burns just now gives its share of the light: a fire burning low gives less, one that is out none
      const full = this.kept[fi].mean || 1
      let power = EMBER_LIGHT * (1 - Math.min(1, this.fuel[fi] / FUEL_DYING))
      for (const way of this.burning[fi]) power += way.share * powerAt(way.kept, t) * Math.sqrt(way.kept.mean / full)
      for (const { index, flicker } of plan.lights) {
        const l = lights[index]
        if (!l) continue
        const k = power / flickerAt(flicker, u)
        lights[index] = { ...l, color: [l.color[0] * k, l.color[1] * k, l.color[2] * k] }
      }
    })
    return lights
  }
}
