import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import type { Blobs } from '../splat-core/blobs.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field, Toggle } from '../shared/ui.tsx'
import { detailAsked, labelNames, writeDetail } from '../shared/detail.ts'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import type { Actor, CreatureStage } from './creature/stage.ts'
import { DETAIL } from './diorama/scene.ts'
import { DIORAMAS } from './diorama/scenes.ts'
import { TimeControls } from './styles/SceneControls.tsx'
import { timeAsked, type TimeId } from './timeOfDay.ts'
import { Snow, baseActor, fitGlobe, flakeBlobs, glassBlobs, placeFlakes, stillActor, type Globe } from './globe/snow.ts'
import { href } from './routes.ts'

declare global {
  interface Window { __globe?: { stage: CreatureStage; snow: Snow; globe: Globe; shake: (strength?: number) => void } }
}

/** The scenes that fit under the glass: Diorama's, made of props from the library. */
const SCENES = [
  { id: 'snowman', label: 'Snowman' },
  { id: 'christmas-tree', label: 'Christmas tree' },
  { id: 'presents', label: 'Presents' },
  { id: 'sleigh', label: 'Sleigh and reindeer' },
  { id: 'santa', label: 'Santa' },
  { id: 'cabin', label: 'Snowed-in cabin' },
  { id: 'grove', label: 'Lantern grove' },
  { id: 'ornament', label: 'Ornament' },
] as const

const DETAILS = [{ id: 'light', label: 'Light' }, { id: 'full', label: 'Full' }, { id: 'fine', label: 'Fine' }] as const
type Detail = 0 | 1 | 2

/** How much snow, in flakes. */
const AMOUNTS = [{ id: 'flurry', label: 'A flurry', count: 1500 }, { id: 'snow', label: 'Snow', count: 3500 }, { id: 'blizzard', label: 'Blizzard', count: 7000 }] as const

/** A flake's radius, as a share of the dome's. */
const FLAKE = 0.006
/** How far the globe rocks when shaken, as a share of its radius, and how fast that dies away (a third every this many seconds). */
const ROCK = 0.035, ROCK_LIFE = 0.35
/** A phone's shake, in meters a second squared, past which it counts, and how much more makes the hardest shake. */
const MOTION_FROM = 13, MOTION_SPAN = 22

const params = () => new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
const media = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches

type Motion = { requestPermission?: () => Promise<'granted' | 'denied'> }

/**
 * Snow Globe (issue #459): a Diorama scene under a glass dome full of water and snow. A shake sets the water turning
 * and stirring and throws the snow up; it drifts down over a quarter of a minute and lies on the scene's own ground
 * (globe/snow.ts). Tap the globe, press the button or Space, or shake a phone.
 */
export function SnowGlobe() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<CreatureStage>()
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState<string>()
  const offscreen = useMemo(() => params().get('offscreen') === '1', [])
  const coarse = useMemo(() => media('(pointer: coarse)'), [])
  const calm = useMemo(() => media('(prefers-reduced-motion: reduce)'), [])
  const [playing, setPlaying] = useState(!calm)
  const [scene, setScene] = useState(() => SCENES.find((s) => s.id === params().get('scene'))?.id ?? SCENES[0].id)
  const [time, setTime] = useState<TimeId | undefined>(() => timeAsked(params().get('time')))
  const [detail, setDetail] = useState<Detail>(() => { const asked = detailAsked(DETAILS, labelNames); return asked ? (DETAILS.indexOf(asked) as Detail) : coarse ? 0 : 1 })
  const [amount, setAmount] = useState(() => AMOUNTS.find((a) => a.id === params().get('snow'))?.id ?? 'snow')
  const [glass, setGlass] = useState(() => params().get('glass') !== '0')
  const [built, setBuilt] = useState<{ key: string; globe: Globe; snow: Snow; flakes: Actor; glass: Actor; clear: Float32Array; blobs: number }>()
  const [orbit, setOrbit] = useState<Orbit>()
  const orbitNow = useRef(orbit)
  orbitNow.current = orbit
  /** The last shake, for the globe's rocking: when (on the stage's clock) and which way across the view. */
  const rocked = useRef<{ at: number; way: [number, number]; strength: number } | null>(null)
  const [lying, setLying] = useState(0)
  const [motion, setMotion] = useState<'off' | 'on' | 'refused'>('off')
  const label = SCENES.find((s) => s.id === scene)!.label
  const flakes = AMOUNTS.find((a) => a.id === amount)!.count

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
      }, (e: unknown) => { console.warn(e); setFailed('This browser could not start WebGPU or WebGL 2, which the snow globe needs.') })
    return () => { gone = true; live?.dispose() }
  }, [offscreen])

  const shakeNow = useRef<(strength?: number, way?: [number, number]) => void>(() => {})

  // the scene cut, the dome fitted round it and the snow put in; after a paint, so the waiting mark shows first
  const key = `${scene}|${time ?? ''}|${detail}|${flakes}`
  useEffect(() => {
    if (!stage) return
    const picked = DIORAMAS.find((d) => d.id === scene)!
    const d = (time && picked.timed?.(time)) || picked
    const t = setTimeout(() => {
      const spacing = DETAIL[detail].spacing
      const cut = d.make(spacing)
      const names = cut.skeleton.bones.map((b) => b.name)
      // the sky's moon and stars, and what drifts in the air (the scene's own falling snow, fireflies), stay outside the glass
      const outside = names.map((n, i) => (n.startsWith('~') ? i : -1)).filter((i) => i >= 0)
      const out = new Set(outside)
      const fit: number[] = []
      for (let i = 0; i < cut.blobs.count; i++) if (!out.has(cut.skin.joints[i * 4]) && cut.blobs.opacity[i] > 0.2) fit.push(cut.blobs.center[i * 3], cut.blobs.center[i * 3 + 1], cut.blobs.center[i * 3 + 2])
      const globe = fitGlobe(fit, Math.max(1, Math.floor(fit.length / 3 / 20000)))
      const top = globe.center[1] + globe.radius
      // where there is no ground, snow lies on the base's own snow, which stands a little over the cut
      const least = globe.floor + spacing * 1.4 * 0.7
      const snow = new Snow(globe, flakes, (x, z) => d.ground?.(x, z, top, globe.floor) ?? least, globe.radius * FLAKE, 11, 40, least)
      const flake = stillActor(flakeBlobs(snow), 'snow')
      const dome = stillActor(glassBlobs(globe, coarse ? 1800 : 2800), 'glass')
      const base = baseActor(globe, spacing * 1.4)
      const fire = d.fire?.()
      stage.setActor(cut, undefined, [base, flake, dome, ...(fire ? [fire.actor] : [])])
      let last = stage.time, sent = false
      stage.setPoser((sk, now) => {
        d.pose(sk, now)
        for (const b of outside) sk.size[b] = 0
        sk.update()
        // the snow moves on by the stage's own clock, so a frame drawn twice off screen is the same
        const dt = now - last
        last = now
        // nothing is sent up while all the snow lies in still water
        const before = snow.moving > 0 || snow.settled < snow.count
        if (dt > 0) snow.step(Math.min(dt, 0.1))
        if (before || !sent) { placeFlakes(snow, flake.blobs as Blobs); stage.reshape(flake); sent = true }
        if (fire) { fire.show(now, eyeOf(stage.orbit)); stage.reshape(fire.actor) }
        const lit = d.lights(now, stage.backend === 'webgpu')
        stage.setLights(fire ? fire.shine(lit, now) : lit, d.ambientAt?.(now) ?? d.ambient ?? 1)
        // a shake rocks the globe a little on its base, which dies away
        const o = orbitNow.current, r = rocked.current
        if (o && r && !calm) {
          const since = now - r.at, k = ROCK * globe.radius * r.strength * Math.exp(-since / ROCK_LIFE) * Math.sin(since * 26)
          stage.orbit = since < 3 ? { ...o, target: [o.target[0] - r.way[0] * k, o.target[1] + r.way[1] * k * 0.5, o.target[2]] } : o
        }
      })
      setOrbit((o) => {
        // a new scene starts from its own side, the dome filling the view; the time of day or the snow keep the view
        const start: Orbit = { target: [globe.center[0], globe.center[1] - globe.radius * 0.05, globe.center[2]], distance: globe.radius * 3.3, azimuth: d.views[0].orbit.azimuth, elevation: 14 }
        return o && built?.globe && Math.abs(built.globe.radius - globe.radius) < 1e-6 ? o : start
      })
      setBuilt({ key, globe, snow, flakes: flake, glass: dome, clear: dome.blobs.opacity.slice(), blobs: cut.blobs.count })
      // it starts in the middle of a gentle shake, unless the device asks for less motion
      if (!calm) { snow.shake(0.7, [1, 0]); rocked.current = null }
    }, 30)
    return () => clearTimeout(t)
    // `built` is only read to keep the view where only the snow or the time changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, key])

  const ready = built?.key === key
  useEffect(() => { if (stage) stage.playing = playing }, [stage, playing])
  useEffect(() => { if (stage && orbit) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit])
  // the glass is there or not by its opacity, so the world is not built again
  useEffect(() => {
    if (!stage || !built) return
    const b = built.glass.blobs
    if (glass) b.opacity.set(built.clear); else b.opacity.fill(0)
    stage.recolor(built.glass)
  }, [stage, built, glass])

  shakeNow.current = (strength = 1, way = [1, 0]) => {
    if (!stage || !built) return
    built.snow.shake(strength, way)
    rocked.current = { at: stage.time, way, strength }
    if (!playing) setPlaying(true)
    stage.invalidate()
  }

  // how much of the snow lies, said twice a second
  useEffect(() => {
    if (!built) return
    setLying(built.snow.settled)
    const id = setInterval(() => setLying(built.snow.settled), 500)
    return () => clearInterval(id)
  }, [built])

  // a phone shaken in the hand shakes the globe, once the visitor has turned it on (iPhones ask first)
  useEffect(() => {
    if (motion !== 'on') return
    let lastAt = 0, grav: [number, number, number] | null = null
    const on = (e: DeviceMotionEvent) => {
      // some browsers give only the acceleration with gravity in it: take gravity out with a slow average
      const g = e.accelerationIncludingGravity
      let a = e.acceleration as { x: number | null; y: number | null; z: number | null } | null
      if ((!a || a.x == null) && g && g.x != null && g.y != null && g.z != null) {
        grav = grav ? [grav[0] * 0.9 + g.x * 0.1, grav[1] * 0.9 + g.y * 0.1, grav[2] * 0.9 + g.z * 0.1] : [g.x, g.y, g.z]
        a = { x: g.x - grav[0], y: g.y - grav[1], z: g.z - grav[2] }
      }
      if (!a || a.x == null || a.y == null || a.z == null) return
      const m = Math.hypot(a.x, a.y, a.z), now = performance.now()
      if (m < MOTION_FROM || now - lastAt < 250) return
      lastAt = now
      shakeNow.current(Math.min(1, (m - MOTION_FROM) / MOTION_SPAN + 0.35), [a.x >= 0 ? 1 : -1, Math.max(-1, Math.min(1, a.y / 20))])
    }
    window.addEventListener('devicemotion', on)
    return () => window.removeEventListener('devicemotion', on)
  }, [motion])
  const askMotion = async () => {
    if (motion === 'on') { setMotion('off'); return }
    const ask = (window.DeviceMotionEvent as unknown as Motion | undefined)?.requestPermission
    try {
      setMotion(!ask || (await ask()) === 'granted' ? 'on' : 'refused')
    } catch { setMotion('refused') }
  }

  // the address keeps what is on show
  useEffect(() => {
    const q = params()
    q.set('scene', scene)
    if (time) q.set('time', time); else q.delete('time')
    q.set('snow', amount)
    if (glass) q.delete('glass'); else q.set('glass', '0')
    history.replaceState(history.state, '', `${location.pathname}?${q}`)
  }, [scene, time, amount, glass])

  // for verify: the stage and the snow, without clicking
  useEffect(() => {
    if (!stage || !built) return
    window.__globe = { stage, snow: built.snow, globe: built.globe, shake: (s = 1) => shakeNow.current(s) }
    return () => { delete window.__globe }
  }, [stage, built])

  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const press = useRef<{ x: number; y: number; at: number } | null>(null)
  const setOrbitSafe = (f: Orbit | ((o: Orbit) => Orbit)) => setOrbit((o) => (o ? (typeof f === 'function' ? f(o) : f) : o))
  useWheelZoom(canvas, setOrbitSafe as never)
  const waiting = !failed && (!drawn || !ready)
  const backend = stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'
  const start = built && orbit

  return (
    <div className="pb-4">
      <Crumbs here="Snow Globe" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Snow Globe</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          A little scene made of blobs, sealed under a glass dome of water and snow. Shake it and the snow swirls up and
          drifts back down, settling on the roofs, the hats and the ground. Tap the globe or press Shake; on a phone, shake the phone.
        </p>
      </header>
      <Workbench
        viewLabel="The snow globe"
        view={<>
          <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 38%, #3a3550 0%, #1d1a2a 55%, #0f0d17 100%)' }} />
          <canvas
            ref={canvas}
            role="application"
            aria-roledescription="3D view"
            aria-label={`A snow globe holding the ${label.toLowerCase()}. Press Space or Enter to shake it. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.`}
            tabIndex={0}
            data-testid="globe-view"
            className="absolute inset-0 h-full w-full cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset active:cursor-grabbing"
            onPointerDown={(ev) => {
              ev.currentTarget.setPointerCapture(ev.pointerId)
              pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
              press.current = pointers.current.size === 1 ? { x: ev.clientX, y: ev.clientY, at: performance.now() } : null
              if (orbit) drag.current = beginOrbitDrag(pointers.current, ev, orbit)
            }}
            onPointerMove={(ev) => {
              if (pointers.current.has(ev.pointerId)) pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
              const d = drag.current
              if (d) setOrbitSafe(dragOrbit(d, pointers.current, ev))
            }}
            onPointerUp={(ev) => {
              pointers.current.delete(ev.pointerId); drag.current = null
              // a short tap that hardly moved shakes it, toward the side that was tapped
              const p = press.current
              press.current = null
              if (p && performance.now() - p.at < 300 && Math.hypot(ev.clientX - p.x, ev.clientY - p.y) < 6) {
                const r = ev.currentTarget.getBoundingClientRect()
                shakeNow.current(0.75, [(ev.clientX - r.left) / r.width < 0.5 ? -1 : 1, 0.5 - (ev.clientY - r.top) / r.height])
              }
            }}
            onPointerCancel={(ev) => { pointers.current.delete(ev.pointerId); drag.current = null; press.current = null }}
            onKeyDown={(ev) => {
              if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); shakeNow.current(1, [Math.random() < 0.5 ? -1 : 1, 0]); return }
              if (!orbit || !orbitKey(ev, orbit)) return
              ev.preventDefault()
              setOrbitSafe((o) => orbitKey(ev, o) ?? o)
            }}
          />
          {waiting && <LoadingMark testid="globe-loading" />}
          <p role="status" className="sr-only">{waiting ? (stage ? `Making the ${label.toLowerCase()} and its globe…` : 'Starting the splat engine…') : `The ${label.toLowerCase()} under glass.`}</p>
          {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
          {ready && <div className="absolute bottom-3 left-1/2 -translate-x-1/2"><Button primary small onClick={() => shakeNow.current(1, [Math.random() < 0.5 ? -1 : 1, 0.2])} data-testid="globe-shake">Shake it</Button></div>}
          {start && <ZoomBar orbit={orbit} setOrbit={setOrbitSafe as never} onReset={() => setOrbit({ target: [built.globe.center[0], built.globe.center[1] - built.globe.radius * 0.05, built.globe.center[2]], distance: built.globe.radius * 3.3, azimuth: orbit.azimuth, elevation: 14 })} />}
        </>}
        status={<>
          <span>{ready && built ? <><span className="tabular-nums text-ink" data-testid="globe-blobs">{built.blobs.toLocaleString()}</span> blobs and {flakes.toLocaleString()} flakes, <span className="tabular-nums">{Math.round((lying / flakes) * 100)}%</span> of them lying.</> : 'Making it…'}</span>
          <span>On {backend}</span>
        </>}
        tabsLabel="Options"
        tabs={[
          {
            id: 'globe', label: 'Globe', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Inside the globe">
                  <div className="flex flex-wrap gap-1.5" data-testid="globe-scenes">
                    {SCENES.map((s) => <Chip key={s.id} active={scene === s.id} onClick={() => setScene(s.id)}>{s.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">Each is a scene in Diorama too, made of props from Scene Creator's library. The glass is fitted round whatever is inside.</p>
                </Field>
                <TimeControls time={time} onPick={setTime} timed={!!DIORAMAS.find((d) => d.id === scene)?.timed} each="part of the globe" prefix="globe" />
                <div>
                  <Toggle label="Glass" checked={glass} onChange={setGlass} />
                  <p className="mt-1.5 text-xs text-ink-faint">Thousands of nearly clear blobs on the dome, and two brighter streaks where it catches the light.</p>
                </div>
              </div>
            ),
          },
          {
            id: 'snow', label: 'Snow', content: (
              <div className={TAB_SECTIONS}>
                <div className="flex flex-wrap gap-1.5">
                  <Button small onClick={() => shakeNow.current(1, [1, 0.3])}>Shake hard</Button>
                  <Button small onClick={() => shakeNow.current(0.35, [-1, 0])}>Tilt gently</Button>
                  <Button small onClick={() => { built?.snow.lieDown(); stage?.invalidate() }}>Let it all settle</Button>
                </div>
                <Field label="How much snow">
                  <div className="flex flex-wrap gap-1.5" data-testid="globe-amount">
                    {AMOUNTS.map((a) => <Chip key={a.id} active={amount === a.id} onClick={() => setAmount(a.id)}>{a.label}</Chip>)}
                  </div>
                </Field>
                {coarse && (
                  <div>
                    <Toggle label="Shake with the phone" checked={motion === 'on'} onChange={() => { void askMotion() }} />
                    <p className="mt-1.5 text-xs text-ink-faint">{motion === 'refused' ? 'The browser did not allow the motion of the phone to be read. The button and a tap on the globe still shake it.' : 'Reads how the phone moves while this page is open, here in the browser only, to shake the globe when you shake the phone.'}</p>
                  </div>
                )}
                <Field label="Detail">
                  <div className="flex flex-wrap gap-1.5" data-testid="globe-detail">
                    {DETAILS.map((d, i) => <Chip key={d.id} active={detail === i} onClick={() => { setDetail(i as Detail); writeDetail(d.id) }}>{d.label}</Chip>)}
                  </div>
                </Field>
                <div className="flex flex-wrap gap-1.5">
                  <Button small onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</Button>
                </div>
              </div>
            ),
          },
        ]}
      />

      <section aria-labelledby="how-title" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-sm text-ink-faint">How it works</p>
          <h2 id="how-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">Water you can't see</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            The scene is one of Diorama's, cut into blobs as it always is. The dome is the smallest sphere that holds every
            one of them, cut flat at the scene's lowest point, and the glass is a few thousand discs lying on it, each almost
            clear, so you see the scene through two thin layers of them.
          </p>
          <p>
            The snow is a few thousand small flat blobs in water nobody draws. A shake sets the water turning slowly and
            stirs it into swirls that drift and die away over a few seconds. Each flake is dragged toward the water's speed
            plus its own slow fall, so the heavy ones come down first and the light ones hang about. The swirls have no
            place where water piles up or drains away, so the snow spreads through them instead of collecting.
          </p>
          <p>
            Where a flake reaches the scene's own ground while the water is still, it lies there: on the snowman's hat, the
            roof, the presents. It stays until the next shake moves the water fast enough to lift it again.
          </p>
        </div>
      </section>
    </div>
  )
}

/** Where the eye is for a view, for a fire seen through its own hot gas. */
function eyeOf(o: Orbit): [number, number, number] {
  const a = (o.azimuth * Math.PI) / 180, e = (o.elevation * Math.PI) / 180
  return [o.target[0] + o.distance * Math.sin(a) * Math.cos(e), o.target[1] + o.distance * Math.sin(e), o.target[2] + o.distance * Math.cos(a) * Math.cos(e)]
}
