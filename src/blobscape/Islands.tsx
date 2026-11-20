import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import { STEADY, darkest, type PixelLook } from '../splat-core/pixel.ts'
import type { Built } from '../splat-engine/body.ts'
import type { Skeleton } from '../splat-engine/rig.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field, Toggle } from '../shared/ui.tsx'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { detailAsked, labelNames, writeDetail } from '../shared/detail.ts'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import type { CreatureStage } from './creature/stage.ts'
import { DETAIL } from './diorama/scene.ts'
import { described } from './diorama/scenes.ts'
import { download } from './files.ts'
import { BIOMES, biomeOf } from './islands/biomes.ts'
import { MAX_SEED, census, makeIsland } from './islands/island.ts'
import { material } from './islands/materials.ts'
import type { IslandJob } from './islands/cut.worker.ts'
import { unpack, type PackedCut } from './creator/pack.ts'
import { href } from './routes.ts'

const params = () => new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
const media = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches
const css = (c: readonly number[]) => `rgb(${c[0]} ${c[1]} ${c[2]})`
const swung = (orbit: Orbit, swing: number, loop: number, t: number): Orbit => ({ ...orbit, azimuth: orbit.azimuth + Math.sin((t / loop) * Math.PI * 2) * swing })

declare global {
  interface Window { __islands?: { stage: CreatureStage; blobs: () => number; bones: () => number; things: () => string[]; name: () => string } }
}

/**
 * Biome Islands, its first step: one floating island made from a biome recipe and a seed. The island is an ordinary
 * scene description (islands/island.ts), so it is cut, posed and drawn as a Pixel Diorama scene is.
 */
export function Islands() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<CreatureStage>()
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState<string>()
  const offscreen = useMemo(() => params().get('offscreen') === '1', [])
  const coarse = useMemo(() => media('(pointer: coarse)'), [])
  const calm = useMemo(() => media('(prefers-reduced-motion: reduce)'), [])
  const [playing, setPlaying] = useState(!calm)
  const [rock, setRock] = useState(() => params().get('rock') !== '0')

  const [biomeId, setBiomeId] = useState(() => biomeOf(params().get('biome')).id)
  const [seed, setSeed] = useState(() => { const n = Math.floor(Number(params().get('seed'))); return n >= 1 && n <= MAX_SEED ? n : typeof window === 'undefined' ? 1 : 1 + Math.floor(Math.random() * MAX_SEED) })
  const [detail, setDetail] = useState<string>(() => detailAsked(DETAIL, labelNames)?.id ?? (coarse ? 'chunky' : 'medium'))
  const [pixels, setPixels] = useState(() => params().get('style') !== 'blobs')
  const [orbit, setOrbit] = useState<Orbit>({ target: [0, 0, 0], distance: 12.5, azimuth: 24, elevation: 20 })

  // the island: a plan and its description, then the scene Pixel Diorama's own code makes of a description
  const island = useMemo(() => makeIsland(biomeId, seed), [biomeId, seed])
  const scene = useMemo(() => described('island', island.doc, `${island.plan.name}: ${island.biome.about.toLowerCase()}`), [island])
  const lines = useMemo(() => census(island.plan), [island])

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
      }, (e: unknown) => { console.warn(e); setFailed('This browser could not start WebGPU or WebGL 2, which the island needs.') })
    return () => { gone = true; live?.dispose() }
  }, [offscreen])

  // cut in a worker (an island takes seconds), and the island on show stays until the next is ready
  const [made, setMade] = useState<{ built: Built; of: typeof scene; detail: string }>()
  const ready = made?.of === scene && made.detail === detail ? made : undefined
  const worker = useRef<Worker>(undefined)
  useEffect(() => () => worker.current?.terminate(), [])
  useEffect(() => {
    const spacing = DETAIL.find((d) => d.id === detail)!.spacing
    const w = (worker.current ??= new Worker(new URL('./islands/cut.worker.ts', import.meta.url), { type: 'module' }))
    const id = Math.random()
    const heard = (ev: MessageEvent<{ id: number; cut?: PackedCut; error?: string }>) => {
      if (ev.data.id !== id) return
      if (ev.data.cut) setMade({ built: unpack(ev.data.cut), of: scene, detail })
      else setFailed(`The island could not be cut: ${ev.data.error}`)
    }
    w.addEventListener('message', heard)
    w.postMessage({ id, biome: island.plan.biome, seed: island.plan.seed, spacing } satisfies IslandJob)
    return () => w.removeEventListener('message', heard)
  }, [scene, island, detail])

  const orbitNow = useRef(orbit)
  orbitNow.current = orbit
  const rocking = useRef(rock && !calm)
  rocking.current = rock && !calm
  const dressed = useRef<typeof scene | undefined>(undefined)
  useEffect(() => {
    if (!stage || !ready) return
    const d = ready.of
    stage.setActor(ready.built)
    // a new island brings its own starting view; a new detail keeps the view it had
    if (dressed.current !== d) { dressed.current = d; setOrbit(d.views[0].orbit); orbitNow.current = d.views[0].orbit }
    stage.setPoser((sk: Skeleton, t: number) => {
      d.pose(sk, t)
      stage.setLights(d.lights(t, stage.backend === 'webgpu'), 1)
      if (d.swing && rocking.current) stage.orbit = swung(orbitNow.current, d.swing, d.loop, t)
    }, stage.time)
  }, [stage, ready])
  useEffect(() => { if (stage) stage.playing = playing }, [stage, playing])
  useEffect(() => { if (stage) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit, rock])

  // what is in the view now lags the island asked for while it is cut, and keeps its own palette and sky until then
  const shown = made?.of ?? scene
  const look = useMemo<PixelLook | undefined>(() => {
    if (!pixels) return undefined
    const colors = shown.palette.colors
    return { palette: colors, dither: shown.finish.dither, outline: darkest(colors), glow: shown.finish.glow, edges: 1, parts: true, sky: shown.sky, steady: STEADY, tidy: true, fine: true, own: true, surface: true, snap: true }
  }, [pixels, shown])
  useEffect(() => { stage?.setPixels(look, 2) }, [stage, look])

  // the address always names the island on show, so it can be sent to someone
  useEffect(() => {
    const url = new URL(location.href)
    const put = (k: string, v: string | undefined) => { if (v) url.searchParams.set(k, v); else url.searchParams.delete(k) }
    put('biome', BIOMES.length > 1 ? biomeId : undefined); put('seed', String(seed)); put('style', pixels ? undefined : 'blobs'); put('rock', rock ? undefined : '0')
    history.replaceState(history.state, '', url)
  }, [biomeId, seed, pixels, rock])

  // For verify: the stage and the island, without clicking
  useEffect(() => {
    if (!stage || !ready) return
    window.__islands = { stage, blobs: () => stage.blobCount, bones: () => ready.built.skeleton.count, things: () => lines.map((l) => l.words), name: () => island.plan.name }
    return () => { delete window.__islands }
  }, [stage, ready, lines, island])

  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  useWheelZoom(canvas, setOrbit)
  const another = () => setSeed(1 + Math.floor(Math.random() * MAX_SEED))
  const save = () => download(new TextEncoder().encode(JSON.stringify(island.doc, null, 1)), `${island.plan.biome}-island-${seed}.json`, 'application/json')
  const waiting = !failed && (!drawn || !ready)
  const backend = stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'
  const summary = `${island.plan.name}, with ${lines.map((l) => l.words).join(', ')}`
  const used = useMemo(() => [...new Set([island.biome.ground.top, island.biome.ground.soil, island.plan.rock, ...island.plan.things.flatMap((t) => Object.values(t.made))])].map(material), [island])

  return (
    <div className="pb-4">
      <Crumbs here="Biome Islands" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Biome Islands</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          A floating island grown from a recipe and a number. The recipe says what kind of place it is and what it is made of; the number
          decides the rest. This is an early step of a sky world you will be able to walk across: one island to look at, from one of three biomes.
        </p>
      </header>
      <Workbench
        viewLabel="The island"
        view={<>
          {!pixels && <div aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(${css(shown.sky[0])}, ${css(shown.sky[1])})` }} />}
          <canvas
            ref={canvas}
            role="application"
            aria-roledescription="3D view"
            aria-label={`${summary}. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.`}
            tabIndex={0}
            data-testid="islands-view"
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
          {waiting && <LoadingMark testid="islands-loading" />}
          <p role="status" className="sr-only">{waiting ? (stage ? 'Growing the island…' : 'Starting the splat engine…') : `${summary}.`}</p>
          {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
          <div className="absolute top-3 left-3 max-sm:top-2 max-sm:left-2">
            <Button small primary onClick={another} data-testid="islands-another">Another island</Button>
          </div>
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(shown.views[0].orbit)} />
        </>}
        status={<>
          <span><span className="text-ink" data-testid="islands-name">{island.plan.name}</span></span>
          <span>{ready && <><span className="tabular-nums text-ink">{island.plan.things.length}</span> things, <span className="tabular-nums text-ink" data-testid="islands-blobs">{ready.built.blobs.count.toLocaleString()}</span> blobs</>}</span>
        </>}
        tabsLabel="Options"
        tabs={[
          {
            id: 'island', label: 'Island', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Biome">
                  <div className="flex flex-wrap gap-1.5">
                    {BIOMES.map((b) => <Chip key={b.id} active={biomeId === b.id} onClick={() => setBiomeId(b.id)}>{b.name}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">{island.biome.about}. More biomes are on the way.</p>
                </Field>
                <div>
                  <label className="grid gap-1 text-sm">
                    <span className="font-bold">Island number</span>
                    <input
                      type="number" min={1} max={MAX_SEED} value={seed} data-testid="islands-seed"
                      onChange={(ev) => { const n = Math.floor(Number(ev.target.value)); if (n >= 1 && n <= MAX_SEED) setSeed(n) }}
                      className="w-36 rounded-lg border border-rule bg-paper px-2.5 py-1.5 tabular-nums text-ink"
                    />
                  </label>
                  <p className="mt-1.5 text-xs text-ink-faint">The same number always grows the same island. The address names it, so you can send it to someone.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button primary onClick={another}>Another island</Button>
                  <Button onClick={save} data-testid="islands-save">Save its description</Button>
                </div>
                <p className="text-xs text-ink-faint">
                  The saved file opens in <a href={href({ page: 'creator' })} className="underline decoration-rule underline-offset-2 hover:text-accent">Scene Creator</a> (Scene, Open a file), where its first 40 trees and stones are props you can move, and
                  in <a href={href({ page: 'diorama' })} className="underline decoration-rule underline-offset-2 hover:text-accent">Pixel Diorama</a>.
                </p>
              </div>
            ),
          },
          {
            id: 'view', label: 'View', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Drawn as">
                  <div className="flex flex-wrap gap-1.5">
                    <Chip active={pixels} onClick={() => setPixels(true)}>Pixel art</Chip>
                    <Chip active={!pixels} onClick={() => setPixels(false)}>Blobs</Chip>
                  </div>
                </Field>
                <Field label="Detail">
                  <div className="flex flex-wrap gap-1.5">
                    {DETAIL.map((d) => <Chip key={d.id} active={detail === d.id} onClick={() => { setDetail(d.id); writeDetail(d.id) }}>{d.label}</Chip>)}
                  </div>
                </Field>
                <div className="grid gap-3">
                  <Toggle label="Rock the view" checked={rock} onChange={setRock} />
                  <div><Button small onClick={() => setPlaying((p) => !p)}>{playing ? 'Hold still' : 'Let it move'}</Button></div>
                </div>
              </div>
            ),
          },
        ]}
      />

      <section aria-labelledby="on-title" className="mt-10 rounded-2xl border border-rule bg-paper-sunk/60 px-5 py-5" data-testid="islands-list">
        <h2 id="on-title" className="font-display text-2xl">On this island</h2>
        <div className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-bold">Kinds of place on it</h3>
            <ul className="mt-1 grid gap-0.5 text-sm text-ink">{island.plan.patches.map((p) => <li key={p.name}>{p.name[0].toUpperCase() + p.name.slice(1)}</li>)}</ul>
            <h3 className="mt-4 text-sm font-bold">What stands on it</h3>
            <ul className="mt-1 grid gap-0.5 text-sm text-ink">{lines.map((l) => <li key={l.words}>{l.words}</li>)}</ul>
          </div>
          <div>
            <h3 className="text-sm font-bold">What it is made of</h3>
            <ul className="mt-1 grid gap-1 text-sm text-ink">
              {used.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <span aria-hidden className="flex overflow-hidden rounded border border-rule">{m.ramp.map((c) => <span key={c} className="h-4 w-4" style={{ background: c }} />)}</span>
                  {m.name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section aria-labelledby="how-title" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-sm text-ink-faint">How it's made</p>
          <h2 id="how-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">A recipe, a number and a library of materials</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            A biome is a recipe written as data: how hilly the land is, what the ground, earth and rock are made of, which things live
            there, how many, whether each likes high ground or low, and the kinds of place inside an island (an oak grove, a flower glade, a
            stony rise) that each thing crowds into. The island's number picks everything the recipe leaves open: the outline, where the hills
            rise, where those places lie, where the path runs past its two landmarks, and where each tree and stone stands so that none crowds another.
          </p>
          <p>
            Nothing carries its own paint. A recipe names materials from one library (oak, birch, granite, loam, meadow turf), and each
            material knows its colors from shade to light, how they lie on a surface, and the marks drawn over it. The number leans
            each one a little lighter or darker, so two oaks are never quite the same. The library also knows what lets light through
            (ice, water, cloud) and what does not, and everything that should be solid is cut so that it is: a test looks at every island's
            ground, rock and stones from above, beside and below and fails if more than one part in fifty shows what lies behind.
          </p>
          <p>
            The result is an ordinary scene description, the same kind every <a href={href({ page: 'diorama' })} className="underline decoration-rule underline-offset-2 hover:text-accent">Pixel Diorama</a> scene
            is written as, with every thing on it marked as a prop. Blobscape's own splat engine cuts it into blobs and draws it here on {backend}.
            The idea of worlds made from biome recipes comes from Silicon Jungle's Ink Studio.
          </p>
        </div>
      </section>
    </div>
  )
}
