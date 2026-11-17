import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Logo } from './Logo.tsx'
import { SITE } from '../blobscape/site.ts'

/** Blobscape's own pages, in the header (from a tablet up) and the phone menu. */
const PAGES = [
  { label: 'Lessons', path: '/lessons/' },
  { label: 'Experiments', path: '/experiments/' },
  { label: 'Sandbox', path: '/sandbox/' },
] as const

/** What the Engine dropdown lists: the engine's pages, then the package where it lives outside the site. */
const ENGINE = [
  { label: 'Overview', path: '/engine/', note: 'What the engine is and what it draws' },
  { label: 'Docs', path: '/engine/docs/', note: 'Getting started and every export' },
  { label: 'File spec', path: '/engine/rigged-splats/', note: 'Rigged splats in .glb files' },
] as const
const ENGINE_OUT = [
  { label: 'npm', href: 'https://www.npmjs.com/package/@blobscape/engine' },
  { label: 'GitHub', href: SITE.repo },
] as const

/** True when `path` is the page we're on, or the list it belongs to (a lesson under Lessons, an experiment under Experiments). */
const isHere = (here: string | undefined, path: string) =>
  !!here && (here === path || (path === '/lessons/' && here.startsWith('/lessons/')) || (path === '/experiments/' && here.startsWith('/experiments/')))

const TOP = 'rounded-full px-3 py-1.5 text-[0.9375rem] font-medium text-ink-muted no-underline transition-colors hover:bg-paper-sunk hover:text-ink'
const CURRENT = 'text-ink underline decoration-blob decoration-2 underline-offset-[6px]'

/**
 * The sticky header every page shares: the Blobscape logo, the main pages with the engine's as a dropdown, and a
 * theme button. On a phone the pages fold into a menu button. `here` is the current page's path, so its link is
 * marked as the current page. Contact and support live in the footer and the floating tip button.
 */
export function SiteHeader({ here }: { here?: string }) {
  const inEngine = !!here?.startsWith('/engine/')
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
                    <a href={p.path} aria-current={isHere(here, p.path) ? 'page' : undefined} className={`${TOP} aria-[current=page]:text-ink aria-[current=page]:underline aria-[current=page]:decoration-blob aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-[6px]`}>
                      {p.label}
                    </a>
                  </li>
                ))}
                <li>
                  <Drop
                    testId="engine-menu"
                    width="17rem"
                    button={(open) => (
                      <>
                        <span className={inEngine ? CURRENT : undefined}>Engine</span>
                        <Chevron open={open} />
                      </>
                    )}
                    buttonClass={`${TOP} flex cursor-pointer items-center gap-1.5 ${inEngine ? 'text-ink' : ''}`}
                  >
                    <ul className="flex flex-col">
                      {ENGINE.map((p) => (
                        <li key={p.path}>
                          <a href={p.path} aria-current={here === p.path ? 'page' : undefined} className={LINK}>
                            {p.label}
                            <span className="block text-sm font-normal text-ink-muted">{p.note}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                    <ul className="mt-2 flex gap-1 border-t border-rule pt-2">
                      {ENGINE_OUT.map((p) => (
                        <li key={p.href} className="flex-1"><Out href={p.href} label={p.label} /></li>
                      ))}
                    </ul>
                  </Drop>
                </li>
              </ul>
            </nav>
            <ThemeButton />
            <div className="md:hidden"><PhoneMenu here={here} /></div>
          </div>
        </div>
      </header>
    </>
  )
}

const LINK = 'block rounded-lg px-3 py-2 text-base font-medium text-ink no-underline transition-colors hover:bg-paper-sunk hover:text-accent aria-[current=page]:text-accent'
const HEAD = 'text-xs font-semibold tracking-wider text-ink-faint uppercase'

const Chevron = ({ open }: { open: boolean }) => (
  <svg aria-hidden="true" viewBox="0 0 12 12" className={`size-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}><path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
)

/** A link that leaves the site, in a new tab, and says so. */
function Out({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener" className={`${LINK} flex items-center gap-2 text-sm`}>
      {label}<span className="sr-only"> (opens in a new tab)</span>
      <svg viewBox="0 0 24 24" className="ml-auto size-4 text-ink-faint" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
    </a>
  )
}

/**
 * A header button and the panel it opens under itself. The panel is a native popover, so Escape and a click outside
 * close it and it sits above everything; following a link in it closes it too. It hangs from the button's right
 * edge, placed when it opens (the header is sticky, so the place holds while the page scrolls).
 */
function Drop({ button, buttonClass, label, width, testId, children }: { button: (open: boolean) => ReactNode; buttonClass: string; label?: string; width: string; testId?: string; children: ReactNode }) {
  const id = useId()
  const opener = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const place = () => {
    const b = opener.current?.getBoundingClientRect()
    const el = panel.current
    if (!b || !el) return
    el.style.top = `${Math.round(b.bottom + 10)}px`
    el.style.right = `${Math.max(16, Math.round(document.documentElement.clientWidth - b.right))}px`
  }
  // a window that changes size moves the button: shut the panel sooner than leave it hanging where the button was
  useEffect(() => {
    if (!open) return
    const shut = () => panel.current?.hidePopover()
    window.addEventListener('resize', shut)
    return () => window.removeEventListener('resize', shut)
  }, [open])
  return (
    <>
      <button ref={opener} type="button" popoverTarget={id} aria-expanded={open} aria-controls={id} aria-label={label} data-testid={testId} className={buttonClass}>
        {button(open)}
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        onBeforeToggle={(e) => { if ((e as unknown as ToggleEvent).newState === 'open') place() }}
        onToggle={(e) => setOpen((e as unknown as ToggleEvent).newState === 'open')}
        onClick={(e) => { if ((e.target as HTMLElement).closest('a')) panel.current?.hidePopover() }}
        className="max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-2xl border border-rule bg-paper p-2 text-ink shadow-xl"
        style={{ inset: 'auto', top: '4rem', right: '1rem', margin: 0, width: `min(${width}, calc(100vw - 2rem))` }}
      >
        {children}
      </div>
    </>
  )
}

/** The phone's menu: every page, the engine's under their own heading. The theme has its own button beside it. */
function PhoneMenu({ here }: { here?: string }) {
  return (
    <Drop
      width="16rem"
      buttonClass="flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-rule px-3 text-sm font-medium text-ink-muted hover:border-ink-faint hover:text-ink"
      button={(open) => (
        <>
          <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
          Menu
        </>
      )}
    >
      <nav aria-label={SITE.name}>
        <ul className="flex flex-col">
          {[{ label: 'Home', path: '/' }, ...PAGES].map((p) => (
            <li key={p.path}><a href={p.path} aria-current={isHere(here, p.path) ? 'page' : undefined} className={LINK}>{p.label}</a></li>
          ))}
        </ul>
        <p className={`${HEAD} mt-2 border-t border-rule px-3 pt-3 pb-1`}>Engine</p>
        <ul className="flex flex-col">
          {ENGINE.map((p) => (
            <li key={p.path}><a href={p.path} aria-current={here === p.path ? 'page' : undefined} className={LINK}>{p.label}</a></li>
          ))}
        </ul>
      </nav>
    </Drop>
  )
}

type Theme = 'system' | 'light' | 'dark'
const THEME_KEY = 'blobscape-theme'

const THEME_ICON: Record<Theme, ReactNode> = {
  system: <><rect x="3" y="4.5" width="18" height="12" rx="2" /><path d="M8.5 20h7M12 16.5V20" /></>,
  light: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" /></>,
  dark: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
}

/**
 * The theme button: an icon for the theme in use, opening System, Light and Dark. theme.js applies a saved choice
 * before first paint.
 */
export function ThemeButton() {
  // Starts on System, as in the prerendered page (which can't know the choice), then reads the saved one: reading it
  // while the page is picked up would leave the prerendered button showing System
  const [theme, setTheme] = useState<Theme>('system')
  useEffect(() => {
    const t = document.documentElement.dataset.theme
    if (t === 'light' || t === 'dark') setTheme(t)
  }, [])
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
    <Drop
      width="auto"
      label={`Theme: ${theme}`}
      testId="theme-button"
      buttonClass="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-ink-muted transition-colors hover:bg-paper-sunk hover:text-ink"
      button={() => <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{THEME_ICON[theme]}</svg>}
    >
      <div role="group" aria-label="Theme" className="flex flex-col">
        {(['system', 'light', 'dark'] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={theme === t}
            onClick={() => pick(t)}
            className={`flex cursor-pointer items-center gap-2.5 rounded-lg py-2 pr-8 pl-3 text-left text-base font-medium transition-colors hover:bg-paper-sunk ${theme === t ? 'text-accent' : 'text-ink'}`}
          >
            <svg viewBox="0 0 24 24" className="size-4.5 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{THEME_ICON[t]}</svg>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
    </Drop>
  )
}
