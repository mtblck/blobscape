import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import type { PointLight } from '../splat-engine/engine.ts'
import type { Skeleton } from '../splat-engine/rig.ts'
import type { SceneFire } from '../splat-engine/sceneFire.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field } from '../shared/ui.tsx'
import { detailAsked, labelNames, writeDetail } from '../shared/detail.ts'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import type { Actor, CreatureStage } from './creature/stage.ts'
import { DETAIL } from './diorama/scene.ts'
import { DIORAMAS } from './diorama/scenes.ts'
import { useDrawnLook } from './drawnLook.tsx'
import { KNIT_PATTERNS, KNIT_SWEATERS } from './knitLooks.ts'
import { drawnStart, type DrawnSettings } from './styles/catalog.ts'
import { unlit } from '../splat-engine/voxel.ts'
import { href } from './routes.ts'

declare global {
  interface Window { __sweater?: { stage: CreatureStage; blobs: () => number; scene: string } }
}

/** How finely a scene is cut: Diorama's first three levels. A stitch is many pixels wide, so Light is enough for most. */
const DETAILS = [{ id: 'light', label: 'Light' }, { id: 'full', label: 'Full' }, { id: 'fine', label: 'Fine' }] as const
type Detail = 0 | 1 | 2

/** How much nearer than in Diorama the view starts: a sweater's picture fills its front. */
const NEARER = 0.82

interface Subject {
  id: string
  label: string
  about: string
  orbit: Orbit
  /** Knitting lights nothing, so a scene is built with no light baked in (`unlit`). */
  make(detail: Detail): { actor: Actor; pose?: (sk: Skeleton, t: number) => void; lights?: (t: number) => PointLight[]; ambient?: Parameters<CreatureStage['setLights']>[1]; fire?: SceneFire }
}

/** Where the camera stands for an orbit, for a fire seen through its own hot gas. */
const eyeOf = (o: Orbit): [number, number, number] => { const a = (o.azimuth * Math.PI) / 180, e = (o.elevation * Math.PI) / 180; return [o.target[0] + o.distance * Math.sin(a) * Math.cos(e), o.target[1] + o.distance * Math.sin(e), o.target[2] + o.distance * Math.cos(a) * Math.cos(e)] }

function scene(id: string, label: string): Subject {
  const d = DIORAMAS.find((x) => x.id === id) ?? DIORAMAS[0]
  const o = d.views[0].orbit
  return {
    id, label, about: d.about, orbit: { ...o, distance: o.distance * NEARER },
    make: (detail) => ({ actor: unlit(() => d.make(DETAIL[detail].spacing)), pose: d.pose, lights: d.lights, ambient: d.ambient, fire: d.fire?.() }),
  }
}

/** The scenes to knit: each a Diorama scene made of props from the library. */
const SUBJECTS: Subject[] = [
  scene('presents', 'Presents under the tree'),
  scene('christmas-tree', 'Christmas tree'),
  scene('ornament', 'Ornament'),
  scene('sleigh', 'Sleigh and reindeer'),
  scene('snowflake', 'Snowflake'),
  scene('fireplace', 'Fireplace'),

]

const params = () => new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
const media = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches

/**
 * Ugly Sweater (Matt's idea, 2026-11-23): Christmas scenes knitted into a sweater. The view is a grid of stitches
 * fixed on the screen; the scene turns behind it and each stitch takes the yarn nearest what it shows.
 */
export function UglySweater() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<CreatureStage>()
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState<string>()
  const offscreen = useMemo(() => params().get('offscreen') === '1', [])
  const coarse = useMemo(() => media('(pointer: coarse)'), [])
  const calm = useMemo(() => media('(prefers-reduced-motion: reduce)'), [])
  const [playing, setPlaying] = useState(!calm)
  const [subject, setSubject] = useState(() => SUBJECTS.find((s) => s.id === params().get('scene'))?.id ?? SUBJECTS[0].id)
  const [detail, setDetail] = useState<Detail>(() => { const asked = detailAsked(DETAILS, labelNames); return asked ? (DETAILS.indexOf(asked) as Detail) : coarse ? 0 : 1 })
  const sub = SUBJECTS.find((s) => s.id === subject)!
  const [orbit, setOrbit] = useState<Orbit>(sub.orbit)
  const [built, setBuilt] = useState<{ id: string; count: number; actor: Actor }>()
  // the page holds the look's settings, so the address can keep them
  const settings = useState<DrawnSettings>(() => drawnStart(params(), { coarse }))
  const knit = settings[0].knit

  useEffect(() => {
    let live: CreatureStage | undefined, gone = false
    import('./creature/stage.ts')
      .then(({ CreatureStage }) => CreatureStage.start(canvas.current!, { offscreen, lights: true, webgl: params().get('webgl') === '1' }))
      .then((s) => {
        if (gone) { s.dispose(); return }
        live = s
        s.onFirstFrame = () => setDrawn(true)
        s.setFloor(0)
        setStage(s)
      }, (e: unknown) => { console.warn(e); setFailed('This browser could not start WebGPU or WebGL 2, which the engine needs.') })
    return () => { gone = true; live?.dispose() }
  }, [offscreen])

  const kept = useRef<string | undefined>(undefined)
  // built after a paint, so the waiting mark goes up first: cutting a scene holds the main thread
  useEffect(() => {
    if (!stage) return
    const s = SUBJECTS.find((x) => x.id === subject)!
    const t = setTimeout(() => {
      const made = s.make(detail)
      // a fire (the fireplace's) is its own soft actor beside the scene, placed each moment as it burns in still air
      const fire = made.fire
      stage.setActor(made.actor, undefined, fire ? [fire.actor] : [])
      if (made.pose) stage.setPoser((sk, time) => {
        made.pose!(sk, time)
        if (fire) { fire.show(time, eyeOf(stage.orbit)); stage.reshape(fire.actor) }
        const lit = made.lights?.(time) ?? []
        stage.setLights(fire ? fire.shine(lit, time) : lit, made.ambient ?? 1)
      })
      else stage.setLights([], 1)
      // the view stays where it is when only the detail changed
      setOrbit((o) => (kept.current === s.id ? o : s.orbit))
      kept.current = s.id
      setBuilt({ id: s.id, count: made.actor.blobs.count, actor: made.actor })
    }, 30)
    return () => clearTimeout(t)
  }, [stage, subject, detail])

  const ready = built?.id === subject
  const drawing = useDrawnLook(stage, 'knit', { actor: built?.actor, plain: true, azimuth: sub.orbit.azimuth, offscreen, light: coarse }, settings)
  useEffect(() => { drawing.forget() }, [subject]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (stage) stage.playing = playing }, [stage, playing])
  useEffect(() => { if (stage) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit])

  // the address keeps what is on show, so a link opens the same sweater
  useEffect(() => {
    const q = params()
    q.set('scene', subject)
    q.set('sweater', knit.sweater)
    q.set('pattern', knit.pattern)
    q.set('stitch', String(knit.stitch))
    q.set('snow', knit.snow ? '1' : '0')
    history.replaceState(history.state, '', `${location.pathname}?${q}`)
  }, [subject, knit.sweater, knit.pattern, knit.stitch, knit.snow])

  // For verify: the stage, without clicking
  useEffect(() => {
    if (!stage || !built) return
    window.__sweater = { stage, blobs: () => stage.blobCount, scene: built.id }
    return () => { delete window.__sweater }
  }, [stage, built])

  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  useWheelZoom(canvas, setOrbit)
  const waiting = !failed && (!drawn || !ready)
  const sweater = KNIT_SWEATERS.find((x) => x.id === knit.sweater) ?? KNIT_SWEATERS[0]
  const pattern = KNIT_PATTERNS.find((x) => x.id === knit.pattern) ?? KNIT_PATTERNS[0]
  const backend = stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'

  return (
    <div className="pb-4">
      <Crumbs here="Ugly Sweater" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Ugly Sweater</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          A Christmas scene made of blobs, knitted into a sweater. Every stitch is a little V of yarn in one of ten colors, with
          bands of stars, zigzags and reindeer knitted in above and below. Drag the view: the scene turns and the stitches stay put.
        </p>
      </header>
      <Workbench
        viewLabel="The sweater"
        view={<>
          <div aria-hidden className="absolute inset-0" style={{ background: drawing.ground }} data-testid="sweater-ground" />
          <canvas
            ref={canvas}
            role="application"
            aria-roledescription="3D view"
            aria-label={`${sub.about}, knitted into a ${sweater.label.toLowerCase()} sweater. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.`}
            tabIndex={0}
            data-testid="sweater-view"
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
          {waiting && <LoadingMark testid="sweater-loading" />}
          <p role="status" className="sr-only">{waiting ? (stage ? `Making the ${sub.label.toLowerCase()}…` : 'Starting the splat engine…') : `${sub.label}, knitted.`}</p>
          {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(sub.orbit)} />
        </>}
        status={<>
          <span>{ready && built ? <><span className="tabular-nums text-ink" data-testid="sweater-blobs">{built.count.toLocaleString()}</span> blobs, knitted in ten yarns.</> : 'Making it…'}</span>
          <span>{sweater.label}, {pattern.label.toLowerCase()}, on {backend}</span>
        </>}
        tabsLabel="Options"
        tabs={[
          {
            id: 'sweater', label: 'Sweater', content: <div className={TAB_SECTIONS}>{drawing.controls}</div>,
          },
          {
            id: 'scene', label: 'Scene', content: (
              <div className={TAB_SECTIONS}>
                <Field label="What to knit">
                  <div className="flex flex-wrap gap-1.5" data-testid="sweater-scenes">
                    {SUBJECTS.map((s) => <Chip key={s.id} active={subject === s.id} onClick={() => setSubject(s.id)}>{s.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">{sub.about}. Each is a scene in Diorama too, made of props from Scene Creator's library.</p>
                </Field>
                <Field label="Detail">
                  <div className="flex flex-wrap gap-1.5" data-testid="sweater-detail">
                    {DETAILS.map((d, i) => <Chip key={d.id} active={detail === i} onClick={() => { setDetail(i as Detail); writeDetail(d.id) }}>{d.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">A stitch is many pixels wide, so more blobs change little here and take longer to cut.</p>
                </Field>
                <div className="flex flex-wrap gap-1.5">
                  <Button small onClick={() => setPlaying((p) => !p)}>{playing ? 'Stop' : 'Play'}</Button>
                  <Button small onClick={() => setOrbit(sub.orbit)}>Reset the view</Button>
                </div>
              </div>
            ),
          },
        ]}
      />

      <section aria-labelledby="how-title" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-sm text-ink-faint">How it's knitted</p>
          <h2 id="how-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">One yarn a stitch</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            Knitting is a grid. Every stitch is a V of yarn sitting in its own square, a little wider than it is tall, with the
            point of the stitch above tucked over it. A picture in knitting is a chart: one color for each square.
          </p>
          <p>
            So the view is cut into stitches that stay where they are on the screen. The scene is drawn behind them, flat and
            unlit, and each stitch that the scene covers takes the yarn closest to what it shows. A sweater has only a few yarns,
            ten here, so a tree comes out in two greens and a present in one red. A stitch keeps its yarn until another is
            clearly a better match, which stops the edges of things flickering as the view turns.
          </p>
          <p>
            Everywhere else the sweater knits its own pattern. The bands are small charts repeated across the row, laid from
            the top and bottom edges inward and centered so both sides match, and the field between gets snow dots. The
            stitches right beside the picture are left plain, so the pattern never runs into it.
          </p>
          <p>
            The same look is a style in <a href={href({ page: 'diorama' })} className="underline decoration-rule underline-offset-2 hover:text-accent">Diorama</a> and
            Scene Creator, so any scene can be knitted.
          </p>
        </div>
      </section>
    </div>
  )
}
