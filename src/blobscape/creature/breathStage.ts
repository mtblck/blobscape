import type { Clip } from '../../splat-engine/glb.ts'
import type { Skeleton, Skin } from '../../splat-engine/rig.ts'
import type { Blobs } from '../../splat-core/blobs.ts'
import type { OpticsLook } from '../../splat-core/optics.ts'
import { BREATH, dragonBreath } from '../../splat-engine/zoo/dragon.ts'
import { BreathShow, DUSK } from './breath.ts'
import type { CreatureStage } from './stage.ts'

/** The lens the dragon is seen through: nothing out of focus, and light well over white spilling round itself. */
const FLAME_LENS: OpticsLook = { focus: 10, fNumber: 0, glow: 1.1, knee: 2, shoulder: 0.7 }
/** How many times its own color the breath is drawn while the lens is on, so it is the one thing bright enough to glow. */
const FLAME_GAIN = 5

/** What a page may leave off of the dragon's breath. */
export interface BreathChoices {
  /** The flame's light casts shadows (WebGPU only): on unless false. */
  shadows?: boolean
  /** The lens that lets the flame glow (WebGPU only): on unless false. */
  glow?: boolean
}

/**
 * Puts the dragon on a stage with everything its breath does (breath.ts): a floor of blobs in place of the grid,
 * live lights in a dusk, sparks and smoke, and on WebGPU shadows and a lens through which only the breath glows.
 * `breathing` says whether the move playing is the breath. Sprite sheets and files still get the dragon alone.
 */
export function stageBreath(stage: CreatureStage, body: { blobs: Blobs; skin: Skin; skeleton: Skeleton }, clip: Clip | undefined, look: string, breathing: () => boolean, choices: BreathChoices = {}): BreathShow {
  const gpu = stage.backend === 'webgpu'
  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  const show = new BreathShow(dragonBreath(look), { spacing: coarse ? 0.11 : 0.085, shadows: gpu && choices.shadows !== false })
  const lens = gpu && choices.glow !== false
  stage.useLights(true)
  stage.setLens(lens ? FLAME_LENS : undefined)
  stage.setGlowGain(lens ? FLAME_GAIN : 1)
  stage.setLights([], DUSK)
  stage.setFloor(0)
  stage.setActor(body, clip, show.extras)
  let last = NaN
  stage.setAfter((sk, t) => {
    const on = breathing()
    // the time since the last pose, by the move's own clock (so pausing and the speed slider hold), across its loop's seam
    let dt = t - last
    if (!(dt >= 0)) dt = on && dt > -BREATH ? dt + BREATH : 0
    last = t
    const f = show.step(sk, on ? t : null, Math.min(0.1, dt))
    stage.setLights(f.lights, DUSK)
    if (f.repaint) stage.recolor(show.floor)
  })
  return show
}

/** Takes the breath's lights and lens off a stage, before a creature that has none is shown. */
export function stagePlain(stage: CreatureStage) {
  stage.useLights(false)
  stage.setLens(undefined)
  stage.setGlowGain(1)
  stage.setLights([], 1)
}
