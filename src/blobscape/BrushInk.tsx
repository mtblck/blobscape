import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import type { MarkLook } from '../splat-core/marks.ts'
import type { GlyphLook } from '../splat-core/glyphs.ts'
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
import { GROUND, LOOKS, PAPERS, SCREEN, css, isMark, type LookId } from './brushLooks.ts'
import { BACKDROPS, CEL, CEL_START, FILL_REACH, celLook, type CelChoice } from './celLooks.ts'
import { unlit } from '../splat-engine/voxel.ts'
import { gatherColors } from '../splat-core/cel.ts'
import { href } from './routes.ts'
import { sampleScan } from './scan/sample.ts'
import { DEFAULT_CLEAN, UNTURNED, autoOrient, cleanMasks, finish, stillActor, working } from './scan/studio.ts'

declare global {
  interface Window { __brush?: { stage: CreatureStage; blobs: () => number; subject: string; look: string; plain: boolean; text: () => Promise<string | undefined> } }
}

/** Every look on the page: the marks, and cel shading. */
type Look = LookId | typeof CEL.id
const ALL_LOOKS: { id: Look; label: string; note: string }[] = [...LOOKS.slice(0, -1), CEL, LOOKS[LOOKS.length - 1]]

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
  /** `plain` leaves the baked light out of what is built (`unlit`), for a look that lights it live. */
  make(coarse: boolean, plain: boolean): { actor: Actor; pose?: (sk: Skeleton, t: number) => void; lights?: (t: number) => PointLight[]; ambient?: Parameters<CreatureStage['setLights']>[1]; clip?: ReturnType<typeof recordClip> }
}

function scene(id: string, label: string): Subject {
  const d = DIORAMAS.find((x) => x.id === id) ?? DIORAMAS[0]
  return {
    id, label, about: d.about, from: 'a scene written as data', orbit: d.views[0].orbit,
    make: (coarse, plain) => ({ actor: plain ? unlit(() => d.make(DETAIL[coarse ? 0 : 1].spacing)) : d.make(DETAIL[coarse ? 0 : 1].spacing), pose: d.pose, lights: d.lights, ambient: d.ambient }),
  }
}

const FOX = ZOO.find((s) => s.id === 'fox') ?? ZOO[0]

const SUBJECTS: Subject[] = [
  scene('windmill', 'Windmill'),
  scene('croc', 'Garden crocodile'),
  scene('meadow', 'Fox in the grass'),
  {
    id: 'fox', label: 'Fox', about: 'A fox with a coat of fur, trotting on the spot', from: 'a creature on bones', orbit: FOX.view,
    make: (coarse, plain) => {
      const cut = () => FOX.make(coarse ? FOX.detail[0] : FOX.start, FOX.looks[0].id)
      const actor = plain ? unlit(cut) : cut()
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

/** On the dark screen characters are thin lines of light and read fainter than their share of ink, so tones are raised by this. */
const SCREEN_GAIN = 1.5

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
  const [look, setLook] = useState<Look>(() => ALL_LOOKS.find((l) => l.id === params().get('look'))?.id ?? 'gouache')
  const [cel, setCel] = useState<CelChoice>(() => {
    const q = params(), n = (k: string, d: number) => (q.get(k) !== null && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d)
    return { ...CEL_START, turn: n('turn', CEL_START.turn), height: n('height', CEL_START.height), tones: q.get('tones') === '3' ? 3 : 2, shadows: q.get('shadows') !== '0', smooth: n('smooth', CEL_START.smooth), fills: Math.max(0, Math.min(4, Math.round(n('fills', CEL_START.fills)))) }
  })
  // cel shading lights the blobs itself, so its subjects are built with no light baked in
  const plain = look === 'cel'
  const [size, setSize] = useState(1)
  // outlines: on for the two pen looks unless the visitor says otherwise
  const [outlined, setOutlined] = useState<boolean | null>(() => (params().get('outline') === '1' ? true : params().get('outline') === '0' ? false : null))
  const [pen, setPen] = useState(1.5)
  const [paper, setPaper] = useState(PAPERS[0].id)
  // ASCII: how tall a character is, whether each takes the color of what it stands for, and strokes along edges
  const [letter, setLetter] = useState(12)
  const [own, setOwn] = useState(true)
  const [strokes, setStrokes] = useState(true)
  const [strands, setStrands] = useState(true)
  const [weight, setWeight] = useState(1)
  const [copied, setCopied] = useState('')
  const sub = SUBJECTS.find((s) => s.id === subject)!
  const [orbit, setOrbit] = useState<Orbit>(sub.orbit)
  const [built, setBuilt] = useState<{ id: string; plain: boolean; count: number }>()

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
  const shown = useRef<Actor | undefined>(undefined)
  // built after a paint, so the waiting mark goes up first: cutting a scene holds the main thread
  useEffect(() => {
    if (!stage) return
    setBuilt(undefined)
    const s = SUBJECTS.find((x) => x.id === subject)!
    const t = setTimeout(() => {
      const made = s.make(coarse, plain)
      stage.setActor(made.actor, made.clip)
      shown.current = made.actor
      if (made.pose) stage.setPoser((sk, time) => { made.pose!(sk, time); stage.setLights(made.lights?.(time) ?? [], made.ambient ?? 1) })
      else stage.setLights([], 1)
      // the view stays where it is when only the light in the blobs changed
      setOrbit((o) => (kept.current === s.id ? o : s.orbit))
      kept.current = s.id
      setBuilt({ id: s.id, plain, count: made.actor.blobs.count })
    }, 30)
    return () => clearTimeout(t)
  }, [stage, subject, coarse, plain])

  const sheet = PAPERS.find((p) => p.id === paper)!
  const marks = useMemo<MarkLook | undefined>(() => (look !== 'cel' && isMark(look) ? { kind: look, size, ink: sheet.ink, paper: sheet.paper, soft: sub.soft } : undefined), [look, size, sheet, sub.soft])
  useEffect(() => { stage?.setMarks(marks) }, [stage, marks, built])
  const ascii = look === 'ascii'
  const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  // off screen a frame is drawn only when asked for, and must not depend on the one before (`?steady=` says otherwise, for the checks)
  const held = useMemo(() => { const v = params().get('steady'); return v !== null && Number.isFinite(+v) ? +v : offscreen ? 0 : undefined }, [offscreen])
  const glyphs = useMemo<GlyphLook | undefined>(() => (ascii ? { size: letter, ink: own ? undefined : sheet.ink, light: !own && lum(sheet.paper) > lum(sheet.ink), edges: strokes, strands, gain: weight * (own ? SCREEN_GAIN : 1), steady: held } : undefined), [ascii, letter, own, sheet, strokes, strands, weight, held])
  useEffect(() => { stage?.setGlyphs(glyphs) }, [stage, glyphs])
  useEffect(() => { setCopied('') }, [look, subject])
  const outline = !ascii && (outlined ?? (look === 'ink' || look === 'hatch' || look === 'cel'))
  useEffect(() => { stage?.setCel(look === 'cel' ? celLook({ ...cel, turn: cel.turn + sub.orbit.azimuth, line: outline ? pen : 0 }) : undefined) }, [stage, look, cel, outline, pen, sub])
  // flat fills: each part's colors gathered into a few, shown in place of the blobs' own (which stay as they were)
  useEffect(() => {
    const actor = shown.current
    if (!stage || !built || !actor) return
    if (look !== 'cel' || !cel.fills || !built.plain) { stage.tint(); return }
    // speckle is anything finer than about two blobs across, by a typical blob's middle size (a strand of fur's width, not its length)
    const b = actor.blobs, sizes = Float32Array.from({ length: Math.min(b.count, 2000) }, (_, k) => { const i = Math.floor((k * b.count) / Math.min(b.count, 2000)); return [b.scale[i * 3], b.scale[i * 3 + 1], b.scale[i * 3 + 2]].sort((x, y) => x - y)[1] }).sort()
    const flat = gatherColors(b.color.subarray(0, b.count * 3), (actor as { partOf?: ArrayLike<number> }).partOf, cel.fills, { at: b.center, reach: (sizes[sizes.length >> 1] || 0) * FILL_REACH })
    stage.tint((_own, i) => [flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]])
    return () => stage.tint()
  }, [stage, built, look, cel.fills])
  useEffect(() => { stage?.setOutline(outline && look !== 'cel' ? { width: pen, ink: look === 'ink' || look === 'hatch' ? sheet.ink : undefined } : undefined) }, [stage, outline, pen, look, sheet])
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
    window.__brush = { stage, blobs: () => stage.blobCount, subject: built.id, look, plain: built.plain, text: () => stage.glyphText() }
    return () => { delete window.__brush }
  }, [stage, built, look])

  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  useWheelZoom(canvas, setOrbit)
  const waiting = !failed && (!drawn || built?.id !== subject || built.plain !== plain)
  const drawnOn = look === 'ink' || look === 'hatch'
  const lookNow = ALL_LOOKS.find((l) => l.id === look)!
  const backdrop = BACKDROPS.find((b) => b.id === cel.backdrop) ?? BACKDROPS[0]
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
          <div aria-hidden className="absolute inset-0" style={{ background: look === 'blobs' ? undefined : look === 'cel' ? backdrop.back : ascii ? css(own ? SCREEN : sheet.paper) : drawnOn ? css(sheet.paper) : GROUND }} data-testid="brush-ground" />
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
          <span>{built?.id === subject && built.plain === plain ? <><span className="tabular-nums text-ink" data-testid="brush-blobs">{built.count.toLocaleString()}</span> blobs from {sub.from}{look === 'blobs' ? '.' : look === 'cel' ? ', lit as you see them.' : ascii ? ', read off as characters.' : ', one mark each.'}</> : 'Making it…'}</span>
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
                {look === 'cel' && (
                  <div className="space-y-4" data-testid="brush-cel">
                    <Slider label="Light from" value={cel.turn} min={-180} max={180} step={5} onChange={(turn) => setCel((c) => ({ ...c, turn }))} format={(v) => `${v}°`} hint="Round the subject, from where the view starts: 0° is from the front, 90° from the right. The shadows go with it." />
                    <Slider label="Light height" value={cel.height} min={10} max={85} step={1} onChange={(height) => setCel((c) => ({ ...c, height }))} format={(v) => `${v}°`} />
                    <Field label="Tones">
                      <div className="flex flex-wrap gap-1.5">
                        <Chip active={cel.tones === 2} onClick={() => setCel((c) => ({ ...c, tones: 2 }))}>Light and shade</Chip>
                        <Chip active={cel.tones === 3} onClick={() => setCel((c) => ({ ...c, tones: 3 }))}>Three tones</Chip>
                      </div>
                    </Field>
                    <Toggle label="Cast shadows" checked={cel.shadows} onChange={(shadows) => setCel((c) => ({ ...c, shadows }))} />
                    <Slider label="Shadow shapes" value={cel.smooth} min={1} max={12} step={0.5} onChange={(smooth) => setCel((c) => ({ ...c, smooth }))} format={(v) => `${v} px`} hint="How far the light is smoothed over a surface before it is cut into tones: more gives rounder, simpler shapes." />
                    <Slider label="Colors in each part" value={cel.fills} min={0} max={4} step={1} onChange={(fills) => setCel((c) => ({ ...c, fills }))} format={(v) => (v === 0 ? 'As painted' : `${v}`)} hint="Each part's colors gathered into a few flat ones, so a mottled surface becomes areas of one color and a stripe stays a stripe." />
                    <Field label="Backdrop">
                      <div className="flex flex-wrap gap-1.5">
                        {BACKDROPS.map((b) => <Chip key={b.id} active={cel.backdrop === b.id} onClick={() => setCel((c) => ({ ...c, backdrop: b.id }))}>{b.label}</Chip>)}
                      </div>
                    </Field>
                  </div>
                )}
                {look !== 'cel' && isMark(look) && (
                  <Slider label="Mark size" value={size} min={0.5} max={1.3} step={0.05} onChange={setSize} format={(v) => `${Math.round(v * 100)}%`} hint="Smaller marks leave gaps between them; bigger ones overlap more." />
                )}
                {ascii && (
                  <Slider label="Character size" value={letter} min={8} max={24} step={2} onChange={setLetter} format={(v) => `${v} px`} hint="How tall a character is. Smaller ones show more of the picture; bigger ones are easier to read." />
                )}
                {ascii && (
                  <Slider label="Weight" value={weight} min={0.5} max={2} step={0.1} onChange={setWeight} format={(v) => `${Math.round(v * 100)}%`} hint="Over 100% every cell takes a heavier character than its tone asks for, which suits a dim scene." />
                )}
                {ascii && (
                  <div data-testid="brush-strokes">
                    <Toggle label="Strokes along edges" checked={strokes} onChange={setStrokes} />
                    <p className="mt-1.5 text-xs text-ink-faint">Where an edge runs through a cell it gets | _ / or \ by the way the edge runs, in place of a character for its tone.</p>
                  </div>
                )}
                {ascii && (
                  <div data-testid="brush-strands">
                    <Toggle label="Strokes along fur and grass" checked={strands} onChange={setStrands} />
                    <p className="mt-1.5 text-xs text-ink-faint">A cell that is mostly long thin blobs, such as strands of fur or blades of grass, gets the stroke nearest the way they run.</p>
                  </div>
                )}
                {ascii && (
                  <div data-testid="brush-own">
                    <Toggle label="Their own colors" checked={own} onChange={setOwn} />
                    <p className="mt-1.5 text-xs text-ink-faint">Each character takes the color of what it stands for, on a dark screen. Off, they are one ink on paper.</p>
                  </div>
                )}
                {ascii && (
                  <div>
                    <Button small onClick={() => {
                      void stage?.glyphText().then((text) => {
                        if (!text) { setCopied('Nothing to copy yet.'); return }
                        return navigator.clipboard.writeText(text).then(() => setCopied(`Copied ${text.split('\n').length} lines of text.`))
                      }).catch(() => setCopied('This browser would not let the page copy.'))
                    }}>Copy as text</Button>
                    <p role="status" className="mt-1.5 text-xs text-ink-faint" data-testid="brush-copied">{copied || 'The picture as it stands now, in plain characters: paste it anywhere with a fixed-width font.'}</p>
                  </div>
                )}
                {!ascii && (
                  <div data-testid="brush-outline">
                    <Toggle label="Outlines" checked={outline} onChange={setOutlined} />
                    <p className="mt-1.5 text-xs text-ink-faint">{look === 'cel' ? 'An even line round the subject, where one thing stands in front of another, and between its parts.' : 'A pen line round the subject, where one thing stands in front of another, and between its parts. Heavier against dark things, and it lifts off here and there against light ones.'}</p>
                  </div>
                )}
                {outline && (
                  <Slider label="Pen width" value={pen} min={0.75} max={3} step={0.25} onChange={setPen} format={(v) => `${v} px`} />
                )}
                {(drawnOn || (ascii && !own)) && (
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
                  <p className="mt-1.5 text-xs text-ink-faint">Three scenes from Pixel Diorama, a creature on bones and a scan: the marks need nothing but the blobs.</p>
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
