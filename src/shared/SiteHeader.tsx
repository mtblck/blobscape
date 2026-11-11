import { useId, useRef, useState } from 'react'
import { Logo } from './Logo.tsx'
import { EXPERIMENTS, SITE } from '../blobscape/site.ts'
import { LESSONS } from '../blobscape/routes.ts'

/** Blobscape's own pages, in the header (from a tablet up) and the menu. */
const PAGES = [
  { label: 'Lessons', path: '/lessons/' },
  { label: 'Sandbox', path: '/sandbox/' },
  { label: 'Creature', path: '/creature/' },
] as const

/** True when `path` is the page we're on, or (for /lessons/) a lesson under it. */
const isHere = (here: string | undefined, path: string) => !!here && (here === path || (path === '/lessons/' && here.startsWith('/lessons/')))

/**
 * The sticky header every page shares: the Blobscape logo, the main pages
 * and a menu button with everything else, including the theme. `here` is the
 * current page's path, so its link is marked as the current page.
 */
export function SiteHeader({ here }: { here?: string }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-paper focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-rule bg-paper/85 backdrop-blur-md supports-[not(backdrop-filter:blur(0))]:bg-paper">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
          <a href="/" aria-current={here === '/' ? 'page' : undefined} className="-mx-1 shrink-0 rounded-md px-1 py-1.5 transition-transform hover:-translate-y-px">
            <Logo className="h-6 w-auto sm:h-7" title="Blobscape home" />
          </a>
          <div className="flex items-center gap-1">
            <nav aria-label="Main" className="max-md:hidden">
              <ul className="flex items-center gap-1">
                {PAGES.map((p) => (
                  <li key={p.path}>
                    <a
                      href={p.path}
                      aria-current={isHere(here, p.path) ? 'page' : undefined}
                      className="rounded-full px-3 py-1.5 text-[0.9375rem] font-medium text-ink-muted no-underline transition-colors hover:bg-paper-sunk hover:text-ink aria-[current=page]:text-ink aria-[current=page]:underline aria-[current=page]:decoration-blob aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-[6px]"
                    >
                      {p.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <SiteMenu here={here} />
          </div>
        </div>
      </header>
    </>
  )
}

const LINK = 'block rounded-md px-2 py-1.5 text-ink no-underline hover:bg-paper-sunk hover:text-accent aria-[current=page]:text-accent'
const HEAD = 'px-2 text-xs font-semibold tracking-wider text-ink-faint uppercase'

/**
 * The menu button and its panel. The panel is a native popover, so Escape and
 * a click outside close it and it sits above everything; following a link in
 * it closes it too.
 */
function SiteMenu({ here }: { here?: string }) {
  const id = useId()
  const panel = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const learn = [
    { label: 'Front page', path: '/' },
    { label: 'Lessons', path: '/lessons/' },
    { label: `Start with ${LESSONS[0].title.toLowerCase()}`, path: `/lessons/${LESSONS[0].id}/` },
    { label: 'Sandbox', path: '/sandbox/' },
  ]
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-expanded={open}
        aria-controls={id}
        className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-rule px-3 text-sm font-medium text-ink-muted hover:border-ink-faint hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
        Menu
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        onToggle={(e) => setOpen((e as unknown as ToggleEvent).newState === 'open')}
        onClick={(e) => { if ((e.target as HTMLElement).closest('a')) panel.current?.hidePopover() }}
        className="max-h-[calc(100dvh-5rem)] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-rule bg-paper p-5 text-ink shadow-xl"
        style={{ inset: 'auto', top: '4rem', right: 'max(1rem, calc((100vw - 80rem) / 2 + 1rem))', margin: 0 }}
      >
        <nav aria-label={SITE.name} className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className={HEAD}>Learn</p>
            <ul className="mt-1.5">
              {learn.map((p) => (
                <li key={p.path}>
                  <a href={p.path} aria-current={here === p.path ? 'page' : undefined} className={LINK}>{p.label}</a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className={HEAD}>Experiments</p>
            <ul className="mt-1.5">
              {EXPERIMENTS.map((e) => <li key={e.id}><a href={e.url} aria-current={here === e.url ? 'page' : undefined} className={LINK}>{e.title}</a></li>)}
            </ul>
          </div>
          <div className="border-t border-rule pt-4 sm:col-span-2">
            <p className={`${HEAD} mb-2`}>Theme</p>
            <div className="px-2"><ThemeChoice /></div>
          </div>
        </nav>
      </div>
    </>
  )
}

type Theme = 'system' | 'light' | 'dark'
const THEME_KEY = 'blobscape-theme'

/** System, light or dark, as three buttons. theme.js applies a saved choice before first paint. */
export function ThemeChoice() {
  const [theme, setTheme] = useState<Theme>(() => {
    const t = document.documentElement.dataset.theme
    return t === 'light' || t === 'dark' ? t : 'system'
  })
  const pick = (t: Theme) => {
    if (t === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = t
    try {
      if (t === 'system') localStorage.removeItem(THEME_KEY)
      else localStorage.setItem(THEME_KEY, t)
    } catch {
      /* private mode: the choice still applies to this page */
    }
    setTheme(t)
  }
  return (
    <div role="group" aria-label="Theme" className="flex gap-1.5">
      {(['system', 'light', 'dark'] as const).map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={theme === t}
          onClick={() => pick(t)}
          className={`rounded-full border px-3 py-1.5 text-sm ${theme === t ? 'border-accent bg-accent/15 text-ink' : 'border-rule text-ink-muted hover:border-ink-faint hover:text-ink'}`}
        >
          {t[0].toUpperCase() + t.slice(1)}
        </button>
      ))}
    </div>
  )
}
