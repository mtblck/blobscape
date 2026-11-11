import { useEffect, useMemo, useRef } from 'react'
import { tipjar, tuck } from 'tipjar'
import 'tipjar/style.css'
import { ThemeChoice } from '../shared/SiteHeader.tsx'
import { LESSONS, LESSON_COUNT, href, type Route } from './routes.ts'
import { ALL_EXPERIMENTS_URL, EXPERIMENTS, SITE } from './site.ts'

const LINK = 'block rounded-md px-2 py-1.5 text-ink no-underline hover:bg-paper-sunk hover:text-accent aria-[current=page]:text-accent'
const HEAD = 'px-2 text-xs font-semibold tracking-wider text-ink-faint uppercase'

const current = (route: Route, r: Route) => (href(route) === href(r) ? ('page' as const) : undefined)

/**
 * What the header's menu holds: Blobscape's pages, the other experiments and
 * the theme. Lessons are one page here, not a list, so new ones need no menu change.
 */
export function Menu({ route }: { route: Route }) {
  const pages: [string, Route][] = [['Front page', { page: 'home' }], ['Lessons', { page: 'lessons' }], ['Sandbox', { page: 'sandbox' }]]
  return (
    <nav aria-label="Blobscape" className="grid gap-5 sm:grid-cols-2">
      <div>
        <p className={HEAD}>Blobscape</p>
        <ul className="mt-1.5">
          {pages.map(([label, r]) => (
            <li key={label}>
              <a href={href(r)} aria-current={current(route, r) ?? (r.page === 'lessons' && route.page === 'lesson' ? 'page' : undefined)} className={LINK}>{label}</a>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className={HEAD}>More experiments</p>
        <ul className="mt-1.5">
          {EXPERIMENTS.map((e) => <li key={e.id}><a href={e.url} className={LINK}>{e.title}</a></li>)}
          <li><a href={ALL_EXPERIMENTS_URL} className={`${LINK} text-sm text-ink-muted`}>Every experiment</a></li>
        </ul>
      </div>
      <div className="border-t border-rule pt-4 sm:col-span-2">
        <p className={`${HEAD} mb-2`}>Theme</p>
        <div className="px-2"><ThemeChoice /></div>
      </div>
    </nav>
  )
}

const FOOT_BASE = 'inline-flex min-h-9 items-center no-underline hover:underline'
const FOOT_LINK = `${FOOT_BASE} text-ink-muted hover:text-accent`

export function Footer() {
  return (
    <footer className="mt-8 border-t border-rule bg-paper-sunk">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div className="flex flex-col gap-3">
          <p className="font-serif text-2xl text-ink">{SITE.name}</p>
          <p className="max-w-[36ch] text-ink-muted">{SITE.tagline}, one blob at a time.</p>
          <p className="max-w-[40ch] text-sm text-ink-faint">Everything runs in your browser. Files you open stay on your device, and progress is kept only in this browser.</p>
        </div>
        <nav aria-label="Learn" className="flex flex-col gap-1">
          <p className="mb-1 text-sm font-semibold text-ink">Learn</p>
          <a href={href({ page: 'lessons' })} className={FOOT_LINK}>Lessons</a>
          <a href={href({ page: 'lesson', id: LESSONS[0].id })} className={FOOT_LINK}>Start with one blob</a>
          <a href={href({ page: 'sandbox' })} className={FOOT_LINK}>Sandbox</a>
        </nav>
        <nav aria-label="Experiments" className="flex flex-col gap-1">
          <p className="mb-1 text-sm font-semibold text-ink">Experiments</p>
          {EXPERIMENTS.map((e) => <a key={e.id} href={e.url} className={FOOT_LINK}>{e.title}</a>)}
          <a href={ALL_EXPERIMENTS_URL} className={FOOT_LINK}>Every experiment</a>
        </nav>
        <nav aria-label="About" className="flex flex-col gap-1">
          <p className="mb-1 text-sm font-semibold text-ink">About</p>
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

const DESCRIPTION = `Learn how 3D Gaussian splats work by pulling one blob apart, then thousands, then rigging them to walk: ${LESSON_COUNT} hands-on lessons, a sandbox for real captures and a creature to take away as a 3D model, free in your browser.`

/** Each page's title and description, so a tab, a bookmark and a search result say where they lead. */
export function usePageMeta(route: Route) {
  useEffect(() => {
    let title = `${SITE.name}: learn 3D Gaussian splats by taking them apart`
    let description: string = DESCRIPTION
    if (route.page === 'lessons') {
      title = `Lessons · ${SITE.name}`
      description = `${LESSON_COUNT[0].toUpperCase()}${LESSON_COUNT.slice(1)} short, hands-on lessons on Gaussian splats: ${LESSONS.map((l) => l.title.toLowerCase()).join(', ')}.`
    } else if (route.page === 'sandbox') {
      title = `Sandbox · ${SITE.name}`
      description = 'Spray, select, move, recolour and explode Gaussian splats, or open your own .ply, .spz, .splat, .ksplat or .sog capture. Nothing is uploaded.'
    } else if (route.page === 'creature') {
      title = `Creature · ${SITE.name}`
      description = 'A blob fox that walks on its own splat engine. Make it, then download it as a rigged, animated .glb: as Gaussian splats or as a mesh for Blender and game engines.'
    } else if (route.page === 'lesson') {
      const i = LESSONS.findIndex((l) => l.id === route.id)
      title = `${LESSONS[i].title} · Lesson ${i + 1} · ${SITE.name}`
      description = LESSONS[i].summary
    }
    document.title = title
    document.querySelector('meta[name="description"]')?.setAttribute('content', description)
  }, [route])
}
