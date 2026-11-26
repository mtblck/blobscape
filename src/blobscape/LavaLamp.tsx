import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import type { PixelLook, Rgb } from '../splat-core/pixel.ts'
import { unlit } from '../splat-engine/voxel.ts'
import { joinPalettes } from '../splat-engine/project.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field, Slider, Toggle } from '../shared/ui.tsx'
import { detailAsked, labelNames, writeDetail } from '../shared/detail.ts'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import type { Actor, CreatureStage } from './creature/stage.ts'
import { useDrawnLook, useHeld, wantsPlain, type Look } from './drawnLook.tsx'
import { PICKED_STYLES, styleAsked, type Style } from '../splat-engine/styles/styles.ts'
import { pixelLookOf, pixelStart, type Finish } from './styleSettings.ts'
import { useStyleOnStage } from './useStyleOnStage.ts'
import { colorsOf } from './creator/cut.ts'
import { href } from './routes.ts'
import { GLASS, LAMP_STYLES, WAX_COLORS, WAX_GLOW, buildLamp, glassBlobs, lampLights, liquidBlobs, placeWax, stillActor, waxBlobs, type WaxColor } from './lavalamp/lamp.ts'
import { WaxRun, discsFor, type WaxFrame } from './lavalamp/run.ts'
import type { FromWax, ToWax } from './lavalamp/wax.worker.ts'
import type { WaxKnobs } from './lavalamp/wax.ts'

declare global {
  interface Window { __lava?: { stage: CreatureStage; frame: (seconds: number) => Promise<void>; wax: () => WaxFrame | undefined } }
}

/** Detail: the grid the base and cap are cut on, and the grid the wax's surface is cut on. */
const DETAILS = [
  { id: 'light', label: 'Light', spacing: 0.011, cell: 0.011, liquid: 160 },
  { id: 'full', label: 'Full', spacing: 0.0075, cell: 0.008, liquid: 260 },
  { id: 'fine', label: 'Fine', spacing: 0.0055, cell: 0.006, liquid: 360 },
] as const
type Detail = 0 | 1 | 2

/** The styles a lamp is drawn in: the shared ones, but the glitch (pixel art with bursts) adds nothing here. */
const STYLE_CHOICES = PICKED_STYLES.filter((s) => s.id !== 'glitch')

/** The room it stands in, top and bottom (sRGB 0–255): dim, as a lava lamp wants. */
const ROOM: [Rgb, Rgb] = [[22, 20, 34], [52, 40, 52]]
const ROOM_CSS = 'radial-gradient(ellipse at 50% 62%, #3a2c3e 0%, #1d1a2a 55%, #0e0c15 100%)'
/** Pixel art's finish for the lamp. */
const FINISH: Finish = { dither: 0.5, glow: 0.4, outline: true, edges: true, sky: true, steps: false, bands: 2 }
/**
 * Pixel art's colors for the glass: the wax hot and cool, lighter and darker, the liquid lit and in shade, and wax seen
 * through the liquid, or the glass snaps to the base's grays.
 */
function waxPalette(c: WaxColor): [number, number, number][] {
  const mix = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k) as [number, number, number]
  const white = [1, 1, 1], black = [0, 0, 0]
  return [
    c.hot, c.cool, mix(c.hot, white, 0.35), mix(c.hot, white, 0.7), mix(c.cool, black, 0.4),
    c.liquid, mix(c.liquid, black, 0.3), mix(c.liquid, black, 0.55), mix(c.liquid, white, 0.5),
    mix(c.hot, c.liquid, 0.5), mix(c.cool, c.liquid, 0.5), [0.85, 0.9, 1], [1, 1, 1],
  ]
}

const NO_LOOK: PixelLook = { palette: [], dither: 0, outline: null, glow: 0 }
/** How long the wax has been warming when the page opens, so blobs are already on their way. */
const WARM = 40

const START: Orbit = { target: [0, 0.74, 0], distance: 2.35, azimuth: 0, elevation: 8 }

const params = () => new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
const media = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches
const hex = (c: readonly number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')}`

/**
 * Lava Lamp: wax that warms on the bottom of the glass, swells up out of its pool, rises, presses against others, runs
 * together and sinks back as it cools (lavalamp/wax.ts), its surface cut into blobs every frame (surface.ts), in a
 * glass of tinted liquid on one of several bases (lamp.ts), drawn in any of the shared styles.
 */
export function LavaLamp() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<CreatureStage>()
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState<string>()
  const offscreen = useMemo(() => params().get('offscreen') === '1', [])
  const coarse = useMemo(() => media('(pointer: coarse)'), [])
  const calm = useMemo(() => media('(prefers-reduced-motion: reduce)'), [])
  const [playing, setPlaying] = useState(!calm)
  const [colorId, setColorId] = useState(() => WAX_COLORS.find((c) => c.id === params().get('wax'))?.id ?? WAX_COLORS[0].id)
  const [baseId, setBaseId] = useState(() => LAMP_STYLES.find((s) => s.id === params().get('base'))?.id ?? LAMP_STYLES[0].id)
  const [style, setStyle] = useState<Style>(() => { const s = styleAsked(params().get('style')); return s === 'glitch' ? 'pixel' : s })
  const [detail, setDetail] = useState<Detail>(() => { const asked = detailAsked(DETAILS, labelNames); return asked ? (DETAILS.indexOf(asked) as Detail) : coarse ? 0 : 1 })
  const [knobs, setKnobs] = useState<WaxKnobs>(() => {
    const h = Number(params().get('heat')), p = Number(params().get('pace'))
    return { heat: h >= 0.5 && h <= 1.5 ? h : 1, pace: p >= 0.25 && p <= 3 ? p : 1 }
  })
  const [on, setOn] = useState(params().get('bulb') !== '0')
  const [glass, setGlass] = useState(params().get('glass') !== '0')
  const [orbit, setOrbit] = useState<Orbit>(START)
  const color = WAX_COLORS.find((c) => c.id === colorId)!
  const base = LAMP_STYLES.find((s) => s.id === baseId)!
  const det = DETAILS[detail]

  const pixels = style === 'pixel'
  const look: Look | undefined = pixels ? undefined : (style as Look)
  const plain = wantsPlain(look)

  useEffect(() => {
    let live: CreatureStage | undefined, gone = false
    import('./creature/stage.ts')
      .then(({ CreatureStage }) => CreatureStage.start(canvas.current!, { offscreen, lights: true, webgl: params().get('webgl') === '1' }))
      .then((s) => {
        if (gone) { s.dispose(); return }
        live = s
        s.onFirstFrame = () => setDrawn(true)
        s.setFloor(0)
        setStage(s)
      }, (e: unknown) => { console.warn(e); setFailed('This browser could not start WebGPU or WebGL 2, which the lava lamp needs.') })
    return () => { gone = true; live?.dispose() }
  }, [offscreen])

  // the base and cap, cut after a paint so the waiting mark shows first; with no light baked in for a style that lights itself
  const bodyKey = `${baseId}|${detail}|${plain}`
  const [body, setBody] = useState<{ key: string; actor: Actor; plain: boolean; palette: string[] }>()
  useEffect(() => {
    const t = setTimeout(() => {
      const make = () => buildLamp(base, det.spacing)
      const actor = plain ? unlit(make) : make()
      setBody({ key: bodyKey, actor, plain, palette: colorsOf(actor, 10) })
    }, 30)
    return () => clearTimeout(t)
  }, [bodyKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // the glass, the liquid and the wax: soft, so they stay blobs among cubes
  const soft = useMemo(() => {
    const g = { ...stillActor(glassBlobs(color.liquid, det.spacing, pixels ? GLASS.pixels : GLASS.opacity), 'glass'), soft: true } as Actor
    const l = { ...stillActor(liquidBlobs(color.liquid, det.liquid), 'liquid'), soft: true } as Actor
    const wb = waxBlobs(discsFor(det.cell))
    const w = { ...stillActor(wb, 'wax'), soft: true, glow: new Uint8Array(wb.count).fill(WAX_GLOW) } as Actor
    return { glass: g, liquid: l, wax: w, key: `${colorId}|${detail}|${pixels}` }
  }, [colorId, detail, pixels]) // eslint-disable-line react-hooks/exhaustive-deps

  // what the poser and the worker's frames read, without setting the stage again
  const now = useRef({ color, base, knobs, on, playing })
  now.current = { color, base, knobs, on, playing }
  const latest = useRef<WaxFrame | undefined>(undefined)

  // the stage: the base and cap, then the liquid, wax and glass
  const ready = !!body && body.key === bodyKey
  const [onStage, setOnStage] = useState<{ body: typeof body; soft: typeof soft }>()
  useEffect(() => {
    if (!stage || !body || !ready) return
    const from = stage.time
    stage.setActor(body.actor, undefined, [soft.liquid, soft.wax, soft.glass])
    if (latest.current) { placeWax(latest.current, det.cell, now.current.color, soft.wax.blobs); stage.reshape(soft.wax) }
    stage.setPoser(() => {
      const n = now.current
      stage.setLights(lampLights(n.base, n.knobs.heat, n.on), n.on ? 0.42 : 0.55)
    }, from)
    setOnStage({ body, soft })
  }, [stage, body, soft, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  // the wax: in a worker on the wall clock, or off screen on the stage's own clock so a moment drawn twice is the same
  const shown = onStage?.soft
  const local = useRef<WaxRun | undefined>(undefined)
  useEffect(() => {
    if (!stage || !shown) return
    const cell = DETAILS[detail].cell
    const put = (f: WaxFrame) => {
      latest.current = f
      placeWax(f, cell, now.current.color, shown.wax.blobs)
      stage.reshape(shown.wax)
      stage.invalidate()
    }
    if (offscreen) {
      local.current = new WaxRun(cell, 7, now.current.knobs, WARM)
      put(local.current.frame(0))
      return () => { local.current = undefined }
    }
    const w = new Worker(new URL('./lavalamp/wax.worker.ts', import.meta.url), { type: 'module' })
    const id = Math.floor(Math.random() * 1e9)
    w.onmessage = (e: MessageEvent<FromWax>) => { if (e.data.id === id) put(e.data) }
    w.postMessage({ type: 'start', id, cell, seed: 7, knobs: now.current.knobs, warm: WARM } satisfies ToWax)
    w.postMessage({ type: 'play', playing: now.current.playing } satisfies ToWax)
    worker.current = w
    return () => { w.terminate(); worker.current = undefined }
  }, [stage, shown, detail, offscreen])
  const worker = useRef<Worker | undefined>(undefined)
  useEffect(() => { worker.current?.postMessage({ type: 'set', knobs } satisfies ToWax); if (local.current) local.current.wax.knobs = { ...knobs } }, [knobs])
  useEffect(() => { worker.current?.postMessage({ type: 'play', playing } satisfies ToWax); if (stage) stage.playing = playing }, [stage, playing])
  // a new color recolors the wax as it stands
  useEffect(() => {
    if (!stage || !shown || !latest.current) return
    placeWax(latest.current, DETAILS[detail].cell, color, shown.wax.blobs)
    stage.reshape(shown.wax)
  }, [stage, shown, color]) // eslint-disable-line react-hooks/exhaustive-deps
  // the glass is there or not by its opacity
  useEffect(() => {
    if (!stage || !shown) return
    const b = shown.glass.blobs
    if (!glass) b.opacity.fill(0); else { const fresh = glassBlobs(color.liquid, det.spacing, pixels ? GLASS.pixels : GLASS.opacity); b.opacity.set(fresh.opacity.subarray(0, b.count)) }
    stage.recolor(shown.glass)
  }, [stage, shown, glass]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (stage) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit])
  useEffect(() => { stage?.invalidate() }, [stage, on, knobs])

  // the style: the shared looks, and pixel art through the shared pixel settings
  const stageReady = !!onStage && onStage.body?.key === bodyKey
  const lookNow = useHeld(look, stageReady)
  const drawing = useDrawnLook(stage, lookNow, { actor: onStage?.body?.actor, spacing: det.spacing, plain: !!onStage?.body?.plain, azimuth: 0, offscreen, light: coarse, sky: ROOM, loop: 12 })
  const pixelLook = useMemo<PixelLook | undefined>(() => {
    if (!pixels || !body) return undefined
    const colors = joinPalettes([body.palette, waxPalette(color).map(hex), ROOM.map((c) => hex(c.map((v) => v / 255)))])
    return pixelLookOf(pixelStart(FINISH, params()), { colors, sky: ROOM, finish: FINISH, loop: 12 })
  }, [pixels, body, color])
  useStyleOnStage(stage, { pixels: pixels && stageReady, look: pixelLook ?? NO_LOOK, size: 2, coarse })

  // the address keeps what is on show
  useEffect(() => {
    const q = params()
    q.set('wax', colorId)
    q.set('base', baseId)
    if (style === 'blocks') q.delete('style'); else q.set('style', style)
    if (knobs.heat !== 1) q.set('heat', String(knobs.heat)); else q.delete('heat')
    if (knobs.pace !== 1) q.set('pace', String(knobs.pace)); else q.delete('pace')
    if (on) q.delete('bulb'); else q.set('bulb', '0')
    if (glass) q.delete('glass'); else q.set('glass', '0')
    history.replaceState(history.state, '', `${location.pathname}?${q}`)
  }, [colorId, baseId, style, knobs, on, glass])

  // for verify: draw a moment, the wax moved on by the stage's clock
  useEffect(() => {
    if (!stage || !stageReady) return
    window.__lava = {
      stage,
      frame: async (seconds) => {
        const run = local.current
        if (run && shown) {
          // the wax cuts a long gap short, so a jump ahead goes in steps
          for (let gap = seconds - (run.wax.time - WARM) / run.wax.knobs.pace; gap > 1e-6; gap -= 0.5) run.advance(Math.min(gap, 0.5))
          const f = run.frame(seconds)
          latest.current = f
          placeWax(f, DETAILS[detail].cell, now.current.color, shown.wax.blobs)
          stage.reshape(shown.wax)
        }
        await stage.frame(seconds)
      },
      wax: () => latest.current,
    }
    return () => { delete window.__lava }
  }, [stage, stageReady, shown, detail])

  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  useWheelZoom(canvas, setOrbit as never)
  const waiting = !failed && (!drawn || !stageReady)
  const backend = stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'
  const styleLabel = STYLE_CHOICES.find((s) => s.id === style)?.label ?? 'Blocks'
  const [line, setLine] = useState('')
  useEffect(() => {
    const id = setInterval(() => {
      const f = latest.current
      if (!f) return
      setLine(`${f.blobs === 0 ? 'All the wax lies in the pool' : f.blobs === 1 ? 'One blob is up' : `${f.blobs} blobs are up`}; ${f.events.buds} risen, ${f.events.merges} run together, ${f.events.landed} sunk back so far.`)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="pb-4">
      <Crumbs here="Lava Lamp" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Lava Lamp</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          Wax warms on the bottom of the glass until a bud of it swells up, stretches away from the pool and rises. At the
          top it cools, sinks and runs back in. Pick the wax and liquid, the base it stands in, and how it is drawn.
        </p>
      </header>
      <Workbench
        viewLabel="The lava lamp"
        view={<>
          <div aria-hidden className="absolute inset-0" style={{ background: drawing.ground ?? ROOM_CSS }} />
          <canvas
            ref={canvas}
            role="application"
            aria-roledescription="3D view"
            aria-label={`A lava lamp, ${color.label.toLowerCase()} wax on a ${base.label.toLowerCase()} base, drawn as ${styleLabel.toLowerCase()}. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.`}
            tabIndex={0}
            data-testid="lava-view"
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
              const next = orbitKey(ev, orbit)
              if (!next) return
              ev.preventDefault()
              setOrbit(next)
            }}
          />
          {waiting && <LoadingMark testid="lava-loading" />}
          <p role="status" className="sr-only">{waiting ? (stage ? 'Making the lamp…' : 'Starting the splat engine…') : `The lamp, ${color.label.toLowerCase()}.`}</p>
          {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
          <ZoomBar orbit={orbit} setOrbit={setOrbit as never} onReset={() => setOrbit(START)} />
        </>}
        status={<>
          <span data-testid="lava-line">{line || 'Warming up…'}</span>
          <span>On {backend}</span>
        </>}
        tabsLabel="Options"
        tabs={[
          {
            id: 'lamp', label: 'Lamp', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Wax and liquid">
                  <div className="flex flex-wrap gap-1.5" data-testid="lava-colors">
                    {WAX_COLORS.map((c) => <Chip key={c.id} active={colorId === c.id} onClick={() => setColorId(c.id)}><Swatch c={c} />{c.label}</Chip>)}
                  </div>
                </Field>
                <Field label="Base and cap">
                  <div className="flex flex-wrap gap-1.5" data-testid="lava-bases">
                    {LAMP_STYLES.map((s) => <Chip key={s.id} active={baseId === s.id} onClick={() => setBaseId(s.id)}>{s.label}</Chip>)}
                  </div>
                </Field>
                <div className="space-y-2">
                  <Toggle label="Bulb on" checked={on} onChange={setOn} />
                  <Toggle label="Glass" checked={glass} onChange={setGlass} />
                  <p className="text-xs text-ink-faint">With the bulb off the wax still moves, for a while, as a lamp's does once it is warm.</p>
                </div>
              </div>
            ),
          },
          {
            id: 'wax', label: 'Wax', content: (
              <div className={TAB_SECTIONS}>
                <div>
                  <Slider label="Bulb heat" min={0.5} max={1.5} step={0.05} value={knobs.heat} onChange={(v) => setKnobs((k) => ({ ...k, heat: v }))} format={(v) => `${Math.round(v * 100)}%`} />
                  <p className="mt-1.5 text-xs text-ink-faint">Hotter, the pool buds sooner and blobs stay up longer before they cool enough to sink.</p>
                </div>
                <Slider label="Speed" min={0.25} max={3} step={0.25} value={knobs.pace} onChange={(v) => setKnobs((k) => ({ ...k, pace: v }))} format={(v) => `${v}×`} />
                <div className="flex flex-wrap gap-1.5">
                  <Button small onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</Button>
                </div>
                <Field label="Detail">
                  <div className="flex flex-wrap gap-1.5" data-testid="lava-detail">
                    {DETAILS.map((d, i) => <Chip key={d.id} active={detail === i} onClick={() => { setDetail(i as Detail); writeDetail(d.id) }}>{d.label}</Chip>)}
                  </div>
                </Field>
              </div>
            ),
          },
          {
            id: 'style', label: 'Style', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Drawn as">
                  <div className="flex flex-wrap gap-1.5" data-testid="lava-styles">
                    {STYLE_CHOICES.map((s) => <Chip key={s.id} active={style === s.id} onClick={() => setStyle(s.id)}>{s.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">The styles every scene on the site is drawn in. In blocks the base and cap are cubes and the wax, liquid and glass stay soft blobs among them.</p>
                </Field>
                {drawing.controls}
              </div>
            ),
          },
        ]}
      />

      <section aria-labelledby="how-title" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-sm text-ink-faint">How it works</p>
          <h2 id="how-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">Wax that is lighter when warm</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            The wax is a pool on the bottom and a handful of blobs, each with a size, a temperature and a speed. The bulb
            warms the pool until a bud of it swells up, fed by the pool and still tied to it by a neck of wax. Warm wax
            weighs a little less than the liquid and rises. Only the liquid just over the bulb is warm, so a blob loses its
            heat through its skin all the way up, faster the smaller it is, and turns over and sinks back. A big one keeps
            its heat longest and lingers at the top.
          </p>
          <p>
            The neck thins as the bud pulls away until it pinches off, as a thread of honey does, leaving a tail on the bud
            and a spike on the pool that draw back in. Blobs never pass through each other: two that meet press together
            and flatten while the film of liquid between them drains, and often part again. Once it has drained a bridge of
            wax opens between them and widens, and the smaller runs into the larger over a second or two. A blob that sinks
            onto the pool melts back into it the same way.
          </p>
          <p>
            Thirty times a second that surface is cut into a few thousand flat blobs a grid cell apart, each lying along the
            wax and colored by how hot it is, and the bulb's light comes up through them from below.
          </p>
        </div>
      </section>
    </div>
  )
}

function Swatch({ c }: { c: WaxColor }) {
  return <span aria-hidden className="mr-1.5 inline-block h-3 w-3 rounded-full align-[-1px]" style={{ background: `radial-gradient(circle at 35% 35%, ${hex(c.hot)}, ${hex(c.cool)} 70%)`, boxShadow: `0 0 0 2px ${hex(c.liquid)}` }} />
}

