import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../../splat-core/orbit.ts'
import type { Frame } from '../../splat-core/pixel.ts'
import type { Built } from '../../splat-engine/body.ts'
import { compileScene } from '../../splat-engine/sceneDoc.ts'
import type { Stage } from '../../splat-engine/stage.ts'
import { buildVoxels } from '../../splat-engine/voxel.ts'
import { Chip, Field, Slider, Toggle } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS } from '../routes.ts'
import { ZoomBar } from '../Viewport.tsx'
import { useGoals } from '../progress.ts'
import { StageView } from '../build/StageView.tsx'
import { SCENE_SPACING } from '../build/scene.ts'
import { FEW, PALETTES, PIXELS_START, PIXEL_SCENE, RATES, SIZES, SMALL, STILL, changed, colorsIn, lookFor, pixelCode, type PixelOptions } from '../build/pixels.ts'

const SCENE = compileScene(PIXEL_SCENE)
/** How often the picture is looked at for the readout (and the goals). */
const LOOK_EVERY = 500
/** Degrees the view rocks to each side, once a loop, when asked. */
const ROCK = 8

interface Seen { width: number; height: number; colors: number; flips?: number }

declare global { interface Window { __pixels?: { stage: Stage; seen: () => Seen | undefined } } }

export function PixelArt() {
  const [orbit, setOrbit] = useState<Orbit>(SCENE.orbit)
  const [stage, setStage] = useState<Stage>()
  const [opts, setOpts] = useState<PixelOptions>(PIXELS_START)
  const [rock, setRock] = useState(false)
  const set = (o: Partial<PixelOptions>) => setOpts((was) => ({ ...was, ...o }))

  const [built, setBuilt] = useState<Built>()
  useEffect(() => { const t = setTimeout(() => setBuilt(buildVoxels(SCENE.spec(SCENE_SPACING))), 60); return () => clearTimeout(t) }, [])
  // no floor grid: the scene stands on its own ground, and a grid drawn small is only noise
  useEffect(() => { if (stage && built) { stage.setFloor(0); stage.setActor(built) } }, [stage, built])

  const orbitNow = useRef(orbit)
  orbitNow.current = orbit
  useEffect(() => {
    if (!stage || !built) return
    stage.setPoser((sk, t) => {
      SCENE.pose(sk, t)
      stage.setLights(SCENE.lights(t))
      if (rock) stage.orbit = { ...orbitNow.current, azimuth: orbitNow.current.azimuth + Math.sin((t / SCENE.loop) * Math.PI * 2) * ROCK }
    })
  }, [stage, built, rock])

  const look = useMemo(() => lookFor(SCENE.look, opts), [opts])
  useEffect(() => { stage?.setPixels(opts.pixels ? look : undefined, opts.size) }, [stage, opts.pixels, opts.size, look])
  useEffect(() => { if (stage) { stage.step = opts.rate ? 1 / opts.rate : 0; stage.invalidate() } }, [stage, opts.rate])

  // the picture, looked at twice a second: its size, its colors, and how much of it changed while nothing but the light did
  const [seen, setSeen] = useState<Seen>()
  const what = `${JSON.stringify(opts)} ${rock} ${JSON.stringify(orbit)}`
  useEffect(() => {
    if (!stage || !built || !opts.pixels) { setSeen(undefined); return }
    let last: Frame | undefined, gone = false, busy = false
    const id = setInterval(() => {
      if (busy) return
      busy = true
      void stage.pixelFrames().then((f) => {
        busy = false
        if (gone || !f) return
        const flips = last && !rock ? changed(last, f.art) : undefined
        last = f.art
        setSeen((was) => ({ width: f.art.width, height: f.art.height, colors: colorsIn(f.art), flips: flips === undefined ? undefined : Math.max(flips, was?.flips === undefined ? 0 : was.flips * 0.5) }))
      }, () => { busy = false })
    }, LOOK_EVERY)
    return () => { gone = true; clearInterval(id) }
  }, [stage, built, what])

  useEffect(() => {
    if (!stage) return
    window.__pixels = { stage, seen: () => seen }
    return () => { delete window.__pixels }
  })

  const done = useGoals('pixel-art', {
    small: opts.pixels && !!seen && seen.width <= SMALL,
    few: opts.pixels && !!seen && seen.colors <= FEW,
    steady: opts.pixels && !rock && seen?.flips !== undefined && seen.flips <= STILL,
  })
  const motion = (r: number) => (r ? `${r} a second` : 'Smooth')

  return (
    <LessonShell
      id="pixel-art"
      intro={<p>The pixel scenes are blobs drawn small and snapped to a few colors. That sounds easy, until the light moves. What does pixel art need from a renderer that a photo doesn&rsquo;t?</p>}
      view={
        <div className="relative h-full">
          <StageView
            orbit={orbit}
            setOrbit={setOrbit}
            onStage={setStage}
            label={`The cottage at dusk, its lantern flickering, ${opts.pixels ? `drawn as pixel art ${seen ? `${seen.width} by ${seen.height} pixels in ${seen.colors} colors` : ''}` : 'drawn as blobs'}${rock ? ', the view rocking' : ''}.`}
            waiting={built ? undefined : 'Cutting the scene into blobs…'}
          />
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(SCENE.orbit)} />
        </div>
      }
      caption={
        <p data-testid="pixel-readout">
          {!opts.pixels ? (
            <>Drawn as <span className="tabular-nums text-ink">{(built?.blobs.count ?? 0).toLocaleString()}</span> blobs, at the screen&rsquo;s own pixels.</>
          ) : !seen ? (
            <>Looking at the picture…</>
          ) : (
            <>
              A picture <span className="tabular-nums text-ink">{seen.width} × {seen.height}</span> pixels in <span className="tabular-nums text-ink">{seen.colors}</span> colors.{' '}
              {rock ? 'While the view rocks, every pixel can change.' : seen.flips === undefined ? '' : <>As the lantern flickers, <span className="tabular-nums text-ink">{(seen.flips * 100).toFixed(2)}%</span> of its pixels change color.</>}
            </>
          )}
        </p>
      }
      groups={[
        {
          id: 'pixels',
          title: 'Pixels',
          note: 'drawn small',
          content: (
            <div className="flex flex-col gap-3">
              <Toggle label="Draw in pixels" checked={opts.pixels} onChange={(v) => set({ pixels: v })} />
              <Field label="Screen pixels to one">
                <div className="flex flex-wrap gap-1.5">
                  {SIZES.map((n) => <Chip key={n} active={opts.size === n} onClick={() => set({ size: n })}>{n}</Chip>)}
                </div>
              </Field>
            </div>
          ),
        },
        {
          id: 'colors',
          title: 'Colors',
          note: 'snapped to a palette',
          content: (
            <div className="flex flex-col gap-3">
              <Field label="Palette">
                <div className="flex flex-wrap gap-1.5">
                  {PALETTES.map((p) => <Chip key={p.id} active={opts.palette === p.id} onClick={() => set({ palette: p.id })}>{p.label}</Chip>)}
                </div>
              </Field>
              <Slider label="Dither" value={opts.dither} min={0} max={1} step={0.05} onChange={(v) => set({ dither: v })} format={(v) => v.toFixed(2)} />
              <Toggle label="Outline" checked={opts.outline} onChange={(v) => set({ outline: v })} />
              <Toggle label="Lines inside" checked={opts.edges} onChange={(v) => set({ edges: v })} />
            </div>
          ),
        },
        {
          id: 'motion',
          title: 'Motion',
          note: 'from frame to frame',
          content: (
            <div className="flex flex-col gap-3">
              <Toggle label="Steady pixels" checked={opts.steady} onChange={(v) => set({ steady: v })} />
              <Field label="Poses">
                <div className="flex flex-wrap gap-1.5">
                  {RATES.map((r) => <Chip key={r} active={opts.rate === r} onClick={() => set({ rate: r })}>{motion(r)}</Chip>)}
                </div>
              </Field>
              <Toggle label="Rock the view" checked={rock} onChange={setRock} />
            </div>
          ),
        },
      ]}
      goals={LESSON_GOALS['pixel-art']}
      done={done}
      scene={() => (built ?? buildVoxels(SCENE.spec(SCENE_SPACING))).blobs}
      explainTitle="Small, few colors, and the same from frame to frame"
      formula={{
        eq: <>pixel = nearest(palette, color)</>,
        terms: [
          ['color', 'what the blobs add up to in one small pixel, lit as it is this frame'],
          ['palette', 'the few colors the picture may use'],
          ['nearest', 'the palette color closest to it, measured as the eye sees color'],
        ],
      }}
      explain={
        <>
          <p>
            Pixel mode draws the scene into a small picture, a few screen pixels to each of its own, then turns every pixel into
            one palette color: the nearest, by how far apart the eye finds two colors rather than by their numbers. Where no
            color is near, dither sets two neighbors in a pattern that mixes to something between. An outline and lines inside
            are drawn where colors jump, as a pixel artist would.
          </p>
          <p>
            A still picture is the easy part. A pixel sitting halfway between two palette colors flips to the other one when the
            light wavers a little, and a whole wall of them twinkles. Steady pixels let each pixel keep the color it had last
            frame unless another is clearly closer: real change still shows, flicker doesn&rsquo;t.
          </p>
          <p>
            Moving the view moves every edge a fraction of a pixel each frame, so edges crawl. Holding each pose for an eighth or
            a twelfth of a second, as drawn animation does, gives the eye whole steps instead. The renderer has to help with all
            of it, because each frame on its own is right: it is the change between frames that reads as wrong.
          </p>
        </>
      }
      code={{
        title: 'This picture, as code',
        note: (
          <>
            <p>The cottage from the last lesson, drawn with the settings you chose, with the engine package.</p>
            <p>Install it with <code>npm install @blobscape/engine three</code>.</p>
          </>
        ),
        source: pixelCode(opts),
      }}
    />
  )
}
