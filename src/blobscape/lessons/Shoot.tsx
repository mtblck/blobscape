import { useEffect, useRef, useState } from 'react'
import type { Orbit } from '../../splat-core/view.ts'
import { Button, Slider } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS } from '../routes.ts'
import { ZoomBar, clampOrbit } from '../Viewport.tsx'
import { useGoals } from '../progress.ts'
import { DISTANCE, type Model } from '../shoot/train3d.ts'
import { CpuView, Thumb, toBlobs } from '../shoot/views.tsx'
import { subject } from '../shoot/subject.ts'
import type { FromShoot, ToShoot } from '../shoot/shoot.worker.ts'

/** Twelve places to stand, every 30° round the bird, all a little above it. */
const SPOTS = Array.from({ length: 12 }, (_, i) => i * 30)
const PHOTO_HEIGHT = 20
const START: Orbit = { target: [0, 0, 0], distance: DISTANCE, azimuth: 0, elevation: 15 }

const truth = subject()

/** Which side of the bird a camera spot looks at, in words. */
function side(deg: number) {
  const a = ((deg % 360) + 360) % 360
  if (a === 0) return 'the front'
  if (a === 180) return 'the back'
  if (a === 90) return 'its left side'
  if (a === 270) return 'its right side'
  return a < 90 ? 'front left' : a < 180 ? 'back left' : a < 270 ? 'back right' : 'front right'
}

interface Result { key: string; photos: number; all: number }

export function Shoot() {
  const [spots, setSpots] = useState<number[]>([0])
  const [orbit, setOrbit] = useState<Orbit>(START)
  const [model, setModel] = useState<Model | null>(null)
  const [progress, setProgress] = useState(0)
  const [photos, setPhotos] = useState<Float64Array[]>([])
  const [result, setResult] = useState<Result | null>(null)
  const key = [...spots].sort((a, b) => a - b).join(',')

  const worker = useRef<Worker | null>(null)
  const run = useRef(0)
  const keyOf = useRef(new Map<number, string>())
  useEffect(() => {
    const w = new Worker(new URL('../shoot/shoot.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    w.onmessage = (e: MessageEvent<FromShoot>) => {
      const m = e.data
      if (m.run !== run.current) return
      if (m.type === 'photos') setPhotos(m.photos)
      else if (m.type === 'progress') { setModel(m.model); setProgress(m.step / m.total) }
      else {
        setModel(m.model)
        setProgress(1)
        setResult({ key: keyOf.current.get(m.run) ?? '', photos: m.photos, all: m.all })
        keyOf.current.clear()
      }
    }
    return () => w.terminate()
  }, [])

  // Retrain whenever the photos change, a moment after the last click
  useEffect(() => {
    setResult(null)
    setProgress(0)
    const t = setTimeout(() => {
      const r = ++run.current
      keyOf.current.set(r, key)
      worker.current?.postMessage({ type: 'train', run: r, azimuths: key ? key.split(',').map(Number) : [], elevation: PHOTO_HEIGHT } satisfies ToShoot)
    }, 350)
    return () => clearTimeout(t)
  }, [key])

  const trained = result !== null && result.key === key
  const az = Math.abs(clampOrbit(orbit).azimuth)
  const frontOnly = spots.length > 0 && spots.every((s) => s <= 60 || s >= 300)
  const done = useGoals('shoot', {
    back: trained && frontOnly && az > 120,
    floaters: trained && spots.length >= 2 && result.photos >= 0.97 && result.all < 0.65,
    few: trained && spots.length <= 4 && result.all >= 0.92,
    round: trained && result.all >= 0.97,
  })

  const toggle = (deg: number) => setSpots((s) => (s.includes(deg) ? s.filter((x) => x !== deg) : [...s, deg]))
  const pct = (v: number) => `${Math.round(v * 100)}%`

  return (
    <LessonShell
      id="shoot"
      intro={<p>Real splats aren't placed by hand: they're trained to match photos. Take some photos of this toy bird and watch blobs gather to match them. How many does it take to get every side right?</p>}
      view={
        <div className="relative h-full">
          <div className="grid h-full grid-cols-2 divide-x divide-rule-soft">
            <CpuView model={truth} orbit={orbit} setOrbit={setOrbit} title="The real bird" testId="view-real" label="The toy bird the photos are taken of." />
            <CpuView model={model} orbit={orbit} setOrbit={setOrbit} title={progress < 1 ? `Your blobs, training ${Math.round(progress * 100)}%` : 'Your blobs'} testId="view-blobs" label="The blobs trained from your photos." />
          </div>
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(START)} />
        </div>
      }
      caption={
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-xs text-ink-faint">{spots.length === 1 ? '1 photo' : `${spots.length} photos`}</span>
            <div className="flex flex-wrap gap-1" aria-hidden>{photos.map((p, k) => <Thumb key={k} photo={p} />)}</div>
          </div>
          <p className="tabular-nums" data-testid="shoot-score">
            {!spots.length ? 'Take a photo to start: tap a camera below.' : trained ? <>Your photos: <b className="text-ink">{pct(result.photos)}</b> · Every side: <b className="text-ink">{pct(result.all)}</b></> : 'Training…'}
          </p>
          <p aria-live="polite" className="sr-only">{trained && spots.length ? `Trained. Your photos match ${pct(result.photos)}, every side ${pct(result.all)}.` : ''}</p>
        </div>
      }
      groups={[
        {
          id: 'cameras',
          title: 'Photos',
          note: 'where you stand to take them',
          span: 2,
          content: (
            <div className="flex flex-wrap items-center gap-5">
              <SpotRing spots={spots} toggle={toggle} looking={orbit.azimuth} />
              <div className="flex max-w-[22rem] flex-col gap-2 text-sm text-ink-muted">
                <p>Tap a camera to take or drop a photo from there. The blobs start again from a random cloud each time.</p>
                <div className="flex gap-2">
                  <Button small onClick={() => setSpots([])} disabled={!spots.length}>Drop every photo</Button>
                </div>
              </div>
            </div>
          ),
        },
        {
          id: 'look',
          title: 'Look round',
          note: 'or drag either view',
          content: (
            <>
              <Slider label="Turn" value={Math.round(clampOrbit(orbit).azimuth)} min={-180} max={180} step={1} onChange={(azimuth) => setOrbit((o) => ({ ...o, azimuth }))} format={(v) => `${v}°`} />
              <Slider label="Height" value={Math.round(orbit.elevation)} min={-30} max={80} step={1} onChange={(elevation) => setOrbit((o) => ({ ...o, elevation }))} format={(v) => `${v}°`} />
            </>
          ),
        },
      ]}
      goals={LESSON_GOALS['shoot']}
      done={done}
      scene={() => toBlobs(model ?? truth)}
      explainTitle="Blobs that agree with every photo"
      formula={{
        eq: <>error = Σ (render − photo)²</>,
        terms: [
          ['render', 'the blobs drawn from where a photo was taken'],
          ['photo', 'what the camera really saw'],
          ['Σ', 'added up over every pixel of every photo'],
        ],
      }}
      explain={
        <>
          <p>
            Training starts from a random gray cloud. Each step it draws the blobs from one photo's camera, compares that with the photo,
            and nudges every blob's place, size, color and opacity a little in whichever direction shrinks the error. Blobs that fade to
            nothing are moved next to busy ones, so blobs pile up where there's detail. After a few hundred steps the cloud looks like the photos.
          </p>
          <p>
            But only like the photos. Training can't tell a blob on the bird from a blob floating halfway to the camera that happens to cover
            the same pixels. From where the photos were taken both look right; from anywhere else the stray ones show as smudges in the air.
            Those are floaters, and every real capture has some. The fix is more photos from more places: each new view rules out blobs that only one camera could see.
          </p>
          <p>
            A real capture is the same idea, scaled up: a few hundred phone photos or video frames, a step that works out where each was
            taken from, a few million blobs and thirty thousand steps on a graphics card. That's where a scan's fine detail comes from: nobody places
            those blobs, they are pushed until they agree with the photos. So capture apps ask you to walk all the way round, overlap your shots and keep the light steady.
          </p>
        </>
      }
    />
  )
}

/**
 * The twelve camera spots round a top-down bird (front at the bottom), as
 * toggle buttons, with a marker for where you're looking from now.
 */
function SpotRing({ spots, toggle, looking }: { spots: number[]; toggle: (deg: number) => void; looking: number }) {
  const R = 44 // % of the box's half-width
  const at = (deg: number, r = R) => {
    const a = (deg * Math.PI) / 180
    return { left: `${50 + Math.sin(a) * r}%`, top: `${50 + Math.cos(a) * r}%` }
  }
  return (
    <div role="group" aria-label="Camera spots round the bird" className="relative h-44 w-44 shrink-0">
      <svg viewBox="-50 -50 100 100" aria-hidden className="absolute inset-0 h-full w-full">
        <circle r={R} fill="none" className="stroke-rule" strokeDasharray="2 3" />
        {/* The bird from above: body, head toward the front (down), beak, tail at the back */}
        <ellipse cx="0" cy="-2" rx="11" ry="13" fill="#f5bd29" />
        <circle cx="0" cy="8" r="7" fill="#f5bd29" />
        <path d="M-2.5 14 L2.5 14 L0 19 Z" fill="#fa7f1a" />
        <path d="M-4 -14 L4 -14 L0 -21 Z" fill="#e6332e" />
        {/* Where you're looking from */}
        <g transform={`rotate(${-looking})`}>
          <path d="M0 28 L-3.5 34 L3.5 34 Z" className="fill-ink-faint" />
        </g>
      </svg>
      {SPOTS.map((deg) => {
        const on = spots.includes(deg)
        return (
          <button
            key={deg}
            type="button"
            aria-pressed={on}
            aria-label={`Photo from ${side(deg)} (${deg}°)`}
            title={`${deg}°`}
            onClick={() => toggle(deg)}
            style={at(deg)}
            className={`absolute grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full border transition-[background-color,border-color,transform] hover:scale-110 ${on ? 'border-accent bg-accent text-paper' : 'border-ink-faint/40 bg-paper text-ink-faint hover:border-ink-faint hover:text-ink'}`}
          >
            <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M2 5.5h3l1.2-1.8h3.6L11 5.5h3v7H2z" /><circle cx="8" cy="9" r="2.2" /></svg>
          </button>
        )
      })}
    </div>
  )
}
