import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import type { Built } from '../splat-engine/body.ts'
import { daylight, sunTimes, type Daylight, type SkyPlace } from '../splat-engine/daylight.ts'
import type { Skeleton } from '../splat-engine/rig.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field, Slider, Toggle } from '../shared/ui.tsx'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import { href } from './routes.ts'
import type { CreatureStage } from './creature/stage.ts'
import { SCENES, dayStage, lampAt } from './daynight/scene.ts'
import { SEASONS, seasonFrom, type Season } from './daynight/season.ts'
import { facing, makeStars, paintSky, upTimes } from './daynight/sky.ts'
import { clockLabel, compass, hourFrom } from './daynight/words.ts'

const DETAIL = [
  { id: 'chunky', label: 'Chunky', spacing: 0.036 },
  { id: 'medium', label: 'Medium', spacing: 0.027 },
  { id: 'fine', label: 'Fine', spacing: 0.021 },
] as const
/** How long a whole day takes to play, in seconds. */
const SPEEDS = [
  { id: 60, label: 'A day a minute' },
  { id: 180, label: 'In three minutes' },
  { id: 720, label: 'In twelve minutes' },
]
/** What a season changes, said under its chips. */
const SEASON_SAYS: Record<Season, string> = {
  spring: 'The leafy trees are in blossom and petals drift down. Fireflies come out at night.',
  summer: 'The trees are in full leaf, and fireflies come out at night.',
  fall: 'The leaves have turned and are coming down. The fireflies are gone.',
  winter: 'The leafy trees are bare, and snow falls and lies on everything the sky can reach.',
}
const MOONS = [
  { id: 0, label: 'New' },
  { id: 0.12, label: 'Crescent' },
  { id: 0.25, label: 'Half' },
  { id: 0.5, label: 'Full' },
]
const STARS = makeStars(1800)
/** How dark a shadow is here: the scene is solid things under a sun, so a wall one blob thick should block nearly all of it. */
const SHADOW_DENSITY = 5
/** About how many frames the light on a blob takes to change: long enough to hide a shadow edge stepping over it, short enough that a lamp still snaps on. */
const LIGHT_EASE = 8

/** An hour to see a moon that rises at `rise`: a while after it clears the horizon, or, if the sun is still up then, the darkest hour it is up. */
function nightHour(place: SkyPlace, rise: number, set?: number): number {
  const len = set === undefined ? 12 : ((set - rise) % 24 + 24) % 24
  let best = rise + 1, dark = -1
  for (let h = rise + 0.75; h < rise + len - 0.5; h += 0.25) {
    const s = daylight(h, place)
    if (s.moonHeight > 8 && s.dark > dark + 0.02) { dark = s.dark; best = h }
  }
  return best % 24
}

declare global {
  interface Window {
    __daynight?: {
      stage: CreatureStage
      blobs: () => number
      hour: () => number
      setHour: (h: number) => void
      /** The lights last sent to the engine: how many, and how many of them are lamps. */
      lights: () => { count: number; lamps: number; sun: boolean; moon: boolean }
    }
  }
}

/**
 * Day and Night: a cabin in a clearing through a whole day. The scene is built with no light in its colors; the sun,
 * the moon, the sky and the lamps light it live through the engine, so shadows turn and stretch with the hour, the
 * windows come on at dusk, and the birds give way to fireflies.
 */
export function DayNight() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const skyCanvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<CreatureStage>()
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState<string>()
  const params = useMemo(() => new URLSearchParams(typeof location === 'undefined' ? '' : location.search), [])
  const offscreen = params.get('offscreen') === '1', webgl = params.get('webgl') === '1'
  const calm = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const phone = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches, [])
  const [sceneId, setSceneId] = useState(() => (SCENES.some((s) => s.id === params.get('scene')) ? params.get('scene')! : SCENES[0].id))
  const scene = SCENES.find((s) => s.id === sceneId)!

  // the hour lives in a ref, because the view reads it every frame; the page hears of it a few times a second
  const hourNow = useRef(hourFrom(params.get('hour')) ?? (calm ? 19.5 : 16))
  const [hour, setHourShown] = useState(hourNow.current)
  const [running, setRunning] = useState(!calm && !offscreen && params.get('hour') === null)
  const [length, setLength] = useState(60)
  const [season, setSeason] = useState<Season>(() => seasonFrom(params.get('season')))
  const day = useMemo(() => dayStage(scene, season), [scene, season])
  const [latitude, setLatitude] = useState(45)
  const [moon, setMoon] = useState(0.5)
  const place = useMemo<SkyPlace>(() => ({ latitude, day: SEASONS.find((s) => s.id === season)!.day, moon }), [latitude, season, moon])
  const [shadows, setShadows] = useState<boolean>()
  const [detail, setDetail] = useState<(typeof DETAIL)[number]['id']>(phone ? 'chunky' : 'medium')
  const [view, setView] = useState(scene.views[0].id)
  const [orbit, setOrbit] = useState<Orbit>(scene.views[0].orbit)

  useEffect(() => {
    let live: CreatureStage | undefined, gone = false
    import('./creature/stage.ts')
      .then(({ CreatureStage }) => CreatureStage.start(canvas.current!, { offscreen, webgl, lights: true, shadowDensity: SHADOW_DENSITY }))
      .then((s) => {
        if (gone) { s.dispose(); return }
        live = s
        s.onFirstFrame = () => setDrawn(true)
        s.setFloor(0)
        // a shadow's edge fades across a blob over a few frames instead of popping; off where a check draws a moment twice and compares
        s.setLightEase(params.get('ease') !== null ? Number(params.get('ease')) || 0 : offscreen ? 0 : LIGHT_EASE)
        // shadows are marched for every blob each frame the light moves: on from the start where compute passes do it
        setShadows(params.get('shadows') === null ? s.backend === 'webgpu' : params.get('shadows') === '1')
        setStage(s)
      }, (e: unknown) => { console.warn(e); setFailed('This browser could not start WebGPU or WebGL 2, which the scene needs.') })
    return () => { gone = true; live?.dispose() }
  }, [offscreen, webgl, params])

  // cut after a paint, so the loading mark shows first
  const [built, setBuilt] = useState<{ scene: string; season: Season; detail: string; actor: Built }>()
  useEffect(() => {
    const spacing = DETAIL.find((d) => d.id === detail)!.spacing
    const t = setTimeout(() => setBuilt({ scene: scene.id, season, detail, actor: day.make(spacing) }), 30)
    return () => clearTimeout(t)
  }, [day, scene, season, detail])
  const cutting = built?.detail !== detail || built?.scene !== scene.id || built?.season !== season

  // what the poser reads each frame, kept in refs so a change needs no new poser
  const live = useRef({ place, shadows: !!shadows, running, length, orbit })
  live.current = { place, shadows: !!shadows, running, length, orbit }
  const sent = useRef({ count: 0, lamps: 0, sun: false, moon: false })
  const lastTick = useRef(0)

  const paint = useCallback((sky: Daylight) => {
    const c = skyCanvas.current
    if (!c) return
    const w = Math.round(c.clientWidth * Math.min(2, window.devicePixelRatio || 1)), h = Math.round(c.clientHeight * Math.min(2, window.devicePixelRatio || 1))
    if (!w || !h) return
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
    paintSky(c.getContext('2d')!, w, h, live.current.orbit, sky, hourNow.current, live.current.place, STARS)
  }, [])

  // the scene on show is the one that has been cut: while the next is cut, the old one keeps playing
  const shown = useMemo(() => (built ? SCENES.find((s) => s.id === built.scene)! : scene), [built, scene])
  const seasonShown = built?.season ?? season
  const dayShown = useMemo(() => (shown === scene && seasonShown === season ? day : dayStage(shown, seasonShown)), [shown, scene, seasonShown, season, day])
  const poser = useCallback((sk: Skeleton, t: number) => {
    const s = live.current
    // the day moves on by the wall clock, however fast the scene's own clock runs
    const now = performance.now()
    if (s.running && lastTick.current) hourNow.current = (hourNow.current + (Math.min(0.1, (now - lastTick.current) / 1000) * 24) / s.length) % 24
    lastTick.current = now
    const hr = hourNow.current, sky = daylight(hr, s.place)
    dayShown.pose(sk, t, hr, sky)
    const { lights, ambient } = dayShown.lights(t, hr, sky, s.shadows)
    stageNow.current?.setLights(lights, ambient)
    // far things take the horizon's color, as they do through air
    stageNow.current?.setFog(sky.horizon, s.orbit.distance + 1.5, s.orbit.distance + 12)
    sent.current = { count: lights.length, lamps: lights.filter((l) => 'position' in l).length, sun: sky.sunColor[0] > 0.002, moon: sky.moonColor[2] > 0.002 }
    paint(sky)
  }, [dayShown, paint])
  const stageNow = useRef<CreatureStage | undefined>(undefined)
  stageNow.current = stage

  // a new level of detail keeps the moment
  useEffect(() => {
    if (!stage || !built) return
    stage.setActor(built.actor)
    stage.setPoser(poser, stage.time)
  }, [stage, built, poser])
  // the scene sways and flies while it is watched; under reduced motion it holds still unless the day is played
  useEffect(() => { if (stage) stage.playing = !calm || running }, [stage, calm, running])
  useEffect(() => { if (stage) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit])
  // anything that changes the light or the sky while nothing else redraws it: pose again at the same moment
  const refresh = useCallback(() => { const s = stageNow.current; if (s && built) s.setPoser(poser, s.time) }, [built, poser])
  useEffect(() => { refresh() }, [refresh, place, shadows, orbit, running])
  // the sky is painted when the scene is posed, so a view that changed shape while nothing moves needs posing again
  useEffect(() => {
    const c = skyCanvas.current
    if (!c || typeof ResizeObserver === 'undefined') return
    const seen = new ResizeObserver(() => refresh())
    seen.observe(c)
    return () => seen.disconnect()
  }, [refresh])
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setHourShown(hourNow.current), 120)
    return () => clearInterval(id)
  }, [running])
  const setHour = useCallback((h: number) => { hourNow.current = ((h % 24) + 24) % 24; setHourShown(hourNow.current); refresh() }, [refresh])

  // For verify: the stage, and the hour without dragging
  useEffect(() => {
    if (!stage || !built) return
    window.__daynight = { stage, blobs: () => stage.blobCount, hour: () => hourNow.current, setHour, lights: () => sent.current }
    return () => { delete window.__daynight }
  }, [stage, built, setHour])

  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  useWheelZoom(canvas, setOrbit)
  const pick = (id: string) => { setView(id); setOrbit(scene.views.find((v) => v.id === id)!.orbit) }
  const pickScene = (id: string) => {
    const next = SCENES.find((s) => s.id === id)!
    setSceneId(id); setView(next.views[0].id); setOrbit(next.views[0].orbit)
    const url = new URL(location.href)
    if (id === SCENES[0].id) url.searchParams.delete('scene'); else url.searchParams.set('scene', id)
    history.replaceState(history.state, '', url)
  }

  const pickSeason = (id: Season) => {
    setSeason(id)
    const url = new URL(location.href)
    if (id === 'summer') url.searchParams.delete('season'); else url.searchParams.set('season', id)
    history.replaceState(history.state, '', url)
  }

  const sky = useMemo(() => daylight(hour, place), [hour, place])
  const times = useMemo(() => sunTimes(place), [place])
  const moonUp = useMemo(() => upTimes((h) => daylight(h, place).moonHeight), [place])
  const lit = shown.lamps.filter((l) => lampAt(l, hour, sky) > 0).length
  const sunSays = sky.sunHeight > 0
    ? `The sun is ${Math.round(sky.sunHeight)}° up in the ${compass(sky.sun)}`
    : sky.moonHeight > 0 && sky.moonLit > 0.02 ? `The sun is down and the moon is ${Math.round(sky.moonHeight)}° up in the ${compass(sky.moon)}` : sky.moonLit > 0.02 ? 'The sun is down and so is the moon' : 'The sun is down and the moon is new'
  const moonSays = moon === 0 ? 'A new moon is up with the sun and dark, so it does not show.'
    : !moonUp.up ? 'The moon does not rise here today.'
      : moonUp.rise === undefined || moonUp.set === undefined ? 'The moon does not set here today.'
        : `This moon rises at ${clockLabel(moonUp.rise)} and sets at ${clockLabel(moonUp.set)}${sky.moonHeight > 0 ? `; now it is ${Math.round(sky.moonHeight)}° up in the ${compass(sky.moon)}` : '; now it is down'}.`
  // a new phase puts the moon somewhere else in the sky: turn to it if it is up, so it does not just vanish
  const pickMoon = (age: number) => {
    setMoon(age)
    const there = daylight(hourNow.current, { ...place, moon: age })
    if (age > 0 && there.moonHeight > 2) setOrbit((o) => facing(there.moon, o))
  }
  const daySays = times.set - times.rise >= 24 ? 'The sun does not set here today.' : times.set === times.rise ? 'The sun does not rise here today.' : `Sunrise ${clockLabel(times.rise)}, sunset ${clockLabel(times.set)}.`
  const waiting = !failed && (!drawn || !built)
  const backend = stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'

  return (
    <div className="pb-4">
      <Crumbs here="Day and Night" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Day and Night</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          A cabin in a clearing, or a few city blocks, through a whole day in any season. Drag the time and the sun crosses the sky,
          shadows turn and stretch, the windows come on at dusk, and the birds give way to fireflies and stars. Pick a season and
          the trees blossom, turn or stand bare under falling snow.
        </p>
      </header>
      <Workbench
        viewLabel={`${shown.label}, ${SEASONS.find((s) => s.id === seasonShown)!.label.toLowerCase()}`}
        view={<>
          <canvas ref={skyCanvas} aria-hidden className="absolute inset-0 h-full w-full" data-testid="daynight-sky" />
          <canvas
            ref={canvas}
            role="application"
            aria-roledescription="3D view"
            aria-label={`${shown.about}, in ${seasonShown}, at ${clockLabel(hour)}. ${sunSays}. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.`}
            tabIndex={0}
            data-testid="daynight-view"
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
          {(waiting || cutting) && !failed && <LoadingMark testid="daynight-loading" />}
          <p role="status" className="sr-only">{waiting ? (stage ? 'Building the scene…' : 'Starting the splat engine…') : cutting ? 'Cutting the scene…' : ''}</p>
          {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
          <p className="pointer-events-none absolute top-3 left-3 rounded-full bg-black/60 px-3 py-1 text-sm font-medium text-white tabular-nums max-sm:top-2 max-sm:left-2" data-testid="daynight-clock">{clockLabel(hour)}</p>
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => pick(view)} />
        </>}
        status={<>
          <span>{built ? <><span className="tabular-nums text-ink" data-testid="daynight-blobs">{built.actor.blobs.count.toLocaleString()}</span> blobs, none with light in its color.</> : 'Building the scene…'}</span>
          <span data-testid="daynight-says">{sunSays}{lit ? `, ${lit} of ${shown.lamps.length} lights on` : ''}.</span>
        </>}
        tabsLabel="Options"
        tabs={[
          {
            id: 'time', label: 'Time', content: (
              <div className={TAB_SECTIONS}>
                <div className="grid gap-3">
                  <Slider label="Time of day" value={Math.round(hour * 12) / 12} min={0} max={24} step={1 / 12} onChange={(v) => { setRunning(false); setHour(v) }} format={clockLabel} hint={daySays} />
                  <div className="flex flex-wrap gap-1.5" data-testid="daynight-jumps">
                    {[['Sunrise', times.rise + 0.4], ['Noon', 12], ['Sunset', times.set - 0.4], ['Dusk', times.set + 0.55], ['Midnight', 0]].map(([label, h]) => (
                      <Button small key={label} onClick={() => { setRunning(false); setHour(h as number) }}>{label}</Button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button small primary onClick={() => setRunning((r) => !r)} data-testid="daynight-play">{running ? 'Stop the day' : 'Play the day'}</Button>
                    <span className="text-xs text-ink-faint">{running ? 'The clock is running.' : 'The clock is stopped.'}</span>
                  </div>
                  <Field label="A whole day">
                    <div className="flex flex-wrap gap-1.5">
                      {SPEEDS.map((s) => <Chip key={s.id} active={length === s.id} onClick={() => setLength(s.id)}>{s.label}</Chip>)}
                    </div>
                  </Field>
                </div>
              </div>
            ),
          },
          {
            id: 'season', label: 'Season', content: (
              <div className={TAB_SECTIONS}>
                <div className="grid gap-3">
                  <Field label="Season">
                    <div className="flex flex-wrap gap-1.5" data-testid="daynight-seasons">
                      {SEASONS.map((s) => <Chip key={s.id} active={season === s.id} onClick={() => pickSeason(s.id)}>{s.label}</Chip>)}
                    </div>
                    <p className="mt-1.5 text-xs text-ink-faint" data-testid="daynight-season">{SEASON_SAYS[season]}</p>
                  </Field>
                  <Slider label="Latitude" value={latitude} min={0} max={70} step={1} onChange={setLatitude} format={(v) => `${v}° north`} hint={`${daySays} The season sets the sun's path as well: low and short in winter, high and long in summer.`} />
                </div>
                <Field label="Moon">
                  <div className="flex flex-wrap gap-1.5">
                    {MOONS.map((m) => <Chip key={m.id} active={moon === m.id} onClick={() => pickMoon(m.id)}>{m.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint" data-testid="daynight-moon">{moonSays} The moon's phase is where it stands from the sun, so each phase keeps its own hours: a full moon is up all night, a half moon is high at sunset and gone by midnight.</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button small disabled={!(sky.moonHeight > 0)} onClick={() => setOrbit((o) => facing(sky.moon, o))}>Look at the moon</Button>
                    {moonUp.rise !== undefined && <Button small onClick={() => { setRunning(false); const h = nightHour(place, moonUp.rise!, moonUp.set); setHour(h); setOrbit((o) => facing(daylight(h, place).moon, o)) }}>Go to when it is up</Button>}
                  </div>
                </Field>
              </div>
            ),
          },
          {
            id: 'view', label: 'View', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Scene">
                  <div className="flex flex-wrap gap-1.5" data-testid="daynight-scenes">
                    {SCENES.map((s) => <Chip key={s.id} active={sceneId === s.id} onClick={() => pickScene(s.id)}>{s.label}</Chip>)}
                  </div>
                </Field>
                <Field label="View">
                  <div className="flex flex-wrap gap-1.5">
                    {scene.views.map((v) => <Chip key={v.id} active={view === v.id} onClick={() => pick(v.id)}>{v.label}</Chip>)}
                  </div>
                </Field>
                <div>
                  <Toggle label="Shadows from the sun, the moon and a lamp" checked={!!shadows} onChange={setShadows} />
                  <p className="mt-1.5 text-xs text-ink-faint">{stage?.backend === 'webgl' ? 'This browser draws with WebGL 2, where shadows cost more: turn them off if the view stutters.' : 'Worked out again for every blob each time a light moves.'}</p>
                </div>
                <Field label="Detail">
                  <div className="flex flex-wrap gap-1.5">
                    {DETAIL.map((d) => <Chip key={d.id} active={detail === d.id} onClick={() => setDetail(d.id)}>{d.label}</Chip>)}
                  </div>
                </Field>
              </div>
            ),
          },
        ]}
      />

      <section aria-labelledby="how-title" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-sm text-ink-faint">How it's lit</p>
          <h2 id="how-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">One scene, lit again every frame</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            Most splat scenes carry their light in their colors: a photo of noon stays noon. These are built with no light at all.
            Each blob holds only its own paint, and its color on screen is that paint times the light that reaches it right now.
          </p>
          <p>
            The sun follows its real path for the latitude and the season, and its light crosses more air the lower it stands, so it
            reddens and fades toward the horizon. The sky gives a second, softer light from everywhere, blue by day and dim at night.
            For shadows, every blob is dropped into a coarse grid each frame, and each blob looks through that grid toward the sun to
            see what is in the way. Move the sun and every shadow follows. The moon and the lantern cast theirs the same way.
          </p>
          <p>
            A season is the same description with a few lines changed: what the leafy trees wear, the grass, and what falls. The
            petals, leaves and snowflakes each come down somewhere of their own, land on whatever is under them, lie a while and go.
            The snow on the roofs and the pines is laid where the sky can reach when the scene is cut.
          </p>
          <p>
            The lit windows, the lamps and the fireflies give their own light, so they stay bright when everything round
            them goes dark. In the city the windows come on a group at a time, offices empty through the evening and a few rooms
            burn till morning. The sky behind is painted from the same numbers: the sun and moon sit where the light comes from, and the
            stars turn about the pole.
          </p>
          <p>
            Blobscape's own splat engine draws it here on {backend}. The lights and their shadows are the ones
            in <a href={href({ page: 'dungeon' })} className="underline decoration-rule underline-offset-2 hover:text-accent">Dungeon Run</a>, and
            the scene is written as data, like the ones in <a href={href({ page: 'diorama' })} className="underline decoration-rule underline-offset-2 hover:text-accent">Pixel Diorama</a>.
          </p>
        </div>
      </section>
    </div>
  )
}
