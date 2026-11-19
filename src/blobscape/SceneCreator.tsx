import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import type { Vec3 } from '../splat-core/blobs.ts'
import { STEADY, darkest, type PixelLook } from '../splat-core/pixel.ts'
import type { Built } from '../splat-engine/body.ts'
import { pickActors } from '../splat-engine/pick.ts'
import { PlacedPoser, SIZE_RANGE, landSpec, type Placement, type SceneProject } from '../splat-engine/project.ts'
import type { Skeleton } from '../splat-engine/rig.ts'
import type { Shape } from '../splat-engine/voxel.ts'
import { groundUnder } from '../splat-engine/weather.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Chip, Slider, Toggle } from '../shared/ui.tsx'
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
import { arrowWay, begin, copied, did, moved, onGround, redo, redrawn, removed, sized, stepFor, stilled, turned, undo, wrapTurn, type History } from './creator/arrange.ts'

/**
 * Scene Creator (epic #329): Pixel Diorama's scenes taken apart into a land and props to arrange. The workspace
 * (#335) is the sandbox's Modes layout, each piece cut in a worker and drawn as its own actor on one stage; Arrange
 * (#336) picks a prop by a tap or from the list and moves, turns, sizes, copies and deletes it, with undo. A prop is
 * cut where it stands, so while it is dragged or turned the cut it has is drawn where it is going (`redrawn`), and it
 * is cut again once let go. The library, light, style and export follow in their own issues.
 */

type CreatorMode = 'scene' | 'props' | 'arrange' | 'light' | 'style' | 'export'

const MODES: Mode<CreatorMode>[] = [
  { id: 'scene', name: 'Scene', note: 'Start from one of the scenes or a bare land.', icon: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6' },
  { id: 'props', name: 'Props', note: 'The library of props to add: coming next.', icon: 'M4 7l8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10' },
  { id: 'arrange', name: 'Arrange', note: 'Tap a prop in the view, or pick one below, then move, turn and size it. Drag it along the ground to move it.', icon: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3' },
  { id: 'light', name: 'Light', note: 'The sun, the sky and lamps: coming next.', icon: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z' },
  { id: 'style', name: 'Style', note: 'Pixel art and the other looks: coming next.', icon: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-1.4-1-1.6-1-2.6 0-.8.6-1.3 1.5-1.3H16a5 5 0 0 0 5-5c0-4-4-7.5-9-7.5zM7.5 11h.01M10 7h.01M15 7h.01' },
  { id: 'export', name: 'Export', note: 'Save a picture, the loop or the project: coming next.', icon: 'M12 3v12M7 10l5 5 5-5M4 19h16' },
]

const modeAsked = (search: string): CreatorMode => MODES.find((m) => m.id === new URLSearchParams(search).get('mode'))?.id ?? 'scene'

/** A piece cut: the packed cut, the placement it was cut at, and how far it reaches from its foot along the ground. */
interface Cut { id: number; thing: string; packed: PackedCut; at: Placement; reach: number }

/** One piece of what is open: what its cut is kept under, and the job that cuts it. */
interface Piece { key: string; thing: string; job: (spacing: number) => CutJob }

/** How long the cutter waits after the last edit before it starts, so a run of key presses cuts once. */
const SETTLE_MS = 250
/** A press that moves less than this many pixels is a tap. */
const TAP = 6
const LIFT_MOST = 0.6
const fmt = (v: number, k = 2) => v.toFixed(k)

/** How far a cut reaches from its foot along the ground, the stand-in shadow left out. */
function reachOf(p: PackedCut, at: Placement): number {
  let r = 0
  for (let i = 0; i < p.count - 1; i++) r = Math.max(r, Math.hypot(p.center[i * 3] - at.at[0], p.center[i * 3 + 2] - at.at[2]))
  return r
}

export function SceneCreator() {
  const offscreen = useMemo(() => typeof location !== 'undefined' && new URLSearchParams(location.search).has('offscreen'), [])
  const webgl = useMemo(() => typeof location !== 'undefined' && new URLSearchParams(location.search).has('webgl'), [])
  const coarse = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches, [])
  const [mode, setModeState] = useState<CreatorMode>(() => (typeof location === 'undefined' ? 'scene' : modeAsked(location.search)))
  const [opened, setOpened] = useState<Opened>(() => openingAsked(typeof location === 'undefined' ? '' : location.search))
  // a project's edits are copies on a stack; a scene that opens whole has none
  const [hist, setHist] = useState<History<SceneProject> | undefined>(() => (opened.kind === 'project' ? begin(opened.project) : undefined))
  const project = hist?.now
  const shown = useMemo(() => shownOf(opened.kind === 'project' && project ? { ...opened, project } : opened), [opened, project])
  const cp = shown.cp
  // a phone starts on Chunky, as Pixel Diorama starts it a step lighter
  const [detail, setDetail] = useState<string>(() => detailAsked(DETAIL, labelNames)?.id ?? (coarse ? DETAIL[0].id : DETAIL[2].id))
  const [orbit, setOrbit] = useState<Orbit>(shown.orbit)
  const [stage, setStage] = useState<CreatureStage>()
  const [failed, setFailed] = useState('')
  const [picking, setPicking] = useState(false)
  // the prop picked, and where it is while a drag, a turn or a slider is still going
  const [picked, setPicked] = useState<number>()
  const [preview, setPreview] = useState<{ i: number; at: Placement }>()
  const [said, say] = useState('')
  const [version, setVersion] = useState(0)
  const work = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  useWorkspaceScreen(work)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<OrbitDrag | null>(null)
  const grab = useRef<{ kind: 'move' | 'turn'; i: number; from: { x: number; y: number }; offset: [number, number]; turn0: number; angle0: number; moved: boolean } | null>(null)
  const press = useRef<{ x: number; y: number } | null>(null)
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
    setHist(o.kind === 'project' ? begin(o.project) : undefined)
    setPicked(undefined)
    setPreview(undefined)
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

  // --- cutting ---------------------------------------------------------------

  // The pieces and what each is cut under. A prop's cut doesn't change as it moves (its light comes from the way it
  // faces, not where it stands), so its place is left out: a moved or copied prop needs no cut of its own.
  const pieces = useMemo<Piece[]>(() => {
    if (opened.kind === 'whole' || !project || !cp) return [{ key: `whole:${opened.kind === 'whole' ? opened.scene : ''}`, thing: 'whole', job: (spacing) => ({ kind: 'whole', scene: opened.kind === 'whole' ? opened.scene : '', spacing }) }]
    const steps = cp.land.c.steps ? cp.palette : null
    const land = JSON.stringify([project.land, project.loop, steps])
    return [
      { key: land, thing: 'land', job: (spacing) => ({ kind: 'land', project, spacing }) },
      ...project.props.map((p, i): Piece => ({ key: JSON.stringify([p.prop, p.turn, p.size, project.loop, project.land, steps]), thing: JSON.stringify(p.prop), job: (spacing) => ({ kind: 'prop', project, i, spacing }) })),
    ]
  }, [opened, project, cp])

  // cuts kept by detail and key, for as long as the page is open, and the worker that makes them
  const cuts = useRef(new Map<string, Cut>())
  const nextCut = useRef(0)
  const asker = useRef<(job: CutJob) => Promise<PackedCut>>(undefined)
  useEffect(() => {
    const worker = new Worker(new URL('./creator/cut.worker.ts', import.meta.url), { type: 'module' })
    let next = 0
    asker.current = (job) => new Promise<PackedCut>((resolve, reject) => {
      const id = ++next
      const on = (ev: MessageEvent<{ id: number; cut?: PackedCut; error?: string }>) => {
        if (ev.data.id !== id) return
        worker.removeEventListener('message', on)
        if (ev.data.cut) resolve(ev.data.cut)
        else reject(new Error(ev.data.error))
      }
      worker.addEventListener('message', on)
      worker.postMessage({ id, job })
    })
    return () => { worker.terminate(); asker.current = undefined }
  }, [])

  // Cuts whatever is missing: at Chunky first where a piece has nothing to show yet and a finer detail is asked for,
  // so something shows quickly, then at the detail asked for. Cuts no longer wanted are kept, in case an undo wants them.
  useEffect(() => {
    let gone = false
    const timer = setTimeout(() => {
      void (async () => {
        const passes = detail === DETAIL[0].id ? [detail] : [DETAIL[0].id, detail]
        for (const d of passes) {
          const spacing = DETAIL.find((x) => x.id === d)!.spacing
          let added = false
          for (let i = 0; i < pieces.length; i++) {
            const pc = pieces[i]
            const k = `${d}|${pc.key}`
            if (cuts.current.has(k)) continue
            // a piece that shows something (a finer cut, or its old cut while it is cut again) skips the quick pass
            if (d !== detail && (cuts.current.has(`${detail}|${pc.key}`) || shownCut.current[i])) continue
            const job = pc.job(spacing)
            try {
              const packed = await asker.current!(job)
              const at = job.kind === 'prop' ? job.project.props[job.i] : { at: [0, 0, 0] as Vec3, turn: 0, size: 1 }
              cuts.current.set(k, { id: ++nextCut.current, thing: pc.thing, packed, at, reach: reachOf(packed, at) })
              added = true
            } catch (e) {
              if (!gone) setFailed(`Could not cut ${shown.name}: ${e instanceof Error ? e.message : e}`)
              return
            }
            if (gone) { setVersion((v) => v + 1); return }
          }
          if (added) setVersion((v) => v + 1)
        }
      })()
    }, SETTLE_MS)
    return () => { gone = true; clearTimeout(timer) }
    // shown.name only names a failure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces, detail])

  // What each piece shows now: its cut at the detail asked for, else at Chunky, else (while it is cut again after a
  // turn or a resize) the cut it showed before, drawn where it now stands.
  const shownCut = useRef<(Cut | undefined)[]>([])
  const chosen = useMemo(() => {
    const before = shownCut.current
    const out = pieces.map((pc, i) => cuts.current.get(`${detail}|${pc.key}`) ?? cuts.current.get(`${DETAIL[0].id}|${pc.key}`) ?? (before[i]?.thing === pc.thing ? before[i] : undefined))
    shownCut.current = out
    return out
    // version: a cut arrived
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces, detail, version])
  const ready = chosen.every((c) => c)
  const done = ready && pieces.every((pc) => cuts.current.has(`${detail}|${pc.key}`))
  const signature = ready ? chosen.map((c) => c!.id).join(',') : ''
  const built = useMemo<Built[] | undefined>(() => (ready ? chosen.map((c) => unpack(c!.packed)) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature])

  // --- posing ---------------------------------------------------------------

  // what the poser reads each frame, kept current without rebuilding the stage
  const live = useRef({ shown, chosen, project, preview, posers: new Map<string, PlacedPoser>() })
  live.current = { ...live.current, shown, chosen, project, preview }
  /** Where prop `i` stands now: mid-gesture where it is going, else where the project says. */
  const placementOf = (i: number): Placement | undefined => (preview?.i === i ? preview.at : project?.props[i])

  useEffect(() => {
    if (!stage || !built) return
    const [land, ...props] = built
    const from = stage.time
    stage.setActor(land, undefined, props)
    stage.setPoser((sk: Skeleton, t: number) => {
      const L = live.current
      L.shown.poseLand(sk, t)
      const cpNow = L.shown.cp
      if (cpNow && L.project) {
        props.forEach((b, i) => {
          const cut = L.chosen[i + 1], placed = L.project!.props[i], p = cpNow.props[i]
          if (!cut || !placed || !p) return
          const now = L.preview?.i === i ? L.preview.at : placed
          // posed as it was cut, then drawn where it now stands
          const key = `${cut.id}|${placed.still ? 1 : 0}|${JSON.stringify(placed.prop)}`
          let poser = L.posers.get(key)
          if (!poser) { poser = new PlacedPoser(p.c, p.prop.foot, cut.at, placed.still); L.posers.set(key, poser) }
          poser.pose(b.skeleton, t)
          redrawn(b.skeleton, cut.at, now)
          b.skeleton.update()
        })
        // lights from where everything stands now
        const lights = [...cpNow.land.c.lights(t), ...cpNow.props.flatMap((p, i) => {
          const now = L.preview?.i === i ? L.preview.at : L.project!.props[i]
          return now ? new PlacedPoser(p.c, p.prop.foot, now, L.project!.props[i].still).lights(t) : []
        })]
        stage.setLights(lights, 1)
      } else {
        props.forEach((b, i) => L.shown.poseProp(i, b.skeleton, t))
        stage.setLights(L.shown.lights(t, stage.backend === 'webgpu'), L.shown.ambient)
      }
    }, from)
  }, [stage, built])
  useEffect(() => { stage?.invalidate() }, [stage, project, preview])

  const look = useMemo<PixelLook>(() => ({
    palette: shown.palette, dither: shown.finish.dither, outline: shown.finish.outline ? darkest(shown.palette) : null, glow: shown.finish.glow,
    edges: shown.finish.edges ? 1 : 0, parts: true, sky: shown.finish.sky ? shown.sky : undefined, steady: STEADY, tidy: true, fine: true, own: true,
  }), [shown.palette, shown.finish, shown.sky])
  useEffect(() => { stage?.setPixels(look, 2) }, [stage, look])
  useEffect(() => { if (stage) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit])
  useWheelZoom(canvas, setOrbit)

  // --- the ground and arranging --------------------------------------------

  // the land's still shapes, for dragging along the ground and standing a prop on it
  const landRef = project ? JSON.stringify(project.land) : ''
  const ground = useMemo<Shape[]>(() => {
    if (!cp) return []
    const spec = landSpec(cp, DETAIL[0].spacing)
    const root = spec.bones[0]?.name
    return spec.parts.filter((p) => p.bone === root && !p.glow && (p.opacity ?? 1) >= 0.9).map((p) => p.shape)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landRef])
  // off the land, a prop keeps its height
  const groundAt = (x: number, z: number, y: number) => { const g = groundUnder(ground, x, z, y + 3, y - 3); return g <= y - 3 ? y : g }
  const liftOf = (pl: Placement) => { const l = pl.at[1] - groundAt(pl.at[0], pl.at[2], pl.at[1]); return l < 0.015 ? 0 : l }
  const nameOfProp = (i: number) => shown.items[i + 1]?.name ?? 'Prop'

  const edit = (next: SceneProject, words: string) => {
    if (!hist || next === hist.now) return
    setHist(did(hist, next))
    setPreview(undefined)
    say(words)
  }
  /** Ends a gesture: where it was going becomes the project, one step to undo. */
  const commit = (words?: string) => {
    if (!preview || !project) return
    const { i, at } = preview
    const was = project.props[i]
    let next = project
    if (at.turn !== was.turn) next = turned(next, i, at.turn)
    if (at.size !== was.size) next = sized(next, i, at.size)
    if (at.at.some((v, k) => v !== was.at[k])) next = moved(next, i, at.at)
    edit(next, words ?? `${nameOfProp(i)} ${at.turn !== was.turn ? `turned to ${Math.round(at.turn)}°` : at.size !== was.size ? `sized ${fmt(at.size)} times` : `moved to ${fmt(at.at[0])}, ${fmt(at.at[2])}`}.`)
    setPreview(undefined)
  }
  const pick = (i: number | undefined) => {
    setPicked(i)
    setPreview(undefined)
    if (i !== undefined) { if (mode !== 'arrange') setMode('arrange'); say(`Picked ${nameOfProp(i)}.`) }
    else say('Nothing picked.')
  }
  const standAt = (i: number, x: number, z: number, lift: number): Vec3 => {
    const now = placementOf(i)!
    return [x, groundAt(x, z, now.at[1]) + lift, z]
  }
  const nudge = (i: number, dx: number, dz: number) => {
    const now = placementOf(i)!
    edit(moved(project!, i, standAt(i, now.at[0] + dx, now.at[2] + dz, liftOf(now))), `${nameOfProp(i)} moved to ${fmt(now.at[0] + dx)}, ${fmt(now.at[2] + dz)}.`)
  }
  const copyProp = (i: number) => {
    const now = placementOf(i)!
    const cut = chosen[i + 1]
    const reach = Math.max(0.08, (cut?.reach ?? 0.2) * (now.size / (cut?.at.size ?? 1)))
    const way = arrowWay('ArrowRight', orbit)!
    const x = now.at[0] + way[0] * reach * 1.6, z = now.at[2] + way[1] * reach * 1.6
    const next = copied(project!, i, [0, 0, 0])
    if (next === project) { say('A scene holds 40 props at most.'); return }
    const n = next.props.length - 1
    edit(moved(next, n, [x, groundAt(x, z, now.at[1]) + liftOf(now), z]), `Copied ${nameOfProp(i)}.`)
    setPicked(n)
  }
  const deleteProp = (i: number) => {
    edit(removed(project!, i), `Deleted ${nameOfProp(i)}.`)
    setPicked(undefined)
  }
  const doUndo = () => { if (hist?.past.length) { setHist(undo(hist)); setPreview(undefined); setPicked((p) => (p !== undefined && p < hist.past[hist.past.length - 1].props.length ? p : undefined)); say('Undone.') } }
  const doRedo = () => { if (hist?.future.length) { setHist(redo(hist)); setPreview(undefined); setPicked((p) => (p !== undefined && p < hist.future[0].props.length ? p : undefined)); say('Redone.') } }

  // the picked prop's ring on the ground and its turn handle, where the view shows them
  const pickedAt = picked !== undefined ? placementOf(picked) : undefined
  const ring = useMemo(() => {
    if (!stage || picked === undefined || !pickedAt) return
    const cut = chosen[picked + 1]
    const r = Math.max(0.05, (cut?.reach ?? 0.2) * 0.75 * (pickedAt.size / (cut?.at.size ?? 1)))
    const [x, y, z] = pickedAt.at
    const pts: string[] = []
    for (let k = 0; k <= 32; k++) {
      const a = (k / 32) * Math.PI * 2
      const s = stage.screenAt([x + Math.cos(a) * r, y + 0.01, z + Math.sin(a) * r], orbit)
      if (!s) return
      pts.push(`${s.x.toFixed(1)},${s.y.toFixed(1)}`)
    }
    const t = (pickedAt.turn * Math.PI) / 180
    const handle = stage.screenAt([x + Math.sin(t) * r * 1.25, y + 0.01, z + Math.cos(t) * r * 1.25], orbit)
    const middle = stage.screenAt([x, y, z], orbit)
    return { points: pts.join(' '), handle, middle, r }
  }, [stage, picked, pickedAt, chosen, orbit])

  // --- pointer and keys ------------------------------------------------------

  const hitProp = (x: number, y: number): number | undefined => {
    if (!stage || !built || !project) return
    const ray = stage.rayAt(x, y)
    if (!ray) return
    const hit = pickActors(built, ray.origin, ray.direction)
    return hit && hit.actor > 0 ? hit.actor - 1 : undefined
  }
  const groundFrom = (x: number, y: number, level: number): Vec3 | undefined => {
    const ray = stage?.rayAt(x, y)
    return ray ? onGround(ground, ray.origin, ray.direction, level) : undefined
  }
  const local = (ev: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: ev.clientX - r.left, y: ev.clientY - r.top }
  }
  const startTurn = (ev: React.PointerEvent) => {
    if (picked === undefined || !pickedAt) return
    ev.stopPropagation()
    canvas.current!.setPointerCapture(ev.pointerId)
    const p = local(ev)
    const g = groundFrom(p.x, p.y, pickedAt.at[1])
    const angle0 = g ? (Math.atan2(g[0] - pickedAt.at[0], g[2] - pickedAt.at[2]) * 180) / Math.PI : 0
    grab.current = { kind: 'turn', i: picked, from: p, offset: [0, 0], turn0: pickedAt.turn, angle0, moved: false }
  }

  const keys = (ev: React.KeyboardEvent) => {
    const mod = ev.ctrlKey || ev.metaKey
    if (mod && (ev.key === 'z' || ev.key === 'Z')) { ev.preventDefault(); if (ev.shiftKey) doRedo(); else doUndo(); return true }
    if (mod && (ev.key === 'y' || ev.key === 'Y')) { ev.preventDefault(); doRedo(); return true }
    if (picked === undefined || !project) return false
    const now = placementOf(picked)!
    const way = arrowWay(ev.key, orbit)
    if (way) {
      ev.preventDefault()
      const step = stepFor(orbit, ev.shiftKey)
      nudge(picked, way[0] * step, way[1] * step)
      return true
    }
    if (ev.key === '[' || ev.key === ']') {
      ev.preventDefault()
      const by = (ev.key === ']' ? 1 : -1) * (ev.shiftKey ? 5 : 15)
      edit(turned(project, picked, now.turn + by), `${nameOfProp(picked)} turned to ${Math.round(wrapTurn(now.turn + by))}°.`)
      return true
    }
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); deleteProp(picked); return true }
    if (ev.key === 'Escape') { ev.preventDefault(); pick(undefined); return true }
    return false
  }

  // for the browser checks
  useEffect(() => {
    if (!offscreen || !stage) return
    ;(window as unknown as { __creator: unknown }).__creator = {
      stage, items: () => shown.items, ready: () => !!done, blobs: () => (built ? built.reduce((n, b) => n + b.blobs.count, 0) : 0),
      props: () => project?.props ?? [], picked: () => picked, said: () => said,
      // where a prop's blobs are on the view, in CSS pixels: the middle of those that stand above its foot
      screenOf: (i: number) => {
        const b = built?.[i + 1]
        if (!b) return
        const sum = [0, 0, 0], m = b.skeleton.matrix, c = b.blobs.center, n = b.blobs.count - 1
        for (let k = 0; k < n; k++) {
          const j = b.skin.joints[k * 4] * 16
          for (let r = 0; r < 3; r++) sum[r] += m[j + r] * c[k * 3] + m[j + 4 + r] * c[k * 3 + 1] + m[j + 8 + r] * c[k * 3 + 2] + m[j + 12 + r]
        }
        return stage.screenAt([sum[0] / n, sum[1] / n, sum[2] / n])
      },
    }
  }, [offscreen, stage, shown, built, done, project, picked, said])

  const blobs = built ? built.reduce((n, b) => n + b.blobs.count, 0) : 0
  const props = project?.props.length ?? 0
  const waiting = !done && !failed
  const pickedCut = picked !== undefined ? chosen[picked + 1] : undefined
  const pickedLift = pickedAt ? liftOf(pickedAt) : 0

  /** On a slider's box: its drag shows where the prop is going, and letting go makes it one step to undo. */
  const gesture = { onPointerUp: () => commit(), onKeyUp: () => commit(), onBlur: () => commit() }

  return (
    <div ref={work} data-full={full || undefined} className={`flex flex-col bg-paper ${full === 'window' ? 'fixed inset-0 z-50' : full ? 'h-full' : 'h-[calc(100svh-3.5rem-1px)] min-h-[34rem]'}`}
      onKeyDown={(ev) => {
        // undo and redo anywhere in the workspace but a text box
        if (ev.target === canvas.current || (ev.target as HTMLElement).closest('input[type=text], input[type=search], textarea')) return
        if ((ev.ctrlKey || ev.metaKey) && /^[zy]$/i.test(ev.key)) keys(ev)
      }}>
      <div className="flex min-w-0 flex-none items-center gap-x-4 px-4 py-1.5 lg:py-2.5">
        <h1 className="flex-none font-display text-2xl lg:text-3xl">Scene Creator</h1>
        <p className="min-w-0 flex-1 truncate text-sm text-ink-muted">
          <span className="text-ink">{shown.name}</span>
          {props > 0 && <> · <span className="tabular-nums text-ink" data-testid="creator-prop-count">{props}</span> props</>}
          {blobs > 0 && <span className="max-sm:hidden"> · <span className="tabular-nums">{blobs.toLocaleString()}</span> blobs</span>}
        </p>
        {hist && (
          <div className="flex flex-none gap-1.5">
            <button type="button" onClick={doUndo} disabled={!hist.past.length} title="Undo (Ctrl+Z)" data-testid="creator-undo" className="min-h-9 cursor-pointer rounded-full border border-rule bg-paper px-3 text-sm font-semibold hover:border-ink-faint disabled:cursor-not-allowed disabled:opacity-50">Undo</button>
            <button type="button" onClick={doRedo} disabled={!hist.future.length} title="Redo (Ctrl+Shift+Z)" data-testid="creator-redo" className="min-h-9 cursor-pointer rounded-full border border-rule bg-paper px-3 text-sm font-semibold hover:border-ink-faint disabled:cursor-not-allowed disabled:opacity-50">Redo</button>
          </div>
        )}
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
                {!(m.id === 'arrange' && picked !== undefined) && <p className="text-sm text-ink-muted">{m.id === 'arrange' && !project ? 'This scene opened whole, so it has no props to arrange.' : m.note}</p>}
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
                          <li key={i}>
                            {it.kind === 'prop'
                              ? <button type="button" onClick={() => pick(i - 1)} className="flex w-full cursor-pointer items-baseline justify-between gap-2 px-3 py-1.5 text-left hover:bg-paper-sunk"><span>{it.name}</span><span className="text-xs text-ink-muted">Prop</span></button>
                              : <span className="flex items-baseline justify-between gap-2 px-3 py-1.5"><span>{it.name}</span><span className="text-xs text-ink-muted">{it.kind === 'land' ? 'Land' : 'Whole scene'}</span></span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
                {m.id === 'arrange' && project && (picked === undefined || !pickedAt ? (
                  <div>
                    <h3 id="creator-arrange-list" className="mb-2 text-sm font-semibold">Props</h3>
                    <ul aria-labelledby="creator-arrange-list" className="divide-y divide-rule rounded-lg border border-rule bg-paper text-sm" data-testid="creator-arrange-list">
                      {project.props.map((_, i) => (
                        <li key={i}><button type="button" onClick={() => pick(i)} className="w-full cursor-pointer px-3 py-1.5 text-left hover:bg-paper-sunk">{nameOfProp(i)}</button></li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="space-y-4" data-testid="creator-arrange">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold">{nameOfProp(picked)}</h3>
                      <button type="button" onClick={() => pick(undefined)} className="cursor-pointer text-sm text-accent-ink underline underline-offset-2">Done</button>
                    </div>
                    <div {...gesture}>
                      <Slider label="Turn" value={Math.round(pickedAt.turn)} min={-180} max={180} step={1} format={(v) => `${v}°`} onChange={(v) => setPreview({ i: picked, at: { ...pickedAt, turn: v } })} />
                    </div>
                    <div {...gesture}>
                      <Slider label="Size" value={pickedAt.size} min={0.25} max={Math.min(4, SIZE_RANGE[1])} step={0.05} format={(v) => `${fmt(v)}×`} onChange={(v) => setPreview({ i: picked, at: { ...pickedAt, size: v } })} />
                    </div>
                    <div {...gesture}>
                      <Slider label="Lift" value={Math.round(pickedLift * 100) / 100} min={0} max={LIFT_MOST} step={0.01} format={(v) => (v ? `${fmt(v)} up` : 'On the ground')} onChange={(v) => setPreview({ i: picked, at: { ...pickedAt, at: standAt(picked, pickedAt.at[0], pickedAt.at[2], v) } })} />
                    </div>
                    <Toggle label="Plays its own moves" checked={!project.props[picked].still} onChange={(on) => edit(stilled(project, picked, !on), `${nameOfProp(picked)} ${on ? 'moves again' : 'holds still'}.`)} />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => copyProp(picked)} data-testid="creator-copy" className="min-h-10 cursor-pointer rounded-full border border-rule bg-paper px-4 text-sm font-semibold hover:border-ink-faint">Copy</button>
                      <button type="button" onClick={() => deleteProp(picked)} data-testid="creator-delete" className="min-h-10 cursor-pointer rounded-full border border-rule bg-paper px-4 text-sm font-semibold hover:border-ink-faint">Delete</button>
                    </div>
                    {pickedCut && pickedCut.at.turn !== pickedAt.turn && <p className="text-xs text-ink-faint">Cut again for its new way of facing once you let go.</p>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section aria-label="Scene" className="relative order-1 min-h-0 flex-1 overflow-hidden bg-paper-sunk lg:order-3 lg:rounded-2xl lg:border lg:border-rule">
          <canvas
            ref={canvas}
            role="application"
            aria-roledescription="3D view"
            aria-label={`${shown.name}: ${shown.items.length === 1 ? 'one piece' : `a land and ${props} props`}, drawn as pixel art. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.${project ? ' Tap a prop to pick it; with one picked, the arrow keys move it, brackets turn it, Delete removes it and Escape lets it go.' : ''}`}
            tabIndex={0}
            data-testid="creator-view"
            className="absolute inset-0 h-full w-full cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset active:cursor-grabbing"
            onPointerDown={(ev) => {
              ev.currentTarget.setPointerCapture(ev.pointerId)
              pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
              const p = local(ev)
              press.current = p
              // a press on the prop that is picked drags it; anywhere else turns the view
              const hit = pointers.current.size === 1 ? hitProp(p.x, p.y) : undefined
              if (hit !== undefined && hit === picked && pickedAt) {
                const g = groundFrom(p.x, p.y, pickedAt.at[1]) ?? pickedAt.at
                grab.current = { kind: 'move', i: hit, from: p, offset: [g[0] - pickedAt.at[0], g[2] - pickedAt.at[2]], turn0: 0, angle0: 0, moved: false }
                drag.current = null
                return
              }
              grab.current = null
              drag.current = beginOrbitDrag(pointers.current, ev, orbit)
            }}
            onPointerMove={(ev) => {
              if (pointers.current.has(ev.pointerId)) pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
              const g = grab.current
              if (g) {
                const p = local(ev)
                if (!g.moved && Math.hypot(p.x - g.from.x, p.y - g.from.y) < TAP) return
                g.moved = true
                const now = placementOf(g.i)!
                const hitG = groundFrom(p.x, p.y, now.at[1])
                if (!hitG) return
                if (g.kind === 'move') setPreview({ i: g.i, at: { ...now, at: standAt(g.i, hitG[0] - g.offset[0], hitG[2] - g.offset[1], liftOf(project!.props[g.i])) } })
                else {
                  const angle = (Math.atan2(hitG[0] - now.at[0], hitG[2] - now.at[2]) * 180) / Math.PI
                  setPreview({ i: g.i, at: { ...now, turn: Math.round(wrapTurn(g.turn0 + angle - g.angle0)) } })
                }
                return
              }
              const d = drag.current
              if (d) setOrbit(dragOrbit(d, pointers.current, ev))
            }}
            onPointerUp={(ev) => {
              pointers.current.delete(ev.pointerId)
              const g = grab.current, p = local(ev), was = press.current
              grab.current = null; drag.current = null; press.current = null
              if (g?.moved) { commit(); return }
              // a tap picks the prop under it, or lets the picked one go
              if (was && Math.hypot(p.x - was.x, p.y - was.y) < TAP && project) {
                const hit = hitProp(p.x, p.y)
                if (hit !== picked) pick(hit)
              }
            }}
            onPointerCancel={(ev) => { pointers.current.delete(ev.pointerId); grab.current = null; drag.current = null; setPreview(undefined) }}
            onKeyDown={(ev) => {
              if (keys(ev)) return
              if (!orbitKey(ev, orbit)) return
              ev.preventDefault()
              setOrbit((o) => orbitKey(ev, o) ?? o)
            }}
          />
          {ring && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden data-testid="creator-ring">
              <polyline points={ring.points} fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="2" strokeDasharray="5 4" />
              {ring.middle && ring.handle && <line x1={ring.middle.x} y1={ring.middle.y} x2={ring.handle.x} y2={ring.handle.y} stroke="#fff" strokeOpacity="0.7" strokeWidth="1.5" />}
              {ring.handle && <circle cx={ring.handle.x} cy={ring.handle.y} r="9" fill="var(--c-blob)" stroke="#fff" strokeWidth="2" className="pointer-events-auto cursor-grab" onPointerDown={startTurn} data-testid="creator-turn-handle" />}
            </svg>
          )}
          {waiting && <LoadingMark testid="creator-loading" />}
          <p role="status" className="sr-only" data-testid="creator-status">{waiting && !built ? `Cutting ${shown.name}` : said}</p>
          {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(shown.orbit)} />
          <button type="button" aria-label={full ? 'Leave full screen' : 'Full screen'} title={full ? 'Leave full screen' : 'Full screen'} onClick={toggleFull} data-testid="full-screen" className="zoom-btn absolute bottom-2.5 left-2.5">
            <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              {full ? <path d="M6 2.5V6H2.5M10 2.5V6h3.5M6 13.5V10H2.5M10 13.5V10h3.5" /> : <path d="M2.5 6V2.5H6M13.5 6V2.5H10M2.5 10v3.5H6M13.5 10v3.5H10" />}
            </svg>
          </button>
          {!coarse && project && (
            <>
              <button type="button" popoverTarget={`${base}-keys`} title="Keyboard keys" className="absolute bottom-2.5 left-12 flex h-8 cursor-pointer items-center rounded-full border border-rule bg-paper px-3 text-xs font-semibold text-ink-muted hover:text-ink">Keys</button>
              <div id={`${base}-keys`} popover="auto" aria-label="Keyboard keys" className="m-auto w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-rule bg-paper p-4 text-sm text-ink shadow-xl" data-testid="creator-keys">
                <h2 className="mb-2 font-display text-lg">Keys</h2>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  <dt>Arrows</dt><dd>Move the picked prop (Shift for small steps); with none picked, turn the view</dd>
                  <dt><kbd>[</kbd> <kbd>]</kbd></dt><dd>Turn the picked prop (Shift for small turns)</dd>
                  <dt><kbd>Delete</kbd></dt><dd>Delete the picked prop</dd>
                  <dt><kbd>Esc</kbd></dt><dd>Let the prop go</dd>
                  <dt><kbd>Ctrl</kbd>+<kbd>Z</kbd></dt><dd>Undo (add Shift to redo)</dd>
                  <dt><kbd>+</kbd> <kbd>−</kbd></dt><dd>Zoom the view</dd>
                </dl>
                <p className="mt-2 text-xs text-ink-faint">Pick a prop from the list in Arrange; keys work while the view has focus.</p>
              </div>
            </>
          )}
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
