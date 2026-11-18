import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import { STEADY, darkest, type PixelLook } from '../splat-core/pixel.ts'
import { recordClip } from '../splat-engine/glb.ts'
import type { Skeleton } from '../splat-engine/rig.ts'
import { ZOO } from '../splat-engine/zoo/index.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip } from '../shared/ui.tsx'
import { Cover } from './Experiments.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import type { CreatureStage } from './creature/stage.ts'
import { DETAIL } from './diorama/scene.ts'
import { DIORAMAS } from './diorama/scenes.ts'
import { BESIDE, DEMOS, DOORS, ENGINE, ENGINE_BUILT, FEATURES, ONE_TAG, PIXEL_STRIP, type DemoId } from './engineCopy.ts'
import { Gallery } from './diorama/Gallery.tsx'
import { ENGINE_LOOPS } from './diorama/loops.ts'
import type { ForestStage } from './forest/stage.ts'
import { pathX } from './forest/world.ts'
import { CARD_LINK, EXPERIMENTS } from './site.ts'

declare global {
  interface Window { __engine?: { demo: DemoId; stage: CreatureStage | ForestStage; blobs: () => number } }
}

const LINK = 'font-medium text-ink underline decoration-blob decoration-2 underline-offset-4 hover:text-accent'
const H2 = 'font-display text-3xl leading-tight text-balance sm:text-4xl'
const CANVAS = 'absolute inset-0 h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset'
const FAILED = 'This browser could not start WebGPU or WebGL 2, which the engine needs.'

const params = () => new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
const media = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches

/** What a demo tells the frame round it. */
interface DemoProps { onState: (s: { drawn?: boolean; failed?: string; blobs?: number; backend?: string }) => void }

/**
 * A creature or a scene on `CreatureStage`, turned by dragging. `dress` is run once the engine has
 * started and a frame has been painted (building holds the main thread, so the waiting mark goes up first).
 */
function OrbitDemo({ id, about, start, lights, dress, onState }: DemoProps & { id: DemoId; about: string; start: Orbit; lights?: boolean; dress: (stage: CreatureStage) => number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<CreatureStage>()
  const [orbit, setOrbit] = useState<Orbit>(start)
  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  useEffect(() => {
    let live: CreatureStage | undefined, gone = false, raf = 0
    let t: ReturnType<typeof setTimeout> | undefined
    import('./creature/stage.ts')
      .then(({ CreatureStage }) => CreatureStage.start(canvas.current!, { offscreen: params().get('offscreen') === '1', webgl: params().get('webgl') === '1', lights }))
      .then((s) => {
        if (gone) { s.dispose(); return }
        live = s
        s.onFirstFrame = () => onState({ drawn: true })
        s.playing = !media('(prefers-reduced-motion: reduce)')
        raf = requestAnimationFrame(() => {
          raf = requestAnimationFrame(() => {
            t = setTimeout(() => {
              // the stage starts on its own default view: the demo's goes on before its first frame, not a render later
              s.orbit = start
              const blobs = dress(s)
              window.__engine = { demo: id, stage: s, blobs: () => s.blobCount }
              onState({ blobs, backend: s.backend })
              setStage(s)
            }, 60)
          })
        })
      }, (e: unknown) => { console.warn(e); onState({ failed: FAILED }) })
    return () => { gone = true; cancelAnimationFrame(raf); clearTimeout(t); live?.dispose(); if (window.__engine?.stage === live) delete window.__engine }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (stage) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit])
  useWheelZoom(canvas, setOrbit)
  return (
    <>
      <canvas
        ref={canvas}
        role="application"
        aria-roledescription="3D view"
        aria-label={`${about}. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.`}
        tabIndex={0}
        data-testid="engine-view"
        className={`${CANVAS} cursor-grab touch-none active:cursor-grabbing`}
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
      <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(start)} />
    </>
  )
}

const DRAGON = ZOO.find((s) => s.id === 'dragon')!

/** The dragon of Splat Creatures, breathing fire. */
function CreatureDemo(props: DemoProps) {
  return (
    <OrbitDemo
      {...props} id="creature" about={DEMOS[0].about} start={DRAGON.view}
      dress={(stage) => {
        // phones get the lighter dragon: it builds in about half the time
        const body = DRAGON.make(media('(pointer: coarse)') ? DRAGON.detail[0] : DRAGON.start, DRAGON.looks[0].id)
        const fire = DRAGON.moves.find((m) => m.name === 'fire') ?? DRAGON.moves[0]
        stage.setActor(body, recordClip(fire.name, body.skeleton, fire.pose, fire.seconds, fire.fps ?? 24))
        return body.blobs.count
      }}
    />
  )
}

const OWL = DIORAMAS.find((d) => d.id === 'owl') ?? DIORAMAS[0]

/** A Pixel Diorama scene in pixel mode, with its own palette and finish. */
function PixelDemo(props: DemoProps) {
  return (
    <OrbitDemo
      {...props} id="pixel" about={DEMOS[2].about} start={OWL.views[0].orbit} lights
      dress={(stage) => {
        const d = OWL
        const built = d.make(DETAIL[media('(pointer: coarse)') ? 0 : 1].spacing)
        const colors = d.palette.colors
        const look: PixelLook = { palette: colors, dither: d.finish.dither, outline: d.finish.outline ? darkest(colors) : null, glow: d.finish.glow, edges: d.finish.edges ? 1 : 0, parts: true, sky: d.finish.sky ? d.sky : undefined, steady: STEADY }
        stage.setFloor(0)
        stage.setActor(built)
        stage.setPoser((sk: Skeleton, t: number) => { d.pose(sk, t); stage.setLights(d.lights(t), 1) })
        stage.setPixels(look, 2)
        return built.blobs.count
      }}
    />
  )
}

/** Forest Walk's forest, with the elf walking itself down the middle of the path. */
function WorldDemo({ onState }: DemoProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let live: ForestStage | undefined, gone = false, raf = 0
    let t: ReturnType<typeof setTimeout> | undefined
    const calm = media('(prefers-reduced-motion: reduce)')
    import('./forest/stage.ts')
      .then(({ ForestStage }) => ForestStage.start(canvas.current!, { offscreen: params().get('offscreen') === '1' }))
      .then((s) => {
        if (gone) { s.dispose(); return }
        live = s
        s.onFirstFrame = () => onState({ drawn: true })
        t = setTimeout(() => {
          // without WebGPU the CPU sorts every frame, so the forest starts light
          s.setForest({ detail: s.backend === 'webgpu' ? 0.6 : 0.3, season: 'summer', look: 'forest', seed: 1 })
          s.forest!.sprout = !calm
          s.forest!.wind = calm ? 0 : 1
          window.__engine = { demo: 'world', stage: s, blobs: () => s.blobCount }
          onState({ blobs: s.blobCount, backend: s.backend })
          // steer for a point a little way down the path
          const steer = () => {
            const w = s.forest!.walker
            const want = Math.atan2(pathX(w.z + 4) - w.x, 4)
            s.input = { forward: calm ? 0 : 1, turn: Math.max(-1, Math.min(1, (w.heading - want) * 2.5)) }
            raf = requestAnimationFrame(steer)
          }
          steer()
        }, 60)
      }, (e: unknown) => { console.warn(e); onState({ failed: FAILED }) })
    return () => { gone = true; cancelAnimationFrame(raf); clearTimeout(t); live?.dispose(); if (window.__engine?.stage === live) delete window.__engine }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={canvas} role="img" aria-label={DEMOS[1].about} data-testid="engine-view" className={CANVAS} />
}

/** One preview and three chips: only the demo picked is running, so a phone holds one world at a time. */
function Demos() {
  const [which, setWhich] = useState<DemoId>(() => DEMOS.find((d) => d.id === params().get('demo'))?.id ?? 'creature')
  const [state, setState] = useState<{ drawn?: boolean; failed?: string; blobs?: number; backend?: string }>({})
  const demo = DEMOS.find((d) => d.id === which)!
  const onState = useMemo(() => (s: typeof state) => setState((was) => ({ ...was, ...s })), [])
  const pick = (id: DemoId) => { if (id !== which) { setState({}); setWhich(id) } }
  const waiting = !state.failed && !(state.drawn && state.blobs)
  return (
    <section aria-labelledby="demos-title" className="pt-2">
      <h2 id="demos-title" className="sr-only">Three live demos</h2>
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-5">
        {/* the chips come first, so on a phone they sit above the view they change */}
        <div role="group" aria-label="Which demo" className="flex flex-wrap gap-1.5 lg:col-start-2 lg:row-start-1" data-testid="engine-demos">
          {DEMOS.map((d) => <Chip key={d.id} active={which === d.id} onClick={() => pick(d.id)}>{d.label}</Chip>)}
        </div>
        <div className="case relative overflow-hidden rounded-2xl bg-paper ring-1 ring-rule lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <div className="relative h-[45svh] min-h-[240px] lg:aspect-[4/3] lg:h-auto lg:w-full">
            {which === 'creature' ? <CreatureDemo key="creature" onState={onState} /> : which === 'world' ? <WorldDemo key="world" onState={onState} /> : <PixelDemo key="pixel" onState={onState} />}
            {waiting && <LoadingMark testid="engine-loading" />}
            {state.failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{state.failed}</div>}
          </div>
          <p className="border-t border-rule-soft px-4 py-2 text-xs leading-relaxed text-ink-muted sm:text-sm" data-testid="engine-status">
            {state.blobs ? <><span className="tabular-nums text-ink">{state.blobs.toLocaleString()}</span> blobs, drawn live on {state.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2'}.</> : 'Drawn live in your browser.'}
          </p>
        </div>
        <div className="lg:col-start-2 lg:row-start-2">
          <p role="status" className="sr-only">{state.failed ? '' : waiting ? `Starting ${demo.label.toLowerCase()}…` : `${demo.title}.`}</p>
          <h3 className="font-display text-2xl">{demo.title}</h3>
          <p className="mt-2 text-lg leading-relaxed text-ink-muted">{demo.body}</p>
          <p className="mt-4"><a href={demo.link.href} className={LINK}>{demo.link.label} →</a></p>
        </div>
      </div>
    </section>
  )
}

/**
 * The creature element, live beside the code that makes it. The element is the package's own (`splat-engine/element.ts`),
 * loaded when this section is reached; until then, and where it can't draw, its poster shows.
 */
function OneTag() {
  const [copied, setCopied] = useState(false)
  const [offscreen] = useState(() => params().get('offscreen') === '1')
  useEffect(() => { void import('../splat-engine/element.ts') }, [])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ONE_TAG.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { setCopied(false) }
  }
  return (
    <section aria-labelledby="tag-title" className="pt-16 lg:pt-20">
      <h2 id="tag-title" className={H2}>{ONE_TAG.title}</h2>
      <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-muted">{ONE_TAG.body}</p>
      <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="rounded-2xl border border-rule bg-paper-sunk/60 p-2">
          <blobscape-creature
            src={ONE_TAG.file} move="trot" tap="idle" look="pointer" alt={ONE_TAG.alt} poster={ONE_TAG.poster}
            offscreen={offscreen ? '' : undefined}
            data-testid="engine-tag" className="block aspect-[4/3] w-full text-accent"
          >
            {/* what a browser shows before the script has run, or without it */}
            <img src={ONE_TAG.poster} alt="" width={640} height={480} className="h-full w-full object-contain" />
          </blobscape-creature>
          <p className="px-2 pt-1 pb-2 text-sm text-ink-muted">{ONE_TAG.try}</p>
        </div>
        <div className="relative min-w-0">
          <div className="absolute top-2 right-2">
            <Button small onClick={() => void copy()}>{copied ? 'Copied' : 'Copy the code'}</Button>
          </div>
          <pre data-testid="engine-tag-code" tabIndex={0} aria-label="The code for the fox" className="h-full overflow-auto rounded-2xl border border-rule bg-paper-sunk p-4 pt-12 text-[0.8rem] leading-relaxed text-ink"><code>{ONE_TAG.code}</code></pre>
          <p aria-live="polite" className="sr-only">{copied ? 'Copied the code.' : ''}</p>
        </div>
      </div>
      <p className="mt-5"><a href={ONE_TAG.link.href} className={LINK}>{ONE_TAG.link.label} →</a></p>
    </section>
  )
}

/** The engine page: what the engine is, three live demos, what it does, where it sits and how to use it. */
export function Engine() {
  const h1 = useFocusHeading()
  const built = EXPERIMENTS.filter((e) => ENGINE_BUILT.includes(e.id))
  return (
    <div>
      <Crumbs here="Engine" />
      <header className="max-w-3xl pt-6 pb-8">
        <h1 ref={h1} tabIndex={-1} className="font-display text-5xl outline-none">{ENGINE.title}</h1>
        <p className="mt-4 text-xl leading-relaxed text-ink-muted">{ENGINE.lede}</p>
        <p className="mt-3 text-ink-faint">{ENGINE.note}</p>
        <p className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <a href="/engine/docs/" data-testid="engine-docs" className="rounded-full bg-ink px-5 py-2.5 font-semibold text-paper no-underline transition-transform hover:-translate-y-px">Read the docs</a>
          <code translate="no" className="rounded-lg border border-rule bg-paper-sunk px-3 py-2 font-mono text-sm text-ink">npm install @blobscape/engine three</code>
        </p>
      </header>
      <Demos />

      <section aria-labelledby="pixel-title" className="pt-16 lg:pt-20">
        <h2 id="pixel-title" className={H2}>{PIXEL_STRIP.title}</h2>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-muted">{PIXEL_STRIP.body}</p>
        <div className="mt-8"><Gallery ids={ENGINE_LOOPS} testId="engine-loops" /></div>
        <p className="mt-5"><a href={PIXEL_STRIP.link.href} className={LINK}>{PIXEL_STRIP.link.label} →</a></p>
      </section>

      <OneTag />

      <section aria-labelledby="does-title" className="pt-16 lg:pt-20">
        <h2 id="does-title" className={H2}>What it does</h2>
        <ul className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="border-t-2 border-rule pt-4">
              <h3 className="font-display text-xl">{f.title}</h3>
              <p className="mt-2 text-ink-muted">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sits-title" className="pt-16 lg:pt-20">
        <h2 id="sits-title" className={H2}>{BESIDE.title}</h2>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-muted">{BESIDE.intro}</p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {[BESIDE.ours, BESIDE.spark].map((side, i) => (
            <div key={side.title} className={`rounded-2xl border p-5 ${i === 0 ? 'border-ink-faint bg-paper' : 'border-rule bg-paper-sunk/60'}`}>
              <h3 className="font-display text-xl">{side.title}</h3>
              <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-ink-muted">{side.items.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          ))}
        </div>
        <p className="mt-5 text-ink-muted">{BESIDE.note}</p>
      </section>

      <section aria-labelledby="use-title" className="pt-16 lg:pt-20">
        <h2 id="use-title" className={H2}>Three ways to use it</h2>
        <ol className="mt-8 grid gap-5 lg:grid-cols-3">
          {DOORS.map((d, i) => (
            <li key={d.title} className="flex flex-col rounded-2xl border border-rule bg-paper p-5">
              <p aria-hidden className="font-display text-3xl text-ink-faint">{i + 1}</p>
              <h3 className="mt-1 font-display text-xl">{d.title}</h3>
              <p className="mt-2 flex-1 text-ink-muted">{d.body}</p>
              <p className="mt-4"><a href={d.link.href} className={LINK}>{d.link.label} →</a></p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="built-title" className="pt-16 lg:pt-20">
        <h2 id="built-title" className={H2}>Built on it</h2>
        <ul className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3" data-testid="engine-built">
          {built.map((e) => (
            <li key={e.id} className="relative flex flex-col gap-4 rounded-2xl border border-rule bg-paper p-4 transition-colors hover:border-ink-faint">
              <Cover e={e} />
              <a href={e.url} className={CARD_LINK}>{e.title} →</a>
              <p className="flex-1 text-ink-muted">{e.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
