import { startFailure } from '../shared/stale.tsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import type { MarkLook } from '../splat-core/marks.ts'
import { recordClip } from '../splat-engine/glb.ts'
import type { PointLight } from '../splat-engine/engine.ts'
import type { Skeleton } from '../splat-engine/rig.ts'
import { ZOO } from '../splat-engine/zoo/index.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field, Slider, Toggle } from '../shared/ui.tsx'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import type { Actor, CreatureStage } from './creature/stage.ts'
import { DETAIL } from './diorama/scene.ts'
import { DIORAMAS } from './diorama/scenes.ts'
import { GROUND, LOOKS, PAPERS, css, type LookId } from './brushLooks.ts'
import { href } from './routes.ts'
import { sampleScan } from './scan/sample.ts'
import { DEFAULT_CLEAN, UNTURNED, autoOrient, cleanMasks, finish, stillActor, working } from './scan/studio.ts'

declare global {
  interface Window { __brush?: { stage: CreatureStage; blobs: () => number; subject: string; look: string } }
}

/** What is on show: how to build it, and how it moves. */
interface Subject {
  id: string
  label: string
  about: string
  /** What its blobs came from, for the line under the view. */
  from: string
  orbit: Orbit
  /** A scan: its marks are laid softly, one over another (`MarkLook.soft`). */
  soft?: boolean
  make(coarse: boolean): { actor: Actor; pose?: (sk: Skeleton, t: number) => void; lights?: (t: number) => PointLight[]; clip?: ReturnType<typeof recordClip> }
}

function scene(id: string, label: string): Subject {
  const d = DIORAMAS.find((x) => x.id === id) ?? DIORAMAS[0]
  return {
    id, label, about: d.about, from: 'a scene written as data', orbit: d.views[0].orbit,
    make: (coarse) => ({ actor: d.make(DETAIL[coarse ? 0 : 1].spacing), pose: d.pose, lights: d.lights }),
  }
}

const FOX = ZOO.find((s) => s.id === 'fox') ?? ZOO[0]

const SUBJECTS: Subject[] = [
  scene('windmill', 'Windmill'),
  scene('croc', 'Garden crocodile'),
  {
    id: 'fox', label: 'Fox', about: 'A fox with a coat of fur, trotting on the spot', from: 'a creature on bones', orbit: FOX.view,
    make: (coarse) => {
      const actor = FOX.make(coarse ? FOX.detail[0] : FOX.start, FOX.looks[0].id)
      const m = FOX.moves[0]
      return { actor, clip: recordClip(m.name, actor.skeleton, m.pose, m.seconds, m.fps ?? 24) }
    },
  },
  {
    id: 'mug', soft: true, label: 'Scanned mug', about: 'A mug, as a phone scan of one would be, with its table cut away', from: 'a made-up phone scan',
    orbit: { target: [0, 0.75, 0], distance: 4.6, azimuth: 35, elevation: 18 },
    make: (coarse) => {
      const raw = sampleScan(7, coarse ? 0.6 : 1, 0.12).blobs
      const work = working(raw, autoOrient(raw) ?? UNTURNED).blobs
      return { actor: stillActor(finish(work, cleanMasks(work, DEFAULT_CLEAN).all)) }
    },
  },
]

const params = () => new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
const media = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches

/**
 * Brush and Ink: the same blobs as every other page, each drawn as a brush mark or a pen stroke in place of a soft
 * dot. The marks are turned and stretched by their blobs, so the painting holds still as the view turns.
 */
export function BrushInk() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<CreatureStage>()
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState<string>()
  const offscreen = useMemo(() => params().get('offscreen') === '1', [])
  const coarse = useMemo(() => media('(pointer: coarse)'), [])
  const calm = useMemo(() => media('(prefers-reduced-motion: reduce)'), [])
  const [playing, setPlaying] = useState(!calm)
  const [subject, setSubject] = useState(() => SUBJECTS.find((s) => s.id === params().get('subject'))?.id ?? SUBJECTS[0].id)
  const [look, setLook] = useState<LookId>(() => LOOKS.find((l) => l.id === params().get('look'))?.id ?? 'gouache')
  const [size, setSize] = useState(1)
  // outlines: on for the two pen looks unless the visitor says otherwise
  const [outlined, setOutlined] = useState<boolean | null>(() => (params().get('outline') === '1' ? true : params().get('outline') === '0' ? false : null))
  const [pen, setPen] = useState(1.5)
  const [paper, setPaper] = useState(PAPERS[0].id)
  const sub = SUBJECTS.find((s) => s.id === subject)!
  const [orbit, setOrbit] = useState<Orbit>(sub.orbit)
  const [built, setBuilt] = useState<{ id: string; count: number }>()

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
      }, (e: unknown) => { console.warn(e); setFailed(startFailure('the engine needs')) })
    return () => { gone = true; live?.dispose() }
  }, [offscreen])

  // built after a paint, so the waiting mark goes up first: cutting a scene holds the main thread
  useEffect(() => {
    if (!stage) return
    setBuilt(undefined)
    const s = SUBJECTS.find((x) => x.id === subject)!
    const t = setTimeout(() => {
      const made = s.make(coarse)
      stage.setActor(made.actor, made.clip)
      if (made.pose) stage.setPoser((sk, time) => { made.pose!(sk, time); stage.setLights(made.lights?.(time) ?? [], 1) })
      else stage.setLights([], 1)
      setOrbit(s.orbit)
      setBuilt({ id: s.id, count: made.actor.blobs.count })
    }, 30)
    return () => clearTimeout(t)
  }, [stage, subject, coarse])

  const sheet = PAPERS.find((p) => p.id === paper)!
  const marks = useMemo<MarkLook | undefined>(() => (look === 'blobs' ? undefined : { kind: look, size, ink: sheet.ink, paper: sheet.paper, soft: sub.soft }), [look, size, sheet, sub.soft])
  useEffect(() => { stage?.setMarks(marks) }, [stage, marks, built])
  const outline = outlined ?? (look === 'ink' || look === 'hatch')
  useEffect(() => { stage?.setOutline(outline ? { width: pen, ink: look === 'ink' || look === 'hatch' ? sheet.ink : undefined } : undefined) }, [stage, outline, pen, look, sheet])
  useEffect(() => { if (stage) stage.playing = playing }, [stage, playing])
  useEffect(() => { if (stage) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit])

  // the address keeps what is on show, so a link opens the same picture
  useEffect(() => {
    const q = params()
    q.set('subject', subject)
    q.set('look', look)
    history.replaceState(history.state, '', `${location.pathname}?${q}`)
  }, [subject, look])

  // For verify: the stage, without clicking
  useEffect(() => {
    if (!stage || !built) return
    window.__brush = { stage, blobs: () => stage.blobCount, subject: built.id, look }
    return () => { delete window.__brush }
  }, [stage, built, look])

  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  useWheelZoom(canvas, setOrbit)
  const waiting = !failed && (!drawn || built?.id !== subject)
  const drawnOn = look === 'ink' || look === 'hatch'
  const lookNow = LOOKS.find((l) => l.id === look)!
  const backend = stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'

  return (
    <div className="pb-4">
      <Crumbs here="Brush and Ink" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Brush and Ink</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          The same blobs, drawn as brush marks or pen strokes in place of soft dots. Every mark belongs to one blob and takes its
          shape and direction from it, so the painting holds still as you turn it. Drag the view and watch the strokes stay put.
        </p>
      </header>
      <Workbench
        viewLabel="The picture"
        view={<>
          <div aria-hidden className="absolute inset-0" style={{ background: look === 'blobs' ? undefined : drawnOn ? css(sheet.paper) : GROUND }} data-testid="brush-ground" />
          <canvas
            ref={canvas}
            role="application"
            aria-roledescription="3D view"
            aria-label={`${sub.about}, drawn ${look === 'blobs' ? 'as soft blobs' : `in ${lookNow.label.toLowerCase()}`}. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.`}
            tabIndex={0}
            data-testid="brush-view"
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
          {waiting && <LoadingMark testid="brush-loading" />}
          <p role="status" className="sr-only">{waiting ? (stage ? `Making the ${sub.label.toLowerCase()}…` : 'Starting the splat engine…') : `${sub.label}, ${lookNow.label.toLowerCase()}.`}</p>
          {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(sub.orbit)} />
        </>}
        status={<>
          <span>{built?.id === subject ? <><span className="tabular-nums text-ink" data-testid="brush-blobs">{built.count.toLocaleString()}</span> blobs from {sub.from}{look === 'blobs' ? '.' : ', one mark each.'}</> : 'Making it…'}</span>
          <span>{lookNow.label} on {backend}</span>
        </>}
        tabsLabel="Options"
        tabs={[
          {
            id: 'look', label: 'Look', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Drawn as">
                  <div className="flex flex-wrap gap-1.5" data-testid="brush-looks">
                    {LOOKS.map((l) => <Chip key={l.id} active={look === l.id} onClick={() => setLook(l.id)}>{l.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">{lookNow.note}</p>
                </Field>
                {look !== 'blobs' && (
                  <Slider label="Mark size" value={size} min={0.5} max={1.3} step={0.05} onChange={setSize} format={(v) => `${Math.round(v * 100)}%`} hint="Smaller marks leave gaps between them; bigger ones overlap more." />
                )}
                <div data-testid="brush-outline">
                  <Toggle label="Outlines" checked={outline} onChange={setOutlined} />
                  <p className="mt-1.5 text-xs text-ink-faint">A pen line round the subject, where one thing stands in front of another, and between its parts. Heavier against dark things, and it lifts off here and there against light ones.</p>
                </div>
                {outline && (
                  <Slider label="Pen width" value={pen} min={0.75} max={3} step={0.25} onChange={setPen} format={(v) => `${v} px`} />
                )}
                {drawnOn && (
                  <Field label="Paper">
                    <div className="flex flex-wrap gap-1.5">
                      {PAPERS.map((p) => <Chip key={p.id} active={paper === p.id} onClick={() => setPaper(p.id)}>{p.label}</Chip>)}
                    </div>
                  </Field>
                )}
              </div>
            ),
          },
          {
            id: 'subject', label: 'Subject', content: (
              <div className={TAB_SECTIONS}>
                <Field label="What to draw">
                  <div className="flex flex-wrap gap-1.5" data-testid="brush-subjects">
                    {SUBJECTS.map((s) => <Chip key={s.id} active={subject === s.id} onClick={() => setSubject(s.id)}>{s.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">Two scenes from Pixel Diorama, a creature on bones and a scan: the marks need nothing but the blobs.</p>
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
          <p className="text-sm text-ink-faint">Why it holds still</p>
          <h2 id="how-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">A mark for every blob</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            A paint filter laid over a finished picture works on the screen: its brush strokes sit where the pixels are, so when the
            view moves, the strokes slide across the things they are meant to be painted on, and flicker.
          </p>
          <p>
            Here nothing is laid over the picture. Each blob is already an ellipse on the screen, with a long way and a short way, and
            it is drawn as one mark fitted to that ellipse: a dab with bristle streaks along its length, or a pen stroke down its
            middle. The streaks come from the blob's own number, so every mark is a little different and none of them changes from one
            frame to the next. Turn the view and each mark turns with its blob.
          </p>
          <p>
            It is the same idea as the steady pixels in <a href={href({ page: 'diorama' })} className="underline decoration-rule underline-offset-2 hover:text-accent">Pixel Diorama</a>, for
            a different look, and it needs nothing but blobs, so it works on a scan as well as on a made scene. Marks are opaque, like
            paint, and drawn from the back to the front, so near things cover far ones. Hatching gets denser as a blob gets darker,
            which is how a pen makes a tone.
          </p>
        </div>
      </section>
    </div>
  )
}
