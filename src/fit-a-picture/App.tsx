import { useCallback, useEffect, useRef, useState } from 'react'
import { SiteHeader } from '../shared/SiteHeader.tsx'
import { Footer } from '../blobscape/Chrome.tsx'
import { Crumbs } from '../blobscape/Shell.tsx'
import { Button, Chip, Field, Panel, Slider, Tabs, Toggle } from '../shared/ui.tsx'
import { SAMPLES, drawSample, fitSize, type Sample } from './samples.ts'
import { psnr } from './fit.ts'
import { LossGraph } from './LossGraph.tsx'
import { newHistory, record, type History } from './history.ts'
import type { FromWorker, Settings, ToWorker, TrainEvent, View } from './protocol.ts'

type Source = { kind: 'sample'; sample: Sample } | { kind: 'file'; name: string; bitmap: ImageBitmap }

const SPEEDS = [
  { id: 8, name: 'Slow' },
  { id: 60, name: 'Normal' },
  { id: 0, name: 'Flat out' },
]
const DETAILS = [128, 192, 256]
const VIEWS: { id: View; name: string; note: string }[] = [
  { id: 'fit', name: 'Fit', note: 'The blobs added up: this is the picture the training is drawing.' },
  { id: 'blobs', name: 'Blobs', note: 'Each blob outlined in its own colour, about where its glow fades out. Fainter outlines are more see-through.' },
  { id: 'error', name: 'Error', note: 'How far off each pixel is. Bright is wrong, black is right. Growth adds blobs where this is bright.' },
]
/** The long side of the picture shown beside the fit. */
const SHOW_LONG = 480
/** Blobs one click adds. */
const CLICK_ADDS = 6

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function App() {
  const worker = useRef<Worker | null>(null)
  const fitCanvas = useRef<HTMLCanvasElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const targetCanvas = useRef<HTMLCanvasElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const [source, setSource] = useState<Source>({ kind: 'sample', sample: SAMPLES[0] })
  const [detail, setDetail] = useState(192)
  const [settings, setSettings] = useState<Settings>({
    start: 300, budget: 1500, grow: true, prune: true, pruneBelow: 0.02, rate: 1, speed: 60, view: 'fit',
  })
  const [running, setRunning] = useState(() => !reducedMotion())
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [frame, setFrame] = useState<{ iteration: number; count: number; loss: number | null }>({ iteration: 0, count: 0, loss: null })
  const [log, setLog] = useState<{ at: number; text: string }[]>([])
  const [announce, setAnnounce] = useState('')
  // Losses live in a growing buffer, not state: there can be tens of thousands
  const history = useRef<History>(newHistory())
  const [historyVersion, setHistoryVersion] = useState(0)
  const blobs = useRef<Float32Array>(new Float32Array(0))
  const flashes = useRef<{ b: Float32Array; t: number }[]>([])
  // Where Enter adds blobs when the fit has keyboard focus (share of width and height)
  const reticle = useRef<{ x: number; y: number; on: boolean }>({ x: 0.5, y: 0.5, on: false })
  const tap = useRef<{ x: number; y: number } | null>(null)

  const aspect = source.kind === 'sample' ? source.sample.aspect : clampAspect(source.bitmap.width / source.bitmap.height)
  const latest = useRef({ settings, running })
  latest.current = { settings, running }
  const send = (m: ToWorker, transfer: Transferable[] = []) => worker.current?.postMessage(m, transfer)

  // --- the worker -------------------------------------------------------------
  useEffect(() => {
    const w = new Worker(new URL('./trainer.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    w.onmessage = (e: MessageEvent<FromWorker>) => onFrame(e.data)
    w.onerror = (e) => {
      console.warn(e)
      setError('The training stopped with an error. Reload the page to start again.')
    }
    return () => { w.terminate(); worker.current = null }
    // onFrame only touches refs and state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onFrame = (m: FromWorker) => {
    if (m.reset) {
      history.current = newHistory()
      setLog([])
    }
    for (const l of m.losses) record(history.current, l)
    if (m.losses.length || m.reset) setHistoryVersion((v) => v + 1)

    const c = fitCanvas.current
    if (c) {
      if (c.width !== m.width || c.height !== m.height) {
        c.width = m.width
        c.height = m.height
      }
      c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(m.image.buffer as ArrayBuffer), m.width, m.height), 0, 0)
    }
    blobs.current = m.blobs
    if (m.pruned.length) flashes.current.push({ b: m.pruned, t: performance.now() })
    drawOverlay()

    setFrame((f) => ({ iteration: m.iteration, count: m.count, loss: m.losses.length ? m.losses[m.losses.length - 1] : m.reset ? null : f.loss }))
    if (m.events.length) {
      const lines = m.events.map(describe).reverse()
      setLog((l) => [...lines, ...l].slice(0, 6))
    }
  }

  // --- load a picture: the target for the fit, and a sharp copy to show -----
  useEffect(() => {
    if (!worker.current) return
    const { width, height } = fitSize(aspect, detail)
    let target: Float32Array
    if (source.kind === 'sample') {
      target = drawSample(source.sample, width, height)
    } else {
      const c = document.createElement('canvas')
      c.width = width
      c.height = height
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      drawCropped(ctx, source.bitmap, width, height)
      const d = ctx.getImageData(0, 0, width, height).data
      target = new Float32Array(width * height * 3)
      for (let i = 0; i < width * height; i++) {
        // Transparent pixels are drawn over white
        const a = d[i * 4 + 3] / 255
        for (let k = 0; k < 3; k++) target[i * 3 + k] = (d[i * 4 + k] / 255) * a + (1 - a)
      }
    }
    send({ type: 'load', target, width, height, settings: latest.current.settings, seed: seedNow() }, [target.buffer])
    if (latest.current.running) send({ type: 'play' })
  }, [source, detail, aspect])

  // The picture beside the fit, at display size
  useEffect(() => {
    const c = targetCanvas.current
    if (!c) return
    const { width, height } = fitSize(aspect, SHOW_LONG)
    c.width = width
    c.height = height
    const ctx = c.getContext('2d')!
    if (source.kind === 'file') {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, width, height)
      drawCropped(ctx, source.bitmap, width, height)
    } else {
      // Half size then scaled up: the samples are smooth, and this keeps switching quick
      const w2 = Math.ceil(width / 2), h2 = Math.ceil(height / 2)
      const rgb = drawSample(source.sample, w2, h2)
      const img = new ImageData(w2, h2)
      for (let i = 0; i < w2 * h2; i++) {
        img.data[i * 4] = rgb[i * 3] * 255
        img.data[i * 4 + 1] = rgb[i * 3 + 1] * 255
        img.data[i * 4 + 2] = rgb[i * 3 + 2] * 255
        img.data[i * 4 + 3] = 255
      }
      const tmp = document.createElement('canvas')
      tmp.width = w2
      tmp.height = h2
      tmp.getContext('2d')!.putImageData(img, 0, 0)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(tmp, 0, 0, width, height)
    }
  }, [source, aspect])

  // Settings that don't need a restart go straight to the worker
  useEffect(() => { send({ type: 'settings', settings }) }, [settings])
  useEffect(() => { send({ type: running ? 'play' : 'pause' }) }, [running])

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings((s) => ({ ...s, [k]: v }))
  const restart = () => {
    send({ type: 'restart', settings, seed: seedNow() })
    setAnnounce(`Restarted from ${settings.start} random blobs.`)
  }

  // --- the overlay: blob outlines, and pruned blobs fading out --------------
  const raf = useRef(0)
  const clear = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const drawOverlay = useCallback(() => {
    const c = overlay.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr)
    if (c.width !== W || c.height !== H) {
      c.width = W
      c.height = H
    }
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    const b = blobs.current
    if (latest.current.settings.view === 'blobs') {
      ctx.lineWidth = Math.max(1, dpr * 0.75)
      for (let i = 0; i < b.length; i += 9) {
        const [x, y, sx, sy, a, r, g, bl, o] = b.subarray(i, i + 9)
        ctx.strokeStyle = `rgb(${r * 255} ${g * 255} ${bl * 255} / ${0.25 + 0.75 * o})`
        ctx.beginPath()
        ctx.ellipse(x * W, y * H, Math.max(0.5, 2 * sx * W), Math.max(0.5, 2 * sy * H), a, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    // The keyboard reticle: where Enter will add blobs
    if (reticle.current.on) {
      const { x, y } = reticle.current
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--c-accent').trim() || '#f2a65a'
      ctx.lineWidth = 2 * dpr
      ctx.beginPath()
      ctx.arc(x * W, y * H, 10 * dpr, 0, Math.PI * 2)
      ctx.moveTo(x * W - 16 * dpr, y * H)
      ctx.lineTo(x * W + 16 * dpr, y * H)
      ctx.moveTo(x * W, y * H - 16 * dpr)
      ctx.lineTo(x * W, y * H + 16 * dpr)
      ctx.stroke()
    }
    // Pruned blobs: a dashed ring that fades over a second (or just shows, with reduced motion)
    const now = performance.now()
    flashes.current = flashes.current.filter((f) => now - f.t < 1000)
    if (flashes.current.length) {
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--c-accent').trim() || '#f2a65a'
      ctx.strokeStyle = accent
      ctx.lineWidth = 1.5 * dpr
      ctx.setLineDash([3 * dpr, 3 * dpr])
      const still = reducedMotion()
      for (const f of flashes.current) {
        ctx.globalAlpha = still ? 1 : 1 - (now - f.t) / 1000
        for (let i = 0; i < f.b.length; i += 5) {
          ctx.beginPath()
          ctx.ellipse(f.b[i] * W, f.b[i + 1] * H, Math.max(2 * dpr, 2 * f.b[i + 2] * W), Math.max(2 * dpr, 2 * f.b[i + 3] * H), f.b[i + 4], 0, Math.PI * 2)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
      ctx.setLineDash([])
      cancelAnimationFrame(raf.current)
      clearTimeout(clear.current)
      if (still) clear.current = setTimeout(drawOverlay, 1010 - (now - flashes.current[0].t))
      else raf.current = requestAnimationFrame(drawOverlay)
    }
  }, [])
  useEffect(() => () => { cancelAnimationFrame(raf.current); clearTimeout(clear.current) }, [])
  useEffect(() => {
    const c = overlay.current
    if (!c) return
    const ro = new ResizeObserver(() => drawOverlay())
    ro.observe(c)
    return () => ro.disconnect()
  }, [drawOverlay])

  // --- input --------------------------------------------------------------
  // Only the newest pick counts, and every bitmap but the one on show is closed
  const pick = useRef(0)
  const shown = useRef<ImageBitmap | null>(null)
  useEffect(() => () => shown.current?.close(), [])
  useEffect(() => {
    const now = source.kind === 'file' ? source.bitmap : null
    if (shown.current && shown.current !== now) shown.current.close()
    shown.current = now
  }, [source])

  const openFile = async (file: File) => {
    const id = ++pick.current
    try {
      const bitmap = await decodeSmall(file)
      if (id !== pick.current) return bitmap.close()
      setSource({ kind: 'file', name: file.name.replace(/\.[^.]+$/, ''), bitmap })
      setError(null)
      setAnnounce(`Fitting ${file.name} from noise.`)
    } catch (err) {
      if (id !== pick.current) return
      console.warn(err)
      setError(err instanceof TooBig ? err.message : "That file didn't open as a picture. Try a PNG, JPEG, WebP or GIF.")
    }
  }

  const addAt = (x: number, y: number) => {
    send({ type: 'add', x, y, n: CLICK_ADDS })
    setAnnounce(`Added ${CLICK_ADDS} blobs.`)
  }
  // A tap or click adds blobs; a swipe that starts on the picture still scrolls the page
  const onPointerUp = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const t = tap.current
    tap.current = null
    if (!t || Math.hypot(ev.clientX - t.x, ev.clientY - t.y) > 10) return
    const r = ev.currentTarget.getBoundingClientRect()
    addAt((ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height)
  }
  // Keyboard: arrows move the reticle (Shift for small moves), Enter or Space adds blobs there
  const onKeyDown = (ev: React.KeyboardEvent<HTMLCanvasElement>) => {
    const r = reticle.current
    const d = ev.shiftKey ? 0.01 : 0.05
    const moves: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }
    if (moves[ev.key]) {
      r.x = Math.min(1, Math.max(0, r.x + moves[ev.key][0]))
      r.y = Math.min(1, Math.max(0, r.y + moves[ev.key][1]))
      drawOverlay()
    } else if (ev.key === 'Enter' || ev.key === ' ') {
      addAt(r.x, r.y)
    } else return
    ev.preventDefault()
  }
  const toggleRunning = () => {
    setRunning(!running)
    setAnnounce(running ? `Paused at step ${frame.iteration.toLocaleString()}${frame.loss === null ? '' : `, quality ${psnr(frame.loss).toFixed(1)} dB`}.` : 'Training.')
  }
  const stepOnce = () => {
    if (running) setRunning(false)
    send({ type: 'step', n: 1 })
  }
  const pickSample = (sample: Sample) => {
    pick.current++
    setSource({ kind: 'sample', sample })
    setError(null)
    setAnnounce(`Fitting ${sample.name} from noise.`)
  }

  const loss = frame.loss
  const view = VIEWS.find((v) => v.id === settings.view)!
  const sourceName = source.kind === 'sample' ? source.sample.name : source.name

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader here="/tools/fit-a-picture/" />

      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16">
        <Crumbs here="Fit a Picture" />
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
          <h1 className="font-display text-4xl sm:text-5xl">Fit a Picture</h1>
          <p className="max-w-xl text-lg text-ink-muted">
            A few hundred soft blobs start as noise and learn to paint a picture, using the same training loop that turns photos
            into a 3D Gaussian splat. Here it's flat, so you can watch every step.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(340px,1fr)]">
          {/* ------------------------------------------------------------ the pictures */}
          <section aria-label="The picture and the fit" className="min-w-0 space-y-4">
            <div
              className={`grid gap-3 rounded-lg outline-offset-4 sm:grid-cols-2 ${dragOver ? 'outline-2 outline-dashed outline-accent' : ''}`}
              onDragOver={(ev) => { ev.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(ev) => {
                ev.preventDefault()
                setDragOver(false)
                const f = ev.dataTransfer.files[0]
                if (f) openFile(f)
              }}
            >
              <figure className="min-w-0">
                <div className="overflow-hidden rounded-lg border border-rule bg-paper-sunk" style={{ aspectRatio: aspect }}>
                  <canvas ref={targetCanvas} className="block h-full w-full" role="img" aria-label={`The picture to fit: ${sourceName}`} />
                </div>
                <figcaption className="mt-1.5 text-xs text-ink-faint">The picture · {sourceName}</figcaption>
              </figure>
              <figure className="min-w-0">
                <div className={`relative overflow-hidden rounded-lg border border-rule ${settings.view === 'blobs' ? 'bg-[#0d0f16]' : 'bg-paper-sunk'}`} style={{ aspectRatio: aspect }}>
                  <canvas
                    ref={fitCanvas}
                    className={`absolute inset-0 block h-full w-full cursor-crosshair ${settings.view === 'blobs' ? 'opacity-20' : ''}`}
                    onPointerDown={(ev) => { tap.current = ev.button === 0 ? { x: ev.clientX, y: ev.clientY } : null }}
                    onPointerUp={onPointerUp}
                    onPointerCancel={() => { tap.current = null }}
                    onKeyDown={onKeyDown}
                    onFocus={() => { reticle.current.on = true; drawOverlay() }}
                    onBlur={() => { reticle.current.on = false; drawOverlay() }}
                    tabIndex={0}
                    role="img"
                    aria-roledescription="canvas"
                    aria-label={`The fit so far, ${view.name.toLowerCase()} view. Click to add blobs, or use the arrow keys to aim and Enter to add.`}
                    data-testid="fit"
                  />
                  <canvas ref={overlay} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
                </div>
                <figcaption className="mt-1.5 flex items-center justify-between gap-2 text-xs text-ink-faint">
                  <span>The blobs · click or tap to add some</span>
                  <span className="tabular-nums" data-testid="blob-count">{frame.count.toLocaleString()} blobs</span>
                </figcaption>
              </figure>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button primary onClick={toggleRunning} className="min-w-24">
                {running ? 'Pause' : frame.iteration ? 'Resume' : 'Train'}
              </Button>
              <Button onClick={stepOnce} title="Pauses training and takes one step">Step once</Button>
              <Button onClick={restart}>Restart from noise</Button>
            </div>

            <div>
              <dl className="grid grid-cols-3 gap-3 text-sm" aria-label="Training so far">
                <Stat label="Step" value={frame.iteration.toLocaleString()} testId="step" />
                <Stat label="Loss" value={loss === null ? '–' : loss.toPrecision(2)} />
                <Stat label="Quality" value={loss === null ? '–' : `${psnr(loss).toFixed(1)} dB`} />
              </dl>
              <p className="mt-2 text-xs leading-relaxed text-ink-faint">
                Loss is the average squared difference from the picture; lower is better. Quality is the same thing in decibels
                (PSNR): higher is closer, and about 30 dB looks right at a glance.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Picture to fit">
              {SAMPLES.map((s) => (
                <Chip key={s.id} active={source.kind === 'sample' && source.sample.id === s.id} onClick={() => pickSample(s)}>
                  {s.name}
                </Chip>
              ))}
              <Chip active={source.kind === 'file'} onClick={() => fileInput.current?.click()}>
                {source.kind === 'file' ? source.name : 'Open your own picture…'}
              </Chip>
              <input
                ref={fileInput}
                type="file"
                className="hidden"
                accept="image/*"
                onChange={(ev) => {
                  const f = ev.target.files?.[0]
                  if (f) openFile(f)
                  ev.target.value = ''
                }}
              />
            </div>
            {error && <p role="alert" className="text-sm text-accent-ink">{error}</p>}
            <p className="text-sm text-ink-faint">
              The samples are drawn in code. Drop in any picture of your own: it is shrunk to {detail} pixels across and never leaves
              your browser.
            </p>
          </section>

          {/* ------------------------------------------------------------ training */}
          <section aria-label="Training" className="min-w-0 space-y-5">
            <LossGraph history={history.current} version={historyVersion} />

            <Tabs
              label="Training settings"
              tabs={[
                {
                  id: 'view',
                  label: 'View',
                  summary: view.name,
                  content: (
                    <Panel note={view.note}>
                      <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
                        {VIEWS.map((v) => (
                          <Chip key={v.id} active={settings.view === v.id} onClick={() => set('view', v.id)}>{v.name}</Chip>
                        ))}
                      </div>
                      <Field label="Speed">
                        <div className="flex flex-wrap gap-1.5">
                          {SPEEDS.map((s) => <Chip key={s.id} small active={settings.speed === s.id} onClick={() => set('speed', s.id)}>{s.name}</Chip>)}
                        </div>
                      </Field>
                    </Panel>
                  ),
                },
                {
                  id: 'blobs',
                  label: 'Blobs',
                  summary: `${settings.start} → ${settings.budget}`,
                  content: (
                    <Panel note="Training starts from blobs scattered at random. Growing adds small ones where the picture is still most wrong; pruning removes the ones training has faded out.">
                      <Slider label="Start with" value={settings.start} min={20} max={2000} step={10} onChange={(v) => set('start', v)} format={(v) => `${v}`} hint="Used when you restart." />
                      <Toggle label="Grow where it's wrong, every 100 steps" checked={settings.grow} onChange={(v) => set('grow', v)} />
                      <Slider label="Grow up to" value={settings.budget} min={100} max={6000} step={50} onChange={(v) => set('budget', v)} format={(v) => `${v}`} />
                      <Toggle label="Prune weak blobs, every 100 steps" checked={settings.prune} onChange={(v) => set('prune', v)} />
                      <Slider label="Weak means under" value={settings.pruneBelow} min={0.005} max={0.15} step={0.005} onChange={(v) => set('pruneBelow', v)} format={(v) => `${(v * 100).toFixed(1)}%`} hint="Opacity. Pruned blobs flash as dashed rings as they go." />
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button small onClick={() => { send({ type: 'grow', n: 100 }); setAnnounce('Adding 100 blobs where the picture is most wrong.') }}>
                          Add 100 where it's wrong
                        </Button>
                        <Button small onClick={() => { send({ type: 'prune' }); setAnnounce('Pruning weak blobs.') }}>
                          Prune now
                        </Button>
                      </div>
                    </Panel>
                  ),
                },
                {
                  id: 'learning',
                  label: 'Learning',
                  summary: `${settings.rate}× · ${detail}px`,
                  content: (
                    <Panel note="Each step nudges every blob's position, size, angle, colour and opacity downhill on the loss, using Adam, the standard optimiser that real splat training uses too.">
                      <Slider label="Learning rate" value={settings.rate} min={0.25} max={4} step={0.25} onChange={(v) => set('rate', v)} format={(v) => `${v}×`} hint="Higher learns faster but jitters; too high and blobs overshoot." />
                      <Field label="Picture size">
                        <div className="flex flex-wrap gap-1.5">
                          {DETAILS.map((d) => <Chip key={d} small active={detail === d} onClick={() => { setDetail(d); setAnnounce(`Restarted at ${d} pixels across.`) }}>{d} px</Chip>)}
                        </div>
                      </Field>
                      <p className="text-xs leading-relaxed text-ink-faint">Changing the size restarts the fit. Bigger pictures need more blobs and more steps.</p>
                    </Panel>
                  ),
                },
              ]}
            />

            <div>
              <h2 className="text-sm font-medium">What just happened</h2>
              <ol className="mt-2 space-y-1 text-sm text-ink-muted" data-testid="log">
                {log.length ? log.map((l, i) => (
                  <li key={`${l.at}-${i}`} className="flex gap-3">
                    <span className="w-20 shrink-0 tabular-nums text-ink-faint">Step {l.at.toLocaleString()}</span>
                    <span>{l.text}</span>
                  </li>
                )) : <li className="text-ink-faint">Nothing yet.</li>}
              </ol>
            </div>
            <p aria-live="polite" className="sr-only">{announce}</p>
          </section>
        </div>

        <section aria-labelledby="how" className="mt-12 border-t border-rule pt-8">
          <h2 id="how" className="font-display text-3xl">How a splat learns</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
            A real capture starts from a rough cloud of 3D blobs and photos of the scene from many angles. It runs the loop below tens
            of thousands of times, with one photo per step. This page runs the same loop against one flat picture. The one thing
            missing is depth: in 3D the blobs are sorted front to back and blended; here they just add up.
          </p>
          <ol className="mt-6 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ['1 · Render', 'Draw every blob: a soft ellipse with a centre, two sizes, an angle, a colour and an opacity.'],
              ['2 · Compare', 'Subtract the picture. The loss is the average squared difference, the line in the graph.'],
              ['3 · Backpropagate', 'Work out, for every number on every blob, which way to nudge it to shrink the loss.'],
              ['4 · Step', 'Adam nudges them all a little. Each blob keeps its own running average, so steps stay steady.'],
              ['5 · Prune and grow', 'Every 100 steps, drop blobs that have faded to nothing and add small ones where the error is worst.'],
            ].map(([t, d]) => (
              <li key={t} className="min-w-0">
                <p className="text-sm font-medium">{t}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">{d}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <Footer />
    </div>
  )
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded border border-rule px-3 py-2">
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums" data-testid={testId}>{value}</dd>
    </div>
  )
}

function describe(e: TrainEvent) {
  const blobs = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'blob' : 'blobs'}`
  const text =
    e.kind === 'start' ? `Scattered ${blobs(e.n)} at random`
    : e.kind === 'grow' ? `Grew ${blobs(e.n)} where it was wrong`
    : e.kind === 'add' ? `You added ${blobs(e.n)}`
    : e.n ? `Pruned ${blobs(e.n)} that had faded out` : 'Nothing weak enough to prune'
  return { at: e.at, text }
}

function seedNow() {
  return (Math.random() * 2 ** 32) >>> 0
}

// --- pictures from files ----------------------------------------------------

/** Pictures wider or taller than 3:1 are cropped to it. */
const clampAspect = (a: number) => Math.min(3, Math.max(1 / 3, a))
/** Never decode more than this many pixels at once, whatever the file claims. */
const MAX_PIXELS = 50_000_000
const MAX_BYTES = 50 * 1024 * 1024
const DECODE_LONG = 1024

class TooBig extends Error {}

/**
 * Read the size from the header first, then decode straight to at most
 * 1024 px on the long side, so a huge photo or a decompression bomb can't
 * take the tab down.
 */
async function decodeSmall(file: File) {
  if (file.size > MAX_BYTES) throw new TooBig('That file is over 50 MB. Try a smaller picture.')
  const url = URL.createObjectURL(file)
  let w: number, h: number
  try {
    const img = new Image()
    img.src = url
    await new Promise<void>((ok, fail) => { img.onload = () => ok(); img.onerror = () => fail(new Error('not an image')) })
    w = img.naturalWidth
    h = img.naturalHeight
  } finally {
    URL.revokeObjectURL(url)
  }
  if (!w || !h) throw new Error('no size')
  if (w * h > MAX_PIXELS) throw new TooBig('That picture is over 50 megapixels. Try a smaller one.')
  const k = Math.min(1, DECODE_LONG / Math.max(w, h))
  return createImageBitmap(file, { resizeWidth: Math.max(1, Math.round(w * k)), resizeHeight: Math.max(1, Math.round(h * k)), resizeQuality: 'high' })
}

/** Draw a bitmap filling width × height, cropping the middle if its shape is more extreme than 3:1. */
function drawCropped(ctx: CanvasRenderingContext2D, b: ImageBitmap, width: number, height: number) {
  const a = b.width / b.height, want = clampAspect(a)
  const sw = a > want ? b.height * want : b.width
  const sh = a < want ? b.width / want : b.height
  ctx.drawImage(b, (b.width - sw) / 2, (b.height - sh) / 2, sw, sh, 0, 0, width, height)
}

