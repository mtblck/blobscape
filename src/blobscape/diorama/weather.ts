import type { Rgb } from '../../splat-core/pixel.ts'
import type { Actor } from '../../splat-engine/engine.ts'
import { joinPalettes } from '../../splat-engine/project.ts'
import { compileScene, type CompiledScene } from '../../splat-engine/sceneDoc.ts'
import { FLASH_SKY, WEATHER_COLORS, hazeUnder, isClear, lightUnder, lightningAt, showWeather, skyUnder, weatherBones, weatherDocs, type SkyState, type WeatherBones } from '../../splat-engine/skyRecipes.ts'
import { buildVoxels } from '../../splat-engine/voxel.ts'
import { under } from '../timeOfDay.ts'
import type { Diorama } from './scenes.ts'

/**
 * Weather laid over a Pixel Diorama scene (splat-engine/skyRecipes.ts has the recipes): the rain, snow and clouds as
 * three actors of their own beside the scene's, and the scene as it stands under a sky that may be on its way from one
 * weather to another. The scene itself is never cut again for the weather.
 */

/**
 * The grids the weather is cut on, whatever the scene's detail, so a drop and a flake are the same on every scene:
 * fine for what falls (a drop is fattened to its grid, and should stay a thin streak), coarse for the clouds.
 */
const FALL_SPACING = 0.017, CLOUD_SPACING = 0.034

interface Layer { c: CompiledScene; actor: Actor; bones: WeatherBones }

/** The rain, snow and clouds for one scene: made once (it finds where every drop lands), then posed by time and sky. */
export class SceneWeather {
  /** The clouds, the rain, then the snow: drawn in the scene's world as `extras`. */
  readonly actors: Actor[]
  private readonly layers: { clouds: Layer; rain: Layer; snow: Layer }

  constructor(d: Diorama) {
    const docs = weatherDocs(d.views[0].orbit, d.loop)
    const ground = d.ground ?? ((_x: number, _z: number, _top: number, bottom: number) => bottom)
    const layer = (doc: typeof docs.rain, spacing: number): Layer => {
      const c = compileScene(doc, { puffs: false, ground })
      const actor = buildVoxels(c.spec(spacing)) as Actor
      // drawn as blocks, rain, snow and clouds stay blobs among the cubes
      actor.soft = true
      return { c, actor, bones: weatherBones(c.bones.map((b) => b.name)) }
    }
    this.layers = { clouds: layer(docs.clouds, CLOUD_SPACING), rain: layer(docs.rain, FALL_SPACING), snow: layer(docs.snow, FALL_SPACING) }
    this.actors = [this.layers.clouds.actor, this.layers.rain.actor, this.layers.snow.actor]
  }

  /** Poses both for `t` seconds under a sky. */
  pose(t: number, s: SkyState) {
    for (const [l, falls, clouds] of [[this.layers.clouds, 0, s.clouds], [this.layers.rain, s.rain, 0], [this.layers.snow, s.snow, 0]] as const) {
      const sk = l.actor.skeleton
      l.c.pose(sk, t)
      showWeather(sk.size, l.bones, falls, clouds)
      sk.update()
    }
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
const hex = (c: readonly number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

/**
 * A palette for a scene under a sky: its colors as that light leaves them and the sky's own first, then the weather's
 * (cloud, rain, snow) and its own as they were, joined down to what a palette holds. Pixel art snaps to it.
 */
export function paletteUnder(colors: readonly Rgb[], sky: readonly (readonly number[] | number | undefined)[], s: SkyState): Rgb[] {
  if (isClear(s)) return [...colors]
  const lit = s.light.map((v) => Math.min(1, v))
  const skies = [skyUnder(sky[0] as readonly number[], s), skyUnder(sky[1] as readonly number[], s)]
  // halfway between, so the haze has a step to fade through
  const between = [0, 1, 2].map((k) => (skies[0][k] + skies[1][k]) / 2)
  const first = [...skies.map(hex), hex(between), ...colors.map((c) => hex(under(c, lit)))]
  const falls = WEATHER_COLORS.map((h) => hex(under([parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)], lit)))
  return joinPalettes([first, [...falls, ...(s.lightning ? [hex(FLASH_SKY)] : [])], colors.map(hex)])
}
