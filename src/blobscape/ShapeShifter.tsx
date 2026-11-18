import { startFailure } from '../shared/stale.tsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Blobs } from '../splat-core/blobs.ts'
import type { Orbit } from '../splat-core/view.ts'
import { Skeleton, emptySkin } from '../splat-engine/rig.ts'
import { amountAt, pairUp, shiftBlobs, sized, timeAt, type Order, type Pairing, type Path, type Shift } from '../splat-engine/shift.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field, Slider } from '../shared/ui.tsx'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import { CREATURES } from './creature/fromScenes.ts'
import type { CreatureStage } from './creature/stage.ts'
import { href } from './routes.ts'

const DETAIL = [15000, 40000, 80000]
/** Every creature is shown this long on its longest side, so a frog and a dragon meet as equals. */
const SIZE = 2.4
const PATHS: { id: Path; label: string; note: string }[] = [
  { id: 'straight', label: 'Straight', note: 'Each blob goes straight to its partner.' },
  { id: 'swirl', label: 'Swirl', note: 'Each blob goes once round the middle on its way.' },
  { id: 'melt', label: 'Melt', note: 'Down into a puddle on the floor, and up again.' },
  { id: 'burst', label: 'Burst', note: 'Out from the middle, and back in.' },
]
const ORDERS: { id: Order; label: string; note: string }[] = [
  { id: 'together', label: 'All together', note: 'Every blob sets off at once.' },
  { id: 'rise', label: 'From the floor up', note: 'The lowest blobs go first.' },
  { id: 'scatter', label: 'Scattered', note: 'Each blob sets off in its own time.' },
]
const PAIRINGS: { id: Pairing; label: string }[] = [{ id: 'place', label: 'By place' }, { id: 'random', label: 'At random' }]
const SPEEDS = [{ id: 6, label: 'Slow' }, { id: 3, label: 'Medium' }, { id: 1.5, label: 'Fast' }]
const kilo = (n: number) => `${n / 1000}k`
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const pct = (v: number) => `${Math.round(v * 100)}%`
const named = (id: string) => CREATURES.find((c) => c.id === id) ?? CREATURES[0]

declare global {
  interface Window { __shift?: { stage: CreatureStage; blobs: () => number; trip: () => number; amount: () => number } }
}

/** What the two creatures and the pairing come to: the shift on show, and how far blobs would travel paired the other way. */
interface Pair { shift: Shift; other: number; out: Blobs; key: string }

/** A view that holds both creatures, whatever their sizes. */
function fit(s: Shift): Orbit {
  let reach = 0
  for (const b of [s.from, s.to]) for (let i = 0; i < s.count; i++) reach = Math.max(reach, Math.hypot(b.center[i * 3] - s.mid[0], b.center[i * 3 + 2] - s.mid[1]))
  const tall = s.top - s.floor
  return { target: [s.mid[0], s.floor + tall * 0.5, s.mid[1]], distance: Math.max(2.6, Math.hypot(reach, tall / 2) * 2.9), azimuth: 35, elevation: 10 }
}

/**
 * Shape Shifter: one creature turning into another. The two are cut on their
 * own, with different numbers of blobs in no shared order; `pairUp` gives each
 * blob a partner and `shiftBlobs` blends the pair (splat-engine/shift.ts). The
 * blobs are moved here on the CPU and handed to the engine again every frame
 * (`CreatureStage.refresh`), on one bone that never moves.
 */
export function ShapeShifter() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<CreatureStage>()
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState<string>()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const offscreen = params.get('offscreen') === '1'
  // ?webgl=1 uses the WebGL 2 backend even where WebGPU would start, for testing the fallback
  const webgl = params.get('webgl') === '1'
  const calm = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const coarse = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches, [])
  const [from, setFrom] = useState(() => named(params.get('from') ?? 'frog').id)
  const [to, setTo] = useState(() => { const id = named(params.get('to') ?? 'dragon').id; return id === named(params.get('from') ?? 'frog').id ? CREATURES.find((c) => c.id !== id)!.id : id })
  const [count, setCount] = useState(coarse ? DETAIL[0] : DETAIL[1])
  const [pairing, setPairing] = useState<Pairing>('place')
  const [path, setPath] = useState<Path>('straight')
  const [order, setOrder] = useState<Order>('rise')
  const [seconds, setSeconds] = useState(3)
  const [playing, setPlaying] = useState(!calm)
  const [amount, setAmount] = useState(0)
  const [orbit, setOrbit] = useState<Orbit>({ target: [0, 0.8, 0], distance: 4.6, azimuth: 35, elevation: 10 })
  const home = useRef(orbit)

  useEffect(() => {
    let live: CreatureStage | undefined, gone = false
    import('./creature/stage.ts')
      .then(({ CreatureStage }) => CreatureStage.start(canvas.current!, { offscreen, webgl }))
      .then((s) => {
        if (gone) { s.dispose(); return }
        live = s
        s.onFirstFrame = () => setDrawn(true)
        setStage(s)
      }, (e: unknown) => { console.warn(e); setFailed(startFailure('the creatures need')) })
    return () => { gone = true; live?.dispose() }
  }, [offscreen, webgl])

  // each creature is cut once per level of detail, a moment apart so the loading mark keeps moving
  const cut = useRef(new Map<string, Blobs>())
  const [pair, setPair] = useState<Pair>()
  // the pair on show belongs to the choices it was made from: until the new one is ready, the page says it is being cut
  const wanted = `${from}>${to}:${count}:${pairing}`
  const building = pair?.key !== wanted
  useEffect(() => {
    let gone = false
    const make = (id: string) => {
      const key = `${id}:${count}`
      if (!cut.current.has(key)) { const s = named(id); cut.current.set(key, sized(s.make(count, s.looks[0].id).blobs, SIZE)) }
      return cut.current.get(key)!
    }
    const later = (f: () => void) => setTimeout(() => { if (!gone) f() }, 40)
    later(() => {
      const a = make(from)
      later(() => {
        const b = make(to)
        later(() => {
          const shift = pairUp(a, b, pairing)
          const other = pairUp(a, b, pairing === 'place' ? 'random' : 'place').trip
          setPair({ shift, other, out: new Blobs(shift.count), key: `${from}>${to}:${count}:${pairing}` })
        })
      })
    })
    return () => { gone = true }
  }, [from, to, count, pairing])

  // what the poser reads each frame, so changing an option never restarts the stage
  const now = useRef({ amount, path, order, seconds, playing })
  now.current = { amount, path, order, seconds, playing }
  /** Which way the loop was going when it was last stopped, so Play carries on the same way. */
  const back = useRef(false)

  const poser = useMemo(() => {
    if (!stage || !pair) return undefined
    let shown = ''
    return (sk: Skeleton, t: number) => {
      const n = now.current, w = n.playing ? amountAt(t, n.seconds) : n.amount
      sk.reset()
      sk.update()
      // while it holds on either creature nothing changes, so nothing is blended or sent again
      const key = `${w}/${n.path}/${n.order}`
      if (key === shown) return
      shown = key
      shiftBlobs(pair.shift, w, pair.out, n.path, n.order)
      stage.refresh()
    }
  }, [stage, pair])

  // a new pair: one still bone holds every blob, and the view steps back to fit both creatures
  const framed = useRef('')
  useEffect(() => {
    if (!stage || !pair || !poser) return
    const skeleton = new Skeleton([{ name: 'all', parent: -1, head: [0, 0, 0] }])
    const skin = emptySkin(pair.shift.count)
    for (let i = 0; i < pair.shift.count; i++) skin.weights[i * 4] = 1
    shiftBlobs(pair.shift, now.current.amount, pair.out, now.current.path, now.current.order)
    stage.setActor({ blobs: pair.out, skin, skeleton })
    stage.setPoser(poser, timeAt(now.current.amount, now.current.seconds, back.current))
    const key = `${from}>${to}`
    if (framed.current !== key) { framed.current = key; home.current = fit(pair.shift); setOrbit(home.current); stage.orbit = home.current }
    // from and to only name the pair: the pair itself is the trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, pair, poser])

  useEffect(() => {
    if (!stage || !poser) return
    stage.playing = playing
    // Play carries on from the amount on show; a stopped view shows the slider's amount
    stage.setPoser(poser, playing ? timeAt(now.current.amount, seconds, back.current) : stage.time)
  }, [stage, poser, playing, seconds])
  useEffect(() => { if (stage && poser && !playing) stage.setPoser(poser, stage.time) }, [stage, poser, playing, amount, path, order])
  // while it plays, the slider follows a few times a second (it is text and a thumb, not the picture)
  useEffect(() => {
    if (!stage || !playing) return
    let last = now.current.amount
    const id = setInterval(() => {
      const w = amountAt(stage.time, now.current.seconds)
      if (w !== last) back.current = w < last
      last = w
      setAmount(w)
    }, 100)
    return () => clearInterval(id)
  }, [stage, playing])
  useEffect(() => { if (stage) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit])

  // For verify: the stage, without clicking
  useEffect(() => {
    if (!stage || !pair) return
    window.__shift = { stage, blobs: () => stage.blobCount, trip: () => pair.shift.trip, amount: () => (now.current.playing ? amountAt(stage.time, now.current.seconds) : now.current.amount) }
    return () => { delete window.__shift }
  }, [stage, pair])

  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  useWheelZoom(canvas, setOrbit)

  const a = named(from), b = named(to)
  const pick = (which: 'from' | 'to', id: string) => {
    // picking the creature on the other side swaps the two
    if (which === 'from') { if (id === to) setTo(from); setFrom(id) } else { if (id === from) setFrom(to); setTo(id) }
  }
  const slide = (v: number) => { setPlaying(false); back.current = v < amount; setAmount(v) }
  const waiting = !failed && (!drawn || building)
  const state = amount <= 0.01 ? `a ${a.name}` : amount >= 0.99 ? `a ${b.name}` : `${pct(amount)} of the way from a ${a.name} to a ${b.name}`
  const backend = stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'
  const LINK = 'underline decoration-rule underline-offset-2 hover:text-accent'

  return (
    <div className="pb-4">
      <Crumbs here="Shape Shifter" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Shape Shifter</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          Two creatures built with nothing in common, and one slider between them. Every blob of the first finds a partner in the
          second and travels to it, changing its size, facing and color on the way. Pick the pair, the path and the order.
        </p>
      </header>
      <Workbench
        viewLabel="The creatures"
        view={<>
          <canvas
            ref={canvas}
            role="application"
            aria-roledescription="3D view"
            aria-label={`Blobs that are ${state}${playing ? ', shifting there and back' : ''}. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.`}
            tabIndex={0}
            data-testid="shift-view"
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
          {waiting && <LoadingMark testid="shift-loading" />}
          <p role="status" className="sr-only">{waiting ? (stage ? `Cutting the ${a.name} and the ${b.name}, and pairing their blobs…` : 'Starting the splat engine…') : ''}</p>
          {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(home.current)} />
          <p aria-hidden className="pointer-events-none absolute right-14 bottom-2 left-3 text-right text-xs text-ink-faint">{coarse ? 'drag to orbit · pinch to zoom' : 'drag to orbit · scroll to zoom'}</p>
        </>}
        status={<>
          <span>{pair && !building
            ? <><span className="tabular-nums text-ink" data-testid="shift-blobs">{pair.shift.count.toLocaleString()}</span> blobs, each paired with one of the {b.name}'s.</>
            : `Cutting the ${a.name} and the ${b.name}…`}</span>
          {pair && !building && <span data-testid="shift-trip">
            The average blob travels <span className="tabular-nums text-ink">{pair.shift.trip.toFixed(2)}</span> units; paired {pairing === 'place' ? 'at random' : 'by place'} it would be{' '}
            <span className="tabular-nums text-ink">{pair.other.toFixed(2)}</span>.
          </span>}
        </>}
        tabsLabel="Options"
        tabs={[
          {
            id: 'shift', label: 'Shift', content: (
              <div className={TAB_SECTIONS}>
                <div className="grid gap-3">
                  <Slider label="Shift" value={amount} min={0} max={1} step={0.01} onChange={slide} format={(v) => (v <= 0.005 ? cap(a.name) : v >= 0.995 ? cap(b.name) : pct(v))} />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button small primary onClick={() => setPlaying((p) => !p)}>{playing ? 'Stop' : 'Play'}</Button>
                    <span role="group" aria-label="Speed" className="flex flex-wrap gap-1.5">
                      {SPEEDS.map((s) => <Chip small key={s.id} active={seconds === s.id} onClick={() => setSeconds(s.id)}>{s.label}</Chip>)}
                    </span>
                  </div>
                </div>
                <Field label="Path">
                  <div className="flex flex-wrap gap-1.5">
                    {PATHS.map((p) => <Chip key={p.id} active={path === p.id} onClick={() => setPath(p.id)}>{p.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">{PATHS.find((p) => p.id === path)!.note}</p>
                </Field>
                <Field label="Order">
                  <div className="flex flex-wrap gap-1.5">
                    {ORDERS.map((o) => <Chip key={o.id} active={order === o.id} onClick={() => setOrder(o.id)}>{o.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">{ORDERS.find((o) => o.id === order)!.note}</p>
                </Field>
                <Field label="Partners">
                  <div className="flex flex-wrap gap-1.5">
                    {PAIRINGS.map((p) => <Chip key={p.id} active={pairing === p.id} onClick={() => setPairing(p.id)}>{p.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">{pairing === 'place' ? 'A blob goes to a partner near where it already is.' : 'A blob goes to any blob at all. Stop it halfway to see why that matters.'}</p>
                </Field>
              </div>
            ),
          },
          {
            id: 'creatures', label: 'Creatures', content: (
              <div className={TAB_SECTIONS}>
                <Field label="From">
                  <div className="flex flex-wrap gap-1.5">
                    {CREATURES.map((c) => <Chip key={c.id} active={from === c.id} onClick={() => pick('from', c.id)}>{cap(c.name)}</Chip>)}
                  </div>
                </Field>
                <Field label="To">
                  <div className="flex flex-wrap gap-1.5">
                    {CREATURES.map((c) => <Chip key={c.id} active={to === c.id} onClick={() => pick('to', c.id)}>{cap(c.name)}</Chip>)}
                  </div>
                </Field>
                <Field label="Blobs">
                  <div className="flex flex-wrap gap-1.5">
                    {DETAIL.map((n) => <Chip key={n} active={count === n} onClick={() => setCount(n)}>{kilo(n)}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">For each creature. The one that comes out with fewer lends some of its blobs twice.</p>
                </Field>
              </div>
            ),
          },
        ]}
      />

      <section aria-labelledby="how-title" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-sm text-ink-faint">How it works</p>
          <h2 id="how-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">Every blob needs a partner</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            A <a href={href({ page: 'lesson', id: 'morphs' })} className={LINK}>morph</a> reshapes one creature, and its blobs stay the
            same blobs throughout. Two creatures share nothing: each was cut on its own, with its own number of blobs in its own
            order. Here they are also brought to one size, so a frog and a dragon meet as equals. Then the first job is to pair them up. Both creatures are cut in half across their longest way, half matched with
            half, and each half is cut again until one blob is left on each side. That keeps tops with tops and fronts with
            fronts, even when one creature is tall and the other long.
          </p>
          <p>
            Then each blob blends the five kinds of number it is made of. Its center follows the path you picked, its sizes change
            by ratio, its facing turns the short way round, and its color and opacity go straight across. Set the partners to
            random and the same blend still arrives, but every blob crosses the whole creature to get there, and halfway is a cloud.
          </p>
          <p>
            No bone moves here. The blobs are blended in plain JavaScript and handed to Blobscape's own splat engine again every
            frame, which sorts and draws them on {backend}. The creatures are the ones
            in <a href={href({ page: 'creature' })} className={LINK}>Splat Creatures</a>, standing still.
          </p>
        </div>
      </section>
    </div>
  )
}
