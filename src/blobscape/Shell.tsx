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

/** One lesson page: the view and its controls, the goals, and a short explanation underneath. */
export function LessonShell({ id, intro, view, caption, controls, goals, done, scene, explain }: Props) {
  const h1 = useFocusHeading()
  const i = LESSONS.findIndex((l) => l.id === id)
  const lesson = LESSONS[i]
  const prev = LESSONS[i - 1]
  const next = LESSONS[i + 1]
  const count = goals.filter((g) => done.has(g.id)).length
  return (
    <>
      <Crumbs here={`Lesson ${i + 1}`} />
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-2 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-serif text-4xl outline-none sm:text-5xl">
          <span className="text-ink-faint">{i + 1}.</span> {lesson.title}
        </h1>
        <div className="max-w-xl font-serif text-lg text-ink-muted">{intro}</div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)]">
        <section aria-label="View" className="min-w-0 space-y-3">
          {view}
          {caption && <div className="text-sm text-ink-muted">{caption}</div>}
        </section>

        <section aria-label="Controls" className="min-w-0 space-y-6">
          <div className="space-y-3">{controls}</div>

          <div className="rounded-lg border border-rule p-4">
            <h2 className="flex items-baseline justify-between font-serif text-xl">
              Try this <span className="font-sans text-sm text-ink-faint" data-testid="goal-count">{count} of {goals.length}</span>
            </h2>
            <ul className="mt-3 space-y-2.5">
              {goals.map((g) => {
                const ok = done.has(g.id)
                return (
                  <li key={g.id} className="flex gap-2.5 text-sm" data-done={ok}>
                    <span aria-hidden className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[0.6rem] ${ok ? 'border-accent bg-accent text-paper' : 'border-ink-faint'}`}>{ok ? '✓' : ''}</span>
                    <span className={ok ? 'text-ink-muted' : 'text-ink'}>
                      <span className="sr-only">{ok ? 'Done: ' : 'To do: '}</span>
                      {g.label}
                      {g.hint && <span className="block text-xs text-ink-faint">{g.hint}</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
            <p aria-live="polite" className="sr-only">{count === goals.length ? 'All goals done.' : `${count} of ${goals.length} goals done.`}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => handOff(`Lesson ${i + 1}: ${lesson.title}`, scene())}>Open in the sandbox</Button>
            {next ? (
              <a href={href({ page: 'lesson', id: next.id })} className="rounded bg-accent px-4 py-2 font-medium text-paper transition-colors hover:bg-accent-ink">
                Next: {next.title} →
              </a>
            ) : (
              <a href={href({ page: 'sandbox' })} className="rounded bg-accent px-4 py-2 font-medium text-paper transition-colors hover:bg-accent-ink">
                On to the sandbox →
              </a>
            )}
            {prev && <a href={href({ page: 'lesson', id: prev.id })} className="text-sm text-ink-muted hover:text-accent">← {prev.title}</a>}
          </div>
        </section>
      </div>

      <section aria-labelledby="explain" className="mt-12 max-w-3xl border-t border-rule pt-8">
        <h2 id="explain" className="font-serif text-3xl">What's going on</h2>
        <div className="prose-like mt-3 space-y-3 leading-relaxed text-ink-muted">{explain}</div>
      </section>
    </>
  )
}
