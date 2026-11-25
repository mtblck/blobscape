import { lightningAt, hazeUnder, lightUnder, skyUnder, type SkyState } from '../../splat-engine/skyRecipes.ts'
import { SceneWeather as Weather } from '../../splat-engine/sceneWeather.ts'
import type { Diorama } from './scenes.ts'

export { paletteUnder } from '../../splat-engine/sceneWeather.ts'

/** The engine's `SceneWeather` for a Diorama scene: its rain, snow and clouds, made once and posed by time and sky. */
export class SceneWeather extends Weather {
  constructor(d: Diorama, options: { overhead?: boolean } = {}) {
    super({ loop: d.loop, view: d.views[0].orbit, heavens: d.heavens, ground: d.ground, lying: d.lying, bones: d.bones, water: d.water?.(), sun: d.sun, lights: d.lights(0) }, options)
  }
}

type Light = number | readonly [number, number, number]

/**
 * A scene as it stands under a sky that `sky()` gives for the moment: its light multiplied, its sky grayed and
 * darkened, lightning in both, and haze by the view's distance. Everything else is the scene's own, so the page draws
 * it as it would any scene whose sky and light change as it plays.
 */
export function underSky(d: Diorama, sky: () => SkyState, calm = false): Diorama {
  const flash = (t: number, s: SkyState) => (s.lightning > 0 && !calm ? lightningAt(t, d.loop) : 0)
  return {
    ...d,
    ambientAt: (t) => {
      const s = sky(), base: Light = d.ambientAt?.(t) ?? d.ambient ?? 1, l = lightUnder(s, flash(t, s))
      const b = typeof base === 'number' ? [base, base, base] : base
      return [b[0] * l[0], b[1] * l[1], b[2] * l[2]]
    },
    skyAt: (t) => {
      const s = sky(), [top, low] = d.skyAt?.(t) ?? d.sky, f = flash(t, s)
      return [skyUnder(top, s, f), skyUnder(low, s, f)]
    },
    hazeAt: (distance) => {
      const s = sky(), h = hazeUnder(s, distance)
      if (!h) return d.haze
      // the air is the color of the sky low down, so what is far fades into it
      const low = skyUnder((d.skyAt?.(0) ?? d.sky)[1], s).map((v) => linear(v / 255)) as [number, number, number]
      return { color: low, from: Math.min(h.from, d.haze?.from ?? Infinity), to: Math.min(h.to, d.haze?.to ?? Infinity) }
    },
  }
}

const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
