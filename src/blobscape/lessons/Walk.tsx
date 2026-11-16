import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit, SplatView } from '../../splat-core/view.ts'
import { TAILS, makeCreature } from '../../splat-engine/creature.ts'
import { poseBlobs } from '../../splat-engine/pose.ts'
import { Skeleton, posedPoint } from '../../splat-engine/rig.ts'
import { KEYS, footSpeed, keyPose, keysUsed, poseKeys, type WalkTiming } from '../../splat-engine/walk.ts'
import { Button, Chip, Field, Slider, Toggle } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS } from '../routes.ts'
import { Viewport } from '../Viewport.tsx'
import { drawBones, themeColor } from '../overlay.ts'
import { useGoals } from '../progress.ts'

const START: Orbit = { target: [0, 0.65, 0], distance: 4.4, azimuth: 72, elevation: 12 }
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function Walk() {
  const [orbit, setOrbit] = useState<Orbit>(START)
  const [keys, setKeys] = useState<2 | 4>(4)
  const [hold, setHold] = useState(false)
  const [cycle, setCycle] = useState(0.9)
  const [ground, setGround] = useState(0)
  const [playing, setPlaying] = useState(() => !reduceMotion())
  const [phase, setPhase] = useState(0)
  const [bones, setBones] = useState(false)

  const fox = useMemo(() => makeCreature(6000), [])
  const shown = useMemo(() => fox.blobs.clone(), [fox])
  const sk = fox.skeleton
  const timing: WalkTiming = { keys, hold, cycle }
  const feetSpeed = useMemo(() => footSpeed(new Skeleton(sk.bones), cycle), [sk, cycle])
  const slip = Math.abs(ground - feetSpeed)
  const gripping = slip <= feetSpeed * 0.1

  // The live state the animation loop reads, without restarting it on every change
  const live = useRef({ timing, ground, playing, phase, bones })
  live.current = { timing, ground, playing, phase: live.current.phase, bones }
  const view = useRef<SplatView | null>(null)
  const shift = useRef(0)

  // Poses the fox for a point in the cycle and sends it to the view
  const show = (u: number) => {
    poseKeys(sk, u * live.current.timing.cycle, live.current.timing)
    poseBlobs(fox.blobs, fox.skin, sk, 'quat', shown)
    void view.current?.sync(shown)
  }

  useEffect(() => {
    let raf = 0, last = performance.now(), lastUi = 0
    const tick = (now: number) => {
      // rAF's first timestamp can be a little before performance.now()
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000))
      last = now
      const l = live.current
      if (l.playing) {
        l.phase = (l.phase + dt / l.timing.cycle) % 1
        shift.current -= l.ground * dt
        view.current?.setFloorShift(shift.current)
        show(l.phase)
        // the slider and readout follow at a calmer rate than the animation
        if (now - lastUi > 80) { lastUi = now; setPhase(l.phase) }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // show reads everything it needs from refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Paused: changes to the keys still show at once
  useEffect(() => { if (!playing) show(live.current.phase) }, [keys, hold, playing]) // eslint-disable-line react-hooks/exhaustive-deps

  // Seconds played with each setting, so a goal needs you to have watched it, not just flicked a switch
  // (time since the last render counts for the settings it was played with, so a pause counts for nothing)
  const watched = useRef({ two: 0, hold: 0, at: performance.now(), was: { playing, keys, hold, cycle } })
  useEffect(() => {
    const w = watched.current
    const now = performance.now()
    const dt = (now - w.at) / 1000
    const p = w.was
    w.at = now
    w.was = { playing, keys, hold, cycle }
    if (!p.playing) return
    if (p.keys === 2) w.two += dt
    if (p.keys === 4 && p.hold && p.cycle >= 1.2) w.hold += dt
  })

  const before = useRef(new Set<string>())
  const done = useGoals('walk', {
    two: watched.current.two >= 1.5,
    hold: watched.current.hold >= 1.5,
    grip: playing && keys === 4 && !hold && gripping,
    run: before.current.has('grip') && playing && keys === 4 && !hold && cycle <= 0.45 && gripping,
  })
  before.current = done

  const pose = keyPose(phase, timing)
  const used = keysUsed(keys)
  const now = used[Math.floor(phase * used.length) % used.length]

  return (
    <LessonShell
      id="walk"
      intro={<p>An animator draws a walk as a handful of poses. The computer fills in everything between them. Which poses matter, and what makes the feet look planted?</p>}
      view={
        <Viewport
          bare
          blobs={shown}
          version={0}
          orbit={orbit}
          setOrbit={setOrbit}
          label={`A blob fox walking on the spot from ${keys} key poses, ${hold ? 'held' : 'in-betweened'}, one step every ${cycle.toFixed(2)} seconds, over ground moving at ${ground.toFixed(2)} meters a second. Drag or use the arrow keys to orbit.`}
          hint="drag to orbit · scroll to zoom"
          onView={(v) => { view.current = v; v.setFloor(true, '#8a8a8a'); show(live.current.phase) }}
          overlay={
            bones
              ? (ctx, lens) => drawBones(ctx, sk.bones.map((b, i) => ({ from: sk.posedHead.subarray(i * 3, i * 3 + 3), to: posedPoint(sk, i, TAILS[b.name]) })), lens, themeColor('accent', ctx.canvas))
              : undefined
          }
        />
      }
      caption={
        <p data-testid="slip">
          Planted feet move back at <span className="tabular-nums text-ink">{feetSpeed.toFixed(2)} m/s</span>, the ground at{' '}
          <span className="tabular-nums text-ink">{ground.toFixed(2)} m/s</span>:{' '}
          {gripping ? <span className="text-ink">the feet grip.</span> : <>the feet slide <span className="tabular-nums text-ink">{Math.round(slip * 100)} cm</span> every second.</>}
        </p>
      }
      groups={[
        {
          id: 'keys',
          title: 'Key poses',
          note: 'what the animator draws',
          content: (
            <>
              <Field label="Keys">
                <div className="flex flex-wrap gap-1.5">
                  <Chip active={keys === 2} onClick={() => setKeys(2)}>2: contacts only</Chip>
                  <Chip active={keys === 4} onClick={() => setKeys(4)}>4: with passing</Chip>
                </div>
              </Field>
              <Toggle label="Hold each key (no in-betweens)" checked={hold} onChange={setHold} />
            </>
          ),
        },
        {
          id: 'timeline',
          title: 'Timeline',
          note: 'one full cycle',
          span: 1.4,
          content: (
            <>
              <div className="flex items-center gap-3">
                <Button small onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>{playing ? 'Pause' : 'Play'}</Button>
                <span className="text-sm text-ink-muted" aria-live="off">Now: <b className="font-semibold text-ink">{KEYS[now].name}</b>{!hold && <span className="text-ink-faint"> → {KEYS[used[(used.indexOf(now) + 1) % used.length]].name}</span>}</span>
              </div>
              <div>
                <Slider label="Scrub" value={phase} min={0} max={0.999} step={0.001} onChange={(v) => { setPlaying(false); live.current.phase = v; setPhase(v); show(v) }} format={(v) => `${Math.round(v * 100)}%`} />
                <ol aria-label="Keys on the timeline" className="relative mt-1 h-8 text-[0.7rem] text-ink-faint">
                  {used.map((k, j) => (
                    <li key={j} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(j / used.length) * 100}%` }}>
                      <span aria-hidden className="mx-auto block h-1.5 w-0.5 bg-ink-faint" />{KEYS[k].name}
                    </li>
                  ))}
                </ol>
              </div>
              <span className="sr-only">Pose now: hips swing {pose.swing.map((s) => Math.round((s * 180) / Math.PI)).join(' and ')} degrees.</span>
            </>
          ),
        },
        {
          id: 'timing',
          title: 'Timing',
          content: <Slider label="Step time" value={cycle} min={0.3} max={2} step={0.05} onChange={setCycle} format={(v) => `${v.toFixed(2)} s`} />,
        },
        {
          id: 'ground',
          title: 'Ground',
          note: 'slides under the fox',
          content: (
            <>
              <Slider label="Speed" value={ground} min={0} max={4} step={0.05} onChange={setGround} format={(v) => `${v.toFixed(2)} m/s`} />
              <Toggle label="Bones" checked={bones} onChange={setBones} />
            </>
          ),
        },
      ]}
      goals={LESSON_GOALS['walk']}
      done={done}
      scene={() => shown}
      explainTitle="Poses, timing and grip"
      formula={{
        eq: <>speed = stride ÷ ½ step</>,
        terms: [
          ['stride', 'how far a foot travels from touching down to lifting off'],
          ['½ step', 'how long it stays down: half the cycle, in a trot'],
          ['speed', 'how fast the ground must move for that foot to grip'],
        ],
      }}
      explain={
        <>
          <p>
            Two contact poses aren't a walk: blending straight from one to the other swings every leg like a pendulum, so the feet
            scrape forward through the floor. The passing poses, with a knee folded, are what lift them. Held without in-betweens,
            four poses read as a flip-book; the frames the computer blends between keys are most of the motion.
          </p>
          <p>
            A walk on the spot only looks planted when the ground moves exactly as fast as a foot that's down. Halve the step time
            and that speed doubles. Game engines do the same sum the other way round, moving a character at the speed its feet
            say. The last lesson takes this walking fox out of Blobscape.
          </p>
        </>
      }
    />
  )
}
