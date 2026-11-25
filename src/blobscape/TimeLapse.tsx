import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import type { Skeleton } from '../splat-engine/rig.ts'
import { unlit } from '../splat-engine/voxel.ts'
import { windAt } from '../splat-engine/skyRecipes.ts'
import { heavenBones, showHeavens } from '../splat-engine/heavens.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field, Toggle } from '../shared/ui.tsx'
import { detailAsked, labelNames, writeDetail } from '../shared/detail.ts'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import type { Actor, CreatureStage } from './creature/stage.ts'
import { DETAIL } from './diorama/scene.ts'
import { DIORAMAS, type Diorama } from './diorama/scenes.ts'
import { SceneWeather } from './diorama/weather.ts'
import { LENGTHS, SEASONS, lightAt, momentAt, nameOf, type Moment } from './timelapse/year.ts'
import { href } from './routes.ts'

declare global {
  interface Window { __timelapse?: { stage: CreatureStage; seconds: number; moment: () => Moment; night: () => boolean } }
}

/** The scenes a year passes over: outdoor ones, with ground for snow to lie on and lamps that wait for the dark. */
const SCENES = [
  { id: 'windmill', label: 'Windmill' },
  { id: 'cabin', label: 'Snowed-in cabin' },
  { id: 'campfire', label: 'Campfire' },
  { id: 'lighthouse', label: 'Lighthouse' },
  { id: 'grove', label: 'Lantern grove' },
] as const

const DETAILS = [{ id: 'light', label: 'Light' }, { id: 'full', label: 'Full' }, { id: 'fine', label: 'Fine' }] as const
type Detail = 0 | 1 | 2

/** How dark it must grow before the lamps come on, and how light before they go out again (apart, so they don't flicker). */
const LAMPS_ON = 0.5, LAMPS_OFF = 0.4

const params = () => new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
const media = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches

interface Cut { d: Diorama; built: Actor; heavens: ReturnType<typeof heavenBones>; fire?: ReturnType<NonNullable<Diorama['fire']>> }
interface Built { key: string; day: Cut; night: Cut; fall: SceneWeather; blobs: number; start: Orbit }

/**
 * Time-lapse (issue #460): one Diorama scene through a day in each of the four seasons, about thirty seconds for the
 * year. The scene is cut with no light baked in, so the live sun and moon of each season's day light it
 * (timelapse/year.ts), the shared weather recipes bring each season's rain and snow, the snow lying builds through
 * winter and melts in spring, and the lamps come on as it grows dark (a second cut, where they wait for the dark).
 */
export function TimeLapse() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState<CreatureStage>()
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState<string>()
  const offscreen = useMemo(() => params().get('offscreen') === '1', [])
  const coarse = useMemo(() => media('(pointer: coarse)'), [])
  const calm = useMemo(() => media('(prefers-reduced-motion: reduce)'), [])
  const [playing, setPlaying] = useState(!calm)
  const [scene, setScene] = useState(() => SCENES.find((s) => s.id === params().get('scene'))?.id ?? SCENES[0].id)
  const [length, setLength] = useState(() => LENGTHS.find((l) => l.id === params().get('length'))?.id ?? LENGTHS[0].id)
  const [detail, setDetail] = useState<Detail>(() => { const asked = detailAsked(DETAILS, labelNames); return asked ? (DETAILS.indexOf(asked) as Detail) : coarse ? 0 : 1 })
  const [shadows, setShadows] = useState(() => params().get('shadows') !== '0')
  const [built, setBuilt] = useState<Built>()
  const [night, setNight] = useState(false)
  const [orbit, setOrbit] = useState<Orbit>()
  const [year, setYear] = useState(0)
  const label = SCENES.find((s) => s.id === scene)!.label
  const seconds = LENGTHS.find((l) => l.id === length)!.seconds
  const secondsNow = useRef(seconds)
  secondsNow.current = seconds
  const shadowsNow = useRef(shadows)
  shadowsNow.current = shadows

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
      }, (e: unknown) => { console.warn(e); setFailed('This browser could not start WebGPU or WebGL 2, which the time-lapse needs.') })
    return () => { gone = true; live?.dispose() }
  }, [offscreen])

  // the scene cut twice with no light baked in, by day and in the dark (its lamps lit), and its weather made once;
  // after a paint, so the waiting mark shows first
  const key = `${scene}|${detail}`
  useEffect(() => {
    if (!stage) return
    const picked = DIORAMAS.find((d) => d.id === scene)!
    const t = setTimeout(() => {
      const spacing = DETAIL[detail].spacing
      const cut = (d: Diorama): Cut => {
        const actor = unlit(() => d.make(spacing))
        return { d, built: actor, heavens: heavenBones(actor.skeleton.bones.map((b) => b.name)), fire: d.fire?.() }
      }
      const day = cut(picked.timed?.('afternoon') ?? picked), dark = cut(picked.timed?.('night') ?? picked)
      // its clouds left out over the scene, so rain and snow come in from over the top of the picture and the view stays open
      const fall = new SceneWeather(picked, { overhead: false })
      setBuilt({ key, day, night: dark, fall, blobs: day.built.blobs.count, start: picked.views[0].orbit })
    }, 30)
    return () => clearTimeout(t)
  }, [stage, key])

  // the cut on show (by day or in the dark) on the stage, posed from the year's place alone
  const ready = built?.key === key
  useEffect(() => {
    if (!stage || !built || !ready) return
    const c = night ? built.night : built.day, { d, fire } = c, fall = built.fall
    const from = stage.time
    stage.setActor(c.built, undefined, [...(fire ? [fire.actor] : []), ...fall.actors])
    let lamps = night, sky = ''
    stage.setPoser((sk: Skeleton, t: number) => {
      const len = secondsNow.current, m = momentAt(t / len)
      d.pose(sk, t)
      fall.pose(t, m.sky)
      // the snow lying is the year's: it builds through winter and melts in spring's first hours
      if (fall.pile(m.snow)) stage.reshape(fall.cover)
      d.blow?.(sk, t, windAt(m.sky, t, d.loop), undefined, m.sky.wind)
      // the scene's own stars only in the dark, put out by cloud; its sun and moon never show (Matt, 2026-11-25: a day
      // goes by in seconds, so the moon only flickered into the sky now and then): the light is still the real sun's and moon's
      showHeavens(sk.size, c.heavens, lamps ? m.sky.clouds : 1)
      for (const b of [...c.heavens.moon, ...c.heavens.sun]) sk.size[b] = 0
      sk.update()
      fall.follow(sk)
      const light = lightAt(m, shadowsNow.current && stage.backend === 'webgpu')
      // the clouds gray with the weather and darken with the night
      if (fall.shade({ ...m.sky, dark: Math.max(m.sky.dark, light.dark * 0.9) })) stage.reshape(fall.actors[0])
      if (fire) {
        fire.under(m.sky, offscreen ? Infinity : 0.1)
        fire.show(t, eyeOf(stage.orbit)); stage.reshape(fire.actor)
      }
      const own = d.lights(t, false)
      stage.setLights([...light.lights, ...(fire ? fire.shine(own, t) : own)], light.ambient)
      // the sky behind, as the season's sun and weather leave it
      const css = `linear-gradient(to bottom, rgb(${light.sky[0].join(',')}), rgb(${light.sky[1].join(',')}))`
      if (css !== sky && backdrop.current) { backdrop.current.style.background = css; sky = css }
      // the lamps come on as it grows dark: the other cut, once this pose is done
      const want = lamps ? light.dark > LAMPS_OFF : light.dark > LAMPS_ON
      if (want !== lamps) { lamps = want; setNight(want) }
    }, from)
  }, [stage, built, ready, night, offscreen])

  // a new scene starts from its own first view
  useEffect(() => { if (built) setOrbit(built.start) }, [built])
  useEffect(() => { if (stage) stage.playing = playing }, [stage, playing])
  useEffect(() => { if (stage && orbit) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit])

  // where in the year it is, said a few times a second
  useEffect(() => {
    if (!stage) return
    const id = setInterval(() => setYear(((stage.time / secondsNow.current) % 1 + 1) % 1), 250)
    return () => clearInterval(id)
  }, [stage])

  /** Goes to a place in the year (0 to 1), keeping the scene's own clock with it. */
  const goTo = (u: number) => {
    if (!stage) return
    stage.seek(u * seconds)
    setYear(u)
  }
  /** Another length keeps the place in the year. */
  const pickLength = (id: typeof length) => {
    const was = seconds, now = LENGTHS.find((l) => l.id === id)!.seconds
    setLength(id)
    if (stage) { secondsNow.current = now; stage.seek(((stage.time / was) % 1) * now) }
  }

  // the address keeps what is on show
  useEffect(() => {
    const q = params()
    q.set('scene', scene)
    if (length === LENGTHS[0].id) q.delete('length'); else q.set('length', length)
    if (shadows) q.delete('shadows'); else q.set('shadows', '0')
    history.replaceState(history.state, '', `${location.pathname}?${q}`)
  }, [scene, length, shadows])

  // for verify: the stage and the year, without clicking
  useEffect(() => {
    if (!stage || !ready) return
    window.__timelapse = { stage, seconds, moment: () => momentAt(stage.time / secondsNow.current), night: () => night }
    return () => { delete window.__timelapse }
  }, [stage, ready, seconds, night])

  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const setOrbitSafe = (f: Orbit | ((o: Orbit) => Orbit)) => setOrbit((o) => (o ? (typeof f === 'function' ? f(o) : f) : o))
  useWheelZoom(canvas, setOrbitSafe as never)
  const waiting = !failed && (!drawn || !ready)
  const backend = stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'
  const moment = momentAt(year)
  const name = nameOf(moment)

  return (
    <div className="pb-4">
      <Crumbs here="Time-lapse" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Time-lapse</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          A whole year over one little scene in about thirty seconds: a day in each season, under the sun as it stands on
          that day, with spring showers, a stormy fall and winter snow that piles up and melts. Drag the year to any moment.
        </p>
      </header>
      <Workbench
        viewLabel="The time-lapse"
        view={<>
          <div ref={backdrop} aria-hidden className="absolute inset-0" style={{ background: '#1d2433' }} />
          <canvas
            ref={canvas}
            role="application"
            aria-roledescription="3D view"
            aria-label={`The ${label.toLowerCase()} through a year. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.`}
            tabIndex={0}
            data-testid="timelapse-view"
            className="absolute inset-0 h-full w-full cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset active:cursor-grabbing"
            onPointerDown={(ev) => {
              ev.currentTarget.setPointerCapture(ev.pointerId)
              pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
              if (orbit) drag.current = beginOrbitDrag(pointers.current, ev, orbit)
            }}
            onPointerMove={(ev) => {
              if (pointers.current.has(ev.pointerId)) pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
              const d = drag.current
              if (d) setOrbitSafe(dragOrbit(d, pointers.current, ev))
            }}
            onPointerUp={(ev) => { pointers.current.delete(ev.pointerId); drag.current = null }}
            onPointerCancel={(ev) => { pointers.current.delete(ev.pointerId); drag.current = null }}
            onKeyDown={(ev) => {
              if (!orbit || !orbitKey(ev, orbit)) return
              ev.preventDefault()
              setOrbitSafe((o) => orbitKey(ev, o) ?? o)
            }}
          />
          {waiting && <LoadingMark testid="timelapse-loading" />}
          <p role="status" className="sr-only">{waiting ? (stage ? `Making the ${label.toLowerCase()} for every season…` : 'Starting the splat engine…') : `The ${label.toLowerCase()} through a year.`}</p>
          {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
          {ready && <div aria-hidden className="pointer-events-none absolute top-3 left-3 rounded-md bg-black/45 px-2.5 py-1 font-display text-lg text-white tabular-nums" data-testid="timelapse-when">{name}</div>}
          {orbit && built && <ZoomBar orbit={orbit} setOrbit={setOrbitSafe as never} onReset={() => setOrbit(built.start)} />}
        </>}
        status={<>
          <span>{ready && built ? <><span className="tabular-nums text-ink" data-testid="timelapse-blobs">{built.blobs.toLocaleString()}</span> blobs, lit by the sun and moon of each season's day.</> : 'Making it…'}</span>
          <span>On {backend}</span>
        </>}
        tabsLabel="Options"
        footer={
          <div className="space-y-2">
            <label className="block text-sm text-ink-muted" htmlFor="timelapse-year">The year: <span className="text-ink">{name}</span></label>
            <input id="timelapse-year" type="range" min={0} max={999} step={1} value={Math.round(year * 1000) % 1000} onChange={(e) => goTo(Number(e.currentTarget.value) / 1000)} aria-valuetext={name} className="w-full accent-[var(--color-accent)]" data-testid="timelapse-scrub" />
            <div className="flex flex-wrap items-center gap-1.5">
              <Button small primary onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</Button>
              {SEASONS.map((s, i) => <Chip key={s.id} active={moment.season === i} onClick={() => goTo(i / 4 + 0.08 / 4)}>{s.label}</Chip>)}
            </div>
          </div>
        }
        tabs={[
          {
            id: 'year', label: 'Year', content: (
              <div className={TAB_SECTIONS}>
                <Field label="The scene">
                  <div className="flex flex-wrap gap-1.5" data-testid="timelapse-scenes">
                    {SCENES.map((s) => <Chip key={s.id} active={scene === s.id} onClick={() => setScene(s.id)}>{s.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">Each is a scene in Diorama too. Its lamps and fires wait for the dark.</p>
                </Field>
                <Field label="A year takes">
                  <div className="flex flex-wrap gap-1.5" data-testid="timelapse-length">
                    {LENGTHS.map((l) => <Chip key={l.id} active={length === l.id} onClick={() => pickLength(l.id)}>{l.label}</Chip>)}
                  </div>
                </Field>
              </div>
            ),
          },
          {
            id: 'view', label: 'View', content: (
              <div className={TAB_SECTIONS}>
                <div>
                  <Toggle label="Shadows from the sun and moon" checked={shadows} onChange={setShadows} />
                  <p className="mt-1.5 text-xs text-ink-faint">{stage && stage.backend !== 'webgpu' ? 'Live shadows need WebGPU, which this browser is not using.' : 'Cast live as the sun crosses the sky; under thick cloud they fade away.'}</p>
                </div>
                <Field label="Detail">
                  <div className="flex flex-wrap gap-1.5" data-testid="timelapse-detail">
                    {DETAILS.map((d, i) => <Chip key={d.id} active={detail === i} onClick={() => { setDetail(i as Detail); writeDetail(d.id) }}>{d.label}</Chip>)}
                  </div>
                </Field>
              </div>
            ),
          },
        ]}
      />

      <section aria-labelledby="how-title" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-sm text-ink-faint">How it works</p>
          <h2 id="how-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">A year from its place alone</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            The scene is cut into blobs with no light painted in, so the light can come from anywhere. Each season is one
            day: late April, mid July, mid October and the shortest day, at a temperate latitude. The sun and moon stand
            where they really would at each moment of that day, so the summer sun climbs high and the winter one barely
            clears the hills, and they light the blobs live, casting shadows as they go.
          </p>
          <p>
            The weather is the same set of recipes every Diorama scene uses: each season's day has a few spells of it, eased
            from one into the next, so a spring dawn is still wet from rain and a fall afternoon blows up into a storm.
            Cloud dims and grays the light and softens the shadows. Snow falls through the winter day and lies deeper as it
            does, then melts away in spring's first hours.
          </p>
          <p>
            Everything is worked out from where in the year it is, nothing from what came before, so dragging the year to a
            moment shows exactly what waiting would. When it grows dark enough, the scene is swapped for a second cut with
            its lamps, lit windows and fires on.
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
