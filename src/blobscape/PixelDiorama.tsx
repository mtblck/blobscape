import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import { Magnifier, TourStrip } from './diorama/HowItsMade.tsx'
import { TOUR, clay, kept } from './diorama/tour.ts'
import { STEADY, countColors, darkest, type Frame, type PixelLook } from '../splat-core/pixel.ts'
import type { Built } from '../splat-engine/body.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { castBy, glowGain } from './diorama/glow.ts'
import { ScenePicker } from './diorama/ScenePicker.tsx'
import { stepped } from './diorama/pick.ts'
import { Button, Chip, Field, Slider, Toggle } from '../shared/ui.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import { href } from './routes.ts'
import { download } from './files.ts'
import type { CreatureStage } from './creature/stage.ts'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { DETAIL, PALETTES } from './diorama/scene.ts'
import { DIORAMAS, described, type Diorama } from './diorama/scenes.ts'
import { SceneDetails, kilobytes, type SceneFacts } from './diorama/SceneDetails.tsx'
import type { Skeleton } from '../splat-engine/rig.ts'
import { Pokes } from '../splat-engine/poke.ts'
import { levelPlane, type MirrorImage } from '../splat-engine/reflect.ts'
import type { SceneWater } from '../splat-engine/sceneWater.ts'
import { browserDeflate, encodeApng, enlarged } from '../splat-core/apng.ts'
import type { Texture } from '../splat-engine/meshShape.ts'
import { decodeTexture } from './modelRig.ts'
import { detailAsked, labelNames, writeDetail } from '../shared/detail.ts'
import { unlit } from '../splat-engine/voxel.ts'
import { STYLES, styleAsked, styleWords, type Style } from './diorama/styles.ts'
import { useDrawnLook } from './drawnLook.tsx'

const SIZES = [2, 3, 4, 6]
/** Frames a second the scene moves at: 0 is every frame the screen shows. */
const RATES = [0, 12, 8]
declare global {
  interface Window { __diorama?: { stage: CreatureStage; blobs: () => number; bones: () => number; look: () => PixelLook; style: Style; water: () => SceneWater | undefined; mirrored: boolean } }
}

/** The view `orbit`, rocked `swing` degrees to either side once every `loop` seconds, as it is at `t`. */
const swung = (orbit: Orbit, swing: number, loop: number, t: number): Orbit => (swing ? { ...orbit, azimuth: orbit.azimuth + Math.sin((t / loop) * Math.PI * 2) * swing } : orbit)

/** A frame as a PNG, each art pixel `scale` across. */
async function toPng(f: Frame, scale: number): Promise<Uint8Array> {
  const one = document.createElement('canvas')
  one.width = f.width
  one.height = f.height
  one.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(f.data), f.width, f.height), 0, 0)
  const big = document.createElement('canvas')
  big.width = f.width * scale
  big.height = f.height * scale
  const ctx = big.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(one, 0, 0, big.width, big.height)
  const blob = await new Promise<Blob | null>((done) => big.toBlob(done, 'image/png'))
  if (!blob) throw new Error('Could not make the PNG')
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * Pixel Diorama: a small scene written as shapes in code, cut into a grid of
 * solid blobs (splat-engine/voxel.ts), moved by bones, and drawn as pixel art
 * by the engine's pixel mode (splat-engine/pixelPass.ts): the scene rendered
 * small, snapped to a palette, and scaled up in whole pixels.
 */
/** What one blob holds: a center, three sizes, a facing, a color and an opacity, each number four bytes. */
const BLOB_BYTES = (3 + 3 + 4 + 3 + 1) * 4

/** Frames a second in a recorded loop: one of the page's Motion choices, as the gallery's loops are. */
const RECORD_FPS = 12
/** The frame rates a loop can be recorded at: more frames, and anything that moves fast takes smaller steps. */
const RECORD_RATES = [12, 24]

export function PixelDiorama() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<CreatureStage>()
  // water mirrors the scene where the GPU sorts (WebGPU); `?mirror=0` leaves it the sky alone
  const mirrored = stage?.backend === 'webgpu' && new URLSearchParams(location.search).get('mirror') !== '0'
  const [drawn, setDrawn] = useState(false)
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
  const diorama = scenes.find((d) => d.id === which) ?? DIORAMAS[0]
  /** The scene whose palette, finish and view are set. */
  const dressed = useRef(which)
  /** The scene picker: the modal of every scene's card. */
  const [picking, setPicking] = useState(false)
  const [playing, setPlaying] = useState(!calm)
  // a phone starts a step lighter, and a step lighter again for the styles that draw the scene several times a frame
  // (outlines, ASCII, cel shading), as Brush and Ink does; once the visitor picks a detail it is theirs for every style
  const [chosen, setChosen] = useState<string | undefined>(() => detailAsked(DETAIL, labelNames)?.id)
  /** How the scene is drawn: as pixel art, or as one of Brush and Ink's looks. `?style=oil` opens on that one. */
  const [style, setStyle] = useState<Style>(() => styleAsked(new URLSearchParams(location.search).get('style')))
  const pixels = style === 'pixel'
  // cel shading lights the blobs itself, so its scene is cut with no light baked in
  const plain = style === 'cel'
  const detail = chosen ?? (coarse ? DETAIL[pixels ? 1 : 0].id : DETAIL[2].id)
  const [palette, setPalette] = useState('own')
  const [size, setSize] = useState(2)
  const [dither, setDither] = useState(diorama.finish.dither)
  const [glow, setGlow] = useState(() => { const q = new URLSearchParams(location.search).get('glow'), v = q === null ? NaN : Number(q); return Number.isFinite(v) ? Math.min(4, Math.max(0, v)) : diorama.finish.glow })
  /** Glow as the poser reads it: it scales the light the scene's lamps and fires cast, as well as the shine round bright pixels. */
  const glowNow = useRef(glow)
  glowNow.current = glow
  const [outline, setOutline] = useState(diorama.finish.outline)
  const [edges, setEdges] = useState(diorama.finish.edges)
  const [sky, setSky] = useState(diorama.finish.sky)
  const [steady, setSteady] = useState(() => new URLSearchParams(location.search).get('steady') !== '0')
  // a scene's own gentle rocking of the view: every pixel of a still thing changes as the view turns, so it can be held
  const [rock, setRock] = useState(() => new URLSearchParams(location.search).get('rock') !== '0')
  const [tidy, setTidy] = useState(() => new URLSearchParams(location.search).get('tidy') !== '0')
  const [fine, setFine] = useState(() => new URLSearchParams(location.search).get('fine') !== '0')
  const [own, setOwn] = useState(() => new URLSearchParams(location.search).get('own') !== '0')
  /** Painted in steps of the palette as the scene is cut: the scene's own choice unless the address says. */
  const [steps, setSteps] = useState(() => { const q = new URLSearchParams(location.search).get('steps'); return q === null ? diorama.finish.steps : q !== '0' })
  const [rate, setRate] = useState(0)
  const [exact, setExact] = useState(() => new URLSearchParams(location.search).get('sort') === 'radix')
  const [parts, setParts] = useState(() => new URLSearchParams(location.search).get('parts') !== '0')
  const [view, setView] = useState(diorama.views[0].id)
  const [orbit, setOrbit] = useState<Orbit>(diorama.views[0].orbit)
  const [art, setArt] = useState<{ width: number; height: number }>()
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')
  /** Frames recorded so far while Record the loop runs. */
  const [recording, setRecording] = useState<number | null>(null)
  /** What Record the loop saves: a lossless animated PNG at the art's own size, or an MP4 scaled up in whole pixels. */
  const [recordAs, setRecordAs] = useState<'png' | 'mp4'>('png')
  const [videoSize, setVideoSize] = useState(6)
  const [pngSize, setPngSize] = useState(4)
  const [recordFps, setRecordFps] = useState(RECORD_FPS)

  // built after a paint, so the waiting mark shows first
  const [made, setScene] = useState<{ built: Built; of: Diorama; detail: string; paint: string; plain: boolean }>()
  // Painting in steps happens as a scene is cut, in the palette picked. While another scene is being cut the controls
  // are still the old one's, so the new one is cut with its own palette and its own choice, which it then brings along.
  const settled = !made || made.of === diorama
  const paintId = settled ? palette : 'own'
  const stepColors = (settled ? steps : diorama.finish.steps) ? (paintId === 'own' ? diorama.palette.colors : PALETTES.find((p) => p.id === paintId)?.colors ?? []) : []
  const paint = stepColors.length ? paintId : ''
  // the scene asked for, once it is cut: until then the loading note (and its announcement) shows
  const scene = made?.of === diorama && made.detail === detail && made.paint === paint && made.plain === plain ? made : undefined
  // what is in the view now: the last scene built, which lags the one picked while it is being cut.
  // It is kept until the new one replaces it, so the old scene never wears the new one's palette or sky.
  const shown = made?.of ?? diorama
  useEffect(() => {
    const spacing = DETAIL.find((d) => d.id === detail)!.spacing
    // Cutting holds the main thread for the whole wait, so the waiting mark has to be drawn and its
    // animation handed to the compositor first: two frames, then a beat, before the cut starts.
    let t: ReturnType<typeof setTimeout> | undefined
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        t = setTimeout(() => {
          if (!settled) { setPalette('own'); setSteps(diorama.finish.steps) }
          // a scene with water works one loop of its ripples out here too, while the waiting mark shows
          diorama.water?.()
          const cut = () => diorama.make(spacing, stepColors.length ? stepColors : undefined)
          setScene({ built: plain ? unlit(cut) : cut(), of: diorama, detail, paint, plain })
        }, 60)
      })
    })
    return () => { cancelAnimationFrame(raf); clearTimeout(t) }
    // `paint` stands for the colors and for whose controls these are
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, diorama, paint, plain])

  useEffect(() => {
    let live: CreatureStage | undefined, gone = false
    import('./creature/stage.ts')
      .then(({ CreatureStage }) => CreatureStage.start(canvas.current!, { offscreen, lights: true, webgl }))
      .then((s) => {
        if (gone) { s.dispose(); return }
        live = s
        s.onFirstFrame = () => setDrawn(true)
        s.setFloor(0)
        setStage(s)
      }, (e: unknown) => { console.warn(e); setFailed('This browser could not start WebGPU or WebGL 2, which the scene needs.') })
    return () => { gone = true; live?.dispose() }
  }, [offscreen, webgl])

  // the scene's own palette first, then the shared ones
  const palettes = useMemo(() => [{ id: 'own', ...shown.palette }, ...PALETTES.slice(1)], [shown])
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
  const look = useMemo<PixelLook>(() => ({ palette: colors, dither, outline: outline ? (colors.length ? darkest(colors) : [11, 16, 38]) : null, glow, edges: edges ? 1 : 0, parts, sky: sky ? shown.sky : undefined, steady: steady ? STEADY : 0, tidy, fine, own }), [colors, dither, outline, glow, edges, parts, sky, shown, steady, tidy, fine, own])

  // the exact (radix) sort: the stage rebuilds its world, keeping the moment and the poser
  useEffect(() => { stage?.setSort(exact ? 'radix' : 'bins') }, [stage, exact])

  // a new level of detail keeps the moment it was showing
  useEffect(() => {
    if (!stage || !scene) return
    const from = stage.time
    // a scene's water is drawn by blobs of its own, in the same world: they move with the water, not with a bone
    const pond = scene.of.water?.()
    stage.setActor(scene.built, undefined, pond ? [pond.surface] : [])
    seen.current = null
    // the surface as it stands at the stage's time, for the eye as it stands: after a pose, a turn of the view or a new picture in the mirror
    wet.current = pond && (() => {
      const o = stage.orbit, a = (o.azimuth * Math.PI) / 180, e = (o.elevation * Math.PI) / 180
      const eye = [o.target[0] + o.distance * Math.sin(a) * Math.cos(e), o.target[1] + o.distance * Math.sin(e), o.target[2] + o.distance * Math.cos(a) * Math.cos(e)]
      pond.show(stage.time, eye, { mirror: seen.current })
      stage.reshape(pond.surface)
    })
    // it mirrors what stands round it: the scene drawn once more as its mirror image (a second sort and a small draw, so only with WebGPU)
    stage.setMirror(pond && mirrored ? { plane: levelPlane(pond.plan.level), lift: pond.plan.cell * 0.75, seen: (image) => { seen.current = image; wet.current?.() } } : undefined)
    pokes.current = new Pokes(scene.built.skeleton)
    // lights move with the bones (the lamp's beam with its lens, the fire's glow with its flames), so both are set from the same time
    const d = scene.of
    posed.current = d
    stage.setShadowDensity(d.shadowDensity)
    // a new scene brings its own palette, finish and view, now that it is the one in the view
    if (dressed.current !== d.id) {
      dressed.current = d.id
      setPalette('own')
      setDither(d.finish.dither); setGlow(d.finish.glow); setOutline(d.finish.outline); setEdges(d.finish.edges); setSky(d.finish.sky)
      setView(d.views[0].id); setOrbit(d.views[0].orbit)
    }
    stage.setPoser((sk: Skeleton, t: number) => {
      d.pose(sk, t)
      pokes.current?.apply(sk, performance.now() / 1000)
      stage.setLights(castBy(d.lights(t, stage.backend === 'webgpu'), glowGain(glowNow.current, d.finish.glow)), d.ambientAt?.(t) ?? d.ambient ?? 1)
      // a scene whose sky turns as it plays (day to night) hands the pixel pass each moment's sky
      skyNow.current?.(d, t)
      // a scene that asks for it rocks the view gently as it plays, about wherever the view has been turned to
      if (d.swing && !calm && rock) stage.orbit = swung(orbitNow.current, d.swing, d.loop, t)
      wet.current?.()
    }, from)
  }, [stage, scene, calm, rock, mirrored])
  // one of Brush and Ink's looks in place of pixel art: marks, outlines, characters or cel tones, with their own settings
  const drawing = useDrawnLook(stage, pixels || touring ? undefined : style, { actor: scene?.built, plain: !!scene?.plain, azimuth: shown.views[0].orbit.azimuth, offscreen, light: coarse, sky: shown.finish.sky ? [shown.sky[0], shown.sky[1]] : undefined })
  // the walk-through's fourth step is about the four samples, so it draws them whatever the switch says
  const sampling = touring?.id === 'samples'
  const drawnLook = useMemo(() => (asPixels ? (sampling ? { ...look, fine: true } : look) : undefined), [asPixels, sampling, look])
  // on a phone the styles that fill the whole screen (pixel art fills a small frame) are drawn at one and a half device
  // pixels to a CSS pixel, not two: every pass has near half the pixels to fill, and the marks are no finer than that
  useEffect(() => { stage?.setSharpness(coarse && !asPixels ? 1.5 : 2) }, [stage, coarse, asPixels])
  useEffect(() => {
    if (!stage) return
    stage.setPixels(drawnLook, size)
    // set again only when the sky has changed, so a paused scene is not drawn over and over
    let last = ''
    skyNow.current = (d, t) => {
      if (!d.skyAt || !drawnLook?.sky) return
      const [top, low] = d.skyAt(t), key = `${top}|${low}`
      if (key === last) return
      last = key
      stage.setPixels({ ...drawnLook, sky: [top, low, drawnLook.sky[2]] }, size)
    }
    const d = posed.current
    if (d) skyNow.current(d, stage.time)
  }, [stage, drawnLook, size])
  useEffect(() => {
    if (!stage) return
    const keep = touring?.keep ?? 1
    // in clay, and with only some of the blobs drawn where the step shows them one by one
    stage.tint(touring?.clay ? (c, i) => [...clay(c), kept(i, keep) ? 1 : 0] : undefined)
  }, [stage, touring])
  useEffect(() => { if (stage) stage.playing = playing }, [stage, playing])
  useEffect(() => { if (stage) { stage.step = pixels && rate ? 1 / rate : 0; stage.invalidate() } }, [stage, pixels, rate])
  const orbitNow = useRef(orbit)
  /** A scene's water: shapes and colors its surface for the moment and the view, and the last picture of what it mirrors. */
  const wet = useRef<(() => void) | undefined>(undefined)
  const seen = useRef<MirrorImage | null>(null)
  const posed = useRef<Diorama | undefined>(undefined)
  /** Hands the pixel pass the sky of the moment, for a scene whose sky turns as it plays. */
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
    stage.orbit = d && !calm && rock ? swung(orbit, d.swing, d.loop, stage.time) : orbit
    // haze is measured from the view's target, so it stays put on the scene as the view moves in and out
    const h = d?.haze
    stage.setFog(h?.color ?? [0, 0, 0], h ? orbit.distance + h.from : 0, h ? orbit.distance + h.to : 0)
    wet.current?.()
    stage.invalidate()
  }, [stage, orbit, scene, calm, rock])
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
    window.__diorama = { stage, blobs: () => stage.blobCount, bones: () => scene.built.skeleton.count, look: () => look, style, water: () => scene.of.water?.(), mirrored }
    return () => { delete window.__diorama }
  }, [stage, scene, look, style, mirrored])

  /**
   * Records one whole loop as the art stands (palette, size, finish), stepped frame by frame from the time so it joins
   * up end to end, and saves it as a lossless animated PNG (each art pixel `pngSize` pixels a side) or an MP4.
   */
  const record = async () => {
    if (!stage || recording !== null) return
    const fps = recordFps, loop = shown.loop, count = Math.round(loop * fps), was = playing
    setPlaying(false)
    stage.playing = false
    setRecording(0)
    setNote('Recording the loop, one frame at a time…')
    try {
      // the half second before the start first, so steady pixels have a frame before frame 0
      for (let i = Math.round(fps / 2); i > 0; i--) await stage.frame(loop - i / fps)
      const frames: Frame[] = []
      for (let f = 0; f < count; f++) {
        await stage.frame(f / fps)
        const got = await stage.pixelFrames()
        if (!got) throw new Error('pixel art went away')
        frames.push(got.art)
        if (f % 6 === 0) setRecording(f)
      }
      setRecording(count)
      const { width: w, height: h } = frames[0]
      if (recordAs === 'mp4') {
        const { encodeVideo, videoScale } = await import('./diorama/video.ts')
        const s = videoScale(w, h, videoSize)
        const bytes = await encodeVideo(frames, fps, s)
        download(bytes, `pixel-diorama-${shown.id}-loop.mp4`, 'video/mp4')
        setNote(`Saved the loop: ${count} frames at ${w * s} × ${h * s}, an MP4 of ${kilobytes(bytes.length)}.`)
      } else {
        // each art pixel a square of whole pixels, so a bigger picture is as crisp as the art
        const bytes = await encodeApng(frames.map((f) => enlarged(f, pngSize)), fps, browserDeflate)
        download(bytes, `pixel-diorama-${shown.id}-loop.png`, 'image/png')
        setNote(`Saved the loop: ${count} frames at ${w * pngSize} × ${h * pngSize}, an animated PNG of ${kilobytes(bytes.length)}.`)
      }
    } catch (e) {
      console.warn(e)
      setNote(recordAs === 'mp4' && String(e).includes('MP4') ? 'This browser can’t make an MP4. The animated PNG works everywhere.' : 'The loop could not be recorded. Keep the settings and size as they are while it records.')
    } finally {
      setRecording(null)
      stage.playing = was
      setPlaying(was)
    }
  }

  const save = async () => {
    if (!stage) return
    setSaving(true)
    setNote('')
    try {
      const frames = await stage.pixelFrames()
      if (!frames) return
      download(await toPng(frames.art, 4), `pixel-diorama-${shown.id}.png`, 'image/png')
      setNote(`Saved a ${frames.art.width * 4} × ${frames.art.height * 4} PNG.`)
    } catch (e) {
      console.warn(e)
      setNote('The picture could not be saved.')
    } finally {
      setSaving(false)
    }
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
  /** Another style. The address names it, as it names the scene, so a shared link opens the same picture. */
  const draw = (id: Style) => {
    setStyle(id)
    setNote('')
    const url = new URL(location.href)
    if (id === 'pixel') url.searchParams.delete('style')
    else url.searchParams.set('style', id)
    history.replaceState(history.state, '', url)
  }
  /** Another scene. It is cut first; its palette, finish and view follow when it reaches the view. */
  const show = (id: string) => {
    if (id === which) return
    setWhich(id)
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
  const loading = !failed && (!drawn || !scene)
  const loadingLabel = stage ? 'Cutting the scene into blobs…' : 'Starting the splat engine…'

  return (
    <div className="pb-4">
      <Crumbs here="Pixel Diorama" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Pixel Diorama</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          Small scenes made of blobs and drawn as pixel art while they move. Each one is real 3D, so you can turn it,
          and every frame is cut down to a few colors on a coarse grid of pixels. Pick a scene, change the palette and
          the pixel size, or pick another style to see it painted, inked, cel shaded or typed out in characters.
        </p>
      </header>
      {facts && <SceneDetails open={details} onClose={() => setDetails(false)} facts={facts} />}
      <Workbench
        viewLabel="The scene"
        view={<>
              {drawing.ground && <div aria-hidden className="absolute inset-0" style={{ background: drawing.ground }} data-testid="diorama-ground" />}
              <canvas
                ref={canvas}
                role="application"
                aria-roledescription="3D view"
                aria-label={`${shown.about}, ${asPixels ? 'drawn as pixel art' : touring?.clay ? 'drawn as blobs in plain clay' : `drawn ${styleWords(touring ? 'blobs' : style)}`}, ${failed ? 'not drawn' : playing ? 'moving' : 'paused'}. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.${canPoke ? ' Tap or press Enter to poke it.' : ''}`}
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
              {loading && <LoadingMark testid="diorama-loading" />}
              <p role="status" className="sr-only">{loading ? loadingLabel : ''}</p>
              {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
              {touring?.id === 'samples' && stage && scene && <Magnifier stage={stage} />}
              <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => pick(view)} />
              {!sampling && <p aria-hidden className="pointer-events-none absolute right-14 bottom-2 rounded bg-paper/80 px-1.5 py-0.5 text-xs text-ink-muted">{coarse ? 'drag to orbit · pinch to zoom' : 'drag to orbit · scroll to zoom'}</p>}
        </>}
        status={tour !== null && made ? <TourStrip step={tour} facts={{ parts: made.of.parts ?? new Set(made.built.partOf).size, descriptionBytes: made.of.bytes, blobs: made.built.blobs.count, colors: colors.length, steps: made.paint !== '', lines: !outline ? 'none' : own ? 'own' : 'one' }} onStep={setTour} onClose={closeTour} /> : <>
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
                <Field label="Drawn as">
                  <div className="flex flex-wrap gap-1.5" data-testid="diorama-styles">
                    {STYLES.map((l) => <Chip key={l.id} active={style === l.id} onClick={() => draw(l.id)}>{l.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">{STYLES.find((l) => l.id === style)?.note}</p>
                </Field>
                {drawing.controls}
                {pixels && <Field label="Palette">
                  <div className="flex flex-wrap gap-1.5">
                    {palettes.map((p) => <Chip key={p.id} active={palette === p.id} onClick={() => setPalette(p.id)}>{p.label}</Chip>)}
                  </div>
                  <div data-testid="palette-strip" aria-hidden className="mt-5 flex h-3 overflow-hidden rounded ring-1 ring-rule">
                    {colors.length ? colors.map((c, i) => <span key={i} className="flex-1" style={{ background: `rgb(${c[0]} ${c[1]} ${c[2]})` }} />) : <span className="flex-1 bg-paper-sunk" />}
                  </div>
                  <p className="mt-2 text-xs text-ink-faint">
                    {!colors.length ? 'No palette: every pixel keeps the color the scene gives it, in as many colors as it takes.'
                      : palette === 'own' ? `The ${colors.length} colors chosen for this scene. Every pixel snaps to the closest one.`
                        : `${('note' in picked && picked.note) || `A borrowed palette of ${colors.length} colors.`} Every pixel snaps to the closest one.`}
                  </p>
                </Field>}
                {pixels && <Field label="Pixel size">
                  <div className="flex flex-wrap gap-1.5">
                    {SIZES.map((n) => <Chip key={n} active={size === n} onClick={() => setSize(n)}>{n}×</Chip>)}
                  </div>
                </Field>}
                {pixels && <Field label="Motion">
                  <div className="flex flex-wrap gap-1.5">
                    {RATES.map((n) => <Chip key={n} active={rate === n} onClick={() => setRate(n)}>{n ? `${n} a second` : 'Smooth'}</Chip>)}
                  </div>
                </Field>}
              </div>
            ),
          },
          {
            id: 'finish', label: 'Finish', content: (
              <div className={TAB_SECTIONS}>
                {pixels && <Slider label="Dither" value={dither} min={0} max={1} step={0.05} onChange={setDither} format={(v) => `${Math.round(v * 100)}%`} hint={colors.length ? (sky ? 'Checkers two palette colors to fake the ones between. The sky is always dithered, so its bands blend.' : 'Checkers two palette colors to fake the ones between.') : 'Needs a palette: Full color has none to mix.'} />}
                <Slider label="Glow" value={glow} min={0} max={4} step={0.25} onChange={setGlow} format={(v) => (v ? `${v.toFixed(2)}×` : 'off')} hint={pixels ? 'How strongly lamps, fires and other glowing things light what is round them, and how far bright pixels shine into the ones beside them.' : 'How strongly lamps, fires and other glowing things light what is round them.'} />
                <div className="grid gap-3">
                {!pixels && <p className="text-xs text-ink-faint">Dither, outlines and the sky belong to the Pixel art style. Pick it in the Style tab to change them.</p>}
                {pixels && <>
                <Toggle label="Four samples a pixel" checked={fine} onChange={setFine} />
                <p className="text-xs text-ink-faint">Draws the scene at twice the size and gives each pixel the thing most of its four samples show, so edges are one thing or the other, never a mix.</p>
                <Toggle label="Paint in steps of the palette" checked={steps} onChange={setSteps} disabled={!colors.length} />
                <p className="text-xs text-ink-faint">{colors.length ? 'Cuts the scene again with every blob in one palette color, a step of its own paint from shade to sun, so shade falls in flat bands.' : 'Needs a palette: Full color has no steps.'}</p>
                <Toggle label="Outline the scene" checked={outline} onChange={setOutline} />
                <Toggle label="Outline in each thing's own color" checked={own} onChange={setOwn} disabled={!outline} />
                <Toggle label="Lines where colors meet" checked={edges} onChange={setEdges} />
                <Toggle label="Lines between parts" checked={parts} onChange={setParts} />
                <Toggle label="Sky behind" checked={sky} onChange={setSky} />
                <Toggle label="Steady pixels" checked={steady} onChange={setSteady} />
                <Toggle label="Clean up lone pixels" checked={tidy} onChange={setTidy} />
                </>}
                <Toggle label="Rock the view" checked={rock} onChange={setRock} disabled={calm} />
                <Toggle label="Exact sort (slower)" checked={exact} onChange={setExact} />
                <p className="text-xs text-ink-faint">Draws blobs at the same depth in one fixed order, so flat walls can't flicker. It costs about 10 ms a frame on a phone at 500,000 blobs.</p>
                </div>
                {pixels && <div className="grid gap-3">
                <Field label="Record the loop as">
                  <div className="flex flex-wrap gap-1.5">
                    <Chip active={recordAs === 'png'} onClick={() => setRecordAs('png')}>Animated PNG</Chip>
                    <Chip active={recordAs === 'mp4'} onClick={() => setRecordAs('mp4')}>MP4 video</Chip>
                  </div>
                </Field>
                <Field label="Frames a second">
                  <div className="flex flex-wrap gap-1.5">
                    {RECORD_RATES.map((r) => <Chip key={r} active={recordFps === r} onClick={() => setRecordFps(r)}>{String(r)}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">24 takes twice as long to record and suits a scene where things move fast.</p>
                </Field>
                {recordAs === 'png' && <Field label="Picture size">
                  <div className="flex flex-wrap gap-1.5">
                    {[1, 2, 4, 6].map((s) => <Chip key={s} active={pngSize === s} onClick={() => setPngSize(s)}>{`${s}×`}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">How many pixels wide each pixel of the art is saved. 1× is the art's own size.</p>
                </Field>}
                {recordAs === 'mp4' && <Field label="Video size">
                  <div className="flex flex-wrap gap-1.5">
                    {[4, 6, 8].map((s) => <Chip key={s} active={videoSize === s} onClick={() => setVideoSize(s)}>{`${s}×`}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">How many pixels wide each pixel of the art is in the video.</p>
                </Field>}
                <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button small disabled={!!touring || !drawn || saving || recording !== null} onClick={save}>{saving ? 'Saving…' : 'Save this frame'}</Button>
                  <Button small disabled={!!touring || !drawn || saving || recording !== null} onClick={record} data-testid="diorama-record">{recording === null ? 'Record the loop' : recording >= Math.round(shown.loop * recordFps) ? 'Saving the loop…' : `Recording ${recording} of ${Math.round(shown.loop * recordFps)}…`}</Button>
                </div>
                <p role="status" className="text-xs text-ink-faint empty:-mt-2">{touring ? 'Close How it\'s made to save a frame or record the loop.' : note}</p>
                </div>
                </div>}
                {!pixels && <p className="text-xs text-ink-faint">Saving a frame and recording the loop are for pixel art. For this style, the record button on the view saves a video of what it shows.</p>}
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
