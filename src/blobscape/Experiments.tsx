import { href } from './routes.ts'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { EXPERIMENTS, EXPERIMENTS_INTRO } from './site.ts'

/** Each experiment's cover picture (a 16:10 still from it), on this page and the front page. */
export function Cover({ e }: { e: (typeof EXPERIMENTS)[number] }) {
  // the card's title names the link, so the picture stays out of the way of screen readers
  return <img src={e.cover} alt="" width={1200} height={750} loading="lazy" decoding="async" className="block aspect-[16/10] h-auto w-full rounded-xl object-cover ring-1 ring-rule" />
}

/** Every experiment, like the lesson list is every lesson: where the header's Experiments link leads. */
export function Experiments() {
  const h1 = useFocusHeading()
  return (
    <div>
      <Crumbs here="Experiments" />
      <div className="max-w-3xl pt-6 pb-8">
        <h1 ref={h1} tabIndex={-1} className="font-display text-5xl outline-none">Experiments</h1>
        <p className="mt-4 text-xl leading-relaxed text-ink-muted">{EXPERIMENTS_INTRO}</p>
      </div>
      <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {EXPERIMENTS.map((e) => (
          <li key={e.id}>
            <a href={e.url} className="group flex h-full flex-col gap-4 rounded-2xl border border-rule bg-paper p-4 no-underline transition-colors hover:border-ink-faint">
              <Cover e={e} />
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
