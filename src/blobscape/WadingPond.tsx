import { useEffect, useMemo, useRef, useState } from 'react'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field, Slider, Toggle } from '../shared/ui.tsx'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import type { Orbit } from '../splat-core/view.ts'
import type { PondStage } from './pond/stage.ts'
import { SCALE, POND_SCENE } from './pond/scene.ts'
import type { Input } from './pond/wade.ts'
import { href } from './routes.ts'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { Stick } from './Stick.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import { detailAsked, labelNames, writeDetail } from '../shared/detail.ts'

const LOOKS = [{ id: 'forest', label: 'Forest' }, { id: 'dusk', label: 'Dusk' }, { id: 'autumn', label: 'Autumn' }]
/** Detail: the grid the ruin is cut on (smaller is finer) and the elf's blobs. Phones without WebGPU start on the lightest. */
const DETAIL = [{ id: 'light', label: 'Light', spacing: 0.034, elf: 12000 }, { id: 'full', label: 'Full', spacing: 0.02, elf: 20000 }, { id: 'fine', label: 'Fine', spacing: 0.015, elf: 30000 }]
/** The lens openings on offer, as f-numbers: each lets in half the light of the one before. */
const STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16]
/** How strongly bright light glows when the switch is on (the stage's own start). */
const GLOW = 0.5
/** How many times steeper than it is the water is drawn to start with: the pond's own `RIPPLE`, which this page can't import without loading the stage early. */
const RIPPLE = 2.5
const RAIN = [{ id: 0, label: 'None' }, { id: 30, label: 'A few drops' }, { id: 300, label: 'A shower' }]

const at = (azimuth: number, elevation: number, distance = POND_SCENE.camera.distance): Orbit => ({ target: POND_SCENE.camera.target.map((v) => v * SCALE) as [number, number, number], distance: distance * SCALE, azimuth, elevation })
const VIEWS: { id: string; label: string; orbit: Orbit }[] = [
  { id: 'start', label: 'From the front', orbit: at(POND_SCENE.camera.azimuth, POND_SCENE.camera.elevation) },
  { id: 'low', label: 'Low over the water', orbit: at(-8, 7, 5.2) },
  { id: 'niche', label: 'By the candles', orbit: { target: [-3.6, 0.9, -3], distance: 7.5, azimuth: 24, elevation: 12 } },
  { id: 'above', label: 'From above', orbit: at(10, 62, 6.6) },
]

declare global {
  interface Window { __pond?: { stage: PondStage } }
}

interface Stats { blobs: number; waded: number; still: boolean; fps: number }

/**
 * Wading Pond: steer the elf through a shallow pond in a ruin by candlelight. The water is a grid of heights that
 * the elf's legs push about, so the rings come from its footfalls and bounce off the banks.
 */
export function WadingPond() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<PondStage>()
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState<string>()
  const [busy, setBusy] = useState<string>()
  const offscreen = useMemo(() => new URLSearchParams(location.search).get('offscreen') === '1', [])
  const webgl = useMemo(() => new URLSearchParams(location.search).get('webgl') === '1', [])
  const [look, setLook] = useState('forest')
  const [detail, setDetail] = useState<string | undefined>(() => detailAsked(DETAIL, labelNames)?.id)
  const [view, setView] = useState('start')
  const [orbit, setOrbit] = useState<Orbit>(VIEWS[0].orbit)
  // under reduced motion the candles burn steady and the air holds still; it can be turned back on
  const calm0 = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const [flicker, setFlicker] = useState(!calm0)
  const [shadows, setShadows] = useState(true)
  // on where the stage starts with it on (WebGPU); known once the stage is up
  const [mirror, setMirror] = useState<boolean>()
  // the lens: on where the stage starts with it on (WebGPU)
  const [glow, setGlow] = useState<boolean>()
  const [blur, setBlur] = useState<boolean>()
  const [stop, setStop] = useState(STOPS.indexOf(5.6))
  const [rain, setRain] = useState(0)
  const [ripple, setRipple] = useState(RIPPLE)
  const [stats, setStats] = useState<Stats>({ blobs: 0, waded: 0, still: true, fps: 0 })
  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

  useEffect(() => {
    let live: PondStage | undefined, gone = false
    import('./pond/stage.ts')
      .then(({ PondStage }) => PondStage.start(canvas.current!, { offscreen, webgl, small: coarse }))
      .then((s) => {
        if (gone) { s.dispose(); return }
        live = s
        s.onFirstFrame = () => setDrawn(true)
        s.onTick = (p, fps) => setStats({ blobs: p.blobCount, waded: p.waded, still: p.water.still, fps })
        setStage(s)
        // without WebGPU (where the CPU sorts every frame) the pond starts light; with it, full
        setDetail((d) => d ?? (s.backend === 'webgpu' && !coarse ? 'full' : 'light'))
        setMirror((m) => m ?? s.reflections)
        setGlow((g) => g ?? s.glow > 0)
        setBlur((b) => b ?? s.focusBlur)
      }, (e: unknown) => { console.warn(e); setFailed('This browser could not start WebGPU or WebGL 2, which the pond needs.') })
    return () => { gone = true; live?.dispose() }
  }, [offscreen, webgl])

  // Cutting the ruin takes a moment: let the note paint first
  useEffect(() => {
    if (!stage || detail === undefined) return
    setBusy('Filling the pond…')
    const t = setTimeout(() => {
      const d = DETAIL.find((x) => x.id === detail)!
      try {
        stage.setPond({ spacing: d.spacing, look, elfBlobs: d.elf })
        stage.pond!.calm = !flicker
        stage.pond!.rain = rain
        stage.pond!.ripple = ripple
        setStats((s) => ({ ...s, blobs: stage.blobCount }))
      } catch (e) {
        console.warn(e)
        setFailed('The pond could not be built.')
      }
      setBusy(undefined)
    }, 30)
    return () => clearTimeout(t)
  }, [stage, detail, look]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (stage?.pond) stage.pond.calm = !flicker }, [stage, flicker])
  useEffect(() => { if (stage?.pond) stage.pond.rain = rain }, [stage, rain])
  useEffect(() => { if (stage?.pond) stage.pond.ripple = ripple }, [stage, ripple])
  useEffect(() => { if (stage) stage.shadows = shadows }, [stage, shadows])
  useEffect(() => { if (stage && mirror !== undefined) stage.reflections = mirror }, [stage, mirror])
  useEffect(() => { if (stage && glow !== undefined) stage.glow = glow ? GLOW : 0 }, [stage, glow])
  useEffect(() => { if (stage && blur !== undefined) stage.focusBlur = blur }, [stage, blur])
  useEffect(() => { if (stage) stage.fNumber = STOPS[stop] }, [stage, stop])
  useEffect(() => { if (stage) stage.orbit = orbit }, [stage, orbit])

  // --- wading: keys and the thumb stick both feed one input
  const keys = useRef(new Set<string>())
  const stick = useRef<Input>({ forward: 0, turn: 0 })
  const stageRef = useRef(stage)
  stageRef.current = stage
  const push = () => {
    const stage = stageRef.current
    if (!stage) return
    const k = keys.current
    // both steer by the picture: up is away from you, whichever way the elf faces and however the view is turned
    const y = (k.has('f') ? 1 : 0) - (k.has('b') ? 1 : 0) + stick.current.forward
    const x = (k.has('r') ? 1 : 0) - (k.has('l') ? 1 : 0) + stick.current.turn
    stage.input = { forward: 0, turn: 0, stick: { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) } }
  }
  useEffect(() => {
    const KEYS: Record<string, string> = { ArrowUp: 'f', KeyW: 'f', ArrowDown: 'b', KeyS: 'b', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' }
    // keys move the elf from anywhere on the page, except where they already mean something (typing, a slider, tabs)
    const mine = (e: KeyboardEvent) => {
      const t = e.target
      return !(t instanceof HTMLElement && (t.isContentEditable || t.closest('input, textarea, select, [role=tab], [role=slider]')))
    }
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !mine(e)) return
      if (e.code === 'KeyE') { stageRef.current?.pond?.wave(); return }
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

  // --- the view: drag to turn it, and a tap that hardly moves lets a drop fall on the water
  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const tap = useRef<{ x: number; y: number; t: number } | null>(null)
  useWheelZoom(canvas, setOrbit)
  const pick = (id: string) => { setView(id); setOrbit(VIEWS.find((v) => v.id === id)!.orbit) }

  // For verify: the page's stage (only in the off-screen mode it uses)
  useEffect(() => {
    if (!stage || !offscreen) return
    window.__pond = { stage }
    return () => { delete window.__pond }
  }, [stage, offscreen])

  const backend = stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'
  const loading = !failed && (!drawn || !!busy)
  const loadingLabel = busy ?? (stage ? 'Filling the pond…' : 'Starting the splat engine…')

  return (
    <div className="pb-4">
      <Crumbs here="Wading Pond" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      {/* the same header as every experiment: name on the left, what it is on the right */}
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Wading Pond</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          Wade the elf through a shallow pond in a ruin by candlelight. Every ring on the water comes from a foot going in or
          a leg pushing through, and it spreads, bounces off the banks and dies away on its own.
        </p>
      </header>
      <Workbench
        viewLabel="Pond"
        fullScreenAt="top-3 left-3 max-sm:top-2 max-sm:left-2"
        view={<>
              <canvas
                ref={canvas}
                role="application"
                aria-roledescription="3D view"
                aria-label="An elf standing in a shallow pond in front of ruined arches, with candles burning in a niche at the water's edge. Arrow keys or W, A, S and D wade the way they point on the screen; E waves. Drag to turn the view, or pick a view in the View tab; a tap on the water, or Enter here, lets a drop fall."
                tabIndex={0}
                data-testid="pond-view"
                className="absolute inset-0 h-full w-full cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset active:cursor-grabbing"
                onKeyDown={(ev) => {
                  // the keyboard's tap: a drop a step ahead of the elf
                  const p = stage?.pond
                  if (ev.key !== 'Enter' || !p) return
                  p.drip(p.walker.x + Math.sin(p.walker.heading) * 0.8, p.walker.z + Math.cos(p.walker.heading) * 0.8)
                }}
                onPointerDown={(ev) => {
                  ev.currentTarget.setPointerCapture(ev.pointerId)
                  pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
                  drag.current = beginOrbitDrag(pointers.current, ev, orbit)
                  tap.current = pointers.current.size === 1 ? { x: ev.clientX, y: ev.clientY, t: ev.timeStamp } : null
                }}
                onPointerMove={(ev) => {
                  if (pointers.current.has(ev.pointerId)) pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
                  const d = drag.current
                  if (d) setOrbit(dragOrbit(d, pointers.current, ev))
                }}
                onPointerUp={(ev) => {
                  pointers.current.delete(ev.pointerId)
                  drag.current = null
                  const t = tap.current
                  tap.current = null
                  if (!t || ev.timeStamp - t.t > 350 || Math.hypot(ev.clientX - t.x, ev.clientY - t.y) > 6) return
                  const r = ev.currentTarget.getBoundingClientRect()
                  stage?.dripAt(ev.clientX - r.left, ev.clientY - r.top)
                }}
                onPointerCancel={(ev) => { pointers.current.delete(ev.pointerId); drag.current = null; tap.current = null }}
              />
              {loading && <LoadingMark testid="pond-loading" />}
              <p role="status" className="sr-only">{loading ? loadingLabel : ''}</p>
              {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
              <Stick testid="pond-stick" onChange={(v) => { stick.current = v; push() }} />
              <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => pick(view)} />
              <p aria-hidden className="pointer-events-none absolute top-2 right-14 rounded-full bg-paper/80 px-2.5 py-0.5 text-xs text-ink backdrop-blur-sm">
                {coarse ? 'stick to wade · tap the water' : 'arrow keys or WASD to wade · drag to turn the view · click the water'}
              </p>
        </>}
        status={<div data-testid="pond-stats">
              <span className="tabular-nums text-ink">{stats.blobs.toLocaleString()}</span> blobs,{' '}
              <span className="tabular-nums text-ink">{Math.round(stats.waded)}</span> m waded, the water is{' '}
              <span className="text-ink" data-testid="pond-water">{stats.still ? 'still' : 'moving'}</span>
              {stats.fps > 0 && <span className="text-ink-faint">, {Math.round(stats.fps)} fps</span>}.{' '}
              <span aria-live="polite">{busy ?? ''}</span>
        </div>}
        tabsLabel="Options"
        tabs={[
          {
            id: 'water', label: 'Water & Light', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Rain">
                  <div className="flex flex-wrap gap-1.5">
                    {RAIN.map((r) => <Chip key={r.id} active={rain === r.id} onClick={() => setRain(r.id)}>{r.label}</Chip>)}
                  </div>
                </Field>
                <Slider label="Ripple strength" value={ripple} min={1} max={5} step={0.5} onChange={setRipple} format={(v) => `${v}×`} />
                <div className="grid gap-2">
                  <Toggle label="The water mirrors the scene" checked={mirror ?? false} onChange={setMirror} />
                  <Toggle label="Candles flicker" checked={flicker} onChange={setFlicker} />
                  <Toggle label="Candles cast shadows" checked={shadows} onChange={setShadows} />
                </div>
                <p className="text-xs text-ink-faint">A click or tap on the water lets one drop fall there; Enter on the view drops one in front of the elf.</p>
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
                <div><Button small onClick={() => stage?.pond?.wave()}>Wave</Button></div>
                <p className="text-xs text-ink-faint">
                  The same elf as in <a href={href({ page: 'forest' })} className="underline hover:text-accent">Forest Walk</a>, stepping higher
                  here so each foot comes clear of the water.
                </p>
              </div>
            ),
          },
          {
            id: 'view', label: 'View', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Camera">
                  <div className="flex flex-wrap gap-1.5">
                    {VIEWS.map((v) => <Chip key={v.id} active={view === v.id} onClick={() => pick(v.id)}>{v.label}</Chip>)}
                  </div>
                </Field>
                <Slider label="Turn" value={((Math.round(orbit.azimuth) % 360) + 360) % 360} min={0} max={359} step={1} onChange={(v) => setOrbit((o) => ({ ...o, azimuth: v }))} format={(v) => `${v}°`} />
                <div className="grid gap-2">
                  <Toggle label="Flames glow" checked={glow ?? false} onChange={setGlow} />
                  <Toggle label="Focus on the elf, blur the rest" checked={blur ?? false} onChange={setBlur} />
                  {blur && <Slider label="Lens opening" value={stop} min={0} max={STOPS.length - 1} step={1} onChange={setStop} format={(v) => `f/${STOPS[v]}`} />}
                </div>
                <Field label="Detail">
                  <div className="flex flex-wrap gap-1.5">
                    {DETAIL.map((d) => <Chip key={d.id} active={detail === d.id} onClick={() => { setDetail(d.id); writeDetail(d.id) }}>{d.label}</Chip>)}
                  </div>
                </Field>
                <p className="text-xs text-ink-faint">Lighter detail runs smoother on older phones.</p>
              </div>
            ),
          },
        ]}
      />

      <section aria-labelledby="how-title" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-sm text-ink-faint">How the water works</p>
          <h2 id="how-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">Nothing draws the rings</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            The pond is a grid of small cells, each holding how high the water stands there and how fast it is rising. Sixty
            times a second every cell is pulled toward the level of its four neighbors. That one rule is the wave equation,
            and it is all a ring needs to travel outward at a steady speed. A cell of dry ground gives its neighbor's push
            straight back, so rings bounce off the banks, the steps and the broken column.
          </p>
          <p>
            The elf never asks for a ripple. Each frame the page finds where each shin and foot crosses the surface and
            tells the water. A leg standing on the bed takes the place of a column of water as wide as itself and as deep
            as the pond, so that much water is pushed to the cells round it; where a leg has left, the water comes back. A foot coming down raises a ring, a leg dragged through
            pushes a small wave ahead of it, and standing still lets the pond go flat. Rain and a tap on the water are drops
            added the same way.
          </p>
          <p>
            Where the water lies is worked out too. The ruin is a scene written as shapes, like the ones in{' '}
            <a href={href({ page: 'diorama' })} className="underline decoration-rule underline-offset-2 hover:text-accent">Pixel Diorama</a>,
            and the pond floods outward from the elf through every cell whose ground is under the surface. The elf's feet stand on
            that same ground, stones and all.
          </p>
          <p>
            The surface is drawn as flat blobs, two to a cell, each lifted and tilted to the water under it. Its color comes from
            where you look from: clear and green looking down into it, darker and more of a mirror at a low angle.
          </p>
          <p>
            What it mirrors is the scene itself. Each time the mirror is drawn, the whole ruin, the elf and the flames are
            drawn once more as their mirror image, from where you are looking, leaving out whatever is under the water.
            Each blob of the surface then looks up what lies along its own mirrored line of sight in that picture. A
            ripple tips that line, so reflections wobble and break up as rings pass, and nothing in it is placed by
            hand: move the elf in front of the candles and their reflection goes dark behind it. Where the picture
            is empty the water mirrors the night sky, lighter toward the horizon. Because the mirror costs a second
            sort of every blob, it starts switched off where the browser has no WebGPU.
          </p>
          <p>
            The view is finished through a lens, and that is worked out as well. The glow is the picture's own light:
            whatever is brighter than a set level spills some of that light round itself, so the flames and their
            reflections glow and the pale stone does not. The blur is a camera's: the lens is kept focused on the elf,
            and every other point is drawn as wide as a real lens of that opening would draw something at its distance,
            read from a map of how far away each pixel is. A wider opening (a smaller f-number) leaves a thinner slice
            sharp. The pond is photographed the way a model of it on a table would be, a twentieth of its size: a camera
            in front of the real place would keep all of it sharp, so from far off the blur is slight, and close in
            it is strong.
          </p>
          <p>
            Each candle flame is a few dozen blobs on a bone that stretches and leans on its own rhythm. Their light is two of the
            engine's live lights, placed among the flames and as bright as they burn, casting shadows through a grid of what
            blocks light that is rebuilt every frame. So the elf throws a shadow on the wall as it wades past. All of it runs on
            Blobscape's own splat engine, here on {backend}.
          </p>
        </div>
      </section>
    </div>
  )
}
