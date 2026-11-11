import { useEffect, useMemo, useRef, useState } from 'react'
import { Blobs, rgbToHex } from '../../splat-core/blobs.ts'
import { orbitLens, type Orbit } from '../../splat-core/view.ts'
import { Chip, Slider } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS } from '../routes.ts'
import { DRAG, clampOrbit, orbitKey } from '../Viewport.tsx'
import { drawOrder, rasterise, toImageData, type Order as DrawMode } from '../cpuSplat.ts'
import { useGoals } from '../progress.ts'

const NAMES = ['red', 'green', 'blue']

/** Three overlapping blobs in a row front to back (from the starting view): red nearest, blue furthest. */
function scene(opacity: number) {
  const b = new Blobs(3)
  b.push({ centre: [-0.4, 0.1, 0.9], scale: [0.32, 0.32, 0.32], quat: [0, 0, 0, 1], colour: [0.9, 0.22, 0.25], opacity })
  b.push({ centre: [0.05, -0.05, 0], scale: [0.38, 0.38, 0.38], quat: [0, 0, 0, 1], colour: [0.2, 0.7, 0.35], opacity })
  b.push({ centre: [0.5, 0.1, -0.9], scale: [0.45, 0.45, 0.45], quat: [0, 0, 0, 1], colour: [0.25, 0.45, 0.95], opacity })
  return b
}

const MODES: { id: DrawMode; name: string; note: string }[] = [
  { id: 'list', name: 'List order', note: 'Red, green, blue, the order they happen to be stored in, whichever way you look.' },
  { id: 'reversed', name: 'Front to back', note: 'Nearest first. The opposite of what the blend needs.' },
]

export function Order() {
  const [orbit, setOrbit] = useState<Orbit>({ target: [0, 0, 0], distance: 5, azimuth: 0, elevation: 10 })
  const [opacity, setOpacity] = useState(0.8)
  const [mode, setMode] = useState<DrawMode>('list')
  // "See it get it wrong" only counts once you've looked: turned the view or picked an order
  const [touched, setTouched] = useState(false)
  const turn = (f: (o: Orbit) => Orbit) => { setTouched(true); setOrbit(f) }
  const blobs = useMemo(() => scene(opacity), [opacity])

  const lens = orbitLens(orbit, 400, 300)
  const right = drawOrder(blobs, lens, 'sorted')
  const yours = drawOrder(blobs, lens, mode)
  const same = right.every((v, i) => v === yours[i])

  const done = useGoals('order', {
    wrong: touched && mode === 'list' && !same,
    luck: mode === 'list' && same,
    reversed: mode === 'reversed',
    opaque: opacity >= 0.99 && !same,
  })

  return (
    <LessonShell
      id="order"
      intro={<p>See-through things blend correctly only when drawn from the back forward. Here the same three blobs are drawn twice: once in the right order, once in yours.</p>}
      view={
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <SoftView blobs={blobs} orbit={orbit} setOrbit={turn} order={right} title="Back to front" testId="view-sorted" />
          <SoftView blobs={blobs} orbit={orbit} setOrbit={turn} order={yours} title={MODES.find((m) => m.id === mode)!.name} testId="view-yours" warn={!same} />
        </div>
      }
      caption={
        <>
          <div className="grid grid-cols-2 gap-3">
            <OrderList order={right} blobs={blobs} label="Right order" />
            <OrderList order={yours} blobs={blobs} label={same ? 'Your order: right by luck' : 'Your order: wrong'} />
          </div>
          {/* Only the verdict is announced, and only when it flips, not every step of a turn */}
          <p aria-live="polite" className="sr-only">{same ? 'Your order is right.' : 'Your order is wrong.'}</p>
        </>
      }
      controls={
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Your drawing order">
            {MODES.map((m) => <Chip key={m.id} active={mode === m.id} onClick={() => { setTouched(true); setMode(m.id) }}>{m.name}</Chip>)}
          </div>
          <p className="text-sm text-ink-faint">{MODES.find((m) => m.id === mode)!.note}</p>
          <Slider label="Turn" value={Math.round(orbit.azimuth)} min={-180} max={180} step={1} onChange={(azimuth) => turn((o) => ({ ...o, azimuth }))} format={(v) => `${v}°`} />
          <Slider label="Opacity" value={opacity} min={0.1} max={1} step={0.01} onChange={setOpacity} format={(v) => `${Math.round(v * 100)}%`} hint="Every blob's opacity at its centre." />
        </>
      }
      goals={LESSON_GOALS['order']}
      done={done}
      scene={() => blobs}
      explain={
        <>
          <p>
            Each blob is blended onto what's already been drawn: <em>new colour = blob × α + old colour × (1 − α)</em>. That formula
            assumes the blob is in front of everything before it. Draw a far blob last and it gets painted over the near one, so things
            seem to swap places.
          </p>
          <p>
            So every frame, a splat renderer sorts all its blobs by distance from the camera, which for millions of blobs is most of the
            work. Spark, the renderer the rest of these lessons use, does it in a background worker and re-sorts whenever you move. It
            can't be told to sort wrongly, so these two views are drawn by a tiny software renderer written for this page.
          </p>
          <p>Sorting by each blob's centre is still an approximation. Where two big blobs pass through each other, no single order is right, which is one source of the popping you sometimes see when turning a splat scene.</p>
        </>
      }
    />
  )
}

function OrderList({ order, blobs, label }: { order: number[]; blobs: Blobs; label: string }) {
  return (
    <div>
      <p className="text-xs text-ink-faint">{label}</p>
      <p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-ink">
        <span className="sr-only">Drawn in this order:</span>
        {order.map((i, k) => (
          <span key={i} className="inline-flex items-center gap-1">
            {k > 0 && <span aria-hidden className="text-ink-faint">→</span>}
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: rgbToHex(blobs.colour.subarray(i * 3, i * 3 + 3)) }} />
            {NAMES[i]}
          </span>
        ))}
      </p>
    </div>
  )
}

/** A software-rendered view: small, so it redraws instantly on the CPU. Drag or arrow keys orbit. */
function SoftView({ blobs, orbit, setOrbit, order, title, testId, warn }: { blobs: Blobs; orbit: Orbit; setOrbit: (f: (o: Orbit) => Orbit) => void; order: number[]; title: string; testId: string; warn?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 320, h: 240 })
  useEffect(() => {
    const c = ref.current!
    const ro = new ResizeObserver(() => {
      // Render at CSS size (capped): the Gaussians are soft, so extra pixels add little
      const w = Math.min(480, Math.max(80, Math.round(c.clientWidth)))
      setSize({ w, h: Math.round((w * 3) / 4) })
    })
    ro.observe(c)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    const c = ref.current!
    c.width = size.w
    c.height = size.h
    const lens = orbitLens(orbit, size.w, size.h)
    const px = rasterise(blobs, lens, order, size.w, size.h)
    c.getContext('2d')!.putImageData(toImageData(px, size.w, size.h), 0, 0)
  }, [blobs, orbit, order, size])

  const drag = useRef<{ x: number; y: number; az: number; el: number } | null>(null)
  return (
    <figure className="min-w-0">
      <div className={`relative aspect-[4/3] overflow-hidden rounded-lg border bg-paper-sunk ${warn ? 'border-accent' : 'border-rule'}`}>
        <canvas
          ref={ref}
          role="application"
          aria-roledescription="3D view"
          aria-label={`${title}: the three blobs drawn ${order.map((i) => NAMES[i]).join(', then ')}. Drag or use the arrow keys to turn.`}
          tabIndex={0}
          data-testid={testId}
          className="absolute inset-0 h-full w-full cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset active:cursor-grabbing"
          onPointerDown={(ev) => { ev.currentTarget.setPointerCapture(ev.pointerId); drag.current = { x: ev.clientX, y: ev.clientY, az: orbit.azimuth, el: orbit.elevation } }}
          onPointerMove={(ev) => {
            const d = drag.current
            if (d) setOrbit((o) => clampOrbit({ ...o, azimuth: d.az - (ev.clientX - d.x) * DRAG.azimuth, elevation: d.el + (ev.clientY - d.y) * DRAG.elevation }))
          }}
          onPointerUp={() => { drag.current = null }}
          onPointerCancel={() => { drag.current = null }}
          onKeyDown={(ev) => {
            if (!orbitKey(ev, orbit)) return
            ev.preventDefault()
            setOrbit((o) => orbitKey(ev, o) ?? o)
          }}
        />
      </div>
      <figcaption className="mt-1.5 text-sm text-ink-muted">{title}</figcaption>
    </figure>
  )
}
