import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Blobs, hexToRgb, pick, projectPoint, quatFacing, quatToMat, rgbToHex, type Lens, type Vec3 } from '../splat-core/blobs.ts'
import type { Orbit, SplatView } from '../splat-core/view.ts'
import { PRESETS } from '../splat-core/presets.ts'
import { blobsFromPreset, blobsFromSamples, sampleShape } from '../splat-core/shapes.ts'
import { Selection, bounds, centroid, flipUpright, frame, inPolygon, meanColor, scaleGroup, selectByColor, sitOnFloor, translate, turnY } from '../splat-core/ops.ts'
import { EFFECTS, bakeEffect, type EffectFrame, type EffectId, type EffectParams } from '../splat-core/effects.ts'
import { writePly } from '../splat-core/ply.ts'
import { ImportError, readSplatFile } from '../splat-core/importer.ts'
import { Button, Chip, Field, Panel, Slider, Toggle } from '../shared/ui.tsx'
import { useFocusHeading } from './Shell.tsx'
import { useFullScreen } from '../shared/Workbench.tsx'
import { MODES, ModeBar, ToolButton, Icon, addressFor, modeFrom, panelId, tabId, type ModeId } from './sandbox/modes.tsx'
import { Viewport, type ToolHandlers } from './Viewport.tsx'
import { drawBones, drawCenters, drawOutlines, themeColor, toScreen } from './overlay.ts'
import { History } from './history.ts'
import { takeHandOff } from './handoff.ts'
import { groundOf, wireOf } from '../splat-engine/colliders.ts'
import { GAZES, ROAM, STILL, actorAt, actorBlobs, actorBones, canLook, canRoam, detailsOf, freezeInto, makeActor, poseAll, remake, type Actor } from './actors.ts'
import { CREATURES } from './creature/fromScenes.ts'
import { PROPS } from './props.ts'
import type { Creature as Body } from '../splat-engine/body.ts'
import { href } from './routes.ts'
import { GlbError, readRiggedGlb, writeRiggedGlb, type Rigged } from '../splat-engine/glb.ts'
import { MeshFileError } from '../splat-engine/meshFile.ts'
import { isMeshGlb, rigFromModel } from './modelRig.ts'
import { fillHole, stampDab } from './patch.ts'
import { BRUSHES, brushDab, type BrushId } from './brushes.ts'
import { MAX_STOPS, PATH_FPS, pathAt, pathSeconds } from './cameraPath.ts'
import { fileSpecies, sceneRig, splitScene } from './sceneFile.ts'
import { registerTools, sandboxTools, type SandboxApi } from './agentTools.ts'
import { blobsInMasks } from './tapSelect.ts'
import { thingAt } from './select/thing.ts'
import { SCENE_SPACING, readDoc } from './build/scene.ts'
import { buildVoxels } from '../splat-engine/voxel.ts'

type ToolId = 'orbit' | BuildTool | SelectTool
type BuildTool = 'add' | 'spray' | 'paint' | 'erase' | 'fill' | 'stamp'
type SelectTool = 'select' | 'lasso' | 'move'
const BUILD_TOOLS: BuildTool[] = ['add', 'spray', 'paint', 'erase', 'fill', 'stamp']
const SELECT_TOOLS: SelectTool[] = ['select', 'lasso', 'move']
/** The address keeps the mode, so a reload or a shared link opens where it was. */
const history_replace = (m: ModeId) => { if (typeof location !== 'undefined') history.replaceState(history.state, '', addressFor(location.href, m)) }
const TOOLS: { id: ToolId; name: string; note: string }[] = [
  { id: 'orbit', name: 'Look around', note: 'Drag to turn the view, scroll or pinch to zoom. With a mouse, right-drag (or Alt-drag) turns it whatever tool is held; on a touchscreen, two fingers do.' },
  { id: 'add', name: 'Add', note: 'Click to place one blob, on the floor or on the surface of whatever you click.' },
  { id: 'spray', name: 'Spray', note: 'Drag to spray blobs inside the ring. They stick to whatever is under them, so you can build up layers.' },
  { id: 'paint', name: 'Paint', note: 'Drag to paint grass, fur, moss, stones or leaves onto whatever is under the ring. Pick which in the Brush tab.' },
  { id: 'select', name: 'Select', note: 'Click a blob to select it, or drag a box around many. Hold Shift to add to the selection. Then change it in the Selection tab.' },
  { id: 'lasso', name: 'Lasso', note: 'Draw round the blobs you want. Hold Shift to add to the selection.' },
  { id: 'move', name: 'Move', note: 'Drag to slide the selection across the screen. With nothing selected, it grabs the blob or creature under the pointer. Drag a creature to walk it somewhere else.' },
  { id: 'erase', name: 'Erase', note: 'Drag to remove every blob whose center is inside the ring.' },
  { id: 'fill', name: 'Fill', note: 'Click or drag over a hole. Blobs grow in from its edge, in the size, facing and colors of the ones beside them.' },
  { id: 'stamp', name: 'Stamp', note: 'Click what you want to copy, then drag somewhere else to paint a copy of it there.' },
]

const STARTS = [
  ...PRESETS.map((p) => ({ id: p.id, name: p.name, make: () => blobsFromPreset(p) })),
  { id: 'sphere', name: 'Sphere', make: () => blobsFromSamples(sampleShape('sphere', 2500), 0.035, true) },
  { id: 'empty', name: 'Empty', make: () => new Blobs() },
]

const SWATCHES = ['#e5484d', '#f2a65a', '#f5d90a', '#30a46c', '#3e9be0', '#8e4ec6', '#f4ede1', '#2b2620']
const OUTLINE_LIMIT = 1500
const SELECT_OUTLINES = 3000
const FILE_TYPES = '.ply,.spz,.splat,.ksplat,.sog,.glb'
const PLAY_SECONDS = 2.5
const MAX_ACTORS = 8
/** Blobs laid on an opened rigged model (half on phones), and the fewest worth laying. */
const MODEL_BLOBS = 40_000
const MODEL_MIN = 4_000
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
  const base = useId()
  const work = useRef<HTMLDivElement>(null)
  const { full, toggle: toggleFull } = useFullScreen(work)
  // The phone's tray: short, or dragged up for the rest of a panel
  const [tall, setTall] = useState(false)
  const trayDrag = useRef<number | null>(null)
  // While the workspace has the screen the floating tip button would sit on the view's controls: it waits for the footer
  useEffect(() => {
    const el = work.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const root = document.documentElement
    const io = new IntersectionObserver(([e]) => { if (e.intersectionRatio > 0.5) root.dataset.workspace = ''; else delete root.dataset.workspace }, { threshold: [0, 0.5, 1] })
    io.observe(el)
    return () => { io.disconnect(); delete root.dataset.workspace }
  }, [])
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
  // solid shapes that came with a scan from Scan Studio: creatures stand on them while that scan is the scene
  const shapes = handed?.colliders && source === handed.name ? handed.colliders : undefined
  const [showShapes, setShowShapes] = useState(true)
  const ground = useMemo(() => (shapes ? groundOf(shapes, -Infinity) : undefined), [shapes])
  const groundRef = useRef(ground)
  groundRef.current = ground
  sourceRef.current = source
  const [orbit, setOrbit] = useState<Orbit>(() => ({ ...frame(blobsRef.current), azimuth: 30, elevation: 22 }))
  const [view, setView] = useState<SplatView | null>(null)
  // Imports can be big; a few snapshots of a large scene is all undo keeps
  const history = useRef(new History(160 * 1024 * 1024))

  // On a touchscreen one finger can't both orbit and paint, so start in Look there
  const coarse = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches, [])
  const reducedMotion = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  // Phones run out of memory sooner
  const maxBlobs = coarse ? 400_000 : 1_000_000
  // One mode at a time (Build, Select, Creatures, Effects, Scene), kept in the address
  const [mode, setModeState] = useState<ModeId>(() => modeFrom(typeof location === 'undefined' ? '' : location.search))
  const [buildTool, setBuildTool] = useState<BuildTool>('spray')
  const [selectTool, setSelectTool] = useState<SelectTool>('select')
  // Look around: a plain drag turns the view whatever the mode. On a touchscreen one finger can't both turn and paint, so it starts on there
  const [lookAround, setLookAround] = useState(coarse)
  const tool: ToolId = lookAround && (mode === 'build' || mode === 'select' || mode === 'creatures') ? 'orbit' : mode === 'build' ? buildTool : mode === 'select' ? selectTool : mode === 'creatures' ? 'move' : 'orbit'
  const setMode = useCallback((m: ModeId) => {
    setModeState(m)
    history_replace(m)
  }, [])
  /** Picks a tool, from a button, the keyboard or an assistant: its mode comes with it. */
  const setTool = useCallback((t: ToolId) => {
    if (t === 'orbit') { setLookAround(true); return }
    setLookAround(false)
    if ((BUILD_TOOLS as string[]).includes(t)) { setBuildTool(t as BuildTool); setMode('build'); return }
    // Creatures mode holds Move already: walking a creature doesn't need Select
    if (t === 'move' && modeRef.current === 'creatures') return
    setSelectTool(t as SelectTool)
    setMode('select')
  }, [setMode])
  const modeRef = useRef(mode)
  modeRef.current = mode
  const [color, setColor] = useState('#f2a65a')
  const [size, setSize] = useState(Math.log2(0.05))
  const [spread, setSpread] = useState(40)
  const [density, setDensity] = useState(6)
  const [flat, setFlat] = useState(true)
  const [brush, setBrush] = useState<BrushId>('grass')
  const [ownColors, setOwnColors] = useState(true)
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
  // Status messages ("Undone") fade a moment after they are drawn. Counted from the frame after the one that shows
  // the message: counted from when it was set, a message set just before a long piece of work (a big file handed to
  // the view) was cleared as that work ended, before it was ever on screen
  useEffect(() => {
    if (!message) return
    let t: ReturnType<typeof setTimeout> | undefined
    let raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => { t = setTimeout(() => setMessage(''), 2500) }) })
    return () => { cancelAnimationFrame(raf); clearTimeout(t) }
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
  const photoInput = useRef<HTMLInputElement>(null)
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
      // A photo becomes a shallow scene: a depth guess made on this device puts each pixel's blob at its distance
      if (file.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif)$/i.test(file.name)) {
        setMessage(`Working out how deep ${file.name} is…`)
        const { photoScene } = await import('./photo/scene.ts')
        const made = await photoScene(file, coarse)
        history.current.record(blobsRef.current, sourceRef.current, actorsRef.current)
        replace(made.blobs, file.name)
        setOrbit(made.orbit)
        setMessage(`Made ${file.name} into ${made.blobs.count.toLocaleString()} blobs, one for each pixel of ${made.width} by ${made.height}. Turn the view a little to see its depth`)
        return
      }
      const bytes = await file.arrayBuffer()
      // A rigged .glb (a saved sandbox scene, or a creature from Splat Creatures) opens live
      if (/\.glb$/i.test(file.name)) { await openRigged(new Uint8Array(bytes), file.name); return }
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
      const photo = file.type.startsWith('image/')
      const why = photo ? `The photo could not be made into a scene: ${err instanceof Error ? err.message : String(err)}.` : err instanceof GlbError ? `It isn't a rigged splat .glb the sandbox can read: ${err.message}.` : err instanceof MeshFileError ? `It's a model, but not one the sandbox can lay blobs on: ${err.message}.` : err instanceof ImportError ? err.message : err instanceof RangeError ? 'This file is too big for this device.' : 'The sandbox reads Gaussian splat files: .ply, .spz, .splat, .ksplat and .sog, rigged splat .glb files, and rigged models as .glb.'
      // Spark's decoder can stop working after a file it chokes on; checked files never get that far
      const stuck = !photo && decoded && !(err instanceof ImportError && (err.kind === 'mesh' || (err.kind === 'damaged' && /header/.test(err.message))))
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

  /**
   * A rigged .glb: a saved sandbox scene comes back as its scene and its
   * creatures; any other (one from Splat Creatures) joins the scene as one
   * creature, and so does an ordinary rigged model (triangles on bones), its
   * surface laid with blobs on its own bones. Creatures past the sandbox's
   * limits are frozen into the scene.
   */
  const openRigged = async (bytes: Uint8Array, name: string) => {
    let r: Rigged
    let model = false
    try {
      r = readRiggedGlb(bytes)
    } catch (e) {
      if (!isMeshGlb(e)) throw e
      // as many blobs as the creatures here leave room for, up to MODEL_BLOBS
      r = await rigFromModel(bytes, name, Math.max(MODEL_MIN, Math.min(coarse ? MODEL_BLOBS / 2 : MODEL_BLOBS, maxActorBlobs - actorBlobs(actorsRef.current))))
      model = true
    }
    const split = model ? null : splitScene(r)
    const parts: Rigged[] = split ? split.parts : [{ ...r, name: r.name || name.replace(/\.glb$/i, '') }]
    const scene = split ? split.scene : blobsRef.current.clone()
    const list: Actor[] = split ? [] : [...actorsRef.current]
    let frozen = 0
    for (const part of parts) {
      if (list.length >= MAX_ACTORS || actorBlobs(list) + part.blobs.count > maxActorBlobs) {
        for (let i = 0; i < part.blobs.count; i++) scene.push(part.blobs.get(i))
        frozen++
        continue
      }
      const sp = fileSpecies(part, part.name || 'creature')
      const a = makeActor(sp, { at: [0, 0, 0], height: 1, move: sp.moves.length ? undefined : STILL })
      // Its rest pose is already where it stood: placed as it is
      list.push({ ...a, at: a.rest.foot, height: a.rest.height })
    }
    if (scene.count > maxBlobs) throw new ImportError('too-big', `That scene has ${scene.count.toLocaleString()} blobs; the sandbox holds up to ${maxBlobs.toLocaleString()} here.`)
    history.current.record(blobsRef.current, sourceRef.current, actorsRef.current)
    for (const a of list) if (!clocks.current.has(a.key)) clocks.current.set(a.key, 0)
    replace(scene, split ? name : sourceRef.current)
    setActors(list)
    if (list.length) setCurrentKey(list[list.length - 1].key)
    frameNext.current = true
    const made = list.length - (split ? 0 : actorsRef.current.length)
    const kept = frozen ? `; ${frozen === 1 ? 'one creature' : `${frozen} creatures`} didn't fit as live creatures here, so ${frozen === 1 ? 'it was' : 'they were'} frozen into the scene` : ''
    const rig = model ? ` as ${r.blobs.count.toLocaleString()} blobs on its ${r.skeleton.count} bones${r.clips.length ? `, with ${r.clips.length === 1 ? 'its move' : `${r.clips.length} moves`}` : ''}` : ''
    setMessage(split ? `Opened ${name}: ${scene.count.toLocaleString()} scene blobs and ${made === 1 ? 'a creature' : `${made} creatures`}${kept}` : `Added ${parts[0].name} from ${name}${rig}${kept}`)
  }

  /** The scene and its creatures as one rigged-splat .glb that opens here again and on Splat Creatures. */
  const exportGlb = () => {
    try {
      const r = sceneRig(blobsRef.current, actorsRef.current, (a) => clocks.current.get(a.key) ?? 0, gazeAt)
      const bytes = writeRiggedGlb(r)
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'model/gltf-binary' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${source.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'blobscape'}-scene.glb`
      document.body.append(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      const roaming = actorsRef.current.some((x) => x.roam > 0) ? '. Creatures walking about are saved standing on their spots' : ''
      setMessage(`Saved ${r.blobs.count.toLocaleString()} blobs on ${r.skeleton.count} bones as a rigged .glb${roaming}`)
    } catch (err) {
      setError(`Couldn't save the .glb: ${err instanceof Error ? err.message : String(err)}. Remove or freeze a creature and try again.`)
    }
  }

  // --- camera path -------------------------------------------------------------
  const [stops, setStops] = useState<Orbit[]>([])
  const [leg, setLeg] = useState(2)
  const [touring, setTouring] = useState(false)
  /** Frames drawn so far while a path is being saved, or null. */
  const [filming, setFilming] = useState<number | null>(null)
  const pathFrames = Math.max(2, Math.round(pathSeconds(stops.length, leg) * PATH_FPS) + 1)
  // Play: the view follows the path on the clock, and stops at the last stop or when anything interrupts
  useEffect(() => {
    if (!touring || stops.length < 2) return
    const began = performance.now(), length = pathSeconds(stops.length, leg) * 1000
    let raf = 0
    const tick = () => {
      const u = (performance.now() - began) / length
      setOrbit(pathAt(stops, u))
      // Spark sorts a little behind the view: keep drawing after the last stop until its sort for it is in
      if (u >= 1) { setTouring(false); view?.invalidate(90) }
      else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [touring, stops, leg, view])
  const saveTour = async () => {
    if (!view || stops.length < 2 || filming !== null) return
    setTouring(false)
    setError('')
    const was = orbit
    try {
      const { startVideo, videoSize } = await import('./diorama/video.ts')
      const [w, h] = videoSize(view.canvas.width, view.canvas.height)
      const video = await startVideo(w, h, PATH_FPS)
      const page = new OffscreenCanvas(w, h), pc = page.getContext('2d')!
      // video has no see-through: the page's own color goes behind the scene
      const back = getComputedStyle(view.canvas.parentElement ?? view.canvas).backgroundColor
      const paper = !back || back === 'rgba(0, 0, 0, 0)' || back === 'transparent' ? themeColor('paper', view.canvas) : back
      for (let f = 0; f < pathFrames; f++) {
        setFilming(f + 1)
        await view.settle(pathAt(stops, f / (pathFrames - 1)))
        pc.fillStyle = paper
        pc.fillRect(0, 0, w, h)
        pc.drawImage(view.canvas, 0, 0, w, h)
        await video.add(page)
      }
      const bytes = await video.finish()
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'video/mp4' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${source.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'blobscape'}-path.mp4`
      document.body.append(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setMessage(`Saved a ${pathSeconds(stops.length, leg)} second video, ${w} by ${h}`)
    } catch (err) {
      setError(`Couldn't save the video: ${err instanceof Error ? err.message : String(err)}.`)
    } finally {
      setFilming(null)
      setOrbit(was)
    }
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

  /** Paint: one dab of the picked brush on the surface under the ring. Fur lies the way the stroke is going. */
  const painted = useRef<{ p: Vec3; n: number } | null>(null)
  const paintAt = (x: number, y: number) => {
    const b = blobsRef.current
    const at = land(x, y)
    if (!at || !view) return
    const depth = Math.max(0.01, Math.hypot(at.p[0] - view.camera.position.x, at.p[1] - view.camera.position.y, at.p[2] - view.camera.position.z))
    const was = painted.current
    const along: Vec3 | undefined = was ? [at.p[0] - was.p[0], at.p[1] - was.p[1], at.p[2] - was.p[2]] : undefined
    painted.current = { p: at.p, n: (was?.n ?? 0) + 1 }
    const blobs = brushDab(brush, {
      p: at.p, n: at.n, radius: (spread * depth) / view.lens().fx, size: blobSize * 5, density,
      color: ownColors ? undefined : hexToRgb(color),
      along: along && Math.hypot(along[0], along[1], along[2]) > 1e-4 ? along : undefined,
      seed: b.count * 31 + (was?.n ?? 0) + 1,
    })
    const from = b.count
    for (const blob of blobs) { if (b.count >= maxBlobs) { setMessage(`The sandbox holds up to ${maxBlobs.toLocaleString()} blobs`); break } b.push(blob) }
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

  /** Fill: grows blobs into the gap under the ring. `say` is for a single click, where no change needs a reason. */
  const fillAt = (x: number, y: number, say: boolean) => {
    if (!view) return
    const { origin, dir } = view.ray(x, y)
    const b = blobsRef.current, from = b.count
    const got = fillHole(b, [origin.x, origin.y, origin.z], [dir.x, dir.y, dir.z], spread / view.lens().fx, maxBlobs, from + 1)
    if (got.added) { changed(from); setMessage(`Filled in with ${got.added.toLocaleString()} blobs`) }
    else if (got.why === 'full') setMessage(`The sandbox holds up to ${maxBlobs.toLocaleString()} blobs`)
    else if (say) setMessage(got.why === 'no-gap' ? 'No gap under the ring' : 'Nothing round the ring to grow from')
  }

  /** Stamp: where it copies from (set by a click), and the stroke under way. */
  const stampFrom = useRef<Vec3 | null>(null)
  const stamping = useRef<{ p: Vec3; n: Vec3; shift: Vec3; count: number; done: Set<number>; added: number } | null>(null)
  const setStampFrom = (x: number, y: number) => {
    const b = blobsRef.current
    const at = b.count ? land(x, y) : null
    if (!at) { setMessage('Nothing here to copy'); return }
    stampFrom.current = at.p
    setMessage('Copying from here. Now drag where the copy should go')
    view?.invalidate(1)
  }
  const stampAt = (x: number, y: number) => {
    const src = stampFrom.current
    if (!view || !src) return
    const { origin: o, dir: d } = view.ray(x, y)
    let st = stamping.current
    if (!st) {
      const at = land(x, y)
      if (!at) return
      st = stamping.current = { p: at.p, n: at.n, shift: [at.p[0] - src[0], at.p[1] - src[1], at.p[2] - src[2]], count: blobsRef.current.count, done: new Set(), added: 0 }
    }
    // The stroke stays on the plane it began on, so copies already laid don't pull it toward the camera
    const down = d.x * st.n[0] + d.y * st.n[1] + d.z * st.n[2]
    if (Math.abs(down) < 1e-4) return
    const t = ((st.p[0] - o.x) * st.n[0] + (st.p[1] - o.y) * st.n[1] + (st.p[2] - o.z) * st.n[2]) / down
    if (t <= 0) return
    const b = blobsRef.current, from = b.count
    const n = stampDab(b, st.count, [o.x + d.x * t - st.shift[0], o.y + d.y * t - st.shift[1], o.z + d.z * t - st.shift[2]], (spread * t) / view.lens().fx, st.shift, st.done, maxBlobs)
    if (n) { st.added += n; changed(from); setMessage(`Copied ${st.added.toLocaleString()} blobs`) }
    else if (b.count >= maxBlobs) setMessage(`The sandbox holds up to ${maxBlobs.toLocaleString()} blobs`)
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
  /** Whole things: a tap with Select picks everything the model says belongs to what was tapped. */
  const [whole, setWhole] = useState(false)
  const [looking, setLooking] = useState(false)
  const selectThing = async (x: number, y: number, add: boolean) => {
    if (!view || looking) return
    const hit = blobAt(x, y)
    if (hit < 0) { if (!add) sel.clear(); announce('No blob there. '); return }
    const b = blobsRef.current
    const at: Vec3 = [b.center[hit * 3], b.center[hit * 3 + 1], b.center[hit * 3 + 2]]
    setLooking(true)
    setError('')
    setMessage('Looking at what you tapped…')
    try {
      // the picture as it stands, without rings and outlines
      await view.settle(orbit)
      const lens = view.lens()
      const back = getComputedStyle(view.canvas.parentElement ?? view.canvas).backgroundColor
      const paper = !back || back === 'rgba(0, 0, 0, 0)' || back === 'transparent' ? themeColor('paper', view.canvas) : back
      const mask = await thingAt(view.canvas, lens, paper, x, y, `${version}|${JSON.stringify(orbit)}|${lens.width}x${lens.height}`)
      // the scene may have changed while the model looked
      if (blobsRef.current !== b || b.count < hit) { setMessage(''); return }
      const picked = mask ? blobsInMasks(b, [mask], at) : new Uint8Array(0)
      if (!add) sel.clear()
      let n = 0
      for (let i = 0; i < picked.length; i++) if (picked[i]) { sel.set(i, true); n++ }
      // the tapped blob itself is always part of it
      if (!n) sel.set(hit, true)
      announce(n ? '' : 'Could not tell what that is, so only the blob. ')
    } catch (err) {
      setMessage('')
      setError(`Could not look at it: ${err instanceof Error ? err.message : String(err)}.`)
    } finally {
      setLooking(false)
    }
  }
  const selectAt = (x: number, y: number, add: boolean) => {
    if (whole && tool === 'select') { void selectThing(x, y, add); return }
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
      // Stamp waits to see whether this is a click (set where to copy from) or a drag (paint the copy)
      if (tool === 'stamp') return
      before.current = blobsRef.current.clone()
      if (tool === 'add') { const from = blobsRef.current.count; if (place(blobsRef.current, land(x, y), 0)) changed(from) }
      else if (tool === 'spray') sprayAt(x, y)
      else if (tool === 'paint') { painted.current = null; paintAt(x, y) }
      else if (tool === 'erase' && view) eraseAt(x, y, view.lens())
      else if (tool === 'fill') fillAt(x, y, true)
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
      if (tool === 'stamp' && !stamping.current) {
        if (Math.hypot(x - l.x0, y - l.y0) <= 4) return
        if (!stampFrom.current) { setMessage('Click what to copy first, then drag'); return }
        before.current = blobsRef.current.clone()
        stampAt(l.x0, l.y0)
      }
      // Space the dabs out so a slow drag doesn't pile blobs up in one spot
      if (Math.hypot(x - l.x, y - l.y) < Math.max(4, spread / 3)) return
      last.current = { ...l, x, y }
      if (tool === 'spray') sprayAt(x, y)
      else if (tool === 'paint') paintAt(x, y)
      else if (tool === 'erase' && view) eraseAt(x, y, view.lens())
      else if (tool === 'fill') fillAt(x, y, false)
      else if (tool === 'stamp') stampAt(x, y)
    },
    up: () => {
      const l = last.current, m = marquee.current
      if (l && tool === 'select') {
        if (m?.kind === 'box') selectInPolygon([m.x0, m.y0, m.x1, m.y0, m.x1, m.y1, m.x0, m.y1], l.shift)
        else selectAt(l.x0, l.y0, l.shift)
      } else if (l && tool === 'lasso' && m?.kind === 'lasso') selectInPolygon(m.pts, l.shift)
      else if (l && tool === 'stamp' && !stamping.current) setStampFrom(l.x0, l.y0)
      stamping.current = null
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
      else if (tool === 'paint') { painted.current = null; paintAt(x, y) }
      else if (tool === 'erase' && view) eraseAt(x, y, view.lens())
      else if (tool === 'fill') fillAt(x, y, true)
      else if (tool === 'stamp') {
        // From the keyboard: Shift+Enter says where to copy from, Enter lays one dab of it at the center
        if (shift || !stampFrom.current) setStampFrom(x, y)
        else { stampAt(x, y); stamping.current = null }
      }
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
    starts.current = poseAll(list, (a) => clocks.current.get(a.key) ?? 0, drawn.current, scratch.current, gazeAt, groundRef.current)
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
  const addActor = (sp: (typeof ADDABLE)[number]): string => {
    const say = (m: string) => { setMessage(m); return m }
    const list = actorsRef.current
    if (list.length >= MAX_ACTORS) return say(`The sandbox holds up to ${MAX_ACTORS} creatures`)
    const detail = detailsOf(sp)[0]
    if (actorBlobs(list) + detail > maxActorBlobs) return say(`Creatures can have ${maxActorBlobs.toLocaleString()} blobs between them here. Remove or freeze one first.`)
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
    return say(`Added ${aOr(sp.name)}`)
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
    if (showRig !== 'blobs') for (const a of actorsRef.current) drawBones(ctx, actorBones(a, clocks.current.get(a.key) ?? 0, ground), lens, themeColor('accent', ctx.canvas))
    if (shapes && showShapes) {
      // the scan's solid shapes, as dashed lines
      ctx.save()
      ctx.setLineDash([5, 4])
      ctx.lineWidth = 1.25
      ctx.strokeStyle = themeColor('ink', ctx.canvas)
      for (const c of shapes) for (const run of wireOf(c)) {
        const pts = run.map((p) => toScreen(p, lens))
        if (pts.some((p) => !p)) continue
        ctx.beginPath()
        pts.forEach((p, i) => (i ? ctx.lineTo(p![0], p![1]) : ctx.moveTo(p![0], p![1])))
        ctx.stroke()
      }
      ctx.restore()
    }
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
    const sf = tool === 'stamp' ? stampFrom.current : null
    const sp = sf && toScreen(sf, lens)
    if (sp) {
      // Where the stamp copies from: a ring with a cross in it
      ctx.strokeStyle = themeColor('ink')
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(sp[0], sp[1], 7, 0, Math.PI * 2)
      ctx.moveTo(sp[0] - 11, sp[1]); ctx.lineTo(sp[0] + 11, sp[1]); ctx.moveTo(sp[0], sp[1] - 11); ctx.lineTo(sp[0], sp[1] + 11)
      ctx.stroke()
    }
    if (h && (tool === 'spray' || tool === 'paint' || tool === 'erase' || tool === 'fill' || tool === 'stamp')) {
      ctx.strokeStyle = themeColor(tool === 'erase' ? 'ink' : 'accent')
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.arc(h.x, h.y, spread, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  // --- tools for an assistant in the browser (WebMCP) ---------------------------
  const n3 = (v: ArrayLike<number>) => `[${[v[0], v[1], v[2]].map((x) => +x.toFixed(2)).join(', ')}]`
  const inBall = (b: Blobs, c: Vec3, r: number) => (i: number) => (b.center[i * 3] - c[0]) ** 2 + (b.center[i * 3 + 1] - c[1]) ** 2 + (b.center[i * 3 + 2] - c[2]) ** 2 <= r * r
  const api: SandboxApi = {
    describe: () => {
      const b = blobsRef.current, bb = b.count ? bounds(b, null) : null
      const list = actorsRef.current
      return [
        `The scene "${source}" has ${b.count.toLocaleString('en-US')} blobs${bb ? `, in a box from ${n3(bb.lo)} to ${n3(bb.hi)} (meters, y up)` : ''}.`,
        list.length ? `Creatures: ${list.map((a) => `${a.species.name} at ${n3(a.at)}`).join('; ')}.` : 'No creatures.',
        `It holds up to ${maxBlobs.toLocaleString('en-US')} blobs and ${MAX_ACTORS} creatures.`,
      ].join(' ')
    },
    creatures: () => ADDABLE.map((sp) => sp.id),
    addCreature: (id) => addActor(ADDABLE.find((sp) => sp.id === id)!),
    writeScene: (json) => {
      const r = readDoc(json)
      if (!r.scene) return `Not built. Fix these and call again: ${r.errors.join('; ')}`
      const built = buildVoxels(r.scene.spec(SCENE_SPACING)).blobs
      if (!built.count) return 'Not built: the description gave no blobs'
      if (built.count > maxBlobs) return `Not built: it came to ${built.count.toLocaleString('en-US')} blobs and the sandbox holds ${maxBlobs.toLocaleString('en-US')}. Make it smaller.`
      history.current.record(blobsRef.current, source, actorsRef.current)
      replace(built, r.scene.name)
      setOrbit(r.scene.orbit)
      return `Built "${r.scene.name}": ${built.count.toLocaleString('en-US')} blobs.`
    },
    cut: (c, r) => {
      const b = blobsRef.current, inside = inBall(b, c, r)
      let n = 0
      for (let i = 0; i < b.count; i++) if (inside(i)) n++
      if (!n) return 'No blobs there: nothing was cut.'
      edit((x) => { x.filter((i) => !inside(i)) })
      clearSel()
      return `Cut ${n.toLocaleString('en-US')} blobs. ${blobsRef.current.count.toLocaleString('en-US')} are left.`
    },
    recolor: (c, r, color) => {
      const b = blobsRef.current, inside = inBall(b, c, r)
      let n = 0
      for (let i = 0; i < b.count; i++) if (inside(i)) n++
      if (!n) return 'No blobs there: nothing was recolored.'
      edit((x) => { for (let i = 0; i < x.count; i++) if (inside(i)) x.color.set(color, i * 3) })
      return `Recolored ${n.toLocaleString('en-US')} blobs.`
    },
    brush: (kind, at, r) => {
      const b = blobsRef.current, from = b.count
      if (from >= maxBlobs) return `Nothing painted: the sandbox holds up to ${maxBlobs.toLocaleString('en-US')} blobs.`
      const dab = brushDab(kind, { p: at, n: [0, 1, 0], radius: r, size: blobSize * 5, density, seed: from * 31 + 7 })
      edit((x) => { for (const blob of dab) { if (x.count >= maxBlobs) break; x.push(blob) } })
      return `Painted ${(blobsRef.current.count - from).toLocaleString('en-US')} blobs of ${kind}.`
    },
    save: () => { exportPly(); return `Saved the scene as a .ply file: ${everything().count.toLocaleString('en-US')} blobs.` },
    undo: () => { if (!history.current.canUndo) return 'Nothing to take back.'; undo(); return 'Took back the last change.' },
  }
  // The tools are registered once and always reach this render's sandbox
  const apiRef = useRef(api)
  apiRef.current = api
  useEffect(() => {
    const live = Object.fromEntries(Object.keys(apiRef.current).map((k) => [k, (...args: unknown[]) => (apiRef.current[k as keyof SandboxApi] as (...a: unknown[]) => unknown)(...args)])) as unknown as SandboxApi
    return registerTools(sandboxTools(live)).remove
  }, [])

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
    paint: '; press Enter to paint a dab at the center',
    erase: '; press Enter to erase at the center',
    fill: '; press Enter to fill the hole at the center',
    stamp: '; press Shift+Enter to copy from the center, then Enter to lay the copy at the center',
    select: '; press Enter to select the blob at the center, Shift+Enter to add it',
    lasso: '; press Enter to select the blob at the center, Shift+Enter to add it',
  }

  const toolsHeld = (list: (BuildTool | SelectTool)[], held: ToolId) => list.map((t) => {
    const it = TOOLS.find((x) => x.id === t)!
    return <ToolButton key={t} name={it.name} note={it.note} held={held === t} onClick={() => setTool(t)} />
  })
  const heldNote = (t: ToolId) => TOOLS.find((x) => x.id === t)!.note
  const panels: Record<ModeId, ReactNode> = {
    build: (
      <>
        <div role="group" aria-label="Build tools" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0 [&>*]:flex-none">{toolsHeld(BUILD_TOOLS, tool)}</div>
        <p className="text-xs leading-relaxed text-ink-faint">{lookAround ? heldNote('orbit') : heldNote(buildTool)}</p>
            <Panel note="What Add, Spray and Paint put down. Each new blob takes the brush color, with a little variation so sprayed patches don't look flat.">
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
              <Slider label="Brush radius" value={spread} min={4} max={120} step={1} onChange={setSpread} format={(v) => `${v}px`} hint="The ring for Spray, Paint, Erase, Fill and Stamp." />
              <Slider label="Density" value={density} min={1} max={30} step={1} onChange={setDensity} format={(v) => `${v} per dab`} />
              <Toggle label="Flat discs (off = round balls)" checked={flat} onChange={setFlat} />
              <div className="grid gap-3">
                <Field label="Paint with">
                  <div className="flex flex-wrap gap-1.5">
                    {BRUSHES.map((k) => <Chip key={k.id} active={brush === k.id} onClick={() => { setBrush(k.id); setTool('paint') }}>{k.name}</Chip>)}
                  </div>
                </Field>
                <p className="text-sm text-ink-faint">{BRUSHES.find((k) => k.id === brush)!.note} Blob size sets how big they grow, Density how many a dab lays.</p>
                <Toggle label="Their own colors (off = the brush color)" checked={ownColors} onChange={setOwnColors} />
              </div>
            </Panel>
      </>
    ),
    select: (
      <>
        <div role="group" aria-label="Select tools" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0 [&>*]:flex-none">{toolsHeld(SELECT_TOOLS, tool)}</div>
        <p className="text-xs leading-relaxed text-ink-faint">{lookAround ? heldNote('orbit') : heldNote(selectTool)}</p>
            <Panel note="Pick blobs with Select or Lasso, or by color here. Edits apply to every selected blob and can be undone.">
              <div className="flex flex-wrap gap-2">
                <Button small onClick={selectAll} disabled={!blobs.count}>Select all</Button>
                <Button small onClick={selectNone} disabled={none}>Select none</Button>
                <Button small onClick={invertSel} disabled={!blobs.count}>Invert</Button>
              </div>
              <div>
                <Toggle label="A click with Select takes the whole thing" checked={whole} onChange={(on) => { setWhole(on); if (on) setTool('select') }} />
                <p className="mt-1.5 text-xs text-ink-faint" data-testid="whole-note">
                  {looking ? 'Looking at what you tapped…' : 'Click a mug, a leaf or a chair and everything that belongs to it is selected, the far side too. A small model (Segment Anything, slimmed; 14 MB, fetched the first time) looks at the view on your device: a few seconds the first click, quick after that until the view moves.'}
                </p>
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
      </>
    ),
    creatures: (
      <Panel note="Creatures from Splat Creatures, a slime from Dungeon Run and the watch from Clockwork, moving in your scene. Drag one with the Move tool (or, with nothing selected, use the arrow keys on the view) to put it somewhere else. Brushes and selections leave them alone until you freeze one into ordinary blobs. An effect on the whole scene moves them too, but only on screen: freeze one to keep it.">
        {shapes && (
          <div data-testid="scan-shapes">
            <p className="text-xs leading-relaxed text-ink-muted">This scan came with {shapes.length} solid {shapes.length === 1 ? 'shape' : 'shapes'} from Scan Studio. A creature over one stands on it.</p>
            <div className="mt-2"><Toggle label="Show the shapes" checked={showShapes} onChange={setShowShapes} /></div>
          </div>
        )}
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
    effects: (
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
    scene: (
      <Panel note="Start again from a sample or open a capture of your own. The current scene can still be brought back with Undo.">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Start from">
          {STARTS.map((s) => <Chip key={s.id} active={source === s.name} onClick={() => start(s)}>{s.name}</Chip>)}
        </div>
        <Field label="Your own splats">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button small onClick={() => { if (!busy) fileInput.current?.click() }} aria-disabled={busy}>{busy ? 'Opening…' : 'Open a splat file…'}</Button>
              <Button small onClick={exportPly} disabled={!blobs.count && !actors.length}>Save as .ply</Button>
              <Button small onClick={exportGlb} disabled={!blobs.count && !actors.length}>Save as rigged .glb</Button>
            </div>
            <input ref={fileInput} type="file" accept={FILE_TYPES} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void openFile(f) }} />
            <p className="text-xs text-ink-faint">
              .ply, .spz, .splat, .ksplat, .sog or a rigged .glb, or drop one on the view. It stays on your device. Scenes over {maxBlobs.toLocaleString()} blobs are thinned to fit. A .ply opens in most splat viewers; a rigged .glb keeps the creatures moving and opens here again and on Splat Creatures. A rigged model saved as a .glb (triangles on bones, as from Blender or Mixamo) joins as a creature: blobs laid over its surface on its own bones, with its moves.
            </p>
            {error && <p className="text-sm text-accent-ink">{error}</p>}
            <Toggle label="Turn captures the right way up on opening" checked={upright} onChange={setUpright} />
          </div>
        </Field>
        <Field label="Your own photo">
          <div className="space-y-2">
            <Button small onClick={() => { if (!busy) photoInput.current?.click() }} aria-disabled={busy}>{busy ? 'Opening…' : 'Open a photo…'}</Button>
            <input ref={photoInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden data-testid="photo-input" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void openFile(f) }} />
            <p className="text-xs text-ink-faint">One photo becomes a shallow scene: a blob for each pixel, set as far back as a depth model guesses it is. It opens as the photo; turn the view a little and it has depth. What the camera never saw isn't there, so a wide turn opens gaps. The photo stays on your device: the model (Depth Anything V2 Small, 27 MB, fetched the first time) runs in this page.</p>
          </div>
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button small onClick={() => { edit(flipUpright); setOrbit((o) => ({ ...o, ...frame(blobsRef.current) })) }} disabled={!blobs.count}>Flip upside down</Button>
          <Button small onClick={() => { edit(sitOnFloor); setOrbit((o) => ({ ...o, ...frame(blobsRef.current) })) }} disabled={!blobs.count}>Sit on the floor</Button>
          <Button small onClick={() => setOrbit((o) => ({ ...o, ...frameAll() }))}>Frame the scene</Button>
        </div>
        <div className="grid gap-3">
          <Field label="Camera path">
            <div className="flex flex-wrap gap-2">
              <Button small onClick={() => { setStops((s) => [...s, { ...orbit, target: [...orbit.target] }]); setMessage(`Stop ${stops.length + 1} saved. Turn the view and add the next`) }} disabled={stops.length >= MAX_STOPS || touring || filming !== null}>Add this view as a stop</Button>
              <Button small onClick={() => setStops((s) => s.slice(0, -1))} disabled={!stops.length || touring || filming !== null}>Remove the last</Button>
              <Button small onClick={() => setTouring((t) => !t)} disabled={stops.length < 2 || filming !== null} aria-pressed={touring}>{touring ? 'Stop' : 'Play the path'}</Button>
              <Button small primary onClick={() => void saveTour()} disabled={stops.length < 2 || filming !== null} data-testid="path-save">{filming === null ? 'Save as MP4' : `Drawing ${filming} of ${pathFrames}…`}</Button>
            </div>
          </Field>
          <p className="text-xs text-ink-faint" data-testid="path-stops">{stops.length ? `${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}${stops.length > 1 ? `, ${pathSeconds(stops.length, leg)} seconds` : ''}.` : 'No stops yet.'} Turn the view to somewhere you like and add it as a stop; two or more make a path the camera glides along. The video is made on your device.</p>
          <Slider label="Seconds a stop" value={leg} min={0.5} max={6} step={0.5} onChange={setLeg} format={(v) => `${v} s`} />
        </div>
        <Toggle label="X-ray" checked={xray} onChange={setXray} />
        <p className="text-xs text-ink-faint">X-ray outlines every blob up to {OUTLINE_LIMIT.toLocaleString()}; past that it shows centers as dots.</p>
        <Slider label="Reach" value={reach} min={0.5} max={3} step={0.01} onChange={setReach} format={(v) => `${v.toFixed(2)}σ`} hint="How far out each blob is drawn. Turn it down to see the individual blobs in a dense scene." />
      </Panel>
    ),
  }
  const marks: Partial<Record<ModeId, ReactNode>> = {
    select: sel.count > 0 && <Badge>{sel.count.toLocaleString()}<span className="sr-only"> selected</span></Badge>,
    creatures: actors.length > 0 && <Badge>{actors.length}<span className="sr-only"> added</span></Badge>,
    effects: fx && <Badge>on<span className="sr-only">: {fx.name}</span></Badge>,
  }

  return (
    <div
      ref={work}
      data-full={full || undefined}
      className={`flex flex-col bg-paper ${full === 'window' ? 'fixed inset-0 z-50' : full ? 'h-full' : 'h-[calc(100svh-3.5rem-1px)] min-h-[34rem]'}`}
      onDragOver={(ev) => { if (ev.dataTransfer.types.includes('Files')) { ev.preventDefault(); setDragOver(true) } }}
      onDragLeave={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setDragOver(false) }}
      onDrop={onDrop}
    >
      <div className="flex min-w-0 flex-none items-center gap-x-4 px-4 py-1.5 lg:py-2.5">
        <h1 ref={h1} tabIndex={-1} className="flex-none font-display text-2xl outline-none lg:text-3xl">Sandbox</h1>
        <p className="min-w-0 truncate text-sm text-ink-muted">
          <span className="tabular-nums text-ink" data-testid="blob-count">{blobs.count.toLocaleString()}</span> blobs
          {actors.length > 0 && <> + <span className="tabular-nums text-ink" data-testid="creature-blob-count">{actorCount.toLocaleString()}</span> in {actors.length === 1 ? 'a creature' : `${actors.length} creatures`}</>}
          {sel.count > 0 && <> · <span className="tabular-nums text-accent-ink" data-testid="selected-count">{sel.count.toLocaleString()}</span> selected</>}
          <span className="text-ink-faint max-sm:hidden"> · Started from: {source}</span>
        </p>
        <span className="ml-auto flex flex-none gap-1">
          <button type="button" onClick={undo} disabled={!history.current.canUndo} aria-keyshortcuts="Control+Z Meta+Z" title="Undo (Ctrl+Z)" className={HEAD_BUTTON}>
            <Icon d="M8 6l-4 4 4 4M4 10h10a5 5 0 0 1 0 10h-3" /><span className="max-sm:sr-only">Undo</span>
          </button>
          <button type="button" onClick={redo} disabled={!history.current.canRedo} aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z" title="Redo (Ctrl+Shift+Z)" className={HEAD_BUTTON}>
            <Icon d="M16 6l4 4-4 4M20 10H10a5 5 0 0 0 0 10h3" /><span className="max-sm:sr-only">Redo</span>
          </button>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:gap-3 lg:px-4 lg:pb-4">
        <div className="order-3 flex-none lg:order-1">
          <ModeBar mode={mode} setMode={setMode} base={base} marks={marks} />
        </div>

        <section
          aria-label="Tools and settings"
          className={`order-2 flex min-h-0 flex-none flex-col border-t border-rule bg-paper-sunk lg:w-[22rem] lg:flex-none lg:rounded-2xl lg:border lg:transition-none ${tall ? 'h-[60%]' : 'h-[38%]'} lg:h-auto`}
          onFocus={(ev) => { lastFocus.current = ev.target as HTMLElement }}
        >
          <button
            type="button"
            onClick={() => setTall((t) => !t)}
            onPointerDown={(ev) => { trayDrag.current = ev.clientY }}
            onPointerUp={(ev) => { const from = trayDrag.current; trayDrag.current = null; if (from !== null && Math.abs(ev.clientY - from) > 24) { ev.preventDefault(); setTall(ev.clientY < from) } }}
            aria-expanded={tall}
            aria-label={tall ? 'Show less of the panel' : 'Show more of the panel'}
            className="flex h-6 flex-none cursor-pointer touch-none items-center justify-center lg:hidden"
          >
            <span aria-hidden className="h-1 w-10 rounded-full bg-ink-faint" />
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 lg:pt-4">
            {MODES.map((m) => (
              <div key={m.id} role="tabpanel" id={panelId(base, m.id)} aria-labelledby={tabId(base, m.id)} hidden={m.id !== mode} className="space-y-3">
                <h2 className="font-display text-xl max-lg:sr-only">{m.name}</h2>
                {panels[m.id]}
              </div>
            ))}
          </div>
        </section>

        <section aria-label="Scene" className="order-1 min-h-0 flex-1 lg:order-3">
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
            className="h-full max-lg:rounded-none max-lg:border-0"
            label={`Sandbox scene with ${blobs.count.toLocaleString()} blobs${actors.length ? ` and ${actors.length === 1 ? 'a' : actors.length} creature${actors.length === 1 ? '' : 's'}: ${actors.map((a) => a.species.name + (a.roam > 0 ? ' walking about' : '')).join(', ')}` : ''}. ${tool === 'move' ? `With the Move tool, the arrow keys slide the selection${actors.length ? `, or with nothing selected walk the ${current.species.name}` : ''} (Shift for bigger steps)` : 'Drag or use the arrow keys to turn the view'}, plus and minus to zoom${toolKeyNote[tool] ?? ''}.`}
            home={() => ({ ...frameAll(), azimuth: 30, elevation: 22 })}
            hint={coarse ? (tool === 'orbit' ? 'drag to turn · pinch to zoom' : 'two fingers turn · pinch to zoom') : tool === 'orbit' ? 'drag to turn · scroll to zoom' : 'right-drag to turn · scroll to zoom'}
          >
            {dragOver && (
              <div aria-hidden className="pointer-events-none absolute inset-2 grid place-items-center rounded-md border-2 border-dashed border-accent bg-paper/70 text-sm text-ink">
                Drop a splat file to open it
              </div>
            )}
            <div className="pointer-events-none absolute top-2.5 right-14 left-2.5 flex flex-wrap items-start gap-2">
              {(mode === 'build' || mode === 'select' || mode === 'creatures') && (
                <button type="button" aria-pressed={lookAround} onClick={() => setLookAround((l) => !l)} title="A plain drag turns the view" className={`pointer-events-auto flex h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors ${lookAround ? 'border-accent bg-accent text-paper' : 'border-rule bg-paper text-ink hover:border-ink-faint'}`}>
                  <Icon d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />Look around
                </button>
              )}
              <span aria-live="polite" className="min-h-0 rounded-md bg-paper/90 px-2 py-1 text-xs text-ink-muted empty:hidden">{message}</span>
              <p role="alert" className="basis-full rounded-md bg-paper/90 px-2 py-1 text-sm text-accent-ink empty:hidden">{error}</p>
            </div>
            <button type="button" aria-label={full ? 'Leave full screen' : 'Full screen'} title={full ? 'Leave full screen' : 'Full screen'} onClick={toggleFull} data-testid="full-screen" className="zoom-btn absolute bottom-2.5 left-2.5">
              <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                {full ? <path d="M6 2.5V6H2.5M10 2.5V6h3.5M6 13.5V10H2.5M10 13.5V10h3.5" /> : <path d="M2.5 6V2.5H6M13.5 6V2.5H10M2.5 10v3.5H6M13.5 10v3.5H10" />}
              </svg>
            </button>
          </Viewport>
        </section>
      </div>
    </div>
  )
}

const HEAD_BUTTON = 'flex h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-ink transition-colors hover:bg-paper-sunk disabled:cursor-default disabled:text-ink-faint disabled:hover:bg-transparent'
const Badge = ({ children }: { children: ReactNode }) => (
  <span className="absolute top-0.5 right-1 rounded-full bg-ink px-1.5 text-[0.625rem] leading-4 font-semibold text-paper tabular-nums">{children}</span>
)

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
