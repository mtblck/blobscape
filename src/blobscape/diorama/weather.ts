import type { Rgb } from '../../splat-core/pixel.ts'
import type { Actor } from '../../splat-engine/engine.ts'
import { joinPalettes } from '../../splat-engine/project.ts'
import { compileScene, type CompiledScene } from '../../splat-engine/sceneDoc.ts'
import { FLASH_SKY, WEATHERS, WIND_WAY, cloudBase, windAt, WEATHER_COLORS, hazeUnder, isClear, lightUnder, lightningAt, showWeather, skyUnder, weatherBones, weatherDocs, type SkyState, type WeatherBones } from '../../splat-engine/skyRecipes.ts'
import { buildVoxels } from '../../splat-engine/voxel.ts'
import { makeSnowCover, pileSnow, warmthOf, type SnowCover } from '../../splat-engine/snowCover.ts'
import { ownClouds } from '../../splat-engine/heavens.ts'
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
const FALL_SPACING = 0.01, CLOUD_SPACING = 0.034

/** Where each recipe's rain ends in the swarm, so the pond's rings for the rain of a recipe are worked out whole. */
const RAIN_BANDS = [...new Set([...WEATHERS.map((w) => w.rain ?? 0).filter((r) => r > 0), 1])].sort((a, b) => a - b)

/** The snow lying is laid at least this far apart, and about this many blobs across the stretch it lies on. */
const COVER_SPACING = 0.012, COVER_ACROSS = 75
/** The least change in the depth of snow lying that is sent up again: it builds slowly, so a few times a second is enough. */
const PILE_STEP = 0.004

interface Layer { c: CompiledScene; actor: Actor; bones: WeatherBones }

/** The rain, snow and clouds for one scene: made once (it finds where every drop lands), then posed by time and sky. */
export class SceneWeather {
  /** The clouds, the rain, the snow, then the snow lying: drawn in the scene's world as `extras`. */
  readonly actors: Actor[]
  /** Resolves once the water's rain and wind are worked out (at once for a scene with no water). */
  readonly ready: Promise<void>
  /** The snow lying on the scene, which builds up while snow falls (`pile`). */
  readonly cover: SnowCover
  private readonly layers: { clouds: Layer; rain: Layer; snow: Layer }

  /** The share of the clouds the scene's own sky has out, whatever the weather. */
  private readonly own: number

  constructor(d: Diorama) {
    const clouds = d.heavens?.clouds
    this.own = ownClouds(d)
    // a scene that asks for clouds of its own colors has every cloud in them, so the few it has and a storm's many match
    const docs = weatherDocs(d.views[0].orbit, d.loop, { colors: clouds?.colors, glow: clouds?.glow })
    const ground = d.ground ?? ((_x: number, _z: number, _top: number, bottom: number) => bottom)
    // a scene with water of its own: rain that comes down on it rings it, as the scene's own rain does
    const pond = d.water?.()
    const layer = (doc: typeof docs.rain, spacing: number): Layer => {
      const c = compileScene(doc, { puffs: false, ground, water: pond?.plan.level })
      const actor = buildVoxels(c.spec(spacing)) as Actor
      // drawn as blocks, rain, snow and clouds are cubes too or stay blobs among them, as the look asks
      actor.weather = true
      return { c, actor, bones: weatherBones(c.bones.map((b) => b.name)) }
    }
    this.layers = { clouds: layer(docs.clouds, CLOUD_SPACING), rain: layer(docs.rain, FALL_SPACING), snow: layer(docs.snow, FALL_SPACING) }
    // the wind that comes with the weather roughens the water too, along the way the rain leans
    // (worked out a slice at a time, so the page carries on meanwhile)
    this.ready = pond ? pond.prepare(this.layers.rain.c.landed, RAIN_BANDS, WIND_WAY) : Promise.resolve()
    // snow lies wherever it lands, over the same stretch it falls on
    const view = d.views[0].orbit, [tx, ty, tz] = view.target, radius = Math.max(0.8, view.distance * 0.45)
    this.cover = makeSnowCover(ground, {
      x: tx, z: tz, radius, top: cloudBase(view), bottom: ty - view.distance, spacing: Math.max(COVER_SPACING, radius / COVER_ACROSS), sun: d.sun,
      dry: pond && ((x, y, z) => y <= pond.plan.level + 1e-3 && pond.plan.wet(x, z)),
      // a fire melts the snow round it as it lands
      warm: warmthOf(d.lights(0)),
    })
    // (a scene that gives no ground to land on has none)
    this.actors = [this.layers.clouds.actor, this.layers.rain.actor, this.layers.snow.actor, ...(this.cover.blobs.count ? [this.cover as Actor] : [])]
  }

  /** Sets how deep the snow lying is, 0 to 1. Returns whether it changed by enough to send up again (`Stage.reshape(cover)`). */
  pile(depth: number): boolean {
    const was = this.cover.depth
    if (Math.abs(depth - (Number.isNaN(was) ? -1 : was)) < PILE_STEP && depth !== 0 && depth !== 1) return false
    return pileSnow(this.cover, depth)
  }

  /** Poses both for `t` seconds under a sky. */
  pose(t: number, s: SkyState) {
    for (const [l, falls, clouds] of [[this.layers.clouds, 0, Math.max(s.clouds, this.own)], [this.layers.rain, s.rain, 0], [this.layers.snow, s.snow, 0]] as const) {
      const sk = l.actor.skeleton
      l.c.pose(sk, t)
      // what falls is blown by the wind of the moment, still landing where it was planned to
      if (falls) l.c.blow(sk, t, windAt(s, t, l.c.loop))
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
