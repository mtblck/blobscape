import { startFailure } from '../shared/stale.tsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import { layout, makeClock, poseClock, secondsOf } from '../splat-engine/clockwork.ts'
import type { Built } from '../splat-engine/body.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field } from '../shared/ui.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import { href } from './routes.ts'
import type { CreatureStage, Show } from './creature/stage.ts'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'

const SHOW: { id: Show; label: string }[] = [{ id: 'blobs', label: 'Blobs' }, { id: 'bones', label: 'Bones' }, { id: 'both', label: 'Both' }]
const SPEEDS = [
  { id: 0.05, label: 'Slow motion', note: 'one beat in four seconds' },
  { id: 1, label: 'Real time', note: 'five beats a second' },
  { id: 60, label: 'An hour a minute', note: 'the minute hand races round' },
  { id: 1440, label: 'A day a minute', note: 'the hour hand goes round twice' },
]
const DETAIL = [100000, 200000, 400000]
const L = layout()
const VIEWS: { id: string; label: string; orbit: Orbit }[] = [
  { id: 'front', label: 'Dial', orbit: { target: [0, 0, 0.1], distance: 3.4, azimuth: 0, elevation: 0 } },
  { id: 'angle', label: 'Angled', orbit: { target: [0, 0, 0.05], distance: 3.3, azimuth: 32, elevation: 22 } },
  { id: 'escape', label: 'Escapement', orbit: { target: [L.escape[0] * 0.35 + L.balance[0] * 0.65, L.escape[1] * 0.35 + L.balance[1] * 0.65, 0.1], distance: 1.1, azimuth: -12, elevation: 12 } },
  { id: 'side', label: 'Edge on', orbit: { target: [0, 0, 0.08], distance: 2.6, azimuth: 74, elevation: 8 } },
]
const kilo = (n: number) => `${n / 1000}k`

declare global {
  interface Window { __clock?: { stage: CreatureStage; blobs: () => number; bones: () => number } }
}

/** "3:42:07" for seconds past twelve. */
function reading(s: number) {
  const t = ((Math.floor(s) % 43200) + 43200) % 43200
  const h = Math.floor(t / 3600) || 12, m = Math.floor((t % 3600) / 60), sec = t % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/**
 * Clockwork: a watch movement made of blobs, from the barrel to the balance,
 * keeping the real time. Every wheel is a bone turning by the train's true
 * ratios, so the teeth stay meshed and the whole train ticks forward five
 * times a second. Drawn by Blobscape's own splat engine (the Creature page's
 * stage), posed straight from the time rather than from a looping clip.
 */
export function Clockwork() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<CreatureStage>()
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState<string>()
  const offscreen = useMemo(() => new URLSearchParams(location.search).get('offscreen') === '1', [])
  // under reduced motion the watch waits for you to start it
  const calm = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const [playing, setPlaying] = useState(!calm)
  const [speed, setSpeed] = useState(1)
  // phones start lighter: building the watch takes a moment on the main thread
  const [count, setCount] = useState(() => (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches ? DETAIL[0] : DETAIL[1]))
  const [show, setShow] = useState<Show>('blobs')
  const [view, setView] = useState('angle')
  const [orbit, setOrbit] = useState<Orbit>(VIEWS[1].orbit)
  const [shows, setShows] = useState(() => secondsOf(new Date()))

  // built after a paint, so the loading note shows first
  const [clock, setClock] = useState<Built>()
  useEffect(() => {
    const t = setTimeout(() => setClock(makeClock(count)), 30)
    return () => clearTimeout(t)
  }, [count])
  /** True while the watch shows the time where you are: kept in step with the wall clock until you stop it or change speed. */
  const live = useRef(true)

  useEffect(() => {
    let live: CreatureStage | undefined, gone = false
    import('./creature/stage.ts')
      .then(({ CreatureStage }) => CreatureStage.start(canvas.current!, { offscreen }))
      .then((s) => {
        if (gone) { s.dispose(); return }
        live = s
        s.onFirstFrame = () => setDrawn(true)
        s.setFloor(0)
        setStage(s)
      }, (e: unknown) => { console.warn(e); setFailed(startFailure('the watch needs')) })
    return () => { gone = true; live?.dispose() }
  }, [offscreen])

  // a new level of detail keeps the time it was showing
  useEffect(() => {
    if (!stage || !clock) return
    const from = live.current || !started.current ? secondsOf(new Date()) : stage.time
    started.current = true
    stage.setActor(clock)
    stage.setPoser(poseClock, from)
  }, [stage, clock])
  const started = useRef(false)
  // frames are capped and a hidden tab draws none, so a live watch is put back in step with the wall clock now and then
  useEffect(() => {
    if (!stage) return
    const sync = () => {
      if (!live.current || document.hidden) return
      const now = secondsOf(new Date())
      if (Math.abs(stage.time - now) > 0.25) stage.setPoser(poseClock, now)
    }
    document.addEventListener('visibilitychange', sync)
    const id = setInterval(sync, 5000)
    return () => { document.removeEventListener('visibilitychange', sync); clearInterval(id) }
  }, [stage])
  useEffect(() => { if (stage) stage.playing = playing }, [stage, playing])
  useEffect(() => { if (stage) stage.speed = speed }, [stage, speed])
  useEffect(() => { stage?.setShow(show) }, [stage, show])
  useEffect(() => { if (stage) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit])
  // what the hands read, a few times a second (not every frame: it's text)
  useEffect(() => {
    if (!stage) return
    if (!playing) { setShows(stage.time); return }
    const id = setInterval(() => setShows(stage.time), 250)
    return () => clearInterval(id)
  }, [stage, playing])

  // For verify: the stage, without clicking
  useEffect(() => {
    if (!stage || !clock) return
    window.__clock = { stage, blobs: () => stage.blobCount, bones: () => clock.skeleton.count }
    return () => { delete window.__clock }
  }, [stage, clock])

  const now = () => { live.current = true; stage?.setPoser(poseClock, secondsOf(new Date())); setSpeed(1); setPlaying(true) }

  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  useWheelZoom(canvas, setOrbit)
  const pick = (id: string) => { setView(id); setOrbit(VIEWS.find((v) => v.id === id)!.orbit) }
  const speedNote = SPEEDS.find((s) => s.id === speed)?.note ?? ''
  const backend = stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'

  return (
    <div className="pb-4">
      <Crumbs here="Clockwork" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Clockwork</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          A watch movement made of blobs, keeping the time where you are. Every wheel turns by the ratios of a real watch, the teeth
          stay meshed, and the balance swings five times a second. Slow it down to see one tick, or speed it up to watch the hours go.
        </p>
      </header>
      <Workbench
        viewLabel="The watch"
        view={<>
              <canvas
                ref={canvas}
                role="application"
                aria-roledescription="3D view"
                aria-label={`A watch movement${clock ? ` of ${clock.blobs.count.toLocaleString()} blobs` : ''}, ${playing ? 'running' : 'stopped'}. Its time is shown below the view. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.`}
                tabIndex={0}
                data-testid="clock-view"
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
              {!failed && (!drawn || !clock) && <LoadingMark testid="clock-loading" />}
              <p role="status" className="sr-only">{!failed && (!drawn || !clock) ? (stage ? 'Winding the watch…' : 'Starting the splat engine…') : ''}</p>
              {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
              <div role="group" aria-label="Show in the view" className="absolute top-3 left-3 flex gap-1.5 max-sm:top-2 max-sm:left-2">
                {SHOW.map((v) => <Chip small key={v.id} active={show === v.id} onClick={() => setShow(v.id)}>{v.label}</Chip>)}
              </div>
              <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => pick(view)} />
              <p aria-hidden className="pointer-events-none absolute right-14 bottom-2 left-3 text-right text-xs text-ink-faint">{typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches ? 'drag to orbit · pinch to zoom' : 'drag to orbit · scroll to zoom'}</p>
        </>}
        status={<>
              <span>{clock ? <><span className="tabular-nums text-ink" data-testid="clock-blobs">{clock.blobs.count.toLocaleString()}</span> blobs on <span className="tabular-nums text-ink">{clock.skeleton.count}</span> bones, one for each turning part.</> : 'Winding the watch…'}</span>
              <span>The hands read <span className="tabular-nums text-ink" data-testid="clock-reading">{reading(shows)}</span></span>
        </>}
        tabsLabel="Options"
        tabs={[
          {
            id: 'time', label: 'Time', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Speed">
                  <div className="flex flex-wrap gap-1.5">
                    {SPEEDS.map((s) => <Chip key={s.id} active={speed === s.id} onClick={() => { if (s.id !== 1) live.current = false; setSpeed(s.id); setPlaying(true) }}>{s.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">{playing ? speedNote[0].toUpperCase() + speedNote.slice(1) + '.' : 'Stopped.'}</p>
                </Field>
                <div className="flex flex-wrap gap-1.5">
                  <Button small onClick={() => { live.current = false; setPlaying((p) => !p) }}>{playing ? 'Stop' : 'Start'}</Button>
                  <Button small onClick={now}>Set to now</Button>
                </div>
                <div role="group" aria-labelledby="c-train">
                  <h2 id="c-train" className="mb-2 text-sm font-bold">The train <small className="ml-1 text-xs font-normal text-ink-faint">teeth, from the spring to the balance</small></h2>
              <ol className="grid gap-1 text-sm text-ink-muted">
                <li><b className="font-semibold text-ink">Barrel</b>, 72 teeth: the mainspring's drum, about a turn every seven hours.</li>
                <li><b className="font-semibold text-ink">Center wheel</b>, 64 on a 10-leaf pinion: once an hour, the minute hand.</li>
                <li><b className="font-semibold text-ink">Third wheel</b>, 60 on 8: eight turns an hour.</li>
                <li><b className="font-semibold text-ink">Fourth wheel</b>, 80 on 8: once a minute, the small seconds.</li>
                <li><b className="font-semibold text-ink">Escape wheel</b>, 15 on 8: half a tooth a beat.</li>
              </ol>
                </div>
              </div>
            ),
          },
          {
            id: 'view', label: 'View', content: (
              <div className={TAB_SECTIONS}>
                <Field label="View">
                  <div className="flex flex-wrap gap-1.5">
                    {VIEWS.map((v) => <Chip key={v.id} active={view === v.id} onClick={() => pick(v.id)}>{v.label}</Chip>)}
                  </div>
                </Field>
                <Field label="Blobs">
                  <div className="flex flex-wrap gap-1.5">
                    {DETAIL.map((n) => <Chip key={n} active={count === n} onClick={() => setCount(n)}>{kilo(n)}</Chip>)}
                  </div>
                </Field>
              </div>
            ),
          },
        ]}
      />

      <section aria-labelledby="how-title" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-sm text-ink-faint">How it keeps time</p>
          <h2 id="how-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">Five ticks a second, all the way down</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            The mainspring wants to unwind all at once. The balance, the gold wheel with the blue hairspring, swings to and fro at a
            steady rate, and each time it passes through the middle it knocks the pallet fork across. The fork lets the escape wheel
            turn by half a tooth and then catches it again. That's the tick, and every wheel in the train moves a little with it,
            even the hour hand.
          </p>
          <p>
            Here every turning part is one bone, and each frame sets each bone from the time alone, by the train's real ratios. That
            is why the teeth never slip through each other: where a wheel meets a pinion, a tooth sits in a gap at every moment,
            whatever the speed. There's no recorded clip to loop, so it can run for as long as you leave it.
          </p>
          <p>
            Blobscape's own splat engine draws it here on {backend}, moving every blob by its bone on the graphics card. Bones are the
            subject of the <a href={href({ page: 'lesson', id: 'one-bone' })} className="underline decoration-rule underline-offset-2 hover:text-accent">rigs lessons</a>, and
            the same engine moves the creatures in <a href={href({ page: 'creature' })} className="underline decoration-rule underline-offset-2 hover:text-accent">Splat Creatures</a>.
          </p>
        </div>
      </section>
    </div>
  )
}
