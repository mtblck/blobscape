import { useMemo, useState } from 'react'
import type { Blobs } from '../../splat-core/blobs.ts'
import type { Orbit } from '../../splat-core/view.ts'
import { blobsFromSamples, sampleShape } from '../../splat-core/shapes.ts'
import { evalSH, numbersPerBlob, projectSH, sphereDirections } from '../../splat-core/sh.ts'
import { Slider } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS } from '../routes.ts'
import { Viewport, ZoomBar } from '../Viewport.tsx'
import { useGoals } from '../progress.ts'

const START: Orbit = { target: [0, 0.8, 0], distance: 3.6, azimuth: 30, elevation: 15 }
/** Each half is tall and narrow on a phone, so stand further back to fit the ball's width. */
const start = (): Orbit => (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches ? { ...START, distance: 5.4 } : START)
const SAMPLES = sampleShape('sphere', 1800)
const DIRS = sphereDirections(320)
// The light the shine comes from: up, left and in front of the start view
const L = (() => { const l = [-0.3, 0.8, 0.9]; const n = Math.hypot(...l); return l.map((v) => v / n) })()

/** The camera's position for an orbit (the same placement as SplatView). */
function eye(o: Orbit): [number, number, number] {
  const az = (o.azimuth * Math.PI) / 180, el = (Math.max(-89, Math.min(89, o.elevation)) * Math.PI) / 180
  return [o.target[0] + o.distance * Math.sin(az) * Math.cos(el), o.target[1] + o.distance * Math.sin(el), o.target[2] + o.distance * Math.cos(az) * Math.cos(el)]
}

/** The real colour of blob i seen from direction v: its own colour plus a Blinn-Phong highlight. */
function real(i: number, shine: number, x: number, y: number, z: number): [number, number, number] {
  const { n, c } = SAMPLES[i]
  let hx = L[0] + x, hy = L[1] + y, hz = L[2] + z
  const hl = Math.hypot(hx, hy, hz) || 1
  hx /= hl; hy /= hl; hz /= hl
  const s = 0.95 * Math.max(0, n[0] * hx + n[1] * hy + n[2] * hz) ** shine
  return [c[0] + s, c[1] + s, c[2] + s]
}

const clamp = (v: number) => Math.max(0, Math.min(1, v))
const angleBetween = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

export function Angle() {
  const [orbit, setOrbit] = useState<Orbit>(start)
  const [degree, setDegree] = useState(2)
  const [shine, setShine] = useState(24)

  // Each blob's colour by angle, projected once per shine setting: 48 numbers a blob
  const coeffs = useMemo(() => SAMPLES.map((_, i) => projectSH((x, y, z) => real(i, shine, x, y, z), DIRS)), [shine])
  const realBlobs = useMemo(() => blobsFromSamples(SAMPLES, 0.075, true), [])
  const storedBlobs = useMemo(() => blobsFromSamples(SAMPLES, 0.075, true), [])

  // Recolour both for where the camera is now, and compare the brightest highlight each one shows
  const peak = useMemo(() => {
    const e = eye(orbit)
    let realPeak = 0, storedPeak = 0
    for (let i = 0; i < SAMPLES.length; i++) {
      const { p, n, c } = SAMPLES[i]
      let x = e[0] - p[0], y = e[1] - p[1], z = e[2] - p[2]
      const l = Math.hypot(x, y, z) || 1
      x /= l; y /= l; z /= l
      const r = real(i, shine, x, y, z)
      const st = evalSH(coeffs[i], degree, x, y, z)
      for (let k = 0; k < 3; k++) {
        realBlobs.colour[i * 3 + k] = clamp(r[k])
        storedBlobs.colour[i * 3 + k] = clamp(st[k])
      }
      // Only blobs facing the camera count, and only the brightness added on top of the blob's own colour
      if (n[0] * x + n[1] * y + n[2] * z <= 0) continue
      const base = (c[0] + c[1] + c[2]) / 3
      realPeak = Math.max(realPeak, Math.min(1, (r[0] + r[1] + r[2]) / 3) - base)
      storedPeak = Math.max(storedPeak, Math.min(1, (st[0] + st[1] + st[2]) / 3) - base)
    }
    return realPeak > 0.01 ? Math.max(0, storedPeak / realPeak) : 1
  }, [orbit, degree, shine, coeffs, realBlobs, storedBlobs])
  // A new number each time the colours above change, so both views re-upload them
  const version = useMemo(() => Math.random(), [peak, orbit, degree, shine]) // eslint-disable-line react-hooks/exhaustive-deps

  const done = useGoals('angle', {
    walk: angleBetween(orbit.azimuth, START.azimuth) >= 60 || Math.abs(orbit.elevation - START.elevation) >= 50,
    flat: degree === 0,
    sharp: degree === 3 && peak < 0.7,
  })

  const view = (blobs: Blobs, label: string, title: string) => (
    <figure className="relative h-full min-w-0">
      <Viewport bare noZoom blobs={blobs} version={version} orbit={orbit} setOrbit={setOrbit} label={label} />
      <figcaption className="pointer-events-none absolute bottom-2.5 left-3 text-xs font-medium text-ink-muted sm:text-sm">{title}</figcaption>
    </figure>
  )

  return (
    <LessonShell
      id="angle"
      intro={<p>Shiny things look different from every side: the bright spot moves as you do. How can a blob, which has one colour, do that?</p>}
      view={
        <div className="relative h-full">
          <div className="grid h-full grid-cols-2 divide-x divide-rule-soft">
            {view(realBlobs, 'A shiny ball of blobs with its real shine. Drag or use the arrow keys to walk round it.', 'The real shine')}
            {view(storedBlobs, `The same ball, each blob's colour stored at degree ${degree}. Drag or use the arrow keys to walk round it.`, `Stored at degree ${degree}`)}
          </div>
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(start)} />
        </div>
      }
      caption={
        <p data-testid="sh-readout">
          Degree {degree}: <span className="tabular-nums text-ink">{numbersPerBlob(degree)}</span> numbers per blob, {numbersPerBlob(degree) - 11} of them colour.
          {' '}From here the stored highlight is <span className="tabular-nums text-ink">{Math.round(peak * 100)}%</span> as bright as the real one.
        </p>
      }
      groups={[
        {
          id: 'degree',
          title: 'Colour by angle',
          note: 'how many numbers each blob keeps',
          span: 2,
          content: <Slider label="Degree" value={degree} min={0} max={3} step={1} onChange={setDegree} format={(v) => `${v} (${numbersPerBlob(v)} numbers)`} />,
        },
        {
          id: 'shine',
          title: 'Shine',
          note: 'how sharp the highlight is',
          span: 2,
          content: <Slider label="Sharpness" value={shine} min={4} max={120} step={1} onChange={setShine} format={(v) => `${v}`} />,
        },
        {
          id: 'camera',
          title: 'Camera',
          note: 'or drag either view',
          span: 2,
          content: <Slider label="Walk round" value={Math.round(orbit.azimuth)} min={-180} max={180} step={1} onChange={(azimuth) => setOrbit((o) => ({ ...o, azimuth }))} format={(v) => `${v}°`} />,
        },
      ]}
      goals={LESSON_GOALS['angle']}
      done={done}
      scene={() => storedBlobs}
      explainTitle="A colour for every direction"
      formula={{
        eq: <>colour(<i>v</i>) = Σ <i>c</i><sub className="text-[0.45em]">ℓm</sub> <i>Y</i><sub className="text-[0.45em]">ℓm</sub>(<i>v</i>)</>,
        terms: [
          ['v', 'the direction you look at the blob from'],
          ['Yℓm', 'fixed patterns over all directions, smooth for low degree ℓ and finer as it rises (spherical harmonics)'],
          ['cℓm', "the blob's own numbers: how much of each pattern it has, per colour channel"],
        ],
      }}
      explain={
        <>
          <p>
            A blob doesn't keep one colour. It keeps a recipe: a few standard patterns over every direction, each mixed in by its own amount.
            Mix them and you get a colour that changes smoothly as you walk round, which is why the highlight followed you.
          </p>
          <p>
            Degree 0 is a single pattern, the same from everywhere, so the shine averaged away to a flat colour. Each degree adds finer
            patterns: 9 extra numbers at degree 1, 24 at degree 2, 45 at degree 3. Even at 3, a sharp glint is too fine to build, so it
            smeared. That's why real captures often blur mirror-like reflections.
          </p>
          <p>
            Most capture files store degree 3, which makes colour by angle about three quarters of the file. Formats and how they shrink
            those numbers are two lessons on.
          </p>
        </>
      }
    />
  )
}
