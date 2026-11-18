import { startFailure } from '../shared/stale.tsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field, Slider } from '../shared/ui.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { href } from './routes.ts'
import type { CameraView, ForestStage } from './forest/stage.ts'
import { SEASONS, type Season } from './forest/plants.ts'
import { RING, TILE } from './forest/world.ts'
import type { Input } from './forest/world.ts'
import { Stick } from './Stick.tsx'

const LOOKS = [{ id: 'forest', label: 'Forest' }, { id: 'dusk', label: 'Dusk' }, { id: 'autumn', label: 'Autumn' }]
const VIEWS: { id: CameraView; label: string }[] = [{ id: 'close', label: 'Close' }, { id: 'far', label: 'Far' }, { id: 'high', label: 'High' }]
/** Detail: how many blobs, relative. Phones without WebGPU start on the lightest. */
const DETAIL = [{ id: 0.35, label: 'Light' }, { id: 1, label: 'Full' }, { id: 2, label: 'Lush' }]

declare global {
  interface Window { __forest?: { stage: ForestStage } }
}

interface Stats { blobs: number; growing: number; walked: number; fps: number }

/**
 * Forest Walk: walk the elf down an endless forest path, from behind, while
 * trees, ferns, flowers and mushrooms grow out of the ground as you come.
 * The elf and every plant are one scene on Blobscape's own splat engine.
 */
export function ForestWalk() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<ForestStage>()
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState<string>()
  const [busy, setBusy] = useState<string>()
  const offscreen = useMemo(() => new URLSearchParams(location.search).get('offscreen') === '1', [])
  const [season, setSeason] = useState<Season>('summer')
  const [look, setLook] = useState('forest')
  const [detail, setDetail] = useState<number>()
  const [view, setView] = useState<CameraView>('close')
  // under reduced motion the forest stands grown and still; both can be turned back on
  const calm = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const [sprout, setSprout] = useState(!calm)
  const [wind, setWind] = useState(calm ? 0 : 1)
  const [seed, setSeed] = useState(1)
  const [stats, setStats] = useState<Stats>({ blobs: 0, growing: 0, walked: 0, fps: 0 })
  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

  useEffect(() => {
    let live: ForestStage | undefined, gone = false
    import('./forest/stage.ts')
      .then(({ ForestStage }) => ForestStage.start(canvas.current!, { offscreen }))
      .then((s) => {
        if (gone) { s.dispose(); return }
        live = s
        s.onFirstFrame = () => setDrawn(true)
        s.onTick = (f, fps) => setStats({ blobs: f.blobCount, growing: f.growing, walked: f.walked, fps })
        setStage(s)
        // without WebGPU (where the CPU sorts every frame) the forest starts light; with it, full
        setDetail((d) => d ?? (s.backend === 'webgpu' ? 1 : 0.35))
      }, (e: unknown) => { console.warn(e); setFailed(startFailure('the forest needs')) })
    return () => { gone = true; live?.dispose() }
  }, [offscreen])

  // Growing a forest takes a moment: let the note paint first
  useEffect(() => {
    if (!stage || detail === undefined) return
    setBusy('Planting the forest…')
    const t = setTimeout(() => {
      stage.setForest({ detail, season, look, seed: stage.forest?.seed ?? seed })
      stage.forest!.sprout = sprout
      stage.forest!.wind = wind
      setStats((s) => ({ ...s, blobs: stage.blobCount }))
      setBusy(undefined)
    }, 30)
    return () => clearTimeout(t)
  }, [stage, detail, season, look]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (stage?.forest) stage.forest.sprout = sprout }, [stage, sprout])
  useEffect(() => { if (stage?.forest) stage.forest.wind = wind }, [stage, wind])
  useEffect(() => { if (stage) stage.view = view }, [stage, view])
  useEffect(() => { if (stage?.forest && stage.forest.seed !== seed) stage.forest.reseed(seed) }, [stage, seed])

  // --- walking: keys and the thumb stick both feed one input
  const keys = useRef(new Set<string>())
  const stick = useRef<Input>({ forward: 0, turn: 0 })
  const stageRef = useRef(stage)
  stageRef.current = stage
  const push = () => {
    const stage = stageRef.current
    if (!stage) return
    const k = keys.current
    const forward = (k.has('f') ? 1 : 0) - (k.has('b') ? 1 : 0) + stick.current.forward
    const turn = (k.has('r') ? 1 : 0) - (k.has('l') ? 1 : 0) + stick.current.turn
    stage.input = { forward: Math.max(-1, Math.min(1, forward)), turn: Math.max(-1, Math.min(1, turn)) }
  }
  useEffect(() => {
    const KEYS: Record<string, string> = { ArrowUp: 'f', KeyW: 'f', ArrowDown: 'b', KeyS: 'b', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' }
    // keys walk the elf from anywhere on the page, except where they already mean something (typing, a slider, tabs)
    const mine = (e: KeyboardEvent) => {
      const t = e.target
      return !(t instanceof HTMLElement && (t.isContentEditable || t.closest('input, textarea, select, [role=tab], [role=slider]')))
    }
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !mine(e)) return
      if (e.code === 'KeyE') { stageRef.current?.forest?.wave(); return }
      if (e.code === 'KeyF') { if (!e.repeat) stageRef.current?.forest?.spark(); return }
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
  // the stick or a held key may have been set before the stage was ready
  useEffect(() => { push() }, [stage]) // eslint-disable-line react-hooks/exhaustive-deps

  // For verify: the page's stage (only in the off-screen mode it uses)
  useEffect(() => {
    if (!stage || !offscreen) return
    window.__forest = { stage }
    return () => { delete window.__forest }
  }, [stage, offscreen])

  const backend = stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'
  const loading = !failed && (!drawn || !!busy)
  const loadingLabel = busy ?? (stage ? 'Planting the forest…' : 'Starting the splat engine…')

  return (
    <div className="pb-4">
      <Crumbs here="Forest Walk" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      {/* the same header as every experiment: name on the left, what it is on the right */}
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Forest Walk</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          Walk the elf down a forest path that never ends, with a fox trotting at its side. Trees, ferns, flowers and mushrooms
          grow out of the ground as you come, all of them made of blobs.
        </p>
      </header>
      <Workbench
        viewLabel="Forest"
        fullScreenAt="top-3 left-3 max-sm:top-2 max-sm:left-2"
        view={<>
              <canvas
                ref={canvas}
                role="application"
                aria-roledescription="3D view"
                aria-label="An elf and a fox on a forest path, seen from behind. Arrow keys or W, A, S and D walk and turn; E waves; F lights the grass ahead."
                tabIndex={0}
                data-testid="forest-view"
                className="absolute inset-0 h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
              />
              {loading && <LoadingMark testid="forest-loading" />}
              <p role="status" className="sr-only">{loading ? loadingLabel : ''}</p>
              {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
              <Stick testid="forest-stick" onChange={(v) => { stick.current = v; push() }} />
              <div className="absolute right-3 bottom-3 flex flex-col items-end gap-2">
                <Button onClick={() => stage?.forest?.spark()} className="rounded-full bg-paper/85 font-medium text-ink shadow-sm backdrop-blur-sm hover:bg-paper">Light the grass</Button>
                <Button onClick={() => stage?.forest?.wave()} className="rounded-full bg-paper/85 font-medium text-ink shadow-sm backdrop-blur-sm hover:bg-paper">Wave</Button>
              </div>
              <p aria-hidden className="pointer-events-none absolute top-2 right-2 rounded-full bg-paper/80 px-2.5 py-0.5 text-xs text-ink backdrop-blur-sm">
                {coarse ? 'drag the stick to walk' : 'arrow keys or WASD to walk · E to wave · F to light the grass'}
              </p>
        </>}
        status={<div data-testid="forest-stats">
              <span className="tabular-nums text-ink">{stats.blobs.toLocaleString()}</span> blobs,{' '}
              <span className="tabular-nums text-ink">{stats.growing}</span> plants up,{' '}
              <span className="tabular-nums text-ink">{Math.round(stats.walked)}</span> m walked
              {stats.fps > 0 && <span className="text-ink-faint">, {Math.round(stats.fps)} fps</span>}.{' '}
              <span aria-live="polite">{busy ?? ''}</span>
        </div>}
        tabsLabel="Options"
        tabs={[
          {
            id: 'forest', label: 'Forest Type', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Season">
                  <div className="flex flex-wrap gap-1.5">
                    {SEASONS.map((s) => <Chip key={s.id} active={season === s.id} onClick={() => setSeason(s.id)}>{s.label}</Chip>)}
                  </div>
                </Field>
                <Field label="Plants">
                  <div className="flex flex-wrap gap-1.5">
                    <Chip active={sprout} onClick={() => setSprout(true)}>Grow as I come</Chip>
                    <Chip active={!sprout} onClick={() => setSprout(false)}>Grown already</Chip>
                  </div>
                </Field>
                <Slider label="Wind" value={wind} min={0} max={3} step={0.1} onChange={setWind} format={(v) => (v === 0 ? 'still' : `×${v.toFixed(1)}`)} />
                <div><Button small onClick={() => setSeed((s) => s + 1)}>Plant a new forest</Button></div>
              </div>
            ),
          },
          {
            id: 'elf', label: 'Character Style', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Look">
                  <div className="flex flex-wrap gap-1.5">
                    {LOOKS.map((l) => <Chip key={l.id} active={look === l.id} onClick={() => setLook(l.id)}>{l.label}</Chip>)}
                  </div>
                </Field>
                <p className="text-xs text-ink-faint">
                  The same elf and fox as in <a href={href({ page: 'creature' })} className="underline hover:text-accent">Splat Creatures</a>. Each foot is
                  placed on the ground and stays there until it steps, and the walk's swing follows the steps.
                </p>
              </div>
            ),
          },
          {
            id: 'view', label: 'View', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Camera">
                  <div className="flex flex-wrap gap-1.5">
                    {VIEWS.map((v) => <Chip key={v.id} active={view === v.id} onClick={() => setView(v.id)}>{v.label}</Chip>)}
                  </div>
                </Field>
                <Field label="Detail">
                  <div className="flex flex-wrap gap-1.5">
                    {DETAIL.map((d) => <Chip key={d.id} active={detail === d.id} onClick={() => setDetail(d.id)}>{d.label}</Chip>)}
                  </div>
                </Field>
                <p className="text-xs text-ink-faint">Lighter detail walks smoother on older phones.</p>
              </div>
            ),
          },
        ]}
      />

      <section aria-labelledby="how-title" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-sm text-ink-faint">How it keeps going</p>
          <h2 id="how-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">A forest of {RING} tiles</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            Only {RING} stretches of path, each {TILE} m long, exist at once. When one falls behind the elf it is picked up and laid
            down ahead, and the path's wiggle repeats every {RING * TILE} m so its ground still fits. Its trees and flowers are
            hidden and given the new stretch's places, which are worked out from the stretch's number, so walking back finds the same forest.
          </p>
          <p>
            Every plant is a small rig of bones. Growing is just its bones going from no size to full size, the trunk first, then
            branches, fronds unrolling and flowers opening, and the wind is a slow turn on the upper bones. Nothing is rebuilt as you
            walk. Blobscape's own splat engine, running here on {backend}, moves every blob by its bones each frame, then sorts
            the elf and the whole forest together, blob by blob, so the elf can walk behind a trunk and through the ferns.
          </p>
          <p>
            The feet aren't played from a clip. Each foot keeps its spot on the ground, and only steps once it has fallen too far
            from where it would stand under the body, aiming a little ahead of where the body is going, so the same rule walks,
            turns on the spot, backs up and stops with the feet square. The fox's feet step in diagonal pairs, a trot. The legs
            are then bent to reach each foot, and the hips come down a little when a stride is long.
          </p>
          <p>
            Light the grass and the fire runs through it from patch to patch, faster where it is thick, and stops at the path.
            The grass is a grid of cells under the forest, each holding how much grass stands there, how hard it burns and how
            black the ground is. Each blade of grass stands over a short stub: burning, the blade turns to flame and then is gone,
            leaving the stub black on a scorched patch with a few embers glowing. After a while the scar greens and the blades
            grow back. Only the blobs' colors change, so nothing is rebuilt.
          </p>
          <p>
            Bones are the subject of the <a href={href({ page: 'lesson', id: 'one-bone' })} className="underline decoration-rule underline-offset-2 hover:text-accent">rigs lessons</a>,
            and why the sorting matters is <a href={href({ page: 'lesson', id: 'order' })} className="underline decoration-rule underline-offset-2 hover:text-accent">Order matters</a>.
          </p>
        </div>
      </section>
    </div>
  )
}
