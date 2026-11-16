import { useId, useRef, useState } from 'react'
import { Logo } from './Logo.tsx'
import { SITE } from '../blobscape/site.ts'

/** Blobscape's own pages, in the header (from a tablet up) and the menu. */
const PAGES = [
  { label: 'Lessons', path: '/lessons/' },
  { label: 'Sandbox', path: '/sandbox/' },
  { label: 'Experiments', path: '/experiments/' },
] as const

/** True when `path` is the page we're on, or the list it belongs to (a lesson under Lessons, an experiment under Experiments). */
const isHere = (here: string | undefined, path: string) =>
  !!here && (here === path || (path === '/lessons/' && here.startsWith('/lessons/')) || (path === '/experiments/' && here.startsWith('/experiments/')))

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

const LINK = 'block rounded-lg px-3 py-2.5 text-lg font-medium text-ink no-underline transition-colors hover:bg-paper-sunk hover:text-accent aria-[current=page]:text-accent'

/** The menu: every page, in Matt's order, then Support (Ko-fi, after a rule) and the theme. */
const MENU = [
  { label: 'Home', path: '/' },
  { label: 'Lessons', path: '/lessons/' },
  { label: 'Experiments', path: '/experiments/' },
  { label: 'Sandbox', path: '/sandbox/' },
  { label: 'Get in touch', path: '/contact/' },
] as const
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
        className="max-h-[calc(100dvh-5rem)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-rule bg-paper p-5 text-ink shadow-xl"
        style={{ inset: 'auto', top: '4rem', right: 'max(1rem, calc((100vw - 80rem) / 2 + 1rem))', margin: 0 }}
      >
        <nav aria-label={SITE.name}>
          <ul className="flex flex-col">
            {MENU.map((p) => (
              <li key={p.path}>
                <a href={p.path} aria-current={isHere(here, p.path) ? 'page' : undefined} className={LINK}>{p.label}</a>
              </li>
            ))}
            <li className="mt-1 border-t border-rule pt-1">
              <a href={SITE.tip} target="_blank" rel="noopener" className={`${LINK} flex items-center gap-2.5`}>
                <svg viewBox="0 0 24 24" className="size-4.5 text-accent" aria-hidden fill="currentColor"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.2 0 3.6 1.2 4.3 2.5h2c.7-1.3 2.1-2.5 4.3-2.5 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" /></svg>
                Support<span className="sr-only"> Blobscape on Ko-fi (opens in a new tab)</span>
                <svg viewBox="0 0 24 24" className="ml-auto size-4 text-ink-faint" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
              </a>
            </li>
          </ul>
        </nav>
        <div className="mt-4 border-t border-rule pt-4">
          <p className={`${HEAD} mb-2`}>Theme</p>
          <div className="px-2"><ThemeChoice /></div>
        </div>
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
