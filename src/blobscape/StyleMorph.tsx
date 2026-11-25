import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import { TRANSITIONS, type TransitionKind } from '../splat-core/transition.ts'
import { watchDraws } from '../splat-core/drawn.ts'
import { paintView } from '../shared/record.ts'
import { unlit } from '../splat-engine/voxel.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field, Slider } from '../shared/ui.tsx'
import { detailAsked, labelNames, writeDetail } from '../shared/detail.ts'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import type { Actor, CreatureStage } from './creature/stage.ts'
import { DETAIL } from './diorama/scene.ts'
import { DIORAMAS } from './diorama/scenes.ts'
import { TransitionOverlay } from './diorama/transitionOverlay.ts'
import { ALL_LOOKS, useDrawnLook, useHeld, wantsPlain, type Look } from './drawnLook.tsx'
import { morphOrder, nextLook } from './morph/order.ts'
import { href } from './routes.ts'

declare global {
  interface Window { __morph?: { stage: CreatureStage; look: Look; next: () => void; passing: () => boolean } }
}

/** The scenes a style passes over. */
const SCENES = [
  { id: 'windmill', label: 'Windmill' },
  { id: 'croc', label: 'Garden crocodile' },
  { id: 'lighthouse', label: 'Lighthouse' },
  { id: 'grove', label: 'Lantern grove' },
] as const

const DETAILS = [{ id: 'light', label: 'Light' }, { id: 'full', label: 'Full' }, { id: 'fine', label: 'Fine' }] as const
type Detail = 0 | 1 | 2

/** How long each style holds before the next, in seconds. */
const HOLDS = [{ id: '3', label: '3 seconds', seconds: 3 }, { id: '6', label: '6 seconds', seconds: 6 }, { id: '12', label: '12 seconds', seconds: 12 }] as const

const params = () => new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
const media = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches

interface Cut { id: string; detail: Detail; lit: Actor; plain: Actor; orbit: Orbit; pose: (typeof DIORAMAS)[number]['pose']; lights: (typeof DIORAMAS)[number]['lights']; ambient: (typeof DIORAMAS)[number]['ambient'] }

/**
 * Style Morph (issue #461): one Diorama scene going from style to style, each change wiped across the picture by one
 * of the screen transitions Diorama changes scenes with (splat-core/transition.ts). The styles are the shared ones
 * (drawnLook.tsx); the scene is cut twice, with light baked in and without, so a style that lights itself has its
 * cut ready.
 */
export function StyleMorph() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const overlayCanvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<CreatureStage>()
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState<string>()
  const offscreen = useMemo(() => params().get('offscreen') === '1', [])
  const coarse = useMemo(() => media('(pointer: coarse)'), [])
  const calm = useMemo(() => media('(prefers-reduced-motion: reduce)'), [])
  const [cycling, setCycling] = useState(!calm && !offscreen)
  const [scene, setScene] = useState(() => SCENES.find((s) => s.id === params().get('scene'))?.id ?? SCENES[0].id)
  const [detail, setDetail] = useState<Detail>(() => { const asked = detailAsked(DETAILS, labelNames); return asked ? (DETAILS.indexOf(asked) as Detail) : coarse ? 0 : 1 })
  const [order, setOrder] = useState<Look[]>(() => morphOrder(params().get('styles')))
  const [look, setLook] = useState<Look>(() => order[0])
  const [kind, setKind] = useState<TransitionKind>(() => TRANSITIONS.find((t) => t.id === params().get('wipe'))?.id ?? 'wipe')
  const [slow, setSlow] = useState(() => { const v = Number(params().get('slow')); return v >= 0.5 && v <= 4 ? v : 1.6 })
  const [hold, setHold] = useState(() => HOLDS.find((h) => h.id === params().get('hold'))?.id ?? HOLDS[1].id)
  const [cut, setCut] = useState<Cut>()
  const [orbit, setOrbit] = useState<Orbit>()
  const [passing, setPassing] = useState(false)
  const label = SCENES.find((s) => s.id === scene)!.label

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

  // the scene cut with its light baked in and without, after a paint so the waiting mark goes up first
  useEffect(() => {
    if (!stage) return
    const d = DIORAMAS.find((x) => x.id === scene)!
    const t = setTimeout(() => {
      const spacing = DETAIL[detail].spacing
      setCut({ id: scene, detail, lit: d.make(spacing), plain: unlit(() => d.make(spacing)), orbit: d.views[0].orbit, pose: d.pose, lights: d.lights, ambient: d.ambient })
    }, 30)
    return () => clearTimeout(t)
  }, [stage, scene, detail])

  // the cut the style wants on the stage
  const plain = wantsPlain(look)
  const [onStage, setOnStage] = useState<{ cut: Cut; plain: boolean }>()
  useEffect(() => {
    if (!stage || !cut) return
    if (onStage?.cut === cut && onStage.plain === plain) return
    const from = stage.time
    stage.setActor(plain ? cut.plain : cut.lit)
    stage.setPoser((sk, t) => { cut.pose(sk, t); stage.setLights(cut.lights(t, false), cut.ambient ?? 1) }, from)
    setOnStage({ cut, plain })
  }, [stage, cut, plain, onStage])
  useEffect(() => { if (cut) setOrbit((o) => (o && onStage?.cut.id === cut.id ? o : cut.orbit)) }, [cut]) // eslint-disable-line react-hooks/exhaustive-deps

  // the style on show waits for its cut, so bare blobs never show between
  const ready = !!cut && onStage?.cut === cut && onStage.plain === plain && cut.id === scene && cut.detail === detail
  const lookNow = useHeld(look, ready)
  const actor = onStage ? (onStage.plain ? onStage.cut.plain : onStage.cut.lit) : undefined
  const drawing = useDrawnLook(stage, lookNow, { actor, plain: !!onStage?.plain, azimuth: cut?.orbit.azimuth ?? 0, offscreen, light: coarse, loop: DIORAMAS.find((d) => d.id === scene)?.loop })
  useEffect(() => { if (stage) stage.playing = !calm || offscreen }, [stage, calm, offscreen])
  useEffect(() => { if (stage && orbit) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit])

  // the change: the picture as it stands is kept and laid over the view first, and only then is the next style asked
  // for, so nothing under the kept picture (the backdrop behind the canvas above all) changes while it can be seen
  const kept = useRef<{ sheet: HTMLCanvasElement; got: boolean; stop: () => void; seed: number } | null>(null)
  const overlayOf = useRef<TransitionOverlay | null>(null)
  const wipe = TRANSITIONS.find((x) => x.id === kind)
  const cellSize = () => Math.max(1, Math.round(6 * (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1)))
  const coverColor: [number, number, number] = [0.05, 0.06, 0.1]
  /** Lays the kept picture over the view as the wipe's first moment; false where it cannot be shown. */
  const coverWith = (keep: NonNullable<typeof kept.current>) => {
    const el = overlayCanvas.current
    if (!el || !wipe || !keep.got) return false
    try { overlayOf.current ??= new TransitionOverlay(el) } catch (e) { console.warn(e); return false }
    overlayOf.current.setFrom(keep.sheet)
    overlayOf.current.draw(wipe, 0, cellSize(), coverColor, keep.seed)
    el.hidden = false
    return true
  }
  const go = (next: Look) => {
    if (next === look || !stage) return
    if (kept.current) return
    if (!calm && drawn && canvas.current) {
      const cv = canvas.current, box = cv.parentElement!
      const sheet = document.createElement('canvas')
      sheet.width = cv.width; sheet.height = cv.height
      const ctx = sheet.getContext('2d', { alpha: false })!
      const keep = { sheet, got: false, stop: () => {}, seed: Math.floor(Math.random() * 1000) }
      kept.current = keep
      const copy = () => {
        if (sheet.width > 1) { paintView(ctx, box, sheet.width, sheet.height, (el) => (el === overlayCanvas.current ? undefined : el)); keep.got = true }
        if (!coverWith(keep)) kept.current = null
        setLook(next)
      }
      // a GPU canvas can be read only straight after a draw; off screen the page's canvas holds its picture
      if (offscreen) copy()
      else { const stop = watchDraws((to) => { if (to === cv) { stop(); copy() } }); keep.stop = stop; stage.invalidate() }
      return
    }
    setLook(next)
  }
  // once the next style is on the stage, the kept picture gives way to it
  useEffect(() => {
    const keep = kept.current
    if (!keep || !keep.got || lookNow !== look || !stage) return
    kept.current = null
    keep.stop()
    const el = overlayCanvas.current, overlay = overlayOf.current, t = wipe
    if (!el || !overlay || !t) return
    const cell = cellSize()
    setPassing(true)
    void (offscreen ? Promise.resolve() : stage.shown()).then(() => {
      const now = () => (offscreen ? stage.time : performance.now() / 1000)
      const start = now()
      const step = () => {
        const p = Math.min(1, Math.max(0, now() - start) / slow)
        overlay.draw(t, p, cell, coverColor, keep.seed)
        if (p < 1) requestAnimationFrame(step)
        else { el.hidden = true; setPassing(false) }
      }
      requestAnimationFrame(step)
    })
  }, [lookNow, look, stage, kind, slow, offscreen]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => overlayOf.current?.dispose(), [])

  // the styles come round in turn, each held a while once its wipe is done
  const holdSeconds = HOLDS.find((h) => h.id === hold)!.seconds
  const goNow = useRef(go)
  goNow.current = go
  useEffect(() => {
    if (!cycling || !ready || passing || lookNow !== look) return
    const id = setTimeout(() => goNow.current(nextLook(order, look)), holdSeconds * 1000)
    return () => clearTimeout(id)
  }, [cycling, ready, passing, lookNow, look, order, holdSeconds])

  // the address keeps what is on show
  useEffect(() => {
    const q = params()
    q.set('scene', scene)
    q.set('wipe', kind)
    if (slow !== 1.6) q.set('slow', String(slow)); else q.delete('slow')
    if (hold !== HOLDS[1].id) q.set('hold', hold); else q.delete('hold')
    history.replaceState(history.state, '', `${location.pathname}?${q}`)
  }, [scene, kind, slow, hold])

  // for verify: the stage and the next style, without clicking
  useEffect(() => {
    if (!stage || !ready) return
    window.__morph = { stage, look, next: () => goNow.current(nextLook(order, look)), passing: () => !!kept.current || passing }
    return () => { delete window.__morph }
  }, [stage, ready, look, order, passing])

  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const setOrbitSafe = (f: Orbit | ((o: Orbit) => Orbit)) => setOrbit((o) => (o ? (typeof f === 'function' ? f(o) : f) : o))
  useWheelZoom(canvas, setOrbitSafe as never)
  const waiting = !failed && (!drawn || !ready)
  const backend = stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'
  const named = (id: Look) => ALL_LOOKS.find((l) => l.id === id)!.label
  const toggle = (id: Look) => setOrder((o) => (o.includes(id) ? (o.length > 2 ? o.filter((x) => x !== id) : o) : ALL_LOOKS.map((l) => l.id).filter((x) => x === id || o.includes(x))))

  return (
    <div className="pb-4">
      <Crumbs here="Style Morph" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Style Morph</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          One little scene going from style to style: soft blobs, paint, cel shading, characters, cubes, neon and stained
          glass, each change wiped across the picture. The scene is the same blobs every time; only how they are drawn changes.
        </p>
      </header>
      <Workbench
        viewLabel="The picture"
        view={<>
          <div aria-hidden className="absolute inset-0" style={{ background: drawing.ground ?? '#11131c' }} />
          <canvas
            ref={canvas}
            role="application"
            aria-roledescription="3D view"
            aria-label={`The ${label.toLowerCase()}, drawn as ${named(lookNow).toLowerCase()}. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.`}
            tabIndex={0}
            data-testid="morph-view"
            className="absolute inset-0 h-full w-full cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset active:cursor-grabbing"
            onPointerDown={(ev) => {
              ev.currentTarget.setPointerCapture(ev.pointerId)
              pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
              if (orbit) drag.current = beginOrbitDrag(pointers.current, ev, orbit)
            }}
            onPointerMove={(ev) => {
              if (pointers.current.has(ev.pointerId)) pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
              const d = drag.current
              if (d) setOrbitSafe(dragOrbit(d, pointers.current, ev))
            }}
            onPointerUp={(ev) => { pointers.current.delete(ev.pointerId); drag.current = null }}
            onPointerCancel={(ev) => { pointers.current.delete(ev.pointerId); drag.current = null }}
            onKeyDown={(ev) => {
              if (!orbit || !orbitKey(ev, orbit)) return
              ev.preventDefault()
              setOrbitSafe((o) => orbitKey(ev, o) ?? o)
            }}
          />
          <canvas ref={overlayCanvas} aria-hidden hidden className="pointer-events-none absolute inset-0 h-full w-full" data-testid="morph-wipe" />
          {waiting && <LoadingMark testid="morph-loading" />}
          <p role="status" className="sr-only">{waiting ? (stage ? `Making the ${label.toLowerCase()}…` : 'Starting the splat engine…') : `${label}, ${named(lookNow).toLowerCase()}.`}</p>
          {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
          {ready && <div aria-hidden className="pointer-events-none absolute top-3 left-3 rounded-md bg-black/45 px-2.5 py-1 font-display text-lg text-white" data-testid="morph-name">{named(lookNow)}</div>}
          {orbit && cut && <ZoomBar orbit={orbit} setOrbit={setOrbitSafe as never} onReset={() => setOrbit(cut.orbit)} />}
        </>}
        status={<>
          <span>{ready && cut ? <><span className="tabular-nums text-ink" data-testid="morph-blobs">{(plain ? cut.plain : cut.lit).blobs.count.toLocaleString()}</span> blobs, drawn {order.length} ways.</> : 'Making it…'}</span>
          <span>On {backend}</span>
        </>}
        tabsLabel="Options"
        footer={
          <div className="flex flex-wrap items-center gap-1.5">
            <Button small primary onClick={() => setCycling((c) => !c)}>{cycling ? 'Hold this style' : 'Go round the styles'}</Button>
            <Button small onClick={() => go(nextLook(order, look, -1))}>Previous</Button>
            <Button small onClick={() => go(nextLook(order, look))} data-testid="morph-next">Next style</Button>
          </div>
        }
        tabs={[
          {
            id: 'morph', label: 'Morph', content: (
              <div className={TAB_SECTIONS}>
                <Field label="The styles it goes round">
                  <div className="flex flex-wrap gap-1.5" data-testid="morph-styles">
                    {ALL_LOOKS.map((l) => <Chip key={l.id} active={order.includes(l.id)} onClick={() => toggle(l.id)}>{l.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">At least two. Tap one to jump to it: {order.map((id) => <button key={id} type="button" aria-pressed={id === look} onClick={() => go(id)} className={`mr-1 underline decoration-rule underline-offset-2 hover:text-accent ${id === look ? 'text-ink' : ''}`}>{named(id)}</button>)}</p>
                </Field>
                <Field label="How one gives way to the next">
                  <div className="flex flex-wrap gap-1.5" data-testid="morph-wipes">
                    {TRANSITIONS.map((t) => <Chip key={t.id} active={kind === t.id} onClick={() => setKind(t.id)}>{t.name}</Chip>)}
                  </div>
                  {calm && <p className="mt-1.5 text-xs text-ink-faint">Your device asks for less motion, so styles change at once and only when you ask.</p>}
                </Field>
                <Slider label="A change takes" min={0.5} max={4} step={0.1} value={slow} onChange={setSlow} format={(v) => `${v.toFixed(1)} s`} />
                <Field label="Each style holds for">
                  <div className="flex flex-wrap gap-1.5">
                    {HOLDS.map((h) => <Chip key={h.id} active={hold === h.id} onClick={() => setHold(h.id)}>{h.label}</Chip>)}
                  </div>
                </Field>
              </div>
            ),
          },
          {
            id: 'look', label: 'Style', content: (
              <div className={TAB_SECTIONS}>
                <p className="text-sm text-ink-muted">The settings of {named(lookNow).toLowerCase()}, the style on show. They are kept as the styles go round.</p>
                {drawing.controls}
              </div>
            ),
          },
          {
            id: 'scene', label: 'Scene', content: (
              <div className={TAB_SECTIONS}>
                <Field label="The scene">
                  <div className="flex flex-wrap gap-1.5" data-testid="morph-scenes">
                    {SCENES.map((s) => <Chip key={s.id} active={scene === s.id} onClick={() => setScene(s.id)}>{s.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">Each is a scene in Diorama too, which draws it in all the same styles.</p>
                </Field>
                <Field label="Detail">
                  <div className="flex flex-wrap gap-1.5" data-testid="morph-detail">
                    {DETAILS.map((d, i) => <Chip key={d.id} active={detail === i} onClick={() => { setDetail(i as Detail); writeDetail(d.id) }}>{d.label}</Chip>)}
                  </div>
                </Field>
              </div>
            ),
          },
        ]}
      />

      <section aria-labelledby="how-title" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-sm text-ink-faint">How it works</p>
          <h2 id="how-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">The same blobs, drawn again</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            Every style here is drawn from the same blobs. Paint lays a mark on each one, cel shading works its light out
            afresh, characters and halftone dots read the finished picture back, and blocks snap the blobs onto a grid of cubes.
            They are the very styles Diorama and Scene Creator offer, so a scene looks the same in each wherever it is drawn.
          </p>
          <p>
            The styles that light the scene themselves want it cut with no light baked in, so the scene is cut twice when it
            opens, and the right cut is put on the stage before its style is drawn. As a style changes, the picture as it last
            stood is kept and laid over the view, and the next style is drawn underneath. Once it is there, the old picture is
            taken away by the same rules Diorama uses between scenes: a wipe, an iris, a clock hand, blinds or a dither.
          </p>
        </div>
      </section>
    </div>
  )
}
