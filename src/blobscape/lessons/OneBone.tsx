import { useMemo, useRef, useState } from 'react'
import type { Orbit } from '../../splat-core/view.ts'
import { caterpillar, weightByX } from '../../splat-engine/models.ts'
import { poseBlobs } from '../../splat-engine/pose.ts'
import { axisAngle } from '../../splat-engine/rig.ts'
import { Slider, Toggle } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS } from '../routes.ts'
import { Viewport } from '../Viewport.tsx'
import { drawBones, posedPoint, themeColour } from '../overlay.ts'
import { useGoals } from '../progress.ts'

const START: Orbit = { target: [0, 0.35, 0], distance: 4.2, azimuth: 18, elevation: 14 }
const HEAD_END: [number, number, number] = [1.1, 0.2, 0]
const BODY_TINT = [0.35, 0.62, 0.95], HEAD_TINT = [0.98, 0.55, 0.2]

/** Where the cut sits, in words. */
const cutWords = (c: number) => (Math.abs(c) < 0.05 ? 'at the joint' : c > 0 ? `${Math.round(c * 100)} cm in front of the joint` : `${Math.round(-c * 100)} cm behind the joint`)

export function OneBone() {
  const [orbit, setOrbit] = useState<Orbit>(START)
  const [lift, setLift] = useState(0)
  const [cut, setCut] = useState(0)
  const [tint, setTint] = useState(false)
  const [bones, setBones] = useState(true)

  const model = useMemo(() => caterpillar(), [])
  const shown = useMemo(() => model.blobs.clone(), [model])
  const sk = model.skeleton
  const onHead = useMemo(() => {
    let n = 0
    for (let i = 0; i < model.blobs.count; i++) if (model.blobs.centre[i * 3] >= cut) n++
    return n
  }, [model, cut])
  // Re-posed from the rest pose every time, so nothing drifts
  const version = useMemo(() => {
    weightByX(model, cut, 0)
    sk.reset()
    sk.setRotation(1, axisAngle([0, 0, 1], (lift * Math.PI) / 180))
    sk.update()
    poseBlobs(model.blobs, model.skin, sk, 'quat', shown)
    for (let i = 0; i < shown.count; i++) {
      const head = model.skin.weights[i * 4 + 1] > 0.5
      for (let k = 0; k < 3; k++) shown.colour[i * 3 + k] = tint ? (head ? HEAD_TINT : BODY_TINT)[k] * (0.55 + 0.45 * model.blobs.colour[i * 3 + 1]) : model.blobs.colour[i * 3 + k]
    }
    return Math.random()
  }, [model, shown, sk, lift, cut, tint])

  const before = useRef(new Set<string>())
  const done = useGoals('one-bone', {
    lift: lift >= 40,
    tear: lift >= 25 && cut >= 0.3,
    swing: lift >= 25 && cut <= -0.3,
    seam: before.current.has('tear') && before.current.has('swing') && lift >= 45 && Math.abs(cut) < 0.05,
  })
  before.current = done

  return (
    <LessonShell
      id="one-bone"
      intro={<p>A bone is a line inside the caterpillar. It doesn't touch a single blob, yet turn it and half the body goes with it. Which half, and why?</p>}
      view={
        <Viewport
          bare
          blobs={shown}
          version={version}
          orbit={orbit}
          setOrbit={setOrbit}
          label={`A caterpillar of ${model.blobs.count.toLocaleString()} blobs with two bones. The head bone is lifted ${lift} degrees; blobs ${cutWords(cut)} and forward hang on it. Drag or use the arrow keys to orbit.`}
          hint="drag to orbit · scroll to zoom"
          onView={(v) => v.setFloor(true, '#8a8a8a')}
          overlay={
            bones
              ? (ctx, lens) => drawBones(ctx, [
                  { from: sk.posedHead.subarray(0, 3), to: sk.posedHead.subarray(3, 6) },
                  { from: sk.posedHead.subarray(3, 6), to: posedPoint(sk, 1, HEAD_END) },
                ], lens, themeColour('accent', ctx.canvas))
              : undefined
          }
        />
      }
      caption={
        <p>
          Head bone lifted <span className="tabular-nums text-ink">{lift}°</span>.{' '}
          <span className="tabular-nums text-ink" data-testid="blob-count">{onHead.toLocaleString()}</span> of {model.blobs.count.toLocaleString()} blobs hang on it, from {cutWords(cut)} forward.
        </p>
      }
      groups={[
        {
          id: 'bend',
          title: 'The head bone',
          note: 'turns about the joint',
          content: <Slider label="Lift" value={lift} min={0} max={90} step={1} onChange={setLift} format={(v) => `${v}°`} />,
        },
        {
          id: 'hang',
          title: 'Which blobs hang on it',
          note: 'every blob past the cut',
          content: <Slider label="Cut" value={cut} min={-0.9} max={0.9} step={0.05} onChange={setCut} format={(v) => (Math.abs(v) < 0.05 ? 'joint' : `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)} cm`)} />,
        },
        {
          id: 'show',
          title: 'Show',
          content: (
            <>
              <Toggle label="Bones" checked={bones} onChange={setBones} />
              <Toggle label="Colour each blob by its bone" checked={tint} onChange={setTint} />
            </>
          ),
        },
      ]}
      goals={LESSON_GOALS['one-bone']}
      done={done}
      scene={() => shown}
      explainTitle="Blobs hang on bones"
      formula={{
        eq: <>p′ = M · p</>,
        terms: [
          ['p', "a blob's centre in the rest pose"],
          ['M', 'its bone’s turn about the joint, as a matrix'],
          ['p′', 'where the blob is drawn now'],
        ],
      }}
      explain={
        <>
          <p>
            The bone never touched a blob. What moved them was a list: every blob carries the number of the bone it hangs on, and each
            frame its centre and its shape are turned by that bone. When you moved the cut, the bone stayed put and the list changed, so
            the tear moved with the cut, and blobs behind the joint swung round it and through the floor.
          </p>
          <p>
            That's all rigging is: a skeleton to pose, and a note on every blob of which bones to follow. Animators call the note the
            skin. With one bone per blob, though, a bend always opens a seam on its outside, where neighbours follow different bones.
            The next lesson lets a blob follow two.
          </p>
        </>
      }
    />
  )
}
