import { SiteHeader } from '../shared/SiteHeader.tsx'
import { COMING, LESSONS, LESSON_GOALS, href, useRoute } from './routes.ts'
import { doneGoals, resetProgress } from './progress.ts'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { Landing } from './Landing.tsx'
import { Footer, Menu, TipButton, usePageMeta } from './Chrome.tsx'
import { OneBlob } from './lessons/OneBlob.tsx'
import { Footprint } from './lessons/Footprint.tsx'
import { Order } from './lessons/Order.tsx'
import { Many } from './lessons/Many.tsx'
import { Angle } from './lessons/Angle.tsx'
import { Paint } from './lessons/Paint.tsx'
import { Formats } from './lessons/Formats.tsx'
import { Break } from './lessons/Break.tsx'
import { Sandbox } from './Sandbox.tsx'
import { useState } from 'react'

const PAGES: Record<string, () => React.JSX.Element> = { 'one-blob': OneBlob, footprint: Footprint, order: Order, many: Many, angle: Angle, paint: Paint, formats: Formats, break: Break }

export function App() {
  const route = useRoute()
  const key = route.page === 'lesson' ? route.id : route.page
  const Lesson = route.page === 'lesson' ? PAGES[route.id] : null
  usePageMeta(route)
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader menu={<Menu route={route} />} />
      {/* Keyed by page, so each one mounts fresh: its own view, its own state */}
      <main id="main" key={key} className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16">
        {route.page === 'sandbox' ? <Sandbox /> : Lesson ? <Lesson /> : route.page === 'lessons' ? <LessonList /> : <Landing />}
      </main>
      <Footer />
      {(route.page === 'home' || route.page === 'lessons') && <TipButton key={`tip-${route.page}`} />}
    </div>
  )
}

/** Every lesson with its progress: where "See all eight lessons" and each lesson's kicker lead. */
function LessonList() {
  const h1 = useFocusHeading()
  const [, refresh] = useState(0)
  // Only goals that still exist count, in case a lesson's goals change
  const progress = LESSONS.map((l) => LESSON_GOALS[l.id].filter((g) => doneGoals(l.id).has(g.id)).length)
  const any = progress.some((n) => n > 0)
  return (
    <div className="max-w-3xl">
      <Crumbs here="Lessons" />
      <div className="pt-6 pb-8">
        <h1 ref={h1} tabIndex={-1} className="font-serif text-5xl outline-none">Lessons</h1>
        <p className="mt-4 font-serif text-xl leading-relaxed text-ink-muted">
          A Gaussian splat is a 3D scene made of nothing but soft, see-through, coloured blobs. Start with one, learn what each of its
          numbers does, then pile up thousands and play with them in the sandbox.
        </p>
      </div>

      <section aria-labelledby="lessons-title">
        <div className="flex items-baseline justify-between">
          <h2 id="lessons-title" tabIndex={-1} className="font-serif text-3xl outline-none">All eight</h2>
          {any && (
            <button
              type="button"
              onClick={() => {
                if (!window.confirm('Clear every ticked goal in this browser?')) return
                resetProgress()
                refresh((n) => n + 1)
                // The button goes away, so give focus somewhere sensible
                document.getElementById('lessons-title')?.focus()
              }}
              className="text-sm text-ink-faint hover:text-accent"
            >
              Reset progress
            </button>
          )}
        </div>
        <ol className="mt-4">
          {LESSONS.map((l, i) => (
            <li key={l.id} className="border-t border-rule">
              <a href={href({ page: 'lesson', id: l.id })} className="group flex gap-4 py-5">
                <span aria-hidden className="w-8 shrink-0 font-serif text-2xl text-ink-faint group-hover:text-accent">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <span className="font-serif text-2xl group-hover:text-accent">{l.title} →</span>
                    <span className="text-xs tabular-nums text-ink-faint">{progress[i]} of {LESSON_GOALS[l.id].length} goals</span>
                  </span>
                  <span className="mt-1 block text-ink-muted">{l.summary}</span>
                </span>
              </a>
            </li>
          ))}
          {COMING.map((l, i) => (
            <li key={l.title} className="flex gap-4 border-t border-rule py-5 text-ink-faint">
              <span aria-hidden className="w-8 shrink-0 font-serif text-2xl">{LESSONS.length + i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="font-serif text-2xl">{l.title}</span> <span className="text-xs uppercase tracking-wider">coming later</span>
                <span className="mt-1 block">{l.summary}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="sandbox-title" className="mt-10 rounded-lg border border-rule bg-paper-sunk p-6">
        <h2 id="sandbox-title" className="font-serif text-3xl">Sandbox</h2>
        <p className="mt-2 text-ink-muted">Spray blobs into space, select and recolour them, rip holes in a sample object, and switch on x-ray to see what it's really made of. Every lesson can open its scene here too.</p>
        <a href={href({ page: 'sandbox' })} className="mt-4 inline-block rounded bg-accent px-4 py-2 font-medium text-paper transition-colors hover:bg-accent-ink">Open the sandbox →</a>
      </section>
    </div>
  )
}
