import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import type { Creature as Body } from '../splat-engine/body.ts'
import { GlbError, readRiggedGlb, recordClip, writeRiggedGlb, writeRiggedMeshGlb, type Clip } from '../splat-engine/glb.ts'
import { blobsToMesh } from '../splat-engine/mesh.ts'
import type { SkinMode } from '../splat-engine/rig.ts'
import { ZOO, type Species } from '../splat-engine/zoo/index.ts'
import { MAX_SEED, monsterSpecies, newSeed } from '../splat-engine/zoo/monster.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field, Slider } from '../shared/ui.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import { download, kb } from './files.ts'
import { LESSONS, href } from './routes.ts'
import type { CreatureStage, Show } from './creature/stage.ts'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { Sprites } from './creature/Sprites.tsx'

const STILL = 'still'
const MAX_FILE = 200 * 1024 * 1024
const RIG_LESSONS = LESSONS.filter((l) => ['one-bone', 'weights', 'twist', 'walk', 'model'].includes(l.id))
const SHOW: { id: Show; label: string }[] = [{ id: 'blobs', label: 'Blobs' }, { id: 'bones', label: 'Bones' }, { id: 'both', label: 'Both' }]
const DEFAULT = 'fox'

interface Shown { name: string; body: Body; clips: Clip[]; species?: Species }

/** A creature and its moves, each recorded into a clip once, when it's made. */
function build(sp: Species, count: number, look: string): Shown {
  const body = sp.make(count, look)
  const clips = sp.moves.map((m) => recordClip(m.name, body.skeleton, m.pose, m.seconds, m.fps ?? 24))
  body.skeleton.reset()
  body.skeleton.update()
  return { name: `blob ${sp.name}`, body, clips, species: sp }
}

/** The creature a link asks for: one of the zoo, or a made-up monster (?creature=monster&seed=123). */
function speciesOf(params: URLSearchParams): Species {
  const id = params.get('creature')
  if (id === 'monster') {
    const seed = Number(params.get('seed'))
    return monsterSpecies(Number.isInteger(seed) && seed >= 1 && seed <= MAX_SEED ? seed : newSeed())
  }
  return ZOO.find((s) => s.id === id) ?? ZOO.find((s) => s.id === DEFAULT)!
}
const kilo = (n: number) => (n >= 1000 ? `${n / 1000}k` : String(n))

declare global {
  interface Window { __creature?: { stage: CreatureStage; blobs: () => number; bones: () => number; glb: () => Uint8Array; mesh: (cells: number) => Uint8Array } }
}

/**
 * Creature: procedural blob creatures (a frog, a fox, an elf and a dragon),
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
  // which creature is in the address (?creature=dragon), so a link can show one
  const [species, setSpecies] = useState<Species>(() => speciesOf(new URLSearchParams(location.search)))
  const [count, setCount] = useState(species.start)
  const [look, setLook] = useState(species.looks[0].id)
  const [move, setMove] = useState<string>(species.moves[0].name)
  const [show, setShow] = useState<Show>('blobs')
  const [speed, setSpeed] = useState(1)
  const [mode, setMode] = useState<SkinMode>('quat')
  const [orbit, setOrbit] = useState<Orbit>(species.view)
  const [loaded, setLoaded] = useState<Shown>()
  const [fileNote, setFileNote] = useState<string>()
  const [busy, setBusy] = useState<string>()
  const [cells, setCells] = useState(64)

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
  const pick = (sp: Species) => {
    if (sp.seed) lastMonster.current = sp
    setLoaded(undefined)
    setFileNote(undefined)
    setMove(sp.moves[0].name)
    if (sp === species) return
    setSpecies(sp)
    setCount(sp.start)
    setLook(sp.looks[0].id)
    const url = new URL(location.href)
    if (sp.id === DEFAULT) url.searchParams.delete('creature')
    else url.searchParams.set('creature', sp.id)
    if (sp.seed) url.searchParams.set('seed', String(sp.seed))
    else url.searchParams.delete('seed')
    history.replaceState(history.state, '', url)
  }

  // Built in an effect, not during a render; it's quick (a few hundred milliseconds at most, for the dragon), so no note
  const [made, setMade] = useState<Shown>(() => build(species, count, look))
  const madeFor = useRef({ species, count, look })
  useEffect(() => {
    const was = madeFor.current
    if (was.species === species && was.count === count && was.look === look) return
    madeFor.current = { species, count, look }
    setMade(build(species, count, look))
    // a new monster is announced as what it is, since nobody can see what came out
    if (species.seed && was.species !== species) setFileNote(`Made ${species.blurb.replace(/^A /, 'a ').split(', made up')[0]}.`)
  }, [species, count, look])
  const shown = loaded ?? made
  // the camera and floor follow the creature once it's built, so a frog never sits on the dragon's floor
  const framed = useRef(made.species)
  useEffect(() => {
    if (framed.current === made.species || !made.species) return
    framed.current = made.species
    setOrbit(made.species.view)
  }, [made])
  const scaleOf = shown.species ?? made.species ?? species
  const clip = move === STILL ? undefined : shown.clips.find((c) => c.name === move) ?? shown.clips[0]
  const moveOf = (c: Clip) => shown.species?.moves.find((m) => m.name === c.name)

  useEffect(() => {
    let live: CreatureStage | undefined, gone = false
    import('./creature/stage.ts')
      .then(({ CreatureStage }) => CreatureStage.start(canvas.current!, { offscreen }))
      .then((s) => {
        if (gone) { s.dispose(); return }
        live = s
        s.onFirstFrame = () => setDrawn(true)
        setStage(s)
      }, (e: unknown) => { console.warn(e); setFailed('This browser could not start WebGPU or WebGL 2, which the creature needs.') })
    return () => { gone = true; live?.dispose() }
  }, [offscreen])

  useEffect(() => { stage?.setActor(shown.body, clip) }, [stage, shown]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { stage?.setClip(clip) }, [stage, clip])
  useEffect(() => { if (stage) stage.speed = speed }, [stage, speed])
  useEffect(() => { stage?.setMode(mode) }, [stage, mode])
  useEffect(() => { stage?.setShow(show) }, [stage, show])
  useEffect(() => { stage?.setFloor(Math.max(8, 2 * Math.round(scaleOf.view.distance))) }, [stage, scaleOf])
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
    if (file.size > MAX_FILE) { setFileNote(`That file is ${kb(file.size)}; files up to ${kb(MAX_FILE)} open here.`); return }
    try {
      const r = readRiggedGlb(new Uint8Array(await file.arrayBuffer()))
      if (r.skeleton.count > 255) throw new GlbError('More than 255 bones')
      setLoaded({ name: r.name || file.name.replace(/\.glb$/i, ''), body: r, clips: r.clips })
      setMove(r.clips[0]?.name ?? STILL)
      setFileNote(`Opened ${file.name}: ${r.blobs.count.toLocaleString()} blobs, ${r.skeleton.count} bones, ${r.clips.length} clip${r.clips.length === 1 ? '' : 's'}.`)
    } catch (e) {
      setFileNote(e instanceof GlbError ? `${file.name} didn't open: ${e.message}.` : `${file.name} didn't open: it isn't a rigged splat .glb this page can read.`)
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
          Creatures made of blobs, from a frog to a fire-breathing dragon. Watch one move, take its blobs away to see the bones
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
                aria-label={`${shown.name}, ${shown.body.blobs.count.toLocaleString()} blobs, ${moveLabel}${showing}. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.`}
                tabIndex={0}
                data-testid="creature-view"
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
              {!failed && !drawn && <LoadingMark testid="creature-loading" />}
              <p role="status" className="sr-only">{!failed && !drawn ? (stage ? `Waking the ${species.name}…` : 'Starting the splat engine…') : ''}</p>
              {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
              <div role="group" aria-label="Show in the view" data-testid="show" className="absolute top-3 left-3 flex gap-1.5 max-sm:top-2 max-sm:left-2">
                {SHOW.map((v) => <Chip small key={v.id} active={show === v.id} onClick={() => setShow(v.id)}>{v.label}</Chip>)}
              </div>
              <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(scaleOf.view)} />
              <p aria-hidden className="pointer-events-none absolute right-14 bottom-2 left-3 text-right text-xs text-ink-faint">{typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches ? 'drag to orbit · pinch to zoom' : 'drag to orbit · scroll to zoom'}</p>
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
                {ZOO.map((sp) => <Chip key={sp.id} active={!loaded && species === sp} onClick={() => pick(sp)}>{sp.name[0].toUpperCase() + sp.name.slice(1)}</Chip>)}
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
                <Field label="Blobs">
                  <div className="flex flex-wrap gap-1.5">
                    {species.detail.map((n) => <Chip key={n} active={!loaded && count === n} onClick={() => { setLoaded(undefined); setCount(n) }}>{kilo(n)}</Chip>)}
                  </div>
                </Field>
                <Field label="Joints: how a blob turns">
                  <div className="flex flex-wrap gap-1.5">
                    <Chip active={mode === 'quat'} onClick={() => setMode('quat')}>Average the turns</Chip>
                    <Chip active={mode === 'linear'} onClick={() => setMode('linear')}>Blend the matrices</Chip>
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">From <a href={href({ page: 'lesson', id: 'twist' })} className="underline hover:text-accent">Twist without tearing</a>. Watch the tail.</p>
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
                  <span className="text-ink-muted">Open a rigged splat .glb</span>
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
            <b className="font-sans text-base font-semibold text-ink">As splats</b>, the .glb holds every blob with the KHR_gaussian_splatting
            standard, its bones and every clip as ordinary glTF, and a note (our BLOBSCAPE_gaussian_skinning extension) on how a
            skinned blob turns. The frog's tongue and the dragon's fire are bones that grow, which glTF keys as scale. three.js and
            other splat viewers open it as a still creature; this page plays it.
          </p>
          <p>
            <b className="font-sans text-base font-semibold text-ink">As a mesh</b>, it's a solid skin wrapped round the blobs, colored from
            them, with the same bones and clips. It loses the soft edges (and thin things like wings can come out holey) but moves in Blender, Godot, Unity or three.js.
          </p>
          <p>
            <b className="font-sans text-base font-semibold text-ink">As pixel art</b>, it's a sprite sheet: each move you pick, drawn from 4 or 8 sides,
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
