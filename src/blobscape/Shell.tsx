import { useEffect, useRef, useState, type ReactNode } from 'react'
import { EXPERIMENTS, longDate, type Experiment } from './site.ts'
import { Button } from '../shared/ui.tsx'
import { COMING, LESSONS, href } from './routes.ts'
import { BUILT_ON, ENGINE_BUILT } from './engineCopy.ts'
import type { Goal } from './progress.ts'
import { handOff } from './handoff.ts'
import type { Blobs } from '../splat-core/blobs.ts'
import { toast } from '../shared/Toast.tsx'

/** Moves focus to the page's heading when a new page shows, so screen readers announce it, and scrolls to the top or to the #section asked for. */
export function useFocusHeading() {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    // A link to a section of the page (/#experiments) goes to that section; anything else starts at the top
    const target = window.location.hash.length > 1 ? document.getElementById(decodeURIComponent(window.location.hash.slice(1))) : null
    if (target) target.scrollIntoView()
    else window.scrollTo(0, 0)
    ref.current?.focus({ preventScroll: true })
  }, [])
  return ref
}

const CRUMB = 'text-ink-muted underline decoration-rule underline-offset-2 hover:text-accent'

/** Blobscape / (an optional parent page) / this page. */
export function Crumbs({ here, parent }: { here: string; parent?: { label: string; href: string } }) {
  // an experiment's page says when it was published, like a post
  const dated = parent ? EXPERIMENTS.find((e) => e.title === here) : undefined
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 pt-6 text-sm text-ink-faint">
      <nav aria-label="Breadcrumb">
        <a href={href({ page: 'home' })} className={CRUMB}>Blobscape</a>
        <span aria-hidden className="px-1.5">/</span>
        {parent && <><a href={parent.href} className={CRUMB}>{parent.label}</a><span aria-hidden className="px-1.5">/</span></>}
        <span aria-current="page">{here}</span>
      </nav>
      {dated && (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {ENGINE_BUILT.includes(dated.id) && <a href={href({ page: 'engine' })} className={CRUMB} data-testid="built-on">{BUILT_ON}</a>}
          <Dates e={dated} testId="page-dates" />
        </div>
      )}
    </div>
  )
}

/** When an experiment was published, and when it last changed if that was another day. */
export function Dates({ e, testId }: { e: Experiment; testId?: string }) {
  return (
    <p className="text-sm text-ink-faint" data-testid={testId}>
      Published <time dateTime={e.published}>{longDate(e.published)}</time>
      {e.updated !== e.published && <> · Updated <time dateTime={e.updated}>{longDate(e.updated)}</time></>}
    </p>
  )
}

/** One group of controls on the desk under the view. */
export interface ControlGroup {
  /** Goals point at a group by this id (Goal.where) to light it up. */
  id: string
  title: string
  /** A few words after the title: what the group changes. */
  note?: string
  content: ReactNode
  /** Share of the desk's width on a laptop (default 1). */
  span?: number
  /** Columns for the controls inside, on a laptop (default 1). */
  cols?: number
}

interface Props {
  id: string
  intro: ReactNode
  /** The live model. It fills the display case, so give it h-full. */
  view: ReactNode
  /** A readout along the bottom of the case, next to what it measures. */
  caption?: ReactNode
  groups: ControlGroup[]
  goals: Goal[]
  done: Set<string>
  /** The scene to carry into the sandbox. */
  scene: () => Blobs
  /** The explanation's heading: the idea in a few words. */
  explainTitle: string
  /** At most one formula, with each symbol said in words. */
  formula?: { eq: ReactNode; terms: [ReactNode, string][] }
  explain: ReactNode
  /** Code to take away (the engine lessons): what the view shows, written with the package, kept in step with the controls. */
  code?: { title: string; note: ReactNode; source: string }
}

const TOTAL = LESSONS.length + COMING.length

/**
 * One lesson page, laid out like a museum exhibit bench:
 *
 *   the question            | the goal cards (the current one is the yellow placard)
 *   the display case: the live view, full width, with its readout along the bottom
 *   the desk: every control group side by side
 *   the explanation spread: the idea and its formula | the prose
 *   previous · open in the sandbox · next
 *
 * The current goal's `where` lights up the group (or the view) to look at.
 * On a phone the case and the current goal stick under the site header, the
 * desk becomes one group at a time, and the goal cards follow as a list.
 */
export function LessonShell({ id, intro, view, caption, groups, goals, done, scene, explainTitle, formula, explain, code }: Props) {
  const h1 = useFocusHeading()
  const i = LESSONS.findIndex((l) => l.id === id)
  const lesson = LESSONS[i]
  const prev = LESSONS[i - 1]
  const next = LESSONS[i + 1]
  const count = goals.filter((g) => done.has(g.id)).length
  const finished = count === goals.length
  // The first goal not yet done is the one to try now: it alone shows its hint
  const current = goals.find((g) => !done.has(g.id))
  const where = current?.where
  const nextHref = next ? href({ page: 'lesson', id: next.id }) : href({ page: 'sandbox' })
  const nextTitle = next ? next.title : 'The sandbox'

  // A goal that ticks shows a toast with its "why", and finishing the lesson a bigger one. Toasts float over the page,
  // so nothing moves under your finger. Goals done on an earlier visit are already in `done` and say nothing.
  const [latest, setLatest] = useState<Goal | null>(null)
  const seen = useRef(done)
  useEffect(() => {
    const fresh = goals.filter((g) => done.has(g.id) && !seen.current.has(g.id))
    const wasFinished = goals.every((g) => seen.current.has(g.id))
    seen.current = done
    if (!fresh.length) return
    setLatest(fresh[fresh.length - 1])
    for (const g of fresh) toast({ kind: 'step', title: g.label, body: g.why })
    if (!wasFinished && goals.every((g) => done.has(g.id))) {
      toast({
        kind: 'lesson',
        title: `Lesson complete: ${lesson.title}`,
        body: `All ${goals.length} goals done.`,
        links: [{ label: 'Read why it works', href: '#explain' }, { label: `Next: ${nextTitle} →`, href: nextHref }],
      })
    }
  }, [done, goals, lesson.title, nextHref, nextTitle])

  // Phone: one group at a time. It opens on the group the current goal needs, and after that only you change it:
  // switching it as each goal ticks moved the controls out from under a finger still on a slider. The tab the
  // next goal needs carries a dot instead.
  const [tab, setTab] = useState(() => (where && groups.some((g) => g.id === where) ? where : groups[0]?.id))

  return (
    <>
      <div className="flex flex-col gap-4 pt-5 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-7">
        <header className="lg:col-span-4 lg:self-end lg:pb-1">
          <p className="text-sm text-ink-faint">
            <a href={href({ page: 'home' })} className="text-ink-muted underline decoration-rule underline-offset-2 hover:text-accent">Blobscape</a>
            <span aria-hidden className="px-1.5">·</span>
            <a href={href({ page: 'lessons' })} className="underline decoration-rule underline-offset-2 hover:text-accent">Lesson {i + 1} of {TOTAL}</a>
          </p>
          <h1 ref={h1} tabIndex={-1} className="mt-1 font-display text-4xl leading-tight outline-none lg:text-[2.6rem]">{lesson.title}</h1>
          <div className="mt-2 max-w-[38ch] text-lg leading-snug text-ink-muted max-lg:max-w-[60ch]">{intro}</div>
        </header>

        <section aria-labelledby="try" className="order-4 lg:order-none lg:col-span-8">
          <h2 id="try" className="sr-only">Things to try</h2>
          <ol className={`grid gap-2.5 ${goals.length >= 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
            {goals.map((g, k) => {
              const ok = done.has(g.id)
              const now = g.id === current?.id
              return (
                <li
                  key={g.id}
                  data-done={ok}
                  aria-current={now ? 'step' : undefined}
                  className={`flex min-h-[8.5rem] flex-col gap-1.5 rounded-xl border px-3.5 pt-3 pb-3.5 transition-colors max-sm:min-h-0 ${
                    now ? 'border-placard-edge bg-placard text-placard-ink shadow-[0_10px_24px_-16px_rgb(242_85_58/0.6)]' : ok ? 'border-done bg-paper-sunk' : 'border-rule bg-paper-sunk'
                  }`}
                >
                  <span className={`flex items-center gap-2 text-xs ${now ? 'text-placard-ink/80' : ok ? 'font-medium text-done' : 'text-ink-faint'}`}>
                    <span aria-hidden className={`grid h-5 w-5 place-items-center rounded-full border-[1.5px] text-[0.68rem] font-bold ${ok ? 'border-done bg-done text-paper' : 'border-current'}`}>{ok ? '✓' : k + 1}</span>
                    {ok ? 'Done' : now ? 'Try now' : 'Up next'}
                  </span>
                  <span className={`text-[0.95rem] leading-snug font-semibold ${now ? '' : ok ? 'text-ink-muted' : 'text-ink-faint'}`}>
                    <span className="sr-only">{ok ? 'Done: ' : now ? 'Try now: ' : 'Later: '}</span>
                    {g.label}
                  </span>
                  {/* The hint and the "why" share one spot, the one not showing kept invisible, so a card is as tall before it ticks as after
                      and nothing below it moves (on a phone the cards sit under the controls, so they just take the space they need) */}
                  <span className="grid text-[0.95rem] leading-snug">
                    {g.hint && <span aria-hidden={!now} className={`[grid-area:1/1] ${now ? '' : 'invisible max-sm:hidden'}`}><span className="sr-only">Hint: </span>{g.hint}</span>}
                    {g.why && <span aria-hidden={!ok} className={`[grid-area:1/1] text-ink-muted ${ok ? '' : 'invisible max-sm:hidden'}`}>{g.why}</span>}
                  </span>
                </li>
              )
            })}
          </ol>
        </section>

        <section aria-label="Experiment" className="sticky top-[57px] z-10 -mx-4 bg-paper px-4 pt-1 pb-2 max-lg:shadow-[0_10px_14px_-14px_rgb(0_0_0/0.5)] lg:static lg:col-span-12 lg:mx-0 lg:px-0 lg:pt-0 lg:pb-0">
          <div className={`case relative flex flex-col overflow-hidden rounded-2xl transition-shadow ${where === 'view' ? 'ring-[3px] ring-placard-edge' : 'ring-1 ring-rule'}`}>
            <div className="relative h-[min(30dvh,250px)] min-h-[180px] lg:h-[clamp(300px,calc(100dvh-33rem),640px)]">
              {view}
              {where === 'view' && <span aria-hidden className="pointer-events-none absolute top-3 right-14 rounded-full bg-placard px-3 py-1 text-xs font-semibold text-placard-ink">Look here</span>}
            </div>
            {caption && <div className="border-t border-rule-soft px-4 py-2 text-xs leading-relaxed text-ink-muted sm:text-sm">{caption}</div>}
          </div>
          {current ? (
            <div className="mt-2 rounded-xl bg-placard px-3 py-2 text-placard-ink sm:hidden" aria-hidden>
              <p className="flex items-center gap-2 text-xs"><span>Goal {goals.indexOf(current) + 1} of {goals.length}</span></p>
              <p className="text-[0.95rem] leading-tight font-semibold">{current.label}</p>
              {current.hint && <p className="text-sm leading-snug">{current.hint}</p>}
            </div>
          ) : (
            <div className="mt-2 rounded-xl bg-ink px-3 py-2 text-sm text-paper sm:hidden">
              ✓ All done. <a href="#explain" className="underline">Read why it works</a>
            </div>
          )}
          <p aria-live="polite" className="sr-only">
            {latest && done.has(latest.id) ? `Done: ${latest.label}. ${latest.why ?? ''} ` : ''}
            {finished ? 'All goals done.' : `${count} of ${goals.length} goals done.`}
          </p>
          <span data-testid="goal-count" aria-hidden className="sr-only">{count} of {goals.length}</span>
        </section>

        <section aria-label="Controls" className="stack-controls order-3 rounded-2xl border border-rule bg-paper-sunk/60 px-4 pt-1 pb-4 lg:order-none lg:col-span-12 lg:px-5 lg:pt-4">
          {groups.length > 1 && (
            <div role="group" aria-label="Show controls for" className="-mx-4 mb-3 flex border-b border-rule px-2 sm:hidden">
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={tab === g.id}
                  onClick={() => setTab(g.id)}
                  className={`-mb-px flex-1 border-b-[3px] px-1 pt-2.5 pb-2 text-sm font-semibold transition-colors ${tab === g.id ? 'border-accent text-ink' : 'border-transparent text-ink-faint hover:text-ink'}`}
                >
                  {g.title}
                  {where === g.id && <span aria-hidden className="ml-1.5 inline-block h-2 w-2 rounded-full bg-placard align-[2px] ring-1 ring-ink" />}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-5 sm:grid sm:grid-cols-2 lg:flex lg:flex-row lg:gap-6">
            {groups.map((g) => (
              <div
                key={g.id}
                role="group"
                aria-labelledby={`group-${g.id}`}
                style={{ flexGrow: g.span ?? 1, flexBasis: 0 }}
                className={`min-w-0 rounded-xl transition-shadow sm:-m-2 sm:p-2 ${tab === g.id ? '' : 'max-sm:hidden'} ${where === g.id ? 'sm:bg-placard/10 sm:ring-[3px] sm:ring-placard' : ''}`}
              >
                <h3 id={`group-${g.id}`} className="mb-2 flex items-baseline gap-2 text-sm font-bold max-sm:sr-only">
                  {g.title} {g.note && <small className="text-xs font-normal text-ink-faint">{g.note}</small>}
                </h3>
                <div className="desk-group grid gap-x-5 gap-y-3" style={{ ['--cols' as string]: g.cols ?? 1 }}>
                  {g.content}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section aria-labelledby="explain" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-sm text-ink-faint">What you just saw</p>
          <h2 id="explain" tabIndex={-1} className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance outline-none sm:text-5xl">{explainTitle}</h2>
          {formula && (
            <figure className="mt-8 border-t-2 border-ink pt-5">
              <div className="text-3xl leading-tight sm:text-5xl">{formula.eq}</div>
              <figcaption className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-ink-muted">
                {formula.terms.map(([sym, meaning], k) => (
                  <span key={k} className="contents"><b className="text-base font-medium text-ink italic">{sym}</b><span>{meaning}</span></span>
                ))}
              </figcaption>
            </figure>
          )}
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">{explain}</div>
      </section>

      {code && <TakeTheCode {...code} />}

      <nav aria-label="Lessons" className="mt-14 grid grid-cols-2 items-center gap-4 border-t border-rule pt-6 sm:grid-cols-3">
        {prev ? (
          <a href={href({ page: 'lesson', id: prev.id })} className="group -m-3 rounded-lg p-3 transition-colors hover:bg-paper-sunk">
            <span className="block text-xs text-ink-faint">Previous</span>
            <span className="font-display text-lg text-ink-muted group-hover:text-ink">← {i}. {prev.title}</span>
          </a>
        ) : <span className="text-sm text-ink-faint">This is the first lesson</span>}
        <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto sm:text-center">
          <Button onClick={() => handOff(`Lesson ${i + 1}: ${lesson.title}`, scene())}>Open this scene in the sandbox</Button>
        </div>
        <a href={nextHref} className={`group -m-3 rounded-lg p-3 text-right transition-colors hover:bg-paper-sunk ${finished ? 'bg-accent/10' : ''}`}>
          <span className="block text-xs text-ink-faint">{next ? 'Next' : 'Then'}</span>
          <span className="font-display text-lg text-ink group-hover:text-accent-ink">{next ? `${i + 2}. ${next.title}` : 'The sandbox'} →</span>
        </a>
      </nav>
    </>
  )
}

/** The code a lesson ends with: what you just made, as the engine package writes it, with a button that copies it. */
function TakeTheCode({ title, note, source }: { title: string; note: ReactNode; source: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { setCopied(false) }
  }
  return (
    <section aria-labelledby="code" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
      <div className="lg:col-span-4">
        <p className="text-sm text-ink-faint">Take it with you</p>
        <h2 id="code" className="mt-1 max-w-[16ch] font-display text-3xl leading-[1.05] text-balance sm:text-4xl">{title}</h2>
        <div className="mt-4 max-w-[36em] space-y-3 text-base leading-relaxed text-ink-muted">{note}</div>
      </div>
      <div className="relative mt-6 min-w-0 lg:col-span-8 lg:mt-0">
        <div className="absolute top-2 right-2">
          <Button small onClick={() => void copy()}>{copied ? 'Copied' : 'Copy the code'}</Button>
        </div>
        <pre data-testid="lesson-code" tabIndex={0} aria-label="The code" className="max-h-[36rem] overflow-auto rounded-xl border border-rule bg-paper-sunk p-4 pt-12 text-[0.8rem] leading-relaxed text-ink"><code>{source}</code></pre>
        <p aria-live="polite" className="sr-only">{copied ? 'Copied the code.' : ''}</p>
      </div>
    </section>
  )
}
