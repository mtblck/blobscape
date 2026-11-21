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
import { MAX_SEED, census } from './islands/island.ts'
import { WORLD_ISLANDS, placeIsland, planWorld, poseBridge, type WorldGround, type WorldPlan } from './islands/world.ts'
import type { AmongCreatures, Resident } from './islands/creatures.ts'
import type { Guardian } from './islands/guardians.ts'
import { material } from './islands/materials.ts'
import { grassActor, growGrass } from './islands/grass.ts'
import { cloudActor, poseClouds } from './islands/clouds.ts'
import type { IslandCut, IslandJob } from './islands/cut.worker.ts'
import { unpack } from './creator/pack.ts'
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
/** Shift held, or the stick pushed this far, walks rather than runs: a share of a run's speed. */
const WALKING = 0.38

/** The view of a whole world from the first island's own starting view: turned the same way, back far enough for all of it. */
function overview(world: WorldPlan, first: Orbit): Orbit {
  if (world.islands.length === 1) return first
  const n = world.islands.length, c = [0, 1, 2].map((k) => world.islands.reduce((a, i) => a + i.at[k], 0) / n)
  const far = Math.max(...world.islands.map((i) => Math.hypot(i.at[0] - c[0], i.at[2] - c[2]))) + 3.2
  return { ...first, target: [c[0], c[1] + 0.3, c[2]], distance: far * 2.8, elevation: 32 }
}

declare global {
  interface Window { __islands?: { stage: CreatureStage; blobs: () => number; bones: () => number; things: () => string[]; name: () => string; walk: () => IslandWalk | undefined; creatures: () => { id: string; at: number[] }[]; guardians: () => { kind: string; at: number[] }[] } }
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
  // Chunky at first everywhere: an island is about a hundred and fifty meters across, and finer takes many seconds to cut
  const [detail, setDetail] = useState<string>(() => detailAsked(DETAIL, labelNames)?.id ?? 'chunky')
  // how the island is drawn: built from blocks (Matt, 2026-11-20: the style to drive these islands), as pixel art, or as the blobs themselves
  const [style, setStyle] = useState<'blocks' | 'pixel' | 'blobs'>(() => { const s = params().get('style'); return s === 'pixel' || s === 'blobs' ? s : 'blocks' })
  const pixels = style === 'pixel', blocky = style === 'blocks'
  const [blockSize, setBlockSize] = useState(() => { const v = Math.round(Number(params().get('block'))); return v >= BLOCK_SIZES.min && v <= BLOCK_SIZES.max ? v : BLOCK_START.size })
  const [orbit, setOrbit] = useState<Orbit>({ target: [0, 0, 0], distance: 12.5, azimuth: 24, elevation: 20 })
  const [walking, setWalking] = useState(() => params().get('walk') === '1')
  const [count, setCount] = useState(() => (params().get('islands') === '1' ? 1 : WORLD_ISLANDS))
  // grass as blobs among the blocks (Matt, 2026-11-20: a finer texture beside the cubes, for dense vegetation)
  const [grass, setGrass] = useState(() => params().get('grass') !== '0')
  const [creatures, setCreatures] = useState(() => params().get('creatures') !== '0')
  // and how its blades are drawn: soft blobs, or gouache dabs (Brush and Ink's marks)
  const [grassAs, setGrassAs] = useState<'blobs' | 'gouache'>(() => (params().get('grassas') === 'gouache' ? 'gouache' : 'blobs'))

  // the world: its islands and bridges planned from the first island, each a description, then the scenes Pixel
  // Diorama's own code makes of them
  const world = useMemo(() => planWorld(biomeId, seed, count), [biomeId, seed, count])
  const island = useMemo(() => ({ ...world.islands[0], biome: biomeOf(world.islands[0].biome) }), [world])
  const scenes = useMemo(() => [
    ...world.islands.map((i) => described('island', i.doc, `${i.plan.name}: ${biomeOf(i.biome).about.toLowerCase()}`)),
    ...world.bridges.map((b) => described('bridge', b.doc, 'A rope bridge')),
  ], [world])
  const scene = scenes[0]
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

  // cut in a worker (an island takes seconds), and the island on show stays until the next is ready. Blocks are cut at
  // the size of a block: a block is one cell of the cut, so the same cubes come from a few times fewer blobs. Every
  // island is cut at Chunky; a finer detail is cut for the island underfoot alone, after (`finer`), since at Fine one
  // island is some 850,000 blobs and close to a minute's cut, and the whole world at it never arrived on a phone
  const cutAt = DETAIL.find((d) => d.id === detail)!.spacing * (blocky ? blockSize : 1)
  const baseAt = DETAIL[0].spacing * (blocky ? blockSize : 1)
  const [made, setMade] = useState<{ built: Built; pieces: Built[]; of: typeof scene; scenes: typeof scenes; world: typeof world; plain: boolean; spacing: number }>()
  const ready = made?.of === scene && made.plain === blocky && made.spacing === baseAt ? made : undefined
  // a worker an island (each takes seconds), the bridges with the first; kept between cuts while nothing is stopped
  const workers = useRef<Worker[]>([])
  useEffect(() => () => workers.current.forEach((w) => w.terminate()), [])
  useEffect(() => {
    let done = false
    // a moment's wait, so dragging a slider asks for one cut, not one a step
    const timer = setTimeout(() => {
      const lanes = Math.max(1, Math.min(world.islands.length, (navigator.hardwareConcurrency || 2) - 1))
      const all = world.islands.length + world.bridges.length
      const id = Math.random(), pieces: Built[] = []
      let got = 0
      for (let k = 0; k < lanes; k++) {
        const w = (workers.current[k] ??= new Worker(new URL('./islands/cut.worker.ts', import.meta.url), { type: 'module' }))
        // islands dealt round the workers; the bridges, which are quick, go to the first
        const only = [...Array(all).keys()].filter((i) => (i < world.islands.length ? i % lanes === k : k === 0))
        w.onmessage = (ev: MessageEvent<IslandCut>) => {
          if (ev.data.id !== id) return
          if (ev.data.cut) {
            pieces[ev.data.index!] = unpack(ev.data.cut)
            if (++got === all) { done = true; setMade({ built: pieces[0], pieces, of: scene, scenes, world, plain: blocky, spacing: baseAt }) }
          } else if (ev.data.error) setFailed(`The island could not be cut: ${ev.data.error}`)
        }
        w.postMessage({ id, biome: biomeId, seed, count, spacing: baseAt, plain: blocky, only } satisfies IslandJob)
      }
    }, 150)
    return () => {
      clearTimeout(timer)
      // a cut still going is for something no longer asked for: stop it rather than wait for it
      if (!done) { workers.current.forEach((w) => w.terminate()); workers.current = [] }
    }
  }, [scene, scenes, world, biomeId, seed, count, blocky, baseAt])

  // the island underfoot (the first while nobody walks), and its finer cut when a finer detail is asked for: kept for
  // the last two islands cut finer, so walking back and forth across a bridge doesn't cut again
  const [near, setNear] = useState(0)
  const finerCuts = useRef<{ of?: typeof made; kept: { key: string; piece: Built }[] }>({ kept: [] })
  const [finer, setFiner] = useState<{ of: NonNullable<typeof made>; index: number; spacing: number; piece: Built }>()
  const fineWorker = useRef<Worker | undefined>(undefined)
  useEffect(() => () => fineWorker.current?.terminate(), [])
  useEffect(() => {
    if (!ready || cutAt === ready.spacing) return
    const index = Math.min(near, ready.world.islands.length - 1), key = `${index}:${cutAt}`
    if (finerCuts.current.of !== ready) finerCuts.current = { of: ready, kept: [] }
    const kept = finerCuts.current.kept.find((k) => k.key === key)
    if (kept) { setFiner({ of: ready, index, spacing: cutAt, piece: kept.piece }); return }
    let done = false
    const timer = setTimeout(() => {
      const w = (fineWorker.current ??= new Worker(new URL('./islands/cut.worker.ts', import.meta.url), { type: 'module' }))
      const id = Math.random()
      w.onmessage = (ev: MessageEvent<IslandCut>) => {
        if (ev.data.id !== id || !ev.data.cut) return
        done = true
        const piece = unpack(ev.data.cut)
        finerCuts.current.kept = [{ key, piece }, ...finerCuts.current.kept].slice(0, 2)
        setFiner({ of: ready, index, spacing: cutAt, piece })
      }
      w.postMessage({ id, biome: biomeId, seed, count, spacing: cutAt, plain: blocky, only: [index] } satisfies IslandJob)
    }, 300)
    return () => { clearTimeout(timer); if (!done) { fineWorker.current?.terminate(); fineWorker.current = undefined } }
  }, [ready, near, cutAt, biomeId, seed, count, blocky])
  // what is drawn: every island at Chunky, but the one underfoot finer once it is cut; blocks a cut's own cells across
  const pieces = useMemo(() => {
    if (!ready) return []
    const fine = finer?.of === ready && finer.spacing === cutAt ? finer : undefined
    return ready.pieces.map((p, j): Built & { blockCell?: number } => (fine && j === fine.index ? { ...fine.piece, blockCell: blocky ? fine.spacing : undefined } : p))
  }, [ready, finer, cutAt, blocky])
  const finerWaits = !!ready && cutAt !== ready.spacing && !(finer?.of === ready && finer.spacing === cutAt && finer.index === Math.min(near, ready.world.islands.length - 1))

  // the grass on each island's turf, grown from its cut: thick on the island underfoot, thinner on the others
  const grown = useMemo(() => {
    if (!ready || !blocky || !grass) return []
    const unit = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255)
    return ready.world.islands.map((isl, j) => {
      const piece = pieces[j] as Built & { blockCell?: number }, b = biomeOf(isl.biome), ramp = material(b.ground.top).ramp.map(unit)
      const flowers = { kinds: b.wildflowers.map((id) => material(id).ramp.map(unit)), bunches: (coarse ? 220 : 340) * (j ? 0.4 : 1) }
      return grassActor(growGrass({ blobs: piece.blobs, joints: piece.skin.joints }, { cell: piece.blockCell ?? ready.spacing, ramp, blades: (coarse ? 24000 : 40000) * (j ? 0.4 : 1), seed: isl.seed, flowers }))
    })
  }, [ready, pieces, blocky, grass, coarse])

  const nearNow = useRef(near)
  // leaving the walk, the first island is the one looked at again
  useEffect(() => { if (!walking) { nearNow.current = 0; setNear(0) } }, [walking])
  // in blocks the clouds are soft blobs of their own, light and wispy among the cubes (Matt, 2026-11-21)
  const clouds = useMemo(() => (ready && blocky ? ready.world.islands.map((isl) => cloudActor(isl.plan)) : []), [ready, blocky])

  const orbitNow = useRef(orbit)
  orbitNow.current = orbit
  const rocking = useRef(rock && !calm)
  rocking.current = rock && !calm
  const dressed = useRef<typeof scene | undefined>(undefined)
  // the creatures that live there, made once a world is cut (several an island, picked by its biome; islands/creatures.ts),
  // with the world's ground they walk on. The ground is asked of the shapes, not the cut, so one spacing serves every
  // detail and a finer cut keeps everyone where they stand.
  const [life, setLife] = useState<{ of: NonNullable<typeof made>; ground: WorldGround; residents: Resident[]; bodies: Built[]; pose: typeof import('./islands/creatures.ts').poseResident; guardians: Guardian[]; bigs: (Built & { blockCell: number })[]; guards: typeof import('./islands/guardians.ts') }>()
  const lifeNow = life && life.of === ready ? life : undefined
  const living = creatures ? lifeNow : undefined
  useEffect(() => {
    if (!ready || life?.of === ready) return
    let gone = false
    const timer = setTimeout(() => {
      Promise.all([import('./islands/world.ts'), import('./islands/creatures.ts'), import('./islands/guardians.ts')]).then(([{ WorldGround }, { another, makeResident, poseResident, settle }, guards]) => {
        if (gone) return
        const ground = new WorldGround(ready.world, DETAIL[0].spacing)
        // each kind of body is built once; the others of its kind share its blobs on skeletons of their own
        const made = new Map<string, Built>()
        const bodyOf = (r: { id: string; seed: number }) => {
          const key = `${r.id}:${r.seed}`
          if (!made.has(key)) made.set(key, makeResident({ ...r, size: 1, island: 0, home: [0, 0], plan: { legs: [], period: 1 }, offset: 0, height: 1 }))
          return made.get(key)!
        }
        const residents = settle(ready.world, ground.islands, bodyOf)
        const used = new Set<Built>()
        const bodies = residents.map((r) => { const b = bodyOf(r); if (used.has(b)) return another(b); used.add(b); return b })
        // and each island's guardian, wandering a wide loop from the most open place on it, cut in fine cubes of its own
        const guardians = guards.placeGuardians(ready.world, ground.islands)
        const cuts = new Map<string, Built>()
        const bigs = guardians.map((gd) => {
          const cut = cuts.get(gd.kind)
          const b = cut ? another(cut) : guards.makeGuardian(gd.kind)
          cuts.set(gd.kind, b)
          return { ...b, blockCell: guards.GUARDIAN_CELL }
        })
        setLife({ of: ready, ground, residents, bodies, pose: poseResident, guardians, bigs, guards })
      })
    }, 30)
    return () => { gone = true; clearTimeout(timer) }
  }, [ready, life])

  // the elf, made once the creatures are (it takes a moment, so the waiting mark shows first) and again for a new island
  const [walk, setWalk] = useState<{ walk: IslandWalk; of: NonNullable<typeof made>; among: AmongCreatures }>()
  const walker = walking && walk && walk.of === ready ? walk.walk : undefined
  const among = walker ? walk!.among : undefined
  useEffect(() => {
    if (!walking || !ready || walk?.of === ready || !lifeNow) return
    let gone = false
    const timer = setTimeout(() => {
      Promise.all([import('./islands/walk.ts'), import('./islands/world.ts'), import('./islands/creatures.ts')]).then(([{ IslandWalk }, { worldStart }, { AmongCreatures }]) => {
        if (gone) return
        // the elf walks round the creatures, not through them
        const ground = new AmongCreatures(lifeNow.ground)
        const w = new IslandWalk(ground, worldStart(ready.world, lifeNow.ground), { blobs: coarse ? 10000 : 16000 })
        // the view starts behind the elf, looking the way it faces
        setOrbit((o) => ({ ...o, ...BEHIND, azimuth: w.walker.heading * DEG + 180 }))
        setWalk({ walk: w, of: ready, among: ground })
      })
    }, 30)
    return () => { gone = true; clearTimeout(timer) }
  }, [walking, ready, walk, coarse, lifeNow, creatures])

  // keys and the thumb stick both steer the elf by the picture: up is away from you, whichever way it faces
  const keys = useRef(new Set<string>())
  const stick = useRef({ forward: 0, turn: 0 })
  const input = useRef<Input>({ forward: 0, turn: 0 })
  const push = () => {
    const k = keys.current
    // keys run; Shift held walks (a run's speed times WALKING)
    const by = k.has('walk') ? WALKING : 1
    const y = ((k.has('f') ? 1 : 0) - (k.has('b') ? 1 : 0)) * by + stick.current.forward
    const x = ((k.has('r') ? 1 : 0) - (k.has('l') ? 1 : 0)) * by + stick.current.turn
    input.current = { forward: 0, turn: 0, stick: { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) } }
  }
  const walkNow = useRef(walker)
  walkNow.current = walker
  useEffect(() => {
    const KEYS: Record<string, string> = { ShiftLeft: 'walk', ShiftRight: 'walk', ArrowUp: 'f', KeyW: 'f', ArrowDown: 'b', KeyS: 'b', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' }
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
      if (k !== 'walk') e.preventDefault()
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
    const d = ready.of, { scenes: all, world: wd } = ready
    const others = pieces.slice(1)
    const residents = living?.residents ?? [], bodies = living?.bodies ?? [], bigs = living?.bigs ?? []
    stage.setActor(pieces[0], undefined, [...others, ...grown, ...clouds, ...bodies, ...bigs, ...(walker ? [walker.elf] : [])])
    const ground = walker?.ground as WorldGround | undefined
    // a new island brings its own starting view; a new detail keeps the view it had
    const start = overview(wd, d.views[0].orbit)
    if (dressed.current !== d) { dressed.current = d; if (!walker) { setOrbit(start); orbitNow.current = start } }
    let last = stage.time, eye: number[] | undefined
    stage.setPoser((sk: Skeleton, t: number) => {
      d.pose(sk, calm ? 0 : t)
      sk.rootScale = SCALE
      sk.update()
      // the other islands sway on their own clocks where they stand, and the bridges hang between them
      for (let j = 1; j < pieces.length; j++) {
        const s = pieces[j].skeleton
        if (j < wd.islands.length) { all[j].pose(s, calm ? 0 : t); placeIsland(wd.islands[j], s) }
        else poseBridge(wd.bridges[j - wd.islands.length], s)
      }
      grown.forEach((g, j) => placeIsland(wd.islands[j], g.skeleton))
      clouds.forEach((c, j) => { poseClouds(wd.islands[j].plan, c.skeleton, calm ? 0 : t, d.loop); placeIsland(wd.islands[j], c.skeleton) })
      // the creatures walk their loops on the world's own clock, so where each is depends on the time alone
      residents.forEach((r, j) => living!.pose(r, bodies[j].skeleton, t, living!.ground.groundAt, calm))
      bigs.forEach((b, j) => living!.guards.poseGuardian(living!.guardians[j], b.skeleton, calm ? 0 : t, living!.ground.groundAt))
      // the elf can't walk through a guardian either
      if (among) among.fixed = (living?.guardians ?? []).map((gd) => { const w = living!.guards.guardianAt(gd, calm ? 0 : t); return { x: w.x, z: w.z, r: living!.guards.BODY[gd.kind] + 0.4 } })
      stage.setLights(d.lights(t, stage.backend === 'webgpu'), 1)
      if (walker) {
        among?.update(residents, calm ? 0 : t, walker.walker)
        const dt = Math.max(0, Math.min(0.1, t - last))
        last = t
        // the stick steers by the view as it stands: up on it is away from the camera
        const o = orbitNow.current, way = (o.azimuth / DEG) + Math.PI
        const i = input.current
        walker.update(dt, i.stick && (i.stick.x || i.stick.y) ? { forward: 0, turn: 0, ...steer(i.stick, way) } : { forward: 0, turn: 0 })
        // the view follows the elf, catching up rather than jumping
        const m = walker.middle, k = eye ? 1 - Math.exp(-dt * FOLLOW) : 1
        eye = eye ? eye.map((v, j) => v + (m[j] - v) * k) : m
        // which island is underfoot, for its finer cut
        if (ground?.islandAt) { const j = ground.islandAt(m[0], m[2]); if (j !== nearNow.current) { nearNow.current = j; setNear(j) } }
        stage.orbit = { ...inMeters(o), target: [eye[0], eye[1], eye[2]] }
      } else if (d.swing && rocking.current) stage.orbit = inMeters(swung(orbitNow.current, d.swing, d.loop, t))
    }, stage.time)
  }, [stage, ready, pieces, walker, calm, grown, clouds, living, among])
  // walking needs the clock to run, whether or not the island's own moves do
  useEffect(() => { if (stage) stage.playing = playing || !!walker }, [stage, playing, walker])
  useEffect(() => { if (stage) { if (!walkNow.current) stage.orbit = inMeters(orbit); stage.invalidate() } }, [stage, orbit, rock])

  // what is in the view now lags the island asked for while it is cut, and keeps its own palette and sky until then
  const shown = made?.of ?? scene
  const shownAll = made?.scenes ?? scenes
  // the elf is made with its colors baked in: the island's palette gains the ones it lacks, and the other islands' theirs
  const elfColors = useMemo(() => (walker ? colorsOf(walker.elf) : undefined), [walker])
  const lifeColors = useMemo(() => (pixels ? [...new Set([...(living?.bodies ?? []), ...(living?.bigs ?? [])].map((b) => b.blobs))].map((blobs) => colorsOf({ blobs }, 4)) : undefined), [pixels, living])
  const look = useMemo<PixelLook | undefined>(() => {
    if (!pixels) return undefined
    const hex = (cs: readonly (readonly number[])[]) => cs.map((c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`)
    const lists = [...new Set(shownAll.map((s) => s.palette))].map((p) => hex(p.colors))
    if (elfColors) lists.push(elfColors)
    if (lifeColors) lists.push(...lifeColors)
    const colors = lists.length > 1 ? joinPalettes(lists) : shown.palette.colors
    return { palette: colors, dither: shown.finish.dither, outline: darkest(colors), glow: shown.finish.glow, edges: 1, parts: true, sky: shown.sky, steady: STEADY,
      // Pixel Diorama's finish: calmer pixels, flat surfaces, lines only across things, hard discs where things meet, a shine
      // on lit forms. No rim: it goes by a fixed view, and here the view turns with the walker.
      tidy: true, calm: true, flat: true, across: true, solid: true, shine: true, selout: true, fine: true, own: true, surface: true, snap: true }
  }, [pixels, shown, shownAll, elfColors, lifeColors])
  useEffect(() => { stage?.setPixels(look, 2) }, [stage, look])
  // blocks: cubes a whole number of the cut's cells across, lit from the starting view's left; only an island cut with no light of its own
  const blockSpacing = ready?.plain ? ready.spacing : undefined
  const blockAzimuth = shown.views[0].orbit.azimuth
  useEffect(() => {
    if (!stage) return
    stage.setBlocks(blocky && blockSpacing ? blockLook({ ...BLOCK_START, size: 1 }, blockSpacing, blockAzimuth) : undefined)
  }, [stage, blocky, blockSpacing, blockAzimuth])

  // the grass is the only thing the world draws while blocks are on, so marks there fall on it alone
  useEffect(() => { stage?.setMarks(blocky && grass && grassAs === 'gouache' ? { kind: 'gouache' } : undefined) }, [stage, blocky, grass, grassAs, ready])

  // the address always names the island on show, so it can be sent to someone
  useEffect(() => {
    const url = new URL(location.href)
    const put = (k: string, v: string | undefined) => { if (v) url.searchParams.set(k, v); else url.searchParams.delete(k) }
    put('biome', BIOMES.length > 1 ? biomeId : undefined); put('seed', String(seed)); put('style', blocky ? undefined : style); put('block', blocky && blockSize !== BLOCK_START.size ? String(blockSize) : undefined); put('rock', rock ? undefined : '0'); put('grass', grass ? undefined : '0'); put('grassas', blocky && grass && grassAs !== 'blobs' ? grassAs : undefined); put('walk', walking ? '1' : undefined); put('islands', count === 1 ? '1' : undefined); put('creatures', creatures ? undefined : '0')
    history.replaceState(history.state, '', url)
  }, [biomeId, seed, style, blocky, blockSize, rock, walking, count, grass, grassAs, creatures])

  // For verify: the stage and the island, without clicking
  useEffect(() => {
    if (!stage || !ready) return
    window.__islands = { stage, blobs: () => stage.blobCount, bones: () => ready.built.skeleton.count, things: () => lines.map((l) => l.words), name: () => island.plan.name, walk: () => walkNow.current, creatures: () => living?.residents.map((r, j) => ({ id: r.id, at: [...living.bodies[j].skeleton.posedHead.subarray(0, 3)] })) ?? [], guardians: () => living?.guardians.map((gd, j) => ({ kind: gd.kind, at: [...living.bigs[j].skeleton.place] })) ?? [] }
    return () => { delete window.__islands }
  }, [stage, ready, lines, island, living])

  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  useWheelZoom(canvas, setOrbit)
  const another = () => setSeed(1 + Math.floor(Math.random() * MAX_SEED))
  // leaving the walk, the view goes back to the whole island
  const leftWalk = useRef(walking)
  useEffect(() => {
    if (leftWalk.current && !walking) setOrbit(overview(made?.world ?? world, shown.views[0].orbit))
    leftWalk.current = walking
  }, [walking]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => download(new TextEncoder().encode(JSON.stringify(island.doc, null, 1)), `${island.plan.biome}-island-${seed}.json`, 'application/json')
  const waiting = !failed && (!drawn || !ready || (walking && !walker))
  const backend = stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'
  const names = world.islands.map((i) => i.plan.name)
  const where = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}, joined by rope bridges`
  const summary = names.length === 1 ? `${island.plan.name}, with ${lines.map((l) => l.words).join(', ')}` : where
  const used = useMemo(() => [...new Set(world.islands.flatMap((i) => {
    const b = biomeOf(i.biome)
    return [b.ground.top, b.ground.soil, i.plan.rock, ...i.plan.things.flatMap((t) => Object.values(t.made))]
  }))].map(material), [world])
  const things = world.islands.reduce((a, i) => a + i.plan.things.length, 0)

  return (
    <div className="pb-4">
      <Crumbs here="Biome Islands" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Biome Islands</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          A floating island grown from a recipe and a number. The recipe says what kind of place it is and what it is made of; the number
          decides the rest. This is an early step of a sky world: islands from three biomes, joined by rope bridges, big enough to walk about on.
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
            aria-label={walking ? `An elf on ${where}. Arrow keys or W, A, S and D run the way they point on the screen, Shift walks; E waves. Drag to turn the view; scroll, pinch or press plus and minus to zoom.` : `${summary}. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.`}
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
          <p role="status" className="sr-only">{waiting ? (stage ? (ready ? 'Bringing the elf…' : 'Growing the island…') : 'Starting the splat engine…') : walking ? `The elf stands on ${island.plan.name}${names.length > 1 ? ', the first of ' + names.length + ' islands' : ''}.` : `${summary}.`}</p>
          {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
          <div className="absolute top-3 left-3 flex gap-2 max-sm:top-2 max-sm:left-2">
            <Button small primary onClick={() => setWalking((w) => !w)} data-testid="islands-walk">{walking ? 'See the whole island' : 'Walk on it'}</Button>
            {!walking && <Button small onClick={another} data-testid="islands-another">Another island</Button>}
          </div>
          {walking && walker && <>
            <Stick testid="islands-stick" onChange={(v) => { stick.current = v; push() }} />
            <p aria-hidden className="pointer-events-none absolute top-3 right-14 rounded-full bg-paper/80 px-2.5 py-0.5 text-xs text-ink backdrop-blur-sm max-sm:hidden">
              {coarse ? 'stick to run, a little to walk · drag to look round' : 'arrow keys or WASD to run · Shift to walk · E to wave · drag to look round'}
            </p>
          </>}
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(walker ? { ...orbit, ...BEHIND, azimuth: walker.walker.heading * DEG + 180 } : overview(made?.world ?? world, shown.views[0].orbit))} />
        </>}
        status={<>
          <span><span className="text-ink" data-testid="islands-name">{names.length === 1 ? island.plan.name : `${island.plan.name} and ${names.length - 1} more`}</span></span>
          {walker && <span data-testid="islands-walked">walked <WalkedMeters walk={walker} /></span>}
          <span>{ready && <><span className="tabular-nums text-ink">{things}</span> things, <span className="tabular-nums text-ink" data-testid="islands-blobs">{pieces.reduce((a, p) => a + p.blobs.count, 0).toLocaleString()}</span> blobs{finerWaits && ', the island underfoot coming finer'}</>}</span>
          {living && <span data-testid="islands-creatures"><span className="tabular-nums text-ink">{living.residents.length}</span> creatures</span>}
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
                <Field label="Islands">
                  <div className="flex flex-wrap gap-1.5">
                    <Chip active={count === 1} onClick={() => setCount(1)}>One</Chip>
                    <Chip active={count > 1} onClick={() => setCount(WORLD_ISLANDS)}>{WORLD_ISLANDS}, joined by bridges</Chip>
                  </div>
                  {count > 1 && <p className="mt-1.5 text-xs text-ink-faint">The first island is the biome and number you pick; each one after it is the next biome round, from a number of its own.</p>}
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
                  <Button onClick={save} data-testid="islands-save">{count === 1 ? 'Save its description' : 'Save the first island’s description'}</Button>
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
                {blocky && <Toggle label="Grass among the blocks" checked={grass} onChange={setGrass} />}
                {blocky && grass && (
                  <Field label="Grass drawn as">
                    <div className="flex flex-wrap gap-1.5">
                      <Chip active={grassAs === 'blobs'} onClick={() => setGrassAs('blobs')}>Blobs</Chip>
                      <Chip active={grassAs === 'gouache'} onClick={() => setGrassAs('gouache')}>Gouache</Chip>
                    </div>
                  </Field>
                )}
                {blocky && <Slider label="Block size" value={blockSize} min={BLOCK_SIZES.min} max={BLOCK_SIZES.max} step={1} onChange={setBlockSize} format={(v) => `${v}×`} hint="How big a block is, in steps of the detail. The island is cut again at that size." />}
                <Field label="Detail">
                  <div className="flex flex-wrap gap-1.5">
                    {DETAIL.map((d) => <Chip key={d.id} active={detail === d.id} onClick={() => { setDetail(d.id); writeDetail(d.id) }}>{d.label}</Chip>)}
                  </div>
                </Field>
                <div className="grid gap-3">
                  <Toggle label="Creatures" checked={creatures} onChange={setCreatures} />
                  <Toggle label="Rock the view" checked={rock} onChange={setRock} />
                  <div><Button small onClick={() => setPlaying((p) => !p)}>{playing ? 'Hold still' : 'Let it move'}</Button></div>
                </div>
              </div>
            ),
          },
        ]}
      />

      <section aria-labelledby="on-title" className="mt-10 rounded-2xl border border-rule bg-paper-sunk/60 px-5 py-5" data-testid="islands-list">
        <h2 id="on-title" className="font-display text-2xl">{count === 1 ? 'On this island' : 'On these islands'}</h2>
        <div className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <div className="grid gap-5">
            {world.islands.map((i) => (
              <div key={i.plan.name}>
                {count > 1 && <h3 className="font-display text-lg">{i.plan.name}</h3>}
                <h3 className="text-sm font-bold">Kinds of place on it</h3>
                <ul className="mt-1 grid gap-0.5 text-sm text-ink">{i.plan.patches.map((p) => <li key={p.name}>{p.name[0].toUpperCase() + p.name.slice(1)}</li>)}</ul>
                <h3 className="mt-4 text-sm font-bold">What stands on it</h3>
                <ul className="mt-1 grid gap-0.5 text-sm text-ink">{census(i.plan).map((l) => <li key={l.words}>{l.words}</li>)}</ul>
              </div>
            ))}
          </div>
          <div>
            <h3 className="text-sm font-bold">What {count === 1 ? 'it is' : 'they are'} made of</h3>
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
          <p>
            A world is a chain of islands, each the next biome round. The first island's number sets which way each one lies from the
            last, a little higher or lower, and the gap between them; each island's path is grown to come in where the bridge from
            the last one lands and leave where the next one starts. The rope bridges are scene descriptions too, planks on two
            sagging ropes with rails a meter up, and the elf walks across on their deck.
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
