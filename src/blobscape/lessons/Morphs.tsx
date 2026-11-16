import { useMemo, useState } from 'react'
import type { Blobs } from '../../splat-core/blobs.ts'
import type { Orbit } from '../../splat-core/view.ts'
import { applyMorphs } from '../../splat-engine/morph.ts'
import { flankSpread, makePuffer, spikeLength, tailLength, tailWeights } from '../../splat-engine/puffer.ts'
import { Slider } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS } from '../routes.ts'
import { Viewport, ZoomBar } from '../Viewport.tsx'
import { useGoals } from '../progress.ts'

const START: Orbit = { target: [-0.15, 1, 0], distance: 3.8, azimuth: 35, elevation: 12 }
/** Each half is narrow on a phone, so stand further back to fit the fish. */
const start = (): Orbit => (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches ? { ...START, distance: 5.6 } : START)

export function Morphs() {
  const [orbit, setOrbit] = useState<Orbit>(start)
  const [puff, setPuff] = useState(0)
  const [spikes, setSpikes] = useState(0)
  const [swing, setSwing] = useState(0)

  const fish = useMemo(() => makePuffer(), [])
  const rest = fish.body.blobs
  const moved = useMemo(() => rest.clone(), [rest])
  const shaped = useMemo(() => rest.clone(), [rest])
  const { version, spread } = useMemo(() => {
    const morphs = [fish.puff, fish.spikes, ...fish.tails]
    const weights = [puff, spikes, ...tailWeights(swing)]
    applyMorphs(rest, morphs, weights, moved, 'centers')
    applyMorphs(rest, morphs, weights, shaped, 'shape')
    return { version: Math.random(), spread: flankSpread(fish, moved) }
  }, [fish, rest, moved, shaped, puff, spikes, swing])
  const length = tailLength(swing)

  const done = useGoals('morphs', {
    spikes: spikes >= 0.9,
    thin: puff <= -0.4,
    past: Math.abs(swing) >= 1.4 && length > 1.08,
  })

  const view = (blobs: Blobs, label: string, title: string, testId: string) => (
    <figure className="relative h-full min-w-0" data-testid={testId}>
      <Viewport bare noZoom blobs={blobs} version={version} orbit={orbit} setOrbit={setOrbit} label={label} />
      <figcaption className="pointer-events-none absolute bottom-2.5 left-3 text-xs font-medium text-ink-muted sm:text-sm">{title}</figcaption>
    </figure>
  )
  const pct = (v: number) => `${Math.round(v * 100)}%`
  const doing = `${puff > 0.05 ? 'puffed up' : puff < -0.05 ? 'sucked thin' : 'at rest'}${spikes > 0.05 ? ', spikes out' : ''}${swing > 0.05 ? ', tail bent to its left' : swing < -0.05 ? ', tail bent to its right' : ''}`

  return (
    <LessonShell
      id="morphs"
      intro={<p>A pufferfish swells to twice its size and bristles with spikes, and no bone could do either. Here is one with no moving bones at all. What moves its blobs, and what goes wrong if only their centers move?</p>}
      view={
        <div className="relative h-full">
          <div className="grid h-full grid-cols-2 divide-x divide-rule-soft">
            {view(moved, `A pufferfish made of blobs, ${doing}. Only the blobs' centers have moved. Drag or use the arrow keys to orbit.`, 'Move the centers', 'moved-view')}
            {view(shaped, `The same pufferfish, ${doing}. Each blob has also stretched and turned with the skin under it. Drag or use the arrow keys to orbit.`, 'Move and reshape', 'shaped-view')}
          </div>
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(start)} />
        </div>
      }
      caption={
        <p data-testid="morph-readout">
          Blobs on the body sit <span className="tabular-nums text-ink">{spread.toFixed(1)}×</span> as far apart as built, and along a spike{' '}
          <span className="tabular-nums text-ink">{spikeLength(spikes).toFixed(1)}×</span>.
          The tail is <span className="tabular-nums text-ink">{pct(length)}</span> of its real length.
        </p>
      }
      groups={[
        {
          id: 'body',
          title: 'Body',
          note: 'each slider is one morph',
          content: (
            <div className="flex flex-col gap-3">
              <Slider label="Puff" value={puff} min={-0.5} max={1} step={0.05} onChange={setPuff} format={(v) => pct(v)} />
              <Slider label="Spikes" value={spikes} min={0} max={1} step={0.05} onChange={setSpikes} format={(v) => pct(v)} />
            </div>
          ),
        },
        {
          id: 'tail',
          title: 'Tail',
          note: 'it bends from its base, to either side',
          content: (
            <div className="flex flex-col gap-3">
              <Slider label="Swing" value={swing} min={-1.5} max={1.5} step={0.05} onChange={setSwing} format={(v) => (v ? `${pct(Math.abs(v))} ${v > 0 ? 'left' : 'right'}` : 'straight')} />
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
            them together. Changes add up, so the puff and the spikes mix freely, and a negative amount runs one backward: the thin
            fish is the puff's numbers with a minus sign.
          </p>
          <p>
            On a mesh a morph only moves points, and the triangles between them stretch for free. Blobs have no triangles. Move just
            the centers and a spike seven times as long is the same few small blobs in a dotted line, which is the left fish. So each
            blob also keeps how the surface round it stretches and turns, and reshapes itself to match: the right fish.
          </p>
          <p>
            The tail has two morphs, a bend to each side, and its base stays in the body because those blobs are told not to
            move. Its blobs turn as well as move, so on the left fish the fin's flat blobs still face the way they were built. A
            morph is a straight line from one shape to the other, which suits a swelling body and only roughly suits a bend:
            halfway there the tail is a little short, and pushed past its shape it grows instead of curling further. A bone would
            turn the tail exactly, which is why creatures use both.
          </p>
        </>
      }
    />
  )
}
