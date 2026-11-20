import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import type { Vec3 } from '../splat-core/blobs.ts'
import type { PixelLook } from '../splat-core/pixel.ts'
import type { Built } from '../splat-engine/body.ts'
import { pickActors } from '../splat-engine/pick.ts'
import { MAX_PROJECT_LAMPS, PlacedPoser, SIZE_RANGE, compileProject, cutLight, joinPalettes, placer, type Placement, type Posable, type ProjectLight, type SceneProject } from '../splat-engine/project.ts'
import type { Light, PointLight } from '../splat-engine/engine.ts'
import type { Bone, Skeleton } from '../splat-engine/rig.ts'
import type { Shape } from '../splat-engine/voxel.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field, Slider, Toggle } from '../shared/ui.tsx'
import { useFullScreen } from '../shared/Workbench.tsx'
import { detailAsked, labelNames, writeDetail } from '../shared/detail.ts'
import type { CreatureStage } from './creature/stage.ts'
import { DETAIL } from './diorama/scene.ts'
import { ScenePicker } from './diorama/ScenePicker.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import { ModeBar, useWorkspaceScreen, panelId, tabId, type Mode } from './sandbox/modes.tsx'
import type { CutJob } from './creator/cut.ts'
import { unpack, type PackedCut } from './creator/pack.ts'
import { START_LANDS, START_SCENES, nameFor, slug, openingAsked, openingLand, openingScene, queryFor, shownOf, type Opened } from './creator/shown.ts'
import { isDescription, readDescribed } from './creator/described.ts'
import { AUTOSAVE_MS, FILE_END, type ModelFile, cleanName, copyName, fileName, fileText, mergedLike, newId, openShelf, readFile, renamed, type SavedScene, type Shelf } from './creator/store.ts'
import { download } from './files.ts'
import { takeScan } from './handoff.ts'
import { isLink, linkFor, readLink } from './creator/link.ts'
import { registerTools } from './agentTools.ts'
import { creatorTools, type CreatorApi } from './creator/agentTools.ts'
import { PACKS, packAdded } from './creator/packs.ts'
import { BLOB_ROOM, CARDS, spanOf, added, cardsFound, groundOf, heightAt, landSwapped, liftOn, roomOf, whyNot } from './creator/adding.ts'
import { creatureMove, creatureSize, isCreature, libraryProp, openLand, type LibraryEntry } from './creator/library.ts'
import { OPEN_MOST, SCATTERED, PlacedMorphs, rawTexture, scatteredStill, forgetKept, isModel, keepModel, keptModels, modelId, meshModelFrom, modelClip, modelFrom, modelJob, modelOf, modelSize, openShare, poseModel, type ModelProp, type RawImage, type SplatModel } from './creator/models.ts'
import { GlbError, readRiggedGlb, writeRiggedGlb } from '../splat-engine/glb.ts'
import { sceneRig } from './creator/engineFile.ts'
import { MeshFileError, openGlb, readMeshGlb, readMeshGlbParts, readObj, type MeshFile } from '../splat-engine/meshFile.ts'
import { fileIdOf, isPart, partId, sceneLayout, sceneProject } from './creator/sceneModel.ts'
import { landFromScan, scanGround, scanProject } from './creator/scanLand.ts'
import { stillActor } from './scan/studio.ts'
import { ImportError, readSplatFile } from '../splat-core/importer.ts'
import { isMeshGlb, rigFromModel } from './modelRig.ts'
import { meshBounds } from '../splat-engine/meshShape.ts'
import { readSkinnedGlb } from '../splat-engine/skinnedModel.ts'
import { budget, clock, lampAdded, lampLights, lampRemoved, lit, liveSky, liveSkyColors, rgbOf, shadeNow, sunNow } from './creator/lighting.ts'
import { castBy, glowGain } from './diorama/glow.ts'
import { STYLES, isPixelStyle, styleAsked, styleWords, type Style } from './diorama/styles.ts'
import { useDrawnLook, wantsPlain } from './drawnLook.tsx'
import { GLITCH_START, glitchLook, type GlitchChoice } from './glitchLooks.ts'
import { GlitchControls } from './diorama/GlitchControls.tsx'
import { useExport } from './diorama/useExport.tsx'
import { MAX_STOPS, pathAt, pathSeconds } from './cameraPath.ts'
import { PIXEL_RATES, PIXEL_SIZES, paletteChoices, pixelLook, pixelStart, type PixelChoice } from './creator/styling.ts'
import { arrowWay, begin, copied, did, moved, onGround, redo, redrawn, removed, sized, stepFor, stilled, turned, undo, wrapTurn, type History } from './creator/arrange.ts'

/**
 * Scene Creator (epic #329): Pixel Diorama's scenes taken apart into a land and props to arrange. The workspace
 * (#335) is the sandbox's Modes layout, each piece cut in a worker and drawn as its own actor on one stage; Arrange
 * (#336) picks a prop by a tap or from the list and moves, turns, sizes, copies and deletes it, with undo. A prop is
 * cut where it stands, so while it is dragged or turned the cut it has is drawn where it is going (`redrawn`), and it
 * is cut again once let go. Props (#337) adds from the library and swaps the land. Light, style and export follow in
 * their own issues: Light (#338) and Style and Export (#339).
 */

type CreatorMode = 'scene' | 'props' | 'arrange' | 'light' | 'style' | 'export'

const MODES: Mode<CreatorMode>[] = [
  { id: 'scene', name: 'Scene', note: 'Start from one of the scenes or a bare land.', icon: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6' },
  { id: 'props', name: 'Props', note: 'Tap a card to set it down in the middle of the view, or drag it onto the view. A land swaps what everything stands on.', icon: 'M4 7l8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10' },
  { id: 'arrange', name: 'Arrange', note: 'Tap a prop in the view, or pick one below, then move, turn and size it. Drag it along the ground to move it.', icon: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3' },
  { id: 'light', name: 'Light', note: 'The sun and sky, lamps, glow and air. A baked sun is cut into the scene, so changing it cuts again; a live sun moves its light and shadows as you drag.', icon: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z' },
  { id: 'style', name: 'Style', note: 'How the scene is drawn: pixel art, or one of the painted and drawn looks.', icon: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-1.4-1-1.6-1-2.6 0-.8.6-1.3 1.5-1.3H16a5 5 0 0 0 5-5c0-4-4-7.5-9-7.5zM7.5 11h.01M10 7h.01M15 7h.01' },
  { id: 'export', name: 'Export', note: 'Save a picture, the loop, or a flight along a camera path, in the style on show.', icon: 'M12 3v12M7 10l5 5 5-5M4 19h16' },
]

const modeAsked = (search: string): CreatorMode => MODES.find((m) => m.id === new URLSearchParams(search).get('mode'))?.id ?? 'scene'

/** A piece cut: the packed cut, the placement it was cut at, and how far it reaches from its foot along the ground. */
interface Cut { id: number; thing: string; packed: PackedCut; at: Placement; reach: number; plain: boolean }

const hexOf = (c: ArrayLike<number>) => `#${Array.from(c, (v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

/** A creature's move to play on its own bones: its cut's bones taken back to where they stood before it was placed. */
function creaturePosable(id: string, bones: readonly Bone[], at: Placement, loop: number): Posable | undefined {
  const move = creatureMove(id, loop)
  if (!move) return undefined
  const t = placer([0, 0, 0], at)
  return { bones: bones.map((x) => ({ ...x, head: t.back(x.head), tail: x.tail && t.back(x.tail) })), pose: (sk, time) => move.pose(sk, time), lights: () => [] }
}

/** A model's clip to play on its own bones: its cut's bones taken back to where they stood before it was placed. */
function modelPosable(m: SplatModel, bones: readonly Bone[], at: Placement, loop: number): Posable {
  const t = placer([0, 0, 0], at)
  return { bones: bones.map((x) => ({ ...x, head: t.back(x.head), tail: x.tail && t.back(x.tail) })), pose: (sk, time) => poseModel(m, sk, loop, time), lights: () => [] }
}

/**
 * Opens a model of your own from its file: a rigged splat .glb plays its moves; a rigged mesh is covered in blobs on
 * its bones; a still mesh (.obj with its .mtl text, or a .glb) is cut on the scene's grid when it is closed, and covered
 * in blobs when it isn't (`open`).
 */
async function readModel(mf: ModelFile): Promise<{ model: ModelProp; open: boolean }> {
  const { file, bytes } = mf
  if (mf.scan) return { model: await scanModel(mf), open: false }
  let m: ModelProp
  if (/\.glb$/i.test(file)) {
    try {
      m = modelFrom(readRiggedGlb(bytes), file, bytes)
    } catch (e) {
      if (!isMeshGlb(e)) throw e
      m = isSkinned(bytes)
        ? { ...modelFrom(await rigFromModel(bytes, file, SCATTERED), file, bytes, skinnedTall(bytes)), scattered: true }
        : await meshModel(readMeshGlb(bytes), file, bytes)
    }
  } else m = await meshModel(readObj(new TextDecoder().decode(bytes), mf.mtl), file, bytes)
  if (m.kind === 'mesh' && openShare(m.mesh) > OPEN_MOST) return { model: { ...modelFrom(scatteredStill(m.mesh, m.name, m.images.map(rawTexture)), file, bytes, m.tall), scattered: true }, open: true }
  return { model: m, open: false }
}

/** Most blobs a scan for a land is read with, on a phone and elsewhere: the rest of the room is for props. */
const SCAN_MOST = { phone: 200_000, other: 400_000 }

/** A splat scan as a land (#381): read, leveled and cleaned, and kept as a model on one still bone. */
async function scanModel(mf: ModelFile): Promise<SplatModel> {
  const phone = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  const { blobs } = await readSplatFile(mf.bytes.slice().buffer, mf.file, phone ? SCAN_MOST.phone : SCAN_MOST.other)
  const land = landFromScan(blobs)
  if (!land.count) throw new MeshFileError('Nothing was left of the scan once it was cleaned')
  const name = mf.file.replace(/\.[^.]*$/, '')
  return { ...modelFrom({ name, ...stillActor(land), clips: [] }, mf.file, mf.bytes), scan: true }
}

/** The least blobs a thing of a whole scene is covered in when it is open: the scene shares `SCATTERED` among them. */
const PART_SCATTERED_LEAST = 4000

/**
 * A model of a whole scene (#380): each thing at the top of its tree a model of its own (`partId`), cut as a still
 * mesh, or covered in blobs where it is open, with its box in the file's own units for laying the scene out.
 */
async function readSceneModels(mf: ModelFile): Promise<{ model: ModelProp; box: { min: Vec3; max: Vec3; byHeight?: boolean } }[]> {
  const { parts, images } = readMeshGlbParts(mf.bytes)
  const decoded = await Promise.all(images.map((im) => decodeImage(im.bytes, im.mime).catch((): RawImage => ({ width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) }))))
  const each = Math.max(PART_SCATTERED_LEAST, Math.floor(SCATTERED / parts.length))
  return parts.map((part, i) => {
    const id = partId(mf.id, i)
    const box = meshBounds(part.mesh)
    const m = { ...meshModelFrom(part.mesh, decoded, part.name, mf.bytes), id }
    if (openShare(m.mesh) <= OPEN_MOST) return { model: m, box }
    return { model: { ...modelFrom(scatteredStill(m.mesh, m.name, decoded.map(rawTexture), each), part.name, mf.bytes, m.tall), id, scattered: true }, box: { ...box, byHeight: true } }
  })
}

/** A still mesh as a model, its textures decoded here (the cut worker takes their pixels). */
async function meshModel(f: MeshFile, name: string, bytes: Uint8Array): Promise<ModelProp> {
  const images = await Promise.all(f.images.map((im) => decodeImage(im.bytes, im.mime).catch((): RawImage => ({ width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) }))))
  return meshModelFrom(f.mesh, images, name, bytes)
}

/** A .glb's image as pixels. */
async function decodeImage(bytes: Uint8Array, mime: string): Promise<RawImage> {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }))
  const c = new OffscreenCanvas(bitmap.width, bitmap.height)
  const g = c.getContext('2d')!
  g.drawImage(bitmap, 0, 0)
  const { data, width, height } = g.getImageData(0, 0, bitmap.width, bitmap.height)
  bitmap.close()
  return { width, height, data }
}

/** How tall a skinned .glb's mesh stands in its own units, before it is fitted. */
function skinnedTall(bytes: Uint8Array): number | undefined {
  try { const { min, max } = meshBounds(readSkinnedGlb(bytes, 'model').mesh); return max[1] - min[1] } catch { return undefined }
}

/** Whether a .glb's mesh has a skin (a rigged mesh, not a still one). */
function isSkinned(bytes: Uint8Array): boolean {
  try { return !!openGlb(bytes).json.skins?.length } catch { return false }
}

/** One piece of what is open: what its cut is kept under, and the job that cuts it. */
interface Piece { key: string; thing: string; plain: boolean; job: (spacing: number) => CutJob }

/** How long the cutter waits after the last edit before it starts, so a run of key presses cuts once. */
const SETTLE_MS = 250
/** The splat files a scan for a land comes in. */
const SCAN_FILE = /\.(ply|spz|splat|ksplat)$/i
/** The land a model of a whole scene opens on (#380): level, so the scene's own ground stands on it as it was. */
const SCENE_LAND = 'plain-turf'
/** A press that moves less than this many pixels is a tap. */
const TAP = 6
const LIFT_MOST = 0.6
const fmt = (v: number, k = 2) => v.toFixed(k)
/** What a library card carries when it is dragged onto the view. */
const DRAG_TYPE = 'application/x-blobscape-prop'
const CARD_BY_ID = new Map(CARDS.map((e) => [e.id, e]))

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
  // the light while a slider or a lamp is still being dragged, and the lamp picked
  const [lightDraft, setLightDraft] = useState<ProjectLight>()
  const lightNow = lightDraft ?? project?.light
  const [lampPicked, setLampPicked] = useState<number>()
  // how the scene is drawn (`?style=`), and pixel art's own settings
  const calm = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const [style, setStyleState] = useState<Style>(() => styleAsked(typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('style')))
  const pixels = isPixelStyle(style)
  const glitching = style === 'glitch'
  const drawnStyle = pixels ? undefined : style
  // cel shading, neon and stained glass light the blobs themselves, so every piece is cut with no light baked in
  const plain = wantsPlain(drawnStyle)
  const [px, setPx] = useState<PixelChoice>(() => pixelStart(shown.finish))
  const [glitch, setGlitch] = useState<GlitchChoice>(GLITCH_START)
  const work = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  useWorkspaceScreen(work)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<OrbitDrag | null>(null)
  const grab = useRef<{ kind: 'move' | 'turn' | 'lamp'; i: number; from: { x: number; y: number }; offset: [number, number]; turn0: number; angle0: number; moved: boolean } | null>(null)
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
    setPx(pixelStart(shownOf(o).finish))
    const url = new URL(location.href)
    url.searchParams.delete('scene'); url.searchParams.delete('land'); url.searchParams.delete('project')
    const [k, v] = queryFor(o)
    url.searchParams.set(k, v)
    history.replaceState(history.state, '', url.pathname + url.search + (isLink(url.hash) ? '' : url.hash))
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

  // your own models opened in the page (kept for its life), and what opening the last one said
  const [modelsVersion, setModelsVersion] = useState(0)
  const [modelNote, setModelNote] = useState('')
  const modelInput = useRef<HTMLInputElement>(null)
  // each model's own file, for the shelf and for project files to carry
  const modelFiles = useRef(new Map<string, ModelFile>())
  // The pieces and what each is cut under. A prop's cut doesn't change as it moves (its light comes from the way it
  // faces, not where it stands), so its place is left out: a moved or copied prop needs no cut of its own.
  const pieces = useMemo<Piece[]>(() => {
    if (opened.kind === 'whole' || !project || !cp) return [{ key: JSON.stringify([`whole:${opened.kind === 'whole' ? opened.scene : ''}`, plain]), thing: 'whole', plain, job: (spacing) => ({ kind: 'whole', scene: opened.kind === 'whole' ? opened.scene : '', spacing, plain }) }]
    const steps = cp.land.c.steps ? cp.palette : null
    const light = cutLight(project.light)
    const land = JSON.stringify([project.land, project.loop, steps, light, plain])
    // haze and weather go into the land's air alone (a prop is cut with none), so they cut the land again and no prop:
    // rain first cut every piece again, and on a phone the scene stood still while they came
    const propLight = light && { ...light, haze: undefined, weather: undefined }
    const landModel = typeof project.land === 'string' && isModel(project.land) ? modelOf(project.land) : undefined
    const landJob = landModel && modelJob(landModel)
    return [
      { key: JSON.stringify([land, !!landJob]), thing: 'land', plain, job: (spacing) => ({ kind: 'land', project, spacing, plain, model: landJob }) },
      ...project.props.map((p, i): Piece => {
        // a model of your own goes to the cutter with its job; whether the page has it is part of what it is cut as
        const known = isModel(p.prop) ? modelOf(p.prop) : undefined
        const model = known && modelJob(known)
        return { key: JSON.stringify([p.prop, p.turn, p.size, project.loop, project.land, steps, propLight, plain, !!model]), thing: JSON.stringify(p.prop), plain, job: (spacing) => ({ kind: 'prop', project, i, spacing, plain, model }) }
      }),
    ]
  }, [opened, project, cp, plain, modelsVersion])

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
              cuts.current.set(k, { id: ++nextCut.current, thing: pc.thing, packed, at, reach: reachOf(packed, at), plain: pc.plain })
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
  const live = useRef({ shown, chosen, project, preview, light: lightNow, posers: new Map<string, PlacedPoser>(), morphs: new Map<number, PlacedMorphs>() })
  live.current = { ...live.current, shown, chosen, project, preview, light: lightNow }
  /** Where prop `i` stands now: mid-gesture where it is going, else where the project says. */
  const placementOf = (i: number): Placement | undefined => (preview?.i === i ? preview.at : project?.props[i])

  // the pieces on show and how they are posed, for saving them as one file for the engine (#387)
  const posing = useRef<{ pieces: Built[]; pose: (t: number) => void }>(undefined)
  useEffect(() => {
    if (!stage || !built) return
    const [land, ...props] = built
    const from = stage.time
    stage.setActor(land, undefined, props)
    posing.current = { pieces: built, pose: (t) => poseAll(land.skeleton, t) }
    const poseAll = (sk: Skeleton, t: number) => {
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
          if (!poser) {
            // a creature plays its own move on its own bones, as it stood before it was placed
            const model = isModel(placed.prop) ? modelOf(placed.prop) : undefined
            const own = isCreature(placed.prop) ? creaturePosable(placed.prop, b.skeleton.bones, cut.at, cpNow.loop)
              : model?.kind === 'splats' ? modelPosable(model, b.skeleton.bones, cut.at, cpNow.loop) : undefined
            poser = new PlacedPoser(own ?? p.c, p.prop.foot, cut.at, placed.still)
            L.posers.set(key, poser)
          }
          poser.pose(b.skeleton, t)
          // a model's blend shapes, as its clip weighs them, reshape its blobs, which go up again only when they change
          const m = isModel(placed.prop) && !placed.still ? modelOf(placed.prop) : undefined
          if (m?.kind === 'splats' && m.morphs && m.rest.count + 1 === b.blobs.count) {
            let mo = L.morphs.get(cut.id)
            if (!mo) { mo = new PlacedMorphs({ ...m, morphs: m.morphs }, cut.at); L.morphs.set(cut.id, mo) }
            if (mo.update(b.blobs, cpNow.loop, t)) stage.reshape(b)
          }
          redrawn(b.skeleton, cut.at, now)
          b.skeleton.update()
        })
        // lights from where everything stands now, the visitor's lamps, and glow as the Glow slider has it
        const l = L.light
        const points: PointLight[] = [...cpNow.land.c.lights(t), ...cpNow.props.flatMap((p, i) => {
          const now = L.preview?.i === i ? L.preview.at : L.project!.props[i]
          return now ? new PlacedPoser(p.c, p.prop.foot, now, L.project!.props[i].still).lights(t) : []
        }), ...lampLights(l, t, cpNow.loop)]
        const own = L.shown.finish.glow
        const lights: Light[] = castBy(points, glowGain(l?.glow ?? own, own))
        if (l?.live) {
          // the sun, the moon and the sky's own light at the hour, the sun casting shadows where the device draws them
          const sky = liveSky(l.live.hour, stage.backend === 'webgpu')
          stage.setLights([...sky.lights, ...lights], sky.ambient)
        } else stage.setLights(lights, 1)
      } else {
        props.forEach((b, i) => L.shown.poseProp(i, b.skeleton, t))
        stage.setLights(L.shown.lights(t, stage.backend === 'webgpu'), L.shown.ambient)
      }
    }
    stage.setPoser(poseAll, from)
  }, [stage, built])
  useEffect(() => { stage?.invalidate() }, [stage, project, preview])

  // a live sun paints the sky behind at its hour
  const liveHour = lightNow?.live?.hour
  const skyColors = useMemo<NonNullable<PixelLook['sky']>>(() => {
    if (liveHour === undefined) return shown.sky
    const [top, low] = liveSkyColors(liveSky(liveHour, false).sky)
    return [rgbOf(top), rgbOf(low)]
  }, [liveHour, shown.sky])
  // a sky the Light mode set (its colors, or a live sun's) is always behind; otherwise Style's switch says
  const skyForced = liveHour !== undefined || !!lightNow?.sky
  const glow = lightNow?.glow ?? shown.finish.glow
  // the scene's palette, with the colors of any creature in it, which its description can't bring
  const creatureColors = chosen.flatMap((c) => c?.packed.colors ?? []).join(',')
  const palette = useMemo(() => (creatureColors ? joinPalettes([shown.palette.map(hexOf), creatureColors.split(',')]) : shown.palette), [shown.palette, creatureColors])
  const palettes = useMemo(() => paletteChoices(palette), [palette])
  const look = useMemo<PixelLook>(() => pixelLook({ ...px, sky: px.sky || skyForced }, palettes, skyColors, glow), [px, skyForced, palettes, skyColors, glow])
  useEffect(() => { stage?.setPixels(pixels ? look : undefined, px.size) }, [stage, pixels, look, px.size])
  // pixel art can move in held steps; the other styles move every frame
  useEffect(() => { if (stage) { stage.step = pixels && px.rate ? 1 / px.rate : 0; stage.invalidate() } }, [stage, pixels, px.rate])
  // the glitch's bursts come in steps of the scene's own clock, a whole number of steps a loop, so an export joins up
  useEffect(() => { stage?.setGlitch(glitching ? glitchLook(glitch, shown.loop, calm && !offscreen) : undefined) }, [stage, glitching, glitch, shown.loop, calm, offscreen])
  // on a phone the styles that fill the whole screen are drawn at one and a half device pixels to a CSS pixel, as Pixel Diorama does
  useEffect(() => { stage?.setSharpness(coarse && !pixels ? 1.5 : 2) }, [stage, coarse, pixels])
  // one of Brush and Ink's looks in place of pixel art. Cel shading's and stained glass's flat fills are gathered on the land
  const drawing = useDrawnLook(stage, drawnStyle, {
    actor: built?.[0], plain: !!chosen[0]?.plain, azimuth: shown.orbit.azimuth, offscreen, light: coarse, loop: shown.loop,
    sky: px.sky || skyForced ? [skyColors[0], skyColors[1]] : undefined,
  })
  const drawStyle = (id: Style) => {
    setStyleState(id)
    const url = new URL(location.href)
    if (id === 'pixel') url.searchParams.delete('style')
    else url.searchParams.set('style', id)
    history.replaceState(history.state, '', url.pathname + url.search + url.hash)
    say(`Drawn as ${STYLES.find((x) => x.id === id)!.label.toLowerCase()}.`)
  }

  // --- export ----------------------------------------------------------------

  const exporting = useExport({ stage, canvas, pixels, style, page: 'scene-creator', name: nameFor(opened), loop: shown.loop, orbit })
  // --- kept in this browser (#340) ------------------------------------------

  // the shelf: undefined while it opens, null where this browser keeps nothing
  const [shelf, setShelf] = useState<Shelf | null>()
  const [savedList, setSavedList] = useState<SavedScene[]>([])
  const [fileProblems, setFileProblems] = useState<string[]>([])
  const [renaming, setRenaming] = useState<string>()
  const [deleting, setDeleting] = useState<string>()
  const savedId = opened.kind === 'project' && 'saved' in opened.from ? opened.from.saved : undefined
  /** The open project as it is kept: with the view, the style and pixel art's settings. */
  const keeping = useMemo<SceneProject | undefined>(() => project && {
    ...project, camera: orbit, style: { id: style, settings: { pixel: px, ...(glitching ? { glitch } : {}) } },
  }, [project, orbit, style, px, glitch, glitching])
  // what was kept last (so opening a scene doesn't count as a change) and each scene's picture
  const keptText = useRef('')
  const pictures = useRef(new Map<string, string>())
  const pictureFor = useRef<string>(undefined)
  const refreshList = async (sh: Shelf | null | undefined = shelf) => {
    if (!sh) return
    try {
      const list = await sh.list()
      for (const r of list) if (r.picture) pictures.current.set(r.id, r.picture)
      setSavedList(list)
    } catch (e) { console.warn(e) }
  }
  const lost = (e: unknown) => {
    console.warn(e)
    setShelf(null)
    say('This browser stopped keeping your work. Save it as a file to keep it.')
  }
  /** Opens a project with its view, its style and settings: kept under `from.saved`, or unkept until its first edit. */
  const openProject = (p: SceneProject, from: Extract<Opened, { kind: 'project' }>['from']) => {
    const o: Opened = { kind: 'project', from, project: p }
    open(o)
    pictureFor.current = undefined
    const st = p.style
    const id = STYLES.find((x) => x.id === st?.id)?.id
    if (id && id !== style) drawStyle(id)
    const settings = (st?.settings ?? {}) as { pixel?: unknown; glitch?: unknown }
    setPx(mergedLike(pixelStart(shownOf(o).finish), settings.pixel))
    setGlitch(mergedLike(GLITCH_START, settings.glitch))
  }
  /** Opens a kept scene: its project, its view, its style and settings. */
  const openSaved = (r: SavedScene) => {
    openProject(r.project, { saved: r.id })
    keptText.current = JSON.stringify(r.project)
    void shelf?.setLast(r.id).catch(console.warn)
    say(`Opened ${r.project.name}.`)
  }
  /**
   * Opens a scene shared as a link (#386): unkept, as an opened scene is, until its first edit keeps it here. The link
   * stays in the address until then, so a reload opens it again.
   */
  const openLink = async (hash: string) => {
    const { project: p, problems } = await readLink(hash)
    if (!p) { setFileProblems(problems); say('That link does not hold a scene this page can open.'); return false }
    setFileProblems([])
    openProject(p, { land: typeof p.land === 'string' ? p.land : START_LANDS[0].id })
    keptText.current = ''
    history.replaceState(history.state, '', location.pathname + location.search + hash)
    say(`Opened ${p.name} from its link. Change anything and it is kept in this browser.`)
    return true
  }
  const [linking, setLinking] = useState<string>()
  // a link that is old news once the scene changes
  useEffect(() => setLinking(undefined), [keeping])
  // a shared link pasted into the address while the page is open
  useEffect(() => {
    const on = () => { if (isLink(location.hash)) void openLink(location.hash) }
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  /** Copies a link holding the whole open scene, or says why it can't be one. */
  const copyLink = async () => {
    if (!keeping) return
    const { hash, why } = await linkFor(keeping)
    if (!hash) { setLinking(why); say(why ?? ''); return }
    const url = `${location.origin}${location.pathname}${hash}`
    setLinking(url)
    try {
      await navigator.clipboard.writeText(url)
      say('Copied a link to this scene. The link holds the whole scene, so nothing is stored anywhere.')
    } catch { say('Here is a link to this scene, below. The link holds the whole scene, so nothing is stored anywhere.') }
  }
  // opens the shelf once the page is in the browser, then what the address asks for or the scene open last
  useEffect(() => {
    let gone = false
    // a scan Scan Studio handed over (#385) opens as the land, in place of the scene open last; so does a shared link (#386)
    const handed = takeScan()
    const linked = !handed && isLink(location.hash) ? location.hash : undefined
    if (linked) void openLink(linked)
    void openShelf().then(async (sh) => {
      if (gone) return
      setShelf(sh ?? null)
      if (handed) void openScanLand(handed, sh ?? null)
      if (!sh) return
      await refreshList(sh)
      // your own models open again in the background; scenes using them are cut again as each arrives
      void sh.models().then((list) => takeModels(list, 'this browser')).catch(console.warn)
      const q = new URLSearchParams(location.search)
      const asked = q.get('project')
      const id = linked ? undefined : asked ?? (handed || q.has('scene') || q.has('land') ? undefined : await sh.last().catch(() => undefined))
      if (!id || gone) return
      const r = await sh.get(id).catch(() => undefined)
      if (gone) return
      if (r) openSaved(r)
      else if (asked) say('That saved scene is not in this browser.')
    })
    return () => { gone = true }
    // once, on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  /** Keeps the open project under `id`, with its picture. */
  const keep = async (id: string, p: SceneProject) => {
    if (!shelf) return
    try {
      await shelf.put({ id, updated: Date.now(), project: p, picture: pictures.current.get(id) })
      await shelf.setLast(id)
      await refreshList()
    } catch (e) { lost(e) }
  }
  // Saves a moment after each change: a project that was opened and not touched is not kept, but its first edit keeps it
  // under a new id (the address then names it, `?project=`).
  const warned = useRef(false)
  useEffect(() => {
    if (!keeping || !hist) return
    const text = JSON.stringify(keeping)
    if (text === keptText.current || (!savedId && !hist.past.length)) return
    if (shelf === null) {
      if (!warned.current && hist.past.length) { warned.current = true; say('This browser is not keeping anything for this page, so save your scene as a file to keep it.') }
      return
    }
    if (!shelf) return
    const timer = setTimeout(() => {
      const id = savedId ?? newId()
      keptText.current = text
      if (!savedId) setOpened((o) => (o.kind === 'project' ? { ...o, from: { saved: id } } : o))
      const url = new URL(location.href)
      url.searchParams.delete('scene'); url.searchParams.delete('land'); url.searchParams.set('project', id)
      history.replaceState(history.state, '', url.pathname + url.search + (isLink(url.hash) ? '' : url.hash))
      void keep(id, keeping)
    }, AUTOSAVE_MS)
    return () => clearTimeout(timer)
    // keep and savedList change with every save
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keeping, savedId, shelf, hist])

  /** Renames a kept scene: the open one as an edit (so it can be undone), another on the shelf. */
  const renameSaved = async (r: SavedScene, name: string) => {
    setRenaming(undefined)
    const n = cleanName(name)
    if (!n || n === r.project.name) return
    if (r.id === savedId && project) { edit(renamed(project, n), `Renamed to ${n}.`); return }
    try { await shelf?.put({ ...r, updated: Date.now(), project: renamed(r.project, n) }); await refreshList(); say(`Renamed to ${n}.`) } catch (e) { lost(e) }
  }
  const copySaved = async (r: SavedScene) => {
    const from = r.id === savedId && keeping ? keeping : r.project
    const name = copyName(from.name, savedList.map((x) => x.project.name))
    const id = newId()
    const picture = pictures.current.get(r.id)
    if (picture) pictures.current.set(id, picture)
    try { await shelf?.put({ id, updated: Date.now(), project: { ...from, name }, picture }); await refreshList(); say(`Copied as ${name}.`) } catch (e) { lost(e) }
  }
  const deleteSaved = async (r: SavedScene) => {
    setDeleting(undefined)
    try { await shelf?.remove(r.id) } catch (e) { lost(e); return }
    pictures.current.delete(r.id)
    await refreshList()
    if (r.id === savedId) {
      // it stays open, kept again under a new name only if it is changed
      const id = newId()
      setOpened((o) => (o.kind === 'project' ? { ...o, from: { saved: id } } : o))
      const url = new URL(location.href)
      url.searchParams.delete('project')
      history.replaceState(history.state, '', url.pathname + url.search + url.hash)
      say(`Deleted ${r.project.name}. It stays open here, and is kept again if you change it.`)
    } else say(`Deleted ${r.project.name}.`)
  }
  const saveFile = () => {
    if (!keeping) return
    download(new TextEncoder().encode(fileText(keeping, [...modelFiles.current.values()])), fileName(keeping), 'application/json')
    say(`Saved ${fileName(keeping)}.`)
  }
  const fileInput = useRef<HTMLInputElement>(null)
  /** A model of a whole scene (#380) opened as a new scene on the round of turf: each thing a prop, standing where it stood. */
  const openSceneModel = async (f: File) => {
    setFileProblems([])
    say(`Opening ${f.name}…`)
    try {
      const bytes = new Uint8Array(await f.arrayBuffer())
      const mf: ModelFile = { id: modelId(bytes), file: f.name, bytes, scene: true, added: Date.now() }
      const read = await readSceneModels(mf)
      for (const { model } of read) keepModel(model)
      modelFiles.current.set(mf.id, mf)
      setModelsVersion((v) => v + 1)
      shelf?.putModel(mf).catch((e) => { console.warn(e); say(`This browser would not keep ${f.name}: save the scene as a file to keep it.`) })
      const base = openLand(SCENE_LAND)!
      const under = groundOf(compileProject(base, libraryProp), DETAIL[0].spacing)
      const layout = sceneLayout(read.map((r) => r.box), spanOf(under), heightAt(under, 0, 0, 0))
      const bare = cleanName(f.name.replace(/\.glb$/i, ''))
      const name = bare ? bare[0].toUpperCase() + bare.slice(1) : 'Your scene'
      const p = sceneProject(base, name, read.map((r, i) => ({ id: r.model.id, ...layout[i] })))
      openSaved({ id: newId(), updated: Date.now(), project: p })
      keptText.current = ''
      const covered = read.filter((r) => r.model.kind === 'splats').length
      say(`Opened ${name}: ${read.length} ${read.length === 1 ? 'thing' : 'things'}, each a prop${covered ? `, ${covered} covered in blobs since ${covered === 1 ? 'it is' : 'they are'} not closed` : ''}.`)
    } catch (e) {
      setFileProblems([`file: ${e instanceof GlbError || e instanceof MeshFileError ? e.message : 'not a model this page can read'}`])
      say(`${f.name} could not be opened.`)
    }
  }
  /** A splat scan opened as the land of a new scene (#381): leveled and cleaned, drawn as captured. */
  const openScanLand = async (f: File, sh = shelf) => {
    setFileProblems([])
    say(`Opening ${f.name}: leveling and cleaning it…`)
    try {
      const bytes = new Uint8Array(await f.arrayBuffer())
      const mf: ModelFile = { id: modelId(bytes), file: f.name, bytes, scan: true, added: Date.now() }
      const m = await scanModel(mf)
      keepModel(m)
      modelFiles.current.set(mf.id, mf)
      setModelsVersion((v) => v + 1)
      sh?.putModel(mf).catch((e) => { console.warn(e); say(`This browser would not keep ${f.name}: save the scene as a file to keep it.`) })
      const bare = cleanName(f.name.replace(/\.[^.]*$/, ''))
      openSaved({ id: newId(), updated: Date.now(), project: scanProject(m.id, bare ? bare[0].toUpperCase() + bare.slice(1) : 'Your scan') })
      keptText.current = ''
      say(`Opened ${f.name} as the land: ${m.rest.count.toLocaleString('en-US')} blobs. Its light is the light it was captured in, so live light adds to it.`)
    } catch (e) {
      setFileProblems([`file: ${e instanceof ImportError || e instanceof MeshFileError ? e.message : 'not a splat scan this page can read'}`])
      say(`${f.name} could not be opened.`)
    }
  }
  const openFile = async (f: File) => {
    if (/\.glb$/i.test(f.name)) { await openSceneModel(f); return }
    if (SCAN_FILE.test(f.name)) { await openScanLand(f); return }
    const text = await f.text()
    // a scene description (what Pixel Diorama opens) comes in as a project of its own props and land (#379)
    const { project: p, models, problems } = isDescription(text) ? { ...readDescribed(text), models: [] as ModelFile[] } : readFile(text)
    setFileProblems(problems)
    if (!p) { say(`${f.name} could not be opened.`); return }
    // the models it carries are kept as if opened here
    if (models.length) {
      await takeModels(models, f.name)
      for (const mf of models) shelf?.putModel(mf).catch(console.warn)
    }
    const r: SavedScene = { id: newId(), updated: Date.now(), project: p }
    openSaved(r)
    // kept at once: it came from the visitor's own file
    keptText.current = ''
  }
  // a picture of the open scene for its card, once everything is cut and whenever what it shows has changed
  useEffect(() => {
    if (!shelf || !savedId || !done || !keeping || exporting.busy) return
    const key = JSON.stringify([keeping.land, keeping.props, keeping.light, style, px, glitch, detail])
    if (key === pictureFor.current) return
    const timer = setTimeout(() => {
      void exporting.snapshot(240).then((pic) => {
        if (!pic) return
        pictureFor.current = key
        pictures.current.set(savedId, pic)
        void keep(savedId, keeping)
      })
    }, 1200)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelf, savedId, done, keeping, exporting.busy, style, px, glitch, detail])

  // a camera path: views saved as stops, flown through smoothly (cameraPath.ts)
  const [stops, setStops] = useState<Orbit[]>([])
  const [leg, setLeg] = useState(3)
  const [flying, setFlying] = useState(false)
  const pathLength = pathSeconds(stops.length, leg)
  useEffect(() => {
    if (!flying || stops.length < 2) return
    let raf = 0
    const start = performance.now()
    const tick = () => {
      const u = (performance.now() - start) / 1000 / pathLength
      setOrbit(pathAt(stops, Math.min(1, u)))
      if (u < 1) raf = requestAnimationFrame(tick)
      else setFlying(false)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [flying, stops, pathLength])
  useEffect(() => {
    // while an export runs it holds the view; what is turned meanwhile shows afterwards
    if (!stage || exporting.held.current) return
    stage.orbit = orbit
    // haze is measured from the view's target, so it stays put on the scene as the view moves in and out
    const h = shown.haze
    stage.setFog(h?.color ?? [0, 0, 0], h ? orbit.distance + h.from : 0, h ? orbit.distance + h.to : 0)
    stage.invalidate()
  }, [stage, orbit, shown.haze, exporting.recording === null])
  useEffect(() => { stage?.invalidate() }, [stage, lightNow])
  useWheelZoom(canvas, setOrbit)

  // --- the ground and arranging --------------------------------------------

  // the land's still shapes, for dragging along the ground and standing a prop on it
  const landRef = project ? JSON.stringify(project.land) : ''
  const ground = useMemo<Shape[]>(() => {
    // a scan for a land (#381) has no shapes: its ground is read from its blobs
    const scan = project && typeof project.land === 'string' && isModel(project.land) ? modelOf(project.land) : undefined
    if (scan?.kind === 'splats') return [scanGround(unpack(scan.rest).blobs)]
    return cp ? groundOf(cp, DETAIL[0].spacing) : []
  },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [landRef, modelsVersion])
  // off the land, a prop keeps its height
  const groundAt = (x: number, z: number, y: number) => heightAt(ground, x, z, y)
  const liftOf = (pl: Placement) => liftOn(ground, pl)
  const nameOfProp = (i: number) => shown.items[i + 1]?.name ?? 'Prop'
  /** The scene as one rigged splat .glb with a clip of its loop, for `@blobscape/engine` and `<blobscape-creature>` (#387). */
  const saveForEngine = () => {
    const P = posing.current
    if (!P || !stage) return
    const name = project?.name ?? shown.name
    try {
      const rig = sceneRig(name, P.pieces.map((b, i) => ({ name: i ? nameOfProp(i - 1) : 'land', blobs: b.blobs, skin: b.skin, skeleton: b.skeleton })), shown.loop, P.pose)
      const file = `${slug(name)}.glb`
      download(writeRiggedGlb(rig), file, 'model/gltf-binary')
      say(`Saved ${file}: ${rig.blobs.count.toLocaleString('en-US')} blobs on ${rig.skeleton.count} bones, with its ${shown.loop}-second loop.`)
    } catch (e) {
      say(e instanceof RangeError ? e.message : 'The scene could not be saved for the engine.')
      if (!(e instanceof RangeError)) console.warn(e)
    }
    stage.invalidate()
  }

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
    if (i !== undefined) { if (mode !== 'arrange' && mode !== 'props') setMode('arrange'); say(`Picked ${nameOfProp(i)}.`) }
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
  // --- adding from the library ----------------------------------------------

  const [query, setQuery] = useState('')
  const [refused, setRefused] = useState('')
  const [pack, setPack] = useState<string>()
  const packOn = PACKS.find((k) => k.id === pack)
  const found = useMemo(() => cardsFound(query, packOn ? packOn.items.map((id) => CARD_BY_ID.get(id)!).filter(Boolean) : CARDS), [query, packOn])
  const lastBlobs = useRef(0)
  if (built) lastBlobs.current = built.reduce((n, b) => n + b.blobs.count, 0)
  const room = cp ? roomOf(cp, lastBlobs.current, coarse ? BLOB_ROOM.phone : BLOB_ROOM.other) : undefined

  /** Where a press at (x, y) on the view meets the ground; the middle of the view when left out. */
  const groundAtView = (x?: number, y?: number): Vec3 => {
    const r = canvas.current?.getBoundingClientRect()
    const level = orbit.target[1]
    const g = r ? groundFrom(x ?? r.width / 2, y ?? r.height / 2, level) : undefined
    const [gx, , gz] = g ?? orbit.target
    return [gx, groundAt(gx, gz, level), gz]
  }
  /** Sets a library prop down where (x, y) on the view meets the ground, picked and ready to drag; or swaps the land. */
  const addEntry = (e: LibraryEntry, x?: number, y?: number) => {
    if (!project || !cp || !room) return
    if (e.kind === 'land') { swapLand(e); return }
    const next = added(project, e.id, groundAtView(x, y), e.kind === 'creature' ? creatureSize(e.id) : 1)
    const why = whyNot(e.name, room, roomOf(compileProject(next, libraryProp), room.blobs[0], room.blobs[1]))
    setRefused(why ?? '')
    if (why) { say(why); return }
    edit(next, `Added ${e.name.toLowerCase()}. Drag it to move it, or open Arrange to turn and size it.`)
    setPicked(next.props.length - 1)
  }
  /** Sets one of your models down at the middle of the view, picked, at the height models start at. */
  // your models that can be set down: a scan opened as a land (#381) is not a prop
  const yourProps = modelsVersion >= 0 ? keptModels().filter((m) => !(m.kind === 'splats' && m.scan)) : []
  const addModel = (m: ModelProp) => {
    if (!project || !cp || !room) return
    const next = added(project, m.id, groundAtView(), modelSize(m, spanOf(ground)))
    const why = m.kind === 'splats' && room.blobs[0] + m.rest.count > room.blobs[1]
      ? `${m.name} has ${m.rest.count.toLocaleString('en-US')} blobs, and the scene has room for ${(room.blobs[1] - room.blobs[0]).toLocaleString('en-US')} more.`
      : whyNot(m.name, room, roomOf(compileProject(next, libraryProp), room.blobs[0], room.blobs[1]))
    setRefused(why ?? '')
    if (why) { say(why); return }
    edit(next, `Added ${m.name}. Drag it to move it, or open Arrange to turn and size it.`)
    setPicked(next.props.length - 1)
  }
  /**
   * Opens a model of your own and sets it down: a rigged splat .glb plays its moves; a still mesh (.obj, with its .mtl
   * picked beside it, or a .glb) is cut on the scene's grid like any part, when it is closed.
   */
  const openModel = async (files: File[]) => {
    const file = files.find((f) => /\.(glb|obj)$/i.test(f.name))
    if (!file) { setModelNote('Pick a .glb or an .obj (with its .mtl beside it, if it has one).'); return }
    setModelNote(`Opening ${file.name}…`)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const mtlFile = files.find((f) => /\.mtl$/i.test(f.name))
      const mf: ModelFile = { id: modelId(bytes), file: file.name, bytes, mtl: mtlFile && /\.obj$/i.test(file.name) ? await mtlFile.text() : undefined, added: Date.now() }
      const { model: m, open } = await readModel(mf)
      keepModel(m)
      modelFiles.current.set(m.id, mf)
      setModelsVersion((v) => v + 1)
      if (shelf) shelf.putModel(mf).catch((e) => { console.warn(e); say(`${m.name} is in the scene, but this browser would not keep its file: save the scene as a file to keep it.`) })
      if (m.kind === 'splats') {
        const clip = modelClip(m)
        setModelNote(`Opened ${m.name}: ${m.rest.count.toLocaleString('en-US')} blobs${open ? ' over its surface, since it is not closed to cut as a solid' : ''}${clip ? `, playing ${clip.name}` : ', standing still'}${m.morphs ? `, with ${m.morphs.length} blend ${m.morphs.length === 1 ? 'shape' : 'shapes'}` : ''}.`)
      } else setModelNote(`Opened ${m.name}: ${(m.mesh.indices.length / 3).toLocaleString('en-US')} triangles, cut on the scene's grid under its light.`)
      addModel(m)
    } catch (e) {
      setModelNote(`Could not open ${file.name}: ${e instanceof GlbError || e instanceof MeshFileError ? e.message : 'it is not a model this page can read'}.`)
    }
  }
  /** Lets go of one of your models: off the shelf and out of the list. Scenes using it keep it while the page is open. */
  const forgetModel = async (m: ModelProp) => {
    // a thing of a whole scene is kept with its file, so the file goes, and every thing in it
    const file = fileIdOf(m.id)
    try { await shelf?.removeModel(file) } catch (e) { lost(e); return }
    const gone = isPart(m.id) ? keptModels().filter((x) => fileIdOf(x.id) === file) : [m]
    for (const x of gone) forgetKept(x.id)
    const what = isPart(m.id) ? `${modelFiles.current.get(file)?.file ?? m.name} and its ${gone.length} things` : m.name
    modelFiles.current.delete(file)
    setModelsVersion((v) => v + 1)
    setModelNote(`Forgot ${what}. A scene using ${gone.length > 1 ? 'them' : 'it'} shows ${gone.length > 1 ? 'them' : 'it'} until the page is closed; open the file again to keep ${gone.length > 1 ? 'them' : 'it'}.`)
  }
  /** Takes in models a file or the shelf brought, as they open: the scenes using them are cut again with them. */
  const takeModels = async (files: ModelFile[], from: string) => {
    const failed: string[] = []
    for (const mf of files) {
      const had = mf.scene ? undefined : modelOf(mf.id)
      if (had) { keepModel(had); modelFiles.current.set(mf.id, mf); continue }
      try {
        if (mf.scene) for (const { model } of await readSceneModels(mf)) keepModel(model)
        else keepModel((await readModel(mf)).model)
        modelFiles.current.set(mf.id, mf)
      } catch (e) {
        console.warn(e)
        failed.push(mf.file)
      }
    }
    setModelsVersion((v) => v + 1)
    if (failed.length) say(`${failed.join(', ')} from ${from} could not be opened again.`)
  }
  /** Sets the whole of a pack down round the middle of the view, in one step to undo. */
  const addPack = () => {
    if (!project || !cp || !room || !packOn) return
    const middle = groundAtView()
    const next = packAdded(project, packOn, middle, (x, z) => groundAt(x, z, middle[1]))
    const why = next === project
      ? `A scene holds ${room.props[1]} props at most, and the ${packOn.name.toLowerCase()} pack has ${packOn.items.length}: delete some to make room.`
      : whyNot(packOn.name, room, roomOf(compileProject(next, libraryProp), room.blobs[0], room.blobs[1]))
    setRefused(why ?? '')
    if (why) { say(why); return }
    edit(next, `Set down the ${packOn.name.toLowerCase()} pack: ${packOn.items.length} props. Drag any of them, or open Arrange.`)
    setPicked(undefined)
  }
  const swapLand = (e: LibraryEntry) => {
    if (!project || project.land === e.id) return
    const to = groundOf(compileProject({ ...project, land: e.id, props: [] }, libraryProp), DETAIL[0].spacing)
    setRefused('')
    edit(landSwapped(project, e.id, ground, to), `Everything now stands on ${e.name.toLowerCase()}.`)
  }

  // --- light -----------------------------------------------------------------

  /** A light change while a slider or a lamp is still moving: shown, not yet a step to undo. */
  const draftLight = (change: Partial<ProjectLight>) => setLightDraft({ ...lightNow, ...change })
  /** A light change made at once, one step to undo. */
  const setLight = (change: Partial<ProjectLight>, words: string) => { if (project) { setLightDraft(undefined); edit(lit(project, { ...lightDraft, ...change }), words) } }
  /** Ends a light gesture: what it was going to becomes the project. */
  const commitLight = (words = 'Light changed.') => {
    if (!lightDraft || !project) return
    const next = lit(project, lightDraft)
    setLightDraft(undefined)
    edit(next, words)
  }
  const lamps = lightNow?.lamps ?? []
  const lampsNow = (i: number, change: Partial<NonNullable<ProjectLight['lamps']>[number]>) => lamps.map((l, k) => (k === i ? { ...l, ...change } : l))
  const addLamp = () => {
    if (!project) return
    const g = groundAtView()
    const next = lampAdded(lightDraft ? lit(project, lightDraft) : project, [g[0], g[1] + 0.25, g[2]])
    if (next === project) { say(`A scene takes ${MAX_PROJECT_LAMPS} lamps of its own at most.`); return }
    setLightDraft(undefined)
    edit(next, 'Added a lamp. Drag it in the view to move it.')
    setLampPicked(next.light!.lamps!.length - 1)
  }
  const removeLamp = (i: number) => { if (project) { setLightDraft(undefined); edit(lampRemoved(project, i), 'Deleted the lamp.'); setLampPicked(undefined) } }
  // how high a lamp stands over the first ground under it. Looked for from the lamp itself: from lower down, a lamp
  // nearer the ground than that started inside it and read as higher, so the Height slider sprang back (Matt saw it)
  const lampGround = (at: Vec3) => groundAt(at[0], at[2], at[1])
  const lampLift = (i: number) => { const l = lamps[i]; return l ? Math.max(0, l.at[1] - lampGround(l.at)) : 0 }
  /** On a light slider's box: dragging shows the change, letting go makes it one step to undo. */
  const lightGesture = { onPointerUp: () => commitLight(), onKeyUp: () => commitLight(), onBlur: () => commitLight() }

  const doUndo = () => { if (hist?.past.length) { setHist(undo(hist)); setPreview(undefined); setLightDraft(undefined); setPicked((p) => (p !== undefined && p < hist.past[hist.past.length - 1].props.length ? p : undefined)); say('Undone.') } }
  const doRedo = () => { if (hist?.future.length) { setHist(redo(hist)); setPreview(undefined); setLightDraft(undefined); setPicked((p) => (p !== undefined && p < hist.future[0].props.length ? p : undefined)); say('Redone.') } }

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

  // --- tools for an assistant in the browser (WebMCP, as the sandbox has) ----

  const r2 = (v: number) => Math.round(v * 100) / 100
  const toolApi: CreatorApi = {
    describe: () => {
      if (!project) return `${shown.name} is open whole: it cannot be taken apart, so nothing can be added or moved. Open a scene that comes apart or a bare land to work on it.`
      const reach = chosen[0]?.reach
      const l = project.light
      const lines = [
        `"${project.name}": ${shown.items[0].name} is the land${reach ? `, reaching about ${r2(reach)} units from its middle at [0, 0]` : ''}. y is up; places are [x, z].`,
        project.props.length ? `Props (${project.props.length} of 40):` : 'No props yet.',
        ...project.props.map((p, i) => `  ${i}. ${nameOfProp(i)} at [${r2(p.at[0])}, ${r2(p.at[2])}], turned ${Math.round(p.turn)}°, size ${r2(p.size)}${p.still ? ', held still' : ''}`),
        `Light: ${l?.live ? `the sun live at ${r2(l.live.hour)} o'clock` : l?.sun ? `a baked sun from ${l.sun.turn}° round and ${l.sun.height}° up` : 'the land\'s own sun'}${l?.weather ? `, ${l.weather} falling` : ''}${l?.glow !== undefined ? `, glow ${r2(l.glow)}` : ''}${l?.haze ? `, haze ${r2(l.haze)}` : ''}${l?.lamps?.length ? `, ${l.lamps.length} lamps` : ''}.`,
        `Drawn as ${STYLES.find((x) => x.id === style)!.label.toLowerCase()}. ${lastBlobs.current.toLocaleString('en-US')} blobs.`,
      ]
      return lines.join('\n')
    },
    props: () => CARDS.filter((e) => e.kind !== 'land').map((e) => e.id),
    addProp: (id, at) => {
      if (!project || !cp || !room) return 'Not done: this scene opened whole, so nothing can be added to it.'
      const e = CARD_BY_ID.get(id)
      if (!e || e.kind === 'land') return `Not done: there is no prop "${id}".`
      const spot: Vec3 = at ? [at[0], groundAt(at[0], at[1], orbit.target[1]), at[1]] : groundAtView()
      const next = added(project, id, spot, e.kind === 'creature' ? creatureSize(id) : 1)
      const why = whyNot(e.name, room, roomOf(compileProject(next, libraryProp), room.blobs[0], room.blobs[1]))
      if (why) return `Not done: ${why}`
      edit(next, `Added ${e.name.toLowerCase()}.`)
      setPicked(next.props.length - 1)
      return `Added ${e.name} as prop ${next.props.length - 1} at [${r2(spot[0])}, ${r2(spot[2])}]. It is cut in a moment.`
    },
    moveProp: (i, change) => {
      if (!project) return 'Not done: this scene opened whole, so it has no props.'
      const now = project.props[i]
      if (!now) return `Not done: there is no prop ${i}; the props are 0 to ${project.props.length - 1}.`
      let next = project
      if (change.size !== undefined) { if (change.size < SIZE_RANGE[0] || change.size > SIZE_RANGE[1]) return `Not done: a size is ${SIZE_RANGE[0]} to ${SIZE_RANGE[1]}.`; next = sized(next, i, change.size) }
      if (change.turn !== undefined) next = turned(next, i, change.turn)
      if (change.at) next = moved(next, i, [change.at[0], groundAt(change.at[0], change.at[1], now.at[1]) + liftOf(now), change.at[1]])
      edit(next, `${nameOfProp(i)} changed.`)
      const p = next.props[i]
      return `${nameOfProp(i)} is at [${r2(p.at[0])}, ${r2(p.at[2])}], turned ${Math.round(p.turn)}°, size ${r2(p.size)}.`
    },
    setLight: (ask) => {
      if (!project) return 'Not done: this scene opened whole, so its light is its own.'
      const change: Partial<ProjectLight> = {}
      if (ask.sun) change.sun = { turn: Math.round(ask.sun.turn), height: Math.round(ask.sun.height) }
      if (ask.hour === null) change.live = undefined
      else if (ask.hour !== undefined) change.live = { hour: ask.hour }
      if (ask.weather !== undefined) change.weather = ask.weather ?? undefined
      if (ask.glow !== undefined) change.glow = ask.glow
      if (ask.haze !== undefined) change.haze = ask.haze
      setLight(change, 'Light changed.')
      return `Light changed${ask.sun || ask.hour !== undefined || ask.weather !== undefined || ask.haze !== undefined ? '; the scene is cut again in a moment' : ''}.`
    },
    styles: () => STYLES.map((x) => x.id),
    setStyle: (id) => { const st = STYLES.find((x) => x.id === id); if (!st) return `Not done: there is no style "${id}".`; drawStyle(st.id); return `Drawn as ${st.label.toLowerCase()} now.` },
    undo: () => { if (!hist?.past.length) return 'Nothing to take back.'; doUndo(); return 'Took back the last change.' },
  }
  // registered once, always reaching this render's page
  const toolRef = useRef(toolApi)
  toolRef.current = toolApi
  useEffect(() => {
    const live = Object.fromEntries(Object.keys(toolRef.current).map((k) => [k, (...args: unknown[]) => (toolRef.current[k as keyof CreatorApi] as (...a: unknown[]) => unknown)(...args)])) as unknown as CreatorApi
    return registerTools(creatorTools(live)).remove
  }, [])

  // for the browser checks
  useEffect(() => {
    if (!offscreen || !stage) return
    ;(window as unknown as { __creator: unknown }).__creator = {
      stage, items: () => shown.items, ready: () => !!done, blobs: () => (built ? built.reduce((n, b) => n + b.blobs.count, 0) : 0),
      props: () => project?.props ?? [], land: () => project?.land, style, plain: () => !!chosen[0]?.plain, loopFrames: exporting.loopFrames, exportNote: () => exporting.note, light: () => lightNow, lampAt: (i: number) => { const l = lightNow?.lamps?.[i]; return l && stage.screenAt(l.at) }, picked: () => picked, said: () => said,
      // whether the open project as it stands now is what was last kept
      kept: () => !!keeping && keptText.current === JSON.stringify(keeping),
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
  }, [offscreen, stage, shown, built, done, project, picked, said, lightNow, style, chosen, exporting.loopFrames, exporting.note, keeping])

  const blobs = lastBlobs.current
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
                {!(m.id === 'arrange' && picked !== undefined) && <p className={`text-sm text-ink-muted ${m.id === 'props' && project ? 'max-lg:hidden' : ''}`}>{m.id === 'arrange' && !project ? 'This scene opened whole, so it has no props to arrange.' : m.id === 'props' && !project ? 'This scene opened whole, so nothing can be added to it. Start from a scene that comes apart, or a bare land.' : m.note}</p>}
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
                    <div data-testid="creator-saved">
                      <h3 id="creator-saved-heading" className="mb-1 text-sm font-semibold">Your scenes</h3>
                      <p className="mb-2 text-xs text-ink-muted" data-testid="creator-where">
                        {shelf === null
                          ? 'This browser is not keeping anything for this page (a private window, or storage turned off), so your work goes when you leave. Save it as a file to keep it.'
                          : 'Kept in this browser, on this device, and nowhere else. A scene is kept a moment after you change it. Clearing this site’s data removes them, so save a file of any you want to be sure of.'}
                      </p>
                      {savedList.length > 0 && (
                        <ul aria-labelledby="creator-saved-heading" className="mb-2 divide-y divide-rule rounded-lg border border-rule bg-paper text-sm" data-testid="creator-saved-list">
                          {savedList.map((r) => {
                            const on = r.id === savedId
                            const name = r.project.name
                            return (
                              <li key={r.id} className="flex gap-2 p-2" data-testid="creator-saved-item">
                                {r.picture
                                  ? <img src={r.picture} alt="" width={64} height={48} className="h-12 w-16 flex-none rounded object-cover" />
                                  : <span aria-hidden className="h-12 w-16 flex-none rounded bg-paper-sunk" />}
                                <div className="min-w-0 flex-1">
                                  {renaming === r.id
                                    ? <input type="text" defaultValue={name} autoFocus maxLength={80} aria-label={`New name for ${name}`} data-testid="creator-rename-box"
                                        className="min-h-8 w-full rounded border border-rule bg-paper px-2 text-sm outline-none focus-visible:border-accent"
                                        onKeyDown={(ev) => { if (ev.key === 'Enter') void renameSaved(r, ev.currentTarget.value); if (ev.key === 'Escape') { ev.stopPropagation(); setRenaming(undefined) } }}
                                        onBlur={(ev) => void renameSaved(r, ev.currentTarget.value)} />
                                    : <p className="truncate font-semibold">{name}{on && <span className="ml-1 text-xs font-normal text-ink-muted">(open)</span>}</p>}
                                  <p className="text-xs text-ink-faint">{new Date(r.updated).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>
                                  {deleting === r.id
                                    ? (
                                      <div role="group" aria-label={`Delete ${name}?`} className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                                        <span>Delete it for good?</span>
                                        <button type="button" onClick={() => void deleteSaved(r)} data-testid="creator-delete-yes" className="cursor-pointer rounded-full border border-accent px-2 py-0.5 font-semibold text-accent hover:bg-accent hover:text-paper">Delete</button>
                                        <button type="button" autoFocus onClick={() => setDeleting(undefined)} className="cursor-pointer rounded-full border border-rule px-2 py-0.5 font-semibold hover:border-ink-faint">Keep</button>
                                      </div>
                                    )
                                    : (
                                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs font-semibold">
                                        {!on && <button type="button" onClick={() => openSaved(r)} aria-label={`Open ${name}`} className="cursor-pointer text-accent hover:underline">Open</button>}
                                        <button type="button" onClick={() => setRenaming(r.id)} aria-label={`Rename ${name}`} className="cursor-pointer text-ink-muted hover:text-ink">Rename</button>
                                        <button type="button" onClick={() => void copySaved(r)} aria-label={`Copy ${name}`} className="cursor-pointer text-ink-muted hover:text-ink">Copy</button>
                                        <button type="button" onClick={() => setDeleting(r.id)} aria-label={`Delete ${name}`} className="cursor-pointer text-ink-muted hover:text-ink">Delete</button>
                                      </div>
                                    )}
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {keeping && <Button onClick={saveFile} data-testid="creator-save-file">Save as a file</Button>}
                        {keeping && <Button onClick={() => void copyLink()} data-testid="creator-copy-link">Copy a link</Button>}
                        <Button onClick={() => fileInput.current?.click()} data-testid="creator-open-file">Open a file</Button>
                        <input ref={fileInput} type="file" accept={`${FILE_END},.json,application/json,.glb,model/gltf-binary,.ply,.spz,.splat,.ksplat`} className="sr-only" tabIndex={-1} aria-hidden data-testid="creator-file"
                          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void openFile(f) }} />
                      </div>
                      {linking && (/^https?:/.test(linking)
                        ? <input readOnly value={linking} aria-label="Link to this scene" onFocus={(e) => e.currentTarget.select()} className="w-full rounded-lg border border-rule bg-paper px-2 py-1 text-xs" data-testid="creator-link" />
                        : <p className="text-xs text-ink-soft" data-testid="creator-link">{linking}</p>)}
                      <p className="mt-1 text-xs text-ink-soft">A link holds the whole scene in the address after its #, which browsers never send to a server, so nothing is stored anywhere; your own models need a file. Open a file takes a file saved here; a scene description (.json) as Pixel Diorama opens, the things it marks (or else what stands on bones of its own) coming in as props; a model of a whole scene (.glb), each thing at the top of its tree a prop, on a round of turf; or a splat scan (.ply, .spz, .splat, .ksplat) as the land, leveled and cleaned, in the light it was captured in.</p>
                      {fileProblems.length > 0 && (
                        <div role="alert" className="mt-2 rounded-lg border border-rule bg-paper p-2 text-xs" data-testid="creator-file-problems">
                          <p className="font-semibold">That file is not a scene this page can open:</p>
                          <ul className="mt-1 list-disc pl-4 font-mono">
                            {fileProblems.slice(0, 6).map((e) => <li key={e}>{e}</li>)}
                          </ul>
                          {fileProblems.length > 6 && <p className="mt-1">and {fileProblems.length - 6} more.</p>}
                        </div>
                      )}
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
                {m.id === 'props' && project && room && (
                  <div className="space-y-3" data-testid="creator-library">
                    <p className="text-xs tabular-nums text-ink-muted" data-testid="creator-room">
                      Room for {room.props[1] - room.props[0]} more {room.props[1] - room.props[0] === 1 ? 'prop' : 'props'} · {room.blobs[0].toLocaleString('en-US')} of {room.blobs[1].toLocaleString('en-US')} blobs
                    </p>
                    {refused && <p className="text-sm text-ink" data-testid="creator-refused">{refused}</p>}
                    <input type="search" value={query} onChange={(ev) => setQuery(ev.target.value)} placeholder="Find a prop or land" aria-label="Find a prop or land" className="min-h-10 w-full rounded-full border border-rule bg-paper px-4 text-sm outline-none focus-visible:border-accent" />
                    <div>
                      <h3 id="creator-models" className="mb-1 text-sm font-semibold">Your props</h3>
                      <p className="mb-2 text-xs text-ink-muted">A rigged .glb plays its moves: splats, such as one saved from Splat Creatures, or a mesh from Blender or a game kit, covered in blobs. A still model (.obj with its .mtl, or .glb) is cut into the scene under its light. They are kept in this browser, and a scene saved as a file carries the ones it uses.</p>
                      <input ref={modelInput} type="file" accept=".glb,.obj,.mtl,model/gltf-binary" className="sr-only" tabIndex={-1} aria-hidden="true" data-testid="creator-model-file"
                        multiple onChange={(ev) => { const f = [...(ev.target.files ?? [])]; ev.target.value = ''; if (f.length) void openModel(f) }} />
                      <button type="button" onClick={() => modelInput.current?.click()} data-testid="creator-model-open"
                        className="min-h-10 cursor-pointer rounded-full border border-rule bg-paper px-4 text-sm font-semibold hover:border-ink-faint">
                        Open a model…
                      </button>
                      <p role="status" className="mt-2 text-xs text-ink-muted" data-testid="creator-model-note">{modelNote}</p>
                      {modelsVersion > 0 && yourProps.length > 0 && (
                        <ul aria-labelledby="creator-models" className="mt-2 flex flex-wrap gap-2">
                          {yourProps.map((m) => (
                            <li key={m.id} className="flex items-center gap-1">
                              <button type="button" onClick={() => addModel(m)} data-testid={`creator-model-${m.id}`} className="min-h-10 cursor-pointer rounded-full border border-rule bg-paper px-4 text-sm hover:border-ink-faint">Add {m.name}</button>
                              <button type="button" onClick={() => void forgetModel(m)} aria-label={`Forget ${m.name}`} title={`Forget ${m.name}`} className="grid size-10 cursor-pointer place-items-center rounded-full text-ink-muted hover:bg-paper-sunk hover:text-ink">
                                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <h3 id="creator-packs" className="mb-2 text-sm font-semibold">Packs</h3>
                      <div className="flex flex-wrap gap-2" role="group" aria-labelledby="creator-packs" data-testid="creator-packs">
                        <Chip active={!packOn} onClick={() => setPack(undefined)}>Everything</Chip>
                        {PACKS.map((k) => <Chip key={k.id} active={pack === k.id} onClick={() => setPack(k.id)}>{k.name}</Chip>)}
                      </div>
                      {packOn && <p className="mt-2 text-xs text-ink-muted">{packOn.about}.</p>}
                      {packOn && (
                        <button type="button" onClick={addPack} data-testid="creator-pack-add"
                          className="mt-2 min-h-10 cursor-pointer rounded-full border border-rule bg-paper px-4 text-sm font-semibold hover:border-ink-faint">
                          Set the whole pack down
                        </button>
                      )}
                    </div>
                    {!found.length && <p className="text-sm text-ink-muted">Nothing {packOn ? `in the ${packOn.name.toLowerCase()} pack` : 'in the library'} matches “{query}”.</p>}
                    {found.map((g) => (
                      <div key={g.id}>
                        <h3 id={`creator-group-${g.id}`} className="mb-2 text-sm font-semibold">{g.name}</h3>
                        <ul aria-labelledby={`creator-group-${g.id}`} className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 lg:grid lg:grid-cols-2 lg:overflow-visible">
                          {g.cards.map((e) => {
                            const on = e.kind === 'land' && project.land === e.id
                            return (
                              <li key={e.id} className="w-28 flex-none lg:w-auto">
                                <button type="button" aria-pressed={e.kind === 'land' ? on : undefined} title={e.about} draggable={!coarse && e.kind !== 'land'}
                                  onDragStart={(ev) => { ev.dataTransfer.setData(DRAG_TYPE, e.id); ev.dataTransfer.effectAllowed = 'copy' }}
                                  onClick={() => addEntry(e)} data-testid={`creator-card-${e.id}`}
                                  className={`w-full cursor-pointer overflow-hidden rounded-lg border bg-paper text-left text-xs font-semibold transition-colors ${on ? 'border-accent' : 'border-rule hover:border-ink-faint'}`}>
                                  <img src={e.picture} alt="" width={320} height={240} loading="lazy" draggable={false} className="aspect-[4/3] w-full object-cover" />
                                  <span className="block truncate px-2 py-1">{e.name}{e.kind === 'land' && <span className="sr-only">{on ? ', the land now' : ', swap the land'}</span>}</span>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    ))}
                    {picked !== undefined && <p className="text-xs text-ink-faint">{nameOfProp(picked)} is picked: drag it in the view, or open Arrange to turn and size it.</p>}
                  </div>
                )}
                {m.id === 'light' && project && cp && (() => {
                  const sun = sunNow(cp, lightNow), shade = shadeNow(cp, lightNow), b = budget(cp, lightNow)
                  const skyNow = lightNow?.sky ?? cp.land.prop.doc.sky ?? ['#1a2440', '#5a6a8a']
                  const lamp = lampPicked !== undefined ? lamps[lampPicked] : undefined
                  return (
                    <div className="space-y-4" data-testid="creator-light">
                      <div>
                        <h3 className="mb-2 text-sm font-semibold">Sun</h3>
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Sun">
                          <Chip active={!lightNow?.live} onClick={() => setLight({ live: undefined }, 'The sun is baked into the scene.')}>Baked</Chip>
                          <Chip active={!!lightNow?.live} onClick={() => setLight({ live: { hour: lightNow?.live?.hour ?? 15 } }, 'The sun shines live, at the time of day.')}>Live, by the hour</Chip>
                        </div>
                      </div>
                      {lightNow?.live ? (
                        <div {...lightGesture}>
                          <Slider label="Time of day" value={lightNow.live.hour} min={0} max={24} step={0.25} format={clock} onChange={(v) => draftLight({ live: { hour: v } })}
                            hint={stage?.backend === 'webgpu' ? 'The sun and moon cross the sky and their shadows move as you drag.' : 'The sun and moon cross the sky as you drag. This browser draws without shadows from them.'} />
                        </div>
                      ) : (
                        <>
                          <div {...lightGesture}>
                            <Slider label="Sun from" value={sun.turn} min={-180} max={180} step={5} format={(v) => `${v}°`} onChange={(v) => draftLight({ sun: { ...sun, turn: v } })} />
                          </div>
                          <div {...lightGesture}>
                            <Slider label="Sun height" value={sun.height} min={5} max={85} step={5} format={(v) => `${v}°`} onChange={(v) => draftLight({ sun: { ...sun, height: v } })} />
                          </div>
                          <div {...lightGesture}>
                            <Slider label="Shade" value={Math.round(shade * 100) / 100} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => draftLight({ shade: v })} hint="How much light reaches what the sun doesn't." />
                          </div>
                          <div className="flex items-center gap-4 text-sm text-ink-muted">
                            <span>Sky</span>
                            <label className="flex items-center gap-1.5">Top <input type="color" value={skyNow[0]} onChange={(ev) => draftLight({ sky: [ev.target.value, skyNow[1]] })} onBlur={() => commitLight('Sky changed.')} className="h-8 w-10 cursor-pointer rounded border border-rule bg-paper" /></label>
                            <label className="flex items-center gap-1.5">Bottom <input type="color" value={skyNow[1]} onChange={(ev) => draftLight({ sky: [skyNow[0], ev.target.value] })} onBlur={() => commitLight('Sky changed.')} className="h-8 w-10 cursor-pointer rounded border border-rule bg-paper" /></label>
                          </div>
                          {lightDraft && !lightDraft.live && <p className="text-xs text-ink-faint">The scene is cut again under the new sun once you let go.</p>}
                        </>
                      )}
                      <div {...lightGesture}>
                        <Slider label="Glow" value={glow} min={0} max={4} step={0.25} format={(v) => (v ? `${v.toFixed(2)}×` : 'off')} onChange={(v) => draftLight({ glow: v })} hint="How strongly lamps, fires and other glowing things light what is round them." />
                      </div>
                      <div>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <h3 id="creator-lamps" className="text-sm font-semibold">Lamps</h3>
                          <button type="button" onClick={addLamp} data-testid="creator-add-lamp" className="min-h-9 cursor-pointer rounded-full border border-rule bg-paper px-3 text-sm font-semibold hover:border-ink-faint">Add a lamp</button>
                        </div>
                        {lamps.length > 0 && (
                          <ul aria-labelledby="creator-lamps" className="mb-3 flex flex-wrap gap-2">
                            {lamps.map((l, i) => <li key={i}><Chip active={i === lampPicked} onClick={() => setLampPicked(i === lampPicked ? undefined : i)}><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: l.color }} aria-hidden />Lamp {i + 1}</Chip></li>)}
                          </ul>
                        )}
                        {lamp && lampPicked !== undefined && (
                          <div className="space-y-3" data-testid="creator-lamp">
                            <label className="flex items-center gap-2 text-sm text-ink-muted">Color <input type="color" value={lamp.color} onChange={(ev) => draftLight({ lamps: lampsNow(lampPicked, { color: ev.target.value }) })} onBlur={() => commitLight('Lamp color changed.')} className="h-8 w-10 cursor-pointer rounded border border-rule bg-paper" /></label>
                            <div {...lightGesture}><Slider label="Strength" value={lamp.strength} min={0.25} max={4} step={0.25} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => draftLight({ lamps: lampsNow(lampPicked, { strength: v }) })} /></div>
                            <div {...lightGesture}><Slider label="Reach" value={lamp.range} min={0.1} max={3} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => draftLight({ lamps: lampsNow(lampPicked, { range: v }) })} /></div>
                            <div {...lightGesture}><Slider label="Height" value={Math.round(lampLift(lampPicked) * 100) / 100} min={0} max={1.5} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => { const at = lamp.at; draftLight({ lamps: lampsNow(lampPicked, { at: [at[0], lampGround(at) + v, at[2]] }) }) }} /></div>
                            <div {...lightGesture}><Slider label="Flicker" value={lamp.flicker?.by ?? 0} min={0} max={0.6} step={0.05} format={(v) => (v ? `${Math.round(v * 100)}%` : 'steady')} onChange={(v) => draftLight({ lamps: lampsNow(lampPicked, { flicker: v ? { by: v, times: 12 } : undefined }) })} /></div>
                            <button type="button" onClick={() => removeLamp(lampPicked)} className="min-h-9 cursor-pointer rounded-full border border-rule bg-paper px-3 text-sm font-semibold hover:border-ink-faint">Delete lamp</button>
                          </div>
                        )}
                        <p className="mt-2 text-xs tabular-nums text-ink-muted" data-testid="creator-light-budget">{b.live[0]} of {b.live[1]} live lights · {b.baked[0]} of {b.baked[1]} with baked shadows</p>
                      </div>
                      <div>
                        <h3 className="mb-2 text-sm font-semibold">Air</h3>
                        <div {...lightGesture}>
                          <Slider label="Haze" value={lightNow?.haze ?? (cp.land.c.haze ? Math.round(cp.land.c.haze.to) : 0)} min={0} max={12} step={0.5} format={(v) => (v ? `${v.toFixed(1)} away` : 'clear')} onChange={(v) => draftLight({ haze: v })} hint="Far things fade into the sky; lower is thicker." />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Weather">
                          {([undefined, 'rain', 'snow', 'leaves'] as const).map((w) => <Chip key={w ?? 'none'} active={lightNow?.weather === w} onClick={() => setLight({ weather: w }, w ? `${w[0].toUpperCase()}${w.slice(1)} falling.` : 'Nothing falling.')}>{w ? `${w[0].toUpperCase()}${w.slice(1)}` : 'None'}</Chip>)}
                        </div>
                      </div>
                    </div>
                  )
                })()}
                {m.id === 'style' && (
                  <div className="stack-controls space-y-5" data-testid="creator-style">
                    <Field label="Drawn as">
                      <div className="flex flex-wrap gap-1.5" data-testid="creator-styles">
                        {STYLES.map((l) => <Chip key={l.id} active={style === l.id} onClick={() => drawStyle(l.id)}>{l.label}</Chip>)}
                      </div>
                      <p className="mt-1.5 text-xs text-ink-faint">{STYLES.find((l) => l.id === style)?.note}{plain ? ' The scene is cut again with no light baked in, since this look lights it itself.' : ''}</p>
                    </Field>
                    {drawing.controls}
                    {glitching && <GlitchControls glitch={glitch} setGlitch={setGlitch} calm={calm} />}
                    {pixels && (() => {
                      const pal = palettes.find((p) => p.id === px.palette) ?? palettes[0]
                      return (
                        <>
                          <Field label="Palette">
                            <div className="flex flex-wrap gap-1.5" data-testid="creator-palettes">
                              {palettes.map((p) => <Chip key={p.id} active={pal.id === p.id} onClick={() => setPx((c) => ({ ...c, palette: p.id }))}>{p.label}</Chip>)}
                            </div>
                            <div aria-hidden className="mt-3 flex h-3 overflow-hidden rounded ring-1 ring-rule">
                              {pal.colors.length ? pal.colors.map((c, i) => <span key={i} className="flex-1" style={{ background: `rgb(${c[0]} ${c[1]} ${c[2]})` }} />) : <span className="flex-1 bg-paper-sunk" />}
                            </div>
                            <p className="mt-1.5 text-xs text-ink-faint">{!pal.colors.length ? 'No palette: every pixel keeps the color the scene gives it.' : pal.id === 'own' ? `${pal.colors.length} colors from the land and every prop on it. Every pixel snaps to the closest one.` : `${pal.note ?? `A shared palette of ${pal.colors.length} colors.`} Every pixel snaps to the closest one.`}</p>
                          </Field>
                          <Field label="Pixel size">
                            <div className="flex flex-wrap gap-1.5">
                              {PIXEL_SIZES.map((n) => <Chip key={n} active={px.size === n} onClick={() => setPx((c) => ({ ...c, size: n }))}>{`${n}×`}</Chip>)}
                            </div>
                          </Field>
                          <Field label="Motion">
                            <div className="flex flex-wrap gap-1.5">
                              {PIXEL_RATES.map((n) => <Chip key={n} active={px.rate === n} onClick={() => setPx((c) => ({ ...c, rate: n }))}>{n ? `${n} a second` : 'Smooth'}</Chip>)}
                            </div>
                          </Field>
                          <Slider label="Dither" value={px.dither} min={0} max={1} step={0.05} onChange={(v) => setPx((c) => ({ ...c, dither: v }))} format={(v) => `${Math.round(v * 100)}%`} hint={pal.colors.length ? 'Checkers two palette colors to fake the ones between.' : 'Needs a palette: Full color has none to mix.'} />
                          <div className="grid gap-3">
                            <Toggle label="Outline the scene" checked={px.outline} onChange={(v) => setPx((c) => ({ ...c, outline: v }))} />
                            <Toggle label="Lines where colors meet" checked={px.edges} onChange={(v) => setPx((c) => ({ ...c, edges: v }))} />
                            <Toggle label="Lines between parts" checked={px.parts} onChange={(v) => setPx((c) => ({ ...c, parts: v }))} />
                            <Toggle label="Sky behind" checked={px.sky || skyForced} disabled={skyForced} onChange={(v) => setPx((c) => ({ ...c, sky: v }))} />
                            {skyForced && <p className="text-xs text-ink-faint">The sky set in Light mode is always behind.</p>}
                          </div>
                        </>
                      )
                    })()}
                  </div>
                )}
                {m.id === 'export' && (
                  <div className="stack-controls space-y-5" data-testid="creator-export">
                    <p className="text-sm text-ink-muted">Saves the scene in the style it is drawn in now. A loop is drawn one frame at a time from start to end, so it joins up when it repeats and no frame is dropped, however slow the device.</p>
                    {exporting.choices(!!full)}
                    <div className="grid gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button small disabled={!done || exporting.busy} onClick={exporting.record} data-testid="creator-record">{exporting.label()}</Button>
                        <Button small disabled={!done || exporting.busy} onClick={exporting.save} data-testid="creator-save-frame">{exporting.saving ? 'Saving…' : 'Save this frame'}</Button>
                      </div>
                      <p role="status" className="text-xs text-ink-faint empty:hidden" data-testid="creator-export-note">{exporting.note}</p>
                      <p className="text-xs text-ink-faint">The loop is {exporting.loopFrames} frames of the view as it is when you press the button. Turning or zooming while it runs changes nothing.</p>
                    </div>
                    <div>
                      <h3 className="mb-1 text-sm font-semibold">For the engine</h3>
                      <p className="mb-2 text-xs text-ink-faint">The scene as one rigged splat .glb with its loop, which <a href="/engine/" className="text-accent-ink underline underline-offset-2">the Blobscape engine</a> and its web tag play. It holds the blobs and their moves: lights, the sky and the style stay here.</p>
                      <Button small disabled={!done || exporting.busy} onClick={saveForEngine} data-testid="creator-save-engine">Save for the engine (.glb)</Button>
                    </div>
                    <div>
                      <h3 id="creator-path" className="mb-1 text-sm font-semibold">Camera path</h3>
                      <p className="mb-2 text-xs text-ink-faint">Save views as stops; the camera flies smoothly from one to the next while the scene plays.</p>
                      {stops.length > 0 && (
                        <ol aria-labelledby="creator-path" className="mb-2 flex flex-wrap gap-1.5" data-testid="creator-stops">
                          {stops.map((st, i) => (
                            <li key={i} className="flex items-center overflow-hidden rounded-full border border-rule text-sm">
                              <button type="button" onClick={() => { setFlying(false); setOrbit(st) }} className="min-h-9 cursor-pointer px-3 hover:bg-paper-sunk" aria-label={`Go to stop ${i + 1}`}>{i + 1}</button>
                              <button type="button" onClick={() => setStops((all) => all.filter((_, k) => k !== i))} className="min-h-9 cursor-pointer border-l border-rule px-2 text-ink-muted hover:bg-paper-sunk hover:text-ink" aria-label={`Remove stop ${i + 1}`}>×</button>
                            </li>
                          ))}
                        </ol>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button small disabled={stops.length >= MAX_STOPS || exporting.busy} onClick={() => { setStops((all) => [...all, { ...orbit, target: [...orbit.target] }]); say(`Stop ${stops.length + 1} saved.`) }} data-testid="creator-add-stop">Add this view</Button>
                        <Button small disabled={stops.length < 2 || exporting.busy} onClick={() => setFlying((f) => !f)}>{flying ? 'Stop' : 'Play the path'}</Button>
                        <Button small disabled={stops.length < 2 || !done || exporting.busy} onClick={() => { setFlying(false); void exporting.recordPath((u) => pathAt(stops, u), pathLength) }} data-testid="creator-record-path">{exporting.label('Export the path')}</Button>
                      </div>
                      {stops.length >= 2 && <div className="mt-3"><Slider label="Between stops" value={leg} min={1} max={8} step={0.5} onChange={setLeg} format={(v) => `${v} s`} hint={`The whole path takes ${pathLength} seconds.`} /></div>}
                    </div>
                  </div>
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

        <section aria-label="Scene" className="relative order-1 min-h-0 flex-1 overflow-hidden bg-paper-sunk lg:order-3 lg:rounded-2xl lg:border lg:border-rule" style={drawing.ground ? { background: drawing.ground } : undefined}>
          <canvas
            ref={canvas}
            role="application"
            aria-roledescription="3D view"
            aria-label={`${shown.name}: ${shown.items.length === 1 ? 'one piece' : `a land and ${props} props`}, drawn ${styleWords(style)}. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.${project ? ' Tap a prop to pick it; with one picked, the arrow keys move it, brackets turn it, Delete removes it and Escape lets it go.' : ''}`}
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
                if (g.kind === 'lamp') {
                  // along the ground, keeping its height over it (kept in turn0)
                  const l = lamps[g.i]
                  const hit = l && groundFrom(p.x, p.y, l.at[1] - g.turn0)
                  if (hit) draftLight({ lamps: lampsNow(g.i, { at: [hit[0], groundAt(hit[0], hit[2], l.at[1] - g.turn0) + g.turn0, hit[2]] }) })
                  return
                }
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
              if (g?.moved) { if (g.kind === 'lamp') commitLight('Lamp moved.'); else commit(); return }
              if (g?.kind === 'lamp') return
              // a tap picks the prop under it, or lets the picked one go
              if (was && Math.hypot(p.x - was.x, p.y - was.y) < TAP && project) {
                const hit = hitProp(p.x, p.y)
                if (hit !== picked) pick(hit)
              }
            }}
            onDragOver={(ev) => { if (project && ev.dataTransfer.types.includes(DRAG_TYPE)) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy' } }}
            onDrop={(ev) => {
              const id = ev.dataTransfer.getData(DRAG_TYPE)
              const e = CARD_BY_ID.get(id)
              if (!e) return
              ev.preventDefault()
              const p = local(ev)
              addEntry(e, p.x, p.y)
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
          {mode === 'light' && stage && lamps.length > 0 && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full touch-none" aria-hidden data-testid="creator-lamps">
              {lamps.map((l, i) => {
                const s = stage.screenAt(l.at, orbit)
                if (!s) return null
                // the dot as drawn, inside a wider clear ring that takes a finger; touch-action none on the ring, or a
                // phone takes the press for a scroll and cancels the drag (Matt couldn't move a lamp with his finger)
                return <g key={i} data-testid={`creator-lamp-${i}`} className="pointer-events-auto cursor-grab" style={{ touchAction: 'none' }}
                  onPointerDown={(ev) => {
                    ev.stopPropagation()
                    ev.preventDefault()
                    canvas.current!.setPointerCapture(ev.pointerId)
                    setLampPicked(i)
                    grab.current = { kind: 'lamp', i, from: local(ev), offset: [0, 0], turn0: lampLift(i), angle0: 0, moved: false }
                  }}>
                  <circle cx={s.x} cy={s.y} r={coarse ? 24 : 14} fill="transparent" />
                  <circle cx={s.x} cy={s.y} r={i === lampPicked ? 11 : 9} fill={l.color} stroke={i === lampPicked ? 'var(--c-blob)' : '#fff'} strokeWidth="2.5" />
                </g>
              })}
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
