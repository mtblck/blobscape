import { useEffect, useMemo, useRef, useState } from 'react'
import { Blobs } from '../../splat-core/blobs.ts'
import { Slider, Toggle } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS } from '../routes.ts'
import { useGoals } from '../progress.ts'
import { DRIFT, H, W, draw, fence, measure, truthSteps, type Blob2, type Measures, type Picture } from '../shimmer/fence.ts'

/** The drift's period, seconds, and how often it draws: a fence this small redraws on the CPU. */
const PERIOD = 8
const FPS = 15
/** Points a side per pixel for the truth on screen (the measures use more). */
const SHOWN_SUPER = 4

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** The fence as 3D blobs for the sandbox: flat, standing up in z = 0. */
function asBlobs(f: readonly Blob2[]): Blobs {
  const b = new Blobs(f.length)
  for (const p of f) b.push({ center: [p.x, p.y, 0], scale: [p.sx, p.sy, 0.005], quat: [0, 0, Math.sin(p.angle / 2), Math.cos(p.angle / 2)], color: p.color, opacity: p.opacity })
  return b
}

const pct = (v: number) => `${Math.round(v * 100)}%`
/** Small blinks get a decimal, so 1.8% doesn't read as the 2% a goal asks to get under. */
const blinkPct = (v: number) => (v < 0.1 ? `${(Math.floor(v * 1000) / 10).toFixed(1)}%` : pct(v))

export function Shimmer() {
  const blobs = useMemo(() => fence(), [])
  const [distance, setDistance] = useState(2)
  const [blur, setBlur] = useState(0)
  const [fade, setFade] = useState(false)
  const [slide, setSlide] = useState(0)
  const [drift, setDrift] = useState(false)
  // drift starts on unless motion is turned down; set after hydration
  useEffect(() => { if (!reduceMotion()) setDrift(true) }, [])

  // The drift slides the fence to and fro a few pixels, a little down as well as across
  useEffect(() => {
    if (!drift) return
    const t0 = performance.now() - (Math.asin(Math.max(-1, Math.min(1, slide / DRIFT))) / (2 * Math.PI)) * PERIOD * 1000
    const id = setInterval(() => setSlide(DRIFT * Math.sin((2 * Math.PI * (performance.now() - t0)) / (PERIOD * 1000))), 1000 / FPS)
    return () => clearInterval(id)
    // restarts only when it's switched on or off, picking up from where the fence is
  }, [drift])

  // Measures take a moment (the truth is 64 points a pixel at eight steps), so they follow the settings once they rest
  const truthCache = useRef(new Map<number, Float32Array[]>())
  const [m, setM] = useState<(Measures & { key: string }) | null>(null)
  const key = `${distance}|${blur}|${fade}`
  useEffect(() => {
    const id = setTimeout(() => {
      let real = truthCache.current.get(distance)
      if (!real) { real = truthSteps(blobs, distance); truthCache.current.set(distance, real) }
      setM({ ...measure(blobs, { distance, blur, fade }, real), key })
    }, 120)
    return () => clearTimeout(id)
  }, [blobs, distance, blur, fade, key])
  const now = m?.key === key ? m : null

  const real = useMemo(() => draw(blobs, { distance, dx: slide, dy: slide / 2, blur: 0, fade: false }, SHOWN_SUPER), [blobs, distance, slide])
  const yours = useMemo(() => draw(blobs, { distance, dx: slide, dy: slide / 2, blur, fade }), [blobs, distance, slide, blur, fade])

  const far = distance >= 6
  const done = useGoals('shimmer', {
    blink: !!now && blur < 0.1 && now.flicker >= 0.12,
    calm: !!now && far && blur >= 0.1 && now.flicker < 0.04,
    heavy: !!now && far && blur >= 0.1 && !fade && now.weight >= 1.8,
    both: !!now && distance >= 7 && fade && now.flicker < 0.02 && Math.abs(now.weight - 1) <= 0.05,
  })

  const how = blur < 0.05 ? 'each pixel sampled at its middle' : `blurred by ${blur.toFixed(2)} px${fade ? ' and faded to match' : ''}`

  return (
    <LessonShell
      id="shimmer"
      intro={<p>A wire fence drawn as blobs, on pixels big enough to see. Send it into the distance and watch it as it drifts. What goes wrong when a blob is smaller than a pixel, and what does it cost to fix?</p>}
      view={
        <div className="grid h-full grid-cols-2 divide-x divide-rule-soft">
          <PixelView pic={real} title="What the pixels really cover" testId="view-real"
            label={`The fence ${distance.toFixed(1)} meters away, each pixel the average of what it covers.`} />
          <PixelView pic={yours} title="Drawn" testId="view-drawn"
            label={`The same fence drawn as a renderer does: ${how}.`} />
        </div>
      }
      caption={
        <p className="tabular-nums" data-testid="shimmer-readout">
          {now ? (
            <>Blink <b className="text-ink">{blinkPct(now.flicker)}</b> as it slides a pixel; it covers <b className="text-ink">{pct(now.weight)}</b> of what the real fence does.</>
          ) : (
            <>Measuring…</>
          )}
        </p>
      }
      groups={[
        {
          id: 'distance',
          title: 'Fence',
          note: 'how far away',
          content: (
            <>
              <Slider label="Distance" value={distance} min={1} max={8} step={0.1} onChange={setDistance} format={(v) => `${v.toFixed(1)} m`} />
              <Toggle label="Drift" checked={drift} onChange={setDrift} />
              <Slider label="Slide" value={Number(slide.toFixed(2))} min={-DRIFT} max={DRIFT} step={0.05} onChange={(v) => { setDrift(false); setSlide(v) }} format={(v) => `${v.toFixed(2)} px`} />
            </>
          ),
        },
        {
          id: 'blur',
          title: 'Blur',
          note: 'added to every blob on screen',
          content: <Slider label="Blur" value={blur} min={0} max={1} step={0.05} onChange={setBlur} format={(v) => `${v.toFixed(2)} px`} />,
        },
        {
          id: 'fade',
          title: 'Fade',
          note: 'for blurred blobs',
          content: <Toggle label="Fade each blob by as much as the blur spread it" checked={fade} onChange={setFade} />,
        },
      ]}
      goals={LESSON_GOALS['shimmer']}
      done={done}
      scene={() => asBlobs(blobs)}
      explainTitle="A pixel looks at one point"
      formula={{
        eq: <>α′ = α · √(det Σ ÷ det Σ′)</>,
        terms: [
          ['Σ', 'the blob’s footprint on screen'],
          ['Σ′', 'the same footprint after the blur'],
          ['α′', 'the opacity it’s drawn with, faded by how much the blur spread it'],
        ],
      }}
      explain={
        <>
          <p>
            A renderer works out each blob at the middle of each pixel. A wire thinner than a pixel is caught when it passes over a
            middle and missed when it falls between two, so as it slides it blinks on and off. A capture is full of blobs like that:
            fine twigs, hair and far-off detail shrink below a pixel as soon as you step back from where the photos were taken.
          </p>
          <p>
            Most splat renderers blur every blob on screen a little (the original method adds 0.3 square pixels), so no blob is
            thinner than about a pixel and none can fall between the middles. Up close nothing changes. Far away a wire becomes a
            pixel wide but stays as solid as before, so thin things go thick and bright. Fading each blob by as much as the blur spread
            it keeps its total right: that's the 2D filter from Mip-Splatting, and the antialiased mode in Spark and gsplat. A capture
            should be drawn the way it was trained, though: one trained without the fade comes out too faint with it, so the fade is a
            choice made with the capture, not a switch to flip on any of them.
          </p>
        </>
      }
    />
  )
}

/** A picture drawn pixel by pixel and shown big, square pixels and all. */
function PixelView({ pic, title, testId, label }: { pic: Picture; title: string; testId: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current!
    const img = new ImageData(W, H)
    const to8 = (v: number) => Math.round(255 * Math.min(1, Math.max(0, v)) ** (1 / 2.2))
    for (let p = 0; p < W * H; p++) {
      img.data[p * 4] = to8(pic.rgb[p * 3]); img.data[p * 4 + 1] = to8(pic.rgb[p * 3 + 1]); img.data[p * 4 + 2] = to8(pic.rgb[p * 3 + 2]); img.data[p * 4 + 3] = 255
    }
    c.getContext('2d')!.putImageData(img, 0, 0)
  }, [pic])
  return (
    <figure className="relative h-full min-w-0">
      {/* the picture keeps its shape inside whatever box the case gives it, under the title */}
      <canvas ref={ref} width={W} height={H} role="img" aria-label={label} data-testid={testId}
        className="absolute inset-x-2 top-8 bottom-2 h-[calc(100%-2.5rem)] w-[calc(100%-1rem)] object-contain [image-rendering:pixelated]" />
      <figcaption className="pointer-events-none absolute top-2.5 left-3 text-xs font-medium text-ink-muted sm:text-sm">{title}</figcaption>
    </figure>
  )
}
