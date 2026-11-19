import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import { STEADY, darkest, type PixelLook } from '../splat-core/pixel.ts'
import type { Built } from '../splat-engine/body.ts'
import type { Skeleton } from '../splat-engine/rig.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Chip } from '../shared/ui.tsx'
import { useFullScreen } from '../shared/Workbench.tsx'
import { detailAsked, labelNames, writeDetail } from '../shared/detail.ts'
import type { CreatureStage } from './creature/stage.ts'
import { DETAIL } from './diorama/scene.ts'
import { ScenePicker } from './diorama/ScenePicker.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import { ModeBar, useWorkspaceScreen, panelId, tabId, type Mode } from './sandbox/modes.tsx'
import type { CutJob } from './creator/cut.ts'
import { unpack, type PackedCut } from './creator/pack.ts'
import { START_LANDS, START_SCENES, openingAsked, openingLand, openingScene, queryFor, shownOf, type Opened } from './creator/shown.ts'

/**
 * Scene Creator (epic #329): Pixel Diorama's scenes taken apart into a land and props to arrange. This is the
 * workspace (#335): the sandbox's Modes layout, a scene opened split, each piece cut in a worker and drawn as its own
 * actor on one stage. Picking, arranging, the library, light, style and export follow in their own issues.
 */

type CreatorMode = 'scene' | 'props' | 'arrange' | 'light' | 'style' | 'export'

const MODES: Mode<CreatorMode>[] = [
  { id: 'scene', name: 'Scene', note: 'Start from one of the scenes or a bare land.', icon: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6' },
  { id: 'props', name: 'Props', note: 'The library of props to add: coming next.', icon: 'M4 7l8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10' },
  { id: 'arrange', name: 'Arrange', note: 'Move, turn and size what is in the scene: coming next.', icon: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3' },
  { id: 'light', name: 'Light', note: 'The sun, the sky and lamps: coming next.', icon: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z' },
  { id: 'style', name: 'Style', note: 'Pixel art and the other looks: coming next.', icon: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-1.4-1-1.6-1-2.6 0-.8.6-1.3 1.5-1.3H16a5 5 0 0 0 5-5c0-4-4-7.5-9-7.5zM7.5 11h.01M10 7h.01M15 7h.01' },
  { id: 'export', name: 'Export', note: 'Save a picture, the loop or the project: coming next.', icon: 'M12 3v12M7 10l5 5 5-5M4 19h16' },
]

const modeAsked = (search: string): CreatorMode => MODES.find((m) => m.id === new URLSearchParams(search).get('mode'))?.id ?? 'scene'

/** The pieces of what is open, cut at one detail: the land (or the whole scene) first, then each prop. */
interface Cuts { key: string; detail: string; built: Built[] }

export function SceneCreator() {
  const offscreen = useMemo(() => typeof location !== 'undefined' && new URLSearchParams(location.search).has('offscreen'), [])
  const webgl = useMemo(() => typeof location !== 'undefined' && new URLSearchParams(location.search).has('webgl'), [])
  const coarse = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches, [])
  const [mode, setModeState] = useState<CreatorMode>(() => (typeof location === 'undefined' ? 'scene' : modeAsked(location.search)))
  const [opened, setOpened] = useState<Opened>(() => openingAsked(typeof location === 'undefined' ? '' : location.search))
  const shown = useMemo(() => shownOf(opened), [opened])
  // a phone starts on Chunky, as Pixel Diorama starts it a step lighter
  const [detail, setDetail] = useState<string>(() => detailAsked(DETAIL, labelNames)?.id ?? (coarse ? DETAIL[0].id : DETAIL[2].id))
  const [orbit, setOrbit] = useState<Orbit>(shown.orbit)
  const [stage, setStage] = useState<CreatureStage>()
  const [cuts, setCuts] = useState<Cuts>()
  const [failed, setFailed] = useState('')
  const [picking, setPicking] = useState(false)
  const work = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  useWorkspaceScreen(work)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<OrbitDrag | null>(null)
  const { full, toggle: toggleFull } = useFullScreen(work)
  const base = 'creator'

  const setMode = (m: CreatorMode) => {
    setModeState(m)
    const url = new URL(location.href)
    if (m === 'scene') url.searchParams.delete('mode')
    else url.searchParams.set('mode', m)
    history.replaceState(history.state, '', url.pathname + url.search + url.hash)
  }

  const open = (o: Opened) => {
    setOpened(o)
    setOrbit(shownOf(o).orbit)
    const url = new URL(location.href)
    url.searchParams.delete('scene'); url.searchParams.delete('land')
    const [k, v] = queryFor(o)
    url.searchParams.set(k, v)
    history.replaceState(history.state, '', url.pathname + url.search + url.hash)
  }

  // the stage: pixel art, so with lights, on its own canvas
  useEffect(() => {
    let live: CreatureStage | undefined, gone = false
    import('./creature/stage.ts')
      .then(({ CreatureStage }) => CreatureStage.start(canvas.current!, { offscreen, lights: true, webgl }))
      .then((s) => {
        if (gone) { s.dispose(); return }
        live = s
        s.setFloor(0)
        setStage(s)
      }, (e: unknown) => { console.warn(e); setFailed('This browser could not start WebGPU or WebGL 2, which the scene needs.') })
    return () => { gone = true; live?.dispose() }
  }, [offscreen, webgl])

  // Cutting, in a worker so the page keeps drawing: the pieces at Chunky first where a finer detail is asked for, so
  // something shows quickly, then at the detail asked for. Answers to jobs no longer wanted are dropped.
  useEffect(() => {
    const worker = new Worker(new URL('./creator/cut.worker.ts', import.meta.url), { type: 'module' })
    let next = 0, gone = false
    const ask = (job: CutJob) => new Promise<Built>((resolve, reject) => {
      const id = ++next
      const on = (ev: MessageEvent<{ id: number; cut?: PackedCut; error?: string }>) => {
        if (ev.data.id !== id) return
        worker.removeEventListener('message', on)
        if (ev.data.cut) resolve(unpack(ev.data.cut))
        else reject(new Error(ev.data.error))
      }
      worker.addEventListener('message', on)
      worker.postMessage({ id, job })
    })
    const passes = detail === DETAIL[0].id ? [detail] : [DETAIL[0].id, detail]
    void (async () => {
      for (const d of passes) {
        const spacing = DETAIL.find((x) => x.id === d)!.spacing
        try {
          const built: Built[] = []
          for (const job of shown.jobs(spacing)) built.push(await ask(job))
          if (gone) return
          setCuts({ key: shown.key, detail: d, built })
        } catch (e) {
          if (!gone) setFailed(`Could not cut ${shown.name}: ${e instanceof Error ? e.message : e}`)
          return
        }
      }
    })()
    return () => { gone = true; worker.terminate() }
  }, [shown, detail])

  const ready = cuts?.key === shown.key ? cuts : undefined
  const done = ready?.detail === detail

  // what is cut goes on the stage: the land as the actor, each prop beside it, all posed from one clock
  useEffect(() => {
    if (!stage || !ready) return
    const [land, ...props] = ready.built
    const from = stage.time
    stage.setActor(land, undefined, props)
    stage.setPoser((sk: Skeleton, t: number) => {
      shown.poseLand(sk, t)
      props.forEach((p, i) => shown.poseProp(i, p.skeleton, t))
      stage.setLights(shown.lights(t, stage.backend === 'webgpu'), shown.ambient)
    }, from)
  }, [stage, ready, shown])

  const look = useMemo<PixelLook>(() => ({
    palette: shown.palette, dither: shown.finish.dither, outline: shown.finish.outline ? darkest(shown.palette) : null, glow: shown.finish.glow,
    edges: shown.finish.edges ? 1 : 0, parts: true, sky: shown.finish.sky ? shown.sky : undefined, steady: STEADY, tidy: true, fine: true, own: true,
  }), [shown])
  useEffect(() => { stage?.setPixels(look, 2) }, [stage, look])
  useEffect(() => { if (stage) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit])
  useWheelZoom(canvas, setOrbit)

  // for the browser checks
  useEffect(() => {
    if (!offscreen || !stage) return
    ;(window as unknown as { __creator: unknown }).__creator = { stage, items: () => shown.items, ready: () => !!done, blobs: () => (ready ? ready.built.reduce((n, b) => n + b.blobs.count, 0) : 0) }
  }, [offscreen, stage, shown, ready, done])

  const blobs = ready ? ready.built.reduce((n, b) => n + b.blobs.count, 0) : 0
  const props = shown.items.filter((i) => i.kind === 'prop').length
  const waiting = !done && !failed

  return (
    <div ref={work} data-full={full || undefined} className={`flex flex-col bg-paper ${full === 'window' ? 'fixed inset-0 z-50' : full ? 'h-full' : 'h-[calc(100svh-3.5rem-1px)] min-h-[34rem]'}`}>
      <div className="flex min-w-0 flex-none items-center gap-x-4 px-4 py-1.5 lg:py-2.5">
        <h1 className="flex-none font-display text-2xl lg:text-3xl">Scene Creator</h1>
        <p className="min-w-0 truncate text-sm text-ink-muted">
          <span className="text-ink">{shown.name}</span>
          {props > 0 && <> · <span className="tabular-nums text-ink" data-testid="creator-prop-count">{props}</span> props</>}
          {blobs > 0 && <span className="max-sm:hidden"> · <span className="tabular-nums">{blobs.toLocaleString()}</span> blobs</span>}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:gap-3 lg:px-4 lg:pb-4">
        <div className="order-3 flex-none lg:order-1 lg:flex lg:flex-col lg:gap-2">
          <ModeBar mode={mode} setMode={setMode} base={base} modes={MODES} label="Scene Creator modes" />
        </div>

        <section aria-label="Tools and settings" className="order-2 flex h-[38%] min-h-0 flex-none flex-col border-t border-rule bg-paper-sunk lg:h-auto lg:w-[22rem] lg:rounded-2xl lg:border">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            {MODES.map((m) => (
              <div key={m.id} role="tabpanel" id={panelId(base, m.id)} aria-labelledby={tabId(base, m.id)} hidden={m.id !== mode} className="space-y-4">
                <h2 className="font-display text-xl max-lg:sr-only">{m.name}</h2>
                <p className="text-sm text-ink-muted">{m.note}</p>
                {m.id === 'scene' && (
                  <>
                    <div className="space-y-2">
                      <button type="button" onClick={() => setPicking(true)} className="flex min-h-11 w-full cursor-pointer items-center justify-center rounded-full border border-accent bg-accent px-4 text-sm font-semibold text-paper hover:brightness-110">Start from a scene</button>
                      {shown.note && <p className="text-sm text-ink-muted" data-testid="creator-whole-note">{shown.note}</p>}
                    </div>
                    <div>
                      <h3 className="mb-2 text-sm font-semibold">Or a bare land</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {START_LANDS.map((l) => {
                          const on = opened.kind === 'project' && 'land' in opened.from && opened.from.land === l.id
                          return (
                            <button key={l.id} type="button" aria-pressed={on} onClick={() => open(openingLand(l.id)!)} className={`cursor-pointer overflow-hidden rounded-lg border text-left text-xs font-semibold transition-colors ${on ? 'border-accent' : 'border-rule hover:border-ink-faint'}`}>
                              <img src={l.picture} alt="" width={320} height={240} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                              <span className="block px-2 py-1">{l.name}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div>
                      <h3 className="mb-2 text-sm font-semibold">Detail</h3>
                      <div className="flex flex-wrap gap-2">
                        {DETAIL.map((d) => <Chip key={d.id} active={d.id === detail} onClick={() => { setDetail(d.id); writeDetail(d.label.toLowerCase()) }}>{d.label}</Chip>)}
                      </div>
                    </div>
                    <div>
                      <h3 id="creator-items" className="mb-2 text-sm font-semibold">In the scene</h3>
                      <ul aria-labelledby="creator-items" className="divide-y divide-rule rounded-lg border border-rule bg-paper text-sm" data-testid="creator-items">
                        {shown.items.map((it, i) => (
                          <li key={i} className="flex items-baseline justify-between gap-2 px-3 py-1.5">
                            <span>{it.name}</span>
                            <span className="text-xs text-ink-muted">{it.kind === 'land' ? 'Land' : it.kind === 'prop' ? 'Prop' : 'Whole scene'}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>

        <section aria-label="Scene" className="relative order-1 min-h-0 flex-1 overflow-hidden bg-paper-sunk lg:order-3 lg:rounded-2xl lg:border lg:border-rule">
          <canvas
            ref={canvas}
            role="application"
            aria-roledescription="3D view"
            aria-label={`${shown.name}: ${shown.items.length === 1 ? 'one piece' : `a land and ${props} props`}, drawn as pixel art. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.`}
            tabIndex={0}
            data-testid="creator-view"
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
          {waiting && <LoadingMark testid="creator-loading" />}
          <p role="status" className="sr-only">{waiting ? `Cutting ${shown.name}` : ''}</p>
          {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(shown.orbit)} />
          <button type="button" aria-label={full ? 'Leave full screen' : 'Full screen'} title={full ? 'Leave full screen' : 'Full screen'} onClick={toggleFull} data-testid="full-screen" className="zoom-btn absolute bottom-2.5 left-2.5">
            <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              {full ? <path d="M6 2.5V6H2.5M10 2.5V6h3.5M6 13.5V10H2.5M10 13.5V10h3.5" /> : <path d="M2.5 6V2.5H6M13.5 6V2.5H10M2.5 10v3.5H6M13.5 10v3.5H10" />}
            </svg>
          </button>
        </section>
      </div>

      <ScenePicker
        open={picking}
        onClose={() => setPicking(false)}
        current={opened.kind === 'whole' ? opened.scene : 'scene' in opened.from ? opened.from.scene : ''}
        onPick={(id) => { setPicking(false); const o = openingScene(id); if (o) open(o) }}
        scenes={START_SCENES.map((d) => ({ id: d.id, label: d.label, about: d.about, loop: true }))}
      />
    </div>
  )
}
