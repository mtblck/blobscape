import { Logo } from './Logo.tsx'
import { LESSONS, href } from '../blobscape/routes.ts'
import { NEWEST_EXPERIMENTS, SITE } from '../blobscape/site.ts'

const FOOT_BASE = 'inline-flex min-h-9 items-center no-underline hover:underline'
const FOOT_LINK = `${FOOT_BASE} text-ink-muted hover:text-accent`

/** The footer on every page, the tools' included. */
export function Footer() {
  return (
    <footer className="mt-8 border-t border-rule bg-paper-sunk">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div className="flex flex-col gap-3">
          <a href="/" className="self-start"><Logo className="h-8 w-auto" title="Blobscape home" /></a>
          <p className="max-w-[36ch] text-ink-muted">Small experiments with Gaussian splats. {SITE.tagline}, one blob at a time.</p>
          <p className="max-w-[40ch] text-sm text-ink-faint">Everything runs in your browser. Files you open stay on your device, and progress is kept only in this browser.</p>
        </div>
        <nav aria-label="Learn" className="flex flex-col gap-1">
          <p className="mb-1 font-display text-base text-ink">Learn</p>
          <a href={href({ page: 'lessons' })} className={FOOT_LINK}>Lessons</a>
          <a href={href({ page: 'lesson', id: LESSONS[0].id })} className={FOOT_LINK}>Start with one blob</a>
          <a href={href({ page: 'sandbox' })} className={FOOT_LINK}>Sandbox</a>
        </nav>
        <nav aria-label="Experiments" className="flex flex-col gap-1">
          <p className="mb-1 font-display text-base text-ink">Experiments</p>
          {NEWEST_EXPERIMENTS.map((e) => <a key={e.id} href={e.url} className={FOOT_LINK}>{e.title}</a>)}
          <a href={href({ page: 'experiments' })} className={FOOT_LINK}>All experiments</a>
        </nav>
        <nav aria-label="About" className="flex flex-col gap-1">
          <p className="mb-1 font-display text-base text-ink">About</p>
          <a href={SITE.author.url} className={FOOT_LINK}>Made by {SITE.author.name}</a>
          <a href="/contact/" className={FOOT_LINK}>Get in touch</a>
          <a href={SITE.tip} target="_blank" rel="noopener" className={`${FOOT_BASE} gap-2 font-medium text-accent hover:text-accent-ink`}>
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden fill="currentColor"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.2 0 3.6 1.2 4.3 2.5h2c.7-1.3 2.1-2.5 4.3-2.5 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" /></svg>
            Support Blobscape<span className="sr-only"> on Ko-fi (opens in a new tab)</span>
          </a>
        </nav>
      </div>
      <p className="mx-auto max-w-6xl border-t border-rule px-4 py-4 text-sm text-ink-faint">© {new Date().getFullYear()} {SITE.author.name}</p>
    </footer>
  )
}
