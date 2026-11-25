import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Orbit } from '../splat-core/view.ts'
import { Magnifier, TourStrip } from './diorama/HowItsMade.tsx'
import { TOUR, clay, kept } from './diorama/tour.ts'
import type { CelLook } from '../splat-core/cel.ts'
import { countColors, darkest, type PixelLook } from '../splat-core/pixel.ts'
import type { Built } from '../splat-engine/body.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { castBy, glowGain } from './diorama/glow.ts'
import { ScenePicker } from './diorama/ScenePicker.tsx'
import { stepped } from './diorama/pick.ts'
import { Button, Chip, Field } from '../shared/ui.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import { href } from './routes.ts'
import type { CreatureStage } from './creature/stage.ts'
import { TAB_SECTIONS, ViewPopup, Workbench } from '../shared/Workbench.tsx'
import { DETAIL, PALETTES } from './diorama/scene.ts'
import { DIORAMAS, described, sceneOf, type Diorama } from './diorama/scenes.ts'
import { SceneDetails, kilobytes, type SceneFacts } from './diorama/SceneDetails.tsx'
import type { Skeleton } from '../splat-engine/rig.ts'
import { Pokes } from '../splat-engine/poke.ts'
import { levelPlane, type MirrorImage } from '../splat-engine/reflect.ts'
import type { SceneWater } from '../splat-engine/sceneWater.ts'
import { toPng, useExport } from './diorama/useExport.tsx'
import type { Texture } from '../splat-engine/meshShape.ts'
import { decodeTexture } from './modelRig.ts'
import { writeDetail } from '../shared/detail.ts'
import { banded, hugged, unlit } from '../splat-engine/voxel.ts'
import { DEFAULT_STYLE, isPixelStyle, styleAsked, styleWords, type Style } from './diorama/styles.ts'
import { GLITCH_START, glitchLook, type GlitchChoice } from './glitchLooks.ts'
import { StyleControls, FinishControls } from './StyleControls.tsx'
import { TimeControls, WeatherControls } from './styles/SceneControls.tsx'
import { drawnStart, sceneStart, type DrawnSettings, type SceneSettings } from './styles/catalog.ts'
import { detailStart, pixelCelLook, pixelFlags, pixelFor, pixelLookOf, pixelSizeAt, pixelStart, pixelZoomAsked, type PixelSettings } from './styleSettings.ts'
import { useStyleOnStage } from './useStyleOnStage.ts'
import { useDrawnLook, useHeld, wantsPlain } from './drawnLook.tsx'
import { timeOf, type TimeId } from './timeOfDay.ts'
import { SkyEase, gloomy, isClear, skyState, windAt, type CloudId, type WeatherId, type WindId } from '../splat-engine/skyRecipes.ts'
import { SceneWeather, paletteUnder, underSky } from './diorama/weather.ts'
import { pileStep } from '../splat-engine/snowCover.ts'
import { heavenBones, ownClouds, showHeavens } from '../splat-engine/heavens.ts'
import { download } from './files.ts'
import { blocksToMesh } from '../splat-engine/blockMesh.ts'
import { TRANSITIONS, type TransitionKind } from '../splat-core/transition.ts'
import { TransitionOverlay } from './diorama/transitionOverlay.ts'
import { watchDraws } from '../splat-core/drawn.ts'
import { paintView } from '../shared/record.ts'
import { blobsToMesh } from '../splat-engine/mesh.ts'
import { recordClip, writeRiggedMeshGlb } from '../splat-engine/glb.ts'
import { Skeleton as Bones } from '../splat-engine/rig.ts'

declare global {
  interface Window { __diorama?: { stage: CreatureStage; blobs: () => number; bones: () => number; look: () => PixelLook; style: Style; water: () => SceneWater | undefined; mirrored: boolean; finish: (set: { bands?: number; heat?: number; selout?: boolean; exact?: boolean }) => void } }
}

/** The view `orbit`, rocked `swing` degrees to either side once every `loop` seconds, as it is at `t`. */
const swung = (orbit: Orbit, swing: number, loop: number, t: number): Orbit => (swing ? { ...orbit, azimuth: orbit.azimuth + Math.sin((t / loop) * Math.PI * 2) * swing } : orbit)


/**
 * Diorama: a small scene written as shapes in code, cut into a grid of
 * solid blobs (splat-engine/voxel.ts), moved by bones, and drawn as pixel art
 * by the engine's pixel mode (splat-engine/pixelPass.ts): the scene rendered
 * small, snapped to a palette, and scaled up in whole pixels.
 */
/** How often at most the picture on show is copied while the next scene is cut, for the transition to start from (ms). */
const KEEP_EVERY = 250

/** What one blob holds: a center, three sizes, a facing, a color and an opacity, each number four bytes. */
const BLOB_BYTES = (3 + 3 + 4 + 3 + 1) * 4


/** Where the eye is for a view. */
const eyeOf = (o: Orbit): [number, number, number] => { const a = (o.azimuth * Math.PI) / 180, e = (o.elevation * Math.PI) / 180; return [o.target[0] + o.distance * Math.sin(a) * Math.cos(e), o.target[1] + o.distance * Math.sin(e), o.target[2] + o.distance * Math.cos(a) * Math.cos(e)] }

export function PixelDiorama() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<CreatureStage>()
  // water mirrors the scene where the GPU sorts (WebGPU); `?mirror=0` leaves it the sky alone
  const mirrored = stage?.backend === 'webgpu' && new URLSearchParams(location.search).get('mirror') !== '0'
  const [drawn, setDrawn] = useState(false)
  // Whether a frame holding the scene that is in the view now has really been drawn. Handing a cut scene to the stage
  // is not the end of the wait: its buffers have to be filled, its cubes made and its shaders built, which on a phone
  // took seconds after the waiting mark had gone (Matt, 2026-11-25), so the mark stays up until `shown()` resolves.
  const [seenBuilt, setSeenBuilt] = useState<Built>()
  /** The built scene the stage was last given, so only a new cut waits for a frame (a switch like Rock the view does not). */
  const given = useRef<Built | undefined>(undefined)
  const [failed, setFailed] = useState<string>()
  const offscreen = useMemo(() => new URLSearchParams(location.search).get('offscreen') === '1', [])
  const webgl = useMemo(() => new URLSearchParams(location.search).get('webgl') === '1', [])
  const calm = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const coarse = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches, [])
  // ?scene=campfire opens on that scene
  const [which, setWhich] = useState(() => DIORAMAS.find((d) => d.id === new URLSearchParams(location.search).get('scene'))?.id ?? DIORAMAS[0].id)
  // a model the visitor opened, as one more scene (it stays in this page only)
  const [model, setModel] = useState<Diorama>()
  const [opening, setOpening] = useState(false)
  const [modelNote, setModelNote] = useState('')
  const modelInput = useRef<HTMLInputElement>(null)
  const scenes = model ? [...DIORAMAS, model] : DIORAMAS
  const picked0 = scenes.find((d) => d.id === which) ?? DIORAMAS[0]
  /**
   * The time of day the scene is set in (`?time=night`), or none for the scene as it is written: a setting of the
   * scene, which every style respects (Matt, 2026-11-21). It brings its sky and light, and the scene's lamps, lit
   * windows and fires go by it (`Diorama.timed`).
   */
  const [sceneSet, setSceneSet] = useState<SceneSettings>(() => sceneStart(new URLSearchParams(location.search)))
  const time = sceneSet.time || undefined
  const setTime = (id: TimeId | undefined) => setSceneSet((c) => ({ ...c, time: id ?? '' }))
  /**
   * The weather and the cloud cover laid over the scene (`?weather=thunderstorm`, `?clouds=cloudy`), or none: recipes
   * every scene takes the same way (Matt, 2026-11-21; splat-engine/skyRecipes.ts). They are laid over the scene, so it
   * is not cut again for them, and the sky eases from one to the next.
   */
  const weatherPick = sceneSet.weather || undefined, cloudsPick = sceneSet.clouds || undefined
  const setWeather = (id: WeatherId | 'none' | undefined) => setSceneSet((c) => ({ ...c, weather: id ?? '' }))
  const setClouds = (id: CloudId | undefined) => setSceneSet((c) => ({ ...c, clouds: id ?? '' }))
  // out in space (the space whales) there is no weather: what was picked waits for the next scene that has a sky
  const clouds = picked0.space ? undefined : cloudsPick
  // a scene may start under a shared weather of its own (the koi pond's light rain) until another, or none, is picked
  const weather: WeatherId | undefined = picked0.space || weatherPick === 'none' ? undefined : weatherPick ?? (clouds ? undefined : picked0.weather)
  /** The wind (`?wind=gale`): weather brings at least its own; it slants what falls and raises waves on water. */
  const windPick = sceneSet.wind || undefined
  const setWind = (id: WindId | undefined) => setSceneSet((c) => ({ ...c, wind: id ?? '' }))
  const wind = picked0.space ? undefined : windPick
  /**
   * Whether the weather's clouds float over the scene (`?overhead=0` leaves them out, and rain and snow fall in from
   * over the top of the picture): a scene may start without them, as the koi pond does (Matt, 2026-11-21).
   */
  const overheadPick = sceneSet.overhead ?? undefined
  const setOverhead = (on: boolean) => setSceneSet((c) => ({ ...c, overhead: on }))
  const overhead = overheadPick ?? picked0.overhead ?? true
  // a storm by day is dark enough that lamps waiting for the dark come on: the one thing weather cuts the scene again for
  const diorama = time ? picked0.timed?.(time, gloomy(weather) && !timeOf(time).dark ? 'always' : undefined) ?? picked0 : picked0
  /** The scene whose palette, finish and view are set. */
  const dressed = useRef(which)
  /** The scene picker: the modal of every scene's card. */
  const [picking, setPicking] = useState(false)
  const [playing, setPlaying] = useState(!calm)
  // a phone starts a step lighter, and a step lighter again for the styles that draw the scene several times a frame
  // (outlines, ASCII, cel shading), as Brush and Ink does; once the visitor picks a detail it is theirs for every style
  const chosen = sceneSet.detail || undefined
  const setChosen = (id: string) => setSceneSet((c) => ({ ...c, detail: id }))
  /** How the scene is drawn: as pixel art, or as one of Brush and Ink's looks. `?style=oil` opens on that one. */
  const [style, setStyle] = useState<Style>(() => { const q = new URLSearchParams(location.search); return styleAsked(q.get('style'), q.get('chars')) })
  const [glitch, setGlitch] = useState<GlitchChoice>(GLITCH_START)
  // every other style's settings (styles/catalog.ts): the page holds them, as it holds pixel art's
  const drawnKept = useState<DrawnSettings>(() => drawnStart(new URLSearchParams(location.search), { coarse }))
  /**
   * Light worked out a pixel at a time (`?shade=1`): pixel art made from a picture cel shading lit, so light and shade
   * fall in bands that follow each form, not blob by blob as the baked light does.
   */
  /**
   * Pixel art's settings and the finish (styleSettings.ts, shared with Scene Creator): the scene's own finish unless
   * the address says (`?px=`, `?glow=`, `?texel=`, `?shade=1`, `?steps=`, `?heat=`, …).
   */
  const [fin, setFin] = useState<PixelSettings>(() => pixelStart(diorama.finish, new URLSearchParams(location.search)))
  const setPixel = useCallback((change: Partial<PixelSettings>) => setFin((f) => ({ ...f, ...change })), [])
  const { palette, texel, glow, outline, rock, steps, rate, exact, shade: shaded } = fin
  /** Switches only the address turns off (`?steady=0`, `?calm=0`, …). */
  const [flags] = useState(() => pixelFlags(new URLSearchParams(location.search)))
  // cel shading lights the blobs itself, so its scene is cut with no light baked in; so does pixel art shaded a pixel at a time
  const plain = isPixelStyle(style) ? shaded : wantsPlain(style)
  // the detail each style starts at is the same on every page (styleSettings.ts `detailStart`)
  const detail = chosen ?? DETAIL[detailStart(style, coarse)].id
  // discs along a shape's outer edges fitted to the edge (`hugged`), so edges are straight and lines sit on them; `?hug=0`
  const [hug] = useState(() => new URLSearchParams(location.search).get('hug') !== '0')
  /** Glow as the poser reads it: it scales the light the scene's lamps and fires cast, as well as the shine round bright pixels. */
  const glowNow = useRef(glow)
  glowNow.current = glow
  const [view, setView] = useState(diorama.views[0].id)
  const [orbit, setOrbit] = useState<Orbit>(diorama.views[0].orbit)
  const [art, setArt] = useState<{ width: number; height: number }>()
  /** The 3D model export: blocks on the scene's grid (and how many grid cells a block is) or a smooth surface. */
  const [modelShape, setModelShape] = useState<'blocks' | 'smooth'>('blocks')
  const [blockSize, setBlockSize] = useState(2)
  const [glbNote, setGlbNote] = useState('')
  const [modelBusy, setModelBusy] = useState(false)
  /** How one scene gives way to the next (`splat-core/transition.ts`), or a plain cut; never under reduced motion. */
  const transition = sceneSet.transition
  const setTransition = (id: TransitionKind | 'cut') => setSceneSet((c) => ({ ...c, transition: id }))
  const changing = useRef<{ stop: () => void; sheet: HTMLCanvasElement; got: boolean } | null>(null)
  const overlayCanvas = useRef<HTMLCanvasElement>(null)
  const overlayOf = useRef<TransitionOverlay | null>(null)
  const [passing, setPassing] = useState(false)

  // built after a paint, so the waiting mark shows first
  const [made, setScene] = useState<{ built: Built; of: Diorama; detail: string; paint: string; plain: boolean }>()
  // Painting in steps happens as a scene is cut, in the palette picked. While another scene is being cut the controls
  // are still the old one's, so the new one is cut with its own palette and its own choice, which it then brings along.
  const settled = !made || sceneOf(made.of) === sceneOf(diorama)
  const paintId = settled ? palette : 'own'
  const stepColors = (settled ? steps : diorama.finish.steps) ? (paintId === 'own' ? diorama.palette.colors : PALETTES.find((p) => p.id === paintId)?.colors ?? []) : []
  const paint = stepColors.length ? paintId : ''
  // the scene asked for, once it is cut: until then the loading note (and its announcement) shows
  const scene = made?.of === diorama && made.detail === detail && made.paint === paint && made.plain === plain ? made : undefined
  // what is in the view now: the last scene built, which lags the one picked while it is being cut.
  // It is kept until the new one replaces it, so the old scene never wears the new one's palette or sky.
  const cutShown = made?.of ?? diorama
  /** The sky on its way to the weather asked for, and the clock it goes by (none off screen and in an export: it is there at once). */
  const skyEase = useRef(new SkyEase())
  const skyClock = useRef<() => number>(() => Infinity)
  /** Whether weather has been asked for yet: until then nothing of it is made or drawn. */
  const [weathered, setWeathered] = useState(() => !isClear(skyState(weather, clouds, wind)))
  const skies = useRef(new WeakMap<Diorama, Diorama>())
  /** How deep the snow lying is, 0 to 1, and the wall clock it was last moved on by. */
  const pile = useRef(0)
  const pileClock = useRef(0)
  const fireClock = useRef(0)
  /** Off screen, how deep snow lies while it falls (`?pile=`, all of it unless asked). */
  const [pileAsked] = useState(() => { const v = Number(new URLSearchParams(location.search).get('pile') ?? 1); return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1 })
  const falls = useRef(new WeakMap<Diorama, Map<boolean, SceneWeather>>())
  /** A scene as it stands under the sky of the moment. */
  const dress = useCallback((d: Diorama) => {
    if (!weathered) return d
    let w = skies.current.get(d)
    if (!w) skies.current.set(d, (w = underSky(d, () => skyEase.current.at(skyClock.current()), calm && !offscreen)))
    return w
  }, [weathered, calm, offscreen])
  const shown = useMemo(() => dress(cutShown), [dress, cutShown])
  // told by which cut was seen, not by a switch: the render that first holds a new cut must already count it as not yet drawn
  const arrived = !!scene && seenBuilt === scene.built
  // What the view is drawn in lags what is picked while the scene is cut again for it (a style that lights the scene
  // itself wants it cut with no light baked in; a time of day wants its lamps lit or out): the picture on show keeps
  // its own style until the new cut is on the stage, so the bare blobs never show in between (Matt saw them, 2026-11-21)
  const onStage = useHeld(scene, !!scene)
  const styleNow = useHeld(style, !!scene)
  const shadedNow = useHeld(shaded, !!scene)
  const pixels = isPixelStyle(styleNow)
  const glitching = styleNow === 'glitch'
  /** The look Brush and Ink would draw, where the style is one of theirs. */
  const drawnStyle = isPixelStyle(styleNow) ? undefined : styleNow
  /** The time of day the scene in the view is set in, where it is. */
  const timeNow = shown.at ? timeOf(shown.at) : undefined
  /** Saving a frame, the loop or a path: the view an export holds is `held`, which the poser and the view leave alone. */
  const exporting = useExport({ stage, canvas, pixels, style, name: shown.id, loop: shown.loop, orbit, setPlaying })
  const { held, recording, saving, note, setNote, record, save } = exporting
  skyClock.current = () => (offscreen || held.current ? Infinity : performance.now() / 1000)
  const exportChoices = exporting.choices
  const exportLabel = exporting.label()
  useEffect(() => {
    const spacing = DETAIL.find((d) => d.id === detail)!.spacing
    // Cutting holds the main thread for the whole wait, so the waiting mark has to be drawn and its
    // animation handed to the compositor first: two frames, then a beat, before the cut starts.
    let t: ReturnType<typeof setTimeout> | undefined
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        t = setTimeout(() => {
          if (!settled) setPixel({ palette: 'own', steps: diorama.finish.steps })
          // a scene with water works one loop of its ripples out here too, while the waiting mark shows
          diorama.water?.()
          // and one with a fire burning, one loop of that
          diorama.fire?.()
          const make = () => diorama.make(spacing, stepColors.length ? stepColors : undefined)
          const lit = () => (texel > 1 ? banded(texel, make) : make())
          const cut = () => (hug ? hugged(lit) : lit())
          setScene({ built: plain ? unlit(cut) : cut(), of: diorama, detail, paint, plain })
        }, 60)
      })
    })
    return () => { cancelAnimationFrame(raf); clearTimeout(t) }
    // `paint` stands for the colors and for whose controls these are
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, diorama, paint, plain, texel, hug])

  /** Whether the browser took the GPU back (out of memory, or the GPU restarted): nothing more is drawn until a reload. */
  const [lost, setLost] = useState(false)
  useEffect(() => {
    let live: CreatureStage | undefined, gone = false
    import('./creature/stage.ts')
      .then(({ CreatureStage }) => CreatureStage.start(canvas.current!, { offscreen, lights: true, webgl }))
      .then((s) => {
        if (gone) { s.dispose(); return }
        live = s
        s.onFirstFrame = () => setDrawn(true)
        s.setFloor(0)
        // a phone can run out of graphics memory on a big scene in a style that draws the screen several times (Matt
        // saw the snail go white in watercolor at Finest, 2026-11-22): the browser takes the GPU back and nothing more
        // is drawn, so the view says so and offers a lighter detail, rather than staying blank
        const lose = s.renderer.onDeviceLost.bind(s.renderer)
        s.renderer.onDeviceLost = (info) => { lose(info); if (!gone) setLost(true) }
        setStage(s)
      }, (e: unknown) => { console.warn(e); setFailed('This browser could not start WebGPU or WebGL 2, which the scene needs.') })
    return () => { gone = true; live?.dispose() }
  }, [offscreen, webgl])

  // the scene's own palette first, then the shared ones
  const palettes = useMemo(() => [{ id: 'own', ...shown.palette, colors: paletteUnder(shown.palette.colors, shown.sky, skyState(weather, clouds, wind)) }, ...PALETTES.slice(1)], [shown, weather, clouds, wind])
  const picked = palettes.find((p) => p.id === palette) ?? palettes[0]
  const colors = picked.colors
  /** How it's made: which step of the walk-through is showing, or none. */
  const [tour, setTour] = useState<number | null>(null)
  const touring = tour === null ? undefined : TOUR[tour]
  const tourOpener = useRef<HTMLButtonElement>(null)
  /** The style the walk-through was opened from: it is about pixel art, so it shows that and hands the style back after. */
  const styleBefore = useRef<Style>('pixel')
  const openTour = () => { styleBefore.current = style; setStyle('pixel'); setTour(0) }
  const closeTour = () => { setTour(null); setStyle(styleBefore.current); requestAnimationFrame(() => tourOpener.current?.focus()) }
  // a step of the walk-through says how the scene is drawn, whatever the switch says
  const asPixels = touring ? touring.pixels : pixels
  const look = useMemo<PixelLook>(() => pixelLookOf(fin, { colors, sky: shown.sky, skyForced: !!shown.at || weathered, finish: shown.finish, sun: shown.sun, start: shown.views[0].orbit, loop: shown.loop }, flags), [fin, colors, shown, weathered, flags])

  // a new level of detail keeps the moment it was showing
  useEffect(() => {
    if (!stage || !scene) return
    const from = stage.time
    // a scene's water is drawn by blobs of its own, in the same world: they move with the water, not with a bone
    const pond = scene.of.water?.()
    // a scene's fires are blobs of their own too: hot gas carried up off each bed, kept as one loop
    const flames = scene.of.fire?.()
    // rain, snow and clouds are actors of their own beside the scene's, made once a scene and shown by the sky's numbers
    // (a scene with clouds of its own has them drawn this way too, whatever the weather)
    let fall: SceneWeather | undefined
    if (weathered || scene.of.heavens?.clouds) {
      const of = scene.of
      let made = falls.current.get(of)
      if (!made) falls.current.set(of, (made = new Map()))
      fall = made.get(overhead)
      if (!fall) made.set(overhead, (fall = new SceneWeather(of, { overhead })))
    }
    // the shared moon, sun and stars, which cloud cover puts out
    const heavens = heavenBones(scene.built.skeleton.bones.map((b) => b.name))
    const own = ownClouds(scene.of)
    stage.setActor(scene.built, undefined, [...(pond ? [pond.surface] : []), ...(pond?.spray ? [pond.spray] : []), ...(flames ? [flames.actor] : []), ...(fall?.actors ?? [])])
    // a new cut is not on screen until a frame holding it is through the GPU: the waiting mark stays up until then
    if (given.current !== scene.built) {
      const mine = given.current = scene.built
      void stage.shown().then(() => { if (given.current === mine) setSeenBuilt(mine) })
    }
    seen.current = null
    // the surface as it stands at the stage's time, for the eye as it stands: after a pose, a turn of the view or a new picture in the mirror
    wet.current = pond && (() => {
      pond.show(stage.time, eyeOf(stage.orbit), { mirror: seen.current })
      stage.reshape(pond.surface)
      if (pond.spray) stage.reshape(pond.spray)
    })
    // it mirrors what stands round it: the scene drawn once more as its mirror image (a second sort and a small draw, so only with WebGPU)
    stage.setMirror(pond && mirrored && !pond.plan.lava && !pond.plan.potion ? { plane: levelPlane(pond.plan.level), lift: pond.plan.cell * 0.75, seen: (image) => { seen.current = image; wet.current?.() } } : undefined)
    pokes.current = new Pokes(scene.built.skeleton)
    // lights move with the bones (the lamp's beam with its lens, the fire's glow with its flames), so both are set from the same time
    const d = dress(scene.of)
    posed.current = d
    stage.setShadowDensity(d.shadowDensity)
    // a new scene brings its own palette, finish and view, now that it is the one in the view
    if (dressed.current !== d.id) {
      dressed.current = d.id
      setFin((f) => pixelFor(f, d.finish))
      setView(d.views[0].id); setOrbit(d.views[0].orbit)
      arrive.current()
    }
    stage.setPoser((sk: Skeleton, t: number) => {
      d.pose(sk, t)
      const now = skyEase.current.at(skyClock.current())
      fall?.pose(t, now)
      // snow lying builds up while snow falls and melts after, by the wall clock: no loop of the scene knows how long
      // it has been snowing. An export holds it as it stands; off screen it is all there at once (or none)
      if (fall) {
        const wall = performance.now() / 1000, dt = Math.min(0.25, Math.max(0, wall - pileClock.current))
        pileClock.current = wall
        if (!held.current) pile.current = offscreen ? (now.snow > 0.01 ? pileAsked : 0) : pileStep(pile.current, now.snow, dt)
        if (fall.pile(pile.current)) stage.reshape(fall.cover)
        // the clouds gray with the sky they are in
        if (fall.shade(now)) stage.reshape(fall.actors[0])
      }
      // the weather's rain on the scene's water (its rings as the share of the swarm that falls) and its wind's waves
      if (pond) { pond.rain = now.rain; pond.waves = now.wind }
      // the scene's own rain, snow and leaves are blown by the same wind, and its sails turn by it (in a calm too, so they
      // carry on from where the wind left them)
      d.blow?.(sk, t, windAt(now, t, d.loop), undefined, now.wind)
      showHeavens(sk.size, heavens, Math.max(now.clouds, own))
      // the wind's turns and the sky's sizes come after the scene's pose worked the bones out
      sk.update()
      // what floats rides the water as it stands at this moment: a boat or a buoy rocks on the waves that pass
      pond?.ride(sk, t)
      // an export is the scene's own loop: no pokes, and the view as it stood when it began
      if (!held.current) pokes.current?.apply(sk, performance.now() / 1000)
      // snow lying rides what it lies on: a swaying crown, a turning sail, a boat on the waves
      fall?.follow(sk)
      // each fire as it stands at this moment, and its light as bright as it burns
      // (wind leans it and blows it out, rain damps it and puts it out: by the wall clock, as snow lies; all at once off screen and in an export)
      if (flames) {
        const wall = performance.now() / 1000, dt = Math.min(0.25, Math.max(0, wall - fireClock.current))
        fireClock.current = wall
        flames.under(skyEase.current.target, offscreen || held.current ? Infinity : dt)
        flames.show(t, eyeOf(stage.orbit)); stage.reshape(flames.actor)
      }
      const lit = d.lights(t, stage.backend === 'webgpu')
      stage.setLights(castBy(flames ? flames.shine(lit, t) : lit, glowGain(glowNow.current, d.finish.glow)), d.ambientAt?.(t) ?? d.ambient ?? 1)
      // a scene whose sky turns as it plays (day to night) hands the pixel pass each moment's sky
      skyNow.current?.(d, t)
      // a scene that asks for it rocks the view gently as it plays, about wherever the view has been turned to;
      // an export holds the view it was started from, and rocks about it when the switch is on (once a loop, so it still joins)
      const about = held.current ?? orbitNow.current
      if (d.swing && !calm && rock) stage.orbit = swung(about, d.swing, d.loop, t)
      else if (held.current) stage.orbit = held.current
      wet.current?.()
    }, from)
  }, [stage, scene, calm, rock, mirrored, dress, offscreen, pileAsked, overhead])
  // one of Brush and Ink's looks in place of pixel art: marks, outlines, characters or cel tones, with their own settings
  // a scene whose sky turns as it plays hands the styles each moment's sky too (their backdrop, cel shading's night,
  // the glass's window and the watercolor's wash), not only the one it opens with
  const [liveSky, setLiveSky] = useState<{ of: string; sky: readonly [readonly number[], readonly number[]] } | undefined>(undefined)
  const styleSky = liveSky && liveSky.of === shown.id && shown.skyAt ? liveSky.sky : shown.sky
  // the scene's own sun lights it, as its baked light would have: light and shade (a third, brighter tone goes toward
  // white, which turns dark paint gray; the pixel pass's own highlights do that job)
  // in the scene's own share of light in shade, a little cool, and all of it held under the baked light's brightest
  // (`LIT_MAX`), so only what gives its own light reaches the pixel pass's glow
  const pixelCel = useMemo<CelLook | undefined>(() => (pixels && shadedNow && !touring ? pixelCelLook(shown.sun, shown.shade ?? 0.5) : undefined), [pixels, shadedNow, touring, shown.sun, shown.shade])
  const drawing = useDrawnLook(stage, touring ? undefined : drawnStyle, { pixelCel, palette: (shown.of ?? shown).palette.colors, actor: onStage?.built, water: !!onStage?.of.water, weather: weathered || !!onStage?.of.heavens?.clouds, spacing: DETAIL.find((d) => d.id === onStage?.detail)?.spacing, plain: !!onStage?.plain, time: timeNow, azimuth: shown.views[0].orbit.azimuth, offscreen, light: coarse, loop: shown.loop, sky: shown.finish.sky || weathered ? [styleSky[0], styleSky[1]] : undefined }, drawnKept)
  // The color behind the canvas is the new scene's as soon as its cut is in hand, a moment before the canvas holds
  // anything but the old scene: it showed behind the old picture, then the transition laid the old picture and its
  // own backdrop back over it, then gave way to the new (Matt saw the backdrop change, change back and change again,
  // 2026-11-25). So it waits with the waiting mark, until a frame of the new scene is drawn.
  const ground = useHeld(drawing.ground, arrived)
  // the walk-through's fourth step is about the four samples, so it draws them whatever the switch says
  const sampling = touring?.id === 'samples'
  const drawnLook = useMemo(() => (asPixels ? (sampling ? { ...look, fine: true } : look) : undefined), [asPixels, sampling, look])
  // zooming in on pixel art makes the pixels bigger, a whole step at a time, rather than the blobs: a blob stays about
  // one art pixel however close the view comes, so edges stay pixel edges and lines stay on what they outline
  // (Matt saw scalloped edges and lines standing off their things when zoomed in, 2026-11-20); `?pixelzoom=0` turns it off
  const [pixelZoom] = useState(() => pixelZoomAsked(new URLSearchParams(location.search)))
  const size = pixelSizeAt(fin, shown.views[0].orbit.distance, orbit.distance, pixelZoom)
  // the glitch's bursts come in steps of the scene's own clock, a whole number of steps a loop, so an export joins up
  const glitchNow = useMemo(() => (glitching && !touring ? glitchLook(glitch, shown.loop, calm && !offscreen) : undefined), [glitching, touring, glitch, shown.loop, calm, offscreen])
  // the style goes onto the stage in one place, shared with Scene Creator (useStyleOnStage.ts)
  const skyOf = useStyleOnStage(stage, { pixels: !!drawnLook, look: drawnLook ?? look, size, rate, exact, glitch: glitchNow, coarse })
  useEffect(() => {
    if (!stage) return
    // set again only when the sky has changed, so a paused scene is not drawn over and over
    let last = ''
    let now = false
    skyNow.current = (d, t) => {
      if (!d.skyAt) return
      const [top, low] = d.skyAt(t), key = `${d.id}|${top}|${low}`
      if (key === last) return
      last = key
      if (drawnLook?.sky) skyOf(top, low)
      else if (!drawnLook) {
        // another style: the page's own state, and at once while posing, so the color behind the canvas is the
        // moment's when the frame drawn next is painted over it (an export reads it straight after the draw)
        const put = () => setLiveSky({ of: d.id, sky: [top, low] })
        if (now) flushSync(put)
        else put()
      }
    }
    const d = posed.current
    if (d) skyNow.current(d, stage.time)
    now = true
  }, [stage, drawnLook, skyOf])
  useEffect(() => {
    if (!stage) return
    const keep = touring?.keep ?? 1
    // in clay, and with only some of the blobs drawn where the step shows them one by one
    stage.tint(touring?.clay ? (c, i) => [...clay(c), kept(i, keep) ? 1 : 0] : undefined)
  }, [stage, touring])
  useEffect(() => { if (stage) stage.playing = playing }, [stage, playing])
  const orbitNow = useRef(orbit)
  /** A scene's water: shapes and colors its surface for the moment and the view, and the last picture of what it mirrors. */
  const wet = useRef<(() => void) | undefined>(undefined)
  const seen = useRef<MirrorImage | null>(null)
  const posed = useRef<Diorama | undefined>(undefined)
  /** Hands the pixel pass, or the style drawn in its place, the sky of the moment, for a scene whose sky turns as it plays. */
  const skyNow = useRef<((d: Diorama, t: number) => void) | undefined>(undefined)
  /** Taps on the scene: a part leans and wobbles, the land throws sparkles. */
  const pokes = useRef<Pokes | undefined>(undefined)
  orbitNow.current = orbit
  // Glow turns the scene's own lights up and down, so a paused scene is lit again for the moment it shows
  useEffect(() => {
    const d = posed.current
    if (stage && d) stage.setLights(castBy(d.lights(stage.time, stage.backend === 'webgpu'), glowGain(glow, d.finish.glow)), d.ambientAt?.(stage.time) ?? d.ambient ?? 1)
  }, [stage, glow])
  // the scene being posed, which is the one whose swing applies: a scene just picked is not in the view until it is cut
  useEffect(() => {
    if (!stage) return
    const d = posed.current
    // while a loop is exported the view stays as it was when it began; what is turned meanwhile shows afterwards
    if (held.current) return
    stage.orbit = d && !calm && rock ? swung(orbit, d.swing, d.loop, stage.time) : orbit
    // haze is measured from the view's target, so it stays put on the scene as the view moves in and out
    fog.current = () => {
      const h = d?.hazeAt ? d.hazeAt(orbit.distance) : d?.haze
      stage.setFog(h?.color ?? [0, 0, 0], h ? orbit.distance + h.from : 0, h ? orbit.distance + h.to : 0)
    }
    fog.current()
    wet.current?.()
    stage.invalidate()
  }, [stage, orbit, scene, calm, rock, recording === null, dress])
  /** Sets the haze for the scene, the view and the sky of the moment. */
  const fog = useRef<(() => void) | undefined>(undefined)
  // a new weather or cloud cover: the sky eases to it over a few seconds, with the scene left as it is cut
  const skyBegun = useRef(false)
  useEffect(() => {
    const to = skyState(weather, clouds, wind)
    if (!isClear(to)) setWeathered(true)
    const now = skyClock.current()
    // the weather a page opens with is there at once
    skyEase.current.set(to, skyBegun.current ? now : Infinity)
    skyBegun.current = true
    if (!stage) return
    let raf = 0
    const tick = () => {
      fog.current?.()
      // a paused scene is posed again for the sky of the moment; a playing one poses itself
      if (stage.playing) stage.invalidate()
      else stage.seek(stage.time)
      if (skyEase.current.moving(skyClock.current())) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [stage, weather, clouds, wind, weathered])
  // the art's size follows the view's; read it now and then for the caption (it's text, not every frame)
  useEffect(() => {
    if (!stage) return
    const read = () => setArt((a) => { const n = stage.artSize; return n && a && n.width === a.width && n.height === a.height ? a : n })
    const id = setInterval(read, 400)
    read()
    return () => clearInterval(id)
  }, [stage, pixels, size])

  // the picture's own size: the frame on screen written out as a PNG, one image pixel per art pixel. Reading a frame
  // back costs a little, so it is measured every few seconds, not every frame, and not while the tab is hidden
  const [png, setPng] = useState<{ bytes: number; used: number }>()
  const [details, setDetails] = useState(false)
  useEffect(() => {
    setPng(undefined)
    if (!stage || !scene || !pixels) return
    let gone = false, busy = false
    const measure = async () => {
      if (busy || document.hidden) return
      busy = true
      try {
        const frames = await stage.pixelFrames()
        if (frames && !gone) { const bytes = (await toPng(frames.art, 1)).length; if (!gone) setPng({ bytes, used: countColors(frames.art) }) }
      } catch (e) { console.warn(e) } finally { busy = false }
    }
    const first = setTimeout(measure, 500), id = setInterval(measure, 3000)
    return () => { gone = true; clearTimeout(first); clearInterval(id) }
  }, [stage, scene, pixels, size, look])

  const facts = useMemo<SceneFacts | undefined>(() => {
    if (!scene || !stage) return
    const { built, of } = scene
    return {
      name: of.label, about: of.about, blobs: built.blobs.count, bones: built.skeleton.count, parts: of.parts ?? new Set(built.partOf).size,
      moves: of.moves, descriptionBytes: of.bytes, lights: of.lights(0).length, loop: of.loop, splatBytes: built.blobs.count * BLOB_BYTES,
      detail: DETAIL.find((d) => d.id === scene.detail)?.label ?? scene.detail, backend: stage.backend,
      picture: pixels && art ? { ...art, scale: size, palette: colors, paletteName: palettes.find((p) => p.id === palette)?.label ?? '', motion: rate ? `${rate} fps` : 'Smooth', pngBytes: png?.bytes, used: png?.used } : undefined,
    }
  }, [scene, stage, pixels, art, size, colors, palettes, palette, rate, png])

  // For verify: the stage and the look in use, without clicking
  useEffect(() => {
    if (!stage || !scene) return
    window.__diorama = { stage, blobs: () => stage.blobCount, bones: () => scene.built.skeleton.count, look: () => look, style, water: () => scene.of.water?.(), mirrored,
      // what the Finish tab no longer shows, for verify: the art-pixel effects and the exact sort
      finish: ({ bands: b, heat: hz, selout: so, exact: ex }) => setFin((f) => ({ ...f, ...(b !== undefined && { bands: b }), ...(hz !== undefined && { heat: hz }), ...(so !== undefined && { selout: so }), ...(ex !== undefined && { exact: ex }) })) }
    return () => { delete window.__diorama }
  }, [stage, scene, look, style, mirrored])

  const exportNote = touring ? 'Close How it\'s made to save a frame or export the loop.' : note
  const cantExport = !!touring || !drawn || exporting.busy

  /**
   * Saves the scene as polygons in a rigged .glb: blocks on the grid it was cut on (or a smooth surface round it),
   * colored as it is painted, on its bones, with one loop as its animation. An idea from Silicon Jungle's Ink Studio.
   */
  const saveModel = () => {
    if (!scene || modelBusy) return
    setModelBusy(true)
    setGlbNote('Making the model…')
    // a moment for the note to show: the mesh is made in one go
    setTimeout(() => {
      try {
        const { built, of } = scene
        const spacing = DETAIL.find((d) => d.id === scene.detail)!.spacing
        const mesh = modelShape === 'blocks' ? blocksToMesh(built.blobs, built.skin, { cell: spacing * blockSize }) : blobsToMesh(built.blobs, built.skin, { cells: 140, level: 1 })
        const sk = new Bones(built.skeleton.bones)
        const clip = recordClip('loop', sk, (k, t) => of.pose(k, t), of.loop, 24)
        const bytes = writeRiggedMeshGlb({ name: of.label, mesh, skeleton: sk, clips: [clip] })
        download(bytes, `${of.id}-${modelShape}.glb`, 'model/gltf-binary')
        setGlbNote(`Saved ${mesh.triangleCount.toLocaleString()} triangles with ${sk.count} bones and its ${of.loop} second loop: ${kilobytes(bytes.length)}.`)
      } catch (e) {
        console.warn(e)
        setGlbNote(`The model could not be made: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        setModelBusy(false)
      }
    }, 30)
  }

  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  /** Where and when a press began, so a short press that hardly moves pokes instead of orbiting. */
  const press = useRef<{ x: number; y: number; at: number } | null>(null)
  const canPoke = playing && !calm
  const poke = (x: number, y: number) => {
    const hit = stage?.hitAt(x, y)
    if (hit && scene && pokes.current) pokes.current.add(scene.built.skeleton, hit.bone, hit.point, performance.now() / 1000)
  }
  useWheelZoom(canvas, setOrbit)
  const pick = (id: string) => { setView(id); setOrbit((shown.views.find((v) => v.id === id) ?? shown.views[0]).orbit) }
  /** Another weather or cloud cover, or none. The address names them too. */
  const pickSky = (key: 'weather' | 'clouds' | 'wind', id: string | undefined) => {
    const url = new URL(location.href)
    const put = (k: string, v: string | undefined) => { if (v) url.searchParams.set(k, v); else url.searchParams.delete(k) }
    // weather and cloud cover are one choice: a weather brings its own clouds and wind, a cover is clouds alone
    if (key === 'wind') { setWind(id as WindId | undefined); put('wind', id) }
    else {
      setWeather(key === 'weather' ? (id as WeatherId | undefined) ?? 'none' : 'none')
      setClouds(key === 'clouds' ? (id as CloudId | undefined) : undefined)
      setWind(undefined)
      // no weather on a scene that starts under one of its own is said in the address too
      put('weather', key === 'weather' ? id ?? (picked0.weather ? 'none' : undefined) : undefined); put('clouds', key === 'clouds' ? id : undefined); put('wind', undefined)
    }
    history.replaceState(history.state, '', url)
  }
  /** Clouds over the scene, or left out. The address says so where it isn't the scene's own way. */
  const pickOverhead = (on: boolean) => {
    setOverhead(on)
    const url = new URL(location.href)
    if (on === (picked0.overhead ?? true)) url.searchParams.delete('overhead')
    else url.searchParams.set('overhead', on ? '1' : '0')
    history.replaceState(history.state, '', url)
  }
  /** Another time of day, or the scene as it is written. The address names it too. */
  const setTimeOfDay = (id: TimeId | undefined) => {
    setTime(id)
    const url = new URL(location.href)
    if (id) url.searchParams.set('time', id)
    else url.searchParams.delete('time')
    history.replaceState(history.state, '', url)
  }
  /** Another style. The address names it, as it names the scene, so a shared link opens the same picture. */
  const draw = (id: Style) => {
    setStyle(id)
    setNote('')
    const url = new URL(location.href)
    if (id === DEFAULT_STYLE) url.searchParams.delete('style')
    else url.searchParams.set('style', id)
    history.replaceState(history.state, '', url)
  }
  /**
   * Keeps a copy of each picture the old scene draws until the new one arrives, so the transition can start from its
   * last moment (a GPU canvas can only be read straight after a draw).
   */
  const keepLastFrame = () => {
    if (transition === 'cut' || calm || !drawn || changing.current || !canvas.current) return
    const cv = canvas.current, box = cv.parentElement!
    const sheet = document.createElement('canvas')
    sheet.width = cv.width
    sheet.height = cv.height
    const ctx = sheet.getContext('2d', { alpha: false })!
    const kept = { sheet, got: false, stop: () => {} }
    // Copying the view costs a read of the whole canvas, and the picture hardly moves while the new scene is cut:
    // at most one copy this often, so the wait is the cut's own and not the copies' (Matt, 2026-11-25).
    let last = 0
    const copy = () => {
      const now = performance.now()
      if (sheet.width < 2 || (kept.got && now - last < KEEP_EVERY)) return
      last = now
      paintView(ctx, box, sheet.width, sheet.height, (el) => (el === overlayCanvas.current ? undefined : el))
      kept.got = true
    }
    // drawn off screen, the page's canvas is a plain one that holds its picture: it is copied as the new scene arrives
    kept.stop = offscreen ? copy : watchDraws((drawnTo) => { if (drawnTo === cv) copy() })
    changing.current = kept
    stage?.invalidate()
  }
  /** The new scene is in the view: the old picture gives way to it. */
  const arrive = useRef<() => void>(() => {})
  arrive.current = () => {
    const kept = changing.current
    changing.current = null
    if (!kept) return
    kept.stop()
    const t = TRANSITIONS.find((x) => x.id === transition)
    const el = overlayCanvas.current
    if (!t || !kept.got || !el || !stage) return
    let overlay: TransitionOverlay
    try { overlay = overlayOf.current ??= new TransitionOverlay(el) } catch (e) { console.warn(e); return }
    overlay.setFrom(kept.sheet)
    // an art pixel in device pixels, so pixel art's transitions keep to its own pixels
    const cell = pixels && stage.artSize ? Math.max(1, Math.round(kept.sheet.width / stage.artSize.width)) : Math.max(1, Math.round(6 * devicePixelRatio))
    const dark = colors.length ? darkest(colors) : [11, 16, 38]
    const cover: [number, number, number] = [dark[0] / 255, dark[1] / 255, dark[2] / 255]
    const seed = Math.floor(Math.random() * 1000)
    overlay.draw(t, 0, cell, cover, seed)
    // shown at once, before the stage draws the new scene
    el.hidden = false
    setPassing(true)
    // it starts once the new scene has been drawn, so it opens onto the scene and not onto a blank view
    void (offscreen ? Promise.resolve() : stage.shown()).then(() => {
      // off screen it keeps the stage's clock, which moves only as a check draws, so a check sees it go by
      const now = () => (offscreen ? stage.time : performance.now() / 1000)
      const start = now()
      const step = () => {
        const p = Math.min(1, Math.max(0, now() - start) / t.seconds)
        overlay.draw(t, p, cell, cover, seed)
        if (p < 1) requestAnimationFrame(step)
        else { el.hidden = true; setPassing(false) }
      }
      requestAnimationFrame(step)
    })
  }
  const pickTransition = (id: TransitionKind | 'cut') => {
    setTransition(id)
    const url = new URL(location.href)
    if (id === TRANSITIONS[0].id) url.searchParams.delete('transition')
    else url.searchParams.set('transition', id)
    history.replaceState(history.state, '', url)
  }
  /** Another scene. It is cut first; its palette, finish and view follow when it reaches the view. */
  const show = (id: string) => {
    if (id === which) return
    setWhich(id)
    keepLastFrame()
    setNote('')
    // the address names the scene, so a reload or a shared link opens the same one (an opened model can't be)
    const url = new URL(location.href)
    if (id === DIORAMAS[0].id || id === 'model') url.searchParams.delete('scene')
    else url.searchParams.set('scene', id)
    history.replaceState(history.state, '', url)
  }
  /** A scene description (.json) as a scene of its own. What is wrong with it is listed instead when it can't be cut. */
  const openDescription = async (f: File) => {
    setOpening(true)
    setModelNote(`Reading ${f.name}…`)
    try {
      const { readScene, MOST_BYTES } = await import('./diorama/review.ts')
      const read = f.size > MOST_BYTES ? { doc: undefined, problems: [`file: over ${MOST_BYTES / 1000} KB, which no scene needs`] } : readScene(await f.text())
      if (!read.doc) {
        const shown = read.problems.slice(0, 6)
        setModelNote(`Could not open ${f.name}. ${shown.join('; ')}${read.problems.length > shown.length ? `; and ${read.problems.length - shown.length} more` : ''}.`)
        return
      }
      const d = described('model', read.doc, `${read.doc.name}, a scene opened from a file`)
      setModel(d)
      setWhich('model')
      const url = new URL(location.href)
      url.searchParams.delete('scene')
      history.replaceState(history.state, '', url)
      setModelNote(`Opened ${f.name}: ${read.doc.parts.length.toLocaleString('en-US')} parts.`)
    } catch (e) {
      setModelNote(`Could not open ${f.name}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setOpening(false)
    }
  }
  /** A model file (.obj, with its .mtl if picked too, or .glb) as a scene of its own, turning on a plinth. */
  const openModel = async (files: File[]) => {
    const f = files.find((x) => /\.(obj|glb|json)$/i.test(x.name)) ?? files[0]
    if (/\.json$/i.test(f.name)) return openDescription(f)
    const mtl = files.find((x) => /\.mtl$/i.test(x.name))
    setOpening(true)
    setModelNote(`Reading ${f.name}…`)
    try {
      const [{ readMeshFile }, { modelDiorama }] = await Promise.all([import('../splat-engine/meshFile.ts'), import('./diorama/model.ts')])
      const file = readMeshFile(f.name, new Uint8Array(await f.arrayBuffer()), mtl && (await mtl.text()))
      const textures = await Promise.all(file.images.map((im) => decodeTexture(im.bytes, im.mime).catch((): Texture => () => [1, 1, 1])))
      const d = modelDiorama(f.name, file, textures)
      setModel(d)
      setWhich('model')
      const url = new URL(location.href)
      url.searchParams.delete('scene')
      history.replaceState(history.state, '', url)
      setModelNote(`Opened ${f.name}: ${(file.mesh.indices.length / 3).toLocaleString('en-US')} triangles.`)
    } catch (e) {
      setModelNote(`Could not open ${f.name}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setOpening(false)
    }
  }
  const backend = stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'
  const loading = !failed && (!drawn || !scene || !arrived)
  const loadingLabel = stage ? (scene ? 'Drawing the scene…' : 'Cutting the scene into blobs…') : 'Starting the splat engine…'

  return (
    <div className="pb-4">
      <Crumbs here="Diorama" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Diorama</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          Small scenes made of blobs and drawn as pixel art while they move. Each one is real 3D, so you can turn it,
          and every frame is cut down to a few colors on a coarse grid of pixels. Pick a scene, change the palette and
          the pixel size, or pick another style to see it painted, inked, cel shaded or typed out in characters.
        </p>
      </header>
      {facts && <SceneDetails open={details} onClose={() => setDetails(false)} facts={facts} />}
      <Workbench
        viewLabel="The scene"
        fullTools={
          <ViewPopup label="Export" title="Export the loop" testId="diorama-full-export">
            {exportChoices(true)}
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Button small disabled={cantExport} onClick={record} data-testid="diorama-full-record">{exportLabel}</Button>
                <Button small disabled={cantExport} onClick={save}>{saving ? 'Saving…' : 'Save this frame'}</Button>
              </div>
              <p role="status" className="text-xs text-ink-faint empty:hidden">{exportNote}</p>
              <p className="text-xs text-ink-faint">Uses the view as it is when you press the button. It rocks only if Rock the view is on in the Finish tab, and turning or zooming while it runs changes nothing.</p>
            </div>
          </ViewPopup>
        }
        view={<>
              {ground && <div aria-hidden className="absolute inset-0" style={{ background: ground }} data-testid="diorama-ground" />}
              <canvas
                ref={canvas}
                role="application"
                aria-roledescription="3D view"
                aria-label={`${shown.about}, ${asPixels ? `drawn ${styleWords(touring ? 'pixel' : style)}` : touring?.clay ? 'drawn as blobs in plain clay' : `drawn ${styleWords(touring ? 'blobs' : style)}`}, ${failed ? 'not drawn' : playing ? 'moving' : 'paused'}. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.${canPoke ? ' Tap or press Enter to poke it.' : ''}`}
                tabIndex={0}
                data-testid="diorama-view"
                className="absolute inset-0 h-full w-full cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset active:cursor-grabbing"
                onPointerDown={(ev) => {
                  ev.currentTarget.setPointerCapture(ev.pointerId)
                  pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
                  drag.current = beginOrbitDrag(pointers.current, ev, orbit)
                  press.current = pointers.current.size === 1 ? { x: ev.clientX, y: ev.clientY, at: performance.now() } : null
                }}
                onPointerMove={(ev) => {
                  if (pointers.current.has(ev.pointerId)) pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
                  const d = drag.current
                  if (d) setOrbit(dragOrbit(d, pointers.current, ev))
                }}
                onPointerUp={(ev) => {
                  pointers.current.delete(ev.pointerId)
                  drag.current = null
                  const p = press.current
                  press.current = null
                  // a tap, not a drag: pokes what is under it
                  if (canPoke && p && Math.hypot(ev.clientX - p.x, ev.clientY - p.y) < 6 && performance.now() - p.at < 400) {
                    const r = ev.currentTarget.getBoundingClientRect()
                    poke(ev.clientX - r.left, ev.clientY - r.top)
                  }
                }}
                onPointerCancel={(ev) => { pointers.current.delete(ev.pointerId); drag.current = null; press.current = null }}
                onKeyDown={(ev) => {
                  if (canPoke && (ev.key === 'Enter' || ev.key === ' ')) {
                    ev.preventDefault()
                    poke(ev.currentTarget.clientWidth / 2, ev.currentTarget.clientHeight / 2)
                    return
                  }
                  if (!orbitKey(ev, orbit)) return
                  ev.preventDefault()
                  setOrbit((o) => orbitKey(ev, o) ?? o)
                }}
              />
              <canvas ref={overlayCanvas} aria-hidden hidden={!passing} className="pointer-events-none absolute inset-0 h-full w-full" data-testid="diorama-transition" />
              {loading && <LoadingMark testid="diorama-loading" />}
              <p role="status" className="sr-only">{loading ? loadingLabel : ''}</p>
              {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
              {lost && !failed && <LostView detail={detail} />}
              {touring?.id === 'samples' && stage && scene && <Magnifier stage={stage} />}
              <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => pick(view)} />
              {!sampling && <p aria-hidden className="pointer-events-none absolute right-14 bottom-2 rounded bg-paper/80 px-1.5 py-0.5 text-xs text-ink-muted">{coarse ? 'drag to orbit · pinch to zoom' : 'drag to orbit · scroll to zoom'}</p>}
        </>}
        status={tour !== null && made ? <TourStrip step={tour} facts={{ parts: made.of.parts ?? new Set(made.built.partOf).size, descriptionBytes: made.of.bytes, blobs: made.built.blobs.count, colors: colors.length, steps: made.paint !== '', lines: !outline ? 'none' : fin.own ? 'own' : 'one' }} onStep={setTour} onClose={closeTour} /> : <>
              <span>{scene ? <><span className="tabular-nums text-ink" data-testid="diorama-blobs">{scene.built.blobs.count.toLocaleString()}</span> blobs<span data-testid="diorama-art">{pixels && art ? <>, drawn at <span className="tabular-nums text-ink">{art.width} × {art.height}</span>{png ? <>, <span className="tabular-nums text-ink" data-testid="diorama-png-size">{kilobytes(png.bytes)}</span> a frame</> : ''}</> : `, drawn ${styleWords(style)}`}</span>.</> : loadingLabel}</span>
              <span className="flex gap-x-4">
              {scene && <button type="button" ref={tourOpener} onClick={openTour} data-testid="diorama-tour-open" className="cursor-pointer text-ink underline decoration-rule underline-offset-2 hover:text-accent">How it's made</button>}
              {facts && <button type="button" onClick={() => setDetails(true)} aria-haspopup="dialog" data-testid="diorama-details-open" className="cursor-pointer text-ink underline decoration-rule underline-offset-2 hover:text-accent">Full details</button>}
              </span>
        </>}
        tabsLabel="Options"
        tabs={[
          {
            id: 'scene', label: 'Scene', content: (
              <div className={TAB_SECTIONS}>
                <div className="grid gap-2">
                  <p className="text-sm text-ink-muted">Current scene selected: <span className="font-medium text-ink" data-testid="diorama-current">{diorama.label}</span></p>
                  <div className="flex items-stretch gap-1.5">
                    <Button aria-label="Previous scene" className="cursor-pointer" onClick={() => show(stepped(scenes, which, -1).id)} data-testid="diorama-previous">
                      <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
                    </Button>
                    <Button primary className="flex-1 cursor-pointer" aria-haspopup="dialog" onClick={() => setPicking(true)} data-testid="diorama-picker-open">Select a Scene</Button>
                    <Button aria-label="Next scene" className="cursor-pointer" onClick={() => show(stepped(scenes, which, 1).id)} data-testid="diorama-next">
                      <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
                    </Button>
                  </div>
                </div>
                {picked0.space ? <p className="text-sm text-ink-muted" data-testid="diorama-space">{picked0.indoor ? 'Inside a room there is no time of day or weather: the scene keeps its own light.' : 'Out in space there is no time of day or weather: the scene keeps its own sky, stars and far sun.'}</p> : <>
                <TimeControls time={time} onPick={setTimeOfDay} timed={!!picked0.timed} prefix="diorama" />
                <WeatherControls weather={weather} clouds={clouds} wind={wind} overhead={overhead} onPick={pickSky} onOverhead={pickOverhead} calm={calm} prefix="diorama" />
                </>}
                <Field label="Changing scenes">
                  <div className="flex flex-wrap gap-1.5" data-testid="diorama-transitions">
                    <Chip active={transition === 'cut'} onClick={() => pickTransition('cut')}>Cut</Chip>
                    {TRANSITIONS.map((t) => <Chip key={t.id} active={transition === t.id} onClick={() => pickTransition(t.id)}>{t.name}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">{calm ? 'Your device asks for less motion, so scenes change with a cut.' : 'How the last scene gives way to the next. An idea from Silicon Jungle\'s Ink Studio.'}</p>
                </Field>
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button small disabled={opening} onClick={() => modelInput.current?.click()}>{opening ? 'Opening…' : 'Open a file'}</Button>
                    <input ref={modelInput} type="file" accept=".obj,.mtl,.glb,.json" multiple className="sr-only" tabIndex={-1} aria-hidden="true" data-testid="diorama-model"
                      onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) void openModel(fs) }} />
                  </div>
                  <p className="text-xs text-ink-faint">A closed .glb, or an .obj (pick its .mtl with it for colors), cut into blobs on a turning plinth, in a palette from its own colors. Or a scene description (.json), drawn as it is written. It stays on this computer.</p>
                  <p role="status" className="text-xs text-ink-faint empty:hidden" data-testid="diorama-model-note">{modelNote}</p>
                </div>
                <Field label="View">
                  <div className="flex flex-wrap gap-1.5">
                    {shown.views.map((v) => <Chip key={v.id} active={view === v.id} onClick={() => pick(v.id)}>{v.label}</Chip>)}
                  </div>
                </Field>
                <Field label="Blobs">
                  <div className="flex flex-wrap gap-1.5">
                    {DETAIL.map((d) => <Chip key={d.id} active={detail === d.id} onClick={() => { setChosen(d.id); writeDetail(d.id) }}>{d.label}</Chip>)}
                  </div>
                </Field>
                <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button small onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</Button>
                </div>
                <p className="text-xs text-ink-faint">The scene repeats every {shown.loop} seconds.</p>
                </div>
              </div>
            ),
          },
          {
            id: 'style', label: 'Style', content: (
              <div className={TAB_SECTIONS}>
                <StyleControls style={style} onStyle={draw} pixel={fin} setPixel={setPixel} glitch={glitch} setGlitch={setGlitch} palettes={palettes} calm={calm} prefix="diorama"
                  ownNote={(n) => `The ${n} colors chosen for this scene.`} drawn={drawing.controls} />
              </div>
            ),
          },
          {
            id: 'finish', label: 'Finish', content: (
              <div className={TAB_SECTIONS}>
                <FinishControls style={style} pixel={fin} setPixel={setPixel} finish={shown.finish} colors={colors.length} calm={calm} />
              </div>
            ),
          },
          {
            id: 'export', label: 'Export', content: (
              <div className={TAB_SECTIONS}>
                <p className="text-sm text-ink-muted">Saves the scene in the style it is drawn in now. A loop is drawn one frame at a time from start to end, so it joins up when it repeats and no frame is dropped, however slow the device.</p>
                {exportChoices(false)}
                <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button small disabled={cantExport} onClick={record} data-testid="diorama-record">{exportLabel}</Button>
                  <Button small disabled={cantExport} onClick={save}>{saving ? 'Saving…' : 'Save this frame'}</Button>
                </div>
                <p role="status" className="text-xs text-ink-faint empty:-mt-2">{exportNote}</p>
                <p className="text-xs text-ink-faint">The loop is exported from the view as it is when you press the button. It rocks only if Rock the view is on in the Finish tab, and turning or zooming while it runs changes nothing. For a clip of whatever you do on the page, use the record button on the view.</p>
                </div>
                <div className="grid gap-3" data-testid="diorama-glb">
                  <Field label="3D model">
                    <div className="flex flex-wrap gap-1.5">
                      <Chip active={modelShape === 'blocks'} onClick={() => setModelShape('blocks')}>Blocks</Chip>
                      <Chip active={modelShape === 'smooth'} onClick={() => setModelShape('smooth')}>Smooth</Chip>
                    </div>
                  </Field>
                  {modelShape === 'blocks' && <Field label="Block size">
                    <div className="flex flex-wrap gap-1.5">
                      {[1, 2, 4].map((n) => <Chip key={n} active={blockSize === n} onClick={() => setBlockSize(n)}>{n === 1 ? 'One cell' : `${n} cells`}</Chip>)}
                    </div>
                    <p className="mt-1.5 text-xs text-ink-faint">How many cells of the grid the scene was cut on make one block. Bigger blocks make a smaller file.</p>
                  </Field>}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button small disabled={cantExport || !scene || modelBusy} onClick={saveModel} data-testid="diorama-glb-save">Save as a 3D model (.glb)</Button>
                  </div>
                  <p role="status" className="text-xs text-ink-faint empty:hidden">{glbNote}</p>
                  <p className="text-xs text-ink-faint">Polygons for a game engine or a 3D app, at the detail on show: colored as the scene is painted, light and shade included, for an unlit material, on the scene's bones with one loop as its animation. Live lights, the sky, water and the style stay behind. An idea from Silicon Jungle's Ink Studio.</p>
                </div>
              </div>
            ),
          },
        ]}
      />

      <ScenePicker open={picking} onClose={() => setPicking(false)} current={which} onPick={show}
        scenes={scenes.map((d) => ({ id: d.id, label: d.label, about: d.about, loop: d !== model }))} />

      <section aria-labelledby="how-title" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-sm text-ink-faint">How it's made</p>
          <h2 id="how-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">Shapes, then blobs, then pixels</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            Nothing here was drawn or scanned. In the lighthouse scene, the rock, the tower, the cottage and the boat are written as simple shapes in code, and so are the bricks, the roof tiles and the planks: each is a rule for what color a point on the shape should be. The scene is
            cut into a grid, and every grid cell on a shape's surface becomes one small, solid blob. The light and the shadows
            are worked out once and painted into the blobs' colors.
          </p>
          <p>
            Each moving part hangs on a bone: the lamp turns, the boat rocks, the pines lean, smoke rises and the gulls circle and beat their wings. Each frame the
            scene is drawn very small, every pixel is snapped to the nearest color of the palette, bright pixels spill a little
            light, a dark line is drawn where one color meets a much lighter one, and the result is scaled up in whole pixels with no smoothing. Switch to Blobs to see the same frame before
            that last step.
          </p>
          <p>
            Every other scene goes one step further: each is only a description, a list of shapes, paints, bones
            and moves with no code of its own, which is the kind of thing Claude can write from a sentence. The engine checks
            the description, then builds and plays it the same way.
          </p>
          <p>
            Blobscape's own splat engine draws it here on {backend}. The same steps turn creatures into sprite sheets
            in <a href={href({ page: 'creature' })} className="underline decoration-rule underline-offset-2 hover:text-accent">Splat Creatures</a>,
            and <a href="/experiments/splat-to-sprite/" className="underline decoration-rule underline-offset-2 hover:text-accent">Splat to Sprite</a> does
            it for a splat file of your own.
          </p>
          <p>
            The idea of pixel art made from splats, and the themes of several scenes here, were inspired by the clips
            that <a href="https://x.com/JungleSilicon" target="_blank" rel="noopener" className="underline decoration-rule underline-offset-2 hover:text-accent">Silicon Jungle</a> shared
            of their own pixel-art splat scenes, and the world-building shapes (brick walls, steps and fences,
            formations, weather that lands, worn rock) follow ideas from their Ink Studio kit. The scenes, the engine
            and the code on this page are our own.
          </p>
        </div>
      </section>
    </div>
  )
}

/**
 * Over the view once the browser has taken the GPU back: says so and starts the page again a step lighter (the
 * address keeps everything else), since a lost GPU device can't be drawn to again.
 */
function LostView({ detail }: { detail: string }) {
  const at = DETAIL.findIndex((d) => d.id === detail)
  const lighter = at > 0 ? DETAIL[at - 1] : undefined
  const again = (id?: string) => { if (id) writeDetail(id); location.reload() }
  return (
    <div role="alert" className="absolute inset-0 grid place-items-center bg-paper/90 p-4 text-center text-sm text-ink">
      <div className="max-w-xs space-y-3">
        <p>The browser stopped drawing the scene. This happens when a device runs out of graphics memory{lighter ? ' at this detail' : ''}.</p>
        <Button primary className="mx-auto" onClick={() => again(lighter?.id)}>{lighter ? `Start again at ${lighter.label}` : 'Start again'}</Button>
      </div>
    </div>
  )
}
