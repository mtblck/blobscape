import { useMemo, useRef, useState } from 'react'
import type { Orbit, SplatView } from '../../splat-core/view.ts'
import { Chip, Slider, Toggle } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS, href } from '../routes.ts'
import { Viewport, ZoomBar } from '../Viewport.tsx'
import { useGoals } from '../progress.ts'
import { BUDGET, DEFAULTS, groundShowing, growCoat, lightThrough, strandsFor, type CoatOptions, type Thing } from '../fur/coat.ts'

const START: Record<Thing, Orbit> = {
  critter: { target: [0, 0.4, 0], distance: 2.1, azimuth: 25, elevation: 12 },
  lawn: { target: [0, 0.1, 0], distance: 2.8, azimuth: 25, elevation: 28 },
}
/** A phone's case is short, so stand back from the critter (the lawn is wide and already fits). */
const start = (thing: Thing): Orbit => (typeof window !== 'undefined' && thing === 'critter' && window.matchMedia('(max-width: 639px)').matches ? { ...START.critter, distance: START.critter.distance * 1.25 } : START[thing])

const THINGS: { id: Thing; name: string }[] = [
  { id: 'critter', name: 'Critter' },
  { id: 'lawn', name: 'Lawn' },
]

const deg = (r: number) => Math.round((r * 180) / Math.PI)
const rad = (d: number) => (d * Math.PI) / 180

export function Fur() {
  const [thing, setThing] = useState<Thing>('critter')
  const [orbit, setOrbit] = useState<Orbit>(() => start('critter'))
  const [all, setAll] = useState<Record<Thing, CoatOptions>>(DEFAULTS)
  const o = all[thing]
  const set = (patch: Partial<CoatOptions>) => setAll((a) => ({ ...a, [thing]: { ...a[thing], ...patch } }))

  const { coat, version } = useMemo(() => ({ coat: growCoat(thing, o), version: Math.random() }), [thing, o])
  const light = useMemo(() => (thing === 'critter' ? lightThrough(coat.blobs) : 0), [thing, coat])
  const ground = useMemo(() => (thing === 'lawn' ? groundShowing(coat.blobs) : 0), [thing, coat])

  const view = useRef<SplatView | null>(null)
  const pick = (t: Thing) => {
    setThing(t)
    setOrbit(start(t))
    view.current?.setFloor(t === 'critter', '#8a8a8a')
  }

  const done = useGoals('fur', {
    felt: thing === 'critter' && o.thick >= 0.35,
    skin: thing === 'critter' && !o.undercoat && light < 0.015 && o.thick <= 0.08,
    bend: thing === 'lawn' && o.segments >= 2 && coat.curl >= 30,
    budget: thing === 'lawn' && o.breeze >= 0.9 && coat.curl >= 30 && coat.strands >= 2000,
  })

  const pct = (v: number) => `${Math.round(v * 100)}%`
  const blades = thing === 'lawn' ? 'blades' : 'strands'
  const what = thing === 'critter' ? 'a round furry critter' : 'a patch of lawn'
  const label = `${what}: ${coat.strands.toLocaleString()} ${blades} of ${o.segments} ${o.segments === 1 ? 'blob' : 'blobs'} each${o.breeze > 0 ? ', bent by a breeze from the left' : ''}${o.undercoat ? '' : ', with no skin under them'}. Drag or use the arrow keys to orbit.`

  return (
    <LessonShell
      id="fur"
      intro={<p>A fox’s coat has millions of hairs and a lawn millions of blades. A splat can’t afford a blob for every one. How few blobs make fur, and what does a strand need to bend?</p>}
      view={
        <div className="relative h-full">
          <Viewport bare noZoom blobs={coat.blobs} version={version} orbit={orbit} setOrbit={setOrbit} label={label}
            onView={(v) => { view.current = v; v.setFloor(true, '#8a8a8a') }} />
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(start(thing))} />
        </div>
      }
      caption={
        <p data-testid="fur-readout" className="tabular-nums">
          <b className="text-ink">{coat.strands.toLocaleString()} {blades}</b> of {o.segments} {o.segments === 1 ? 'blob' : 'blobs'} each, from a budget of {BUDGET[thing].toLocaleString()} blobs.{' '}
          {thing === 'critter'
            ? <>Light straight through its body: <b className="text-ink">{pct(light)}</b>.</>
            : <>Tips lean <b className="text-ink">{Math.round(coat.curl)}°</b> further than bases; earth showing: <b className="text-ink">{pct(ground)}</b>.</>}
        </p>
      }
      groups={[
        {
          id: 'thing',
          title: 'Thing',
          note: 'what grows the strands',
          content: (
            <div className="flex flex-wrap gap-1.5">
              {THINGS.map((t) => <Chip key={t.id} active={thing === t.id} onClick={() => pick(t.id)}>{t.name}</Chip>)}
            </div>
          ),
        },
        {
          id: 'strand',
          title: 'Each strand',
          note: 'one long thin blob',
          content: (
            <div className="flex flex-col gap-3">
              <Slider label="Length" value={o.length} min={0.04} max={0.4} step={0.01} onChange={(v) => set({ length: v })} format={(v) => `${Math.round(v * 100)} cm`} />
              <Slider label="Lift" value={deg(o.lift)} min={0} max={90} step={5} onChange={(v) => set({ lift: rad(v) })} format={(v) => (v === 0 ? 'flat' : v === 90 ? 'straight up' : `${v}°`)} />
              <Slider label="Width" value={o.thick} min={0.02} max={0.6} step={0.01} onChange={(v) => set({ thick: v })} format={(v) => `${Math.round(v * 100)}% of its length`} />
              <Slider label="Stray" value={deg(o.wild)} min={0} max={60} step={5} onChange={(v) => set({ wild: rad(v) })} format={(v) => (v === 0 ? 'none' : `±${v}°`)} />
            </div>
          ),
        },
        {
          id: 'skin',
          title: 'Skin',
          note: 'where strands grow from',
          content: (
            <div className="flex flex-col gap-3">
              <Toggle label="Skin under the strands" checked={o.undercoat} onChange={(v) => set({ undercoat: v })} />
            </div>
          ),
        },
        {
          id: 'bend',
          title: 'Bend',
          note: 'blobs per strand, and wind',
          content: (
            <div className="flex flex-col gap-3">
              <Slider label="Blobs per strand" value={o.segments} min={1} max={6} step={1} onChange={(v) => set({ segments: v })} format={(v) => `${v} · ${strandsFor(thing, v, o.undercoat).toLocaleString()} ${blades}`} />
              <Slider label="Breeze" value={o.breeze} min={0} max={1} step={0.05} onChange={(v) => set({ breeze: v })} format={(v) => (v ? pct(v) : 'still')} />
            </div>
          ),
        },
      ]}
      goals={LESSON_GOALS['fur']}
      done={done}
      scene={() => coat.blobs}
      explainTitle="A strand is one stretched blob"
      explain={
        <>
          <p>
            A blob stretched long and thin, standing off the skin at a slant, already reads as a hair. So fur is a skin of ordinary
            blobs with strands grown out of it: one blob per strand, lying the way the coat runs, each a little longer or shorter,
            lighter or darker and straying a little from its neighbors. The critter here wears about five thousand, the same way the
            fox on <a href={href({ page: 'creature' })} className="text-accent underline underline-offset-2">Splat Creatures</a> wears its coat.
          </p>
          <p>
            A strand only reads as a hair while it stays thin: widen it and the coat blurs into felt. The skin under the strands is
            cut on a grid, one blob per cell, and strands start anywhere in their cell so the grid never shows. The skin costs blobs a
            coat could spend on strands, but it is the cheap way to fill the gaps: without it, strands have to hide the body on their
            own, laid flat and long and overlapping like shingles. Short, fluffy fur needs a skin under it, a shade darker.
          </p>
          <p>
            One blob is an ellipsoid, and an ellipsoid is always straight. In a breeze a one-blob blade can only tip over from its
            root like a stick; to curve, a blade needs two or more blobs end to end, each a straight piece of the curve. Every extra
            piece is a blade you can’t grow, so short fur stays one blob a strand and long grass gets just enough pieces to bend. A
            scanned tuft is a different question, splats against a mesh, which <a href={href({ page: 'lesson', id: 'fuzzy' })} className="text-accent underline underline-offset-2">Fuzzy things</a> takes on.
          </p>
        </>
      }
    />
  )
}
