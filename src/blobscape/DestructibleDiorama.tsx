import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import { Skeleton, emptySkin } from '../splat-engine/rig.ts'
import { pickActors } from '../splat-engine/pick.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field } from '../shared/ui.tsx'
import { detailAsked, labelNames, writeDetail } from '../shared/detail.ts'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import type { Actor, CreatureStage } from './creature/stage.ts'
import { DETAIL } from './diorama/scene.ts'
import { DIORAMAS, type Diorama } from './diorama/scenes.ts'
import { madeProp } from './props/index.ts'
import { Crumble, HeightMap, breakables, copyPieces, emptyPieces, partOwners, posedCenter, thinned, type Breakable, type Cut } from './crumble/debris.ts'
import { href } from './routes.ts'

declare global {
  interface Window { __crumble?: { stage: CreatureStage; things: string[]; broken: () => string[]; crumble: (label: string) => boolean } }
}

/** The scenes on offer: Diorama's, each made of a land and props from Scene Creator's library. */
const SCENES = [
  { id: 'windmill', label: 'Windmill' },
  { id: 'campfire', label: 'Campfire' },
  { id: 'cabin', label: 'Snowed-in cabin' },
  { id: 'lighthouse', label: 'Lighthouse' },
  { id: 'grove', label: 'Lantern grove' },
  { id: 'presents', label: 'Presents' },
  { id: 'sleigh', label: 'Sleigh and reindeer' },
] as const

const DETAILS = [{ id: 'light', label: 'Light' }, { id: 'full', label: 'Full' }, { id: 'fine', label: 'Fine' }] as const
type Detail = 0 | 1 | 2

/** How long the pieces lie before they go home. */
const STAYS = [{ id: 'short', label: 'A moment', seconds: 1.5 }, { id: 'long', label: 'A while', seconds: 5 }, { id: 'longer', label: 'A long while', seconds: 12 }] as const

/** Room for pieces: blobs that can be flying or lying at once, across every broken thing. */
const ROOM = 24000, ROOM_PHONE = 12000
/** The fewest pieces a thing breaks into when room is short. */
const LEAST = 300

const params = () => new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
const media = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches

/** One broken thing on the stage: its pieces' slots, its blobs and where it was struck. */
interface Broken { thing: Breakable; crumble: Crumble; from: number; kept: Uint32Array; homes: Float32Array; opacity: Float32Array }

interface Built {
  key: string
  d: Diorama
  cut: Actor & Cut
  things: Breakable[]
  /** Which thing each blob of the cut belongs to, or -1. */
  owner: Int16Array
  pieces: Actor
  ground: HeightMap
  span: number
  center: [number, number, number]
}

/**
 * Destructible Diorama (issue #462): tap anything set down in a Diorama scene and it falls apart into its own blobs,
 * which scatter, land and lie on the ground, then fly back lowest first and build it again (crumble/debris.ts).
 */
export function DestructibleDiorama() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<CreatureStage>()
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState<string>()
  const offscreen = useMemo(() => params().get('offscreen') === '1', [])
  const coarse = useMemo(() => media('(pointer: coarse)'), [])
  const calm = useMemo(() => media('(prefers-reduced-motion: reduce)'), [])
  const [scene, setScene] = useState(() => SCENES.find((s) => s.id === params().get('scene'))?.id ?? SCENES[0].id)
  const [detail, setDetail] = useState<Detail>(() => { const asked = detailAsked(DETAILS, labelNames); return asked ? (DETAILS.indexOf(asked) as Detail) : coarse ? 0 : 1 })
  const [stay, setStay] = useState(() => STAYS.find((s) => s.id === params().get('stay'))?.id ?? 'short')
  const [built, setBuilt] = useState<Built>()
  const [orbit, setOrbit] = useState<Orbit>()
  const [said, setSaid] = useState('')
  const [brokenNow, setBrokenNow] = useState<string[]>([])
  const broken = useRef<Broken[]>([])
  const stayRef = useRef(stay)
  stayRef.current = stay
  const label = SCENES.find((s) => s.id === scene)!.label
  const room = coarse ? ROOM_PHONE : ROOM

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
      }, (e: unknown) => { console.warn(e); setFailed('This browser could not start WebGPU or WebGL 2, which this scene needs.') })
    return () => { gone = true; live?.dispose() }
  }, [offscreen])

  // the scene cut, what in it can be broken, and a pool of pieces; after a paint, so the waiting mark shows first
  const key = `${scene}|${detail}`
  useEffect(() => {
    if (!stage) return
    const d = DIORAMAS.find((x) => x.id === scene)!
    const t = setTimeout(() => {
      const cut = d.make(DETAIL[detail].spacing) as Actor & Cut
      const owners = d.project && d.doc ? partOwners(d.doc, d.project, madeProp) : new Int16Array(0)
      const names = d.project?.props.map((p) => (typeof p.prop === 'string' ? p.prop : p.prop.name)) ?? []
      const things = breakables(cut, owners, names)
      const owner = new Int16Array(cut.blobs.count).fill(-1)
      things.forEach((th, k) => { for (const i of th.blobs) owner[i] = k })
      // the scene's size and the ground the pieces land on, from the blobs that stand still on the land
      const sk = cut.skeleton
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
      for (let i = 0; i < cut.blobs.count; i++) {
        if (sk.bones[cut.skin.joints[i * 4]].name.startsWith('~')) continue
        for (let a = 0; a < 3; a++) { const v = cut.blobs.center[i * 3 + a]; lo[a] = Math.min(lo[a], v); hi[a] = Math.max(hi[a], v) }
      }
      const span = Math.max(hi[0] - lo[0], hi[2] - lo[2])
      const top = hi[1] + span * 0.2
      // only the land's own blobs, so pieces never come down on top of the thing they were
      const land: number[] = []
      for (let i = 0; i < cut.blobs.count; i++) {
        const part = cut.partOf[i]
        if ((owners[part] ?? -1) >= 0 || owner[i] >= 0) continue
        if (sk.bones[cut.skin.joints[i * 4]].name.startsWith('~') || cut.blobs.opacity[i] < 0.15) continue
        land.push(cut.blobs.center[i * 3], cut.blobs.center[i * 3 + 1], cut.blobs.center[i * 3 + 2])
      }
      const ground = land.length
        ? HeightMap.fromPoints(new Float32Array(land), [lo[0], lo[2]], [hi[0], hi[2]], lo[1], 48, d.ground && ((x, z) => d.ground!(x, z, top, lo[1])))
        : new HeightMap((x, z) => d.ground?.(x, z, top, lo[1]) ?? lo[1], [lo[0], lo[2]], [hi[0], hi[2]], lo[1])
      const pieces = stillActor(emptyPieces(room))
      broken.current = []
      setBrokenNow([])
      const fire = d.fire?.()
      stage.setActor(cut, undefined, [pieces, ...(fire ? [fire.actor] : [])])
      stage.setPoser((sk, now) => {
        d.pose(sk, now)
        sk.update()
        const list = broken.current
        if (list.length) {
          let done = false
          for (const b of list) {
            // where its blobs stand now, so a thing that sways is built back where it has swayed to
            for (let k = 0; k < b.kept.length; k++) posedCenter(cut, sk, b.kept[k], b.homes, k * 3)
            b.crumble.place(now, b.homes, pieces.blobs.center, b.from * 3)
            if (now >= b.crumble.done) done = true
          }
          if (done) {
            for (const b of list.filter((x) => now >= x.crumble.done)) {
              // whole again: its own blobs back, its pieces put away
              b.thing.blobs.forEach((i, k) => { cut.blobs.opacity[i] = b.opacity[k] })
              pieces.blobs.opacity.fill(0, b.from, b.from + b.kept.length)
            }
            broken.current = list.filter((x) => now < x.crumble.done)
            stage.reshape(cut)
            queueMicrotask(() => setBrokenNow(broken.current.map((x) => x.thing.key)))
          }
          stage.reshape(pieces)
        }
        if (fire) { fire.show(now, eyeOf(stage.orbit)); stage.reshape(fire.actor) }
        const lit = d.lights(now, stage.backend === 'webgpu')
        stage.setLights(fire ? fire.shine(lit, now) : lit, d.ambientAt?.(now) ?? d.ambient ?? 1)
      })
      setOrbit({ ...d.views[0].orbit })
      setBuilt({ key, d, cut, things, owner, pieces, ground, span, center: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2] })
    }, 30)
    return () => clearTimeout(t)
  }, [stage, key, room, scene, detail])

  const ready = built?.key === key
  // under reduced motion the scene holds still, and plays only while something the visitor broke builds itself back
  const mending = brokenNow.length > 0
  useEffect(() => { if (stage) stage.playing = !calm || offscreen || mending }, [stage, calm, offscreen, mending])
  useEffect(() => { if (stage && orbit) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit])

  /** Breaks a thing, struck at `at`; false when it is broken already or there is no room for its pieces. */
  const crumble = (k: number, at?: ArrayLike<number>): boolean => {
    if (!stage || !built || !ready) return false
    const thing = built.things[k]
    if (!thing) return false
    if (broken.current.some((b) => b.thing === thing)) { setSaid(`The ${thing.label} is in pieces already.`); return false }
    // a free run of slots in the pool: after the last broken thing, or before the first
    const used = broken.current.map((b) => [b.from, b.from + b.kept.length] as const).sort((a, b) => a[0] - b[0])
    let from = 0, free = 0
    for (let s = 0, k2 = 0; k2 <= used.length; k2++) {
      const end = k2 < used.length ? used[k2][0] : room
      if (end - s > free) { free = end - s; from = s }
      if (k2 < used.length) s = used[k2][1]
    }
    if (free < Math.min(LEAST, thing.blobs.length)) { setSaid(`Too much is in pieces already. Wait for something to build itself back.`); return false }
    const { blobs: kept, grow } = thinned(thing.blobs, free)
    const { cut, pieces } = built
    const sk = cut.skeleton
    const start = new Float32Array(kept.length * 3)
    for (let k2 = 0; k2 < kept.length; k2++) posedCenter(cut, sk, kept[k2], start, k2 * 3)
    copyPieces(cut, sk, kept, pieces.blobs, from, grow)
    pieces.blobs.center.set(start, from * 3)
    // the thing itself is hidden by its blobs' opacity, since its parts may stand on the land's own bone
    const opacity = new Float32Array(thing.blobs.length)
    thing.blobs.forEach((i, k2) => { opacity[k2] = cut.blobs.opacity[i]; cut.blobs.opacity[i] = 0 })
    const middle = at ?? [start[0], start[1], start[2]]
    const seconds = STAYS.find((s) => s.id === stayRef.current)!.seconds
    const c = new Crumble(start, middle, stage.time, built.span, seconds, built.ground, k + 1 + Math.floor(stage.time * 10))
    broken.current = [...broken.current, { thing, crumble: c, from, kept, homes: new Float32Array(kept.length * 3), opacity }]
    stage.reshape(cut)
    stage.reshape(pieces)
    stage.invalidate()
    setBrokenNow(broken.current.map((b) => b.thing.key))
    setSaid(`The ${thing.label} falls apart into ${kept.length.toLocaleString()} blobs.`)
    return true
  }

  /** Breaks whatever is under a point on the view. */
  const strike = (x: number, y: number) => {
    if (!stage || !built) return
    const ray = stage.rayAt(x, y)
    if (!ray) return
    built.cut.skeleton.update()
    const hit = pickActors([built.cut], ray.origin, ray.direction)
    const k = hit ? built.owner[hit.blob] : -1
    if (k < 0) { setSaid(hit ? 'That is the ground. Tap something standing on it.' : ''); return }
    crumble(k, hit!.point)
  }

  const breakAll = () => { built?.things.forEach((t, k) => { if (!broken.current.some((b) => b.thing === t)) crumble(k) }) }

  // the address keeps what is on show
  useEffect(() => {
    const q = params()
    q.set('scene', scene)
    if (stay === 'short') q.delete('stay'); else q.set('stay', stay)
    history.replaceState(history.state, '', `${location.pathname}?${q}`)
  }, [scene, stay])

  // for verify: the stage, what can be broken and a way to break it, without clicking
  useEffect(() => {
    if (!stage || !built || !ready) return
    window.__crumble = {
      stage,
      things: built.things.map((t) => t.label),
      broken: () => broken.current.map((b) => b.thing.label),
      crumble: (l) => { const k = built.things.findIndex((t) => t.label === l); return k >= 0 && crumbleNow.current(k) },
    }
    return () => { delete window.__crumble }
  }, [stage, built, ready])
  const crumbleNow = useRef(crumble)
  crumbleNow.current = crumble

  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const press = useRef<{ x: number; y: number; at: number } | null>(null)
  const setOrbitSafe = (f: Orbit | ((o: Orbit) => Orbit)) => setOrbit((o) => (o ? (typeof f === 'function' ? f(o) : f) : o))
  useWheelZoom(canvas, setOrbitSafe as never)
  const waiting = !failed && (!drawn || !ready)
  const backend = stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'
  const things = ready && built ? built.things : []

  return (
    <div className="pb-4">
      <Crumbs here="Destructible Diorama" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Destructible Diorama</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          Everything in this little scene is made of blobs, and so is everything that breaks. Tap the windmill, a tree or a
          sheep and it falls apart into the very blobs it is made of. They lie where they land for a moment, then fly home
          and build it again.
        </p>
      </header>
      <Workbench
        viewLabel="The scene"
        view={<>
          <canvas
            ref={canvas}
            role="application"
            aria-roledescription="3D view"
            aria-label={`The ${label.toLowerCase()} scene. Tap or click a thing in it to break it; the Things tab lists them as buttons. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.`}
            tabIndex={0}
            data-testid="crumble-view"
            className="absolute inset-0 h-full w-full cursor-crosshair touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
            onPointerDown={(ev) => {
              ev.currentTarget.setPointerCapture(ev.pointerId)
              pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
              press.current = pointers.current.size === 1 ? { x: ev.clientX, y: ev.clientY, at: performance.now() } : null
              if (orbit) drag.current = beginOrbitDrag(pointers.current, ev, orbit)
            }}
            onPointerMove={(ev) => {
              if (pointers.current.has(ev.pointerId)) pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
              const d = drag.current
              if (d) setOrbitSafe(dragOrbit(d, pointers.current, ev))
            }}
            onPointerUp={(ev) => {
              pointers.current.delete(ev.pointerId); drag.current = null
              // a short tap that hardly moved breaks what is under it
              const p = press.current
              press.current = null
              if (p && performance.now() - p.at < 350 && Math.hypot(ev.clientX - p.x, ev.clientY - p.y) < 6) {
                const r = ev.currentTarget.getBoundingClientRect()
                strike(ev.clientX - r.left, ev.clientY - r.top)
              }
            }}
            onPointerCancel={(ev) => { pointers.current.delete(ev.pointerId); drag.current = null; press.current = null }}
            onKeyDown={(ev) => {
              if (!orbit || !orbitKey(ev, orbit)) return
              ev.preventDefault()
              setOrbitSafe((o) => orbitKey(ev, o) ?? o)
            }}
          />
          {waiting && <LoadingMark testid="crumble-loading" />}
          <p role="status" className="sr-only">{waiting ? (stage ? `Making the ${label.toLowerCase()}…` : 'Starting the splat engine…') : said}</p>
          {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
          {orbit && built && <ZoomBar orbit={orbit} setOrbit={setOrbitSafe as never} onReset={() => setOrbit({ ...built.d.views[0].orbit })} />}
        </>}
        status={<>
          <span>{ready && built ? <><span className="tabular-nums text-ink" data-testid="crumble-blobs">{built.cut.blobs.count.toLocaleString()}</span> blobs, {built.things.length} things to break{brokenNow.length ? <>, {brokenNow.length} in pieces</> : null}.</> : 'Making it…'}</span>
          <span>On {backend}</span>
        </>}
        tabsLabel="Options"
        tabs={[
          {
            id: 'things', label: 'Things', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Break one">
                  <div className="flex flex-wrap gap-1.5" data-testid="crumble-things">
                    {things.map((t, k) => (
                      <Chip key={t.key} active={brokenNow.includes(t.key)} onClick={() => crumble(k)}>{t.label}</Chip>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">Or tap it in the view. Something already in pieces builds itself back first.</p>
                </Field>
                <div>
                  <Button small onClick={breakAll} disabled={!ready} data-testid="crumble-all">Break everything</Button>
                  <p className="mt-1.5 text-xs text-ink-faint">{coarse ? 'A phone keeps fewer pieces at once, so a big thing breaks into fewer, bigger blobs.' : 'When too many pieces are flying, big things break into fewer, bigger blobs.'}</p>
                </div>
                <Field label="Pieces lie for">
                  <div className="flex flex-wrap gap-1.5" data-testid="crumble-stay">
                    {STAYS.map((s) => <Chip key={s.id} active={stay === s.id} onClick={() => setStay(s.id)}>{s.label}</Chip>)}
                  </div>
                </Field>
              </div>
            ),
          },
          {
            id: 'scene', label: 'Scene', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Scene">
                  <div className="flex flex-wrap gap-1.5" data-testid="crumble-scenes">
                    {SCENES.map((s) => <Chip key={s.id} active={scene === s.id} onClick={() => setScene(s.id)}>{s.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">Each is a scene in Diorama, made of a land and props from Scene Creator's library. Every prop can be broken; the land can't.</p>
                </Field>
                <Field label="Detail">
                  <div className="flex flex-wrap gap-1.5" data-testid="crumble-detail">
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
          <h2 id="how-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">It was always in pieces</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            A mesh has to be cut up before it can break. A scene of blobs is already thousands of separate pieces, each with
            its own place, size, color and facing, so breaking a thing means letting go of them.
          </p>
          <p>
            The scene is made of props, so each blob knows which prop it came from. A tap finds the blob under it, and every
            blob of that prop is copied as it stands that moment and thrown outward from where you tapped. Each falls under
            gravity until it meets the scene's own ground and lies there.
          </p>
          <p>
            Going home, each piece aims for where its blob stands right now, not where it stood when it broke, so a tree that
            sways or a sail that turns is built back in step. The lowest pieces leave first, so it rises from its foot.
          </p>
        </div>
      </section>
    </div>
  )
}

/** An actor of loose blobs on one bone that never moves: the pool of pieces. */
function stillActor(blobs: Actor['blobs']): Actor {
  const skeleton = new Skeleton([{ name: 'pieces', parent: -1, head: [0, 0, 0] }])
  const skin = emptySkin(blobs.count)
  for (let i = 0; i < blobs.count; i++) skin.weights[i * 4] = 1
  return { blobs, skin, skeleton } as Actor
}

/** Where the eye is for a view, for a fire seen through its own hot gas. */
function eyeOf(o: Orbit): [number, number, number] {
  const a = (o.azimuth * Math.PI) / 180, e = (o.elevation * Math.PI) / 180
  return [o.target[0] + o.distance * Math.sin(a) * Math.cos(e), o.target[1] + o.distance * Math.sin(e), o.target[2] + o.distance * Math.cos(a) * Math.cos(e)]
}
