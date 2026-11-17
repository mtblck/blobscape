import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit, SplatView } from '../../splat-core/view.ts'
import { Blobs } from '../../splat-core/blobs.ts'
import { boneTail } from '../../splat-engine/body.ts'
import { poseBlobs } from '../../splat-engine/pose.ts'
import { posedPoint } from '../../splat-engine/rig.ts'
import { elfIdle, makeElf } from '../../splat-engine/zoo/elf.ts'
import { Button, Chip, Field, Slider, Toggle } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS } from '../routes.ts'
import { Viewport } from '../Viewport.tsx'
import { drawBones, themeColor } from '../overlay.ts'
import { useGoals } from '../progress.ts'
import { groundBlobs, slidAt, stand, walk, type FeetOptions, type GroundKind, type GroundSpec, type Standing } from '../feet/stand.ts'

const START: Orbit = { target: [0, 0.85, 0], distance: 4.8, azimuth: 66, elevation: 10 }
const BLOBS = 7000
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const KINDS: { id: GroundKind; label: string }[] = [
  { id: 'flat', label: 'Flat' }, { id: 'steps', label: 'Steps' }, { id: 'slope', label: 'Slope' }, { id: 'rocks', label: 'Rocks' },
]
/** What the height slider means for each ground, and where it starts. */
const HEIGHT: Record<GroundKind, { label: string; min: number; max: number; step: number; start: number; format: (v: number) => string }> = {
  flat: { label: 'Height', min: 0, max: 0, step: 1, start: 0, format: () => '—' },
  steps: { label: 'Step height', min: 0.02, max: 0.3, step: 0.01, start: 0.12, format: (v) => `${Math.round(v * 100)} cm` },
  slope: { label: 'Steepness', min: 0, max: 30, step: 1, start: 12, format: (v) => `${Math.round(v)}°` },
  rocks: { label: 'Rock height', min: 0.04, max: 0.25, step: 0.01, start: 0.14, format: (v) => `${Math.round(v * 100)} cm` },
}

/** Puts the ground's blobs after the elf's `n`. */
function addGround(out: Blobs, n: number, g: Blobs) {
  out.center.set(g.center.subarray(0, g.count * 3), n * 3)
  out.scale.set(g.scale.subarray(0, g.count * 3), n * 3)
  out.quat.set(g.quat.subarray(0, g.count * 4), n * 4)
  out.color.set(g.color.subarray(0, g.count * 3), n * 3)
  out.opacity.set(g.opacity.subarray(0, g.count), n)
  out.count = n + g.count
}

const cm = (m: number) => `${Math.round(Math.abs(m) * 100)} cm`

export function FeetOnTheGround() {
  const [orbit, setOrbit] = useState<Orbit>(START)
  const [kind, setKind] = useState<GroundKind>('flat')
  const [heights, setHeights] = useState(() => Object.fromEntries(KINDS.map((k) => [k.id, HEIGHT[k.id].start])) as Record<GroundKind, number>)
  const [at, setAt] = useState(0)
  const [feet, setFeet] = useState<FeetOptions>({ ik: false, hips: true, tilt: true })
  const [walking, setWalking] = useState(true)
  const [playing, setPlaying] = useState(() => !reduceMotion())
  const [bones, setBones] = useState(false)
  const [m, setM] = useState<Standing>({ worst: 0, sunk: 0, short: 0, tilt: 0, spread: 0, hipShift: 0 })

  const elf = useMemo(() => makeElf(BLOBS), [])
  const sk = elf.skeleton
  const tails = useMemo(() => sk.bones.map((_, i) => boneTail(sk.bones, i)), [sk])
  const spec: GroundSpec = { kind, height: heights[kind], at }
  // the ground's blob count depends only on its kind and height, so one buffer serves every frame as it slides
  const ground = useMemo(() => groundBlobs({ kind, height: heights[kind], at: 0 }), [kind, heights])
  // the view takes its size from the first blobs it is given, so it starts with the elf and the ground in it
  const shown = useMemo(() => {
    const b = new Blobs(elf.blobs.count + ground.count)
    // posing moves blobs; their colors are copied once here
    b.color.set(elf.blobs.color.subarray(0, elf.blobs.count * 3))
    b.opacity.set(elf.blobs.opacity.subarray(0, elf.blobs.count))
    poseBlobs(elf.blobs, elf.skin, sk, 'quat', b)
    addGround(b, elf.blobs.count, ground)
    return b
  }, [elf, sk, ground])

  // The live state the animation loop reads, without restarting it on every change
  const live = useRef({ spec, feet, walking, playing, ground, shown, t: 0 })
  live.current = { spec, feet, walking, playing, ground, shown, t: live.current.t }
  const view = useRef<SplatView | null>(null)

  // Poses the elf for the time now, lays it on the ground, measures it and sends it to the view
  const show = () => {
    const l = live.current
    let measured: Standing
    // walking, the ground slides back under the elf as fast as a planted foot; standing, the slider places it
    if (l.walking) measured = walk(sk, l.spec, l.t, l.feet)
    else { elfIdle(sk, l.t); measured = stand(sk, l.spec, l.feet) }
    groundBlobs({ ...l.spec, at: l.walking ? slidAt(l.spec.kind, l.t) : l.spec.at }, undefined, l.ground)
    poseBlobs(elf.blobs, elf.skin, sk, 'quat', l.shown)
    addGround(l.shown, elf.blobs.count, l.ground)
    void view.current?.sync(l.shown)
    return measured
  }

  useEffect(() => {
    let raf = 0, last = performance.now(), lastUi = 0
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000))
      last = now
      const l = live.current
      if (l.playing) {
        l.t += dt
        const measured = show()
        // the readout follows at a calmer rate than the animation
        if (now - lastUi > 100) { lastUi = now; setM(measured) }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // show reads everything it needs from refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Paused, or a setting changed: show it at once
  useEffect(() => { setM(show()) }, [kind, heights, at, feet, walking, playing]) // eslint-disable-line react-hooks/exhaustive-deps

  const steps = kind === 'steps'
  // a leg seen coming up short with the hips held, on the steps: the reach goal wants it fixed after
  const sawShort = useRef(false)
  if (steps && feet.ik && !feet.hips && m.short > 0.03) sawShort.current = true
  const done = useGoals('feet', {
    sink: !feet.ik && kind !== 'flat' && m.sunk >= 0.04,
    plant: steps && walking && feet.ik && m.spread >= 0.08 && Math.abs(m.worst) < 0.01 && m.short < 0.01,
    reach: sawShort.current && steps && feet.ik && feet.hips && m.spread >= 0.1 && m.short < 0.01,
    tilt: kind === 'slope' && heights.slope >= 15 && feet.ik && m.tilt < 3,
  })

  const h = HEIGHT[kind]
  const set = (k: keyof FeetOptions) => (v: boolean) => setFeet((f) => ({ ...f, [k]: v }))
  const footSays = Math.abs(m.worst) < 0.005
    ? <span className="text-ink">on its ground</span>
    : m.worst < 0 ? <><span className="tabular-nums text-ink">{cm(m.worst)}</span> into the ground</> : <>floating <span className="tabular-nums text-ink">{cm(m.worst)}</span> over it</>

  return (
    <LessonShell
      id="feet"
      intro={<p>A walk is made on flat ground. Put the walker on steps or a slope and every foot is wrong by the height of the ground under it. How does a game keep feet on the ground without a walk for every staircase?</p>}
      view={
        <Viewport
          bare
          blobs={shown}
          version={0}
          orbit={orbit}
          setOrbit={setOrbit}
          label={`A blob elf ${walking ? 'walking, the ground sliding back under it,' : 'standing'} on ${kind === 'flat' ? 'a flat path' : kind === 'steps' ? `steps ${cm(heights.steps)} tall` : kind === 'slope' ? `a ${Math.round(heights.slope)}° slope` : `rocks ${cm(heights.rocks)} tall`}, ${feet.ik ? 'its legs bent to the ground' : 'its legs as the walk made them'}. Drag or use the arrow keys to orbit.`}
          hint="drag to orbit · scroll to zoom"
          onView={(v) => { view.current = v; v.setFloor(false); show() }}
          overlay={
            bones
              ? (ctx, lens) => drawBones(ctx, sk.bones.map((_, i) => ({ from: sk.posedHead.subarray(i * 3, i * 3 + 3), to: posedPoint(sk, i, tails[i]) })), lens, themeColor('accent', ctx.canvas))
              : undefined
          }
        />
      }
      caption={
        <p data-testid="feet-readout">
          Worst foot: {footSays}.
          {feet.ik && m.short > 0.005 && <> A leg is <span className="tabular-nums text-ink">{cm(m.short)}</span> short.</>}
          {kind !== 'flat' && <> Soles off the ground by <span className="tabular-nums text-ink">{Math.round(m.tilt)}°</span>.</>}
        </p>
      }
      groups={[
        {
          id: 'ground',
          title: 'Ground',
          note: 'what the elf stands on',
          span: 1.3,
          content: (
            <>
              <Field label="Ground">
                <div className="flex flex-wrap gap-1.5">
                  {KINDS.map((k) => <Chip key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</Chip>)}
                </div>
              </Field>
              {kind !== 'flat' && <Slider label={h.label} value={heights[kind]} min={h.min} max={h.max} step={h.step} onChange={(v) => setHeights((s) => ({ ...s, [kind]: v }))} format={h.format} />}
              {kind !== 'flat' && !walking && <Slider label="Stand at" value={at} min={0} max={0.6} step={0.01} onChange={setAt} format={(v) => `${Math.round(v * 100)} cm`} />}
            </>
          ),
        },
        {
          id: 'feet',
          title: 'Feet',
          note: 'inverse kinematics',
          span: 1.3,
          content: (
            <>
              <Toggle label="Bend the legs to the ground" checked={feet.ik} onChange={set('ik')} />
              <Toggle label="Move the hips to the lower foot" checked={feet.hips} onChange={set('hips')} disabled={!feet.ik} />
              <Toggle label="Turn the feet to the slope" checked={feet.tilt} onChange={set('tilt')} disabled={!feet.ik} />
            </>
          ),
        },
        {
          id: 'move',
          title: 'Move',
          content: (
            <>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={walking} onClick={() => setWalking(true)}>Walk</Chip>
                <Chip active={!walking} onClick={() => setWalking(false)}>Stand</Chip>
                <Button small onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>{playing ? 'Pause' : 'Play'}</Button>
              </div>
              <Toggle label="Bones" checked={bones} onChange={setBones} />
            </>
          ),
        },
      ]}
      goals={LESSON_GOALS['feet']}
      done={done}
      scene={() => shown}
      explainTitle="Two bones, one triangle"
      formula={{
        eq: <>cos θ = (a² + d² − b²) ÷ 2ad</>,
        terms: [
          ['a, b', 'the thigh and the shin: their lengths never change'],
          ['d', 'how far the hip is from where the ankle has to go'],
          ['θ', 'how far the thigh turns off the line from hip to ankle; the knee goes the side it already bends'],
        ],
      }}
      explain={
        <>
          <p>
            The elf walks on the spot and the ground slides back under it, exactly as fast as a planted foot moves, so a
            foot that is down stays on its patch of ground. On steps and slopes the ground also sinks as it slides, one
            step's height for every step's depth, like an escalator, so the elf climbs without going anywhere.
          </p>
          <p>
            Each foot is planned before its leg is bent. Down, it rides back with its tread. Up, it swings to where it
            lands next and rises early enough to clear the highest ground on the way, so a toe never catches a step's edge.
            Hip, knee and ankle make a triangle whose sides are known, so the knee has one place to go (two, mirror images,
            and it keeps the side it bent to). That is two-bone inverse kinematics, the same sum a game engine runs on every
            leg, every frame.
          </p>
          <p>
            A leg can only reach as far as it is long. Climbing, the foot behind sinks with its tread, so the hips come down
            by whatever that foot needs and the front knee bends more. The foot is its own bone, so it is turned last, by
            the slope under it, measured from the ground's height either side.
          </p>
        </>
      }
    />
  )
}
