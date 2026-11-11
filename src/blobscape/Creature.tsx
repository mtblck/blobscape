import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import { COATS, makeCreature, poseIdle, poseWalk, type Coat, type Creature as Fox } from '../splat-engine/creature.ts'
import { GlbError, readRiggedGlb, recordClip, writeRiggedGlb, writeRiggedMeshGlb, type Clip } from '../splat-engine/glb.ts'
import { blobsToMesh } from '../splat-engine/mesh.ts'
import type { SkinMode } from '../splat-engine/rig.ts'
import { Button, Chip, Field, Slider } from '../shared/ui.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { Mark } from '../shared/Logo.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import { download, kb } from './files.ts'
import { LESSONS, href } from './routes.ts'
import type { CreatureStage } from './creature/stage.ts'

const START: Orbit = { target: [0, 0.72, 0], distance: 4.2, azimuth: 40, elevation: 12 }
const DETAIL = [5000, 20000, 100000, 200000]
const COAT_NAMES: Record<keyof typeof COATS, string> = { red: 'Red', arctic: 'Arctic', silver: 'Silver' }
const STRIDE = 1 / 1.4
/** What a clip is called on its chip: ours get friendly names, a file's keep their own. */
const clipLabel = (name: string) => ({ trot: 'Trot', idle: 'Stand' })[name] ?? name
const STILL = 'still'
const MAX_FILE = 200 * 1024 * 1024
const RIG_LESSONS = LESSONS.filter((l) => ['one-bone', 'weights', 'twist', 'walk', 'model'].includes(l.id))

interface Shown { name: string; fox: Fox; clips: Clip[]; fromFile: boolean }

/** The fox and its two clips, recorded once per creature. */
function build(count: number, coat: Coat): Shown {
  const fox = makeCreature(count, 7, coat)
  const trot = recordClip('trot', fox.skeleton, poseWalk, STRIDE, 24)
  const idle = recordClip('idle', fox.skeleton, poseIdle, 4, 12)
  fox.skeleton.reset()
  fox.skeleton.update()
  return { name: 'blob fox', fox, clips: [trot, idle], fromFile: false }
}

declare global {
  interface Window { __creature?: { stage: CreatureStage; blobs: () => number; glb: () => Uint8Array; mesh: (cells: number) => Uint8Array } }
}

/**
 * Creature: a procedural blob fox, rigged, that walks on Blobscape's own
 * splat engine and leaves as a 3D model, as rigged splats in a .glb and as a
 * solid mesh with the same bones and clips.
 */
export function Creature() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<CreatureStage>()
  // The engine's code, the graphics device and the first frame's shaders take a moment: show that it's coming
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState<string>()
  const [count, setCount] = useState(20000)
  const [coat, setCoat] = useState<keyof typeof COATS>('red')
  const [move, setMove] = useState<string>('trot')
  const [speed, setSpeed] = useState(1)
  const [mode, setMode] = useState<SkinMode>('quat')
  const [orbit, setOrbit] = useState<Orbit>(START)
  const [loaded, setLoaded] = useState<Shown>()
  const [fileNote, setFileNote] = useState<string>()
  const [busy, setBusy] = useState<string>()
  const [cells, setCells] = useState(64)
  const offscreen = useMemo(() => new URLSearchParams(location.search).get('offscreen') === '1', [])

  // Building a big fox takes a moment, so it happens after a note has painted, not during a render
  const [made, setMade] = useState<Shown>(() => build(count, COATS[coat]))
  const madeFor = useRef({ count, coat })
  useEffect(() => {
    if (madeFor.current.count === count && madeFor.current.coat === coat) return
    madeFor.current = { count, coat }
    setBusy(`Making a fox of ${count.toLocaleString()} blobs…`)
    const t = setTimeout(() => { setMade(build(count, COATS[coat])); setBusy(undefined) }, 30)
    return () => clearTimeout(t)
  }, [count, coat])
  const shown = loaded ?? made
  const clip = move === STILL ? undefined : shown.clips.find((c) => c.name === move) ?? shown.clips[0]

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

  useEffect(() => { stage?.setActor(shown.fox, clip) }, [stage, shown]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { stage?.setClip(clip) }, [stage, clip])
  useEffect(() => { if (stage) stage.speed = speed }, [stage, speed])
  useEffect(() => { stage?.setMode(mode) }, [stage, mode])
  useEffect(() => { if (stage) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit])

  const splatGlb = () => writeRiggedGlb({ name: shown.name, ...shown.fox, clips: shown.clips })
  const meshGlb = (c: number) => writeRiggedMeshGlb({ name: shown.name, mesh: blobsToMesh(shown.fox.blobs, shown.fox.skin, { cells: c, level: 1 }), skeleton: shown.fox.skeleton, clips: shown.clips })

  // For verify: the page's stage and its files, without clicking through downloads
  useEffect(() => {
    if (!stage) return
    window.__creature = { stage, blobs: () => stage.blobCount, glb: splatGlb, mesh: meshGlb }
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
      setLoaded({ name: r.name || file.name.replace(/\.glb$/i, ''), fox: r, clips: r.clips, fromFile: true })
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

  const moveLabel = !clip ? 'standing still' : clip.name === 'idle' ? 'standing and looking round' : clip.name === 'trot' ? 'trotting on the spot' : `playing ${clip.name}`
  const clipNames = shown.clips.map((c) => clipLabel(c.name).toLowerCase())

  return (
    <div className="pb-4">
      <Crumbs here="Creature" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <div className="flex flex-col gap-4 pt-4 lg:grid lg:grid-cols-12 lg:gap-x-5">
        <header className="lg:col-span-5">
          <h1 ref={h1} tabIndex={-1} className="font-display text-4xl leading-tight outline-none lg:text-5xl">Creature</h1>
          <p className="mt-2 max-w-[44ch] text-lg leading-snug text-ink-muted">
            A fox made of blobs, with fourteen bones, a trot and a look round. Make it big or small, then take it away as a 3D model that
            Blender and game engines open.
          </p>
        </header>
        <p className="text-sm text-ink-faint lg:col-span-7 lg:self-end lg:pb-1 lg:text-right">
          Drawn by Blobscape's own splat engine on {stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : '…'}: every blob moved by its bones on the graphics card.
        </p>

        <section aria-label="Creature" className="lg:col-span-12">
          <div className="case relative overflow-hidden rounded-2xl ring-1 ring-rule">
            <div className="relative h-[min(42dvh,360px)] min-h-[220px] lg:h-[clamp(320px,calc(100dvh-26rem),620px)]">
              <canvas
                ref={canvas}
                role="application"
                aria-roledescription="3D view"
                aria-label={`${shown.name}, ${shown.fox.blobs.count.toLocaleString()} blobs, ${moveLabel}. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.`}
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
              {!failed && (!drawn || busy?.startsWith('Making')) && <Loading label={drawn ? busy! : stage ? 'Waking the fox…' : 'Starting the splat engine…'} />}
              <p role="status" className="sr-only">{!failed && !drawn ? (stage ? 'Waking the fox…' : 'Starting the splat engine…') : ''}</p>
              {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
              <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(START)} />
              <p aria-hidden className="pointer-events-none absolute right-14 bottom-2 left-3 text-right text-xs text-ink-faint">{typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches ? 'drag to orbit · pinch to zoom' : 'drag to orbit · scroll to zoom'}</p>
            </div>
            <div className="border-t border-rule-soft px-4 py-2 text-xs leading-relaxed text-ink-muted sm:text-sm">
              <span className="tabular-nums text-ink" data-testid="blob-count">{shown.fox.blobs.count.toLocaleString()}</span> blobs on{' '}
              <span className="tabular-nums text-ink">{shown.fox.skeleton.count}</span> bones{clipNames.length ? <>, with {clipNames.length === 1 ? 'one clip' : `${clipNames.length} clips`}: {clipNames.join(' and ')}</> : ''}.
              {loaded && <> From your file. <button type="button" className="underline hover:text-accent" onClick={() => { setLoaded(undefined); setMove('trot'); setFileNote(undefined) }}>Back to the fox</button></>}
            </div>
          </div>
        </section>

        <section aria-label="Controls" className="rounded-2xl border border-rule bg-paper-sunk/60 px-4 pt-4 pb-4 lg:col-span-12 lg:px-5">
          <div className="stack-controls grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div role="group" aria-labelledby="g-make">
              <h2 id="g-make" className="mb-2 text-sm font-bold">The fox</h2>
              <div className="grid gap-3">
                <Field label="Blobs">
                  <div className="flex flex-wrap gap-1.5">
                    {DETAIL.map((n) => <Chip key={n} active={!loaded && count === n} onClick={() => { setLoaded(undefined); setCount(n) }}>{n >= 1000 ? `${n / 1000}k` : n}</Chip>)}
                  </div>
                </Field>
                <Field label="Coat">
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(COATS) as (keyof typeof COATS)[]).map((c) => <Chip key={c} active={!loaded && coat === c} onClick={() => { setLoaded(undefined); setCoat(c) }}>{COAT_NAMES[c]}</Chip>)}
                  </div>
                </Field>
              </div>
            </div>
            <div role="group" aria-labelledby="g-move">
              <h2 id="g-move" className="mb-2 text-sm font-bold">Move</h2>
              <div className="grid gap-3">
                <Field label="Clip">
                  <div className="flex flex-wrap gap-1.5">
                    {shown.clips.map((c, k) => <Chip key={`${k}-${c.name}`} active={clip === c} onClick={() => setMove(c.name)}>{clipLabel(c.name)}</Chip>)}
                    <Chip active={!clip} onClick={() => setMove(STILL)}>Still</Chip>
                  </div>
                </Field>
                <Slider label="Speed" value={speed} min={0.1} max={2} step={0.05} onChange={setSpeed} format={(v) => `×${v.toFixed(2)}`} />
              </div>
            </div>
            <div role="group" aria-labelledby="g-joints">
              <h2 id="g-joints" className="mb-2 text-sm font-bold">Joints <small className="text-xs font-normal text-ink-faint">how a blob turns</small></h2>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={mode === 'quat'} onClick={() => setMode('quat')}>Average the turns</Chip>
                <Chip active={mode === 'linear'} onClick={() => setMode('linear')}>Blend the matrices</Chip>
              </div>
              <p className="mt-2 text-xs text-ink-faint">From <a href={href({ page: 'lesson', id: 'twist' })} className="underline hover:text-accent">Twist without tearing</a>. Watch the tail.</p>
            </div>
            <div role="group" aria-labelledby="g-save">
              <h2 id="g-save" className="mb-2 text-sm font-bold">Take it away <small className="text-xs font-normal text-ink-faint">.glb, bones and clips</small></h2>
              <div className="grid gap-3">
                <Button small onClick={() => save('splats')}>Download as splats</Button>
                <Button small onClick={() => save('mesh')}>Download as a mesh</Button>
                <div role="group" aria-label="Mesh grid, cells along the fox" className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-xs text-ink-faint">Mesh grid</span>
                  {[48, 64, 96].map((c) => <Chip small key={c} active={cells === c} onClick={() => setCells(c)}>{c}</Chip>)}
                </div>
                <label className="text-sm text-ink-muted">
                  <span className="mb-1 block">Open a rigged splat .glb</span>
                  <input type="file" accept=".glb,model/gltf-binary" onChange={(e) => { void open(e.target.files?.[0]); e.target.value = '' }} className="block w-full text-xs file:mr-2 file:cursor-pointer file:rounded-md file:border file:border-rule file:bg-paper file:px-2 file:py-1 file:text-ink hover:file:border-ink-faint" />
                </label>
                <p aria-live="polite" className="text-xs text-ink-faint" data-testid="creature-note">{busy ?? fileNote ?? ''}</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section aria-labelledby="files-title" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-sm text-ink-faint">What you take away</p>
          <h2 id="files-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">One fox, two files</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            <b className="font-sans text-base font-semibold text-ink">As splats</b>, the .glb holds every blob with the KHR_gaussian_splatting
            standard, the fourteen bones and both clips as ordinary glTF, and a note (our BLOBSCAPE_gaussian_skinning extension) on how a
            skinned blob turns. three.js and other splat viewers open it as a still fox; this page plays it.
          </p>
          <p>
            <b className="font-sans text-base font-semibold text-ink">As a mesh</b>, it's a solid skin wrapped round the blobs, coloured from
            them, with the same bones and clips. It loses the soft fur but walks in Blender, Godot, Unity or three.js.
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

/** Over the view while the engine starts or a new fox is made: the Blobscape mark breathing, and what's happening. */
function Loading({ label }: { label: string }) {
  return (
    <div aria-hidden data-testid="creature-loading" className="pointer-events-none absolute inset-0 grid place-items-center">
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-paper/70 px-6 py-5 backdrop-blur-sm">
        <Mark className="creature-loading-mark h-10 w-auto" />
        <p className="text-sm text-ink">{label}</p>
      </div>
    </div>
  )
}
