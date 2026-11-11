import { useMemo, useState } from 'react'
import type { Orbit } from '../../splat-core/view.ts'
import { arm, weightByX } from '../../splat-engine/models.ts'
import { neighbourPairs, poseBlobs, stretch } from '../../splat-engine/pose.ts'
import { axisAngle, posedPoint } from '../../splat-engine/rig.ts'
import { Slider, Toggle } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS } from '../routes.ts'
import { Viewport } from '../Viewport.tsx'
import { drawBones, themeColour } from '../overlay.ts'
import { useGoals } from '../progress.ts'

const START: Orbit = { target: [0, 1.05, 0], distance: 4.4, azimuth: 8, elevation: 10 }
const HAND: [number, number, number] = [1.15, 0.9, 0]
const UPPER = [0.35, 0.62, 0.95], FORE = [0.98, 0.55, 0.2]

const cm = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.round(Math.abs(v) * 100)} cm`

export function Weights() {
  const [orbit, setOrbit] = useState<Orbit>(START)
  const [bend, setBend] = useState(0)
  const [width, setWidth] = useState(0)
  const [centre, setCentre] = useState(0)
  const [tint, setTint] = useState(false)
  const [bones, setBones] = useState(true)

  const model = useMemo(() => arm(), [])
  const shown = useMemo(() => model.blobs.clone(), [model])
  // Neighbours round the elbow, found once in the rest pose, to measure how far a bend pulls them apart
  const pairs = useMemo(() => neighbourPairs(model.blobs, (i) => Math.abs(model.blobs.centre[i * 3]) < 0.9), [model])
  const sk = model.skeleton
  const { version, gap } = useMemo(() => {
    weightByX(model, centre, width)
    sk.reset()
    sk.setRotation(1, axisAngle([0, 0, 1], (bend * Math.PI) / 180))
    sk.update()
    poseBlobs(model.blobs, model.skin, sk, 'quat', shown)
    for (let i = 0; i < shown.count; i++) {
      const w = model.skin.weights[i * 4 + 1]
      for (let k = 0; k < 3; k++) shown.colour[i * 3 + k] = tint ? (UPPER[k] * (1 - w) + FORE[k] * w) * (0.6 + 0.4 * model.blobs.colour[i * 3 + 1]) : model.blobs.colour[i * 3 + k]
    }
    return { version: Math.random(), gap: stretch(pairs, model.blobs, shown) }
  }, [model, shown, sk, pairs, bend, width, centre, tint])

  const done = useGoals('weights', {
    crack: bend >= 60 && gap >= 4,
    smooth: bend >= 80 && gap <= 1.6,
    rubber: bend >= 80 && width >= 1.8,
    offset: bend >= 60 && width >= 0.2 && Math.abs(centre) >= 0.4,
  })

  return (
    <LessonShell
      id="weights"
      intro={<p>An arm needs a bone above the elbow and a bone below it. Bend it, though, and something goes wrong at the joint. What, and how do you fix it without moving a bone?</p>}
      view={
        <Viewport
          bare
          blobs={shown}
          version={version}
          orbit={orbit}
          setOrbit={setOrbit}
          label={`An arm of ${model.blobs.count.toLocaleString()} blobs bent ${bend} degrees at the elbow. The switch from upper arm to forearm is ${width < 0.01 ? 'sudden' : `spread over ${Math.round(width * 100)} cm`}, centred ${cm(centre)} from the elbow. Drag or use the arrow keys to orbit.`}
          hint="drag to orbit · scroll to zoom"
          overlay={
            bones
              ? (ctx, lens) => drawBones(ctx, [
                  { from: sk.posedHead.subarray(0, 3), to: sk.posedHead.subarray(3, 6) },
                  { from: sk.posedHead.subarray(3, 6), to: posedPoint(sk, 1, HAND) },
                ], lens, themeColour('accent', ctx.canvas))
              : undefined
          }
        />
      }
      caption={
        <p>
          Bent <span className="tabular-nums text-ink">{bend}°</span>. Round the elbow, the widest gap between neighbouring blobs is{' '}
          <span className="tabular-nums text-ink" data-testid="gap">×{gap.toFixed(1)}</span> what it was{gap >= 3 ? ': torn open' : gap <= 1.6 ? ': still a surface' : ''}.
        </p>
      }
      groups={[
        {
          id: 'bend',
          title: 'Elbow',
          content: <Slider label="Bend" value={bend} min={0} max={140} step={1} onChange={setBend} format={(v) => `${v}°`} />,
        },
        {
          id: 'blend',
          title: 'Weights',
          note: 'how each blob splits its loyalty',
          span: 2,
          cols: 2,
          content: (
            <>
              <Slider label="Blend over" value={width} min={0} max={2.2} step={0.02} onChange={setWidth} format={(v) => (v < 0.01 ? 'none' : `${Math.round(v * 100)} cm`)} />
              <Slider label="Centred at" value={centre} min={-0.8} max={0.8} step={0.05} onChange={setCentre} format={(v) => (Math.abs(v) < 0.025 ? 'elbow' : cm(v))} />
            </>
          ),
        },
        {
          id: 'show',
          title: 'Show',
          content: (
            <>
              <Toggle label="Bones" checked={bones} onChange={setBones} />
              <Toggle label="Colour by weight" checked={tint} onChange={setTint} />
            </>
          ),
        },
      ]}
      goals={LESSON_GOALS['weights']}
      done={done}
      scene={() => shown}
      explainTitle="Each blob splits its loyalty"
      formula={{
        eq: <>p′ = w · M<sub>fore</sub> p + (1 − w) · M<sub>upper</sub> p</>,
        terms: [
          ['w', 'how much the blob follows the forearm, from 0 to 1: its weight'],
          ['M', 'each bone’s turn, as in the last lesson'],
          ['p′', 'somewhere between where each bone would put it'],
        ],
      }}
      explain={
        <>
          <p>
            With no blend, every blob followed one bone or the other, so the outside of the elbow tore open and the inside piled up. A
            blend gives each blob near the joint a weight: follow the forearm this much, the upper arm the rest. Those blobs land
            between the two places their bones would put them, and fill the gap.
          </p>
          <p>
            Too wide a blend and the middle of the forearm half-follows the upper arm, so the whole arm curves like a hose. Off-centre,
            the crease moves away from the elbow, because weights don't know where the joint is. Real rigs paint weights blob by blob
            with a brush, and the goal is the same: a narrow blend, right on the joint. There is one movement no weights can fix,
            though, and the next lesson twists it.
          </p>
        </>
      }
    />
  )
}
