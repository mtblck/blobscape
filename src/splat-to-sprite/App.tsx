import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Engine, FRAME_SHARE, meshFromBuilder, meshFromBytes, type View } from './engine.ts'
import { PRESETS } from './presets.ts'
import { PALETTES } from './palettes.ts'
import { baseline, packSheet, processFrames, shotsFor, tinkerkitSheet, type Layout, type PixelSettings, type Stages } from './sheet.ts'
import { SiteHeader } from '../shared/SiteHeader.tsx'
import { countColours, countSolid, rgbToHex, type Frame } from './pixel.ts'

const CAMERAS: { id: string; name: string; view: Partial<View>; note: string }[] = [
  { id: 'rpg', name: 'Top-down RPG', view: { elevation: 45, ortho: true }, note: 'Looking down at 45°, like most top-down adventures.' },
  { id: 'three', name: '¾ view', view: { elevation: 30, ortho: true }, note: 'Lower and friendlier: you see the front and the top.' },
  { id: 'side', name: 'Side-on', view: { elevation: 0, ortho: true }, note: 'Flat to the horizon, for platformers.' },
  { id: 'iso', name: 'Isometric', view: { elevation: 30, azimuth: 45, ortho: true }, note: 'Corner-on at 30°, the classic iso tile angle.' },
]

const SIZES = [16, 24, 32, 48, 64]
const LAYOUTS: { id: Layout; name: string }[] = [
  { id: 'single', name: 'Single sprite' },
  { id: 'dir4', name: '4 directions (Tinkerkit)' },
  { id: 'dir8', name: '8 directions' },
  { id: 'spin8', name: 'Spin, 8 frames' },
  { id: 'spin12', name: 'Spin, 12 frames' },
]

type PaletteChoice = 'auto' | 'none' | string
type Source = { kind: 'preset' | 'file'; id: string; name: string }

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<Source>({ kind: 'preset', id: 'mushroom', name: 'Toadstool' })
  const [loading, setLoading] = useState(true)
  const [splatCount, setSplatCount] = useState(0)
  const [upright, setUpright] = useState(false)

  const [view, setView] = useState<View>({ azimuth: 30, elevation: 30, zoom: 1, ortho: true, offsetY: 0 })
  const [size, setSize] = useState(32)
  const [supersample, setSupersample] = useState(8)
  const [cut, setCut] = useState(0.5)
  const [stdDev, setStdDev] = useState(Math.sqrt(8))
  const [crop, setCrop] = useState(3)
  const [palette, setPalette] = useState<PaletteChoice>('auto')
  const [autoColours, setAutoColours] = useState(12)
  const [dither, setDither] = useState(0)
  const [strays, setStrays] = useState(true)
  const [outlineMode, setOutlineMode] = useState<PixelSettings['outline']>('darkest')
  const [layout, setLayout] = useState<Layout>('dir4')

  const [stages, setStages] = useState<Stages | null>(null)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [baking, setBaking] = useState<{ done: number; total: number } | null>(null)
  const [bakeError, setBakeError] = useState<string | null>(null)

  const settings: PixelSettings = useMemo(
    () => ({
      size, supersample, alphaCut: cut, autoColours, dither, strays, outline: outlineMode,
      palette: palette === 'auto' || palette === 'none' ? palette : PALETTES.find((p) => p.id === palette)!.colors,
    }),
    [size, supersample, cut, autoColours, dither, strays, outlineMode, palette],
  )
  // Everything a bake depends on, so the page can say when the sheet on show is out of date
  const bakeKey = JSON.stringify([settings, view, stdDev, crop, upright, layout, source.kind, source.id])

  // --- engine lifecycle ------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current!
    try {
      const e = new Engine(canvas)
      engineRef.current = e
      setReady(true)
      return () => { e.dispose(); engineRef.current = null }
    } catch (err) {
      setError('This browser could not start WebGL2, which the splat renderer needs.')
      console.warn(err)
    }
  }, [])

  const load = useCallback(async (make: () => ReturnType<ReturnType<typeof meshFromBuilder>>, flip: boolean, next: Source) => {
    const e = engineRef.current
    if (!e) return
    setLoading(true)
    setSheet(null)
    try {
      // A newer pick won the race: leave the state to that load.
      if (!(await e.setSplats(make, flip))) return
      // Name the source only once it has loaded, so a bad file doesn't relabel the object on screen.
      setSource(next)
      e.setCrop(crop)
      setSplatCount(e.splatCount)
      setUpright(flip)
      setError(null)
    } catch (err) {
      console.warn(err)
      setError("That file didn't load as a splat. Spark reads .ply, .spz, .splat, .ksplat and .sog.")
    } finally {
      setLoading(false)
    }
    // crop is applied from state on load; changing it later goes through its own effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!ready) return
    const p = PRESETS.find((x) => x.id === 'mushroom')!
    load(meshFromBuilder(p.build), false, { kind: 'preset', id: p.id, name: p.name })
  }, [ready, load])

  useEffect(() => { if (engineRef.current) engineRef.current.view = view }, [view])
  useEffect(() => { engineRef.current?.setStdDev(stdDev) }, [stdDev])
  useEffect(() => { engineRef.current?.setCrop(crop) }, [crop])

  // --- live preview: one capture in flight at a time, latest settings win ----
  const busy = useRef(false)
  const again = useRef(false)
  const latest = useRef({ settings, size, supersample })
  latest.current = { settings, size, supersample }

  const refresh = useCallback(async () => {
    const e = engineRef.current
    if (!e || loading) return
    if (busy.current) { again.current = true; return }
    busy.current = true
    try {
      do {
        again.current = false
        const { settings: s } = latest.current
        const raw = await e.shoot(s.size * s.supersample)
        const [st] = processFrames([raw], s, true)
        setStages(st)
      } while (again.current)
    } catch (err) {
      console.warn(err)
    } finally {
      busy.current = false
    }
  }, [loading])

  useEffect(() => {
    if (loading) return
    // Spark sorts asynchronously, so give the first frame a moment to settle after a load.
    const t = setTimeout(refresh, 30)
    return () => clearTimeout(t)
  }, [refresh, loading, view, settings, stdDev, crop, upright])

  // --- orbit by dragging the viewport ---------------------------------------
  const drag = useRef<{ x: number; y: number; az: number; el: number } | null>(null)
  const onPointerDown = (ev: React.PointerEvent) => {
    ;(ev.target as Element).setPointerCapture(ev.pointerId)
    drag.current = { x: ev.clientX, y: ev.clientY, az: view.azimuth, el: view.elevation }
  }
  const onPointerMove = (ev: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const az = d.az - (ev.clientX - d.x) * 0.5
    const el = Math.max(-30, Math.min(90, d.el + (ev.clientY - d.y) * 0.4))
    setView((v) => ({ ...v, azimuth: ((az % 360) + 540) % 360 - 180, elevation: Math.round(el) }))
  }
  const onPointerUp = () => { drag.current = null }
  // A native, non-passive listener: React's onWheel is passive, so the page would scroll while you zoom.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      setView((v) => ({ ...v, zoom: Math.max(0.4, Math.min(4, v.zoom * (ev.deltaY < 0 ? 1.08 : 1 / 1.08))) }))
    }
    c.addEventListener('wheel', onWheel, { passive: false })
    return () => c.removeEventListener('wheel', onWheel)
  }, [])

  // Free each sheet's PNG once it's replaced or the page goes away
  const sheetUrl = sheet?.url
  useEffect(() => () => { if (sheetUrl) URL.revokeObjectURL(sheetUrl) }, [sheetUrl])

  // --- files ----------------------------------------------------------------
  const fileInput = useRef<HTMLInputElement>(null)
  const openFile = async (file: File) => {
    const bytes = await file.arrayBuffer()
    load(meshFromBytes(bytes, file.name), true, { kind: 'file', id: file.name, name: file.name.replace(/\.[^.]+$/, '') })
  }
  const [dragOver, setDragOver] = useState(false)

  // --- bake a sheet ---------------------------------------------------------
  const bake = async () => {
    const e = engineRef.current
    if (!e) return
    const { rows } = shotsFor(layout)
    const total = rows.reduce((n, r) => n + r.shots.length, 0)
    setBaking({ done: 0, total })
    setBakeError(null)
    const key = bakeKey
    try {
      const raws: Uint8Array[] = []
      for (const row of rows) {
        for (const shot of row.shots) {
          raws.push(await e.shoot(size * supersample, { azimuth: view.azimuth + shot.turn }))
          setBaking({ done: raws.length, total })
        }
      }
      const frames = processFrames(raws, settings, true).map((s) => s.final)
      const packed = packSheet(frames, layout)
      const image = `${slug(source.name)}.png`
      const json = tinkerkitSheet(source.name, image, layout, size, packed.cols, packed.rows, Math.max(...frames.map(baseline)))
      const blob: Blob = await new Promise((r) => packed.canvas.toBlob((b) => r(b!), 'image/png'))
      setSheet({ url: URL.createObjectURL(blob), frames, cols: packed.cols, rows: packed.rows, json, layout, key })
    } catch (err) {
      console.warn(err)
      setBakeError('The sheet could not be baked. Try a smaller sprite size or fewer samples per pixel.')
    } finally {
      setBaking(null)
    }
  }

  const downloadJson = () => {
    if (!sheet) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(sheet.json, null, 2)], { type: 'application/json' }))
    triggerDownload(url, `${slug(source.name)}.spritesheet.json`)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // A preset that pins the turn too (isometric) wins over one that only sets the height (the ¾ view is also 30°).
  const activeCamera =
    CAMERAS.find((c) => c.view.azimuth !== undefined && c.view.elevation === view.elevation && c.view.azimuth === view.azimuth) ??
    CAMERAS.find((c) => c.view.azimuth === undefined && c.view.elevation === view.elevation)

  const pixelsSummary = `${size}px · ${supersample * supersample} samples`
  const colourSummary = palette === 'auto' ? `Auto · ${autoColours}` : palette === 'none' ? 'Full colour' : PALETTES.find((p) => p.id === palette)!.name

  return (
    <div className="min-h-dvh">
      <SiteHeader />

      <main id="main" className="mx-auto max-w-7xl px-4 pb-16">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-8 pb-6">
          <h1 className="font-serif text-4xl sm:text-5xl">Splat to Sprite</h1>
          <p className="max-w-xl font-serif text-lg text-ink-muted">
            A Gaussian splat is a 3D object made only of soft, see-through blobs. Frame one like a game camera, and bake it into
            pixel art.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)]">
          {/* ------------------------------------------------------------ 3D side */}
          <section aria-label="3D view" className="min-w-0 space-y-4">
            <div
              className={`relative aspect-[4/3] overflow-hidden rounded-lg border bg-paper-sunk ${dragOver ? 'border-accent' : 'border-rule'}`}
              onDragOver={(ev) => { ev.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(ev) => {
                ev.preventDefault()
                setDragOver(false)
                const f = ev.dataTransfer.files[0]
                if (f) openFile(f)
              }}
            >
              <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                role="img"
                aria-label="3D view of the splat. Drag to turn the camera and scroll to zoom, or use the Camera sliders."
                data-testid="viewport"
              />
              {/* The sprite frame: what's inside this square becomes the sprite. */}
              <div
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border border-dashed border-accent/80"
                style={{ height: `${FRAME_SHARE * 100}%`, aspectRatio: '1 / 1' }}
              >
                <span className="absolute -top-6 left-0 text-xs text-accent">sprite frame · {size}×{size}</span>
              </div>
              <div aria-live="polite" className={loading ? 'absolute inset-0 grid place-items-center text-ink-muted' : 'sr-only'}>
                {loading ? 'Loading splats…' : `${splatCount.toLocaleString()} splats loaded`}
              </div>
              {error && <div role="alert" className="absolute inset-x-4 bottom-4 rounded bg-paper p-3 text-sm text-ink">{error}</div>}
              <p className="pointer-events-none absolute right-3 bottom-2 text-xs text-ink-faint">drag to orbit · scroll to zoom</p>
            </div>

            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Splat to load">
              {PRESETS.map((p) => (
                <Chip
                  key={p.id}
                  active={source.kind === 'preset' && source.id === p.id}
                  onClick={() => load(meshFromBuilder(p.build), false, { kind: 'preset', id: p.id, name: p.name })}
                >
                  {p.name}
                </Chip>
              ))}
              <Chip active={source.kind === 'file'} onClick={() => fileInput.current?.click()}>
                {source.kind === 'file' ? source.name : 'Open your own splat…'}
              </Chip>
              <input ref={fileInput} type="file" className="hidden" accept=".ply,.spz,.splat,.ksplat,.sog,.zip" onChange={(ev) => ev.target.files?.[0] && openFile(ev.target.files[0])} />
              <span className="ml-auto text-sm text-ink-faint" data-testid="splat-count">{splatCount.toLocaleString()} splats</span>
            </div>
            {source.kind === 'file' ? (
              <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
                <Toggle label="Flip upright" checked={upright} onChange={(v) => { setUpright(v); engineRef.current?.setUpright(v) }} />
                <Slider label="Crop to object" value={crop} min={0.6} max={3} step={0.05} onChange={setCrop} format={(v) => (v >= 3 ? 'off' : `${v.toFixed(2)}× radius`)} />
              </div>
            ) : (
              <p className="text-sm text-ink-faint">
                The samples are built in code, blob by blob. For a real object, scan one with a free phone app such as Scaniverse or
                Polycam, export a .ply or .spz, and drop it on the view. It stays in your browser.
              </p>
            )}
          </section>

          {/* --------------------------------------------------------- controls */}
          <section aria-label="Sprite settings" className="min-w-0 space-y-5">
            <div className="flex items-start gap-4">
              <div className="checker grid aspect-square w-40 shrink-0 place-items-center overflow-hidden rounded-lg border border-rule sm:w-48">
                {stages && <FrameImage frame={stages.final} className="h-full w-full" testId="sprite-preview" label={`Sprite preview, ${size} by ${size} pixels`} />}
              </div>
              <div className="min-w-0 text-sm text-ink-muted">
                <p className="font-medium text-ink">Your sprite</p>
                {stages && (
                  <ul className="mt-2 space-y-1 tabular-nums">
                    <li>{size}×{size} pixels</li>
                    <li>{countSolid(stages.final)} filled</li>
                    <li>{countColours(stages.final)} colours</li>
                  </ul>
                )}
                {stages && stages.palette.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-0.5" role="img" aria-label={`Palette in use: ${stages.palette.length} colours`}>
                    {stages.palette.map((c, i) => <span key={i} title={rgbToHex(c)} aria-hidden className="h-3.5 w-3.5 rounded-[2px]" style={{ background: rgbToHex(c) }} />)}
                  </div>
                )}
              </div>
            </div>

            <Tabs
              label="Sprite settings"
              tabs={[
                {
                  id: 'camera',
                  label: 'Camera',
                  summary: activeCamera?.name ?? `${view.elevation}° · ${Math.round(view.azimuth)}°`,
                  content: (
                    <Panel note={activeCamera?.note ?? 'Orbit freely; the sprite is whatever sits inside the dashed square.'}>
                      <div className="flex flex-wrap gap-2" role="group" aria-label="Camera presets">
                        {CAMERAS.map((c) => (
                          <Chip key={c.id} active={activeCamera?.id === c.id} onClick={() => setView((v) => ({ ...v, ...c.view }))}>{c.name}</Chip>
                        ))}
                      </div>
                      <Slider label="Height" value={view.elevation} min={-30} max={90} step={1} onChange={(elevation) => setView((v) => ({ ...v, elevation }))} format={(v) => `${v}°`} />
                      <Slider label="Turn" value={Math.round(view.azimuth)} min={-180} max={180} step={1} onChange={(azimuth) => setView((v) => ({ ...v, azimuth }))} format={(v) => `${v}°`} />
                      <Slider label="Zoom" value={view.zoom} min={0.4} max={4} step={0.01} onChange={(zoom) => setView((v) => ({ ...v, zoom }))} format={(v) => `${v.toFixed(2)}×`} />
                      <Slider label="Nudge up/down" value={view.offsetY} min={-0.5} max={0.5} step={0.01} onChange={(offsetY) => setView((v) => ({ ...v, offsetY }))} format={(v) => v.toFixed(2)} />
                      <Toggle label="Perspective (off = flat, like pixel-art games)" checked={!view.ortho} onChange={(p) => setView((v) => ({ ...v, ortho: !p }))} />
                    </Panel>
                  ),
                },
                {
                  id: 'pixels',
                  label: 'Pixels',
                  summary: pixelsSummary,
                  content: (
                    <Panel note="Each sprite pixel is the average of a little grid of render samples. More samples means smoother edges before the cut.">
                      <Field label="Sprite size">
                        <div className="flex flex-wrap gap-1.5">
                          {SIZES.map((s) => <Chip key={s} small active={size === s} onClick={() => setSize(s)}>{s}</Chip>)}
                        </div>
                      </Field>
                      <Field label="Samples per pixel">
                        <div className="flex flex-wrap gap-1.5">
                          {[1, 2, 4, 8].map((s) => <Chip key={s} small active={supersample === s} onClick={() => setSupersample(s)}>{s * s}</Chip>)}
                        </div>
                      </Field>
                      <Slider label="Solid at coverage" value={cut} min={0.05} max={0.95} step={0.01} onChange={setCut} format={(v) => `${Math.round(v * 100)}%`} />
                      <Slider label="Blob reach" value={stdDev} min={0.5} max={Math.sqrt(8)} step={0.01} onChange={setStdDev} format={(v) => `${v.toFixed(2)}σ`} hint="How far out each Gaussian is drawn, in standard deviations. Turn it down to see the individual blobs." />
                    </Panel>
                  ),
                },
                {
                  id: 'colour',
                  label: 'Colour',
                  summary: colourSummary,
                  content: (
                    <Panel note="Pixel art uses a small fixed palette. Every pixel snaps to its nearest colour, measured in OKLab so it matches what your eye would pick.">
                      <Field label="Palette">
                        <select aria-label="Palette" className="w-full rounded border border-rule bg-paper py-1.5 pr-9 pl-2.5" value={palette} onChange={(e) => setPalette(e.target.value)}>
                          <option value="auto">Auto: picked from the splat</option>
                          {PALETTES.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.colors.length})</option>)}
                          <option value="none">Full colour (no palette)</option>
                        </select>
                      </Field>
                      {palette === 'auto' && <Slider label="Colours" value={autoColours} min={2} max={32} step={1} onChange={setAutoColours} format={(v) => `${v}`} />}
                      <Slider label="Dither" value={dither} min={0} max={1} step={0.05} onChange={setDither} format={(v) => (v === 0 ? 'off' : `${Math.round(v * 100)}%`)} />
                      <Field label="Outline">
                        <div className="flex flex-wrap gap-1.5">
                          {(['none', 'darkest', 'black'] as const).map((o) => <Chip key={o} small active={outlineMode === o} onClick={() => setOutlineMode(o)}>{o === 'darkest' ? 'darkest colour' : o}</Chip>)}
                        </div>
                      </Field>
                      <Toggle label="Remove stray pixels" checked={strays} onChange={setStrays} />
                    </Panel>
                  ),
                },
              ]}
            />
          </section>
        </div>

        {/* ------------------------------------------------------ the sheet */}
        <section aria-labelledby="sheet-title" className="mt-10 border-t border-rule pt-8">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div className="max-w-2xl">
              <h2 id="sheet-title" className="font-serif text-3xl">Sprite sheet</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                The camera circles the object for each frame, using the settings above. Four directions go one per row in
                Tinkerkit's order: down, left, right, up.
              </p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
              <select
                className="min-w-0 flex-1 rounded border border-rule bg-paper py-2 pr-10 pl-3 sm:flex-none"
                value={layout}
                onChange={(e) => setLayout(e.target.value as Layout)}
                aria-label="Sheet layout"
              >
                {LAYOUTS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <button
                type="button"
                onClick={bake}
                disabled={!!baking || loading}
                className="rounded bg-accent px-5 py-2 font-medium text-paper disabled:opacity-50"
              >
                {baking ? `Baking frame ${Math.min(baking.done + 1, baking.total)} of ${baking.total}…` : 'Bake sprite sheet'}
              </button>
            </div>
          </div>
          {bakeError && <p role="alert" className="mt-3 text-sm text-accent-ink">{bakeError}</p>}
          <div className="mt-5 rounded-xl border border-rule bg-paper-sunk p-4 sm:p-6">
            {sheet ? (
              <SheetView sheet={sheet} name={slug(source.name)} onJson={downloadJson} stale={sheet.key !== bakeKey} baking={baking} />
            ) : (
              <SheetPlaceholder layout={layout} size={size} baking={baking} />
            )}
          </div>
        </section>

        <section aria-label="How it works" className="mt-12">
          <Pipeline stages={stages} size={size} supersample={supersample} />
        </section>
      </main>
    </div>
  )
}

// --- pieces ------------------------------------------------------------------

function Pipeline({ stages, size, supersample }: { stages: Stages | null; size: number; supersample: number }) {
  const steps = [
    { key: 'raw', title: '1 · Render', text: `The splats drawn at ${size * supersample}×${size * supersample}. Each blob is sorted back to front and blended, so edges are soft and see-through.` },
    { key: 'shrunk', title: '2 · Shrink', text: `Every ${supersample}×${supersample} block averaged into one pixel. Edge pixels end up partly transparent.` },
    { key: 'snapped', title: '3 · Cut and snap', text: 'Pixels over the coverage cut become solid, the rest vanish. Colours snap to the palette.' },
    { key: 'final', title: '4 · Clean up', text: 'Lone specks from stray blobs are removed, and an outline is drawn around the silhouette.' },
  ] as const
  return (
    <div>
      <h2 className="font-serif text-2xl">How a splat becomes pixels</h2>
      <ol className="mt-3 grid max-w-5xl grid-cols-2 gap-4 sm:grid-cols-4">
        {steps.map((s) => (
          <li key={s.key} className="min-w-0">
            <div className="checker aspect-square overflow-hidden rounded border border-rule">
              {stages && <FrameImage frame={stages[s.key]} className="h-full w-full" smooth={s.key === 'raw'} />}
            </div>
            <p className="mt-2 text-sm font-medium">{s.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{s.text}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}


type Sheet = { url: string; frames: Frame[]; cols: number; rows: number; json: object; layout: Layout; key: string }

/** One label per frame, in the order the frames are packed. */
function frameLabels(layout: Layout) {
  return shotsFor(layout).rows.flatMap((r) => r.shots.map((s) => (r.name === 'spin' ? `${Math.round(s.turn)}°` : s.name)))
}

function BakeProgress({ baking }: { baking: { done: number; total: number } }) {
  return (
    <div className="mb-5 flex items-center gap-3 text-sm text-ink-muted">
      <progress className="bake-progress h-1.5 flex-1" value={baking.done} max={baking.total} aria-label="Baking the sheet" />
      <span className="tabular-nums">{baking.done} of {baking.total}</span>
    </div>
  )
}

function SheetPlaceholder({ layout, size, baking }: { layout: Layout; size: number; baking: { done: number; total: number } | null }) {
  const labels = frameLabels(layout)
  return (
    <div data-testid="sheet-empty">
      {baking && <BakeProgress baking={baking} />}
      <ul className="flex flex-wrap gap-3" aria-label={`${labels.length} frames to bake`}>
        {labels.map((l, i) => (
          <li key={i} className="w-20 sm:w-24">
            <div className={`grid aspect-square place-items-center rounded border border-dashed text-xs ${baking && i < baking.done ? 'border-accent bg-accent/10 text-accent-ink' : 'border-rule text-ink-faint'}`}>
              {size}×{size}
            </div>
            <p className="mt-1 truncate text-center text-xs text-ink-faint">{l}</p>
          </li>
        ))}
      </ul>
      {!baking && (
        <p className="mt-5 text-sm text-ink-muted">
          Bake to shoot each frame and pack them into one PNG, with a matching Tinkerkit sheet (.json).
        </p>
      )}
    </div>
  )
}

function SheetView({ sheet, name, onJson, stale, baking }: { sheet: Sheet; name: string; onJson: () => void; stale: boolean; baking: { done: number; total: number } | null }) {
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(() => !reducedMotion())
  const labels = frameLabels(sheet.layout)
  const isSpin = shotsFor(sheet.layout).rows[0].name === 'spin'
  const n = sheet.frames.length
  // Play the spin, or step through the directions
  useEffect(() => {
    if (!playing || n < 2) return
    const t = setInterval(() => setI((x) => (x + 1) % n), isSpin ? 100 : 600)
    return () => clearInterval(t)
  }, [playing, n, isSpin])
  const fw = sheet.frames[0].width
  const fh = sheet.frames[0].height
  const w = sheet.cols * fw
  const h = sheet.rows * fh
  const scale = Math.max(1, Math.min(4, Math.floor(256 / Math.max(w, h))))
  const current = i % n
  return (
    <div data-testid="sheet">
      {baking && <BakeProgress baking={baking} />}
      {stale && !baking && (
        <p role="status" className="mb-5 rounded border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent-ink">
          The settings have changed since this sheet was baked. Bake again to update it.
        </p>
      )}
      <div className="grid gap-8 md:grid-cols-[auto_minmax(0,1fr)] xl:grid-cols-[auto_minmax(0,1fr)_auto]">
        {/* the sheet, playing */}
        <div className="w-full max-w-64 md:w-56 lg:w-64">
          <div className="checker aspect-square overflow-hidden rounded-lg border border-rule">
            <FrameImage frame={sheet.frames[current]} className="h-full w-full" label="Animated preview of the sheet" />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-sm">
            <span className="text-ink-muted tabular-nums">{n > 1 ? `${current + 1} / ${n} · ${labels[current]}` : labels[0]}</span>
            {n > 1 && (
              <button type="button" onClick={() => setPlaying((p) => !p)} className="rounded border border-rule px-2.5 py-1 text-xs hover:border-accent">
                {playing ? 'Pause' : 'Play'}
              </button>
            )}
          </div>
        </div>

        {/* every frame, labelled */}
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Frames</h3>
          <ol className="mt-2 flex flex-wrap gap-3">
            {sheet.frames.map((f, k) => (
              <li key={k} className="w-20 sm:w-28">
                <button
                  type="button"
                  onClick={() => { setI(k); setPlaying(false) }}
                  aria-label={`Show frame ${k + 1}, ${labels[k]}`}
                  aria-pressed={k === current}
                  className={`checker block aspect-square w-full overflow-hidden rounded border ${k === current ? 'border-accent' : 'border-rule hover:border-ink-faint'}`}
                >
                  <FrameImage frame={f} className="h-full w-full" />
                </button>
                <p aria-hidden className="mt-1 truncate text-center text-xs text-ink-faint">{labels[k]}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* the file itself */}
        <div className="min-w-0 md:col-span-2 xl:col-span-1 xl:w-72">
          <h3 className="text-sm font-medium">The file</h3>
          <div className="checker mt-2 w-fit max-w-full overflow-auto rounded border border-rule p-2">
            <img src={sheet.url} alt={`Sprite sheet, ${sheet.cols} by ${sheet.rows} frames`} className="pixelated max-w-none" style={{ width: w * scale, height: h * scale }} />
          </div>
          <p className="mt-2 text-xs text-ink-faint tabular-nums">{name}.png · {w}×{h} px · {n} {n === 1 ? 'frame' : 'frames'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={sheet.url} download={`${name}.png`} className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-paper hover:opacity-90">Download PNG</a>
            <button type="button" onClick={onJson} className="rounded border border-rule px-3 py-1.5 text-sm hover:border-accent">Download Tinkerkit sheet (.json)</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Accessible tabs (WAI-ARIA tabs pattern): arrow keys, Home and End move
 * between tabs; every panel stays mounted so its state and labels survive.
 */
function Tabs({ label, tabs }: { label: string; tabs: { id: string; label: string; summary: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0].id)
  const base = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKeyDown = (ev: React.KeyboardEvent, i: number) => {
    const n = tabs.length
    const to = ev.key === 'ArrowRight' ? (i + 1) % n : ev.key === 'ArrowLeft' ? (i - 1 + n) % n : ev.key === 'Home' ? 0 : ev.key === 'End' ? n - 1 : -1
    if (to < 0) return
    ev.preventDefault()
    setActive(tabs[to].id)
    refs.current[to]?.focus()
  }
  return (
    <div>
      <div role="tablist" aria-label={label} className="grid grid-flow-col auto-cols-fr border-b border-rule">
        {tabs.map((t, i) => {
          const on = t.id === active
          return (
            <button
              key={t.id}
              ref={(el) => { refs.current[i] = el }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-controls={`${base}-panel-${t.id}`}
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(t.id)}
              onKeyDown={(ev) => onKeyDown(ev, i)}
              className={`group/tab -mb-px min-w-0 cursor-pointer rounded-t-md border-b-2 px-2 pt-2 pb-2.5 text-left transition-colors hover:bg-paper-sunk sm:px-3 ${on ? 'border-accent' : 'border-transparent hover:border-ink-faint'}`}
            >
              <span className={`block font-serif text-lg transition-colors ${on ? 'text-ink' : 'text-ink-muted group-hover/tab:text-ink'}`}>{t.label}</span>
              <span className="block truncate text-xs text-ink-faint transition-colors group-hover/tab:text-ink-muted">{t.summary}</span>
            </button>
          )
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`${base}-panel-${t.id}`} aria-labelledby={`${base}-tab-${t.id}`} hidden={t.id !== active} className="pt-4">
          {t.content}
        </div>
      ))}
    </div>
  )
}

function Panel({ note, children }: { note: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-ink-faint">{note}</p>
      {children}
    </div>
  )
}

function FrameImage({ frame, className, smooth, testId, label }: { frame: Frame; className?: string; smooth?: boolean; testId?: string; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current!
    c.width = frame.width
    c.height = frame.height
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height), 0, 0)
  }, [frame])
  // Labelled frames are images; unlabelled ones sit beside a caption that already says what they show.
  return <canvas ref={ref} className={`${smooth ? '' : 'pixelated'} ${className ?? ''}`} data-testid={testId} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />
}


function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className="grid gap-1.5 text-sm sm:grid-cols-[8.5rem_1fr] sm:items-center">
      <span id={id} className="text-ink-muted">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function Slider({ label, value, min, max, step, onChange, format, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string; hint?: string }) {
  const id = useId()
  return (
    <div className="text-sm">
      <label className="grid gap-1 sm:grid-cols-[8.5rem_1fr_4.5rem] sm:items-center sm:gap-3">
        <span className="text-ink-muted">{label}</span>
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-valuetext={format(value)}
          aria-describedby={hint ? id : undefined}
          className="w-full accent-[var(--c-accent)]"
        />
        <span aria-hidden className="tabular-nums text-ink-faint sm:text-right">{format(value)}</span>
      </label>
      {hint && <p id={id} className="mt-1 text-xs leading-relaxed text-ink-faint sm:pl-[9.25rem]">{hint}</p>}
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink-muted">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--c-accent)]" />
      {label}
    </label>
  )
}

function Chip({ active, onClick, children, small }: { active?: boolean; onClick: () => void; children: ReactNode; small?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border transition-colors ${small ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'} ${active ? 'border-accent bg-accent/15 text-accent-ink hover:bg-accent/25' : 'border-rule text-ink-muted hover:border-ink-faint hover:bg-paper-sunk hover:text-ink'}`}
    >
      {children}
    </button>
  )
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sprite'
}

function triggerDownload(url: string, name: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
}
