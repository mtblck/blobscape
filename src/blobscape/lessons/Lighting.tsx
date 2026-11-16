import { useMemo, useState } from 'react'
import type { Blobs } from '../../splat-core/blobs.ts'
import type { Orbit } from '../../splat-core/view.ts'
import { Chip, Slider, Toggle } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS } from '../routes.ts'
import { Viewport, ZoomBar } from '../Viewport.tsx'
import { useGoals } from '../progress.ts'
import { CAPTURED_AT, buildScene, capture, closeness, lampAt, relight, tableError, truth, type Relight, type Scene } from '../lighting/relight.ts'

const START: Orbit = { target: [0, 0.3, 0], distance: 3.6, azimuth: 10, elevation: 32 }
const start = (): Orbit => (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches ? { ...START, distance: 5 } : START)

const MODES: { id: Relight; name: string; note: string }[] = [
  { id: 'captured', name: 'As captured', note: 'The colors as the camera saw them, whatever the lamp does.' },
  { id: 'add', name: 'Add a live light', note: 'Brighten each blob by how much the new lamp faces it, on top of its stored color.' },
  { id: 'remove', name: 'Take the old light out', note: 'Divide out a guess at the capture’s lamp first, then light with the new one.' },
]

/** How far apart two lamp angles are, in degrees round the circle. */
const apart = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180)

/** The scene with these colors, plus a small bright blob where the lamp is. */
function withColors(s: Scene, colors: Float32Array, lamp: number): Blobs {
  const b = s.blobs.clone()
  b.color.set(colors)
  b.push({ center: lampAt(lamp), scale: [0.07, 0.07, 0.07], quat: [0, 0, 0, 1], color: [1, 0.93, 0.6], opacity: 1 })
  return b
}

export function Lighting() {
  const [orbit, setOrbit] = useState<Orbit>(start)
  const [lamp, setLamp] = useState(CAPTURED_AT)
  const [mode, setMode] = useState<Relight>('captured')
  const [guess, setGuess] = useState(40)
  const [shape, setShape] = useState(false)

  const scene = useMemo(() => buildScene(), [])
  const captured = useMemo(() => capture(scene), [scene])
  const real = useMemo(() => truth(scene, lamp), [scene, lamp])
  const relit = useMemo(() => relight(scene, captured, { lamp, mode, guess, shape }), [scene, captured, lamp, mode, guess, shape])
  const score = closeness(relit, real, captured)
  const table = tableError(scene, relit, real)
  const realBlobs = useMemo(() => withColors(scene, real, lamp), [scene, real, lamp])
  const relitBlobs = useMemo(() => withColors(scene, relit, lamp), [scene, relit, lamp])

  const far = apart(lamp, CAPTURED_AT) >= 90
  const done = useGoals('lighting', {
    stuck: mode === 'captured' && far,
    double: mode === 'add' && far && score < 0.2,
    guess: mode === 'remove' && !shape && far && score >= 0.55,
    shape: mode === 'remove' && far && table <= 0.02,
  })

  const half = (title: string, testId: string, node: React.ReactNode) => (
    <figure className="relative h-full min-w-0" data-testid={testId}>
      {node}
      <figcaption className="pointer-events-none absolute bottom-2.5 left-3 text-xs font-medium text-ink-muted sm:text-sm">{title}</figcaption>
    </figure>
  )
  const where = (deg: number) => `${deg}°`

  return (
    <LessonShell
      id="lighting"
      intro={<p>A scan keeps the color the camera saw, light and shadows included. Move the lamp: what happens to the real table, and what can you do to the scan to keep up?</p>}
      view={
        <div className="relative h-full">
          <div className="grid h-full grid-cols-2 divide-x divide-rule-soft">
            {half('The real thing', 'view-real', (
              <Viewport bare noZoom blobs={realBlobs} version={0} orbit={orbit} setOrbit={setOrbit}
                label={`A ball and a box on a table, lit by a lamp at ${where(lamp)}. Drag or use the arrow keys to orbit.`} />
            ))}
            {half(`The scan, ${MODES.find((m) => m.id === mode)!.name.toLowerCase()}`, 'view-scan', (
              <Viewport bare noZoom blobs={relitBlobs} version={0} orbit={orbit} setOrbit={setOrbit}
                label={`The scan of the same table, captured with the lamp at ${where(CAPTURED_AT)}, ${MODES.find((m) => m.id === mode)!.name.toLowerCase()}. Drag or use the arrow keys to orbit.`} />
            ))}
          </div>
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(start())} />
        </div>
      }
      caption={
        <p className="tabular-nums" data-testid="lighting-readout">
          The scan matches the real thing <b className="text-ink">{Math.max(0, Math.round(score * 100))}%</b> of the way; on the table it’s off by <b className="text-ink">{Math.round(table * 100)}%</b>.
        </p>
      }
      groups={[
        {
          id: 'lamp',
          title: 'Lamp',
          note: 'moves for both',
          content: <Slider label="Lamp" value={lamp} min={-180} max={180} step={1} onChange={setLamp} format={where} />,
        },
        {
          id: 'relight',
          title: 'The scan',
          note: 'how it’s relit',
          span: 1.4,
          content: (
            <>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="How the scan is relit">
                {MODES.map((m) => <Chip key={m.id} active={mode === m.id} onClick={() => setMode(m.id)}>{m.name}</Chip>)}
              </div>
              <p className="text-sm text-ink-faint">{MODES.find((m) => m.id === mode)!.note}</p>
            </>
          ),
        },
        {
          id: 'old',
          title: 'The old light',
          note: 'for taking it out',
          content: (
            <>
              <Slider label="Where the capture’s lamp was" value={guess} min={-180} max={180} step={1} onChange={setGuess} format={where} />
              <Toggle label="Know the scene’s shape" checked={shape} onChange={setShape} />
            </>
          ),
        },
      ]}
      goals={LESSON_GOALS['lighting']}
      done={done}
      scene={() => relitBlobs}
      explainTitle="The light is part of the paint"
      formula={{
        eq: <>seen = color × light</>,
        terms: [
          ['seen', 'what the camera stores in each blob'],
          ['color', 'what the surface is really like'],
          ['light', 'how much light reached it at that moment'],
        ],
      }}
      explain={
        <>
          <p>
            A scan only ever stores what the camera saw, and that's the surface's color times the light on it. Move the lamp and the
            real table changes; the scan can't, because its light and shadows are paint now. Live lights, like the ones in this site's
            engine, can only brighten on top of that paint, so the old lighting stays and the new one piles on.
          </p>
          <p>
            To really relight a scan you have to divide the old light out first, which means knowing where it came from. A good guess
            gets you most of the way. But the shadows still don't move: knowing a shadow belongs to the ball needs the scene's shape,
            not just its colors. With the shape, both come out right. Pulling color, light and shape apart from photos is called
            inverse rendering, and relightable captures are still mostly research, which is why most scans are shot in soft, even light.
          </p>
        </>
      }
    />
  )
}
