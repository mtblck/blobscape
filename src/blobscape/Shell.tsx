import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from '../shared/ui.tsx'
import { LESSONS, href } from './routes.ts'
import type { Goal } from './progress.ts'
import { handOff } from './handoff.ts'
import type { Blobs } from '../splat-core/blobs.ts'

/** Moves focus to the page's heading when a new page shows, so screen readers announce it. */
export function useFocusHeading() {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    window.scrollTo(0, 0)
    ref.current?.focus({ preventScroll: true })
  }, [])
  return ref
}

export function Crumbs({ here }: { here: string }) {
  return (
    <nav aria-label="Breadcrumb" className="pt-6 text-sm text-ink-faint">
      <a href={href({ page: 'home' })} className="text-ink-muted hover:text-accent">Blobscape</a>
      <span aria-hidden className="px-1.5">/</span>
      <span aria-current="page">{here}</span>
    </nav>
  )
}

interface Props {
  id: string
  intro: ReactNode
  view: ReactNode
  /** Under the view: a short caption or readout. */
  caption?: ReactNode
  controls: ReactNode
  goals: Goal[]
  done: Set<string>
  /** The scene to carry into the sandbox. */
  scene: () => Blobs
  explain: ReactNode
}

/**
 * One lesson page, on one grid so every block lines up:
 *
 *   title, and the question the lesson answers (left edge shared with the stage)
 *   stage (the view; sticks while you work the panel) | panel: Try this, then Adjust
 *   what's going on (the explanation, at reading width)
 *   previous / next
 *
 * The task comes before the knobs, so you know what you're adjusting for. On
 * a phone the stage sticks under the site header while the panel scrolls, so
 * you can see what each control does.
 */
export function LessonShell({ id, intro, view, caption, controls, goals, done, scene, explain }: Props) {
  const h1 = useFocusHeading()
  const i = LESSONS.findIndex((l) => l.id === id)
  const lesson = LESSONS[i]
  const prev = LESSONS[i - 1]
  const next = LESSONS[i + 1]
  const count = goals.filter((g) => done.has(g.id)).length
  const finished = count === goals.length
  // The first goal not yet done is the one to try now: it alone shows its hint
  const current = goals.find((g) => !done.has(g.id))?.id
  const nextHref = next ? href({ page: 'lesson', id: next.id }) : href({ page: 'sandbox' })
  const nextLabel = next ? `Next: ${next.title}` : 'On to the sandbox'
  return (
    <>
      <Crumbs here={`Lesson ${i + 1}`} />
      <header className="max-w-[44rem] pt-2 pb-8">
        <h1 ref={h1} tabIndex={-1} className="font-serif text-4xl outline-none sm:text-5xl">
          <span className="text-ink-faint">{i + 1}.</span> {lesson.title}
        </h1>
        <div className="mt-3 font-serif text-lg leading-relaxed text-ink-muted sm:text-xl">{intro}</div>
      </header>

      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <section aria-label="View" className="sticky top-[57px] z-10 -mx-4 min-w-0 space-y-2 bg-paper px-4 pt-2 pb-3 lg:top-[73px] lg:mx-0 lg:self-start lg:px-0 lg:pt-0">
          {view}
          {caption && <div className="text-sm text-ink-muted">{caption}</div>}
        </section>

        <section aria-label="Lesson panel" className="stack-controls min-w-0 space-y-6">
          <div className="rounded-lg border border-rule">
            <h2 className="flex items-baseline justify-between border-b border-rule px-4 py-3 font-serif text-xl">
              Try this <span className="font-sans text-sm text-ink-faint" data-testid="goal-count">{count} of {goals.length}</span>
            </h2>
            <ol className="divide-y divide-rule">
              {goals.map((g) => {
                const ok = done.has(g.id)
                const now = g.id === current
                return (
                  <li key={g.id} data-done={ok} aria-current={now ? 'step' : undefined} className={`flex gap-3 px-4 py-2.5 text-sm ${now ? 'bg-accent/10' : ''}`}>
                    <span aria-hidden className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[0.6rem] ${ok ? 'border-accent bg-accent text-paper' : now ? 'border-accent' : 'border-ink-faint'}`}>{ok ? '✓' : ''}</span>
                    <span className={ok ? 'text-ink-muted' : 'text-ink'}>
                      <span className="sr-only">{ok ? 'Done: ' : now ? 'Try now: ' : 'Later: '}</span>
                      {g.label}
                      {g.hint && now && <span className="mt-0.5 block text-xs text-ink-muted">{g.hint}</span>}
                    </span>
                  </li>
                )
              })}
            </ol>
            {finished && (
              <div className="border-t border-rule px-4 py-3 text-sm">
                <p className="text-ink">All done. Read what was going on below, or move on.</p>
              </div>
            )}
            <p aria-live="polite" className="sr-only">{finished ? 'All goals done.' : `${count} of ${goals.length} goals done.`}</p>
          </div>

          <div className="space-y-4">
            <h2 className="font-serif text-xl">Adjust</h2>
            {controls}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-4">
            {finished && <a href={nextHref} className="rounded bg-accent px-4 py-2 font-medium text-paper transition-colors hover:bg-accent-ink">{nextLabel} →</a>}
            <Button onClick={() => handOff(`Lesson ${i + 1}: ${lesson.title}`, scene())}>Open this scene in the sandbox</Button>
          </div>
        </section>
      </div>

      <section aria-labelledby="explain" className="mt-14 max-w-[44rem]">
        <h2 id="explain" className="font-serif text-3xl">What's going on</h2>
        <div className="prose-like mt-4 space-y-4 text-[1.05rem] leading-relaxed text-ink-muted">{explain}</div>
      </section>

      <nav aria-label="Lessons" className="mt-14 grid grid-cols-2 gap-4 border-t border-rule pt-6">
        {prev ? (
          <a href={href({ page: 'lesson', id: prev.id })} className="group rounded-lg p-3 -m-3 transition-colors hover:bg-paper-sunk">
            <span className="block text-xs text-ink-faint">Previous</span>
            <span className="font-serif text-lg text-ink-muted group-hover:text-ink">← {i}. {prev.title}</span>
          </a>
        ) : <span />}
        <a href={nextHref} className="group -m-3 rounded-lg p-3 text-right transition-colors hover:bg-paper-sunk">
          <span className="block text-xs text-ink-faint">{next ? 'Next' : 'Then'}</span>
          <span className="font-serif text-lg text-ink group-hover:text-accent-ink">{next ? `${i + 2}. ${next.title}` : 'The sandbox'} →</span>
        </a>
      </nav>
    </>
  )
}
