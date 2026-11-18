import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import { KNOBS, MATERIALS, type Knobs, type Material } from '../splat-engine/mpm.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field, Slider } from '../shared/ui.tsx'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import type { CreatureStage } from './creature/stage.ts'
import { DETAILS, GROUNDS, SETUP, TESTS, THINGS, groundFor, type Detail, type Ground, type Setup, type Test, type Thing } from './flow/box.ts'
import type { FromFlow, ToFlow } from './flow/flow.worker.ts'
import { LANE_GAP, LOOK, SIZE, flowActor, laneX, poseThings, showLane, type FlowActor } from './flow/view.ts'
import { href } from './routes.ts'

/** Which material the box holds, or all three, each in its own lane. */
type Pick = Material | 'all'
const HOME: Orbit = { target: [0, 0.35, 0], distance: 3.4, azimuth: 30, elevation: 24 }
const HOME_ALL: Orbit = { target: [0, 0.15, 0], distance: 7.6, azimuth: 0, elevation: 28 }
const SPEEDS = [{ id: 1, label: 'Real time' }, { id: 0.5, label: 'Half' }, { id: 0.25, label: 'Quarter' }]
const pct = (v: number) => `${Math.round(v * 100)}%`
/** What a thing weighs like, for its weight against the material's. */
const weighs = (w: number) => `${w.toFixed(1)}× · ${w < 0.8 ? 'cork' : w < 1.6 ? 'wood' : w < 3.5 ? 'stone' : w < 6 ? 'iron' : 'lead'}`

interface LaneView { top: number; width: number; count: number }
declare global {
  interface Window {
    __flow?: {
      stage: CreatureStage
      /** Particles in every lane together. */
      count: () => number
      /** Runs every lane for exactly this long, then resolves with the count. */
      run: (seconds: number) => Promise<number>
      pause: () => void
      /** Each lane's material, how high it reaches over the floor and how wide it lies, in box sides. */
      lanes: () => (LaneView & { material: Material })[]
      /** The first lane's thing: its middle's height over the floor and its radius, or null. */
      thing: () => { y: number; r: number } | null
      poke: (x: number, y: number) => boolean
    }
  }
}

/** A value once it has stopped changing for `ms`. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}

const oneOf = <T extends string>(v: string | null, all: readonly T[], or: T): T => (all as readonly string[]).includes(v ?? '') ? (v as T) : or

/**
 * Sand, Snow and Goo: a material point simulation (splat-engine/mpm.ts) of one
 * material and one test (flow/box.ts), run in a worker, every particle drawn
 * as a blob by our engine. All three is three workers, a lane each. The blobs
 * sit on one still bone and are handed to the engine again each frame
 * (`refresh`), as on Shape Shifter; unused ones are kept, clear, so the count
 * never changes.
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
  const [pick, setPick] = useState<Pick>(() => oneOf(params.get('material'), [...MATERIALS, 'all'] as const, SETUP.material))
  const [test, setTest] = useState<Test>(() => oneOf(params.get('test'), TESTS.map((t) => t.id), SETUP.test))
  const [groundPick, setGround] = useState<Ground>(() => oneOf(params.get('ground'), Object.keys(GROUNDS) as Ground[], SETUP.ground))
  const [thing, setThing] = useState<Thing>(() => oneOf(params.get('thing'), THINGS.map((t) => t.id), SETUP.thing))
  const [size, setSize] = useState(SETUP.size)
  const [weight, setWeight] = useState(SETUP.weight)
  const [detail, setDetail] = useState<Detail>(() => oneOf(params.get('detail'), Object.keys(DETAILS) as Detail[], coarse ? 'light' : SETUP.detail))
  const [knobs, setKnobs] = useState<Knobs>(() => ({ sand: { ...KNOBS.sand }, snow: { ...KNOBS.snow }, goo: { ...KNOBS.goo } }))
  const [gravity, setGravity] = useState(4)
  const [speed, setSpeed] = useState(1)
  const [playing, setPlaying] = useState(!calm)
  const [orbit, setOrbit] = useState<Orbit>(pick === 'all' ? HOME_ALL : HOME)
  const [info, setInfo] = useState({ count: 0, time: 0, full: false, pouring: false })
  const ground = groundFor(test, groundPick)
  // the box starts again once a slider has stopped moving, not at every step of the way
  const sizeNow = useSettled(size, 250), weightNow = useSettled(weight, 250)
  const materials: Material[] = useMemo(() => (pick === 'all' ? [...MATERIALS] : [pick]), [pick])
  const home = pick === 'all' ? HOME_ALL : HOME

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

  // a worker a lane, and the newest frame each sent for the box it runs now
  const workers = useRef<(Worker | undefined)[]>([])
  const latest = useRef<(FromFlow | null)[]>([null, null, null])
  const boxId = useRef(0)
  const waiting = useRef<{ lane: number; done: () => void }[]>([])
  const shownAt = useRef(0)
  const laneCount = useRef(1)
  const worker = (lane: number): Worker => {
    let w = workers.current[lane]
    if (w) return w
    w = workers.current[lane] = new Worker(new URL('./flow/flow.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<FromFlow>) => {
      if (e.data.id !== boxId.current || lane >= laneCount.current) return
      latest.current[lane] = e.data
      const due = waiting.current.filter((k) => k.lane === lane)
      waiting.current = waiting.current.filter((k) => k.lane !== lane)
      due.forEach((k) => k.done())
      // the words under the view follow a few times a second
      const now = performance.now()
      if (now - shownAt.current > 250) { shownAt.current = now; setInfo(summed()) }
    }
    return w
  }
  const summed = () => {
    const fs = latest.current.slice(0, laneCount.current)
    return { count: fs.reduce((s, f) => s + (f?.count ?? 0), 0), time: fs[0]?.time ?? 0, full: fs.some((f) => f?.full), pouring: fs.some((f) => f?.pouring) }
  }
  useEffect(() => () => { workers.current.forEach((w) => w?.terminate()); workers.current = [] }, [])
  const send = (m: ToFlow) => { for (let l = 0; l < laneCount.current; l++) worker(l).postMessage(m) }

  // a fresh box for each lane whenever what it starts as changes
  const live = useRef({ knobs, gravity, speed })
  live.current = { knobs, gravity, speed }
  const [restarts, setRestarts] = useState(0)
  const restart = () => setRestarts((n) => n + 1)
  useEffect(() => {
    boxId.current++
    laneCount.current = materials.length
    latest.current = [null, null, null]
    waiting.current = []
    setInfo({ count: 0, time: 0, full: false, pouring: false })
    if (!calm) setPlaying(true)
    materials.forEach((material, l) => {
      const setup: Setup = { material, test, ground, thing, size: sizeNow, weight: weightNow, detail }
      const w = worker(l)
      w.postMessage({ type: 'start', id: boxId.current, setup, knobs: live.current.knobs, gravity: live.current.gravity } satisfies ToFlow)
      w.postMessage({ type: 'set', speed: live.current.speed } satisfies ToFlow)
      // a new box runs, even if the last one was paused: paused, a pour would show an empty tray
      w.postMessage({ type: 'play', playing: !calm } satisfies ToFlow)
      // with motion turned down, show where it comes to rest instead of an empty box
      if (calm && !offscreen) w.postMessage({ type: 'run', seconds: 5 } satisfies ToFlow)
    })
    // lanes not in use now stop working
    for (let l = materials.length; l < 3; l++) workers.current[l]?.postMessage({ type: 'play', playing: false } satisfies ToFlow)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials, test, ground, thing, sizeNow, weightNow, detail, restarts])
  useEffect(() => { send({ type: 'set', knobs, gravity, speed }) }, [knobs, gravity, speed])
  useEffect(() => { send({ type: 'play', playing }) }, [playing])
  const mounted = useRef(false)
  useEffect(() => { if (mounted.current) setOrbit(pick === 'all' ? HOME_ALL : HOME); mounted.current = true }, [pick])

  // the lanes' grounds and things, and a blob for every particle they could hold
  const actor = useRef<FlowActor>(undefined)
  const shown = useRef({ materials, thing, knobs })
  shown.current = { materials, thing, knobs }
  const lanes = materials.length
  useEffect(() => {
    if (!stage) return
    const a = flowActor(ground, detail, lanes)
    actor.current = a
    stage.setActor(a)
    stage.setFloor(SIZE * (lanes > 1 ? 1.6 + LANE_GAP * 2 : 1.6))
    // what each lane last drew: nothing yet, so even an empty lane is written once
    const drew: (FromFlow | null | undefined)[] = [undefined, undefined, undefined]
    stage.setPoser((sk) => {
      sk.reset()
      sk.rootScale = SIZE
      let changed = false
      for (let l = 0; l < a.lanes; l++) {
        const f = latest.current[l]
        poseThings(a, l, f, shown.current.thing)
        if (f === drew[l]) continue
        drew[l] = f
        showLane(a, l, f, shown.current.materials[l] ?? 'sand', shown.current.knobs)
        changed = true
      }
      sk.update()
      if (changed) stage.refresh()
    })
    stage.playing = true
  }, [stage, ground, detail, lanes])
  useEffect(() => { if (stage) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit])

  /** Pokes whatever is under a point on the view: the nearest particle along the line in any lane, else that lane's floor. */
  const pokeAt = (x: number, y: number): boolean => {
    const ray = stage?.rayAt(x, y), a = actor.current
    if (!ray || !a) return false
    const d = ray.direction
    let best = Infinity, lane = -1
    const reach = a.radius * 2.2
    const origin = (l: number) => [ray.origin[0] / SIZE - laneX(l, a.lanes) + 0.5, ray.origin[1] / SIZE + a.floor, ray.origin[2] / SIZE + 0.5]
    for (let l = 0; l < a.lanes; l++) {
      const f = latest.current[l]
      if (!f) continue
      const o = origin(l)
      let t = Infinity
      for (let i = 0; i < f.count; i++) {
        const px = f.x[i * 3] - o[0], py = f.x[i * 3 + 1] - o[1], pz = f.x[i * 3 + 2] - o[2]
        const along = px * d[0] + py * d[1] + pz * d[2]
        if (along <= 0 || along >= t) continue
        const ox = px - along * d[0], oy = py - along * d[1], oz = pz - along * d[2]
        if (ox * ox + oy * oy + oz * oz < reach * reach) t = along
      }
      if (t === Infinity && d[1] < 0) {
        // the floor, where it is inside this lane's box
        const tf = -(o[1] - a.floor) / d[1], fx = o[0] + tf * d[0], fz = o[2] + tf * d[2]
        if (fx > 0 && fx < 1 && fz > 0 && fz < 1) t = tf
      }
      if (t < best) { best = t; lane = l }
    }
    if (lane < 0) return false
    const o = origin(lane)
    // a push away from the camera and up, as if flicked
    worker(lane).postMessage({ type: 'poke', at: [o[0] + best * d[0], o[1] + best * d[1], o[2] + best * d[2]], push: [d[0] * 2.5, Math.abs(d[1]) * 1.5 + 1.2, d[2] * 2.5] } satisfies ToFlow)
    return true
  }

  // For verify: the stage and the simulation, without clicking
  useEffect(() => {
    if (!stage) return
    window.__flow = {
      stage,
      count: () => summed().count,
      pause: () => { setPlaying(false); send({ type: 'play', playing: false }) },
      run: (seconds) => Promise.all(Array.from({ length: laneCount.current }, (_, lane) => new Promise<void>((done) => {
        waiting.current.push({ lane, done })
        worker(lane).postMessage({ type: 'run', seconds } satisfies ToFlow)
      }))).then(() => summed().count),
      lanes: () => shown.current.materials.map((material, l) => {
        const f = latest.current[l], floor = actor.current?.floor ?? 0
        let top = 0, lo = 1, hi = 0
        if (f) for (let i = 0; i < f.count; i++) { top = Math.max(top, f.x[i * 3 + 1] - floor); lo = Math.min(lo, f.x[i * 3]); hi = Math.max(hi, f.x[i * 3]) }
        return { material, top, width: Math.max(0, hi - lo), count: f?.count ?? 0 }
      }),
      thing: () => { const b = latest.current[0]?.body; return b?.length ? { y: b[1] - (actor.current?.floor ?? 0), r: b[7] } : null },
      poke: pokeAt,
    }
    return () => { delete window.__flow }
    // these read refs and the stage only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const down = useRef<{ x: number; y: number; t: number } | null>(null)
  useWheelZoom(canvas, setOrbit)

  const act = (m: ToFlow) => { send(m); if (!playing) setPlaying(true) }
  const setKnob = <M extends Material>(m: M, k: Partial<Knobs[M]>) => setKnobs((was) => ({ ...was, [m]: { ...was[m], ...k } }))
  const busy = !failed && (!drawn || !latest.current[0])
  const cap = DETAILS[detail].capacity * lanes
  const counts = `${info.count.toLocaleString()} of ${cap.toLocaleString()}`
  const LINK = 'underline decoration-rule underline-offset-2 hover:text-accent'
  const what = pick === 'all' ? 'sand, snow and goo, a lane each' : LOOK[pick].label.toLowerCase()
  const testNow = TESTS.find((t) => t.id === test)!
  const controls: Record<Material, React.ReactNode> = {
    sand: <>
      <Slider label="Friction" value={knobs.sand.friction} min={15} max={45} step={1} onChange={(v) => setKnob('sand', { friction: v })} format={(v) => `${v}°`} hint="The steepest slope a dry heap keeps." />
      <Slider label="Dampness" value={knobs.sand.damp} min={0} max={1} step={0.05} onChange={(v) => setKnob('sand', { damp: v })} format={pct} hint="Damp sand holds together a little, so it stands in walls and breaks in lumps." />
    </>,
    snow: <>
      <Slider label="Stickiness" value={knobs.snow.stick} min={0} max={1} step={0.05} onChange={(v) => setKnob('snow', { stick: v })} format={pct} hint="From dry powder, which runs like sand, to wet packing snow, which stands and breaks in clumps." />
      <Slider label="Fluffiness" value={knobs.snow.pack} min={0} max={1} step={0.05} onChange={(v) => setKnob('snow', { pack: v })} format={pct} hint="How far it packs down where it is pressed. Packed snow is drawn a shade darker." />
    </>,
    goo: <>
      <Slider label="Thickness" value={knobs.goo.thick} min={0} max={1} step={0.05} onChange={(v) => setKnob('goo', { thick: v })} format={pct} hint="From runny to treacle: how slowly it flows." />
      <Slider label="Holds its shape" value={knobs.goo.hold} min={0} max={1} step={0.05} onChange={(v) => setKnob('goo', { hold: v })} format={pct} hint="None, and it ends as a puddle. More, and it stops as a soft mound." />
    </>,
  }

  return (
    <div className="pb-4">
      <Crumbs here="Sand, Snow and Goo" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Sand, Snow and Goo</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          Blobs that flow. Each one is a particle of sand, snow or goo, and a small physics simulation moves them all. Pick a
          material and a test: pour it, drop something solid in it, or let a column of it go. Change how it behaves as it runs.
        </p>
      </header>
      <Workbench
        viewLabel="The box"
        view={<>
          <canvas
            ref={canvas}
            role="application"
            aria-roledescription="3D view"
            aria-label={`${info.count.toLocaleString()} particles of ${what}${playing ? ', moving' : ', paused'}. Tap to poke. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom; Enter pokes the middle.`}
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
          <p role="status" className="sr-only">{busy ? (stage ? 'Filling the box…' : 'Starting the splat engine…') : info.pouring ? 'Pouring.' : ''}</p>
          {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(home)} />
          <p aria-hidden className="pointer-events-none absolute right-14 bottom-2 left-3 text-right text-xs text-ink-faint">{coarse ? 'tap to poke · drag to orbit' : 'click to poke · drag to orbit'}</p>
        </>}
        status={<>
          <span><span className="tabular-nums text-ink" data-testid="flow-count">{counts}</span> particles{info.full ? ', and the box is full: start over to pour more' : ''}.</span>
          <span className="tabular-nums">{info.time.toFixed(1)} s simulated</span>
        </>}
        tabsLabel="Options"
        tabs={[
          {
            id: 'material', label: 'Material', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Material">
                  <div className="flex flex-wrap gap-1.5" data-testid="flow-materials">
                    {MATERIALS.map((m) => <Chip key={m} active={pick === m} onClick={() => setPick(m)}>{LOOK[m].label}</Chip>)}
                    <Chip active={pick === 'all'} onClick={() => setPick('all')}>All three</Chip>
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">{pick === 'all' ? 'The same test on each, side by side in a lane of its own.' : LOOK[pick].note}</p>
                </Field>
                {materials.map((m) => (
                  <div key={m} className="grid gap-3" role="group" aria-label={`${LOOK[m].label} settings`}>
                    {pick === 'all' && <p className="text-sm font-medium text-ink">{LOOK[m].label}</p>}
                    {controls[m]}
                  </div>
                ))}
              </div>
            ),
          },
          {
            id: 'test', label: 'Test', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Test">
                  <div className="flex flex-wrap gap-1.5" data-testid="flow-tests">
                    {TESTS.map((t) => <Chip key={t.id} active={test === t.id} onClick={() => { if (t.id === test) restart(); else setTest(t.id) }}>{t.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">{testNow.note}</p>
                </Field>
                <Field label={test === 'drop' ? 'Into' : 'Onto'}>
                  <div className="flex flex-wrap gap-1.5" data-testid="flow-grounds">
                    {testNow.grounds.map((g) => <Chip key={g} active={ground === g} onClick={() => setGround(g)}>{(test === 'drop' && GROUNDS[g].pile) || GROUNDS[g].label}</Chip>)}
                  </div>
                </Field>
                {test === 'drop' && (
                  <div className="grid gap-3">
                    <Field label="Drop a">
                      <div className="flex flex-wrap gap-1.5" data-testid="flow-things">
                        {THINGS.map((t) => <Chip key={t.id} active={thing === t.id} onClick={() => setThing(t.id)}>{t.label}</Chip>)}
                      </div>
                    </Field>
                    <Slider label="Size" value={size} min={0} max={1} step={0.05} onChange={setSize} format={pct} />
                    <Slider label="Weight" value={weight} min={0.4} max={8} step={0.2} onChange={setWeight} format={weighs} hint="Its weight for its size against the material's own. Lighter than 1× and it can float." />
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {test === 'pour' && <Button primary onClick={() => act({ type: 'more' })} disabled={info.full || info.pouring}>Pour more</Button>}
                  {test === 'drop' && <Button primary onClick={() => act({ type: 'drop', thing, size, weight })}>Drop it again</Button>}
                  <Button primary={test === 'collapse'} onClick={restart}>Start over</Button>
                </div>
              </div>
            ),
          },
          {
            id: 'view', label: 'View', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Detail">
                  <div className="flex flex-wrap gap-1.5" data-testid="flow-detail">
                    {(Object.keys(DETAILS) as Detail[]).map((d) => <Chip key={d} active={detail === d} onClick={() => setDetail(d)}>{DETAILS[d].label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">Finer is more and smaller particles, and more work: where a device can't keep up, the box runs slower than real time.</p>
                </Field>
                <Field label="Speed">
                  <div className="flex flex-wrap gap-1.5">
                    {SPEEDS.map((k) => <Chip key={k.id} active={speed === k.id} onClick={() => setSpeed(k.id)}>{k.label}</Chip>)}
                  </div>
                </Field>
                <Slider label="Gravity" value={gravity} min={1} max={8} step={0.5} onChange={setGravity} format={(v) => `${v.toFixed(1)}×`} hint="In box sides per second squared." />
                <div className="flex flex-wrap gap-1.5">
                  <Button onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</Button>
                  <Button onClick={restart}>Start over</Button>
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
            Every small step, the particles hand their mass and speed to a coarse grid, the grid works out the push between
            neighbors, and the particles take their new speeds back. That's the material point method, the way the snow in
            Frozen was made, here in its short form (MLS-MPM) and on your device's processor.
          </p>
          <p>
            What makes the three differ is what each does once it's bent too far. Sand gives way whenever a slope is steeper
            than its friction and never holds when pulled, so it heaps. Snow is grains that hold on to each other: where it
            gives, those bonds weaken, so it breaks along cracks and the rest stays in clumps, and where it's pressed it packs
            down for good. Goo keeps its volume but not its shape, and how fast it gives is its thickness.
          </p>
          <p>
            The ball, cube and rock are solid bodies with weight. Where the material moves into one, the two come away at the
            same speed, so a heavy rock digs a crater in sand, stamps a packed print in snow and sinks slowly into goo, and a
            light ball rides on top. The block, steps and bowl are the same kind of solid, fixed in place.
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
