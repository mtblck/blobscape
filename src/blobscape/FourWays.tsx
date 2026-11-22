import { useEffect, useMemo, useRef, useState } from 'react'
import { STAGE_FOV, type Orbit } from '../splat-core/orbit.ts'
import { STEADY, countColors, darkest, type PixelLook } from '../splat-core/pixel.ts'
import { useStyleOnStage } from './useStyleOnStage.ts'
import type { Built } from '../splat-engine/body.ts'
import type { Skeleton } from '../splat-engine/rig.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field, Slider, Toggle } from '../shared/ui.tsx'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import type { CreatureStage } from './creature/stage.ts'
import { Finisher } from './fourways/finish.ts'
import { PANELS, WORDS, type PanelId } from './fourways/panels.ts'
import { SCENES, sceneOf, type Drawn } from './fourways/scenes.ts'
import { written } from './fourways/sources.ts'
import type { SplatPanel } from './fourways/splats.ts'
import { href } from './routes.ts'

type Others = Exclude<PanelId, 'blobscape'>

declare global {
  interface Window {
    __four?: {
      stage?: CreatureStage
      /** Draws all four at `t` seconds and waits for each: for checks, with `?offscreen=1`. */
      frame(t: number): Promise<Record<string, number>>
      /** A panel's finished picture: its size, how many pixels the scene covers, and how many colors it uses. */
      art(id: Others): { width: number; height: number; cover: number; light: number; colors: number } | undefined
      /** Sets the Fire slider. */
      setFire(v: number): void
      ready(): PanelId[]
    }
  }
}

const params = () => new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
const media = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches
/** Art pixels across one panel: the choices on the Pixels tab. */
/** How fast blobs in the way dim the wisp's light: fur and grass are thin, so less than the engine's own setting, or a coat shades itself dark. */
const SHADOW_DENSITY = 0.5
const ACROSS = [{ id: 'chunky', label: 'Chunky', across: 128 }, { id: 'medium', label: 'Medium', across: 176 }, { id: 'fine', label: 'Fine', across: 240 }]
const ms = (v: number) => (v < 10 ? `${v.toFixed(1)} ms` : `${Math.round(v)} ms`)
/** How many frames a second a panel could draw by itself, from the time one frame takes: the screen may show fewer. */
const rate = (v: number) => { const f = 1000 / Math.max(v, 0.01); return f >= 100 ? Math.round(f / 10) * 10 : f >= 10 ? Math.round(f) : Number(f.toFixed(1)) }
const fps = (v: number | undefined) => (v === undefined ? 'not timed yet' : `up to ${rate(v).toLocaleString()} fps`)

/**
 * One Scene, Four Ways: Diorama's campfire drawn by four different things at once, each given the same
 * pixel-art finish: a shader written with no engine, three.js meshes, Spark's splats and Blobscape. One clock, one
 * camera and one fire slider drive all four, so what each can and cannot do shows side by side.
 */
export function FourWays() {
  const h1 = useFocusHeading()
  const grid = useRef<HTMLDivElement>(null)
  const cell = useRef<HTMLDivElement>(null)
  const stageCanvas = useRef<HTMLCanvasElement>(null)
  const canvases = useRef<Partial<Record<Others, HTMLCanvasElement | null>>>({})
  const offscreen = useMemo(() => params().get('offscreen') === '1', [])
  const coarse = useMemo(() => media('(pointer: coarse)'), [])
  const calm = useMemo(() => media('(prefers-reduced-motion: reduce)'), [])
  const [stage, setStage] = useState<CreatureStage>()
  const [stageFailed, setStageFailed] = useState(false)
  const [drawn, setDrawn] = useState(false)
  const [built, setBuilt] = useState<{ built: Built; seconds: number; scene: typeof scene }>()
  const [panels, setPanels] = useState<Partial<Record<Others, Drawn>>>({})
  const [failed, setFailed] = useState<Partial<Record<Others, boolean>>>({})
  const [playing, setPlaying] = useState(!calm)
  const [scene, setScene] = useState(() => sceneOf(params().get('scene')))
  const [fire, setFire] = useState(() => { const q = Number(params().get('fire') ?? 1); return q >= 0 && q <= 2 ? q : 1 })
  // a phone shows one at a time, Blobscape first: four renderers at once were more than Matt's could run (2026-11-18)
  const [only, setOnly] = useState<PanelId | 'all'>(() => PANELS.find((p) => p.id === params().get('only'))?.id ?? (coarse ? 'blobscape' : 'all'))
  const [across, setAcross] = useState(ACROSS[2].id)
  const [outline, setOutline] = useState(true)
  const [steady, setSteady] = useState(true)
  const [orbit, setOrbit] = useState<Orbit>(scene.orbit)
  const [timings, setTimings] = useState<Partial<Record<PanelId, number>>>({})
  /** One panel's size on the page, in CSS pixels. */
  const [box, setBox] = useState<{ width: number; height: number }>()

  const look = useMemo<PixelLook>(() => ({
    ...scene.look, outline: outline ? darkest(scene.palette) : null, steady: steady ? STEADY : 0, tidy: true, fine: true, own: true, parts: false,
  }), [scene, outline, steady])

  // how big one art pixel is: a whole number of device pixels, so every panel's pixels are the same size
  const ratio = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1)
  const want = ACROSS.find((a) => a.id === across)!.across
  const scale = box ? Math.max(1, Math.round((box.width * ratio) / want)) : 1
  const planned = useMemo(() => (box ? { width: Math.ceil(Math.floor(box.width * ratio) / scale), height: Math.ceil(Math.floor(box.height * ratio) / scale) } : undefined), [box, ratio, scale])

  useEffect(() => {
    const el = cell.current
    if (!el) return
    const read = () => { const w = el.clientWidth, h = el.clientHeight; if (w && h) setBox((b) => (b && b.width === w && b.height === h ? b : { width: w, height: h })) }
    const watch = new ResizeObserver(read)
    watch.observe(el)
    read()
    return () => watch.disconnect()
  }, [only])

  // Blobscape's stage
  useEffect(() => {
    let live: CreatureStage | undefined, gone = false
    import('./creature/stage.ts')
      .then(({ CreatureStage }) => CreatureStage.start(stageCanvas.current!, { offscreen, lights: true, webgl: params().get('webgl') === '1', shadowDensity: Number(params().get('density') ?? SHADOW_DENSITY) }))
      .then((s) => {
        if (gone) { s.dispose(); return }
        live = s
        s.onFirstFrame = () => setDrawn(true)
        s.setFloor(0)
        setStage(s)
      }, (e: unknown) => { console.warn(e); setStageFailed(true) })
    return () => { gone = true; live?.dispose() }
  }, [offscreen])

  // The two that are written by hand need nothing made first: they start at once
  useEffect(() => {
    let gone = false
    const mine: Drawn[] = []
    const start = (id: Others, make: () => Promise<Drawn>) => make().then((p) => {
      if (gone) { p.dispose(); return }
      mine.push(p)
      setPanels((all) => ({ ...all, [id]: p }))
    }, (e: unknown) => { console.warn(e); if (!gone) setFailed((f) => ({ ...f, [id]: true })) })
    void start('shader', scene.shader)
    void start('meshes', scene.meshes)
    return () => { gone = true; for (const p of mine) p.dispose(); setPanels((all) => ({ splats: all.splats })); setFailed((f) => ({ splats: f.splats })) }
  }, [scene])

  // The scene is cut into blobs once, after a paint so the waiting mark shows: Blobscape and Spark both draw them
  useEffect(() => {
    const id = setTimeout(() => {
      const t0 = performance.now()
      const made = scene.build(coarse)
      setBuilt({ built: made, seconds: (performance.now() - t0) / 1000, scene })
    }, 80)
    return () => { clearTimeout(id); setBuilt(undefined) }
  }, [scene, coarse])

  useEffect(() => {
    if (!built) return
    let gone = false, mine: SplatPanel | undefined
    import('./fourways/splats.ts').then(({ SplatPanel }) => SplatPanel.start(built.built, built.scene)).then((p) => {
      if (gone) { p.dispose(); return }
      mine = p
      setPanels((all) => ({ ...all, splats: p }))
    }, (e: unknown) => { console.warn(e); if (!gone) setFailed((f) => ({ ...f, splats: true })) })
    return () => { gone = true; mine?.dispose(); setPanels((all) => ({ ...all, splats: undefined })) }
  }, [built])

  // one clock for all four: the page's own, so the others still play where the engine cannot start
  const clock = useRef({ t: 0, last: 0 })
  const fireNow = useRef(fire)
  fireNow.current = fire
  const orbitNow = useRef(orbit)
  orbitNow.current = orbit

  useEffect(() => {
    if (!stage || !built) return
    stage.setActor(built.built)
    const cast = built.scene.shadows && stage.backend === 'webgpu' && params().get('shadows') !== '0'
    stage.setPoser((sk: Skeleton, t: number) => {
      built.scene.pose(built.built, sk, t)
      stage.setLights(built.scene.lights(t, fireNow.current, cast), built.scene.ambient)
    }, clock.current.t)
  }, [stage, built])
  useStyleOnStage(stage, { pixels: true, look, size: scale / ratio })
  // Blobscape draws only while its picture is on show: hidden, the page's clock runs on for the others, and the stage
  // takes that time up again when it comes back
  const blobscapeShown = only === 'all' || only === 'blobscape'
  useEffect(() => {
    if (!stage) return
    if (blobscapeShown) stage.seek(clock.current.t)
    stage.playing = playing && blobscapeShown
  }, [stage, playing, blobscapeShown])
  // the fire's brightness shows at once, playing or not
  useEffect(() => { if (stage && built) stage.setLights(built.scene.lights(stage.time, fire, built.scene.shadows && stage.backend === 'webgpu'), built.scene.ambient) }, [stage, built, fire])
  useEffect(() => {
    if (!stage) return
    stage.orbit = orbit
    const h = scene.haze
    stage.setFog(h?.color ?? [0, 0, 0], h ? orbit.distance + h.from : 0, h ? orbit.distance + h.to : 0)
    stage.invalidate()
  }, [stage, orbit, scene])

  const finishers = useRef<Record<Others, Finisher>>({ shader: new Finisher(), meshes: new Finisher(), splats: new Finisher() })
  const spent = useRef<Partial<Record<PanelId, number>>>({})
  /** Draws one of the page's own three panels at `t` and finishes it; gives the milliseconds the drawing took. */
  const drawOne = (id: Others, t: number) => {
    const p = panels[id], canvas = canvases.current[id]
    // the engine's own picture says the size once it has drawn; until then, the size the page worked out for it
    const art = (shown('blobscape') && stage?.artSize) || planned
    if (!p || !canvas || !art) return
    const t0 = performance.now()
    const px = p.draw(t, orbitNow.current, art.width * 2, art.height * 2, fireNow.current, STAGE_FOV)
    const took = performance.now() - t0
    spent.current[id] = spent.current[id] === undefined ? took : spent.current[id]! * 0.9 + took * 0.1
    finishers.current[id].finish(px, art.width * 2, art.height * 2, look, id === 'splats')
    finishers.current[id].show(canvas)
  }
  const shown = (id: PanelId) => only === 'all' || only === id

  // The live loop: every frame, the same moment in all four
  useEffect(() => {
    if (offscreen) return
    let raf = 0, was = '', timing = false, lastTimed = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const c = clock.current
      const dt = c.last ? Math.min(0.1, (now - c.last) / 1000) : 0
      c.last = now
      // the engine keeps the time while it is running, so its own picture and the others never drift apart
      if (stage && built && shown('blobscape')) c.t = stage.time
      else if (playing) c.t += dt
      if (document.hidden || timing) return
      const o = orbitNow.current
      const key = `${c.t}|${o.azimuth}|${o.elevation}|${o.distance}|${o.target}|${fireNow.current}|${planned?.width}|${stage?.artSize?.height}`
      const sorting = !!(panels.splats as SplatPanel | undefined)?.sorting
      if (key === was && !sorting) return
      was = key
      for (const id of ['shader', 'meshes', 'splats'] as const) if (shown(id)) drawOne(id, c.t)
      // Blobscape draws in its own loop, so it is timed apart, once a second, with the others held still
      if (stage && built && shown('blobscape') && now - lastTimed > 1000) {
        lastTimed = now
        timing = true
        // several frames to one wait where a frame is quick (see `timed`), one where it is slow
        stage.timed((spent.current.blobscape ?? 100) > 25 ? 1 : 8).then((took) => { spent.current.blobscape = spent.current.blobscape === undefined ? took : spent.current.blobscape * 0.7 + took * 0.3 }, () => {}).finally(() => { timing = false })
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offscreen, stage, built, panels, planned, look, playing, only])
  // a new look or size starts steady pixels afresh
  useEffect(() => { for (const f of Object.values(finishers.current)) f.reset() }, [look, planned])
  useEffect(() => {
    const id = setInterval(() => setTimings({ ...spent.current }), 700)
    return () => clearInterval(id)
  }, [])

  // For verify: every panel drawn at one moment, and what came out
  useEffect(() => {
    window.__four = {
      stage,
      frame: async (t) => {
        clock.current.t = t
        const took: Record<string, number> = {}
        let t0 = performance.now()
        if (stage) { await stage.frame(t) }
        took.blobscape = performance.now() - t0
        for (const id of ['shader', 'meshes', 'splats'] as const) {
          t0 = performance.now()
          drawOne(id, t)
          // Spark sorts in a worker and shows the new order a draw later
          const p = panels[id] as SplatPanel | undefined
          for (let k = 0; id === 'splats' && p && k < 40 && (k < 2 || p.sorting); k++) { await new Promise((r) => setTimeout(r, 20)); drawOne(id, t) }
          took[id] = performance.now() - t0
        }
        return took
      },
      art: (id) => {
        const a = finishers.current[id].art
        if (!a) return
        return { width: a.width, height: a.height, cover: finishers.current[id].cover, light: finishers.current[id].light, colors: countColors(a) }
      },
      setFire,
      ready: () => [...(stage && built && (drawn || offscreen) ? ['blobscape' as const] : []), ...(Object.keys(panels) as Others[])],
    }
    return () => { delete window.__four }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, built, drawn, panels, planned, look])

  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  useWheelZoom(grid, setOrbit)
  const backend = stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'
  const waiting = (id: PanelId) => (id === 'blobscape' ? !stageFailed && (!drawn || !built) : !failed[id] && !panels[id])
  const sky = `linear-gradient(${scene.look.sky ? `rgb(${scene.look.sky[0].join(' ')}), rgb(${scene.look.sky[1].join(' ')})` : '#0a0f1e, #1f2d55'})`
  const facts = written(scene.id)
  const words = WORDS[scene.id]
  // the stage says it has drawn only once, so `drawn` stays: the wait for the next scene is the wait for `built`
  const pick = (next: typeof scene) => { if (next === scene) return; setScene(next); setOrbit(next.orbit) }

  return (
    <div className="pb-4">
      <Crumbs here="One Scene, Four Ways" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">One Scene, Four Ways</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          {scene.intro} All four get the same pixel-art finish, so what you see is how each one makes a picture.
        </p>
      </header>
      <Workbench
        viewLabel="The four pictures"
        view={<>
          <div
            ref={grid}
            role="application"
            aria-roledescription="3D view"
            aria-label={`${scene.viewLabel} Drag or use the arrow keys to orbit all four; scroll, pinch or press plus and minus to zoom.`}
            tabIndex={0}
            data-testid="four-view"
            className={`absolute inset-0 grid cursor-grab touch-none gap-px bg-black pr-12 sm:pl-12 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset active:cursor-grabbing ${only === 'all' ? 'grid-cols-2 grid-rows-2' : 'grid-cols-1'}`}
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
          >
            {PANELS.map((p, i) => (
              <div key={p.id} ref={shown(p.id) && (only !== 'all' || i === 0) ? cell : undefined} hidden={!shown(p.id)} data-testid={`four-${p.id}`} className="relative min-h-0 min-w-0 overflow-hidden" style={{ background: sky }}>
                {p.id === 'blobscape'
                  ? <canvas ref={stageCanvas} aria-hidden className="absolute inset-0 h-full w-full" />
                  : <canvas ref={(el) => { canvases.current[p.id as Others] = el }} aria-hidden className="absolute inset-0 h-full w-full [image-rendering:pixelated]" />}
                {waiting(p.id) && <LoadingMark testid={`four-${p.id}-loading`} />}
                {(p.id === 'blobscape' ? stageFailed : failed[p.id as Others]) && <p className="absolute inset-3 grid place-items-center text-center text-xs text-white">This browser could not start {p.id === 'blobscape' ? 'WebGPU or WebGL 2' : 'WebGL 2'} for this one.</p>}
                <p className="pointer-events-none absolute top-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-xs leading-tight text-white max-sm:top-1 max-sm:left-1">
                  <span className="block font-medium">{p.label}</span>
                  <span className="block tabular-nums text-white/75 max-sm:hidden" data-testid={`four-${p.id}-ms`}>{fps(timings[p.id])}</span>
                </p>
              </div>
            ))}
          </div>
          <p role="status" className="sr-only">{PANELS.some((p) => waiting(p.id)) ? `Still starting: ${PANELS.filter((p) => waiting(p.id)).map((p) => p.label).join(', ')}.` : 'All four are drawing.'}</p>
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(scene.orbit)} />
        </>}
        status={<>
          <span>{built ? <><span className="tabular-nums text-ink" data-testid="four-blobs">{built.built.blobs.count.toLocaleString()}</span> blobs, made in {built.seconds.toFixed(1)} s, for Blobscape and Spark{built.scene.made(built.built) ? `: ${built.scene.made(built.built)}` : ''}.</> : 'Making the scene’s blobs…'}</span>
          <span>{planned ? `Each picture ${planned.width} × ${planned.height}, ${scene.palette.length} colors` : ''}</span>
        </>}
        tabsLabel="Options"
        tabs={[
          {
            id: 'compare', label: 'Compare', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Scene">
                  <div className="flex flex-wrap gap-1.5" data-testid="four-scene">
                    {SCENES.map((sc) => <Chip key={sc.id} active={scene === sc} onClick={() => pick(sc)}>{sc.label}</Chip>)}
                  </div>
                </Field>
                <Field label="Show">
                  <div className="flex flex-wrap gap-1.5" data-testid="four-show">
                    {!coarse && <Chip active={only === 'all'} onClick={() => setOnly('all')}>All four</Chip>}
                    {PANELS.map((p) => <Chip key={p.id} active={only === p.id} onClick={() => setOnly(p.id)}>{p.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">The speed on each picture is how many frames a second it could draw by itself here, before the shared finish. {coarse ? 'A phone shows one at a time: four renderers at once are too much for it. Open the page on a computer to see them side by side.' : 'With all four drawing they share this device.'}</p>
                </Field>
                <div data-testid="four-fire">
                  <Slider label={scene.slider.label} value={fire} min={0} max={2} step={0.05} onChange={setFire} format={(v) => `${Math.round(v * 100)}%`} hint={scene.slider.hint} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button small onClick={() => setPlaying((p) => !p)}>{playing ? 'Stop' : 'Play'}</Button>
                  <Button small onClick={() => setOrbit(scene.orbit)}>Reset the view</Button>
                </div>
              </div>
            ),
          },
          {
            id: 'pixels', label: 'Pixels', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Pixel size">
                  <div className="flex flex-wrap gap-1.5" data-testid="four-across">
                    {ACROSS.map((a) => <Chip key={a.id} active={across === a.id} onClick={() => setAcross(a.id)}>{a.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">The same for all four, with the scene’s own palette and Diorama’s dither.</p>
                </Field>
                <Toggle label="Outline" checked={outline} onChange={setOutline} />
                <div>
                  <Toggle label="Steady pixels" checked={steady} onChange={setSteady} />
                  <p className="mt-1.5 text-xs text-ink-faint">A pixel keeps its color unless another is clearly closer, so a light can flicker or move without the whole picture crawling.</p>
                </div>
              </div>
            ),
          },
        ]}
      />

      <section aria-labelledby="ways-title" className="mt-14 border-t border-rule pt-10 lg:pt-14">
        <p className="text-sm text-ink-faint">What each one is</p>
        <h2 id="ways-title" className="mt-1 max-w-[20ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">Four honest tries at {scene.subject}</h2>
        <p className="mt-4 max-w-[40em] text-lg leading-relaxed text-ink-muted">
          Each one is built the way it would be if you asked for this scene with that tool, and each is given a fair go: none is
          held back to make another look good. They run on {backend} for Blobscape and WebGL 2 for the rest.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {PANELS.map((p) => (
            <article key={p.id} className="rounded-2xl border border-rule bg-paper-sunk/60 p-5" data-testid={`four-card-${p.id}`}>
              <h3 className="font-display text-2xl">{p.label}</h3>
              <p className="mt-1 text-ink-muted">{words[p.id].what}</p>
              <dl className="mt-4 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[7.5rem_1fr]">
                <dt className="text-ink-faint">Real time</dt><dd>{words[p.id].realTime}</dd>
                <dt className="text-ink-faint">What moves</dt><dd>{words[p.id].moves}</dd>
                <dt className="text-ink-faint">The light</dt><dd>{words[p.id].light}</dd>
                <dt className="text-ink-faint">Written as</dt><dd>{facts[p.id]}</dd>
                <dt className="text-ink-faint">Speed here</dt><dd className="tabular-nums">{timings[p.id] === undefined ? 'not timed yet' : `${fps(timings[p.id])} drawn alone (${ms(timings[p.id]!)} a frame)`}{p.id === 'blobscape' && built ? `, after ${built.seconds.toFixed(1)} s making the scene` : ''}</dd>
                <dt className="text-ink-faint">What you keep</dt><dd>{words[p.id].keep}</dd>
                <dt className="text-ink-faint">Where it stops</dt><dd>{words[p.id].limit}</dd>
              </dl>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
