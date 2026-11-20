import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import { STEADY, darkest, type PixelLook } from '../splat-core/pixel.ts'
import type { Built } from '../splat-engine/body.ts'
import type { Skeleton } from '../splat-engine/rig.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field, Slider, Toggle } from '../shared/ui.tsx'
import { BLOCK_SIZES, BLOCK_START, blockLook } from './blockLooks.ts'
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
import { Stick } from './Stick.tsx'
import { steer, type Input } from './pond/wade.ts'
import { SCALE, type IslandWalk } from './islands/walk.ts'
import { colorsOf } from './creator/cut.ts'
import { joinPalettes } from '../splat-engine/project.ts'

const params = () => new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
const media = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches
const css = (c: readonly number[]) => `rgb(${c[0]} ${c[1]} ${c[2]})`
const swung = (orbit: Orbit, swing: number, loop: number, t: number): Orbit => ({ ...orbit, azimuth: orbit.azimuth + Math.sin((t / loop) * Math.PI * 2) * swing })
/** The island stands `SCALE` times its written size, in meters beside the elf; the page keeps its view in the island's own units. */
const inMeters = (o: Orbit): Orbit => ({ ...o, target: [o.target[0] * SCALE, o.target[1] * SCALE, o.target[2] * SCALE], distance: o.distance * SCALE })
/** How the view starts behind the elf when it starts walking, in the island's units (9 meters off). */
const BEHIND = { distance: 1.8, elevation: 20 }
/** How fast the view catches up with the elf, a second. */
const FOLLOW = 5
const DEG = 180 / Math.PI

declare global {
  interface Window { __islands?: { stage: CreatureStage; blobs: () => number; bones: () => number; things: () => string[]; name: () => string; walk: () => IslandWalk | undefined } }
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
  // how the island is drawn: built from blocks (Matt, 2026-11-20: the style to drive these islands), as pixel art, or as the blobs themselves
  const [style, setStyle] = useState<'blocks' | 'pixel' | 'blobs'>(() => { const s = params().get('style'); return s === 'pixel' || s === 'blobs' ? s : 'blocks' })
  const pixels = style === 'pixel', blocky = style === 'blocks'
  const [blockSize, setBlockSize] = useState(() => { const v = Math.round(Number(params().get('block'))); return v >= BLOCK_SIZES.min && v <= BLOCK_SIZES.max ? v : BLOCK_START.size })
  const [orbit, setOrbit] = useState<Orbit>({ target: [0, 0, 0], distance: 12.5, azimuth: 24, elevation: 20 })
  const [walking, setWalking] = useState(() => params().get('walk') === '1')

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
  const [made, setMade] = useState<{ built: Built; of: typeof scene; detail: string; plain: boolean }>()
  const ready = made?.of === scene && made.detail === detail && made.plain === blocky ? made : undefined
  const worker = useRef<Worker>(undefined)
  useEffect(() => () => worker.current?.terminate(), [])
  useEffect(() => {
    const spacing = DETAIL.find((d) => d.id === detail)!.spacing
    const w = (worker.current ??= new Worker(new URL('./islands/cut.worker.ts', import.meta.url), { type: 'module' }))
    const id = Math.random()
    const heard = (ev: MessageEvent<{ id: number; cut?: PackedCut; error?: string }>) => {
      if (ev.data.id !== id) return
      if (ev.data.cut) setMade({ built: unpack(ev.data.cut), of: scene, detail, plain: blocky })
      else setFailed(`The island could not be cut: ${ev.data.error}`)
    }
    w.addEventListener('message', heard)
    w.postMessage({ id, biome: island.plan.biome, seed: island.plan.seed, spacing, plain: blocky } satisfies IslandJob)
    return () => w.removeEventListener('message', heard)
  }, [scene, island, detail, blocky])

  const orbitNow = useRef(orbit)
  orbitNow.current = orbit
  const rocking = useRef(rock && !calm)
  rocking.current = rock && !calm
  const dressed = useRef<typeof scene | undefined>(undefined)
  // the elf, made once an island is cut (it takes a moment, so the waiting mark shows first) and again for a new island
  const [walk, setWalk] = useState<{ walk: IslandWalk; of: Built }>()
  const walker = walking && walk && walk.of === ready?.built ? walk.walk : undefined
  useEffect(() => {
    if (!walking || !ready || walk?.of === ready.built) return
    let gone = false
    const spacing = DETAIL.find((d) => d.id === ready.detail)!.spacing
    const timer = setTimeout(() => {
      import('./islands/walk.ts').then(({ IslandWalk }) => {
        if (gone) return
        const w = new IslandWalk(island.doc, island.plan, spacing, { blobs: coarse ? 10000 : 16000 })
        // the view starts behind the elf, looking the way it faces
        setOrbit((o) => ({ ...o, ...BEHIND, azimuth: w.walker.heading * DEG + 180 }))
        setWalk({ walk: w, of: ready.built })
      })
    }, 30)
    return () => { gone = true; clearTimeout(timer) }
  }, [walking, ready, walk, island, coarse])

  // keys and the thumb stick both steer the elf by the picture: up is away from you, whichever way it faces
  const keys = useRef(new Set<string>())
  const stick = useRef({ forward: 0, turn: 0 })
  const input = useRef<Input>({ forward: 0, turn: 0 })
  const push = () => {
    const k = keys.current
    const y = (k.has('f') ? 1 : 0) - (k.has('b') ? 1 : 0) + stick.current.forward
    const x = (k.has('r') ? 1 : 0) - (k.has('l') ? 1 : 0) + stick.current.turn
    input.current = { forward: 0, turn: 0, stick: { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) } }
  }
  const walkNow = useRef(walker)
  walkNow.current = walker
  useEffect(() => {
    const KEYS: Record<string, string> = { ArrowUp: 'f', KeyW: 'f', ArrowDown: 'b', KeyS: 'b', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' }
    // keys move the elf from anywhere on the page, except where they already mean something (typing, a slider, tabs)
    const mine = (e: KeyboardEvent) => {
      const t = e.target
      return !(t instanceof HTMLElement && (t.isContentEditable || t.closest('input, textarea, select, [role=tab], [role=slider]')))
    }
    const down = (e: KeyboardEvent) => {
      if (!walkNow.current || e.metaKey || e.ctrlKey || e.altKey || !mine(e)) return
      if (e.code === 'KeyE') { walkNow.current.wave(); return }
      const k = KEYS[e.code]
      if (!k) return
      e.preventDefault()
      keys.current.add(k)
      push()
    }
    const up = (e: KeyboardEvent) => { const k = KEYS[e.code]; if (k && keys.current.delete(k)) push() }
    const clear = () => { keys.current.clear(); stick.current = { forward: 0, turn: 0 }; push() }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!stage || !ready) return
    const d = ready.of
    stage.setActor(ready.built, undefined, walker ? [walker.elf] : [])
    // a new island brings its own starting view; a new detail keeps the view it had
    if (dressed.current !== d) { dressed.current = d; if (!walker) { setOrbit(d.views[0].orbit); orbitNow.current = d.views[0].orbit } }
    let last = stage.time, eye: number[] | undefined
    stage.setPoser((sk: Skeleton, t: number) => {
      d.pose(sk, calm ? 0 : t)
      sk.rootScale = SCALE
      sk.update()
      stage.setLights(d.lights(t, stage.backend === 'webgpu'), 1)
      if (walker) {
        const dt = Math.max(0, Math.min(0.1, t - last))
        last = t
        // the stick steers by the view as it stands: up on it is away from the camera
        const o = orbitNow.current, way = (o.azimuth / DEG) + Math.PI
        const i = input.current
        walker.update(dt, i.stick && (i.stick.x || i.stick.y) ? { forward: 0, turn: 0, ...steer(i.stick, way) } : { forward: 0, turn: 0 })
        // the view follows the elf, catching up rather than jumping
        const m = walker.middle, k = eye ? 1 - Math.exp(-dt * FOLLOW) : 1
        eye = eye ? eye.map((v, j) => v + (m[j] - v) * k) : m
        stage.orbit = { ...inMeters(o), target: [eye[0], eye[1], eye[2]] }
      } else if (d.swing && rocking.current) stage.orbit = inMeters(swung(orbitNow.current, d.swing, d.loop, t))
    }, stage.time)
  }, [stage, ready, walker, calm])
  // walking needs the clock to run, whether or not the island's own moves do
  useEffect(() => { if (stage) stage.playing = playing || !!walker }, [stage, playing, walker])
  useEffect(() => { if (stage) { if (!walkNow.current) stage.orbit = inMeters(orbit); stage.invalidate() } }, [stage, orbit, rock])

  // what is in the view now lags the island asked for while it is cut, and keeps its own palette and sky until then
  const shown = made?.of ?? scene
  // the elf is made with its colors baked in: the island's palette gains the ones it lacks
  const elfColors = useMemo(() => (walker ? colorsOf(walker.elf) : undefined), [walker])
  const look = useMemo<PixelLook | undefined>(() => {
    if (!pixels) return undefined
    const own = shown.palette.colors
    const colors = elfColors ? joinPalettes([own.map((c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`), elfColors]) : own
    return { palette: colors, dither: shown.finish.dither, outline: darkest(colors), glow: shown.finish.glow, edges: 1, parts: true, sky: shown.sky, steady: STEADY, tidy: true, fine: true, own: true, surface: true, snap: true }
  }, [pixels, shown, elfColors])
  useEffect(() => { stage?.setPixels(look, 2) }, [stage, look])
  // blocks: cubes a whole number of the cut's cells across, lit from the starting view's left; only an island cut with no light of its own
  const blockSpacing = ready?.plain ? DETAIL.find((d) => d.id === ready.detail)!.spacing : undefined
  const blockAzimuth = shown.views[0].orbit.azimuth
  useEffect(() => {
    if (!stage) return
    stage.setBlocks(blocky && blockSpacing ? blockLook({ ...BLOCK_START, size: blockSize }, blockSpacing, blockAzimuth) : undefined)
  }, [stage, blocky, blockSpacing, blockSize, blockAzimuth])

  // the address always names the island on show, so it can be sent to someone
  useEffect(() => {
    const url = new URL(location.href)
    const put = (k: string, v: string | undefined) => { if (v) url.searchParams.set(k, v); else url.searchParams.delete(k) }
    put('biome', BIOMES.length > 1 ? biomeId : undefined); put('seed', String(seed)); put('style', blocky ? undefined : style); put('block', blocky && blockSize !== BLOCK_START.size ? String(blockSize) : undefined); put('rock', rock ? undefined : '0'); put('walk', walking ? '1' : undefined)
    history.replaceState(history.state, '', url)
  }, [biomeId, seed, style, blocky, blockSize, rock, walking])

  // For verify: the stage and the island, without clicking
  useEffect(() => {
    if (!stage || !ready) return
    window.__islands = { stage, blobs: () => stage.blobCount, bones: () => ready.built.skeleton.count, things: () => lines.map((l) => l.words), name: () => island.plan.name, walk: () => walkNow.current }
    return () => { delete window.__islands }
  }, [stage, ready, lines, island])

  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  useWheelZoom(canvas, setOrbit)
  const another = () => setSeed(1 + Math.floor(Math.random() * MAX_SEED))
  // leaving the walk, the view goes back to the whole island
  const leftWalk = useRef(walking)
  useEffect(() => {
    if (leftWalk.current && !walking) setOrbit(shown.views[0].orbit)
    leftWalk.current = walking
  }, [walking]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => download(new TextEncoder().encode(JSON.stringify(island.doc, null, 1)), `${island.plan.biome}-island-${seed}.json`, 'application/json')
  const waiting = !failed && (!drawn || !ready || (walking && !walker))
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
          decides the rest. This is an early step of a sky world: one island from one of three biomes, big enough to walk about on.
        </p>
      </header>
      <Workbench
        viewLabel="The island"
        fullScreenAt={walking ? 'top-12 left-3 max-sm:top-11 max-sm:left-2' : undefined}
        view={<>
          {!pixels && <div aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(${css(shown.sky[0])}, ${css(shown.sky[1])})` }} />}
          <canvas
            ref={canvas}
            role="application"
            aria-roledescription="3D view"
            aria-label={walking ? `An elf on ${island.plan.name}. Arrow keys or W, A, S and D walk the way they point on the screen; E waves. Drag to turn the view; scroll, pinch or press plus and minus to zoom.` : `${summary}. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.`}
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
              if (walking && /^Arrow/.test(ev.key)) return
              if (!orbitKey(ev, orbit)) return
              ev.preventDefault()
              setOrbit((o) => orbitKey(ev, o) ?? o)
            }}
          />
          {waiting && <LoadingMark testid="islands-loading" />}
          <p role="status" className="sr-only">{waiting ? (stage ? (ready ? 'Bringing the elf…' : 'Growing the island…') : 'Starting the splat engine…') : walking ? `The elf stands on ${island.plan.name}.` : `${summary}.`}</p>
          {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
          <div className="absolute top-3 left-3 flex gap-2 max-sm:top-2 max-sm:left-2">
            <Button small primary onClick={() => setWalking((w) => !w)} data-testid="islands-walk">{walking ? 'See the whole island' : 'Walk on it'}</Button>
            {!walking && <Button small onClick={another} data-testid="islands-another">Another island</Button>}
          </div>
          {walking && walker && <>
            <Stick testid="islands-stick" onChange={(v) => { stick.current = v; push() }} />
            <p aria-hidden className="pointer-events-none absolute top-3 right-14 rounded-full bg-paper/80 px-2.5 py-0.5 text-xs text-ink backdrop-blur-sm max-sm:hidden">
              {coarse ? 'stick to walk · drag to look round' : 'arrow keys or WASD to walk · E to wave · drag to look round'}
            </p>
          </>}
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(walker ? { ...orbit, ...BEHIND, azimuth: walker.walker.heading * DEG + 180 } : shown.views[0].orbit)} />
        </>}
        status={<>
          <span><span className="text-ink" data-testid="islands-name">{island.plan.name}</span></span>
          {walker && <span data-testid="islands-walked">walked <WalkedMeters walk={walker} /></span>}
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
                    <Chip active={blocky} onClick={() => setStyle('blocks')}>Blocks</Chip>
                    <Chip active={pixels} onClick={() => setStyle('pixel')}>Pixel art</Chip>
                    <Chip active={style === 'blobs'} onClick={() => setStyle('blobs')}>Blobs</Chip>
                  </div>
                </Field>
                {blocky && <Slider label="Block size" value={blockSize} min={BLOCK_SIZES.min} max={BLOCK_SIZES.max} step={1} onChange={setBlockSize} format={(v) => `${v}×`} hint="How big a block is beside the grid the island was cut on." />}
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
          <p>
            Walking on it, the island stands five times its written size, so a tree is a few meters tall beside the elf and the
            island is some thirty meters across. Where the elf may go is worked out from the same shapes the blobs are cut from:
            it stays back from the edge, stops at anything with a body (a trunk, a boulder, a standing stone) and walks through
            flowers. Its feet are placed one step at a time on the ground under them, as in the{' '}
            <a href={href({ page: 'pond' })} className="underline decoration-rule underline-offset-2 hover:text-accent">Wading Pond</a>, and the path is kept clear of
            anything that would stand in its way.
          </p>
        </div>
      </section>
    </div>
  )
}

/** How far the elf has walked, read a few times a second (the walk keeps it in a plain number, not in state). */
function WalkedMeters({ walk }: { walk: IslandWalk }) {
  const [m, setM] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setM(Math.round(walk.walked)), 500)
    return () => clearInterval(t)
  }, [walk])
  return <span className="tabular-nums text-ink">{m} m</span>
}
