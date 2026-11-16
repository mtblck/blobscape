import { LESSONS, LESSON_COUNT, LESSON_GOALS, href } from './routes.ts'
import { doneGoals } from './progress.ts'
import { useFocusHeading } from './Shell.tsx'
import { EXPERIMENTS } from './site.ts'
import { Cover } from './Experiments.tsx'
import { AnyAngleDiagram, BlobDefs, HeroDiagram, LessonGlyph, PhotosDiagram, SANDBOX_COUNTS, SandboxDiagram, TrainDiagram } from './diagrams.tsx'

const PROMISES = [`${LESSON_COUNT[0].toUpperCase()}${LESSON_COUNT.slice(1)} hands-on lessons`, 'A sandbox for real captures', 'Runs in your browser', 'Free, no account']

const STEPS = [
  { title: 'Photograph something from all round', body: 'A capture starts as a few hundred ordinary photos or a phone video.', picture: <PhotosDiagram /> },
  { title: 'Train blobs to match the photos', body: 'Blobs are scattered, rendered, compared with each photo and nudged, thousands of times over.', picture: <TrainDiagram /> },
  { title: 'Look at it from anywhere', body: 'What’s left is a list of blobs your browser can draw from any angle, fast.', picture: <AnyAngleDiagram /> },
]

const SANDBOX_POINTS = [
  'Spray, select with a box or lasso, move, recolor and delete',
  'Effects that explode, melt, twist and ripple the whole scene',
  'Open your own .ply, .spz, .splat, .ksplat or .sog capture, and save a standard .ply',
]

const EFFECTS = ['Explode', 'Melt', 'Wind', 'Twist', 'Wave', 'Dissolve']

const WIDTH = 'mx-auto w-full max-w-6xl'
const PRIMARY = 'inline-flex min-h-11 items-center rounded-lg bg-accent px-5 font-medium text-paper no-underline transition-colors hover:bg-accent-ink'
const QUIET = 'inline-flex min-h-11 items-center rounded-lg border border-rule px-5 font-medium text-ink no-underline transition-colors hover:border-ink-faint hover:bg-paper-sunk'
const CHIP = 'self-start rounded-full bg-placard px-3 py-1 text-xs font-semibold text-placard-ink'

function Dot() {
  return <span aria-hidden className="size-2 shrink-0 translate-y-[-1px] rounded-full bg-accent" />
}

export function Landing() {
  const h1 = useFocusHeading()
  const progress = LESSONS.map((l) => LESSON_GOALS[l.id].filter((g) => doneGoals(l.id).has(g.id)).length)
  const started = progress.some((n) => n > 0)
  const next = LESSONS.find((l, i) => progress[i] < LESSON_GOALS[l.id].length) ?? LESSONS[0]

  return (
    <div className="flex flex-col">
      <BlobDefs />

      <section aria-labelledby="hero-title" className={`${WIDTH} grid items-center gap-10 pt-10 pb-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:pt-16 lg:pb-20`}>
        <div className="flex flex-col gap-6">
          <h1 ref={h1} tabIndex={-1} id="hero-title" className="font-display text-5xl leading-[1.05] text-balance outline-none sm:text-6xl">
            Learn 3D splats by taking them apart
          </h1>
          <p className="max-w-[44ch] text-xl leading-relaxed text-ink-muted">
            A Gaussian splat is a 3D scene made of nothing but soft, colored, see-through blobs. Learn what one blob is, then pile up
            thousands and pull real scenes to pieces.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a href={href({ page: 'lesson', id: next.id })} className={PRIMARY}>
              {started ? `Carry on: ${next.title}` : 'Start with one blob'}
            </a>
            <a href={href({ page: 'sandbox' })} className={QUIET}>Open the sandbox</a>
          </div>
        </div>
        <HeroDiagram />
      </section>

      <div className={`${WIDTH} rounded-2xl border border-rule bg-paper-sunk px-6`}>
        <ul aria-label="What you get" className="flex flex-wrap gap-x-8 gap-y-2 py-4 font-medium text-ink-muted">
          {PROMISES.map((p) => (
            <li key={p} className="flex items-center gap-2.5">
              <span aria-hidden className="size-2.5 rounded-full bg-placard ring-1 ring-placard-edge" />
              {p}
            </li>
          ))}
        </ul>
      </div>

      <section aria-labelledby="what-title" className={`${WIDTH} py-16 lg:py-20`}>
        <h2 id="what-title" className="max-w-[24ch] font-display text-4xl leading-tight text-balance">Where splats come from, in three steps</h2>
        <ol className="mt-8 grid gap-8 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-3">
              {s.picture}
              <span className="flex items-baseline gap-3">
                <span aria-hidden className="font-display text-2xl text-ink-faint">{i + 1}</span>
                <span>
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="mt-1 text-ink-muted">{s.body}</p>
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section id="lessons" aria-labelledby="lessons-title" className={`${WIDTH} grid scroll-mt-20 items-center gap-10 py-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16 lg:py-20`}>
        <div className="flex flex-col gap-4">
          <span className={CHIP}>Lessons</span>
          <h2 id="lessons-title" className="font-display text-4xl leading-tight text-balance">{LESSON_COUNT[0].toUpperCase()}{LESSON_COUNT.slice(1)} lessons, from one blob to a walking creature and a real photo shoot</h2>
          <p className="max-w-[48ch] text-lg text-ink-muted">
            Each lesson asks one question and hands you the controls to answer it. Goals tick off as you find things out, and the
            explanation waits until you've seen it for yourself.
          </p>
          <ul className="flex flex-col gap-2">
            {['About five minutes each, in order or not', 'Progress stays in this browser', 'Any lesson’s scene opens in the sandbox'].map((p) => (
              <li key={p} className="flex items-baseline gap-3"><Dot />{p}</li>
            ))}
          </ul>
          <a href={href({ page: 'lessons' })} className={`${QUIET} mt-2 self-start`}>See all {LESSON_COUNT} lessons</a>
        </div>
        <LessonMockup />
      </section>

      <ol aria-label="The lessons" className={`${WIDTH} grid grid-cols-2 gap-3 sm:grid-cols-4`}>
        {LESSONS.map((l, i) => {
          const total = LESSON_GOALS[l.id].length
          return (
            <li key={l.id}>
              <a href={href({ page: 'lesson', id: l.id })} className="group flex h-full flex-col gap-2 rounded-xl p-2 no-underline transition-colors hover:bg-paper-sunk">
                <LessonGlyph id={l.id} />
                <span className="flex items-baseline gap-2 px-1">
                  <span aria-hidden className="font-display text-lg text-ink-faint">{i + 1}</span>
                  <span className="font-display text-lg leading-tight text-ink group-hover:text-accent">{l.title}</span>
                </span>
                <span className="px-1 text-xs text-ink-faint tabular-nums">
                  {progress[i] === total ? 'Done' : progress[i] ? `${progress[i]} of ${total} goals` : `${total} goals`}
                </span>
              </a>
            </li>
          )
        })}
      </ol>

      <section id="sandbox" aria-labelledby="sandbox-title" className={`${WIDTH} grid scroll-mt-20 items-center gap-10 py-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16 lg:py-24`}>
        <div className="flex flex-col gap-4 lg:order-2">
          <span className={CHIP}>Sandbox</span>
          <h2 id="sandbox-title" className="font-display text-4xl leading-tight text-balance">Then get your hands on a whole scene</h2>
          <p className="max-w-[48ch] text-lg text-ink-muted">
            The sandbox is every tool from the lessons, on any scene you like. Grab a corner of a capture, drag it off, recolor it and
            see what it was hiding.
          </p>
          <ul className="flex flex-col gap-2">
            {SANDBOX_POINTS.map((p) => <li key={p} className="flex items-baseline gap-3"><Dot />{p}</li>)}
          </ul>
          <a href={href({ page: 'sandbox' })} className={`${PRIMARY} mt-2 self-start`}>Open the sandbox</a>
        </div>
        <SandboxMockup />
      </section>

      <section id="experiments" aria-labelledby="experiments-title" className={`${WIDTH} scroll-mt-20 py-16 lg:py-20`}>
        <span className={CHIP}>More experiments</span>
        <h2 id="experiments-title" className="mt-4 max-w-[26ch] font-display text-4xl leading-tight text-balance">Other ways to play with splats</h2>
        <p className="mt-3 max-w-[56ch] text-lg text-ink-muted">Smaller tools built from the same blobs. New ones land here as they're made.</p>
        <ul className="mt-8 grid gap-6 md:grid-cols-3">
          {EXPERIMENTS.map((e) => (
            <li key={e.title}>
              <a href={e.url} className="group flex h-full flex-col gap-4 rounded-2xl border border-rule bg-paper p-4 no-underline transition-colors hover:border-ink-faint">
                <Cover e={e} />
                <span className="font-display text-2xl text-ink group-hover:text-accent">{e.title} →</span>
                <span className="text-ink-muted">{e.body}</span>
              </a>
            </li>
          ))}
        </ul>
        <a href={href({ page: 'experiments' })} className={`${QUIET} mt-8`}>See every experiment</a>
      </section>

      <section aria-labelledby="start-title" className={`${WIDTH} pt-4 pb-8`}>
        <div className="case grid items-center gap-6 rounded-3xl p-8 sm:p-12 md:grid-cols-[minmax(0,1fr)_auto]" style={{ background: 'var(--c-paper)' }}>
          <div>
            <h2 id="start-title" className="font-display text-4xl text-ink">Start with one blob</h2>
            <p className="mt-3 max-w-[50ch] text-lg text-ink-muted">Five attributes, fourteen values. Pull each one and the rest of splatting starts to make sense.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href={href({ page: 'lesson', id: LESSONS[0].id })} className={PRIMARY}>Lesson 1: {LESSONS[0].title}</a>
            <a href={href({ page: 'sandbox' })} className={QUIET}>Open the sandbox</a>
          </div>
        </div>
      </section>
    </div>
  )
}

/** A drawing of a lesson page: goal cards, the dark display case, a desk of controls. */
function LessonMockup() {
  return (
    <div role="img" aria-label="A lesson page: three goal cards, one ticked and one marked Try now, above a dark display case holding a single flattened blob, and a desk of size sliders below" className="rounded-3xl bg-paper-sunk p-4 ring-1 ring-rule sm:p-5">
      <div className="grid grid-cols-3 gap-2 text-[11px] leading-snug sm:text-xs">
        <div className="rounded-lg border border-done/50 bg-paper p-2.5">
          <span className="font-semibold text-done">✓ Done</span>
          <p className="mt-1 font-semibold text-ink">Turn it</p>
        </div>
        <div className="rounded-lg bg-placard p-2.5 text-placard-ink shadow-sm">
          <span className="font-semibold">Try now</span>
          <p className="mt-1 font-semibold">Squash it into a pancake</p>
        </div>
        <div className="rounded-lg border border-rule bg-paper p-2.5 text-ink-faint">
          <span>Up next</span>
          <p className="mt-1 font-semibold">Make it a ghost</p>
        </div>
      </div>
      <div className="case mt-3 overflow-hidden rounded-xl ring-[3px] ring-placard-edge" style={{ background: 'var(--c-paper)' }}>
        <svg viewBox="0 0 320 150" className="block h-auto w-full">
          <path d="M 0 120 H 320 M 40 150 L 100 100 M 160 150 V 100 M 280 150 L 220 100" stroke="#252730" />
          <ellipse cx="160" cy="76" rx="80" ry="22" transform="rotate(-8 160 76)" fill="url(#bs-blue)" />
          <path d="M 160 76 L 238 64 M 160 76 L 160 46 M 160 76 L 130 96" stroke="#f2553a" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <p className="border-t border-rule-soft px-3 py-1.5 text-[11px] text-ink-muted">Width 2.40 · Height 0.18 · Depth 1.10</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 rounded-xl border border-rule bg-paper p-3">
        {[['Width', 80], ['Height', 12], ['Depth', 46]].map(([n, v]) => (
          <div key={n} className="text-[11px] text-ink-muted">
            {n}
            <div className="mt-1.5 h-1 rounded-full bg-rule">
              <div className="relative h-1 rounded-full bg-accent" style={{ width: `${v}%` }}>
                <span className="absolute -top-1 -right-1.5 size-3 rounded-full bg-accent" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** A drawing of the sandbox: a tool rail, a lassoed and moved part of the scene, the effects. */
function SandboxMockup() {
  const tools: [string, React.ReactNode][] = [
    ['Spray', <><circle cx="7" cy="12" r="1.3" /><circle cx="4" cy="8" r="1.3" /><circle cx="9" cy="6" r="1.3" /><path d="M 12 10 l 6 -6 l 2 2 l -6 6 z" /></>],
    ['Lasso', <path d="M 4 9 C 4 3 20 3 20 9 C 20 15 6 15 8 11 M 8 11 L 6 20" fill="none" strokeWidth="1.6" />],
    ['Move', <path d="M 12 3 V 21 M 3 12 H 21 M 12 3 l -3 3 m 3 -3 l 3 3 M 12 21 l -3 -3 m 3 3 l 3 -3" fill="none" strokeWidth="1.6" />],
    ['Color', <><circle cx="12" cy="12" r="8" fill="none" strokeWidth="1.6" /><circle cx="9" cy="9" r="1.6" /><circle cx="15" cy="9" r="1.6" /><circle cx="12" cy="15" r="1.6" /></>],
  ]
  return (
    <div role="img" aria-label="The sandbox: a tool rail with spray, lasso, move and color tools beside the toadstool, part of whose cap has been lassoed, turned blue and dragged off, with a row of effects underneath" className="rounded-3xl bg-paper-sunk p-4 ring-1 ring-rule sm:p-5">
      <div className="flex gap-3">
        <div className="flex flex-col gap-2">
          {tools.map(([name, icon], k) => (
            <span key={name} className={`grid size-10 place-items-center rounded-lg border ${k === 1 ? 'border-accent bg-paper text-accent' : 'border-rule bg-paper text-ink-muted'}`}>
              <svg viewBox="0 0 24 24" className="size-5 fill-current stroke-current">{icon}</svg>
            </span>
          ))}
        </div>
        <div className="case min-w-0 flex-1 overflow-hidden rounded-xl ring-1 ring-rule" style={{ background: 'var(--c-paper)' }}>
          <SandboxDiagram />
          <p className="border-t border-rule-soft px-3 py-1.5 text-[11px] text-ink-muted">{SANDBOX_COUNTS.selected} of {SANDBOX_COUNTS.all} blobs selected</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {EFFECTS.map((e) => (
          <span key={e} className={`rounded-full border px-2.5 py-1 text-[11px] ${e === 'Twist' ? 'border-accent bg-accent/15 text-accent-ink' : 'border-rule bg-paper text-ink-muted'}`}>{e}</span>
        ))}
      </div>
    </div>
  )
}
