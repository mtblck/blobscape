import { useEffect, useMemo, useRef, useState } from 'react'
import { Blobs } from '../splat-core/blobs.ts'
import type { Orbit } from '../splat-core/view.ts'
import { Skeleton, emptySkin } from '../splat-engine/rig.ts'
import { MATERIALS, type Material } from '../splat-engine/mpm.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field, Slider } from '../shared/ui.tsx'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import type { CreatureStage } from './creature/stage.ts'
import { CAPACITY, SCENES, SHAPES, type Pour, type Shape } from './flow/scenes.ts'
import type { FromFlow, ToFlow } from './flow/flow.worker.ts'
import { href } from './routes.ts'

/** The box is this many world units a side, standing on the floor. */
const SIZE = 2.4
/** A particle's blob: about its share of the box, a little more so neighbors overlap. */
const RADIUS = (SIZE / 48) * 0.62
const LOOK: Record<Material, { label: string; color: [number, number, number]; note: string }> = {
  sand: { label: 'Sand', color: [0.86, 0.68, 0.42], note: "Grains that can't pull on each other: it runs until its slopes are no steeper than its friction allows." },
  snow: { label: 'Snow', color: [0.9, 0.93, 0.98], note: 'Holds together until it is pressed or pulled too far, then packs or cracks, and stays that way.' },
  goo: { label: 'Goo', color: [0.42, 0.8, 0.32], note: 'Gives way at the smallest stretch, so it runs out flat and draws out slowly when pulled.' },
}
const HOME: Orbit = { target: [0, 0.4, 0], distance: 3.3, azimuth: 30, elevation: 20 }

declare global {
  interface Window { __flow?: { stage: CreatureStage; count: () => number; run: (seconds: number) => Promise<number>; pause: () => void; heights: () => Record<Material, number>; poke: (x: number, y: number) => boolean } }
}

/** A small hash for a particle's grain: the same particle always has the same shade. */
const grain = (i: number) => { let h = Math.imul(i + 1, 2654435761) >>> 0; h ^= h >>> 15; return (h % 1000) / 1000 }

/**
 * Sand, Snow and Goo: a material point simulation (splat-engine/mpm.ts) run in
 * a worker, every particle drawn as a blob by our engine. The blobs sit on one
 * still bone and are handed to the engine again each frame (`refresh`), as on
 * Shape Shifter; unused ones are kept, clear, so the count never changes.
 */
export function SandSnowGoo() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<CreatureStage>()
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState<string>()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const offscreen = params.get('offscreen') === '1'
  const webgl = params.get('webgl') === '1'
  const calm = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const coarse = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches, [])
  const [scene, setScene] = useState(() => SCENES.find((s) => s.id === params.get('scene'))?.id ?? SCENES[0].id)
  const [material, setMaterial] = useState<Material>('sand')
  const [shape, setShape] = useState<Shape>('drop')
  const [gravity, setGravity] = useState(4)
  const [friction, setFriction] = useState(32)
  const [playing, setPlaying] = useState(!calm)
  const [orbit, setOrbit] = useState<Orbit>(HOME)
  const [info, setInfo] = useState({ count: 0, time: 0, full: false })

  useEffect(() => {
    let live: CreatureStage | undefined, gone = false
    import('./creature/stage.ts')
      .then(({ CreatureStage }) => CreatureStage.start(canvas.current!, { offscreen, webgl }))
      .then((s) => {
        if (gone) { s.dispose(); return }
        live = s
        s.onFirstFrame = () => setDrawn(true)
        s.setFloor(SIZE * 1.6)
        s.orbit = HOME
        setStage(s)
      }, (e: unknown) => { console.warn(e); setFailed('This browser could not start WebGPU or WebGL 2, which the blobs need.') })
    return () => { gone = true; live?.dispose() }
  }, [offscreen, webgl])

  // the worker, and the newest frame it sent
  const worker = useRef<Worker>(undefined)
  const latest = useRef<FromFlow | null>(null)
  const waiting = useRef<((f: FromFlow) => void)[]>([])
  useEffect(() => {
    const w = new Worker(new URL('./flow/flow.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    let shown = 0
    w.onmessage = (e: MessageEvent<FromFlow>) => {
      latest.current = e.data
      waiting.current.splice(0).forEach((f) => f(e.data))
      // the words under the view follow a few times a second
      const now = performance.now()
      if (now - shown > 250) { shown = now; setInfo({ count: e.data.count, time: e.data.time, full: e.data.full }) }
    }
    return () => { w.terminate(); worker.current = undefined }
  }, [])
  const send = (m: ToFlow) => worker.current?.postMessage(m)

  // a fresh box for each scene
  const settings = useRef({ gravity, friction })
  settings.current = { gravity, friction }
  useEffect(() => {
    send({ type: 'start', scene: SCENES.find((s) => s.id === scene)!.pours, ...settings.current })
  }, [scene])
  const [restarts, setRestarts] = useState(0)
  useEffect(() => { if (restarts) send({ type: 'start', scene: SCENES.find((s) => s.id === scene)!.pours, ...settings.current }) }, [restarts])
  useEffect(() => { send({ type: 'settings', gravity, friction }) }, [gravity, friction])
  useEffect(() => { send({ type: 'play', playing }) }, [playing])

  // one still bone holding a blob for every particle the box can hold
  const blobs = useMemo(() => {
    const b = new Blobs(CAPACITY)
    for (let i = 0; i < CAPACITY; i++) b.push({ center: [0, -10, 0], scale: [RADIUS, RADIUS, RADIUS], quat: [0, 0, 0, 1], color: [1, 1, 1], opacity: 0 })
    return b
  }, [])
  useEffect(() => {
    if (!stage) return
    const skeleton = new Skeleton([{ name: 'box', parent: -1, head: [0, 0, 0] }])
    const skin = emptySkin(CAPACITY)
    for (let i = 0; i < CAPACITY; i++) skin.weights[i * 4] = 1
    stage.setActor({ blobs, skin, skeleton })
    let shown: FromFlow | null = null
    stage.setPoser((sk) => {
      sk.reset()
      sk.update()
      const f = latest.current
      if (!f || f === shown) return
      shown = f
      const { center, color, opacity, scale } = blobs
      for (let i = 0; i < CAPACITY; i++) {
        if (i < f.count) {
          const y = f.x[i * 3 + 1]
          center[i * 3] = (f.x[i * 3] - 0.5) * SIZE
          center[i * 3 + 1] = y * SIZE
          center[i * 3 + 2] = (f.x[i * 3 + 2] - 0.5) * SIZE
          // each grain its own shade, and a little lighter higher up, so a heap reads as a heap
          const c = LOOK[MATERIALS[f.mat[i]]].color, k = 0.82 + 0.16 * grain(i) + 0.12 * Math.min(1, y * 2.5)
          color[i * 3] = Math.min(1, c[0] * k); color[i * 3 + 1] = Math.min(1, c[1] * k); color[i * 3 + 2] = Math.min(1, c[2] * k)
          opacity[i] = 1
          scale[i * 3] = scale[i * 3 + 1] = scale[i * 3 + 2] = RADIUS
        } else if (opacity[i] !== 0) {
          opacity[i] = 0
          scale[i * 3] = scale[i * 3 + 1] = scale[i * 3 + 2] = 1e-4
          center[i * 3 + 1] = -10
        }
      }
      stage.refresh()
    })
    stage.playing = true
  }, [stage, blobs])
  useEffect(() => { if (stage) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit])

  /** Pokes whatever is under a point on the view: the nearest particle along the line, else the floor. */
  const pokeAt = (x: number, y: number): boolean => {
    const ray = stage?.rayAt(x, y), f = latest.current
    if (!ray || !f) return false
    // into the box's own units
    const o = [ray.origin[0] / SIZE + 0.5, ray.origin[1] / SIZE, ray.origin[2] / SIZE + 0.5], d = ray.direction
    let best = Infinity
    const reach = (RADIUS * 2.2) / SIZE
    for (let i = 0; i < f.count; i++) {
      const px = f.x[i * 3] - o[0], py = f.x[i * 3 + 1] - o[1], pz = f.x[i * 3 + 2] - o[2]
      const t = px * d[0] + py * d[1] + pz * d[2]
      if (t <= 0 || t >= best) continue
      const ox = px - t * d[0], oy = py - t * d[1], oz = pz - t * d[2]
      if (ox * ox + oy * oy + oz * oz < reach * reach) best = t
    }
    if (best === Infinity && d[1] < 0) best = -o[1] / d[1]
    if (best === Infinity) return false
    const at: [number, number, number] = [o[0] + best * d[0], o[1] + best * d[1], o[2] + best * d[2]]
    if (at[0] < 0 || at[0] > 1 || at[2] < 0 || at[2] > 1) return false
    // a push away from the camera and up, as if flicked
    send({ type: 'poke', at, push: [d[0] * 2.5, Math.abs(d[1]) * 1.5 + 1.2, d[2] * 2.5] })
    return true
  }

  // For verify: the stage and the simulation, without clicking
  useEffect(() => {
    if (!stage) return
    window.__flow = {
      stage,
      count: () => latest.current?.count ?? 0,
      pause: () => { setPlaying(false); send({ type: 'play', playing: false }) },
      run: (seconds) => new Promise((done) => { waiting.current.push((f) => done(f.count)); send({ type: 'run', seconds }) }),
      heights: () => {
        const f = latest.current, out = { sand: 0, snow: 0, goo: 0 }
        if (f) for (let i = 0; i < f.count; i++) { const m = MATERIALS[f.mat[i]]; out[m] = Math.max(out[m], f.x[i * 3 + 1]) }
        return out
      },
      poke: pokeAt,
    }
    return () => { delete window.__flow }
    // pokeAt reads refs and the stage only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const down = useRef<{ x: number; y: number; t: number } | null>(null)
  useWheelZoom(canvas, setOrbit)

  const doPour = (where: [number, number] = [0.5, 0.5]) => {
    const p: Pour = { material, shape, at: where }
    send({ type: 'pour', pour: p })
    if (!playing) setPlaying(true)
  }
  const busy = !failed && (!drawn || info.count === 0)
  const counts = `${info.count.toLocaleString()} of ${CAPACITY.toLocaleString()}`
  const LINK = 'underline decoration-rule underline-offset-2 hover:text-accent'

  return (
    <div className="pb-4">
      <Crumbs here="Sand, Snow and Goo" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Sand, Snow and Goo</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          A box of blobs that flow. Each one is a particle of sand, snow or goo, and a small physics simulation moves them all, so a
          column of sand runs into a heap, snow stands until it is hit, and goo spreads. Pour more in, and tap to poke them.
        </p>
      </header>
      <Workbench
        viewLabel="The box"
        view={<>
          <canvas
            ref={canvas}
            role="application"
            aria-roledescription="3D view"
            aria-label={`A box of ${info.count.toLocaleString()} particles of sand, snow and goo${playing ? ', moving' : ', paused'}. Tap to poke. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom; Enter pokes the middle.`}
            tabIndex={0}
            data-testid="flow-view"
            className="absolute inset-0 h-full w-full cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset active:cursor-grabbing"
            onPointerDown={(ev) => {
              ev.currentTarget.setPointerCapture(ev.pointerId)
              pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
              drag.current = beginOrbitDrag(pointers.current, ev, orbit)
              down.current = pointers.current.size === 1 ? { x: ev.clientX, y: ev.clientY, t: performance.now() } : null
            }}
            onPointerMove={(ev) => {
              if (pointers.current.has(ev.pointerId)) pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
              const d = drag.current
              if (d) setOrbit(dragOrbit(d, pointers.current, ev))
            }}
            onPointerUp={(ev) => {
              pointers.current.delete(ev.pointerId)
              drag.current = null
              // a short tap that hardly moved is a poke, not a turn of the view
              const t = down.current
              down.current = null
              if (t && performance.now() - t.t < 350 && Math.hypot(ev.clientX - t.x, ev.clientY - t.y) < 6) {
                const r = ev.currentTarget.getBoundingClientRect()
                pokeAt(ev.clientX - r.left, ev.clientY - r.top)
              }
            }}
            onPointerCancel={(ev) => { pointers.current.delete(ev.pointerId); drag.current = null; down.current = null }}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter') { ev.preventDefault(); const r = ev.currentTarget.getBoundingClientRect(); pokeAt(r.width / 2, r.height * 0.6); return }
              if (!orbitKey(ev, orbit)) return
              ev.preventDefault()
              setOrbit((o) => orbitKey(ev, o) ?? o)
            }}
          />
          {busy && <LoadingMark testid="flow-loading" />}
          <p role="status" className="sr-only">{busy ? (stage ? 'Filling the box…' : 'Starting the splat engine…') : ''}</p>
          {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(HOME)} />
          <p aria-hidden className="pointer-events-none absolute right-14 bottom-2 left-3 text-right text-xs text-ink-faint">{coarse ? 'tap to poke · drag to orbit' : 'click to poke · drag to orbit'}</p>
        </>}
        status={<>
          <span><span className="tabular-nums text-ink" data-testid="flow-count">{counts}</span> particles{info.full ? ', and the box is full: start over to pour more' : ''}.</span>
          <span className="tabular-nums">{info.time.toFixed(1)} s simulated</span>
        </>}
        tabsLabel="Options"
        tabs={[
          {
            id: 'pour', label: 'Pour', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Material">
                  <div className="flex flex-wrap gap-1.5">
                    {MATERIALS.map((m) => <Chip key={m} active={material === m} onClick={() => setMaterial(m)}>{LOOK[m].label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">{LOOK[material].note}</p>
                </Field>
                <Field label="Shape">
                  <div className="flex flex-wrap gap-1.5">
                    {SHAPES.map((s) => <Chip key={s.id} active={shape === s.id} onClick={() => setShape(s.id)}>{s.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">{SHAPES.find((s) => s.id === shape)!.note}</p>
                </Field>
                <div className="flex flex-wrap gap-1.5">
                  <Button primary onClick={() => doPour()} disabled={info.full}>Pour {LOOK[material].label.toLowerCase()}</Button>
                  <Button onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</Button>
                </div>
              </div>
            ),
          },
          {
            id: 'box', label: 'Box', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Start with">
                  <div className="flex flex-wrap gap-1.5">
                    {SCENES.map((s) => <Chip key={s.id} active={scene === s.id} onClick={() => { if (s.id === scene) setRestarts((n) => n + 1); else setScene(s.id) }}>{s.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">{SCENES.find((s) => s.id === scene)!.note}</p>
                  <div className="mt-3"><Button small onClick={() => setRestarts((n) => n + 1)}>Start over</Button></div>
                </Field>
                <div className="grid gap-3">
                  <Slider label="Gravity" value={gravity} min={1} max={8} step={0.5} onChange={setGravity} format={(v) => `${v.toFixed(1)}×`} />
                  <Slider label="Sand friction" value={friction} min={15} max={45} step={1} onChange={setFriction} format={(v) => `${v}°`} />
                  <p className="text-xs text-ink-faint">Friction is the steepest slope a heap of sand keeps. Gravity is in box sides per second squared.</p>
                </div>
              </div>
            ),
          },
        ]}
      />

      <section aria-labelledby="how-title" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-sm text-ink-faint">How it works</p>
          <h2 id="how-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">Particles that remember how they were bent</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            Each blob is a particle that carries its speed and how far the stuff around it has been squashed, stretched and turned.
            Every small step, the particles hand their mass and speed to a coarse grid of about 14,000 points, the grid works
            out the push between neighbors, and the particles take their new speeds back. That's the material point method, the
            way the snow in Frozen was made, here in its short form (MLS-MPM) and on your device's processor.
          </p>
          <p>
            What makes sand, snow and goo differ is what each does once it's bent too far. Sand gives way whenever a slope is
            steeper than its friction and never holds when pulled, so it heaps. Snow holds firm, then packs or cracks for good and
            grows harder where it's packed. Goo gives way at the smallest stretch, so it spreads and draws out slowly.
          </p>
          <p>
            Every particle is drawn as a blob by Blobscape's own splat engine, like the creatures
            in <a href={href({ page: 'creature' })} className={LINK}>Splat Creatures</a>, but nothing here has bones: the blobs
            are moved by the simulation and handed to the engine again each frame. It runs as fast as your device allows, up to
            real time{playing ? '' : ' (paused now)'}.
          </p>
        </div>
      </section>
    </div>
  )
}
