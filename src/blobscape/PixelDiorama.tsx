import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import { darkest, type Frame, type PixelLook, type Rgb } from '../splat-core/pixel.ts'
import type { Built } from '../splat-engine/body.ts'
import { Button, Chip, Field, Slider, Toggle } from '../shared/ui.tsx'
import { Mark } from '../shared/Logo.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import { href } from './routes.ts'
import { download } from './files.ts'
import type { CreatureStage } from './creature/stage.ts'
import { CARD, CARD_SUB, CARD_TITLE } from './creature/card.ts'
import { DETAIL, LOOP, PALETTES, lampLights, makeDiorama, poseDiorama } from './diorama/scene.ts'
import type { Skeleton } from '../splat-engine/rig.ts'

const SIZES = [2, 3, 4, 6]
/** The dusk sky behind the scene, top and bottom; the palette in use turns it into its own bands. */
const SKY: [Rgb, Rgb] = [[9, 13, 32], [60, 94, 164]]
const VIEWS: { id: string; label: string; orbit: Orbit }[] = [
  { id: 'shore', label: 'From the shore', orbit: { target: [0.1, 0.95, 0.1], distance: 4.3, azimuth: 28, elevation: 10 } },
  { id: 'above', label: 'From above', orbit: { target: [0, 0.7, 0], distance: 6.2, azimuth: 40, elevation: 38 } },
  { id: 'lamp', label: 'The lamp', orbit: { target: [0.05, 1.35, -0.05], distance: 2.0, azimuth: 20, elevation: 6 } },
  { id: 'cottage', label: 'The cottage', orbit: { target: [-0.3, 0.4, 0.15], distance: 2.0, azimuth: 10, elevation: 14 } },
  { id: 'boat', label: 'The boat', orbit: { target: [0.85, 0.2, 0.75], distance: 2.0, azimuth: 55, elevation: 16 } },
]

declare global {
  interface Window { __diorama?: { stage: CreatureStage; blobs: () => number; bones: () => number; look: () => PixelLook } }
}

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
  const [playing, setPlaying] = useState(!calm)
  const [detail, setDetail] = useState<string>(coarse ? DETAIL[1].id : DETAIL[2].id)
  const [pixels, setPixels] = useState(true)
  const [palette, setPalette] = useState(PALETTES[0].id)
  const [size, setSize] = useState(2)
  const [dither, setDither] = useState(0.1)
  const [glow, setGlow] = useState(1.5)
  const [outline, setOutline] = useState(true)
  const [edges, setEdges] = useState(true)
  const [sky, setSky] = useState(true)
  const [view, setView] = useState(VIEWS[0].id)
  const [orbit, setOrbit] = useState<Orbit>(VIEWS[0].orbit)
  const [art, setArt] = useState<{ width: number; height: number }>()
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')

  // built after a paint, so the loading note shows first
  const [scene, setScene] = useState<Built>()
  useEffect(() => {
    const spacing = DETAIL.find((d) => d.id === detail)!.spacing
    // the old scene stays in the view; clearing this one brings the loading note (and its announcement) back while the new one is cut
    setScene(undefined)
    const t = setTimeout(() => setScene(makeDiorama(spacing)), 30)
    return () => clearTimeout(t)
  }, [detail])

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

  const colours = PALETTES.find((p) => p.id === palette)!.colours
  const look = useMemo<PixelLook>(() => ({ palette: colours, dither, outline: outline ? (colours.length ? darkest(colours) : [11, 16, 38]) : null, glow, edges: edges ? 1 : 0, sky: sky ? SKY : undefined }), [colours, dither, outline, glow, edges, sky])

  // a new level of detail keeps the moment it was showing
  useEffect(() => {
    if (!stage || !scene) return
    const from = stage.time
    stage.setActor(scene)
    // the lamp's light sweeps with its lens, so both are set from the same time
    stage.setPoser((sk: Skeleton, t: number) => { poseDiorama(sk, t); stage.setLights(lampLights(t), 1) }, from)
  }, [stage, scene])
  useEffect(() => { stage?.setPixels(pixels ? look : undefined, size) }, [stage, pixels, look, size])
  useEffect(() => { if (stage) stage.playing = playing }, [stage, playing])
  useEffect(() => { if (stage) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit])
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
    window.__diorama = { stage, blobs: () => stage.blobCount, bones: () => scene.skeleton.count, look: () => look }
    return () => { delete window.__diorama }
  }, [stage, scene, look])

  const save = async () => {
    if (!stage) return
    setSaving(true)
    setNote('')
    try {
      const frames = await stage.pixelFrames()
      if (!frames) return
      download(await toPng(frames.art, 4), 'pixel-diorama.png', 'image/png')
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
  const pick = (id: string) => { setView(id); setOrbit(VIEWS.find((v) => v.id === id)!.orbit) }
  const backend = stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'
  const loading = !failed && (!drawn || !scene)
  const loadingLabel = stage ? 'Cutting the scene into blobs…' : 'Starting the splat engine…'

  return (
    <div className="pb-4">
      <Crumbs here="Pixel Diorama" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Pixel Diorama</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          A lighthouse at dusk, made of blobs and drawn as pixel art while it moves. The scene is real 3D, so you can turn it,
          and every frame is cut down to a few colours on a coarse grid of pixels. Change the palette and the pixel size, or
          switch the pixels off to see the blobs underneath.
        </p>
      </header>
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:gap-x-5">
        <section aria-label="The scene" className="lg:col-span-12">
          <div className="case relative overflow-hidden rounded-2xl ring-1 ring-rule">
            <div className="relative h-[min(60dvh,480px)] min-h-[280px] lg:h-[clamp(380px,calc(100dvh-22rem),700px)]">
              <canvas
                ref={canvas}
                role="application"
                aria-roledescription="3D view"
                aria-label={`A lighthouse and a cottage on a rock in the sea at dusk, with a turning lamp, pines, a jetty, a small boat, gulls and clouds, ${pixels ? 'drawn as pixel art' : 'drawn as blobs'}, ${failed ? 'not drawn' : playing ? 'moving' : 'paused'}. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.`}
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
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-rule-soft px-4 py-2 text-xs leading-relaxed text-ink-muted sm:text-sm">
              <span>{scene ? <><span className="tabular-nums text-ink" data-testid="diorama-blobs">{scene.blobs.count.toLocaleString()}</span> blobs on <span className="tabular-nums text-ink">{scene.skeleton.count}</span> bones.</> : loadingLabel}</span>
              <span data-testid="diorama-art">{pixels && art ? <>Drawn at <span className="tabular-nums text-ink">{art.width} × {art.height}</span> pixels{colours.length ? <> in <span className="tabular-nums text-ink">{colours.length}</span> colours</> : ''}.</> : 'Drawn as blobs, at full size.'}</span>
            </div>
          </div>
        </section>

        <section aria-label="Controls" className={CARD}>
          <div className="stack-controls grid items-start gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            <div role="group" aria-labelledby="d-pixels">
              <h2 id="d-pixels" className={CARD_TITLE}>Pixels</h2>
              <div className="grid gap-4">
                <Field label="Palette">
                  <div className="flex flex-wrap gap-1.5">
                    {PALETTES.map((p) => <Chip key={p.id} active={palette === p.id} onClick={() => { setPalette(p.id); setPixels(true) }}>{p.label}</Chip>)}
                  </div>
                  <div aria-hidden className="mt-2 flex h-3 overflow-hidden rounded ring-1 ring-rule">
                    {colours.length ? colours.map((c, i) => <span key={i} className="flex-1" style={{ background: `rgb(${c[0]} ${c[1]} ${c[2]})` }} />) : <span className="flex-1 bg-paper-sunk" />}
                  </div>
                </Field>
                <Field label="Pixel size">
                  <div className="flex flex-wrap gap-1.5">
                    {SIZES.map((n) => <Chip key={n} active={size === n} onClick={() => { setSize(n); setPixels(true) }}>{n}×</Chip>)}
                  </div>
                </Field>
              </div>
            </div>
            <div role="group" aria-labelledby="d-finish">
              <h2 id="d-finish" className={CARD_TITLE}>Finish</h2>
              <div className="grid gap-4">
                <Slider label="Dither" value={dither} min={0} max={1} step={0.05} onChange={setDither} format={(v) => `${Math.round(v * 100)}%`} hint={!pixels ? 'Applies to Pixel art.' : colours.length ? 'Checkers two palette colours to fake the ones between.' : 'Needs a palette: Scene colours has none to mix.'} />
                <Slider label="Glow" value={glow} min={0} max={4} step={0.25} onChange={setGlow} format={(v) => (v ? `${v.toFixed(2)}×` : 'off')} hint={pixels ? 'Bright pixels light the ones beside them.' : 'Applies to Pixel art.'} />
                <Toggle label={pixels ? 'Outline the scene' : 'Outline the scene (in Pixel art)'} checked={outline} onChange={setOutline} />
                <Toggle label={pixels ? 'Lines where colours meet' : 'Lines where colours meet (in Pixel art)'} checked={edges} onChange={setEdges} />
                <Toggle label={pixels ? 'Sky behind' : 'Sky behind (in Pixel art)'} checked={sky} onChange={setSky} />
              </div>
            </div>
            <div role="group" aria-labelledby="d-scene" className="sm:col-span-2 lg:col-span-1">
              <h2 id="d-scene" className={CARD_TITLE}>Scene <small className={CARD_SUB}>repeats every {LOOP} seconds</small></h2>
              <div className="grid gap-4">
                <Field label="View">
                  <div className="flex flex-wrap gap-1.5">
                    {VIEWS.map((v) => <Chip key={v.id} active={view === v.id} onClick={() => pick(v.id)}>{v.label}</Chip>)}
                  </div>
                </Field>
                <Field label="Blobs">
                  <div className="flex flex-wrap gap-1.5">
                    {DETAIL.map((d) => <Chip key={d.id} active={detail === d.id} onClick={() => setDetail(d.id)}>{d.label}</Chip>)}
                  </div>
                </Field>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button small onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</Button>
                  <Button small disabled={!pixels || !drawn || saving} onClick={save}>{saving ? 'Saving…' : 'Save this frame'}</Button>
                </div>
                <p role="status" className="min-h-4 text-xs text-ink-faint">{pixels ? note : 'Switch back to Pixel art to save a frame.'}</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section aria-labelledby="how-title" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-sm text-ink-faint">How it's made</p>
          <h2 id="how-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">Shapes, then blobs, then pixels</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            Nothing here was drawn or scanned. The rock, the tower, the cottage and the boat are written as simple shapes in code, and so are the bricks, the roof tiles and the planks: each is a rule for what colour a point on the shape should be. The scene is
            cut into a grid, and every grid cell on a shape's surface becomes one small, solid blob. The moonlight and the shadows
            are worked out once and painted into the blobs' colours.
          </p>
          <p>
            Each moving part hangs on a bone: the lamp turns, the boat rocks, the pines lean, smoke rises and the gulls circle and beat their wings. Each frame the
            scene is drawn very small, every pixel is snapped to the nearest colour of the palette, bright pixels spill a little
            light, a dark line is drawn where one colour meets a much lighter one, and the result is scaled up in whole pixels with no smoothing. Switch to Blobs to see the same frame before
            that last step.
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
