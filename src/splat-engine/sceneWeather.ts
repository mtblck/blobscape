import type { Orbit } from '../splat-core/orbit.ts'
import type { Rgb } from '../splat-core/pixel.ts'
import type { Actor } from './engine.ts'
import { joinPalettes } from './project.ts'
import { compileScene, type CompiledScene } from './sceneDoc.ts'
import type { SceneWater } from './sceneWater.ts'
import { FLASH_SKY, WEATHERS, WIND_WAY, aboveView, cloudBase, windAt, WEATHER_COLORS, isClear, showWeather, skyUnder, weatherBones, weatherDocs, type SkyState, type WeatherBones } from './skyRecipes.ts'
import { buildVoxels } from './voxel.ts'
import { makeSnowCover, pileSnow, warmthOf, type SnowCover } from './snowCover.ts'
import { ownClouds, type HeavensDoc } from './heavens.ts'
import { under } from './timeOfDay.ts'

/**
 * Weather laid over a scene (skyRecipes.ts has the recipes): the rain, snow and clouds as actors of their own beside
 * the scene's, shown by the numbers of a sky that may be on its way from one weather to another. The scene itself is
 * never cut again for the weather.
 */

/** What the weather needs to know of the scene it is laid over. */
export interface WeatherScene {
  /** Seconds before the scene repeats: the weather's loop too. */
  loop: number
  /** The view the scene starts from: the clouds are laid out over it, and rain and snow fall over what it shows. */
  view: Orbit & { swing?: number }
  /** The scene's own sky (`SceneDoc.heavens`): its clouds' colors, and how many are out whatever the weather. */
  heavens?: HeavensDoc
  /** Where something falling comes to rest (`CompiledScene.ground`). Left out, nothing lands and no snow lies. */
  ground?: (x: number, z: number, top: number, bottom: number) => number
  /** The scene's water, which rain rings and wind roughens. */
  water?: SceneWater
  /** The way to the scene's sun, which shades snow lying on faces turned from it. */
  sun?: readonly [number, number, number]
  /** The scene's lights as it starts: snow melts round a warm one. */
  lights?: readonly { position: readonly number[]; color: readonly number[]; range: number }[]
}

/**
 * The grids the weather is cut on, whatever the scene's detail, so a drop and a flake are the same on every scene:
 * fine for what falls (a drop is fattened to its grid, and should stay a thin streak), coarse for the clouds.
 */
const FALL_SPACING = 0.01, CLOUD_SPACING = 0.034
/**
 * The clouds are laid out by the view, so they are cut coarser for a far view: at one spacing a far view's clouds took
 * over 200,000 blobs, enough to bring a phone down. From `CLOUD_VIEW` out, they are about the same count however far.
 */
const CLOUD_VIEW = 3.7

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
  private readonly square: { at: readonly [number, number]; half: number }
  /** Resolves once the water's rain and wind are worked out (at once for a scene with no water). */
  readonly ready: Promise<void>
  /** The snow lying on the scene, which builds up while snow falls (`pile`). */
  readonly cover: SnowCover
  private readonly layers: { clouds: Layer; rain: Layer; snow: Layer }

  /** The share of the clouds the scene's own sky has out, whatever the weather. */
  private readonly own: number
  /** The clouds' own colors, and the gray and dark they were last shaded for (`shade`). */
  private readonly cloudColors: Float32Array
  private shaded = [-1, -1]

  /** Whether the clouds are drawn over the scene; without them rain and snow come in from over the top of the picture. */
  readonly overhead: boolean

  constructor(d: WeatherScene, { overhead = true }: { overhead?: boolean } = {}) {
    const clouds = d.heavens?.clouds
    this.own = ownClouds(d)
    this.overhead = overhead
    const view0 = d.view, top = overhead ? cloudBase(view0) : aboveView(view0)
    // a scene that asks for clouds of its own colors has every cloud in them, so the few it has and a storm's many match
    const docs = weatherDocs(view0, d.loop, { colors: clouds?.colors, glow: clouds?.glow }, top)
    const ground = d.ground ?? ((_x: number, _z: number, _top: number, bottom: number) => bottom)
    // a scene with water of its own: rain that comes down on it rings it, as the scene's own rain does
    const pond = d.water
    const layer = (doc: typeof docs.rain, spacing: number): Layer => {
      const c = compileScene(doc, { puffs: false, ground, water: pond?.plan.level })
      const actor = buildVoxels(c.spec(spacing)) as Actor
      // drawn as blocks, rain, snow and clouds are cubes too or stay blobs among them, as the look asks
      actor.weather = true
      return { c, actor, bones: weatherBones(c.bones.map((b) => b.name)) }
    }
    this.layers = { clouds: layer(docs.clouds, CLOUD_SPACING * Math.max(1, view0.distance / CLOUD_VIEW)), rain: layer(docs.rain, FALL_SPACING), snow: layer(docs.snow, FALL_SPACING) }
    const cb = this.layers.clouds.actor.blobs
    this.cloudColors = cb.color.slice(0, cb.count * 3)
    // the wind that comes with the weather roughens the water too, along the way the rain leans
    // (worked out a slice at a time, so the page carries on meanwhile)
    this.ready = pond ? pond.prepare(this.layers.rain.c.landed, RAIN_BANDS, WIND_WAY) : Promise.resolve()
    // snow lies wherever it lands, over the same stretch it falls on
    const view = d.view, [tx, ty, tz] = view.target, radius = Math.max(0.8, view.distance * 0.45)
    // the square rain and snow fall over (`falling`): blown out of it, they come in at its other side
    this.square = { at: [tx, tz], half: radius }
    this.cover = makeSnowCover(ground, {
      x: tx, z: tz, radius, top, bottom: ty - view.distance, spacing: Math.max(COVER_SPACING, radius / COVER_ACROSS), sun: d.sun,
      dry: pond && ((x, y, z) => y <= pond.plan.level + 1e-3 && pond.plan.wet(x, z)),
      // a fire melts the snow round it as it lands
      warm: warmthOf(d.lights ?? []),
    })
    // (a scene that gives no ground to land on has none)
    this.actors = [this.layers.clouds.actor, this.layers.rain.actor, this.layers.snow.actor, ...(this.cover.blobs.count ? [this.cover as Actor] : [])]
  }

  /** Sets how deep the snow lying is, 0 to 1. Returns whether it changed by enough to send up again (`Stage.reshape(cover)`). */
  pile(depth: number): boolean {
    // a scene with nothing still to lie on (the sky islands all drift) has no cover on the stage to send up: handing
    // the stage one froze the isles a moment after they loaded (Matt, 2026-11-22)
    if (!this.cover.blobs.count) return false
    const was = this.cover.depth
    if (Math.abs(depth - (Number.isNaN(was) ? -1 : was)) < PILE_STEP && depth !== 0 && depth !== 1) return false
    return pileSnow(this.cover, depth)
  }

  /**
   * Turns the clouds as gray and dark as the sky they are in (`skyUnder`'s gray), so a heavy cover reads as cloud, not
   * as a sky of a scene's own dusk-blue clouds. Returns whether they changed by enough to send up again
   * (`Stage.reshape(actors[0])`).
   */
  shade(s: SkyState): boolean {
    if (Math.abs(s.gray - this.shaded[0]) < 0.01 && Math.abs(s.dark - this.shaded[1]) < 0.01) return false
    this.shaded = [s.gray, s.dark]
    const to = this.layers.clouds.actor.blobs.color, from = this.cloudColors
    for (let k = 0; k < from.length; k += 3) {
      const g = skyUnder([from[k] * 255, from[k + 1] * 255, from[k + 2] * 255], { ...s, lightning: 0 })
      for (let c = 0; c < 3; c++) to[k + c] = g[c] / 255
    }
    return true
  }

  /** Poses both for `t` seconds under a sky. */
  pose(t: number, s: SkyState) {
    for (const [l, falls, clouds] of [[this.layers.clouds, 0, this.overhead ? Math.max(s.clouds, this.own) : 0], [this.layers.rain, s.rain, 0], [this.layers.snow, s.snow, 0]] as const) {
      const sk = l.actor.skeleton
      l.c.pose(sk, t)
      // what falls is blown by the wind of the moment, still landing where it was planned to
      if (falls) l.c.blow(sk, t, windAt(s, t, l.c.loop), this.square)
      showWeather(sk.size, l.bones, falls, clouds)
      sk.update()
    }
  }
}

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
