import type { ReactNode } from 'react'
import { href } from './routes.ts'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { EXPERIMENTS, EXPERIMENTS_INTRO } from './site.ts'
import { BlobDefs, CreatureDiagram, FitDiagram, SpriteDiagram } from './diagrams.tsx'

/** Each experiment's picture, on this page and the front page. */
export const PICTURES: Record<(typeof EXPERIMENTS)[number]['id'], ReactNode> = { creature: <CreatureDiagram />, fit: <FitDiagram />, sprite: <SpriteDiagram /> }

/** Every experiment, like the lesson list is every lesson: where the header's Experiments link leads. */
export function Experiments() {
  const h1 = useFocusHeading()
  return (
    <div>
      <BlobDefs />
      <Crumbs here="Experiments" />
      <div className="max-w-3xl pt-6 pb-8">
        <h1 ref={h1} tabIndex={-1} className="font-display text-5xl outline-none">Experiments</h1>
        <p className="mt-4 text-xl leading-relaxed text-ink-muted">{EXPERIMENTS_INTRO}</p>
      </div>
      <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {EXPERIMENTS.map((e) => (
          <li key={e.id}>
            <a href={e.url} className="group flex h-full flex-col gap-4 rounded-2xl border border-rule bg-paper p-4 no-underline transition-colors hover:border-ink-faint">
              {PICTURES[e.id]}
              <span className="font-display text-2xl text-ink group-hover:text-accent">{e.title} →</span>
              <span className="flex-1 text-ink-muted">{e.body}</span>
              <span className="text-sm text-ink-faint">Needs {e.needs}. Runs in your browser; nothing is uploaded.</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-10 text-ink-muted">
        New to splats? The <a href={href({ page: 'lessons' })} className="text-ink underline underline-offset-2 hover:text-accent">lessons</a> start with a single blob.
      </p>
    </div>
  )
}
