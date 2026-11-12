import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../../splat-core/view.ts'
import { Chip, Slider, Toggle } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS } from '../routes.ts'
import { ZoomBar } from '../Viewport.tsx'
import { useGoals } from '../progress.ts'
import { CHECK_VIEWS, DISTANCE, PHOTO, match, orbitCam, type Model } from '../shoot/train3d.ts'
import { subject } from '../shoot/subject.ts'
import { CAPTURES, NO_CUTS, cutMask, keepOnly, markCut, type CaptureId, type Cuts } from '../shoot/cleanup.ts'
import { CpuView, toBlobs } from '../shoot/views.tsx'
import type { FromShoot, ToShoot } from '../shoot/shoot.worker.ts'

const START: Orbit = { target: [0, 0, 0], distance: DISTANCE * 1.35, azimuth: 120, elevation: 15 }
const start = (): Orbit => (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches ? { ...START, distance: DISTANCE * 1.7 } : START)
/** "Largest blob kept" at its top end means no cut. */
const HUGE_OFF = 0.25

const truth = subject()
const checks = CHECK_VIEWS.map(([a, e]) => orbitCam(a, e, PHOTO))

interface Trained { model: Model; photos: number; all: number }

export function Floaters() {
  const [orbit, setOrbit] = useState<Orbit>(start)
  const [capture, setCapture] = useState<CaptureId>('quick')
  const [cuts, setCuts] = useState<Cuts>(NO_CUTS)
  const [showCut, setShowCut] = useState(true)
  const [trained, setTrained] = useState<Partial<Record<CaptureId, Trained>>>({})
  const [progress, setProgress] = useState(0)

  // Train each capture once, in the Photo shoot's worker, and keep the result
  const worker = useRef<Worker | null>(null)
  const runs = useRef(new Map<number, CaptureId>())
  const run = useRef(0)
  useEffect(() => {
    const w = new Worker(new URL('../shoot/shoot.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    w.onmessage = (e: MessageEvent<FromShoot>) => {
      const m = e.data
      const id = runs.current.get(m.run)
      if (!id || m.run !== run.current) return
      if (m.type === 'progress') setProgress(m.step / m.total)
      else if (m.type === 'done') { setProgress(1); setTrained((t) => ({ ...t, [id]: { model: m.model, photos: m.photos, all: m.all } })) }
    }
    return () => w.terminate()
  }, [])
  useEffect(() => {
    if (trained[capture]) return
    setProgress(0)
    const r = ++run.current
    runs.current.set(r, capture)
    worker.current?.postMessage({ type: 'train', run: r, azimuths: [...CAPTURES.find((c) => c.id === capture)!.azimuths], elevation: 20 } satisfies ToShoot)
    // trained is read only to skip a capture already done; a new result shouldn't start another run
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture])

  const now = trained[capture]
  const cams = useMemo(() => CAPTURES.find((c) => c.id === capture)!.azimuths.map((a) => orbitCam(a, 20, PHOTO)), [capture])
  // The cuts apply a moment after a slider stops, not on every step of a drag
  const [applied, setApplied] = useState(cuts)
  useEffect(() => { const t = setTimeout(() => setApplied(cuts), 150); return () => clearTimeout(t) }, [cuts])
  const mask = useMemo(() => (now ? cutMask(now.model, applied) : undefined), [now, applied])
  const kept = useMemo(() => (now ? keepOnly(now.model, mask) : null), [now, mask])
  const marked = useMemo(() => (now ? markCut(now.model, mask) : null), [now, mask])
  const after = useMemo(() => (kept && now ? (mask ? { photos: match(kept, truth, cams), all: match(kept, truth, checks) } : { photos: now.photos, all: now.all }) : null), [kept, now, mask, cams])
  const cutCount = now && kept ? now.model.count - kept.count : 0

  const ready = !!now && !!after && applied === cuts
  const done = useGoals('floaters', {
    free: ready && cutCount >= now.model.count / 3 && Math.abs(after.all - now.all) <= 0.01 && Math.abs(after.photos - now.photos) <= 0.01,
    clear: ready && capture === 'quick' && after.all - now.all >= 0.05 && after.photos >= 0.98,
    far: ready && after.photos < 0.95,
    retake: ready && capture === 'round' && now.all >= 0.95,
  })

  const pct = (v: number) => `${Math.round(v * 100)}%`
  const set = (k: keyof Cuts) => (v: number) => setCuts((c) => ({ ...c, [k]: v }))

  return (
    <LessonShell
      id="floaters"
      intro={<p>Two quick photos gave this bird blobs hanging in the air. Scan apps offer cuts to clean them away. How much can cutting fix, and what can't it?</p>}
      view={
        <div className="relative h-full">
          <div className="grid h-full grid-cols-2 divide-x divide-rule-soft">
            <CpuView model={showCut ? marked : now?.model ?? null} orbit={orbit} setOrbit={setOrbit} title={now ? (showCut ? 'The capture, cuts in red' : 'The capture') : `Training ${Math.round(progress * 100)}%`} testId="view-capture" label="The trained capture, with blobs about to be cut shown red." />
            <CpuView model={kept} orbit={orbit} setOrbit={setOrbit} title="After cleanup" testId="view-cleaned" label="What's left after the cuts." />
          </div>
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(start())} />
        </div>
      }
      caption={
        <p className="tabular-nums" data-testid="floaters-readout">
          {now && after ? (
            <>
              Cut <b className="text-ink">{cutCount}</b> of {now.model.count} blobs. Every side <b className="text-ink">{pct(now.all)} → {pct(after.all)}</b>, your photos <b className="text-ink">{pct(now.photos)} → {pct(after.photos)}</b>.
            </>
          ) : 'Training the capture…'}
        </p>
      }
      groups={[
        {
          id: 'capture',
          title: 'Capture',
          note: 'the photos it was trained from',
          content: (
            <div className="flex flex-wrap gap-1.5">
              {CAPTURES.map((c) => <Chip key={c.id} active={capture === c.id} onClick={() => setCapture(c.id)}>{c.name}</Chip>)}
            </div>
          ),
        },
        {
          id: 'cuts',
          title: 'Cuts',
          note: 'the ones scan apps offer',
          span: 2,
          cols: 3,
          content: (
            <>
              <Slider label="Faint" value={cuts.faint} min={0} max={0.6} step={0.01} onChange={set('faint')} format={(v) => (v ? `under ${Math.round(v * 100)}%` : 'off')} />
              <Slider label="Largest blob kept" value={cuts.huge || HUGE_OFF} min={0.03} max={HUGE_OFF} step={0.005} onChange={(v) => set('huge')(v >= HUGE_OFF ? 0 : v)} format={(v) => (v >= HUGE_OFF ? 'any size' : `${Math.round(v * 100)} cm`)} />
              <Slider label="Floaters" value={cuts.floaters} min={0} max={1} step={0.05} onChange={set('floaters')} format={(v) => (v ? `${Math.round(v * 100)}%` : 'off')} />
            </>
          ),
        },
        {
          id: 'show',
          title: 'Show',
          content: <Toggle label="Cut blobs in red" checked={showCut} onChange={setShowCut} />,
        },
      ]}
      goals={LESSON_GOALS['floaters']}
      done={done}
      scene={() => toBlobs(kept ?? truth)}
      explainTitle="Cleanup can’t add what no camera saw"
      explain={
        <>
          <p>
            Every cut here looks at one number per blob and nothing else: how faint it is, how big it is, or whether it sits in a
            clump with others. None of them knows what a bird is. Turned up gently they take out blobs you'd never miss, which
            makes the file smaller for free, and strays out in the air. Turned up hard they start on the bird.
          </p>
          <p>
            And they can't touch the real problem with two photos side by side: the far side of the bird is guesswork, and the
            guesses sit right where the bird should be, so they look like bird to every cut. Eight photos round it fix that before
            training even starts. That's why scan apps nag you to walk all the way round, and why Scan Studio's cleanup is
            for tidying a good capture, not rescuing a bad one.
          </p>
        </>
      }
    />
  )
}
