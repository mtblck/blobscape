import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import { recordClip } from '../splat-engine/glb.ts'
import type { PointLight } from '../splat-engine/engine.ts'
import type { Skeleton } from '../splat-engine/rig.ts'
import { ZOO } from '../splat-engine/zoo/index.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field } from '../shared/ui.tsx'
import { detailAsked, labelNames, writeDetail } from '../shared/detail.ts'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import type { Actor, CreatureStage } from './creature/stage.ts'
import { DETAIL } from './diorama/scene.ts'
import { DIORAMAS } from './diorama/scenes.ts'
import { ALL_LOOKS, useDrawnLook, useHeld, wantsPlain, type Look } from './drawnLook.tsx'
import { TIMES, timeAsked, timeOf, type TimeId } from './timeOfDay.ts'
import { unlit } from '../splat-engine/voxel.ts'
import { href } from './routes.ts'
import { sampleScan } from './scan/sample.ts'
import { DEFAULT_CLEAN, UNTURNED, autoOrient, cleanMasks, finish, stillActor, working } from './scan/studio.ts'

declare global {
  interface Window { __brush?: { stage: CreatureStage; blobs: () => number; subject: string; look: string; plain: boolean; text: () => Promise<string | undefined> } }
}

/** What is on show: how to build it, and how it moves. */
/**
 * How finely a subject is cut (Matt asked for the choice, 2026-11-19): a scene's first three levels of Pixel
 * Diorama's, the fox's lightest, starting and finest counts, the scan's share of its blobs. A touchscreen starts on
 * Light and anything else on Full, as before there was a choice.
 */
const DETAILS = [{ id: 'light', label: 'Light' }, { id: 'full', label: 'Full' }, { id: 'fine', label: 'Fine' }] as const
type Detail = 0 | 1 | 2

interface Subject {
  id: string
  label: string
  about: string
  /** What its blobs came from, for the line under the view. */
  from: string
  orbit: Orbit
  /** A scan: its marks are laid softly, one over another (`MarkLook.soft`). */
  soft?: boolean
  /** A scene, which can be set in a time of day. */
  timed?: boolean
  /** `plain` leaves the baked light out of what is built (`unlit`), for a look that lights it live. */
  /** `time` is the time of day the subject is set in, where it is: a scene's sky, light and lamps go by it. */
  make(detail: Detail, plain: boolean, time?: TimeId): { sky?: readonly [readonly number[], readonly number[]]; actor: Actor; pose?: (sk: Skeleton, t: number) => void; lights?: (t: number) => PointLight[]; ambient?: Parameters<CreatureStage['setLights']>[1]; clip?: ReturnType<typeof recordClip> }
}

function scene(id: string, label: string): Subject {
  const d = DIORAMAS.find((x) => x.id === id) ?? DIORAMAS[0]
  return {
    id, label, about: d.about, from: 'a scene written as data', orbit: d.views[0].orbit, timed: !!d.timed,
    make: (detail, plain, time) => {
      const at = time ? d.timed?.(time) ?? d : d
      // set in a time of day it stands under that time's sky; as written, in front of each look's own ground, as before
      return { sky: time && at.at ? [at.sky[0], at.sky[1]] : undefined, actor: plain ? unlit(() => at.make(DETAIL[detail].spacing)) : at.make(DETAIL[detail].spacing), pose: at.pose, lights: at.lights, ambient: at.ambient }
    },
  }
}

const FOX = ZOO.find((s) => s.id === 'fox') ?? ZOO[0]

const SUBJECTS: Subject[] = [
  scene('windmill', 'Windmill'),
  scene('croc', 'Garden crocodile'),
  scene('meadow', 'Fox in the grass'),
  {
    id: 'fox', label: 'Fox', about: 'A fox with a coat of fur, trotting on the spot', from: 'a creature on bones', orbit: FOX.view,
    make: (detail, plain) => {
      const cut = () => FOX.make([FOX.detail[0], FOX.start, FOX.detail[FOX.detail.length - 1]][detail], FOX.looks[0].id)
      const actor = plain ? unlit(cut) : cut()
      const m = FOX.moves[0]
      return { actor, clip: recordClip(m.name, actor.skeleton, m.pose, m.seconds, m.fps ?? 24) }
    },
  },
  {
    id: 'mug', soft: true, label: 'Scanned mug', about: 'A mug, as a phone scan of one would be, with its table cut away', from: 'a made-up phone scan',
    orbit: { target: [0, 0.75, 0], distance: 4.6, azimuth: 35, elevation: 18 },
    make: (detail) => {
      const raw = sampleScan(7, [0.6, 1, 1.5][detail], 0.12).blobs
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
  const [detail, setDetail] = useState<Detail>(() => { const asked = detailAsked(DETAILS, labelNames); return asked ? (DETAILS.indexOf(asked) as Detail) : coarse ? 0 : 1 })
  const [look, setLook] = useState<Look>(() => ALL_LOOKS.find((l) => l.id === params().get('look'))?.id ?? 'gouache')
  // cel shading lights the blobs itself, so its subjects are built with no light baked in
  const plain = wantsPlain(look)
  const sub = SUBJECTS.find((s) => s.id === subject)!
  const [orbit, setOrbit] = useState<Orbit>(sub.orbit)
  const [built, setBuilt] = useState<{ id: string; plain: boolean; time: TimeId | undefined; sky?: readonly [readonly number[], readonly number[]]; count: number; actor: Actor }>()
  /** The time of day a scene is set in (`?time=night`), or none for the scene as it is written. */
  const [time, setTime] = useState<TimeId | undefined>(() => timeAsked(params().get('time')))
  const timeFor = sub.timed ? time : undefined

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
      const made = s.make(detail, plain, timeFor)
      stage.setActor(made.actor, made.clip)
      if (made.pose) stage.setPoser((sk, time) => { made.pose!(sk, time); stage.setLights(made.lights?.(time) ?? [], made.ambient ?? 1) })
      else stage.setLights([], 1)
      // the view stays where it is when only the light in the blobs changed
      setOrbit((o) => (kept.current === s.id ? o : s.orbit))
      kept.current = s.id
      setBuilt({ id: s.id, plain, time: timeFor, sky: made.sky, count: made.actor.blobs.count, actor: made.actor })
    }, 30)
    return () => clearTimeout(t)
  }, [stage, subject, detail, plain, timeFor])

  // the picture on show keeps its look until the subject is cut again for the one picked, so the bare blobs never show between
  const ready = built?.id === subject && built.plain === plain && built.time === timeFor
  const lookNow0 = useHeld(look, !!ready)
  const drawing = useDrawnLook(stage, lookNow0, { actor: built?.actor, plain: !!built?.plain, azimuth: sub.orbit.azimuth, soft: sub.soft, offscreen, sky: built?.sky, time: built?.time ? timeOf(built.time) : undefined })
  useEffect(() => { drawing.forget() }, [subject]) // eslint-disable-line react-hooks/exhaustive-deps
  const ascii = look === 'ascii'
  useEffect(() => { if (stage) stage.playing = playing }, [stage, playing])
  useEffect(() => { if (stage) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit])

  // the address keeps what is on show, so a link opens the same picture
  useEffect(() => {
    const q = params()
    q.set('subject', subject)
    q.set('look', look)
    if (timeFor) q.set('time', timeFor)
    else q.delete('time')
    history.replaceState(history.state, '', `${location.pathname}?${q}`)
  }, [subject, look, timeFor])

  // For verify: the stage, without clicking
  useEffect(() => {
    if (!stage || !built) return
    window.__brush = { stage, blobs: () => stage.blobCount, subject: built.id, look, plain: built.plain, text: () => stage.glyphText() }
    return () => { delete window.__brush }
  }, [stage, built, look])

  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  useWheelZoom(canvas, setOrbit)
  const waiting = !failed && (!drawn || !ready)
  const lookNow = ALL_LOOKS.find((l) => l.id === look)!
  const backend = stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'

  return (
    <div className="pb-4">
      <Crumbs here="Brush and Ink" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Brush and Ink</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          The same blobs, drawn as brush marks, pen strokes, plain characters or flat cel tones in place of soft dots. Every mark belongs to one blob and takes its
          shape and direction from it, so the painting holds still as you turn it. Drag the view and watch the strokes stay put.
        </p>
      </header>
      <Workbench
        viewLabel="The picture"
        view={<>
          <div aria-hidden className="absolute inset-0" style={{ background: drawing.ground }} data-testid="brush-ground" />
          <canvas
            ref={canvas}
            role="application"
            aria-roledescription="3D view"
            aria-label={`${sub.about}, drawn ${look === 'blobs' ? 'as soft blobs' : ascii ? 'as a grid of characters' : `in ${lookNow.label.toLowerCase()}`}. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.`}
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
          <p role="status" className="sr-only">{waiting ? (stage ? `Making the ${sub.label.toLowerCase()}…` : 'Starting the splat engine…') : `${sub.label}, ${ascii ? 'as characters' : lookNow.label.toLowerCase()}.`}</p>
          {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(sub.orbit)} />
        </>}
        status={<>
          <span>{built?.id === subject && built.plain === plain ? <><span className="tabular-nums text-ink" data-testid="brush-blobs">{built.count.toLocaleString()}</span> blobs from {sub.from}{look === 'blobs' ? '.' : look === 'cel' ? ', lit as you see them.' : look === 'neon' ? ', lit by their own outlines.' : look === 'glass' ? ', cut into panes.' : look === 'watercolor' ? ', laid on paper as washes.' : ascii ? ', read off as characters.' : ', one mark each.'}</> : 'Making it…'}</span>
          <span>{lookNow.label} on {backend}</span>
        </>}
        tabsLabel="Options"
        tabs={[
          {
            id: 'look', label: 'Look', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Drawn as">
                  <div className="flex flex-wrap gap-1.5" data-testid="brush-looks">
                    {ALL_LOOKS.map((l) => <Chip key={l.id} active={look === l.id} onClick={() => setLook(l.id)}>{l.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">{lookNow.note}</p>
                </Field>
                {drawing.controls}
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
                  <p className="mt-1.5 text-xs text-ink-faint">Three scenes from Pixel Diorama, a creature on bones and a scan: the marks need nothing but the blobs.</p>
                </Field>
                <Field label="Detail">
                  <div className="flex flex-wrap gap-1.5" data-testid="brush-detail">
                    {DETAILS.map((d, i) => <Chip key={d.id} active={detail === i} onClick={() => { setDetail(i as Detail); writeDetail(d.id) }}>{d.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">More blobs make finer marks and take longer to cut.</p>
                </Field>
                {sub.timed && (
                  <Field label="Time of day">
                    <div className="flex flex-wrap gap-1.5" data-testid="brush-time">
                      <Chip active={!time} onClick={() => setTime(undefined)}>Scene's own</Chip>
                      {TIMES.map((t) => <Chip key={t.id} active={time === t.id} onClick={() => setTime(t.id)}>{t.label}</Chip>)}
                    </div>
                    <p className="mt-1.5 text-xs text-ink-faint">{time ? 'The scene under this time\'s sky and light, in every look. Its lamps and fires wait for the dark.' : 'The scene as it was written. Pick a time to set it in a morning, an afternoon or a night.'}</p>
                  </Field>
                )}
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
          <p>
            ASCII is the odd one out. Characters only read standing upright in rows, so they can't turn with the blobs: the view is
            cut into a grid of cells that stays put on the screen, and each cell gets the character whose ink matches how much there
            is to show in it. Where an edge runs through a cell (the picture ends, one thing stands in front of another, two parts
            meet) it gets a stroke along the edge, and a cell full of fur or grass gets a stroke the way the strands run. A cell keeps its character until another is clearly a better fit, so the text
            doesn't flicker as the view turns, and Copy as text gives you the picture in plain characters.
          </p>
          <p>
            Cel shading is about the light. A cel is painted in flat colors with the light cut into two or three tones, and the
            tones have clean edges. So the subject is built again with no light in its colors, each blob is drawn flat, and the
            light is worked out live: how each blob faces it, and what stands in its way, seen from where the light is. That
            light is smoothed a little over the surface it lies on and then cut, which is what gives a shadow one clean edge
            instead of an edge of dots. Turn the light and the shadows of the sails go round the mill.
          </p>
        </div>
      </section>
    </div>
  )
}
