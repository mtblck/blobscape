import { Blobs } from '../splat-core/blobs.ts'
import type { Actor, PointLight } from './engine.ts'
import { Skeleton, emptySkin, setWeights } from './rig.ts'
import { flickerAt, type CompiledScene, type FirePlan } from './sceneDoc.ts'
import { FIRE_FLAMES, fireColor, powerAt, runFire, type FireLoop, type FireShape } from './fire.ts'

/** A flame tracer's size at its biggest, and a spark's, in bed radii. */
const FLAME_SIZE = 0.2, SPARK_SIZE = 0.07
/** How much longer than wide a tracer is drawn for each bed radius a second it moves, and the most. */
const STRETCH = 0.16, STRETCH_MOST = 1.6
/** How far to the side of a line of sight gas still counts toward what is seen along it, in bed radii, and how quickly hot gas along it adds up to white heat. */
const SIGHT = 0.3, DEPTH = 0.12
/** The bed radius of a campfire, which burns at the simulation's own pace (`FireShape.quick` 1). */
const CAMPFIRE = 0.11

/** Loops already played, by shape and length: a scene set in another time of day, or the same fire set down twice, plays nothing again. */
const played = new Map<string, FireLoop>()

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
  /** One kept loop a fire. */
  readonly kept: FireLoop[]
  /** Each tracer's own heat at the moment on show. */
  private readonly hot: Float32Array

  constructor(scene: Pick<CompiledScene, 'fires' | 'loop'>) {
    this.plans = scene.fires
    this.loop = scene.loop
    this.kept = this.plans.map((f) => {
      const shape = fireShape(f), key = `${JSON.stringify(shape)}/${scene.loop}`
      let k = played.get(key)
      if (!k) played.set(key, (k = runFire(shape, scene.loop)))
      return k
    })
    const count = this.kept.reduce((n, k) => n + k.count, 0)
    this.hot = new Float32Array(count)
    const blobs = new Blobs(count), mid = this.plans[0]?.at ?? [0, 0, 0]
    for (let k = 0; k < count; k++) blobs.push({ center: mid, scale: [1e-5, 1e-5, 1e-5], quat: [0, 0, 0, 1], color: [1, 1, 1], opacity: 0 })
    const skin = emptySkin(count)
    for (let k = 0; k < count; k++) setWeights(skin, k, [[0, 1]])
    this.actor = { blobs, skin, skeleton: new Skeleton([{ name: 'fire', parent: -1, head: [mid[0], mid[1], mid[2]] }]), soft: true, glow: new Uint8Array(count).fill(255) }
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
      const from = n
      const k = this.kept[fi], at = (((t / k.loop) % 1) + 1) % 1 * k.frames, a = Math.floor(at) % k.frames, b = (a + 1) % k.frames, w = at - Math.floor(at)
      const r = plan.r, per = k.frames / k.loop
      for (let i = 0; i < k.count; i++, n++) {
        const p = a * k.count + i, q = b * k.count + i, sa = k.size[p], sb = k.size[q]
        // out at either moment: it is let go again somewhere else between the two, so it is not drawn flying there
        if (sa <= 0 || sb <= 0) { opacity[n] = 0; scale[n * 3] = scale[n * 3 + 1] = scale[n * 3 + 2] = 1e-5; center[n * 3] = plan.at[0]; center[n * 3 + 1] = plan.at[1]; center[n * 3 + 2] = plan.at[2]; continue }
        const ax = k.place[p * 3], ay = k.place[p * 3 + 1], az = k.place[p * 3 + 2]
        const dx = k.place[q * 3] - ax, dy = k.place[q * 3 + 1] - ay, dz = k.place[q * 3 + 2] - az
        center[n * 3] = plan.at[0] + (ax + dx * w) * r; center[n * 3 + 1] = plan.at[1] + (ay + dy * w) * r; center[n * 3 + 2] = plan.at[2] + (az + dz * w) * r
        const flame = i < FIRE_FLAMES, size = (sa + (sb - sa) * w) * r * (flame ? FLAME_SIZE : SPARK_SIZE)
        // its long axis (its own y) lies along the way it moves
        const speed = Math.hypot(dx, dy, dz) * per, long = 1 + Math.min(STRETCH_MOST, speed * STRETCH) * (flame ? 1 : 0.5)
        scale[n * 3] = size; scale[n * 3 + 1] = size * long; scale[n * 3 + 2] = size
        if (speed > 1e-4) {
          const ux = (dx * per) / speed, uy = (dy * per) / speed, uz = (dz * per) / speed
          // the turn that takes up onto (ux, uy, uz): about up × that way, by half the angle between them
          let qx = uz, qz = -ux, qw = 1 + uy
          if (qw < 1e-4) { qx = 1; qz = 0; qw = 0 }
          const len = Math.hypot(qx, qz, qw)
          quat[n * 4] = qx / len; quat[n * 4 + 1] = 0; quat[n * 4 + 2] = qz / len; quat[n * 4 + 3] = qw / len
        }
        this.hot[n] = k.heat[p] + (k.heat[q] - k.heat[p]) * w
        opacity[n] = 0.95
      }
      // a flame is glowing gas you see into: how bright a spot looks is all the hot gas along the line of sight
      // through it, so its middle, where there is most behind, is brightest and its thin edges are deep orange
      const flames = from + FIRE_FLAMES
      for (let i = from; i < n; i++) {
        if (!opacity[i]) continue
        let heat = this.hot[i]
        if (eye && i < flames) {
          const px = center[i * 3], py = center[i * 3 + 1], pz = center[i * 3 + 2]
          let ex = eye[0] - px, ey = eye[1] - py, ez = eye[2] - pz
          const far = Math.hypot(ex, ey, ez) || 1
          ex /= far; ey /= far; ez /= far
          const reach = SIGHT * r, reach2 = reach * reach
          let column = 0
          for (let j = from; j < flames; j++) {
            if (!opacity[j]) continue
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
      const power = powerAt(this.kept[fi], t)
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
