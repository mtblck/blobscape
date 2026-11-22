import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Blobs, Quat } from '../splat-core/blobs.ts'
import { ImportError, readSplatFile } from '../splat-core/importer.ts'
import { writePly } from '../splat-core/ply.ts'
import type { Orbit } from '../splat-core/view.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field, Slider, Toggle } from '../shared/ui.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import { href } from './routes.ts'
import { handOff, handOffScan } from './handoff.ts'
import { download, kb } from './files.ts'
import type { CreatureStage } from './creature/stage.ts'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { about, extent, keepOnly } from './scan/clean.ts'
import { sampleScan } from './scan/sample.ts'
import { LOOKS, type LookId } from './brushLooks.ts'
import { useDrawnLook } from './drawnLook.tsx'
import { ColliderOverlay, ColliderPanel } from './scan/Colliders.tsx'
import { ColliderFileError, guessColliders, pickCollider, placed, readColliderGlb, writeColliderGlb, type Collider } from '../splat-engine/colliders.ts'
import { trimEdits, DEFAULT_CLEAN, LIGHTS, UNTURNED, autoOrient, cleaner, finish, finishing, lightsFor, preview, stillActor, tip, working, type Clean, type LightId, type Orient } from './scan/studio.ts'

const FILE_TYPES = '.ply,.spz,.splat,.ksplat,.sog'
/** Slider ends that mean "off". */
const RADIUS_OFF = 2, TOP_OFF = 3, HUGE_OFF = 0.3

interface Scan { blobs: Blobs; name: string; note: string }
class EmptyScan extends Error {}
class TooBig extends Error {}

declare global {
  interface Window { __scan?: { stage: CreatureStage; kept: () => number; total: () => number; level: () => boolean | null; open: (bytes: ArrayBuffer, name: string) => Promise<void>; colliders: () => Collider[] } }
}

/**
 * Scan Studio: bring in a Gaussian splat scan of an object from a phone app,
 * find the table it stood on and turn it level, cut the table and the stray
 * blobs away, relight it with live lights, and take it into the sandbox or
 * save it. All the cleaning is plain numbers (scan/studio.ts); the view is the
 * Creature page's stage with live lights on.
 */
export function ScanStudio() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<CreatureStage>()
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState<string>()
  const offscreen = useMemo(() => new URLSearchParams(location.search).get('offscreen') === '1', [])
  const coarse = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches, [])
  // phones run out of memory sooner, and every step here runs over every blob
  const maxBlobs = coarse ? 300_000 : 800_000

  const [scan, setScan] = useState<Scan>()
  const [orient, setOrient] = useState<Orient>(UNTURNED)
  /** Whether a table was found (null: not looked yet, or turned by hand since). */
  const [found, setFound] = useState<boolean | null>(null)
  const [clean, setClean] = useState<Clean>(DEFAULT_CLEAN)
  // the slow steps follow the sliders a moment behind, so dragging one stays smooth on a big scan
  const [applied, setApplied] = useState<Clean>(DEFAULT_CLEAN)
  useEffect(() => {
    const t = setTimeout(() => setApplied(clean), 180)
    return () => clearTimeout(t)
  }, [clean])
  const [showCut, setShowCut] = useState(false)
  const [light, setLight] = useState<LightId>('scanned')
  const [drawnAs, setDrawnAs] = useState<LookId>('blobs')
  const [trim, setTrim] = useState(true)
  // solid shapes drawn over the scan, in the view's own units (the table at y = 0)
  const [colliders, setColliders] = useState<Collider[]>([])
  const [picked, setPicked] = useState(-1)
  const [showShapes, setShowShapes] = useState(true)
  const [angle, setAngle] = useState(40)
  const [ambient, setAmbient] = useState(1)
  const [keepLight, setKeepLight] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [orbit, setOrbit] = useState<Orbit>({ target: [0, 0.5, 0], distance: 4.5, azimuth: 30, elevation: 20 })

  /** A newly opened scan: look for its table, and start the clean-up again. */
  const take = useCallback((s: Scan) => {
    const o = autoOrient(s.blobs)
    setScan(s)
    setOrient(o ?? UNTURNED)
    setFound(!!o)
    // with no table to cut, the floor cut would only shave the bottom off the object
    const c = { ...DEFAULT_CLEAN, floor: o ? DEFAULT_CLEAN.floor : 0 }
    setClean(c)
    setApplied(c)
    setColliders([])
    setPicked(-1)
    framed.current = false
  }, [])

  // the sample mug, built after a paint so the loading note shows first
  useEffect(() => {
    const t = setTimeout(() => take({ blobs: sampleScan(7, coarse ? 0.6 : 1, 0.12).blobs, name: 'Sample mug', note: 'A made-up scan of a mug on a table, floaters and all.' }), 30)
    return () => clearTimeout(t)
  }, [take, coarse])

  const work = useMemo(() => (scan ? working(scan.blobs, orient) : undefined), [scan, orient])
  // each step's mask is remembered by its own setting, so one slider only redoes its own step
  const [clean1] = useState(cleaner)
  const masks = useMemo(() => (work ? clean1(work.blobs, applied) : undefined), [work, applied, clean1])
  const shown = useMemo(() => (work && masks ? preview(work.blobs, masks.all, showCut) : undefined), [work, masks, showCut])
  const box = useMemo(() => (work && masks ? extent(work.blobs, masks.all) : undefined), [work, masks])

  useEffect(() => {
    let live: CreatureStage | undefined, gone = false
    import('./creature/stage.ts')
      .then(({ CreatureStage }) => CreatureStage.start(canvas.current!, { offscreen, lights: true, cleanCuts: true }))
      .then((s) => {
        if (gone) { s.dispose(); return }
        live = s
        s.onFirstFrame = () => setDrawn(true)
        s.setFloor(0)
        s.playing = false
        setStage(s)
      }, (e: unknown) => { console.warn(e); setFailed('This browser could not start WebGPU or WebGL 2, which Scan Studio needs.') })
    return () => { gone = true; live?.dispose() }
  }, [offscreen])

  const framed = useRef(false)
  const reframe = useCallback(() => {
    if (!box) return
    const { lo, hi } = box
    const r = Math.max(0.3, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2)
    const next: Orbit = { target: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], distance: r * 3.2, azimuth: 30, elevation: 20 }
    setOrbit(next)
    // and at once, so a new scan's first frame isn't drawn from the last view
    if (stage) stage.orbit = next
  }, [box, stage])
  const reframeNow = useRef(reframe)
  reframeNow.current = reframe
  useEffect(() => {
    if (!stage || !shown) return
    stage.setActor(stillActor(shown))
    // a new scan (or a new turn) is framed once; after that the camera stays where you put it
    if (!framed.current) { framed.current = true; reframeNow.current() }
  }, [stage, shown])
  useEffect(() => {
    if (!stage || !box) return
    stage.setLights(lightsFor(light, angle, box.lo, box.hi), ambient)
  }, [stage, box, light, angle, ambient])
  useEffect(() => { if (stage) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit])

  const opening = useRef(false)
  const openBytes = useCallback(async (bytes: ArrayBuffer, name: string) => {
    const { blobs, step, dropped } = await readSplatFile(bytes, name, maxBlobs)
    if (!blobs.count) throw new EmptyScan()
    const kept = step > 1 ? `, keeping 1 blob in ${step}` : ''
    const skipped = dropped ? `, skipping ${dropped.toLocaleString()} broken ones` : ''
    take({ blobs, name, note: `${blobs.count.toLocaleString()} blobs${kept}${skipped}.` })
  }, [maxBlobs, take])
  const openFile = async (file: File) => {
    if (opening.current) return
    opening.current = true
    setError('')
    setMessage(`Opening ${file.name}…`)
    setBusy(true)
    try {
      if (file.size > (coarse ? 400e6 : 1.5e9)) throw new TooBig(`${file.name} is ${kb(file.size)}, more than this device can open here. A compressed .spz of the same scan is much smaller.`)
      await openBytes(await file.arrayBuffer(), file.name)
      setMessage(`Opened ${file.name}.`)
    } catch (err) {
      console.warn(err)
      setMessage('')
      const why = err instanceof ImportError || err instanceof TooBig ? err.message
        : err instanceof EmptyScan ? 'It holds no splats.'
        : err instanceof RangeError || (err instanceof DOMException && err.name === 'NotReadableError') ? 'This file is too big for this device.'
        : 'Scan Studio reads Gaussian splat files: .ply, .spz, .splat, .ksplat and .sog.'
      setError(`Couldn't open ${file.name}. ${why}`)
    } finally {
      setBusy(false)
      opening.current = false
    }
  }
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  // a file dropped just outside the view would otherwise make the browser open it
  useEffect(() => {
    const stop = (ev: DragEvent) => { if (ev.dataTransfer?.types.includes('Files')) ev.preventDefault() }
    window.addEventListener('dragover', stop)
    window.addEventListener('drop', stop)
    return () => { window.removeEventListener('dragover', stop); window.removeEventListener('drop', stop) }
  }, [])

  const turnBy = (q: Quat) => { setOrient((o) => tip(o, q)); setFound(null); framed.current = false }
  const level = () => {
    if (!scan) return
    const o = autoOrient(scan.blobs)
    if (!o) { setFound(false); return }
    setFound(true)
    // already level: nothing to redo
    if (o.floorY === orient.floorY && o.q.every((v, k) => Math.abs(v - orient.q[k]) < 1e-6)) return
    framed.current = false
    setOrient(o)
    if (!clean.floor) { const c = { ...clean, floor: DEFAULT_CLEAN.floor }; setClean(c); setApplied(c) }
  }
  const set = (patch: Partial<Clean>) => setClean((c) => ({ ...c, ...patch }))

  /** The object to take away: what's kept, lit as it shows if asked, stood up and sized. */
  const result = async () => {
    if (!work) return undefined
    // the sliders as they stand, even if the view hasn't caught up with the last move yet
    if (clean !== applied) setApplied(clean)
    const m = clean1(work.blobs, clean)
    const kept = keepOnly(work.blobs, m.all)
    if (!kept.count) return undefined
    const { bakeLights } = await import('../splat-engine/light.ts')
    const { lo, hi } = extent(kept)
    // the shapes go where the scan goes: sized and stood with it
    const { scale, shift } = finishing(kept)
    return { blobs: finish(light !== 'scanned' && keepLight ? bakeLights(kept, lightsFor(light, angle, lo, hi), ambient) : kept, undefined), shapes: colliders.map((c) => placed(c, scale, shift)), scale, shift }
  }
  const base = (scan?.name ?? 'scan').replace(/\.[a-z0-9]+$/i, '').replace(/[^\w-]+/g, '-').toLowerCase() || 'scan'
  /** Runs an export with the buttons held, and says what went wrong if it fails. */
  const exporting = async (what: string, run: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError('')
    setMessage(`${what}…`)
    // a paint first, so the note shows before the work holds the page
    await new Promise((r) => setTimeout(r, 30))
    try { await run() } catch (err) {
      console.warn(err)
      setMessage('')
      setError(err instanceof RangeError ? 'This scan is too big to export on this device.' : 'Something went wrong preparing the scan.')
    } finally { setBusy(false) }
  }
  const toSandbox = () => exporting('Packing it for the sandbox', async () => { const r = await result(); if (r) handOff(scan?.name ?? 'Your scan', r.blobs, r.shapes) })
  const toCreator = () => exporting('Packing it for Scene Creator', async () => {
    const b = (await result())?.blobs
    if (b) handOffScan(new File([writePly(b) as Uint8Array<ArrayBuffer>], `${base}.ply`))
  })
  const save = () => exporting('Writing the .ply', async () => {
    const b = (await result())?.blobs
    if (!b) return
    download(writePly(b), `${base}-clean.ply`, 'application/octet-stream')
    setMessage(`Saved ${base}-clean.ply (${b.count.toLocaleString()} blobs).`)
  })
  /** The shapes as a file, placed round the saved scan (the same move `finish` gives the blobs). */
  const shapesFile = async () => { const r = await result(); return r?.shapes.length ? writeColliderGlb(r.shapes) : undefined }
  const saveShapes = () => exporting('Writing the shapes', async () => {
    const bytes = await shapesFile()
    if (!bytes) return
    download(bytes, `${base}-colliders.glb`, 'model/gltf-binary')
    setMessage(`Saved ${base}-colliders.glb (${colliders.length} ${colliders.length === 1 ? 'shape' : 'shapes'}).`)
  })
  /** Shapes from a file, brought back from the saved scan's frame to the view's. */
  const openShapeBytes = async (bytes: Uint8Array) => {
    const r = await result()
    if (!r) return
    const back = readColliderGlb(bytes).map((c) => placed(c, 1 / r.scale, [-r.shift[0] / r.scale, -r.shift[1] / r.scale, -r.shift[2] / r.scale]))
    setColliders(back)
    setPicked(-1)
    setShowShapes(true)
    setMessage(`Opened ${back.length} ${back.length === 1 ? 'shape' : 'shapes'}.`)
  }
  const openShapes = async (file: File) => {
    setError('')
    try { await openShapeBytes(new Uint8Array(await file.arrayBuffer())) } catch (err) {
      console.warn(err)
      setMessage('')
      setError(`Couldn't open ${file.name}. ${err instanceof ColliderFileError ? err.message : 'It is not a .glb of shapes saved here.'}`)
    }
  }
  const guess = () => {
    if (!box) return
    setColliders(guessColliders(box.lo, box.hi, 0))
    setPicked(-1)
    setShowShapes(true)
  }
  /** Where a press began, to tell a click on a shape from a drag of the view. */
  const press = useRef<{ x: number; y: number } | null>(null)

  // a clean edge on the crops and the table cut: the kept blobs are trimmed where the cut passes through them
  useEffect(() => {
    if (!stage) return
    stage.setEdits(trim && !showCut ? trimEdits(applied) : [])
  }, [stage, trim, showCut, applied])

  // the looks are Brush and Ink's own, with their settings, set on the stage by the shared hook; a scan's thick,
  // overlapping blobs take their marks softly
  const looked = useDrawnLook(stage, drawnAs, { plain: false, azimuth: 0, soft: true, offscreen })

  // For verify: the stage and the counts, without clicking
  useEffect(() => {
    if (!stage) return
    window.__scan = { stage, kept: () => masks?.kept ?? 0, total: () => work?.blobs.count ?? 0, level: () => found, open: openBytes, colliders: () => colliders }
    return () => { delete window.__scan }
  }, [stage, masks, work, found, openBytes, colliders])

  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  useWheelZoom(canvas, setOrbit)
  const backend = stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'
  const cm = (v: number) => (work ? `${((v / work.scale) * 100).toFixed(v / work.scale < 0.1 ? 1 : 0)} cm` : '')
  const lightNote = LIGHTS.find((l) => l.id === light)!.note
  const total = work?.blobs.count ?? 0
  const waiting = !failed && (!drawn || !scan)
  const levelNote = found === true ? 'Found the table and turned it level.' : found === false ? 'No flat table found: turn it upright by hand.' : scan ? 'Turned by hand.' : ''

  return (
    <div className="pb-4">
      <Crumbs here="Scan Studio" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Scan Studio</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          Scan something on your phone, then bring the splat here. Scan Studio finds the table it stood on, turns it level and cuts it
          away with the stray blobs every capture leaves floating round. Then light it with a lamp or a candle, and take it into the sandbox.
        </p>
      </header>
      <Workbench
        viewLabel="The scan"
        view={(
          <div
            className={`absolute inset-0 ${dragOver ? 'ring-2 ring-accent ring-inset' : ''}`}
            onDragOver={(ev) => { if (ev.dataTransfer.types.includes('Files')) { ev.preventDefault(); setDragOver(true) } }}
            onDragLeave={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setDragOver(false) }}
            onDrop={(ev) => { ev.preventDefault(); setDragOver(false); const f = ev.dataTransfer.files[0]; if (f) void openFile(f) }}
          >
              {/* what the drawn looks stand on: paper for the pen, a dark ground for paint */}
              {looked.ground && <div aria-hidden className="absolute inset-0" style={{ background: looked.ground }} />}
              <canvas
                ref={canvas}
                role="application"
                aria-roledescription="3D view"
                aria-label={`${scan?.name ?? 'A scan'}${masks ? `, ${masks.kept.toLocaleString()} blobs kept` : ''}${showCut ? ', cut blobs shown in red' : ''}. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.`}
                tabIndex={0}
                data-testid="scan-view"
                className="absolute inset-0 h-full w-full cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset active:cursor-grabbing"
                onPointerDown={(ev) => {
                  ev.currentTarget.setPointerCapture(ev.pointerId)
                  pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
                  drag.current = beginOrbitDrag(pointers.current, ev, orbit)
                  press.current = { x: ev.clientX, y: ev.clientY }
                }}
                onPointerMove={(ev) => {
                  if (pointers.current.has(ev.pointerId)) pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
                  const d = drag.current
                  if (d) setOrbit(dragOrbit(d, pointers.current, ev))
                }}
                onPointerUp={(ev) => {
                  pointers.current.delete(ev.pointerId)
                  drag.current = null
                  // a click that hardly moved picks the shape under it
                  const from = press.current
                  press.current = null
                  if (!from || !stage || !showShapes || !colliders.length || Math.hypot(ev.clientX - from.x, ev.clientY - from.y) > 4) return
                  const r = ev.currentTarget.getBoundingClientRect()
                  const ray = stage.rayAt(ev.clientX - r.left, ev.clientY - r.top)
                  const hit = ray && pickCollider(colliders, ray.origin, ray.direction)
                  setPicked(hit ? hit.index : -1)
                }}
                onPointerCancel={(ev) => { pointers.current.delete(ev.pointerId); drag.current = null }}
                onKeyDown={(ev) => {
                  if (!orbitKey(ev, orbit)) return
                  ev.preventDefault()
                  setOrbit((o) => orbitKey(ev, o) ?? o)
                }}
              />
              {stage && showShapes && colliders.length > 0 && (
                <ColliderOverlay stage={stage} orbit={orbit} colliders={colliders} picked={picked} onChange={(i, c) => setColliders((list) => list.map((x, k) => (k === i ? c : x)))} />
              )}
              {waiting && <LoadingMark testid="scan-loading" />}
              <p role="status" className="sr-only">{waiting ? (stage ? 'Setting up the scan…' : 'Starting the splat engine…') : ''}</p>
              {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
              <div role="group" aria-label="Show in the view" className="absolute top-3 left-3 flex gap-1.5 max-sm:top-2 max-sm:left-2">
                <Chip small active={!showCut} onClick={() => setShowCut(false)}>Kept</Chip>
                <Chip small active={showCut} onClick={() => setShowCut(true)}>Kept and cut</Chip>
              </div>
              <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={reframe} />
              <p aria-hidden className="pointer-events-none absolute right-14 bottom-2 left-12 text-right text-xs text-ink-faint">{coarse ? 'drag to orbit · pinch to zoom' : 'drag to orbit · scroll to zoom · drop a scan here'}</p>
          </div>
        )}
        status={<>
              <span aria-live="polite">{masks ? <>Keeping <span className="tabular-nums text-ink" data-testid="scan-kept">{masks.kept.toLocaleString()}</span> of <span className="tabular-nums text-ink">{total.toLocaleString()}</span> blobs{showCut ? ', the cut ones in red' : ''}.</> : 'Setting up the scan…'}</span>
              <span data-testid="scan-level">{levelNote}</span>
        </>}
        tabsLabel="Steps"
        tabs={[
          {
            id: 'import', label: 'Import', content: (
              <div className={TAB_SECTIONS}>
                <div className="grid gap-3">
                  <p className="text-xs text-ink-faint">A scan from your phone: .ply, .spz, .splat, .ksplat or .sog.</p>
                <p className="text-sm text-ink-muted"><b className="font-semibold text-ink">{scan?.name ?? 'Nothing yet'}</b>{scan ? `: ${scan.note}` : ''}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Button small primary disabled={busy} onClick={() => fileInput.current?.click()}>Open a scan…</Button>
                  <Button small disabled={busy} onClick={() => { setError(''); setMessage(''); take({ blobs: sampleScan(7, coarse ? 0.6 : 1, 0.12).blobs, name: 'Sample mug', note: 'A made-up scan of a mug on a table, floaters and all.' }) }}>Use the sample mug</Button>
                  <input ref={fileInput} type="file" accept={FILE_TYPES} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void openFile(f) }} />
                </div>
                <p className="text-xs leading-relaxed text-ink-faint">Your file stays on this device: it's opened here in the browser and never uploaded.</p>
                </div>
              </div>
            ),
          },
          {
            id: 'level', label: 'Level & Crop', content: (
              <div className={TAB_SECTIONS}>
                <div className="flex flex-wrap gap-1.5">
                  <Button small onClick={level}>Find the table</Button>
                  <Button small onClick={() => turnBy(about([1, 0, 0], 180))}>Flip over</Button>
                  <Button small onClick={() => turnBy(about([1, 0, 0], 90))}>Tip forward</Button>
                  <Button small onClick={() => turnBy(about([0, 0, 1], 90))}>Tip sideways</Button>
                </div>
                <Slider label="Cut the table" value={clean.floor} min={0} max={0.3} step={0.005} onChange={(v) => set({ floor: v })} format={(v) => (v ? `${cm(v)} up` : 'Off')} hint="Cuts everything below this height, the table and its shadow. Lengths assume the scan is in meters, as phone apps save them." />
                <Slider label="Crop round" value={clean.radius ?? RADIUS_OFF} min={0.1} max={RADIUS_OFF} step={0.02} onChange={(v) => set({ radius: v >= RADIUS_OFF ? null : v })} format={(v) => (v >= RADIUS_OFF ? 'Off' : cm(v))} hint="Keeps only what's within this distance of the middle." />
                <Slider label="Crop height" value={clean.top ?? TOP_OFF} min={0.1} max={TOP_OFF} step={0.02} onChange={(v) => set({ top: v >= TOP_OFF ? null : v })} format={(v) => (v >= TOP_OFF ? 'Off' : cm(v))} />
                <div data-testid="scan-trim">
                  <Toggle label="Trim blobs at the cut" checked={trim} onChange={setTrim} />
                  <p className="mt-1.5 text-xs text-ink-faint">The view cuts each blob where a crop or the table cut passes through it, so the edge is a clean line. A saved file keeps whole blobs.</p>
                </div>
              </div>
            ),
          },
          {
            id: 'clean', label: 'Clean', content: (
              <div className={TAB_SECTIONS}>
                <Slider label="Floaters" value={clean.floaters} min={0} max={1} step={0.05} onChange={(v) => set({ floaters: v })} format={(v) => (v ? (v < 0.35 ? 'Gentle' : v < 0.7 ? 'Medium' : 'Strong') : 'Off')} hint="Stray blobs off on their own, away from the object." />
                <Slider label="Faint blobs" value={clean.faint} min={0} max={0.5} step={0.01} onChange={(v) => set({ faint: v })} format={(v) => (v ? `< ${Math.round(v * 100)}%` : 'Off')} hint="Blobs you can barely see through." />
                <Slider label="Huge blobs" value={clean.huge ?? HUGE_OFF} min={0.01} max={HUGE_OFF} step={0.01} onChange={(v) => set({ huge: v >= HUGE_OFF ? null : v })} format={(v) => (v >= HUGE_OFF ? 'Off' : `> ${Math.round(v * 100)}%`)} hint="Big blurry blobs where the room behind was half seen, by size against the object." />
              </div>
            ),
          },
          {
            id: 'light', label: 'Lighting', content: (
              <div className={TAB_SECTIONS}>
                <p className="text-xs text-ink-faint">Live lights, drawn on {backend}.</p>
                <div className="grid gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {LIGHTS.map((l) => <Chip key={l.id} active={light === l.id} onClick={() => { setLight(l.id); setAmbient(l.ambient) }}>{l.label}</Chip>)}
                </div>
                <p className="text-xs text-ink-faint">{lightNote}</p>
                </div>
                <Field label="Drawn as">
                  <div className="flex flex-wrap gap-1.5" data-testid="scan-looks">
                    {[LOOKS[LOOKS.length - 1], ...LOOKS.slice(0, -1)].map((l) => <Chip key={l.id} active={drawnAs === l.id} onClick={() => setDrawnAs(l.id)}>{l.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">{drawnAs === 'blobs' ? 'Or as brush marks, pen strokes or characters. Only the view changes: the file keeps its blobs.' : `${LOOKS.find((l) => l.id === drawnAs)!.note} Only the view changes: the file keeps its blobs.`}</p>
                </Field>
                {drawnAs !== 'blobs' && looked.controls}
                {light !== 'scanned' && <>
                  <Slider label="Light from" value={angle} min={0} max={359} step={1} onChange={setAngle} format={(v) => `${v}°`} />
                  <Slider label="Room light" value={ambient} min={0} max={1} step={0.01} onChange={setAmbient} format={(v) => `${Math.round(v * 100)}%`} hint="How bright it is away from the light." />
                </>}
              </div>
            ),
          },
          {
            id: 'colliders', label: 'Colliders', content: (
              <div className={TAB_SECTIONS}>
                <ColliderPanel
                  colliders={colliders} picked={picked} onPick={setPicked}
                  onSet={(next, pick) => { setColliders(next); if (pick !== undefined) setPicked(pick); setShowShapes(true) }}
                  onGuess={guess} show={showShapes} onShow={setShowShapes}
                  lo={box?.lo ?? [-1, 0, -1]} hi={box?.hi ?? [1, 1, 1]}
                  onSave={() => void saveShapes()} onOpen={(f) => void openShapes(f)} busy={busy || !masks?.kept}
                />
              </div>
            ),
          },
        ]}
        footer={(
          <div role="group" aria-labelledby="s-take" className="grid gap-3">
            <h2 id="s-take" className="text-sm font-bold">Take it</h2>
                <div className="flex flex-wrap gap-1.5">
                  <Button small primary disabled={!masks?.kept || busy} onClick={() => void toSandbox()}>Open in the sandbox</Button>
                  <Button small disabled={!masks?.kept || busy} onClick={() => void toCreator()}>Open in Scene Creator</Button>
                  <Button small disabled={!masks?.kept || busy} onClick={() => void save()}>Download .ply</Button>
                </div>
                {light !== 'scanned' && <Toggle label="Keep the lighting in its colors" checked={keepLight} onChange={setKeepLight} />}
                <p className="text-xs leading-relaxed text-ink-faint">The kept blobs, stood on the floor and sized to sit beside the sandbox's own scenes. In Scene Creator they become the land, for props to stand on.</p>
                <p role="status" className="text-xs text-ink-muted empty:-mt-3">{message}</p>
                {error && <p role="alert" className="text-xs text-accent-ink">{error}</p>}
          </div>
        )}
      />

      <section aria-labelledby="how-title" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-sm text-ink-faint">From phone to scene</p>
          <h2 id="how-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">Your phone trains the blobs; this tidies them</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            Apps such as Scaniverse and Polycam can capture a Gaussian splat: walk slowly round something small and well lit, and the app
            fits hundreds of thousands of blobs to what the camera saw, the same loop <a href={href({ page: 'lesson', id: 'one-blob' })} className="underline decoration-rule underline-offset-2 hover:text-accent">the lessons</a> show
            in miniature. Export it as .ply or .spz and open it here.
          </p>
          <p>
            A capture keeps everything it saw, so the object comes with the table under it and a haze of stray blobs round it. Scan
            Studio finds the table by trying thousands of flat planes through the blobs and keeping the one most of them lie on, turns
            the scan so that's level, and cuts below it. Floaters go by clumping blobs into small cells and keeping only the big clump.
          </p>
          <p>
            The light from the day you scanned is baked into the colors. The lights here add to it, worked out for each blob from which
            way it faces, so a lamp brightens the near side of a mug. Blobscape's own splat engine draws it, the one that moves the
            creatures in <a href={href({ page: 'creature' })} className="underline decoration-rule underline-offset-2 hover:text-accent">Splat Creatures</a> and
            lights the torches in <a href={href({ page: 'dungeon' })} className="underline decoration-rule underline-offset-2 hover:text-accent">Dungeon Run</a>.
          </p>
        </div>
      </section>
    </div>
  )
}
