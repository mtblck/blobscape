import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Blobs, hexToRgb, pick, projectPoint, quatFacing, quatToMat, rgbToHex, type Lens, type Vec3 } from '../splat-core/blobs.ts'
import type { Orbit, SplatView } from '../splat-core/view.ts'
import { PRESETS } from '../splat-core/presets.ts'
import { blobsFromPreset, blobsFromSamples, sampleShape } from '../splat-core/shapes.ts'
import { Selection, bounds, centroid, flipUpright, frame, inPolygon, meanColor, scaleGroup, selectByColor, sitOnFloor, translate, turnY } from '../splat-core/ops.ts'
import { EFFECTS, bakeEffect, type EffectFrame, type EffectId, type EffectParams } from '../splat-core/effects.ts'
import { writePly } from '../splat-core/ply.ts'
import { ImportError, readSplatFile } from '../splat-core/importer.ts'
import { Button, Chip, Field, Panel, Slider, Tabs, Toggle } from '../shared/ui.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { Viewport, type ToolHandlers } from './Viewport.tsx'
import { drawBones, drawCenters, drawOutlines, themeColor, toScreen } from './overlay.ts'
import { History } from './history.ts'
import { takeHandOff } from './handoff.ts'
import { GAZES, ROAM, STILL, actorAt, actorBlobs, actorBones, canLook, canRoam, detailsOf, freezeInto, makeActor, poseAll, remake, type Actor } from './actors.ts'
import { CREATURES } from './creature/fromScenes.ts'
import { PROPS } from './props.ts'
import type { Creature as Body } from '../splat-engine/body.ts'
import { href } from './routes.ts'

type ToolId = 'orbit' | 'add' | 'spray' | 'select' | 'lasso' | 'move' | 'erase'
const TOOLS: { id: ToolId; name: string; note: string }[] = [
  { id: 'orbit', name: 'Look', note: 'Drag to orbit, scroll or pinch to zoom. With a mouse, right-drag (or Alt-drag) orbits whatever tool is picked.' },
  { id: 'add', name: 'Add', note: 'Click to place one blob, on the floor or on the surface of whatever you click.' },
  { id: 'spray', name: 'Spray', note: 'Drag to spray blobs inside the ring. They stick to whatever is under them, so you can build up layers.' },
  { id: 'select', name: 'Select', note: 'Click a blob to select it, or drag a box around many. Hold Shift to add to the selection. Then change it in the Selection tab.' },
  { id: 'lasso', name: 'Lasso', note: 'Draw round the blobs you want. Hold Shift to add to the selection.' },
  { id: 'move', name: 'Move', note: 'Drag to slide the selection across the screen. With nothing selected, it grabs the blob or creature under the pointer. Drag a creature to walk it somewhere else.' },
  { id: 'erase', name: 'Erase', note: 'Drag to remove every blob whose center is inside the ring.' },
]

const STARTS = [
  ...PRESETS.map((p) => ({ id: p.id, name: p.name, make: () => blobsFromPreset(p) })),
  { id: 'sphere', name: 'Sphere', make: () => blobsFromSamples(sampleShape('sphere', 2500), 0.035, true) },
  { id: 'empty', name: 'Empty', make: () => new Blobs() },
]

const SWATCHES = ['#e5484d', '#f2a65a', '#f5d90a', '#30a46c', '#3e9be0', '#8e4ec6', '#f4ede1', '#2b2620']
const OUTLINE_LIMIT = 1500
const SELECT_OUTLINES = 3000
const FILE_TYPES = '.ply,.spz,.splat,.ksplat,.sog'
const PLAY_SECONDS = 2.5
const MAX_ACTORS = 8
/** What the Creatures tab can add: the zoo, then things from the other experiments (a slime, the watch). */
const ADDABLE = [...CREATURES, ...PROPS]
type ShowRig = 'blobs' | 'bones' | 'both'
const SHOW_RIG: { id: ShowRig; label: string }[] = [{ id: 'blobs', label: 'Blobs' }, { id: 'bones', label: 'Bones' }, { id: 'both', label: 'Both' }]
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const aOr = (s: string) => `${/^[aeiou]/i.test(s) ? 'an' : 'a'} ${s}`
const kilo = (n: number) => (n >= 1000 ? `${n / 1000}k` : String(n))

/** Where an effect works from: the middle, size and floor of what it acts on (with any creatures, each as the box it stands in). */
function effectFrame(b: Blobs, sel: Selection | null, actors: readonly Actor[] = []): EffectFrame {
  const bb = bounds(b, sel) ?? (actors.length ? { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] } : null)
  if (!bb) return { center: [0, 0.5, 0], radius: 1, floor: 0 }
  const lo = [...bb.lo], hi = [...bb.hi]
  for (const a of actors) {
    // Walking about, it may be anywhere in its disc
    const r = a.height * (0.5 + a.roam)
    lo[0] = Math.min(lo[0], a.at[0] - r); hi[0] = Math.max(hi[0], a.at[0] + r)
    lo[1] = Math.min(lo[1], a.at[1]); hi[1] = Math.max(hi[1], a.at[1] + a.height)
    lo[2] = Math.min(lo[2], a.at[2] - r); hi[2] = Math.max(hi[2], a.at[2] + r)
  }
  return {
    center: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2],
    radius: Math.max(0.05, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2),
    floor: lo[1],
  }
}

type Marquee = { kind: 'box'; x0: number; y0: number; x1: number; y1: number } | { kind: 'lasso'; pts: number[] }

export function Sandbox() {
  const h1 = useFocusHeading()
  const [handed] = useState(takeHandOff)
  // Built once: a useRef argument would be rebuilt (and thrown away) on every render
  const [initial] = useState(() => handed?.blobs ?? STARTS[0].make())
  const blobsRef = useRef<Blobs>(initial)
  const [version, setVersion] = useState(0)
  // The first blob index changed since the last sync, so a spray stroke only uploads its new blobs
  const syncFrom = useRef(0)
  const bump = useCallback((from = 0) => {
    syncFrom.current = Math.min(syncFrom.current, from)
    setVersion((v) => v + 1)
  }, [])
  const [source, setSource] = useState(handed ? handed.name : STARTS[0].name)
  const sourceRef = useRef(source)
  sourceRef.current = source
  const [orbit, setOrbit] = useState<Orbit>(() => ({ ...frame(blobsRef.current), azimuth: 30, elevation: 22 }))
  const [view, setView] = useState<SplatView | null>(null)
  // Imports can be big; a few snapshots of a large scene is all undo keeps
  const history = useRef(new History(160 * 1024 * 1024))

  // On a touchscreen one finger can't both orbit and paint, so start in Look there
  const coarse = useMemo(() => window.matchMedia('(pointer: coarse)').matches, [])
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  // Phones run out of memory sooner
  const maxBlobs = coarse ? 400_000 : 1_000_000
  const [tool, setTool] = useState<ToolId>(coarse ? 'orbit' : 'spray')
  const [color, setColor] = useState('#f2a65a')
  const [size, setSize] = useState(Math.log2(0.05))
  const [spread, setSpread] = useState(40)
  const [density, setDensity] = useState(6)
  const [flat, setFlat] = useState(true)
  const [opacity, setOpacity] = useState(0.9)
  const [xray, setXray] = useState(false)
  const [reach, setReach] = useState(Math.sqrt(8))
  const [tolerance, setTolerance] = useState(0.12)
  const selRef = useRef(new Selection())
  const [selVersion, setSelVersion] = useState(0)
  const selChanged = () => setSelVersion((v) => v + 1)
  const hover = useRef<{ x: number; y: number } | null>(null)
  const marquee = useRef<Marquee | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const opening = useRef(false)

  // Effects
  const [effect, setEffect] = useState<EffectId | null>(null)
  const [amount, setAmount] = useState(0.5)
  const [target, setTarget] = useState<'all' | 'selection'>('all')
  const [running, setRunning] = useState(false)
  const time = useRef(0)

  // Creatures: kept beside the scene and posed every frame into their own layer (actors.ts)
  const [actors, setActors] = useState<readonly Actor[]>([])
  const actorsRef = useRef(actors)
  actorsRef.current = actors
  const [currentKey, setCurrentKey] = useState<number | null>(null)
  const current = actors.find((a) => a.key === currentKey) ?? actors[actors.length - 1]
  const [playing, setPlaying] = useState(!reducedMotion)
  const [showRig, setShowRig] = useState<ShowRig>('blobs')
  const showRef = useRef(showRig)
  showRef.current = showRig
  const orbitRef = useRef(orbit)
  orbitRef.current = orbit
  const clocks = useRef(new Map<number, number>())
  // Every creature as drawn this frame, one after another, and where each starts
  const drawn = useRef(new Blobs())
  const starts = useRef<number[]>([])
  const scratch = useRef(new WeakMap<Body, Blobs>())
  const maxActorBlobs = coarse ? 40_000 : 100_000
  const actorCount = actorBlobs(actors)

  const blobs = blobsRef.current
  const sel = selRef.current
  const blobSize = 2 ** size
  // Status messages ("Undone") fade after a moment
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(''), 2500)
    return () => clearTimeout(t)
  }, [message])

  // --- edits ---------------------------------------------------------------
  const clearSel = () => { if (sel.count) { sel.clear(); selChanged() } }
  const replace = (next: Blobs, name?: string) => {
    blobsRef.current = next
    setError('')
    clearSel()
    if (name) setSource(name)
    bump()
  }
  const edit = (fn: (b: Blobs) => void) => {
    history.current.record(blobsRef.current, source, actorsRef.current)
    fn(blobsRef.current)
    bump()
  }
  const now = () => ({ blobs: blobsRef.current, source, actors: actorsRef.current })
  const undo = () => { const b = history.current.undo(now()); if (b) { replace(b.blobs, b.source); setActors(b.actors ?? []); setMessage('Undone') } }
  const redo = () => { const b = history.current.redo(now()); if (b) { replace(b.blobs, b.source); setActors(b.actors ?? []); setMessage('Redone') } }

  const start = (s: (typeof STARTS)[number]) => {
    history.current.record(blobsRef.current, source, actorsRef.current)
    const b = s.make()
    replace(b, s.name)
    setOrbit((o) => ({ ...o, ...frame(b) }))
  }

  // Keyboard: undo/redo anywhere on the page, Delete for the selection
  useEffect(() => {
    const on = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement
      if (t.closest('input, textarea, select')) return
      const mod = ev.metaKey || ev.ctrlKey
      if (mod && ev.key.toLowerCase() === 'z') { ev.preventDefault(); if (ev.shiftKey) redo(); else undo() }
      else if (mod && ev.key.toLowerCase() === 'y') { ev.preventDefault(); redo() }
      else if ((ev.key === 'Delete' || ev.key === 'Backspace') && sel.count && t.closest('[data-testid=viewport]')) { ev.preventDefault(); deleteSelected() }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  })

  // --- opening and saving files ----------------------------------------------
  const fileInput = useRef<HTMLInputElement>(null)
  const [upright, setUpright] = useState(true)
  const maxFileBytes = coarse ? 400e6 : 1.5e9
  const openFile = async (file: File) => {
    // One at a time: two big files decoding at once could run the tab out of memory
    if (opening.current) return
    opening.current = true
    setError('')
    setBusy(true)
    setMessage(`Opening ${file.name}…`)
    let decoded = false
    try {
      if (file.size > maxFileBytes) {
        setError(`${file.name} is ${(file.size / 1e9).toFixed(1)} GB, more than this device can open here (${(maxFileBytes / 1e9).toFixed(1)} GB). A compressed .spz or .sog of the same scene is much smaller.`)
        return
      }
      const bytes = await file.arrayBuffer()
      decoded = true
      const { blobs: b, step: n, dropped } = await readSplatFile(bytes, file.name, maxBlobs)
      if (!b.count) throw new Error('empty')
      if (upright) flipUpright(b)
      sitOnFloor(b)
      // The scene's name now, not when the file started opening
      history.current.record(blobsRef.current, sourceRef.current, actorsRef.current)
      replace(b, file.name)
      setOrbit((o) => ({ ...o, ...frame(b) }))
      const skipped = dropped ? `, skipping ${dropped.toLocaleString()} broken ones` : ''
      setMessage(n > 1 ? `Opened ${file.name}, keeping 1 blob in ${n} (${b.count.toLocaleString()})${skipped}` : `Opened ${file.name}: ${b.count.toLocaleString()} blobs${skipped}`)
    } catch (err) {
      console.warn(err)
      setMessage('')
      const why = err instanceof ImportError ? err.message : err instanceof RangeError ? 'This file is too big for this device.' : 'The sandbox reads Gaussian splat files: .ply, .spz, .splat, .ksplat and .sog.'
      // Spark's decoder can stop working after a file it chokes on; checked files never get that far
      const stuck = decoded && !(err instanceof ImportError && (err.kind === 'mesh' || (err.kind === 'damaged' && /header/.test(err.message))))
      setError(`Couldn't open ${file.name}. ${why}${stuck ? ' If other files stop opening too, reload the page.' : ''}`)
    } finally {
      setBusy(false)
      opening.current = false
    }
  }
  const [dragOver, setDragOver] = useState(false)
  // A file dropped just outside the view would otherwise make the browser open it and lose the scene
  useEffect(() => {
    const stop = (ev: DragEvent) => { if (ev.dataTransfer?.types.includes('Files')) ev.preventDefault() }
    window.addEventListener('dragover', stop)
    window.addEventListener('drop', stop)
    return () => { window.removeEventListener('dragover', stop); window.removeEventListener('drop', stop) }
  }, [])
  const onDrop = (ev: React.DragEvent) => {
    ev.preventDefault()
    setDragOver(false)
    const f = ev.dataTransfer.files[0]
    if (f) void openFile(f)
  }

  const exportPly = () => {
    const all = everything()
    const bytes = writePly(all)
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${source.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'blobscape'}.ply`
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    setMessage(`Saved ${all.count.toLocaleString()} blobs${all !== blobsRef.current ? ', creatures as they stand now' : ''}`)
  }

  // --- placing blobs ---------------------------------------------------------
  /** Where a screen point lands: on the nearest blob, else the floor, else a plane through the target. */
  const land = (x: number, y: number): { p: Vec3; n: Vec3 } | null => {
    if (!view) return null
    const { origin, dir } = view.ray(x, y)
    const o: Vec3 = [origin.x, origin.y, origin.z], d: Vec3 = [dir.x, dir.y, dir.z]
    const b = blobsRef.current
    const hit = b.count ? pick(b, o, d, 1.5, 0.2) : { index: -1, t: Infinity }
    if (hit.index >= 0) {
      // A blob's surface normal is its thinnest axis, turned to face the camera
      const s = b.scale.subarray(hit.index * 3, hit.index * 3 + 3)
      const a = s[0] < s[1] ? (s[0] < s[2] ? 0 : 2) : s[1] < s[2] ? 1 : 2
      const R = quatToMat(b.quat.subarray(hit.index * 4, hit.index * 4 + 4))
      let n: Vec3 = [R[a], R[3 + a], R[6 + a]]
      if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] > 0) n = [-n[0], -n[1], -n[2]]
      // A round blob has no thin axis: use the direction back toward the camera
      if (Math.max(s[0], s[1], s[2]) < Math.min(s[0], s[1], s[2]) * 1.5) n = [-d[0], -d[1], -d[2]]
      return { p: [o[0] + d[0] * hit.t, o[1] + d[1] * hit.t, o[2] + d[2] * hit.t], n }
    }
    if (d[1] < -0.02) {
      const t = -o[1] / d[1]
      if (t > 0 && t < orbit.distance * 6) return { p: [o[0] + d[0] * t, 0, o[2] + d[2] * t], n: [0, 1, 0] }
    }
    // Otherwise a plane through the orbit target, facing the camera
    const tg = orbit.target
    const t = ((tg[0] - o[0]) * d[0] + (tg[1] - o[1]) * d[1] + (tg[2] - o[2]) * d[2])
    return t > 0 ? { p: [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t], n: [-d[0], -d[1], -d[2]] } : null
  }

  const place = (b: Blobs, at: { p: Vec3; n: Vec3 } | null, jitter: number) => {
    if (b.count >= maxBlobs) { setMessage(`The sandbox holds up to ${maxBlobs.toLocaleString()} blobs`); return false }
    if (!at) return false
    const rgb = hexToRgb(color)
    const s = blobSize * (1 - jitter / 2 + Math.random() * jitter)
    const shade = 1 - jitter * 0.15 + Math.random() * jitter * 0.3
    b.push({
      center: at.p,
      scale: [s, s * (1 - jitter / 3 + Math.random() * jitter / 3), flat ? s * 0.15 : s],
      quat: quatFacing(at.n),
      color: [rgb[0] * shade, rgb[1] * shade, rgb[2] * shade],
      opacity,
    })
    return true
  }

  /**
   * One dab: find the surface under the ring's center once, then scatter the
   * dab's blobs over that surface's tangent plane, sized so the scatter
   * matches the ring on screen. One pick per dab, not one per blob.
   */
  const sprayAt = (x: number, y: number) => {
    const b = blobsRef.current
    const at = land(x, y)
    if (!at || !view) return
    const lens = view.lens()
    const depth = Math.max(0.01, Math.hypot(at.p[0] - view.camera.position.x, at.p[1] - view.camera.position.y, at.p[2] - view.camera.position.z))
    const radius = (spread * depth) / lens.fx
    // Two directions across the surface
    const n = at.n
    const helper: Vec3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    const u = norm(cross(helper, n)), v = cross(n, u)
    const from = b.count
    for (let k = 0; k < density; k++) {
      const r = radius * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2
      const cu = Math.cos(a) * r, cv = Math.sin(a) * r
      place(b, { p: [at.p[0] + u[0] * cu + v[0] * cv, at.p[1] + u[1] * cu + v[1] * cv, at.p[2] + u[2] * cu + v[2] * cv], n }, 0.5)
    }
    if (b.count > from) changed(from)
  }

  const eraseAt = (x: number, y: number, lens: Lens) => {
    const b = blobsRef.current
    const r2 = spread * spread
    const removed = b.filter((i) => {
      const p = toScreen(b.center.subarray(i * 3, i * 3 + 3), lens)
      return !p || (p[0] - x) ** 2 + (p[1] - y) ** 2 > r2
    })
    if (removed) { clearSel(); changed() }
  }

  const deleteSelected = () => {
    const n = sel.count
    edit((b) => b.filter((i) => !sel.has(i)))
    setMessage(`Deleted ${n.toLocaleString()} blobs`)
    sel.clear()
    selChanged()
  }

  /** The blob under a screen point, or -1. Faded blobs stay pickable. */
  const blobAt = (x: number, y: number) => {
    if (!view) return -1
    const { origin, dir } = view.ray(x, y)
    return pick(blobsRef.current, [origin.x, origin.y, origin.z], [dir.x, dir.y, dir.z], 2, 0).index
  }

  /** Says how many are selected, for everyone, and for screen readers through the live status line. */
  const announce = (prefix = '') => {
    selChanged()
    setMessage(`${prefix}${sel.count ? `${sel.count.toLocaleString()} selected` : 'Nothing selected'}`)
  }
  const selectAt = (x: number, y: number, add: boolean) => {
    const hit = blobAt(x, y)
    if (!add) sel.clear()
    if (hit >= 0) sel.set(hit, !(add && sel.has(hit)))
    announce(hit < 0 ? 'No blob there. ' : '')
  }

  /** Selects every blob whose center lands inside a screen polygon (x, y pairs). */
  const selectInPolygon = (poly: number[], add: boolean) => {
    if (!view || poly.length < 6) return
    const lens = view.lens(), b = blobsRef.current
    if (!add) sel.clear()
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity
    for (let k = 0; k < poly.length; k += 2) { xmin = Math.min(xmin, poly[k]); xmax = Math.max(xmax, poly[k]); ymin = Math.min(ymin, poly[k + 1]); ymax = Math.max(ymax, poly[k + 1]) }
    const at = [0, 0, 0]
    for (let i = 0; i < b.count; i++) {
      at[0] = b.center[i * 3]; at[1] = b.center[i * 3 + 1]; at[2] = b.center[i * 3 + 2]
      const p = projectPoint(at, lens)
      if (!p || p.x < xmin || p.x > xmax || p.y < ymin || p.y > ymax) continue
      if (inPolygon(p.x, p.y, poly)) sel.set(i, true)
    }
    announce()
  }

  /**
   * A Move drag: the selection's depth and its first index, worked out once
   * on pointer-down, and whether the scene has been copied for undo yet.
   */
  const grab = useRef<{ depth: number; from: number; copied: boolean } | null>(null)
  const startMove = () => {
    if (!view || !sel.count) { grab.current = null; return }
    const b = blobsRef.current
    let from = 0
    while (from < b.count && !sel.has(from)) from++
    grab.current = { depth: projectPoint(centroid(b, sel), view.lens())?.depth ?? orbit.distance, from, copied: false }
  }
  /** Slides the selection by a screen-space drag, at the depth of its center. */
  const moveBy = (dx: number, dy: number) => {
    const g = grab.current
    if (!view || !g || (!dx && !dy)) return
    // Copy for undo only once something actually moves
    if (!g.copied) { before.current = blobsRef.current.clone(); g.copied = true }
    const b = blobsRef.current, lens = view.lens()
    const V = lens.view
    // The view matrix's rows are the camera's right and up directions in the world
    const right: Vec3 = [V[0], V[4], V[8]], up: Vec3 = [V[1], V[5], V[9]]
    const kx = (dx * g.depth) / lens.fx, ky = (-dy * g.depth) / lens.fy
    translate(b, sel, [right[0] * kx + up[0] * ky, right[1] * kx + up[1] * ky, right[2] * kx + up[2] * ky])
    // Only blobs from the first selected one on need re-sending
    changed(g.from)
  }

  const last = useRef<{ x: number; y: number; shift: boolean; x0: number; y0: number } | null>(null)
  // A stroke's "before" picture goes into the history only once the stroke changes something
  const before = useRef<Blobs | null>(null)
  const changed = (from = 0) => {
    if (before.current) { history.current.keep({ blobs: before.current, source, actors: actorsRef.current }); before.current = null }
    bump(from)
  }
  const handlers: ToolHandlers | undefined = tool === 'orbit' ? undefined : {
    cursor: tool === 'select' ? 'pointer' : tool === 'move' ? 'move' : 'crosshair',
    down: (x, y, ev) => {
      const shift = ev.shiftKey || ev.metaKey || ev.ctrlKey
      last.current = { x, y, shift, x0: x, y0: y }
      if (tool === 'select') return
      if (tool === 'lasso') { marquee.current = { kind: 'lasso', pts: [x, y] }; return }
      if (tool === 'move') {
        if (!sel.count && grabActor(x, y)) return
        if (!sel.count) { const hit = blobAt(x, y); if (hit >= 0) { sel.set(hit, true); selChanged() } }
        startMove()
        return
      }
      before.current = blobsRef.current.clone()
      if (tool === 'add') { const from = blobsRef.current.count; if (place(blobsRef.current, land(x, y), 0)) changed(from) }
      else if (tool === 'spray') sprayAt(x, y)
      else if (tool === 'erase' && view) eraseAt(x, y, view.lens())
    },
    move: (x, y) => {
      const l = last.current
      if (!l || tool === 'add') return
      if (tool === 'select') {
        if (marquee.current || Math.hypot(x - l.x0, y - l.y0) > 4) marquee.current = { kind: 'box', x0: l.x0, y0: l.y0, x1: x, y1: y }
        view?.invalidate(1)
        return
      }
      if (tool === 'lasso') {
        const m = marquee.current
        if (m?.kind === 'lasso' && Math.hypot(x - l.x, y - l.y) >= 3) { m.pts.push(x, y); last.current = { ...l, x, y }; view?.invalidate(1) }
        return
      }
      if (tool === 'move') { if (actorGrab.current) dragActor(x, y); else moveBy(x - l.x, y - l.y); last.current = { ...l, x, y }; return }
      // Space the dabs out so a slow drag doesn't pile blobs up in one spot
      if (Math.hypot(x - l.x, y - l.y) < Math.max(4, spread / 3)) return
      last.current = { ...l, x, y }
      if (tool === 'spray') sprayAt(x, y)
      else if (tool === 'erase' && view) eraseAt(x, y, view.lens())
    },
    up: () => {
      const l = last.current, m = marquee.current
      if (l && tool === 'select') {
        if (m?.kind === 'box') selectInPolygon([m.x0, m.y0, m.x1, m.y0, m.x1, m.y1, m.x0, m.y1], l.shift)
        else selectAt(l.x0, l.y0, l.shift)
      } else if (l && tool === 'lasso' && m?.kind === 'lasso') selectInPolygon(m.pts, l.shift)
      if (m) view?.invalidate(1)
      last.current = null
      before.current = null
      marquee.current = null
      grab.current = null
      actorGrab.current = null
    },
    // Enter or Space on the focused view uses the tool at the center (a keyboard stand-in for a click)
    // With Move, the arrow keys slide the selection instead of orbiting (Shift for bigger steps)
    key: tool === 'move' ? (ev) => {
      const step = ev.shiftKey ? 40 : 10
      const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[ev.key]
      if (!d) return false
      const c = actorsRef.current.find((a) => a.key === currentKey) ?? actorsRef.current[actorsRef.current.length - 1]
      if (sel.count) nudge(d[0], d[1])
      else if (c) stepActor(c, d[0], d[1])
      else setMessage('Select some blobs first')
      return true
    } : undefined,
    activate: (x, y, shift) => {
      if (tool === 'select' || tool === 'lasso') { selectAt(x, y, shift); return }
      if (tool === 'move') return
      before.current = blobsRef.current.clone()
      if (tool === 'add') { const from = blobsRef.current.count; if (place(blobsRef.current, land(x, y), 0)) changed(from) }
      else if (tool === 'spray') sprayAt(x, y)
      else if (tool === 'erase' && view) eraseAt(x, y, view.lens())
      before.current = null
      hover.current = { x, y }
    },
    hover: (x, y) => {
      hover.current = x === null || y === null ? null : { x, y }
      view?.invalidate(1)
    },
  }

  // --- selection edits --------------------------------------------------------
  const recolorSelected = () => {
    const rgb = hexToRgb(color)
    edit((b) => { for (let i = 0; i < b.count; i++) if (sel.has(i)) b.color.set(rgb, i * 3) })
    setMessage('Painted')
  }
  const eachSelected = (fn: (b: Blobs, i: number) => void, done: string) => {
    edit((b) => { for (let i = 0; i < b.count; i++) if (sel.has(i)) fn(b, i) })
    setMessage(done)
  }
  const resizeSelected = (k: number, done: string) => eachSelected((b, i) => { for (let a = 0; a < 3; a++) b.scale[i * 3 + a] *= k }, done)
  const fadeSelected = (k: number, done: string) => eachSelected((b, i) => { b.opacity[i] = Math.max(0.02, Math.min(1, b.opacity[i] * k)) }, done)
  const turnSelected = (deg: number) => { edit((b) => turnY(b, sel, centroid(b, sel), deg)); setMessage(`Turned ${Math.abs(deg)}° ${deg < 0 ? 'left' : 'right'}`) }
  const scaleSelected = (k: number) => { edit((b) => scaleGroup(b, sel, centroid(b, sel), k)); setMessage(k > 1 ? 'Spread out' : 'Pulled together') }
  const nudge = (dx: number, dy: number) => { startMove(); moveBy(dx, dy); grab.current = null; setMessage('Moved') }
  const selectAll = () => { sel.all(blobsRef.current.count); announce() }
  const invertSel = () => { sel.invert(blobsRef.current.count); announce() }
  const selectNone = () => { clearSel(); announce() }
  const selectColor = () => {
    selectByColor(blobsRef.current, sel, hexToRgb(color), tolerance)
    announce()
  }
  const takeColor = () => { const c = meanColor(blobsRef.current, sel); if (c) setColor(rgbToHex(c)) }

  // --- effects -----------------------------------------------------------------
  const fx = effect ? EFFECTS.find((e) => e.id === effect)! : null
  const onSelection = target === 'selection'
  const fxCount = !effect ? 0 : onSelection ? sel.count : blobs.count
  // On the whole scene, an effect moves the creatures too (as they stand: freezing one keeps it)
  const fxCreatures = !effect || onSelection ? 0 : actorCount
  const fxFrame = useMemo(
    () => effectFrame(blobsRef.current, onSelection ? selRef.current : null, onSelection ? [] : actors),
    // The blobs and selection are mutable: their version numbers are what change. The creatures count
    // by where they stand, not where they are this frame, so the effect doesn't swim with them
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, selVersion, onSelection, actors],
  )
  const params = (a = amount): EffectParams | null => (effect ? { ...fxFrame, kind: effect, amount: a, time: time.current } : null)

  // An effect on the selection needs the selected blobs first on the GPU: changing that order means a full upload
  const ordered = !!effect && onSelection
  const orderKey = ordered ? `sel-${selVersion}` : 'list'
  const lastOrder = useRef('list')
  useEffect(() => {
    if (orderKey !== lastOrder.current) bump()
  }, [orderKey, bump])
  const takeSync = useCallback(() => {
    const was = lastOrder.current
    lastOrder.current = orderKey
    const f = syncFrom.current
    syncFrom.current = Infinity
    // Appended blobs are unselected, so they land at the end in list order: same order, only they need sending
    if (ordered) return { from: was === orderKey ? f : 0, order: selRef.current.selectedFirst(blobsRef.current.count) }
    return { from: was !== 'list' ? 0 : f }
  }, [ordered, orderKey])

  // The latest effect settings, for the animation loop to read without restarting
  const live = useRef({ params, fxCount, fxCreatures })
  live.current = { params, fxCount, fxCreatures }
  // Until the selection is first on the GPU, the first fxCount slots are the wrong blobs: hold the effect back
  useEffect(() => { void view?.setEffect(params(), ordered && lastOrder.current !== orderKey ? 0 : fxCount, fxCreatures) })

  const chooseEffect = (id: EffectId | null) => {
    setEffect(id)
    const loops = id ? EFFECTS.find((e) => e.id === id)!.loops : false
    setRunning(loops && !reducedMotion)
    if (id && !loops && amount === 0) setAmount(0.5)
  }
  // Looping effects run on a clock; one-shot effects play their amount from 0 to 1
  useEffect(() => {
    if (!running || !view || !fx) return
    let raf = 0, prev = performance.now()
    const t0 = prev
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - prev) / 1000)
      prev = now
      if (fx.loops) {
        time.current += dt
        const p = live.current.params()
        if (p) void view.setEffect(p, live.current.fxCount, live.current.fxCreatures)
      } else {
        const a = Math.min(1, (now - t0) / 1000 / PLAY_SECONDS)
        setAmount(a)
        if (a >= 1) { setRunning(false); return }
      }
      raf = requestAnimationFrame(tick)
    }
    if (!fx.loops) setAmount(0)
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running, view, fx])

  const bake = () => {
    const p = params()
    if (!p || !fxCount) return
    const order = ordered ? sel.selectedFirst(blobsRef.current.count) : null
    edit((b) => bakeEffect(b, p, order, fxCount))
    setRunning(false)
    setEffect(null)
    setMessage(`${fx!.name} made permanent${fxCreatures ? '. The creatures are as they were: freeze one first to keep an effect on it' : ''}`)
  }

  // --- creatures ---------------------------------------------------------------
  /** Where a creature looks: the camera, or the middle of the view. */
  const gazeAt = (a: Actor): Vec3 => {
    const { target, distance, azimuth, elevation } = orbitRef.current
    if (a.gaze === 'middle') return target
    const az = (azimuth * Math.PI) / 180, el = (Math.max(-89, Math.min(89, elevation)) * Math.PI) / 180
    return [target[0] + distance * Math.sin(az) * Math.cos(el), target[1] + distance * Math.sin(el), target[2] + distance * Math.cos(az) * Math.cos(el)]
  }
  /** Poses every creature at its own clock and sends the layer to the view. */
  const drawActors = useCallback(() => {
    const list = actorsRef.current
    starts.current = poseAll(list, (a) => clocks.current.get(a.key) ?? 0, drawn.current, scratch.current, gazeAt)
    if (!view) return
    void view.syncLayer(list.length && showRef.current !== 'bones' ? drawn.current : null)
    view.invalidate(2)
  }, [view])
  // After an add, the camera takes in everything once the newcomer has been posed
  const frameNext = useRef(false)
  useEffect(() => {
    drawActors()
    if (frameNext.current) { frameNext.current = false; setOrbit((o) => ({ ...o, ...frameAll() })) }
  }, [drawActors, actors, showRig]) // eslint-disable-line react-hooks/exhaustive-deps
  const anyActors = actors.length > 0
  // A creature watching you, or the middle of the view, follows the camera even when it's still
  const watching = actors.some((a) => a.gaze !== 'ahead')
  useEffect(() => { if (watching) drawActors() }, [orbit, watching, drawActors])
  useEffect(() => {
    if (!view || !playing || !anyActors) return
    let raf = 0, prev = performance.now()
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      // Phones pose at most 30 times a second; still creatures are drawn when they change, not every frame
      if (coarse && now - prev < 30) return
      const dt = Math.max(0, Math.min(0.1, (now - prev) / 1000))
      prev = now
      const list = actorsRef.current
      for (const a of list) clocks.current.set(a.key, (clocks.current.get(a.key) ?? 0) + dt * a.speed)
      if (list.some((a) => a.move !== STILL || a.roam > 0)) drawActors()
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [view, playing, anyActors, drawActors, coarse])

  /** A change to the list of creatures that Undo can take back. */
  const recordActors = () => { lastRun.current = ''; history.current.record(blobsRef.current, source, actorsRef.current) }
  /** A change to one creature (place, size, move) that isn't worth an undo step. */
  const changeActor = (key: number, fn: (a: Actor) => Actor) => setActors((list) => list.map((a) => (a.key === key ? fn(a) : a)))
  /**
   * The same, as an undo step: one per click, and one per run of a slider
   * (`run` names it; moving the same slider again keeps adding to that step).
   */
  const lastRun = useRef('')
  const tweak = (key: number, fn: (a: Actor) => Actor, run = '') => {
    if (!run || lastRun.current !== `${key}:${run}`) recordActors()
    lastRun.current = run && `${key}:${run}`
    changeActor(key, fn)
  }

  /** The ground under the middle of the view: where the scene's lowest blobs are, else y = 0. */
  const floorY = () => bounds(blobsRef.current, null)?.lo[1] ?? 0
  const addActor = (sp: (typeof ADDABLE)[number]) => {
    const list = actorsRef.current
    if (list.length >= MAX_ACTORS) { setMessage(`The sandbox holds up to ${MAX_ACTORS} creatures`); return }
    const detail = detailsOf(sp)[0]
    if (actorBlobs(list) + detail > maxActorBlobs) { setMessage(`Creatures can have ${maxActorBlobs.toLocaleString()} blobs between them here. Remove or freeze one first.`); return }
    // Sized to the scene, keeping the zoo's sizes to each other: a fox comes up about half way up a sample
    const bb = bounds(blobsRef.current, null)
    const fit = Math.min(4, Math.max(0.2, bb ? (bb.hi[1] - bb.lo[1]) / 2.4 : 0.5))
    // Beside the scene, taking turns right and left of it along the camera's right, a little in front
    const az = (orbit.azimuth * Math.PI) / 180
    const right: Vec3 = [Math.cos(az), 0, -Math.sin(az)], ahead: Vec3 = [Math.sin(az), 0, Math.cos(az)]
    const n = list.length
    const across = bb ? Math.min(orbit.distance * 0.3, Math.hypot(bb.hi[0] - bb.lo[0], bb.hi[2] - bb.lo[2]) / 2) : 0
    const gap = Math.max(0.25, orbit.distance * 0.12)
    const step = (n % 2 ? -1 : 1) * (across + gap * (0.5 + Math.floor(n / 2)))
    const out = across * 0.3
    const at: Vec3 = [orbit.target[0] + right[0] * step + ahead[0] * out, floorY(), orbit.target[2] + right[2] * step + ahead[2] * out]
    // Turned three-quarters to the camera, so a walk shows its legs
    const a = makeActor(sp, { detail, at, height: 1, yaw: orbit.azimuth - 40 })
    const added = { ...a, height: a.rest.height * fit }
    recordActors()
    clocks.current.set(added.key, 0)
    setActors([...list, added])
    setCurrentKey(added.key)
    frameNext.current = true
    setMessage(`Added ${aOr(sp.name)}`)
  }
  const removeActor = (a: Actor) => {
    recordActors()
    setActors(actorsRef.current.filter((x) => x.key !== a.key))
    setMessage(`Removed the ${a.species.name}`)
  }
  /** Turns a creature, as it stands now, into ordinary blobs every tool can work on. */
  const freezeActor = (a: Actor) => {
    const k = actorsRef.current.findIndex((x) => x.key === a.key)
    if (k < 0) return
    const from = blobsRef.current.count
    if (from + a.body.blobs.count > maxBlobs) { setMessage(`The sandbox holds up to ${maxBlobs.toLocaleString()} blobs`); return }
    drawActors()
    recordActors()
    freezeInto(drawn.current, starts.current[k], a.body.blobs.count, blobsRef.current)
    setActors(actorsRef.current.filter((x) => x.key !== a.key))
    bump(from)
    setMessage(`Froze the ${a.species.name} into the scene: ${a.body.blobs.count.toLocaleString()} blobs`)
  }
  const reshape = (a: Actor, look: string, detail: number) => {
    if (actorBlobs(actorsRef.current) - a.body.blobs.count + detail > maxActorBlobs) { setMessage(`Creatures can have ${maxActorBlobs.toLocaleString()} blobs between them here`); return }
    tweak(a.key, (x) => remake(x, look, detail))
  }
  const bringHere = (a: Actor) => tweak(a.key, (x) => ({ ...x, at: [orbit.target[0], floorY(), orbit.target[2]] }))

  /** Walks a creature across the floor by a screen-space step (the arrow keys with Move and nothing selected). */
  const stepActor = (a: Actor, dx: number, dy: number) => {
    const az = (orbit.azimuth * Math.PI) / 180
    // A tenth of the arrow key's pixels as a share of the camera distance: 2% a press, 8% with Shift
    const k = orbit.distance * 0.002
    const right = [Math.cos(az), -Math.sin(az)], away = [-Math.sin(az), -Math.cos(az)]
    const sx = dx * k, sy = -dy * k
    tweak(a.key, (x) => ({ ...x, at: [x.at[0] + right[0] * sx + away[0] * sy, x.at[1], x.at[2] + right[1] * sx + away[1] * sy] }), 'step')
    setMessage(`Moved the ${a.species.name}`)
  }

  /** A creature drag with Move: the ground plane it slides on, and where on it the pointer took hold. */
  const actorGrab = useRef<{ key: number; y: number; dx: number; dz: number; recorded: boolean } | null>(null)
  const groundAt = (x: number, y: number, h: number): [number, number] | null => {
    if (!view) return null
    const { origin: o, dir: d } = view.ray(x, y)
    if (Math.abs(d.y) < 1e-4) return null
    const t = (h - o.y) / d.y
    return t > 0 && t < orbit.distance * 20 ? [o.x + d.x * t, o.z + d.z * t] : null
  }
  /** Takes hold of the creature under the pointer, if it's nearer than any scene blob there. */
  const grabActor = (x: number, y: number) => {
    if (!view || !actorsRef.current.length || showRef.current === 'bones') return false
    const { origin, dir } = view.ray(x, y)
    const o = [origin.x, origin.y, origin.z], d = [dir.x, dir.y, dir.z]
    const hit = actorAt(drawn.current, starts.current, o, d)
    if (hit.index < 0) return false
    const scene = blobsRef.current.count ? pick(blobsRef.current, o, d, 1.5, 0.2) : { index: -1, t: Infinity }
    if (scene.index >= 0 && scene.t < hit.t) return false
    const a = actorsRef.current[hit.index]
    const g = groundAt(x, y, a.at[1])
    // Its spot keeps its distance from the pointer, so one walking about carries on round wherever it's dropped
    actorGrab.current = { key: a.key, y: a.at[1], dx: g ? a.at[0] - g[0] : 0, dz: g ? a.at[2] - g[1] : 0, recorded: false }
    setCurrentKey(a.key)
    return true
  }
  const dragActor = (x: number, y: number) => {
    const g = actorGrab.current
    const p = g && groundAt(x, y, g.y)
    if (!g || !p) return
    if (!g.recorded) { recordActors(); g.recorded = true }
    changeActor(g.key, (a) => ({ ...a, at: [p[0] + g.dx, g.y, p[1] + g.dz] }))
  }

  /** The scene and its creatures together: what Frame looks at and what Save writes. */
  const everything = () => {
    if (!drawn.current.count || !actorsRef.current.length) return blobsRef.current
    const all = blobsRef.current.clone()
    freezeInto(drawn.current, 0, drawn.current.count, all)
    return all
  }
  const frameAll = () => frame(everything())

  // --- overlay -----------------------------------------------------------------
  const overlay = (ctx: CanvasRenderingContext2D, lens: Lens) => {
    const b = blobsRef.current
    if (showRig !== 'blobs') for (const a of actorsRef.current) drawBones(ctx, actorBones(a, clocks.current.get(a.key) ?? 0), lens, themeColor('accent', ctx.canvas))
    if (xray) {
      if (b.count <= OUTLINE_LIMIT) drawOutlines(ctx, b, lens, { sigmas: [2] })
      else drawCenters(ctx, b, lens, themeColor('ink'))
    }
    // While an effect moves blobs on the GPU, outlines at their real places would float in the wrong spot
    if (sel.count && !effect) {
      const accent = themeColor('accent')
      if (sel.count <= SELECT_OUTLINES) drawOutlines(ctx, b, lens, { indices: sel.indices(b.count), sigmas: [2], color: accent, width: 1.5 })
      else {
        // Too many to outline: a dot on each selected center
        ctx.fillStyle = accent
        const stride = Math.max(1, Math.ceil(sel.count / 30000))
        let k = 0
        for (let i = 0; i < b.count; i++) {
          if (!sel.has(i) || k++ % stride) continue
          const p = toScreen(b.center.subarray(i * 3, i * 3 + 3), lens)
          if (p) ctx.fillRect(p[0] - 1, p[1] - 1, 2, 2)
        }
      }
    }
    const m = marquee.current
    if (m) {
      ctx.strokeStyle = themeColor('accent')
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      if (m.kind === 'box') ctx.rect(Math.min(m.x0, m.x1), Math.min(m.y0, m.y1), Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0))
      else { ctx.moveTo(m.pts[0], m.pts[1]); for (let k = 2; k < m.pts.length; k += 2) ctx.lineTo(m.pts[k], m.pts[k + 1]); ctx.closePath() }
      ctx.stroke()
      ctx.setLineDash([])
    }
    // Keyboard users aim at the center: mark it while the view has focus
    const c = ctx.canvas
    if (tool !== 'orbit' && c.matches(':focus-visible')) {
      const cx = c.clientWidth / 2, cy = c.clientHeight / 2
      ctx.strokeStyle = themeColor('accent')
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(cx - 9, cy); ctx.lineTo(cx - 3, cy); ctx.moveTo(cx + 3, cy); ctx.lineTo(cx + 9, cy)
      ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy - 3); ctx.moveTo(cx, cy + 3); ctx.lineTo(cx, cy + 9)
      ctx.stroke()
    }
    const h = hover.current
    if (h && (tool === 'spray' || tool === 'erase')) {
      ctx.strokeStyle = themeColor(tool === 'erase' ? 'ink' : 'accent')
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.arc(h.x, h.y, spread, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  const toolNote = tool === 'orbit' && coarse ? 'Drag to orbit, pinch to zoom. Pick another tool to change the scene, then come back here to turn it.' : TOOLS.find((t) => t.id === tool)!.note
  const none = !sel.count
  // A button that disables itself (Delete, Make it permanent) would drop focus to the page: keep it in the panel
  const lastFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const el = lastFocus.current
    if (!el || !(el as HTMLButtonElement).disabled || (document.activeElement && document.activeElement !== document.body)) return
    el.closest('[role=tabpanel]')?.querySelector<HTMLElement>('button:not(:disabled), input:not([type=file]):not(:disabled)')?.focus()
  })
  // What Enter does on the focused view, per tool
  const toolKeyNote: Partial<Record<ToolId, string>> = {
    add: '; press Enter to add a blob at the center',
    spray: '; press Enter to spray at the center',
    erase: '; press Enter to erase at the center',
    select: '; press Enter to select the blob at the center, Shift+Enter to add it',
    lasso: '; press Enter to select the blob at the center, Shift+Enter to add it',
  }

  return (
    <>
      <Crumbs here="Sandbox" />
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-2 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Sandbox</h1>
        <p className="max-w-xl text-lg text-ink-muted">Every tool from the lessons, on any scene. Spray blobs into space, open a real capture, pick it apart, blow it up.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        <section
          aria-label="Scene"
          className="min-w-0 space-y-3"
          onDragOver={(ev) => { if (ev.dataTransfer.types.includes('Files')) { ev.preventDefault(); setDragOver(true) } }}
          onDragLeave={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setDragOver(false) }}
          onDrop={onDrop}
        >
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tool">
            {TOOLS.map((t) => <Chip key={t.id} active={tool === t.id} onClick={() => setTool(t.id)}>{t.name}</Chip>)}
            <span className="ml-auto flex gap-1.5">
              <Button small onClick={undo} disabled={!history.current.canUndo} aria-keyshortcuts="Control+Z Meta+Z">Undo</Button>
              <Button small onClick={redo} disabled={!history.current.canRedo} aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z">Redo</Button>
            </span>
          </div>
          <Viewport
            blobs={blobs}
            version={version}
            orbit={orbit}
            setOrbit={setOrbit}
            reach={reach}
            onView={(v) => { setView(v); v.setFloor(true, themeColor('ink-faint')) }}
            tool={handlers}
            overlay={overlay}
            takeSync={takeSync}
            label={`Sandbox scene with ${blobs.count.toLocaleString()} blobs${actors.length ? ` and ${actors.length === 1 ? 'a' : actors.length} creature${actors.length === 1 ? '' : 's'}: ${actors.map((a) => a.species.name + (a.roam > 0 ? ' walking about' : '')).join(', ')}` : ''}. ${tool === 'move' ? `With the Move tool, the arrow keys slide the selection${actors.length ? `, or with nothing selected walk the ${current.species.name}` : ''} (Shift for bigger steps)` : 'Drag or use the arrow keys to orbit'}, plus and minus to zoom${toolKeyNote[tool] ?? ''}.`}
            home={() => ({ ...frameAll(), azimuth: 30, elevation: 22 })}
            hint={coarse ? (tool === 'orbit' ? 'drag to orbit · pinch to zoom' : 'pinch to zoom · pick Look to orbit') : tool === 'orbit' ? 'drag to orbit · scroll to zoom' : 'right-drag to orbit · scroll to zoom'}
          >
            {dragOver && (
              <div aria-hidden className="pointer-events-none absolute inset-2 grid place-items-center rounded-md border-2 border-dashed border-accent bg-paper/70 text-sm text-ink">
                Drop a splat file to open it
              </div>
            )}
          </Viewport>
          <p role="alert" className="text-sm text-accent-ink empty:hidden">{error}</p>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-ink-muted">
            <span><span className="tabular-nums text-ink" data-testid="blob-count">{blobs.count.toLocaleString()}</span> blobs</span>
            {actors.length > 0 && <span>+ <span className="tabular-nums text-ink" data-testid="creature-blob-count">{actorCount.toLocaleString()}</span> in {actors.length === 1 ? 'a creature' : `${actors.length} creatures`}</span>}
            {sel.count > 0 && <span><span className="tabular-nums text-accent-ink" data-testid="selected-count">{sel.count.toLocaleString()}</span> selected</span>}
            <span className="min-w-0 truncate text-ink-faint">Started from: {source}</span>
            <span aria-live="polite" className="ml-auto text-ink-faint">{message}</span>
          </div>
          <p className="text-sm text-ink-faint">{toolNote}</p>
        </section>

        <section aria-label="Sandbox settings" className="min-w-0" onFocus={(ev) => { lastFocus.current = ev.target as HTMLElement }}>
          <Tabs
            label="Sandbox settings"
            tabs={[
              {
                id: 'brush',
                label: 'Brush',
                summary: `${blobSize.toFixed(3)} · ${flat ? 'flat' : 'round'}`,
                content: (
                  <Panel note="What Add and Spray put down. Each new blob takes the brush color, with a little variation so sprayed patches don't look flat.">
                    <Field label="Color">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {SWATCHES.map((c) => (
                          <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className={`h-7 w-7 cursor-pointer rounded-full border-2 transition-transform hover:scale-110 ${color === c ? 'border-ink' : 'border-rule'}`} style={{ background: c }} />
                        ))}
                        <input type="color" aria-label="Any color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-rule bg-transparent" />
                      </div>
                    </Field>
                    <Slider label="Blob size" value={size} min={-7} max={-1} step={0.05} onChange={setSize} format={(v) => (2 ** v).toFixed(3)} />
                    <Slider label="Opacity" value={opacity} min={0.05} max={1} step={0.01} onChange={setOpacity} format={(v) => `${Math.round(v * 100)}%`} />
                    <Slider label="Brush radius" value={spread} min={4} max={120} step={1} onChange={setSpread} format={(v) => `${v}px`} hint="The ring for Spray and Erase." />
                    <Slider label="Density" value={density} min={1} max={30} step={1} onChange={setDensity} format={(v) => `${v} per dab`} />
                    <Toggle label="Flat discs (off = round balls)" checked={flat} onChange={setFlat} />
                  </Panel>
                ),
              },
              {
                id: 'selection',
                label: 'Selection',
                summary: sel.count ? `${sel.count.toLocaleString()} blobs` : 'None',
                content: (
                  <Panel note="Pick blobs with Select or Lasso, or by color here. Edits apply to every selected blob and can be undone.">
                    <div className="flex flex-wrap gap-2">
                      <Button small onClick={selectAll} disabled={!blobs.count}>Select all</Button>
                      <Button small onClick={selectNone} disabled={none}>Select none</Button>
                      <Button small onClick={invertSel} disabled={!blobs.count}>Invert</Button>
                    </div>
                    <Field label="By color">
                      <div className="flex flex-wrap gap-2">
                        <Button small onClick={selectColor} disabled={!blobs.count}>
                          <span aria-hidden className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: color }} />
                          Select blobs near the brush color
                        </Button>
                        <Button small onClick={takeColor} disabled={none}>Use their color for the brush</Button>
                      </div>
                    </Field>
                    <Slider label="Color tolerance" value={tolerance} min={0.02} max={0.5} step={0.01} onChange={setTolerance} format={(v) => `${Math.round(v * 100)}%`} />
                    <Field label="Arrange">
                      <div className="flex flex-wrap gap-2">
                        <Button small onClick={() => turnSelected(-15)} disabled={none}>Turn left</Button>
                        <Button small onClick={() => turnSelected(15)} disabled={none}>Turn right</Button>
                        <Button small onClick={() => nudge(-20, 0)} disabled={none}>Slide left</Button>
                        <Button small onClick={() => nudge(20, 0)} disabled={none}>Slide right</Button>
                        <Button small onClick={() => nudge(0, -20)} disabled={none}>Slide up</Button>
                        <Button small onClick={() => nudge(0, 20)} disabled={none}>Slide down</Button>
                        <Button small onClick={() => scaleSelected(1.2)} disabled={none}>Spread out</Button>
                        <Button small onClick={() => scaleSelected(1 / 1.2)} disabled={none}>Pull together</Button>
                      </div>
                    </Field>
                    <Field label="Change each blob">
                      <div className="flex flex-wrap gap-2">
                        <Button small onClick={recolorSelected} disabled={none}>
                          <span aria-hidden className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: color }} />
                          Paint with brush color
                        </Button>
                        <Button small onClick={() => resizeSelected(1.25, 'Grown')} disabled={none}>Grow</Button>
                        <Button small onClick={() => resizeSelected(0.8, 'Shrunk')} disabled={none}>Shrink</Button>
                        <Button small onClick={() => resizeSelected(0.05, 'Turned to dots')} disabled={none}>To dots</Button>
                        <Button small onClick={() => fadeSelected(1.25, 'More opaque')} disabled={none}>More opaque</Button>
                        <Button small onClick={() => fadeSelected(0.6, 'Faded')} disabled={none}>Fade</Button>
                        <Button small onClick={deleteSelected} disabled={none}>Delete</Button>
                      </div>
                    </Field>
                  </Panel>
                ),
              },
              {
                id: 'creatures',
                label: 'Creatures',
                summary: actors.length ? `${actors.length} added` : 'None',
                content: (
                  <Panel note="Creatures from Splat Creatures, a slime from Dungeon Run and the watch from Clockwork, moving in your scene. Drag one with the Move tool (or, with nothing selected, use the arrow keys on the view) to put it somewhere else. Brushes and selections leave them alone until you freeze one into ordinary blobs. An effect on the whole scene moves them too, but only on screen: freeze one to keep it.">
                    <Field label="Add">
                      <div className="flex flex-wrap gap-1.5" data-testid="add-creature">
                        {ADDABLE.map((sp) => <Button small key={sp.id} aria-label={`Add ${aOr(sp.name)}`} onClick={() => addActor(sp)} disabled={actors.length >= MAX_ACTORS || actorCount + detailsOf(sp)[0] > maxActorBlobs}>{cap(sp.name)}</Button>)}
                      </div>
                    </Field>
                    {actorCount > 0 && ADDABLE.every((sp) => actorCount + detailsOf(sp)[0] > maxActorBlobs) && actors.length < MAX_ACTORS && (
                      <p className="text-xs text-ink-faint">That's as many blobs as creatures can have between them here ({maxActorBlobs.toLocaleString()}). Remove or freeze one to add another.</p>
                    )}
                    {actors.length >= MAX_ACTORS && <p className="text-xs text-ink-faint">That's {MAX_ACTORS} creatures, the most the sandbox holds. Remove or freeze one to add another.</p>}
                    {current && (
                      <>
                        {actors.length > 1 && (
                          <Field label="Working on">
                            <div className="flex flex-wrap gap-1.5">
                              {actors.map((a, k) => <Chip key={a.key} active={a === current} onClick={() => setCurrentKey(a.key)}>{cap(a.species.name)}{actors.filter((x) => x.species === a.species).length > 1 ? ` ${actors.filter((x, j) => x.species === a.species && j <= k).length}` : ''}</Chip>)}
                            </div>
                          </Field>
                        )}
                        <Field label="Move">
                          <div className="flex flex-wrap gap-1.5">
                            {current.species.moves.map((m) => <Chip key={m.name} active={current.move === m.name} onClick={() => tweak(current.key, (a) => ({ ...a, move: m.name }))}>{m.label}</Chip>)}
                            <Chip active={current.move === STILL} onClick={() => tweak(current.key, (a) => ({ ...a, move: STILL }))}>Still</Chip>
                          </div>
                        </Field>
                        {canRoam(current) && (
                          <div>
                            <Toggle label="Walk about" checked={current.roam > 0} onChange={(on) => tweak(current.key, (a) => ({ ...a, roam: on ? ROAM : 0 }))} />
                            {current.roam > 0 && <Slider label="How far" value={current.roam} min={1} max={8} step={0.25} onChange={(v) => tweak(current.key, (a) => ({ ...a, roam: v }), 'roam')} format={(v) => `${v.toFixed(1)} × its height`} />}
                          </div>
                        )}
                        {canLook(current) && (
                          <Field label="Looks at">
                            <div className="flex flex-wrap gap-1.5">
                              {GAZES.map((g) => <Chip key={g.id} active={current.gaze === g.id} onClick={() => tweak(current.key, (a) => ({ ...a, gaze: g.id }))}>{g.label}</Chip>)}
                            </div>
                          </Field>
                        )}
                        <Slider label="Speed" value={current.speed} min={0.1} max={2} step={0.05} onChange={(v) => tweak(current.key, (a) => ({ ...a, speed: v }), 'speed')} format={(v) => `×${v.toFixed(2)}`} />
                        <Slider label="Size" value={Math.log2(current.height)} min={-5} max={4} step={0.05} onChange={(v) => tweak(current.key, (a) => ({ ...a, height: 2 ** v }), 'size')} format={(v) => `${(2 ** v).toFixed(2)} tall`} />
                        <Slider label="Facing" value={((current.yaw % 360) + 360) % 360} min={0} max={359} step={1} onChange={(v) => tweak(current.key, (a) => ({ ...a, yaw: v }), 'facing')} format={(v) => `${Math.round(v)}°`} />
                        {current.species.looks.length > 1 && (
                          <Field label="Look">
                            <div className="flex flex-wrap gap-1.5">
                              {current.species.looks.map((l) => <Chip key={l.id} active={current.look === l.id} onClick={() => reshape(current, l.id, current.detail)}>{l.label}</Chip>)}
                            </div>
                          </Field>
                        )}
                        <Field label="Blobs">
                          <div className="flex flex-wrap gap-1.5">
                            {detailsOf(current.species).filter((n) => n === current.detail || actorCount - current.body.blobs.count + n <= maxActorBlobs).map((n) => <Chip key={n} active={current.detail === n} onClick={() => reshape(current, current.look, n)}>{kilo(n)}</Chip>)}
                          </div>
                        </Field>
                        <div className="flex flex-wrap gap-2">
                          <Button small onClick={() => bringHere(current)}>Bring to the middle of the view</Button>
                          <Button small onClick={() => freezeActor(current)}>Freeze into the scene</Button>
                          <Button small onClick={() => removeActor(current)}>Remove</Button>
                        </div>
                      </>
                    )}
                    {anyActors && (
                      <>
                        <Field label="Show creatures as">
                          <div className="flex flex-wrap gap-1.5">
                            {SHOW_RIG.map((v) => <Chip key={v.id} active={showRig === v.id} onClick={() => setShowRig(v.id)}>{v.label}</Chip>)}
                          </div>
                        </Field>
                        <div className="flex flex-wrap gap-2">
                          <Button small onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause them' : 'Play them'}</Button>
                        </div>
                      </>
                    )}
                    <p className="text-xs text-ink-faint">
                      They're posed on your device's processor each frame, so here they come in their lighter sizes. Bigger ones, and taking one away as a 3D model, are on the <a href={href({ page: 'creature' })} className="underline hover:text-accent">Splat Creatures</a> page.
                    </p>
                  </Panel>
                ),
              },
              {
                id: 'effects',
                label: 'Effects',
                summary: fx ? fx.name : 'None',
                content: (
                  <Panel note="Effects run on the GPU, so they work on a million blobs. They're a preview until you make them permanent.">
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Effect">
                      <Chip active={!effect} onClick={() => chooseEffect(null)}>None</Chip>
                      {EFFECTS.map((e) => <Chip key={e.id} active={effect === e.id} onClick={() => chooseEffect(e.id)}>{e.name}</Chip>)}
                    </div>
                    {fx && <p className="text-sm text-ink-faint">{fx.note}</p>}
                    <Slider label="Amount" value={amount} min={0} max={1} step={0.01} onChange={(v) => { if (!fx?.loops) setRunning(false); setAmount(v) }} format={(v) => `${Math.round(v * 100)}%`} />
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Apply to">
                      <Chip active={!onSelection} onClick={() => setTarget('all')}>Whole scene</Chip>
                      <Chip active={onSelection} onClick={() => setTarget('selection')}>Selection only</Chip>
                    </div>
                    {onSelection && none && effect && <p className="text-sm text-ink-faint">Nothing is selected, so nothing moves.</p>}
                    <div className="flex flex-wrap gap-2">
                      <Button small onClick={() => setRunning((r) => !r)} disabled={!fx} aria-pressed={fx?.loops ? running : undefined}>{running ? (fx?.loops ? 'Pause' : 'Stop') : 'Play'}</Button>
                      <Button small primary onClick={bake} disabled={!fx || !fxCount}>Make it permanent</Button>
                    </div>
                  </Panel>
                ),
              },
              {
                id: 'scene',
                label: 'Scene',
                summary: source,
                content: (
                  <Panel note="Start again from a sample or open a capture of your own. The current scene can still be brought back with Undo.">
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Start from">
                      {STARTS.map((s) => <Chip key={s.id} active={source === s.name} onClick={() => start(s)}>{s.name}</Chip>)}
                    </div>
                    <Field label="Your own splats">
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <Button small onClick={() => { if (!busy) fileInput.current?.click() }} aria-disabled={busy}>{busy ? 'Opening…' : 'Open a splat file…'}</Button>
                          <Button small onClick={exportPly} disabled={!blobs.count && !actors.length}>Save as .ply</Button>
                        </div>
                        <input ref={fileInput} type="file" accept={FILE_TYPES} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void openFile(f) }} />
                        <p className="text-xs text-ink-faint">
                          .ply, .spz, .splat, .ksplat or .sog, or drop one on the view. It stays on your device. Scenes over {maxBlobs.toLocaleString()} blobs are thinned to fit. Saved files open in most splat viewers.
                        </p>
                        {error && <p className="text-sm text-accent-ink">{error}</p>}
                        <Toggle label="Turn captures the right way up on opening" checked={upright} onChange={setUpright} />
                      </div>
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      <Button small onClick={() => { edit(flipUpright); setOrbit((o) => ({ ...o, ...frame(blobsRef.current) })) }} disabled={!blobs.count}>Flip upside down</Button>
                      <Button small onClick={() => { edit(sitOnFloor); setOrbit((o) => ({ ...o, ...frame(blobsRef.current) })) }} disabled={!blobs.count}>Sit on the floor</Button>
                      <Button small onClick={() => setOrbit((o) => ({ ...o, ...frameAll() }))}>Frame the scene</Button>
                    </div>
                    <Toggle label="X-ray" checked={xray} onChange={setXray} />
                    <p className="text-xs text-ink-faint">X-ray outlines every blob up to {OUTLINE_LIMIT.toLocaleString()}; past that it shows centers as dots.</p>
                    <Slider label="Reach" value={reach} min={0.5} max={3} step={0.01} onChange={setReach} format={(v) => `${v.toFixed(2)}σ`} hint="How far out each blob is drawn. Turn it down to see the individual blobs in a dense scene." />
                  </Panel>
                ),
              },
            ]}
          />
        </section>
      </div>
    </>
  )
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
