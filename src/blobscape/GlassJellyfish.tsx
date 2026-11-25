import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import type { OpticsLook } from '../splat-core/optics.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Chip, Field, Slider, Toggle } from '../shared/ui.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import { href } from './routes.ts'
import type { CreatureStage } from './creature/stage.ts'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { countNames, detailAsked, writeDetail } from '../shared/detail.ts'
import { innerGlowAt, makeJelly, makeSpace, poseJelly, poseSpace, seeThrough, shineLights, LIGHT_COLORS, type Jelly, type LightColor } from './jelly/jellyfish.ts'

const DETAIL = [60000, 120000, 240000]
const kilo = (n: number) => `${n / 1000}k`
const VIEWS: { id: string; label: string; orbit: Orbit }[] = [
  { id: 'drift', label: 'Drifting', orbit: { target: [0, -0.4, 0], distance: 3.9, azimuth: 20, elevation: 10 } },
  { id: 'below', label: 'From below', orbit: { target: [0, -0.2, 0], distance: 3.4, azimuth: 30, elevation: -38 } },
  { id: 'above', label: 'Through the top', orbit: { target: [0, -0.1, 0], distance: 2.6, azimuth: 10, elevation: 62 } },
  { id: 'bell', label: 'The bell', orbit: { target: [0, 0.05, 0], distance: 1.9, azimuth: 35, elevation: 12 } },
]
const COLORS: { id: LightColor | 'off'; label: string }[] = [{ id: 'cyan', label: 'Cyan' }, { id: 'rainbow', label: 'Rainbow' }, { id: 'violet', label: 'Violet' }, { id: 'amber', label: 'Amber' }, { id: 'off', label: 'Off' }]
/** How many times its own color a light blob is drawn under the lens, so the pulses are the one thing over white. */
const LIGHT_GAIN = 6
/** The faint light of space on the body, and a cold light from above. */
const AMBIENT = 0.55

declare global {
  interface Window { __jelly?: { stage: CreatureStage; jelly: Jelly } }
}

const params = () => (typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search))

/**
 * Glass Jellyfish: a moon jelly made of nearly clear blobs, drifting in space. The body is one actor and its lights
 * another on the same bones, recolored every frame so pulses of light run from the top of the bell down the canals
 * and on along the tentacles (jelly/jellyfish.ts). Drawn by our own splat engine, with the lens's glow on WebGPU.
 */
export function GlassJellyfish() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<CreatureStage>()
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState<string>()
  const offscreen = useMemo(() => params().get('offscreen') === '1', [])
  const calm = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const coarse = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches, [])
  const [playing, setPlaying] = useState(!calm)
  const [count, setCount] = useState(() => detailAsked(DETAIL, countNames) ?? (coarse ? DETAIL[0] : DETAIL[1]))
  const [color, setColor] = useState<LightColor | 'off'>(() => { const c = params().get('lights'); return c && (c === 'off' || c === 'rainbow' || c in LIGHT_COLORS) ? (c as LightColor | 'off') : 'cyan' })
  const [clear, setClear] = useState(() => { const v = Number(params().get('clear')); return v > 0 && v <= 3 ? v : 1 })
  const [glow, setGlow] = useState(params().get('glow') !== '0')
  const [focus, setFocus] = useState(params().get('focus') !== '0')
  const [turn, setTurn] = useState(true)
  const [view, setView] = useState(() => VIEWS.find((v) => v.id === params().get('view'))?.id ?? 'drift')
  const [orbit, setOrbit] = useState<Orbit>(() => VIEWS.find((v) => v.id === view)!.orbit)

  const [jelly, setJelly] = useState<Jelly>()
  useEffect(() => {
    // built after a paint, so the loading mark shows first
    const t = setTimeout(() => setJelly(makeJelly(count)), 30)
    return () => clearTimeout(t)
  }, [count])
  const space = useMemo(() => makeSpace(11, coarse ? 1400 : 2600), [coarse])

  useEffect(() => {
    let live: CreatureStage | undefined, gone = false
    import('./creature/stage.ts')
      .then(({ CreatureStage }) => CreatureStage.start(canvas.current!, { offscreen, lights: true }))
      .then((s) => {
        if (gone) { s.dispose(); return }
        live = s
        s.onFirstFrame = () => setDrawn(true)
        s.setFloor(0)
        setStage(s)
      }, (e: unknown) => { console.warn(e); setFailed('This browser could not start WebGPU or WebGL 2, which the jellyfish needs.') })
    return () => { gone = true; live?.dispose() }
  }, [offscreen])

  // what the poser reads each frame, without setting it again
  const now = useRef({ color, turn })
  now.current = { color, turn }

  useEffect(() => {
    if (!stage || !jelly) return
    const from = stage.time
    stage.setGlowGain(LIGHT_GAIN)
    stage.setActor(jelly.body, undefined, [jelly.lights, space])
    stage.setPoser((sk, t) => {
      poseJelly(sk, t, now.current.turn)
      poseSpace(space.skeleton, t)
      shineLights(jelly, t, now.current.color)
      stage.recolor(jelly.lights)
      const g = now.current.color === 'off' ? 0 : innerGlowAt(t)
      const lc = now.current.color
      const c = lc === 'off' || lc === 'rainbow' ? [0.85, 0.85, 1] : LIGHT_COLORS[lc].front
      const h = sk.posedHead
      stage.setLights([
        { position: [h[0], h[1] + 0.12, h[2]], color: [c[0] * (0.15 + 1.4 * g), c[1] * (0.15 + 1.4 * g), c[2] * (0.15 + 1.4 * g)], range: 0.7 },
        { direction: [0.3, 1, 0.4], color: [0.16, 0.19, 0.28] },
      ], AMBIENT)
    }, from)
  }, [stage, jelly, space])

  useEffect(() => { if (stage) stage.playing = playing }, [stage, playing])
  useEffect(() => { if (stage) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit])
  // see-through: the body's opacities again, then its colors sent up
  useEffect(() => {
    if (!stage || !jelly) return
    seeThrough(jelly, clear)
    stage.recolor(jelly.body)
  }, [stage, jelly, clear])
  useEffect(() => { stage?.invalidate() }, [stage, color, turn])
  // the lens: light over white spills round itself, and what is far from the jellyfish goes soft
  useEffect(() => {
    if (!stage) return
    const on = glow || focus
    const look: OpticsLook = { focus: orbit.distance, fNumber: focus ? 2.2 : 0, film: 0.09, most: 0.012, glow: glow ? 1.2 : 0, knee: 0.85, shoulder: 0.75 }
    stage.setLens(on ? look : undefined)
  }, [stage, glow, focus, orbit.distance])

  useEffect(() => {
    if (!stage || !jelly) return
    window.__jelly = { stage, jelly }
    return () => { delete window.__jelly }
  }, [stage, jelly])

  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  useWheelZoom(canvas, setOrbit)
  const pick = (id: string) => { setView(id); setOrbit(VIEWS.find((v) => v.id === id)!.orbit) }
  const backend = stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'
  const waiting = !failed && (!drawn || !jelly)

  return (
    <div className="pb-4">
      <Crumbs here="Glass Jellyfish" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Glass Jellyfish</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          A moon jelly made of blobs that are nearly all clear, drifting through space. You see the stars through its bell. Each beat of
          the bell sends light down its canals and out along its tentacles.
        </p>
      </header>
      <Workbench
        viewLabel="The jellyfish"
        view={<>
          <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 40%, #0b1430 0%, #050817 55%, #020309 100%)' }} />
          <canvas
            ref={canvas}
            role="application"
            aria-roledescription="3D view"
            aria-label={`A see-through jellyfish${jelly ? ` of ${jelly.body.blobs.count.toLocaleString()} blobs` : ''} in space, ${playing ? 'swimming' : 'still'}. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.`}
            tabIndex={0}
            data-testid="jelly-view"
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
          {waiting && <LoadingMark testid="jelly-loading" />}
          <p role="status" className="sr-only">{waiting ? (stage ? 'Growing the jellyfish…' : 'Starting the splat engine…') : ''}</p>
          {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-white">{failed}</div>}
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => pick(view)} />
        </>}
        status={<>
          <span>{jelly ? <><span className="tabular-nums text-ink" data-testid="jelly-blobs">{jelly.body.blobs.count.toLocaleString()}</span> blobs in the body and <span className="tabular-nums text-ink">{jelly.lights.blobs.count.toLocaleString()}</span> lights, most under a tenth opaque.</> : 'Growing the jellyfish…'}</span>
        </>}
        tabsLabel="Options"
        tabs={[
          {
            id: 'jelly', label: 'Jellyfish', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Lights">
                  <div className="flex flex-wrap gap-1.5">
                    {COLORS.map((c) => <Chip key={c.id} active={color === c.id} onClick={() => setColor(c.id)}>{c.label}</Chip>)}
                  </div>
                </Field>
                <Slider label="See-through" value={clear} min={0.25} max={3} step={0.05} onChange={setClear}
                  format={(v) => (v === 1 ? 'as grown' : v < 1 ? `${Math.round((1 / v) * 10) / 10}× clearer` : `${Math.round(v * 10) / 10}× milkier`)}
                  hint="Each blob lets through what it did, to this power: below 1 it is clearer, above 1 it is as if blobs were stacked." />
                <div className="grid gap-2">
                  <Toggle label="Swimming" checked={playing} onChange={setPlaying} />
                  <Toggle label="Turns as it drifts" checked={turn} onChange={setTurn} />
                </div>
              </div>
            ),
          },
          {
            id: 'view', label: 'View', content: (
              <div className={TAB_SECTIONS}>
                <Field label="View">
                  <div className="flex flex-wrap gap-1.5">
                    {VIEWS.map((v) => <Chip key={v.id} active={view === v.id} onClick={() => pick(v.id)}>{v.label}</Chip>)}
                  </div>
                </Field>
                <div className="grid gap-2">
                  <Toggle label="Glow round the lights" checked={glow} onChange={setGlow} />
                  <Toggle label="Depth of field" checked={focus} onChange={setFocus} />
                </div>
                <Field label="Blobs">
                  <div className="flex flex-wrap gap-1.5">
                    {DETAIL.map((n) => <Chip key={n} active={count === n} onClick={() => { setCount(n); writeDetail(kilo(n)) }}>{kilo(n)}</Chip>)}
                  </div>
                </Field>
              </div>
            ),
          },
        ]}
      />

      <section aria-labelledby="how-title" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-sm text-ink-faint">How it's drawn</p>
          <h2 id="how-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">Drawn with almost nothing</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            Most of this jellyfish is blobs that let through more than nine tenths of the light behind them. One of them alone you
            would hardly see. Where you look along the bell's skin at a slant, or through a fold of an arm, your line of sight passes
            through dozens of them, and that is where it shows: its edges, its canals and its frills draw themselves.
          </p>
          <p>
            The bell has two skins with a thin gel between them, and inside it four horseshoe gonads, the part of a real moon jelly
            you see through its top. Each beat squeezes the margin in, lifts it a little, and sends a wave down every tentacle. The
            lights are a second set of blobs on the same bones that give their own light, colored again every frame as each pulse
            runs out from the top.
          </p>
          <p>
            Blobscape's own splat engine draws it here on {backend}, sorting every blob of the jellyfish, its lights and the stars
            behind it as one, far to near. The same engine moves the creatures in <a href={href({ page: 'creature' })} className="underline decoration-rule underline-offset-2 hover:text-accent">Splat Creatures</a>.
          </p>
        </div>
      </section>
    </div>
  )
}
