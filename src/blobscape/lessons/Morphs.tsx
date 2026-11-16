import { useMemo, useRef, useState } from 'react'
import type { Blobs } from '../../splat-core/blobs.ts'
import type { Orbit } from '../../splat-core/view.ts'
import { BLINK_STEPS, cheekSpread, lidDip, makeFace, worstLidDip } from '../../splat-engine/face.ts'
import { applyMorphs } from '../../splat-engine/morph.ts'
import { Chip, Field, Slider } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS } from '../routes.ts'
import { Viewport, ZoomBar } from '../Viewport.tsx'
import { useGoals } from '../progress.ts'

const START: Orbit = { target: [0, 1, 0], distance: 3.4, azimuth: 28, elevation: 6 }
/** Each half is narrow on a phone, so stand further back to fit the face. */
const start = (): Orbit => (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches ? { ...START, distance: 5 } : START)

const STEP_LABEL: Record<number, string> = { 1: '1: shut only', 2: '2', 4: '4' }

export function Morphs() {
  const [orbit, setOrbit] = useState<Orbit>(start)
  const [smile, setSmile] = useState(0)
  const [puff, setPuff] = useState(0)
  const [blink, setBlink] = useState(0)
  const [steps, setSteps] = useState<number>(1)

  const face = useMemo(() => makeFace(), [])
  const rest = face.body.blobs
  const moved = useMemo(() => rest.clone(), [rest])
  const shaped = useMemo(() => rest.clone(), [rest])
  const lid = face.blinks[BLINK_STEPS.indexOf(steps as (typeof BLINK_STEPS)[number])]
  const { version, spread, dip, worst } = useMemo(() => {
    const morphs = [face.smile, face.puff, lid]
    const weights = [smile, puff, blink]
    applyMorphs(rest, morphs, weights, moved, 'centers')
    applyMorphs(rest, morphs, weights, shaped, 'shape')
    return { version: Math.random(), spread: cheekSpread(face, moved), dip: lidDip(face, lid, blink), worst: worstLidDip(face, lid) }
  }, [face, rest, moved, shaped, lid, smile, puff, blink])

  // the lid goal wants the fault seen first: half shut, sunk into the eye
  const sunk = useRef(false)
  const half = blink >= 0.3 && blink <= 0.7
  if (half && dip > 0.1) sunk.current = true
  const done = useGoals('morphs', {
    gaps: puff >= 0.9 && spread >= 1.5,
    frown: smile <= -0.5,
    lids: sunk.current && half && worst < 0.03,
  })

  const view = (blobs: Blobs, label: string, title: string, testId: string) => (
    <figure className="relative h-full min-w-0" data-testid={testId}>
      <Viewport bare noZoom blobs={blobs} version={version} orbit={orbit} setOrbit={setOrbit} label={label} />
      <figcaption className="pointer-events-none absolute bottom-2.5 left-3 text-xs font-medium text-ink-muted sm:text-sm">{title}</figcaption>
    </figure>
  )
  const pct = (v: number) => `${Math.round(v * 100)}%`
  const doing = `${smile > 0.05 ? 'smiling' : smile < -0.05 ? 'frowning' : 'at rest'}${puff > 0.05 ? ', cheeks puffed' : ''}${blink > 0.05 ? ', eyes closing' : ''}`

  return (
    <LessonShell
      id="morphs"
      intro={<p>A face has almost no joints, yet it smiles, puffs and blinks. Here is a head with no moving bones at all. What moves its blobs, and what goes wrong if only their centers move?</p>}
      view={
        <div className="relative h-full">
          <div className="grid h-full grid-cols-2 divide-x divide-rule-soft">
            {view(moved, `A round face made of blobs, ${doing}. Only the blobs' centers have moved. Drag or use the arrow keys to orbit.`, 'Move the centers', 'moved-view')}
            {view(shaped, `The same face, ${doing}. Each blob has also stretched and turned with the skin under it. Drag or use the arrow keys to orbit.`, 'Move and reshape', 'shaped-view')}
          </div>
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(start)} />
        </div>
      }
      caption={
        <p data-testid="morph-readout">
          Blobs on a cheek sit <span className="tabular-nums text-ink">{spread.toFixed(1)}×</span> as far apart as at rest.
          The lids are sunk <span className="tabular-nums text-ink">{pct(dip)}</span> of the way into the eyes now, and{' '}
          <span className="tabular-nums text-ink">{pct(worst)}</span> at the worst point of a blink.
        </p>
      }
      groups={[
        {
          id: 'face',
          title: 'Face',
          note: 'each slider is one morph',
          content: (
            <div className="flex flex-col gap-3">
              <Slider label="Smile" value={smile} min={-1} max={1} step={0.05} onChange={setSmile} format={(v) => pct(v)} />
              <Slider label="Puff" value={puff} min={0} max={1} step={0.05} onChange={setPuff} format={(v) => pct(v)} />
            </div>
          ),
        },
        {
          id: 'eyes',
          title: 'Eyes',
          note: 'the lids turn round the eyeballs',
          content: (
            <div className="flex flex-col gap-3">
              <Slider label="Blink" value={blink} min={0} max={1} step={0.05} onChange={setBlink} format={(v) => pct(v)} />
              <Field label="Shapes for the blink">
                <div className="flex flex-wrap gap-1.5">
                  {BLINK_STEPS.map((n) => <Chip key={n} active={steps === n} onClick={() => setSteps(n)}>{STEP_LABEL[n]}</Chip>)}
                </div>
              </Field>
            </div>
          ),
        },
      ]}
      goals={LESSON_GOALS['morphs']}
      done={done}
      scene={() => shaped}
      explainTitle="A second shape, and a slider between"
      formula={{
        eq: <>blob = rest + amount × change</>,
        terms: [
          ['rest', 'the blob as it was built'],
          ['change', 'what one morph does to this blob: how far its center moves, and how the skin round it stretches'],
          ['amount', 'the slider: 0 is none of it, 1 is all, and nothing stops at either end'],
        ],
      }}
      explain={
        <>
          <p>
            A bone carries its blobs along rigidly. A morph gives every blob a small change of its own, and one slider scales all of
            them together. Changes add up, so a smile and a puff mix freely, and a negative amount runs one backward: the frown is
            the smile's numbers with a minus sign.
          </p>
          <p>
            On a mesh a morph only moves points, and the triangles between them stretch for free. Blobs have no triangles. Move just
            the centers and a swelling cheek is the same small blobs spread thinner, which is the left face. So each blob also keeps
            how the surface round it stretches and turns, and reshapes itself to match: the right face.
          </p>
          <p>
            A morph is a straight line from one shape to the other. That suits a cheek, and it fails a lid, which has to travel
            round a ball. In-between shapes bend the path, each at the price of another full set of numbers. A bone would turn the
            lid exactly, which is why faces in games use both.
          </p>
        </>
      }
    />
  )
}
