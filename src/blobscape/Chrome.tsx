import { useEffect, useMemo, useRef } from 'react'
import { tipjar, tuck } from 'tipjar'
import 'tipjar/style.css'
import { Logo } from '../shared/Logo.tsx'
import { LESSONS, href, type Route } from './routes.ts'
import { EXPERIMENTS, SITE } from './site.ts'
import { pageMeta } from './meta.ts'

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
          {EXPERIMENTS.map((e) => <a key={e.id} href={e.url} className={FOOT_LINK}>{e.title}</a>)}
        </nav>
        <nav aria-label="About" className="flex flex-col gap-1">
          <p className="mb-1 font-display text-base text-ink">About</p>
          <a href={SITE.author.url} className={FOOT_LINK}>Made by {SITE.author.name}</a>
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

/**
 * The floating tip button, on the front page and the lesson list only: on a
 * lesson or the sandbox it would sit on top of the controls. It tucks away
 * once the footer, which has its own support link, scrolls into view.
 */
export function TipButton() {
  const holder = useRef<HTMLElement>(null)
  // tipjar() escapes everything it is given and only allows http(s) links, so its markup is safe to insert
  const html = useMemo(() => tipjar({ href: SITE.tip, description: `${SITE.name} on Ko-fi`, icon: 'heart', newTab: true, enter: 'fade' }), [])
  useEffect(() => {
    const button = holder.current?.firstElementChild
    return button instanceof HTMLElement ? tuck(button, 'footer') : undefined
  }, [])
  return <aside ref={holder} aria-label="Support Blobscape" dangerouslySetInnerHTML={{ __html: html }} />
}

/** Keeps the title, description and canonical link in step as the app moves between pages. */
export function usePageMeta(route: Route) {
  useEffect(() => {
    const meta = pageMeta(route)
    document.title = meta.title
    document.querySelector('meta[name="description"]')?.setAttribute('content', meta.description)
    const canonical = document.querySelector('link[rel="canonical"]')
    if (meta.path) canonical?.setAttribute('href', SITE.origin + meta.path)
  }, [route])
}
