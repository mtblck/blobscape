import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import type { Creature as Body } from '../splat-engine/body.ts'
import { GlbError, readRiggedGlb, recordClip, writeRiggedGlb, writeRiggedMeshGlb, type Clip, type Rigged } from '../splat-engine/glb.ts'
import { MeshFileError } from '../splat-engine/meshFile.ts'
import { isMeshGlb, rigFromModel } from './modelRig.ts'
import { blobsToMesh } from '../splat-engine/mesh.ts'
import type { Morph } from '../splat-engine/morph.ts'
import type { Species } from '../splat-engine/zoo/index.ts'
import { CREATURES } from './creature/fromScenes.ts'
import { MAX_SEED, monsterSpecies, newSeed } from '../splat-engine/zoo/monster.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field, Slider, Toggle } from '../shared/ui.tsx'
import { Swing } from '../splat-engine/swing.ts'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import { download, kb } from './files.ts'
import { LESSONS, href } from './routes.ts'
import type { CreatureStage, PickedBone, Show } from './creature/stage.ts'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { Sprites } from './creature/Sprites.tsx'
import { stageBreath, stagePlain } from './creature/breathStage.ts'
import { countAsked, detailInAddress, writeDetail } from '../shared/detail.ts'

const STILL = 'still'
const MAX_FILE = 200 * 1024 * 1024
/** Blobs laid on an opened rigged model. */
const MODEL_BLOBS = 60_000
const RIG_LESSONS = LESSONS.filter((l) => ['one-bone', 'weights', 'twist', 'walk', 'feet', 'model', 'morphs', 'fur'].includes(l.id))
const SHOW: { id: Show; label: string }[] = [{ id: 'blobs', label: 'Blobs' }, { id: 'bones', label: 'Bones' }, { id: 'both', label: 'Both' }]
const DEFAULT = 'fox'

/** A file's body may carry morphs, which its clips key and the stage applies. */
interface Shown { name: string; body: Body & { morphs?: Morph[] }; clips: Clip[]; species?: Species; look?: string }

/** A creature and its moves, each recorded into a clip once, when it's made. */
function build(sp: Species, count: number, look: string): Shown {
  const body = sp.make(count, look)
  const clips = sp.moves.map((m) => recordClip(m.name, body.skeleton, m.pose, m.seconds, m.fps ?? 24))
  body.skeleton.reset()
  body.skeleton.update()
  return { name: `blob ${sp.name}`, body, clips, species: sp, look }
}

/** The creature a link asks for: one of the zoo, or a made-up monster (?creature=monster&seed=123). */
function speciesOf(params: URLSearchParams): Species {
  const id = params.get('creature')
  if (id === 'monster') {
    const seed = Number(params.get('seed'))
    return monsterSpecies(Number.isInteger(seed) && seed >= 1 && seed <= MAX_SEED ? seed : newSeed())
  }
  return CREATURES.find((s) => s.id === id) ?? CREATURES.find((s) => s.id === DEFAULT)!
}
/** What the address turns off of the dragon's breath, for trying it on a slow device. */
const plain = (() => {
  const q = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search)
  return { breath: q.get('breath') !== 'plain', shadows: q.get('shadows') !== '0', glow: q.get('glow') !== '0' }
})()
const kilo = (n: number) => (n >= 1000 ? `${n / 1000}k` : String(n))

declare global {
  interface Window { __creature?: { stage: CreatureStage; blobs: () => number; bones: () => number; glb: () => Uint8Array; mesh: (cells: number) => Uint8Array } }
}

/** The creature's detail level nearest the count asked for (by ratio), or its own starting level when none was. */
export function levelFor(sp: Pick<Species, 'detail' | 'start'>, asked?: number): number {
  if (!asked) return sp.start
  return sp.detail.reduce((best, n) => (Math.abs(Math.log(n / asked)) < Math.abs(Math.log(best / asked)) ? n : best))
}

/**
 * Creature: procedural blob creatures (three from the pixel scenes, then a frog, a fox, an elf and a dragon),
 * rigged, moving on Blobscape's own splat engine, with their bones on show if
 * you like. Each leaves as a 3D model, as rigged splats in a .glb and as a
 * solid mesh with the same bones and clips.
 */
export function Creature() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<CreatureStage>()
  // The engine's code, the graphics device and the first frame's shaders take a moment: show that it's coming
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState<string>()
  const offscreen = useMemo(() => new URLSearchParams(location.search).get('offscreen') === '1', [])
  const webgl = useMemo(() => new URLSearchParams(location.search).get('webgl') === '1', [])
  // which creature is in the address (?creature=dragon), so a link can show one
  const [species, setSpecies] = useState<Species>(() => speciesOf(new URLSearchParams(location.search)))
  const [count, setCount] = useState(() => levelFor(species, countAsked(detailInAddress())))
  const [look, setLook] = useState(species.looks[0].id)
  const [move, setMove] = useState<string>(species.moves[0].name)
  const [show, setShow] = useState<Show>('blobs')
  const [speed, setSpeed] = useState(1)
  /** Tails, ears and cloaks swing after the body as it moves (the files and sheets keep the move as it is). */
  const [loose, setLoose] = useState(true)
  const [orbit, setOrbit] = useState<Orbit>(species.view)
  const [loaded, setLoaded] = useState<Shown>()
  const [fileNote, setFileNote] = useState<string>()
  const [busy, setBusy] = useState<string>()
  const [cells, setCells] = useState(64)
  /** An opened file's morph weights while it stands still. */
  const [morphW, setMorphW] = useState<number[]>([])
  /** The bone lit up by a tap (or the [ and ] keys), and what it moves. */
  const [picked, setPicked] = useState<PickedBone>()

  // the address says what's shown: a monster's seed (one made up for a bad or missing seed too), nothing extra for the zoo
  useEffect(() => {
    const url = new URL(location.href)
    const want = species.seed ? String(species.seed) : null
    if (url.searchParams.get('seed') === want) return
    if (want) url.searchParams.set('seed', want)
    else url.searchParams.delete('seed')
    history.replaceState(history.state, '', url)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** The Monster chip brings back the last one made, not a new one. */
  const lastMonster = useRef<Species | undefined>(species.seed ? species : undefined)
  /** The blob count the visitor chose, kept from creature to creature (each takes its level nearest to it). */
  const asked = useRef<number | undefined>(countAsked(detailInAddress()))
  const pick = (sp: Species) => {
    if (sp.seed) lastMonster.current = sp
    setLoaded(undefined)
    setFileNote(undefined)
    setMove(sp.moves[0].name)
    if (sp === species) return
    setSpecies(sp)
    setCount(levelFor(sp, asked.current))
    setLook(sp.looks[0].id)
    const url = new URL(location.href)
    if (sp.id === DEFAULT) url.searchParams.delete('creature')
    else url.searchParams.set('creature', sp.id)
    if (sp.seed) url.searchParams.set('seed', String(sp.seed))
    else url.searchParams.delete('seed')
    history.replaceState(history.state, '', url)
  }

  // A detailed creature takes a second or more to cut, and cutting holds the main thread. So the page opens on the
  // lightest cut (quick, and enough for the options to describe the creature), and the one asked for is cut after the
  // waiting mark has been painted and handed to the compositor: two frames, then a beat (as Pixel Diorama does).
  const [made, setMade] = useState<Shown>(() => build(species, species.detail[0], look))
  const madeFor = useRef({ species, count: species.detail[0], look })
  const [building, setBuilding] = useState(count !== species.detail[0])
  useEffect(() => {
    const was = madeFor.current
    if (was.species === species && was.count === count && was.look === look) { setBuilding(false); return }
    setBuilding(true)
    let t: ReturnType<typeof setTimeout> | undefined
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        t = setTimeout(() => {
          madeFor.current = { species, count, look }
          setMade(build(species, count, look))
          setBuilding(false)
          // a new monster is announced as what it is, since nobody can see what came out
          if (species.seed && was.species !== species) setFileNote(`Made ${species.blurb.replace(/^A /, 'a ').split(', made up')[0]}.`)
        }, 60)
      })
    })
    return () => { cancelAnimationFrame(raf); clearTimeout(t) }
  }, [species, count, look])
  const shown = loaded ?? made
  // the camera and floor follow the creature once it's built, so a frog never sits on the dragon's floor
  const framed = useRef(made.species)
  useEffect(() => {
    if (framed.current === made.species || !made.species) return
    framed.current = made.species
    setOrbit(made.species.view)
    // and at once, so the new creature's first frame isn't drawn from the last one's view
    if (stage) stage.orbit = made.species.view
  }, [made]) // eslint-disable-line react-hooks/exhaustive-deps
  const scaleOf = shown.species ?? made.species ?? species
  const clip = move === STILL ? undefined : shown.clips.find((c) => c.name === move) ?? shown.clips[0]
  /** The move a clip plays, named for the look on show where that changes it (the ice dragon breathes frost). */
  const moveOf = (c: Clip) => {
    const m = shown.species?.moves.find((v) => v.name === c.name)
    const by = m?.byLook?.[shown.look ?? '']
    return m && by ? { ...m, ...by } : m
  }

  useEffect(() => {
    let live: CreatureStage | undefined, gone = false
    import('./creature/stage.ts')
      .then(({ CreatureStage }) => CreatureStage.start(canvas.current!, { offscreen, webgl }))
      .then((s) => {
        if (gone) { s.dispose(); return }
        live = s
        s.onFirstFrame = () => setDrawn(true)
        setStage(s)
      }, (e: unknown) => { console.warn(e); setFailed('This browser could not start WebGPU or WebGL 2, which the creature needs.') })
    return () => { gone = true; live?.dispose() }
  }, [offscreen, webgl])

  // the placeholder cut is never shown: the view waits for the creature asked for
  const first = useRef(true)
  const inView = useRef<Body | undefined>(undefined)
  const [seen, setSeen] = useState<Body>()
  // The dragon's breath acts on what is round it (creature/breathStage.ts): it gets a floor that burns, live lights
  // that ride the flame, sparks and smoke, and on WebGPU a lens so only the flame glows. `?breath=plain` leaves all
  // of that off, `?shadows=0` the shadows and `?glow=0` the lens.
  const breathing = !loaded && shown.species?.id === 'dragon' && plain.breath
  const moveNow = useRef(move)
  moveNow.current = move
  useEffect(() => {
    if (!stage || (first.current && building && !loaded) || inView.current === shown.body) return
    first.current = false
    inView.current = shown.body
    if (breathing) stageBreath(stage, shown.body, clip, shown.look ?? '', () => moveNow.current === 'fire', plain)
    else { stagePlain(stage); stage.setActor(shown.body, clip) }
    setPicked(undefined)
    // the waiting mark stays until this creature is really on screen: handing a detailed one to the stage holds the
    // page for seconds more on a phone, and the view sat frozen with no mark over it (Matt, 2026-11-18)
    const body = shown.body
    let late: ReturnType<typeof setTimeout> | undefined
    const seenIt = () => { clearTimeout(late); setSeen(body) }
    late = setTimeout(seenIt, 8000)
    void stage.shown().then(seenIt)
  }, [stage, shown, building]) // eslint-disable-line react-hooks/exhaustive-deps
  const waiting = !drawn || (building && !loaded) || seen !== shown.body
  useEffect(() => { stage?.setClip(clip) }, [stage, clip])
  // the loose parts swing on the creature in view, never one still being cut
  const swingSpec = loaded ? undefined : shown.species?.swing
  useEffect(() => {
    if (!stage || inView.current !== shown.body) return
    stage.setSwing(loose && swingSpec ? new Swing(shown.body.skeleton, swingSpec) : undefined)
  }, [stage, shown, building, loose, swingSpec])
  useEffect(() => { stage?.setMorphWeights(morphW) }, [stage, morphW, shown])
  useEffect(() => { stage?.highlight(picked?.bone) }, [stage, picked])
  /** Lights up the bone under a tap, or puts it out when the tap is on the same bone or off the creature. */
  const tapAt = (ev: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!stage) return
    const r = ev.currentTarget.getBoundingClientRect()
    const hit = stage.pick(ev.clientX - r.left, ev.clientY - r.top)
    setPicked((was) => (!hit || was?.bone === hit.bone ? undefined : hit))
  }
  /** Steps to the next or previous bone, from the keyboard or the buttons beside the name. */
  const stepBone = (by: number) => {
    if (!stage) return
    const n = shown.body.skeleton.count
    setPicked((was) => stage.boneInfo(was ? (was.bone + by + n) % n : by > 0 ? 0 : n - 1))
  }
  /** Where a press went down, to tell a tap from the start of a drag. */
  const pressed = useRef<{ id: number; x: number; y: number; many: boolean } | null>(null)
  useEffect(() => { if (stage) stage.speed = speed }, [stage, speed])
  useEffect(() => { stage?.setShow(show) }, [stage, show])
  // the dragon stands on its own floor of blobs, which its breath can burn
  useEffect(() => { stage?.setFloor(breathing ? 0 : Math.max(8, 2 * Math.round(scaleOf.view.distance))) }, [stage, scaleOf, breathing])
  useEffect(() => { if (stage) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit])

  const splatGlb = () => writeRiggedGlb({ name: shown.name, ...shown.body, clips: shown.clips })
  const meshGlb = (c: number) => writeRiggedMeshGlb({ name: shown.name, mesh: blobsToMesh(shown.body.blobs, shown.body.skin, { cells: c, level: 1 }), skeleton: shown.body.skeleton, clips: shown.clips })

  // For verify: the page's stage and its files, without clicking through downloads
  useEffect(() => {
    if (!stage) return
    window.__creature = { stage, blobs: () => stage.blobCount, bones: () => shown.body.skeleton.count, glb: splatGlb, mesh: meshGlb }
    return () => { delete window.__creature }
  })

  const save = async (what: 'splats' | 'mesh') => {
    setBusy(what === 'mesh' ? 'Wrapping a mesh round the blobs…' : 'Writing the file…')
    // let the note paint before the work blocks the page
    await new Promise((r) => setTimeout(r, 30))
    try {
      const bytes = what === 'mesh' ? meshGlb(cells) : splatGlb()
      download(bytes, `${shown.name.replace(/\W+/g, '-')}-${what}.glb`)
      setBusy(`Saved ${kb(bytes.byteLength)}.`)
    } catch (e) {
      setBusy(`Couldn't make the file: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const open = async (file: File | undefined) => {
    if (!file) return
    // the last save's line gives way to what this file does
    setBusy(undefined)
    if (file.size > MAX_FILE) { setFileNote(`That file is ${kb(file.size)}; files up to ${kb(MAX_FILE)} open here.`); return }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      // a rigged splat file, or an ordinary rigged model laid with blobs on its own bones
      let r: Rigged
      try { r = readRiggedGlb(bytes) } catch (e) { if (!isMeshGlb(e)) throw e; r = await rigFromModel(bytes, file.name, MODEL_BLOBS) }
      if (r.skeleton.count > 255) throw new GlbError('More than 255 bones')
      setLoaded({ name: r.name || file.name.replace(/\.glb$/i, ''), body: r, clips: r.clips })
      setMove(r.clips[0]?.name ?? STILL)
      setMorphW((r.morphs ?? []).map(() => 0))
      const morphs = r.morphs?.length ? `, ${r.morphs.length} morph${r.morphs.length === 1 ? '' : 's'}` : ''
      setFileNote(`Opened ${file.name}: ${r.blobs.count.toLocaleString()} blobs, ${r.skeleton.count} bones, ${r.clips.length} clip${r.clips.length === 1 ? '' : 's'}${morphs}.`)
    } catch (e) {
      setFileNote(e instanceof GlbError || e instanceof MeshFileError ? `${file.name} didn't open: ${e.message}.` : `${file.name} didn't open: it isn't a rigged splat .glb or a rigged model this page can read.`)
    }
  }

  // --- orbiting: drag, arrow keys, wheel and pinch
  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  useWheelZoom(canvas, setOrbit)

  const moveLabel = !clip ? 'standing still' : moveOf(clip)?.doing ?? `playing ${clip.name}`
  const clipLabel = (c: Clip) => moveOf(c)?.label ?? c.name
  const clipNames = shown.clips.map((c) => clipLabel(c).toLowerCase())
  const showing = show === 'bones' ? ', showing only its bones' : show === 'both' ? ', with its bones drawn over the blobs' : ''

  return (
    <div className="pb-4">
      <Crumbs here="Splat Creatures" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      {/* the same header as every experiment: name on the left, what it is on the right */}
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Splat Creatures</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          Creatures made of blobs, from a jellyfish to a fire-breathing dragon. Watch one move, take its blobs away to see the bones
          underneath, then take it home as a 3D model that Blender and game engines open, or as pixel-art sprites for a 2D game.
        </p>
      </header>
      <Workbench
        viewLabel="Splat Creatures"
        view={<>
              <canvas
                ref={canvas}
                role="application"
                aria-roledescription="3D view"
                aria-label={`${shown.name}, ${shown.body.blobs.count.toLocaleString()} blobs, ${moveLabel}${showing}. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom. Tap the creature, or press the square bracket keys, to light up a bone and the blobs it moves.`}
                tabIndex={0}
                data-testid="creature-view"
                className="absolute inset-0 h-full w-full cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset active:cursor-grabbing"
                onPointerDown={(ev) => {
                  ev.currentTarget.setPointerCapture(ev.pointerId)
                  pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
                  pressed.current = pointers.current.size === 1 ? { id: ev.pointerId, x: ev.clientX, y: ev.clientY, many: false } : pressed.current && { ...pressed.current, many: true }
                  drag.current = beginOrbitDrag(pointers.current, ev, orbit)
                }}
                onPointerMove={(ev) => {
                  if (pointers.current.has(ev.pointerId)) pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
                  const d = drag.current
                  if (d) setOrbit(dragOrbit(d, pointers.current, ev))
                }}
                onPointerUp={(ev) => {
                  const p = pressed.current
                  if (p && p.id === ev.pointerId && !p.many && Math.hypot(ev.clientX - p.x, ev.clientY - p.y) < 6) tapAt(ev)
                  if (p?.id === ev.pointerId) pressed.current = null
                  pointers.current.delete(ev.pointerId)
                  drag.current = null
                }}
                onPointerCancel={(ev) => { pointers.current.delete(ev.pointerId); drag.current = null }}
                onKeyDown={(ev) => {
                  if (ev.key === '[' || ev.key === ']') { ev.preventDefault(); stepBone(ev.key === ']' ? 1 : -1); return }
                  if (ev.key === 'Escape' && picked) { ev.preventDefault(); setPicked(undefined); return }
                  if (!orbitKey(ev, orbit)) return
                  ev.preventDefault()
                  setOrbit((o) => orbitKey(ev, o) ?? o)
                }}
              />
              {!failed && waiting && <LoadingMark testid="creature-loading" />}
              <p role="status" className="sr-only">{failed ? '' : !stage ? 'Starting the splat engine…' : waiting ? `Making the ${species.name}…` : ''}</p>
              {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
              <div role="group" aria-label="Show in the view" data-testid="show" className="absolute top-3 left-3 flex gap-1.5 max-sm:top-2 max-sm:left-2">
                {SHOW.map((v) => <Chip small key={v.id} active={show === v.id} onClick={() => setShow(v.id)}>{v.label}</Chip>)}
              </div>
              <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(scaleOf.view)} />
              {picked ? (
                <div role="group" aria-label="Bone lit up" data-testid="picked-bone" className="absolute bottom-2 left-12 flex max-w-[calc(100%-7rem)] items-center gap-1 rounded-full border border-rule bg-paper/90 py-0.5 pr-0.5 pl-1 text-xs text-ink shadow-sm backdrop-blur">
                  <button type="button" aria-label="Previous bone" onClick={() => stepBone(-1)} className="grid size-7 cursor-pointer place-items-center rounded-full text-ink-muted hover:bg-rule/60 hover:text-ink">‹</button>
                  <span className="truncate px-1"><b className="font-semibold">{picked.label[0].toUpperCase() + picked.label.slice(1)}</b> moves <span className="tabular-nums">{picked.blobs.toLocaleString()}</span> blobs</span>
                  <button type="button" aria-label="Next bone" onClick={() => stepBone(1)} className="grid size-7 cursor-pointer place-items-center rounded-full text-ink-muted hover:bg-rule/60 hover:text-ink">›</button>
                  <button type="button" aria-label="Put the bone out" onClick={() => setPicked(undefined)} className="grid size-7 cursor-pointer place-items-center rounded-full text-ink-muted hover:bg-rule/60 hover:text-ink">×</button>
                </div>
              ) : (
                <p aria-hidden className="pointer-events-none absolute right-14 bottom-2 left-3 text-right text-xs text-ink-faint">{typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches ? 'tap a bone · drag to orbit · pinch to zoom' : 'click a bone · drag to orbit · scroll to zoom'}</p>
              )}
              <p aria-live="polite" className="sr-only">{picked ? `${picked.label}: moves ${picked.blobs.toLocaleString()} blobs.` : ''}</p>
        </>}
        status={<><div>
              <span className="tabular-nums text-ink" data-testid="blob-count">{shown.body.blobs.count.toLocaleString()}</span> blobs on{' '}
              <span className="tabular-nums text-ink">{shown.body.skeleton.count}</span> bones{clipNames.length ? <>, with {clipNames.length === 1 ? 'one clip' : `${clipNames.length} clips`}: {clipNames.join(' and ')}</> : ''}.
              {loaded && <> From your file. <button type="button" className="underline hover:text-accent" onClick={() => { setLoaded(undefined); setMove(species.moves[0].name); setFileNote(undefined) }}>Back to the {species.name}</button></>}
        </div>
              <span aria-live="polite" data-testid="creature-note">{busy ?? fileNote ?? ''}</span></>}
        tabsLabel="Options"
        tabs={[
          {
            id: 'type', label: 'Creature Type', content: (
              <div className={TAB_SECTIONS} data-testid="creature-pick">
            <Field label="Type">
              <div role="group" aria-label="Which creature" className="flex flex-wrap gap-1.5" data-testid="species">
                {CREATURES.map((sp) => <Chip key={sp.id} active={!loaded && species === sp} onClick={() => pick(sp)}>{sp.name[0].toUpperCase() + sp.name.slice(1)}</Chip>)}
                <Chip active={!loaded && !!species.seed} onClick={() => pick(lastMonster.current ?? monsterSpecies(newSeed()))}>Monster</Chip>
              </div>
            </Field>
            <Field label="Look">
              {species.seed ? (
                <div><Button small data-testid="make-monster" onClick={() => pick(monsterSpecies(newSeed()))}>Generate a new monster</Button></div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {species.looks.map((l) => <Chip key={l.id} active={!loaded && look === l.id} onClick={() => { setLoaded(undefined); setLook(l.id) }}>{l.label}</Chip>)}
                </div>
              )}
            </Field>
            <p className="text-xs leading-relaxed text-ink-faint">{species.blurb}</p>
              </div>
            ),
          },
          {
            id: 'move', label: 'Movement & Details', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Clip">
                  <div className="flex flex-wrap gap-1.5">
                    {shown.clips.map((c, k) => <Chip key={`${k}-${c.name}`} active={clip === c} onClick={() => setMove(c.name)}>{clipLabel(c)}</Chip>)}
                    <Chip active={!clip} onClick={() => setMove(STILL)}>Still</Chip>
                  </div>
                </Field>
                <Slider label="Speed" value={speed} min={0.1} max={2} step={0.05} onChange={setSpeed} format={(v) => `×${v.toFixed(2)}`} />
                {swingSpec && <Toggle label={`Swing the ${swingSpec.parts} as it moves`} checked={loose} onChange={setLoose} />}
                {!!shown.body.morphs?.length && (
                  <div className="flex flex-col gap-3" data-testid="morph-sliders">
                    <p className="text-xs leading-relaxed text-ink-faint">
                      {clip ? 'This file has morphs, which its clip sets as it plays. Pick Still to set them by hand.' : 'This file\'s morphs: each slider reshapes the blobs.'}
                    </p>
                    {!clip && shown.body.morphs.map((m, k) => (
                      <Slider key={`${k}-${m.name}`} label={m.name[0].toUpperCase() + m.name.slice(1)} value={morphW[k] ?? 0} min={0} max={1} step={0.05}
                        onChange={(v) => setMorphW((w) => w.map((x, j) => (j === k ? v : x)))} format={(v) => `${Math.round(v * 100)}%`} />
                    ))}
                  </div>
                )}
                <Field label="Blobs">
                  <div className="flex flex-wrap gap-1.5">
                    {species.detail.map((n) => <Chip key={n} active={!loaded && count === n} onClick={() => { asked.current = n; setLoaded(undefined); setCount(n); writeDetail(kilo(n)) }}>{kilo(n)}</Chip>)}
                  </div>
                </Field>
              </div>
            ),
          },
          {
            id: 'files', label: 'Export & Import', content: (
              <div className={TAB_SECTIONS}>
                <p className="text-xs leading-relaxed text-ink-faint">A .glb file with the creature, its bones and its clips.</p>
                <Field label="Download">
                  <div className="flex flex-wrap gap-1.5">
                    <Button small onClick={() => save('splats')}>As splats</Button>
                    <Button small onClick={() => save('mesh')}>As a mesh</Button>
                  </div>
                </Field>
                <Field label={`Mesh grid: cells along the ${loaded ? 'creature' : species.name}`}>
                  <div className="flex flex-wrap gap-1.5">
                    {[48, 64, 96].map((c) => <Chip key={c} active={cells === c} onClick={() => setCells(c)}>{c}</Chip>)}
                  </div>
                </Field>
                <label className="grid gap-1.5 text-sm">
                  <span className="text-ink-muted">Open a rigged .glb: splats, or a model with bones</span>
                  <input type="file" accept=".glb,model/gltf-binary" onChange={(e) => { void open(e.target.files?.[0]); e.target.value = '' }} className="block w-full text-xs text-ink-faint file:mr-2 file:cursor-pointer file:rounded file:border file:border-rule file:bg-paper file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:border-ink-faint" />
                </label>
              </div>
            ),
          },
        ]}
      />
      <div className="mt-4">
        <Sprites stage={stage} name={shown.name} clips={shown.clips} labelOf={clipLabel} current={clip} />
      </div>

      <section aria-labelledby="files-title" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-sm text-ink-faint">What you take away</p>
          <h2 id="files-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">One creature, three ways out</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            <b className="font-semibold text-ink">As splats</b>, the .glb holds every blob with the KHR_gaussian_splatting
            standard, its bones and every clip as ordinary glTF, and a note (our BLOBSCAPE_gaussian_skinning extension) on how a
            skinned blob turns. The frog's tongue and the dragon's fire are bones that grow, which glTF keys as scale. A file with
            morphs (blend shapes) keeps them as glTF morph targets, with a second note on how each blob stretches: open the{' '}
            <a href="/rigged-splats/puffer.glb" download className="underline decoration-rule underline-offset-2 hover:text-accent">sample pufferfish</a> here to see one.
            three.js and other splat viewers open it as a still creature; this page plays it.
          </p>
          <p>
            <b className="font-semibold text-ink">As a mesh</b>, it's a solid skin wrapped round the blobs, colored from
            them, with the same bones and clips. It loses the soft edges (and thin things like wings can come out holey) but moves in Blender, Godot, Unity or three.js.
          </p>
          <p>
            <b className="font-semibold text-ink">As pixel art</b>, it's a sprite sheet: each move you pick, drawn from 4 or 8 sides,
            squeezed down to a few colors and outlined, the way <a href="/experiments/splat-to-sprite/" className="underline decoration-rule underline-offset-2 hover:text-accent">Splat to Sprite</a> does it. The JSON beside it names every animation, in
            Tinkerkit's format or the one Aseprite and Phaser read.
          </p>
          <p>
            On this page the creatures move on Blobscape's own splat engine, running here
            on {stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'}: every blob is moved by its bones on the graphics card.
          </p>
          <p>
            How it all works is in the lessons:{' '}
            {RIG_LESSONS.map((l, k) => (
              <span key={l.id}>{k > 0 && (k === RIG_LESSONS.length - 1 ? ' and ' : ', ')}<a href={href({ page: 'lesson', id: l.id })} className="underline decoration-rule underline-offset-2 hover:text-accent">{l.title.toLowerCase()}</a></span>
            ))}.
          </p>
        </div>
      </section>
    </div>
  )
}
