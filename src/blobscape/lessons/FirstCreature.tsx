import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../../splat-core/orbit.ts'
import type { Stage } from '../../splat-engine/stage.ts'
import { Swing } from '../../splat-engine/swing.ts'
import { Chip, Field, Slider, Toggle } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS } from '../routes.ts'
import { ZoomBar } from '../Viewport.tsx'
import { useGoals } from '../progress.ts'
import { StageView } from '../build/StageView.tsx'
import { SLUG_COUNTS, SLUG_START, SLUG_SWING, makeSlug, poseSlug, slugCode, tear, tipOff, turning, type Listens, type SlugOptions } from '../build/slug.ts'

const START: Orbit = { target: [0, 0.3, -0.15], distance: 3, azimuth: 60, elevation: 30 }
/** A tear under this many grid spacings reads as a smooth bend. */
const SMOOTH = 0.5

declare global { interface Window { __build?: { stage: Stage; tear: () => number; lag: () => number } } }

export function FirstCreature() {
  const [orbit, setOrbit] = useState<Orbit>(START)
  const [stage, setStage] = useState<Stage>()
  const [opts, setOpts] = useState<SlugOptions>(SLUG_START)
  const [wag, setWag] = useState(0)
  const [turn, setTurn] = useState(false)
  const [swing, setSwing] = useState(false)
  // cutting takes a moment: the view shows the loading mark while the controls' slug is cut, a beat after the change
  const [slug, setSlug] = useState(() => makeSlug(SLUG_START))
  const [cutting, setCutting] = useState(false)
  const madeFor = useRef(SLUG_START)
  useEffect(() => {
    if (madeFor.current === opts) return
    setCutting(true)
    const t = setTimeout(() => { madeFor.current = opts; setSlug(makeSlug(opts)); setCutting(false) }, 120)
    return () => clearTimeout(t)
  }, [opts])

  // what the view shows, measured on the CPU from the same pose
  const sk = slug.skeleton
  const { torn, still } = useMemo(() => { poseSlug(sk, wag); return { torn: tear(slug), still: tipOff(sk) } }, [slug, sk, wag])
  const [lag, setLag] = useState(0)

  useEffect(() => { if (stage) stage.setActor(slug) }, [stage, slug])
  useEffect(() => {
    if (!stage) return
    stage.setPoser(turn ? (s, t) => turning(s, t, wag) : (s) => poseSlug(s, wag))
    stage.setSwing(swing ? new Swing(slug.skeleton, SLUG_SWING) : undefined)
  }, [stage, slug, wag, turn, swing])
  // how far the tail trails the body while it turns: the most over the last couple of seconds
  useEffect(() => {
    if (!stage || !turn) { setLag(0); return }
    let most = 0, n = 0
    const id = setInterval(() => {
      most = Math.max(most * 0.9, Math.abs(tipOff(slug.skeleton) - still))
      if (++n % 3 === 0) setLag(most)
    }, 100)
    return () => clearInterval(id)
  }, [stage, slug, turn, swing, still])

  useEffect(() => {
    if (!stage) return
    window.__build = { stage, tear: () => torn, lag: () => tipOff(slug.skeleton) }
    return () => { delete window.__build }
  })

  const bent = opts.listens === 'both' && Math.abs(wag) >= 0.5
  const done = useGoals('first-creature', {
    bend: bent,
    smooth: bent && Math.abs(wag) >= 0.8 && torn < SMOOTH,
    swing: turn && swing && lag > 0.12,
  })
  const set = (o: Partial<SlugOptions>) => setOpts((was) => ({ ...was, ...o }))
  const doing = `${opts.listens === 'both' ? 'its skin on both bones' : 'its skin on the body bone only'}, the tail bone turned ${Math.round((wag * 180) / Math.PI)}°${turn ? ', turning from side to side' : ''}${swing ? ', its tail swinging' : ''}`
  const LISTENS: { id: Listens; label: string }[] = [{ id: 'body', label: "['body']" }, { id: 'both', label: "['body', 'tail']" }]

  return (
    <LessonShell
      id="first-creature"
      intro={<p>Every creature on this site is a few shapes and a few bones, written in code. Here is the smallest: a slug on two bones. What does a shape need to be told before it bends with a bone?</p>}
      view={
        <div className="relative h-full">
          <StageView orbit={orbit} setOrbit={setOrbit} onStage={setStage} label={`A slug made of ${slug.blobs.count.toLocaleString()} blobs, ${doing}.`} waiting={cutting ? 'Cutting the slug into blobs…' : undefined} />
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(START)} />
        </div>
      }
      caption={
        <p data-testid="slug-readout">
          <span className="tabular-nums text-ink">{slug.blobs.count.toLocaleString()}</span> blobs on 2 bones. Where the tail joins, the skin has pulled{' '}
          <span className="tabular-nums text-ink">{torn.toFixed(1)}</span> blobs apart{turn ? <>, and the tail trails <span className="tabular-nums text-ink">{Math.round(lag * 100)} cm</span> behind</> : ''}.
        </p>
      }
      groups={[
        {
          id: 'skin',
          title: 'Skin',
          note: 'the shape, cut into blobs',
          content: (
            <div className="flex flex-col gap-3">
              <Field label="bones: the skin listens to">
                <div className="flex flex-wrap gap-1.5">
                  {LISTENS.map((l) => <Chip key={l.id} active={opts.listens === l.id} onClick={() => set({ listens: l.id })}><code>{l.label}</code></Chip>)}
                </div>
              </Field>
              <Slider label="blend: how far a weight spreads" value={opts.blend} min={0.01} max={0.3} step={0.01} onChange={(v) => set({ blend: v })} format={(v) => v.toFixed(2)} />
              <Field label="Blobs">
                <div className="flex flex-wrap gap-1.5">
                  {SLUG_COUNTS.map((n) => <Chip key={n} active={opts.count === n} onClick={() => set({ count: n })}>{n.toLocaleString()}</Chip>)}
                </div>
              </Field>
            </div>
          ),
        },
        {
          id: 'pose',
          title: 'Pose',
          note: 'bones turned',
          content: <Slider label="Turn the tail bone" value={wag} min={-1.2} max={1.2} step={0.05} onChange={setWag} format={(v) => `${Math.round((v * 180) / Math.PI)}°`} />,
        },
        {
          id: 'move',
          title: 'Move',
          note: 'a pose from the time',
          content: (
            <div className="flex flex-col gap-3">
              <Toggle label="Turn from side to side" checked={turn} onChange={setTurn} />
              <Toggle label="Swing the tail" checked={swing} onChange={setSwing} />
            </div>
          ),
        },
      ]}
      goals={LESSON_GOALS['first-creature']}
      done={done}
      scene={() => slug.blobs}
      explainTitle="Shapes, bones, and who listens to whom"
      formula={{
        eq: <>blob = Σ weight × bone × rest</>,
        terms: [
          ['rest', 'where the blob was cut, on the grid'],
          ['bone', 'how far each bone it listens to has turned and moved'],
          ['weight', 'its share of each bone, from how near it sits: blend sets how far that reaches'],
        ],
      }}
      explain={
        <>
          <p>
            The engine makes a creature the way the pixel scenes are made. Shapes are distance functions, a grid is laid through
            them, and every cell on a surface becomes one blob, colored and shaded where it sits. Each part of the creature names
            the bones that move it, and each of its blobs takes a share of those bones by how near it is.
          </p>
          <p>
            A bone no part names moves nothing, so the tail bone turned and the slug didn&rsquo;t notice. Named, but with each blob
            given wholly to its nearest bone, the skin folds where one bone hands over to the other. Let a weight reach a little
            way and the blobs near the join take some of each, turn part of the way, and the bend runs smoothly round.
          </p>
          <p>
            A pose is just bones turned, from the time, and the engine moves every blob on the graphics card from them. The swing
            sits on top of that: the tail&rsquo;s end is pulled toward where the pose puts it, loosely, with a little weight, so it
            trails, overshoots and settles. Nothing in the move changed.
          </p>
        </>
      }
      code={{
        title: 'This slug, as code',
        note: (
          <>
            <p>The same slug, with the settings you chose, written with the engine package. Paste it into a page with a canvas, with three.js installed.</p>
            <p>Install it with <code>npm install @blobscape/engine three</code>.</p>
          </>
        ),
        source: slugCode(opts, swing),
      }}
    />
  )
}
