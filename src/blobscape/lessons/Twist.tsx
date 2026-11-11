import { useMemo, useRef, useState } from 'react'
import type { Blobs } from '../../splat-core/blobs.ts'
import type { Orbit } from '../../splat-core/view.ts'
import { weightByX, wrist } from '../../splat-engine/models.ts'
import { poseBlobs, volumeKept } from '../../splat-engine/pose.ts'
import { axisAngle } from '../../splat-engine/rig.ts'
import { Slider } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS } from '../routes.ts'
import { Viewport, ZoomBar } from '../Viewport.tsx'
import { useGoals } from '../progress.ts'

const START: Orbit = { target: [-0.25, 0.9, 0], distance: 3.6, azimuth: 20, elevation: 40 }
/** Each half is narrow on a phone, so stand further back to fit the arm. */
const start = (): Orbit => (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches ? { ...START, distance: 5.6 } : START)

/** The thinnest blob near the wrist, as a share of its rest volume. */
function thinnest(rest: Blobs, posed: Blobs) {
  let m = 1
  for (let i = 0; i < rest.count; i++) if (Math.abs(rest.centre[i * 3]) < 0.4) m = Math.min(m, volumeKept(rest, posed, i))
  return m
}

export function Twist() {
  const [orbit, setOrbit] = useState<Orbit>(start)
  const [twist, setTwist] = useState(0)
  const [width, setWidth] = useState(0.5)

  const model = useMemo(() => wrist(), [])
  const plain = useMemo(() => model.blobs.clone(), [model])
  const averaged = useMemo(() => model.blobs.clone(), [model])
  const sk = model.skeleton
  const { version, keptPlain, keptAveraged } = useMemo(() => {
    weightByX(model, 0, width)
    sk.reset()
    sk.setRotation(1, axisAngle([1, 0, 0], (twist * Math.PI) / 180))
    sk.update()
    poseBlobs(model.blobs, model.skin, sk, 'linear', plain)
    poseBlobs(model.blobs, model.skin, sk, 'quat', averaged)
    return { version: Math.random(), keptPlain: thinnest(model.blobs, plain), keptAveraged: thinnest(model.blobs, averaged) }
  }, [model, sk, plain, averaged, twist, width])

  const before = useRef(new Set<string>())
  const done = useGoals('twist', {
    flat: twist >= 150 && keptPlain < 0.1,
    small: before.current.has('flat') && twist >= 15 && twist <= 45 && width >= 0.2 && keptPlain >= 0.8,
    hard: twist >= 150 && width < 0.02,
  })
  before.current = done

  const view = (blobs: Blobs, label: string, title: string, testId: string) => (
    <figure className="relative h-full min-w-0" data-testid={testId}>
      <Viewport bare noZoom blobs={blobs} version={version} orbit={orbit} setOrbit={setOrbit} label={label} />
      <figcaption className="pointer-events-none absolute bottom-2.5 left-3 text-xs font-medium text-ink-muted sm:text-sm">{title}</figcaption>
    </figure>
  )
  const pct = (v: number) => `${Math.round(v * 100)}%`

  return (
    <LessonShell
      id="twist"
      intro={<p>Turn your hand palm down to palm up. Your wrist stays round. Two ways of moving the same blobs, side by side: does either wrist?</p>}
      view={
        <div className="relative h-full">
          <div className="grid h-full grid-cols-2 divide-x divide-rule-soft">
            {view(plain, `A forearm and hand twisted ${twist} degrees, each blob moved by blending the two bones' matrices. Drag or use the arrow keys to orbit.`, 'Blend the matrices', 'plain-view')}
            {view(averaged, `The same arm and twist, each blob turned by the average of the two bones' turns. Drag or use the arrow keys to orbit.`, 'Average the turns', 'averaged-view')}
          </div>
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(start)} />
        </div>
      }
      caption={
        <p data-testid="kept">
          Twisted <span className="tabular-nums text-ink">{twist}°</span>. The thinnest blob at the wrist keeps{' '}
          <span className="tabular-nums text-ink">{pct(keptPlain)}</span> of its size with blended matrices, and{' '}
          <span className="tabular-nums text-ink">{pct(keptAveraged)}</span> with averaged turns.
        </p>
      }
      groups={[
        {
          id: 'twist',
          title: 'Wrist',
          note: 'the hand turns about the arm',
          content: <Slider label="Twist" value={twist} min={0} max={180} step={1} onChange={setTwist} format={(v) => `${v}°`} />,
        },
        {
          id: 'blend',
          title: 'Weights',
          note: 'blobs that follow both bones',
          content: <Slider label="Blend over" value={width} min={0} max={1.2} step={0.02} onChange={setWidth} format={(v) => (v < 0.01 ? 'none' : `${Math.round(v * 100)} cm`)} />,
        },
      ]}
      goals={LESSON_GOALS['twist']}
      done={done}
      scene={() => averaged}
      explainTitle="Average the turn, not the matrix"
      formula={{
        eq: <>½ · (turn 0°) + ½ · (turn 180°) = flat</>,
        terms: [
          ['turn 0°', 'the forearm’s matrix: leaves a blob as it is'],
          ['turn 180°', 'the hand’s: flips it over'],
          ['flat', 'their average, which squashes every direction across the arm to nothing'],
        ],
      }}
      explain={
        <>
          <p>
            A blob halfway between two bones gets half of each bone's matrix. For a bend that's close enough to a turn. For a twist it
            isn't: half of "stay" plus half of "flip over" squashes the blob flat across the arm. That's the left wrist, and the same
            fault makes the "candy wrapper" in 3D characters.
          </p>
          <p>
            The right wrist averages the turns themselves (as quaternions), so each blob turns halfway and keeps its size. The centres
            still crowd towards the middle on a big twist, which is why rigs add twist bones along the forearm. Our engine averages
            turns, and saves that rule into its files. Next: making bones move on their own.
          </p>
        </>
      }
    />
  )
}
