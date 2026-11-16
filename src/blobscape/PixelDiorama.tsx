import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import { STEADY, darkest, type Frame, type PixelLook } from '../splat-core/pixel.ts'
import type { Built } from '../splat-engine/body.ts'
import { Button, Chip, Field, Slider, Toggle } from '../shared/ui.tsx'
import { Mark } from '../shared/Logo.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import { href } from './routes.ts'
import { download } from './files.ts'
import type { CreatureStage } from './creature/stage.ts'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { DETAIL, PALETTES } from './diorama/scene.ts'
import { DIORAMAS, type Diorama } from './diorama/scenes.ts'
import type { Skeleton } from '../splat-engine/rig.ts'

const SIZES = [2, 3, 4, 6]
/** Frames a second the scene moves at: 0 is every frame the screen shows. */
const RATES = [0, 12, 8]
declare global {
  interface Window { __diorama?: { stage: CreatureStage; blobs: () => number; bones: () => number; look: () => PixelLook } }
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
export function PixelDiorama() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<CreatureStage>()
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState<string>()
  const offscreen = useMemo(() => new URLSearchParams(location.search).get('offscreen') === '1', [])
  const webgl = useMemo(() => new URLSearchParams(location.search).get('webgl') === '1', [])
  const calm = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const coarse = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches, [])
  // ?scene=campfire opens on that scene
  const [which, setWhich] = useState(() => DIORAMAS.find((d) => d.id === new URLSearchParams(location.search).get('scene'))?.id ?? DIORAMAS[0].id)
  const diorama = DIORAMAS.find((d) => d.id === which)!
  /** The scene whose palette, finish and view are set. */
  const dressed = useRef(which)
  const [playing, setPlaying] = useState(!calm)
  const [detail, setDetail] = useState<string>(coarse ? DETAIL[1].id : DETAIL[2].id)
  const [pixels, setPixels] = useState(true)
  const [palette, setPalette] = useState('own')
  const [size, setSize] = useState(2)
  const [dither, setDither] = useState(diorama.finish.dither)
  const [glow, setGlow] = useState(diorama.finish.glow)
  const [outline, setOutline] = useState(diorama.finish.outline)
  const [edges, setEdges] = useState(diorama.finish.edges)
  const [sky, setSky] = useState(diorama.finish.sky)
  const [steady, setSteady] = useState(() => new URLSearchParams(location.search).get('steady') !== '0')
  const [rate, setRate] = useState(0)
  const [parts, setParts] = useState(() => new URLSearchParams(location.search).get('parts') !== '0')
  const [view, setView] = useState(diorama.views[0].id)
  const [orbit, setOrbit] = useState<Orbit>(diorama.views[0].orbit)
  const [art, setArt] = useState<{ width: number; height: number }>()
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')

  // built after a paint, so the loading note shows first
  const [made, setScene] = useState<{ built: Built; of: Diorama; detail: string }>()
  // the scene asked for, once it is cut: until then the loading note (and its announcement) shows
  const scene = made?.of === diorama && made.detail === detail ? made : undefined
  // what is in the view now: the last scene built, which lags the one picked while it is being cut.
  // It is kept until the new one replaces it, so the old scene never wears the new one's palette or sky.
  const shown = made?.of ?? diorama
  useEffect(() => {
    const spacing = DETAIL.find((d) => d.id === detail)!.spacing
    const t = setTimeout(() => setScene({ built: diorama.make(spacing), of: diorama, detail }), 30)
    return () => clearTimeout(t)
  }, [detail, diorama])

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
  const colours = (palettes.find((p) => p.id === palette) ?? palettes[0]).colours
  const look = useMemo<PixelLook>(() => ({ palette: colours, dither, outline: outline ? (colours.length ? darkest(colours) : [11, 16, 38]) : null, glow, edges: edges ? 1 : 0, parts: edges && parts, sky: sky ? shown.sky : undefined, steady: steady ? STEADY : 0 }), [colours, dither, outline, glow, edges, parts, sky, shown, steady])

  // a new level of detail keeps the moment it was showing
  useEffect(() => {
    if (!stage || !scene) return
    const from = stage.time
    stage.setActor(scene.built)
    // lights move with the bones (the lamp's beam with its lens, the fire's glow with its flames), so both are set from the same time
    const d = scene.of
    posed.current = d
    // a new scene brings its own palette, finish and view, now that it is the one in the view
    if (dressed.current !== d.id) {
      dressed.current = d.id
      setPixels(true)
      setPalette('own')
      setDither(d.finish.dither); setGlow(d.finish.glow); setOutline(d.finish.outline); setEdges(d.finish.edges); setSky(d.finish.sky)
      setView(d.views[0].id); setOrbit(d.views[0].orbit)
    }
    stage.setPoser((sk: Skeleton, t: number) => {
      d.pose(sk, t)
      stage.setLights(d.lights(t), 1)
      // a scene that asks for it rocks the view gently as it plays, about wherever the view has been turned to
      if (d.swing && !calm) stage.orbit = swung(orbitNow.current, d.swing, d.loop, t)
    }, from)
  }, [stage, scene, calm])
  useEffect(() => { stage?.setPixels(pixels ? look : undefined, size) }, [stage, pixels, look, size])
  useEffect(() => { if (stage) stage.playing = playing }, [stage, playing])
  useEffect(() => { if (stage) { stage.step = pixels && rate ? 1 / rate : 0; stage.invalidate() } }, [stage, pixels, rate])
  const orbitNow = useRef(orbit)
  const posed = useRef<Diorama | undefined>(undefined)
  orbitNow.current = orbit
  // the scene being posed, which is the one whose swing applies: a scene just picked is not in the view until it is cut
  useEffect(() => {
    if (!stage) return
    const d = posed.current
    stage.orbit = d && !calm ? swung(orbit, d.swing, d.loop, stage.time) : orbit
    stage.invalidate()
  }, [stage, orbit, scene, calm])
  // the art's size follows the view's; read it now and then for the caption (it's text, not every frame)
  useEffect(() => {
    if (!stage) return
    const read = () => setArt((a) => { const n = stage.artSize; return n && a && n.width === a.width && n.height === a.height ? a : n })
    const id = setInterval(read, 400)
    read()
    return () => clearInterval(id)
  }, [stage, pixels, size])

  // For verify: the stage and the look in use, without clicking
  useEffect(() => {
    if (!stage || !scene) return
    window.__diorama = { stage, blobs: () => stage.blobCount, bones: () => scene.built.skeleton.count, look: () => look }
    return () => { delete window.__diorama }
  }, [stage, scene, look])

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
  useWheelZoom(canvas, setOrbit)
  const pick = (id: string) => { setView(id); setOrbit((shown.views.find((v) => v.id === id) ?? shown.views[0]).orbit) }
  /** Another scene. It is cut first; its palette, finish and view follow when it reaches the view. */
  const show = (id: string) => {
    if (id === which) return
    setWhich(id)
    setNote('')
    // the address names the scene, so a reload or a shared link opens the same one
    const url = new URL(location.href)
    if (id === DIORAMAS[0].id) url.searchParams.delete('scene')
    else url.searchParams.set('scene', id)
    history.replaceState(history.state, '', url)
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
          and every frame is cut down to a few colours on a coarse grid of pixels. Pick a scene, change the palette and
          the pixel size, or switch the pixels off to see the blobs underneath.
        </p>
      </header>
      <Workbench
        viewLabel="The scene"
        view={<>
              <canvas
                ref={canvas}
                role="application"
                aria-roledescription="3D view"
                aria-label={`${shown.about}, ${pixels ? 'drawn as pixel art' : 'drawn as blobs'}, ${failed ? 'not drawn' : playing ? 'moving' : 'paused'}. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.`}
                tabIndex={0}
                data-testid="diorama-view"
                className="absolute inset-0 h-full w-full cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset active:cursor-grabbing"
                onPointerDown={(ev) => {
                  ev.currentTarget.setPointerCapture(ev.pointerId)
                  pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
                  drag.current = beginOrbitDrag(pointers.current, ev, orbit)
                }}
                onPointerMove={(ev) => {
                  if (pointers.current.has(ev.pointerId)) pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
                  const d = drag.current
                  if (d) setOrbit(dragOrbit(d, pointers.current, ev))
                }}
                onPointerUp={(ev) => { pointers.current.delete(ev.pointerId); drag.current = null }}
                onPointerCancel={(ev) => { pointers.current.delete(ev.pointerId); drag.current = null }}
                onKeyDown={(ev) => {
                  if (!orbitKey(ev, orbit)) return
                  ev.preventDefault()
                  setOrbit((o) => orbitKey(ev, o) ?? o)
                }}
              />
              {loading && <Loading label={loadingLabel} />}
              <p role="status" className="sr-only">{loading ? loadingLabel : ''}</p>
              {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
              <div role="group" aria-label="Draw the scene as" className="absolute top-3 left-3 flex gap-1.5 max-sm:top-2 max-sm:left-2">
                <Chip small active={pixels} onClick={() => setPixels(true)}>Pixel art</Chip>
                <Chip small active={!pixels} onClick={() => setPixels(false)}>Blobs</Chip>
              </div>
              <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => pick(view)} />
              <p aria-hidden className="pointer-events-none absolute right-14 bottom-2 rounded bg-paper/80 px-1.5 py-0.5 text-xs text-ink-muted">{coarse ? 'drag to orbit · pinch to zoom' : 'drag to orbit · scroll to zoom'}</p>
        </>}
        status={<>
              <span>{scene ? <><span className="tabular-nums text-ink" data-testid="diorama-blobs">{scene.built.blobs.count.toLocaleString()}</span> blobs on <span className="tabular-nums text-ink">{scene.built.skeleton.count}</span> bones.</> : loadingLabel}</span>
              <span data-testid="diorama-art">{pixels && art ? <>Drawn at <span className="tabular-nums text-ink">{art.width} × {art.height}</span> pixels{colours.length ? <> in <span className="tabular-nums text-ink">{colours.length}</span> colours</> : ''}.</> : 'Drawn as blobs, at full size.'}</span>
        </>}
        tabsLabel="Options"
        tabs={[
          {
            id: 'scene', label: 'Scene', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Scene">
                  <div className="flex flex-wrap gap-1.5">
                    {DIORAMAS.map((d) => <Chip key={d.id} active={which === d.id} onClick={() => show(d.id)}>{d.label}</Chip>)}
                  </div>
                </Field>
                <Field label="View">
                  <div className="flex flex-wrap gap-1.5">
                    {shown.views.map((v) => <Chip key={v.id} active={view === v.id} onClick={() => pick(v.id)}>{v.label}</Chip>)}
                  </div>
                </Field>
                <Field label="Blobs">
                  <div className="flex flex-wrap gap-1.5">
                    {DETAIL.map((d) => <Chip key={d.id} active={detail === d.id} onClick={() => setDetail(d.id)}>{d.label}</Chip>)}
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
            id: 'pixels', label: 'Pixels', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Palette">
                  <div className="flex flex-wrap gap-1.5">
                    {palettes.map((p) => <Chip key={p.id} active={palette === p.id} onClick={() => { setPalette(p.id); setPixels(true) }}>{p.label}</Chip>)}
                  </div>
                  <div data-testid="palette-strip" aria-hidden className="mt-5 flex h-3 overflow-hidden rounded ring-1 ring-rule">
                    {colours.length ? colours.map((c, i) => <span key={i} className="flex-1" style={{ background: `rgb(${c[0]} ${c[1]} ${c[2]})` }} />) : <span className="flex-1 bg-paper-sunk" />}
                  </div>
                </Field>
                <Field label="Pixel size">
                  <div className="flex flex-wrap gap-1.5">
                    {SIZES.map((n) => <Chip key={n} active={size === n} onClick={() => { setSize(n); setPixels(true) }}>{n}×</Chip>)}
                  </div>
                </Field>
                <Field label="Motion">
                  <div className="flex flex-wrap gap-1.5">
                    {RATES.map((n) => <Chip key={n} active={rate === n} onClick={() => { setRate(n); setPixels(true) }}>{n ? `${n} a second` : 'Smooth'}</Chip>)}
                  </div>
                </Field>
              </div>
            ),
          },
          {
            id: 'finish', label: 'Finish', content: (
              <div className={TAB_SECTIONS}>
                <Slider label="Dither" value={dither} min={0} max={1} step={0.05} onChange={setDither} format={(v) => `${Math.round(v * 100)}%`} hint={!pixels ? 'Applies to Pixel art.' : colours.length ? (sky ? 'Checkers two palette colours to fake the ones between. The sky is always dithered, so its bands blend.' : 'Checkers two palette colours to fake the ones between.') : 'Needs a palette: Scene colours has none to mix.'} />
                <Slider label="Glow" value={glow} min={0} max={4} step={0.25} onChange={setGlow} format={(v) => (v ? `${v.toFixed(2)}×` : 'off')} hint={pixels ? 'Bright pixels light the ones beside them.' : 'Applies to Pixel art.'} />
                <div className="grid gap-3">
                <Toggle label={pixels ? 'Outline the scene' : 'Outline the scene (in Pixel art)'} checked={outline} onChange={setOutline} />
                <Toggle label={pixels ? 'Lines where colours meet' : 'Lines where colours meet (in Pixel art)'} checked={edges} onChange={setEdges} />
                <Toggle label={pixels ? 'Lines between parts' : 'Lines between parts (in Pixel art)'} checked={edges && parts} onChange={(on) => { setParts(on); if (on) setEdges(true) }} />
                <Toggle label={pixels ? 'Sky behind' : 'Sky behind (in Pixel art)'} checked={sky} onChange={setSky} />
                <Toggle label={pixels ? 'Steady pixels' : 'Steady pixels (in Pixel art)'} checked={steady} onChange={setSteady} />
                </div>
                <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button small disabled={!pixels || !drawn || saving} onClick={save}>{saving ? 'Saving…' : 'Save this frame'}</Button>
                </div>
                <p role="status" className="text-xs text-ink-faint empty:-mt-2">{pixels ? note : 'Switch back to Pixel art to save a frame.'}</p>
                </div>
              </div>
            ),
          },
        ]}
      />

      <section aria-labelledby="how-title" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-sm text-ink-faint">How it's made</p>
          <h2 id="how-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">Shapes, then blobs, then pixels</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            Nothing here was drawn or scanned. In the lighthouse scene, the rock, the tower, the cottage and the boat are written as simple shapes in code, and so are the bricks, the roof tiles and the planks: each is a rule for what colour a point on the shape should be. The scene is
            cut into a grid, and every grid cell on a shape's surface becomes one small, solid blob. The light and the shadows
            are worked out once and painted into the blobs' colours.
          </p>
          <p>
            Each moving part hangs on a bone: the lamp turns, the boat rocks, the pines lean, smoke rises and the gulls circle and beat their wings. Each frame the
            scene is drawn very small, every pixel is snapped to the nearest colour of the palette, bright pixels spill a little
            light, a dark line is drawn where one colour meets a much lighter one, and the result is scaled up in whole pixels with no smoothing. Switch to Blobs to see the same frame before
            that last step.
          </p>
          <p>
            The campfire, the dragon, the bee, the stone hand, the reef and the windmill go one step further: each is only a description, a list of shapes, paints, bones
            and moves with no code of its own, which is the kind of thing Claude can write from a sentence. The engine checks
            the description, then builds and plays it the same way.
          </p>
          <p>
            Blobscape's own splat engine draws it here on {backend}. The same steps turn creatures into sprite sheets
            in <a href={href({ page: 'creature' })} className="underline decoration-rule underline-offset-2 hover:text-accent">Splat Creatures</a>,
            and <a href="/experiments/splat-to-sprite/" className="underline decoration-rule underline-offset-2 hover:text-accent">Splat to Sprite</a> does
            it for a splat file of your own.
          </p>
        </div>
      </section>
    </div>
  )
}

function Loading({ label }: { label: string }) {
  return (
    <div aria-hidden data-testid="diorama-loading" className="pointer-events-none absolute inset-0 grid place-items-center">
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-paper/70 px-6 py-5 backdrop-blur-sm">
        <Mark className="creature-loading-mark h-10 w-auto" />
        <p className="text-sm text-ink">{label}</p>
      </div>
    </div>
  )
}
