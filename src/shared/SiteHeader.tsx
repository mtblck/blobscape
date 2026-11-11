import { useId, useRef, useState, type ReactNode } from 'react'

/**
 * The sticky header every experiment page shares: the flask mark, then
 * "Matt Black / Experiments", and a theme switch on the right. A page that
 * passes `menu` gets a menu button there instead, and the theme choice moves
 * into the menu.
 */
export function SiteHeader({ hub = false, menu }: { hub?: boolean; menu?: ReactNode }) {
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
          <nav aria-label="Site" className="flex min-w-0 items-center gap-2.5">
            <a href="/experiments/" className="group shrink-0 text-ink hover:text-accent" aria-label="Experiments home">
              <Flask className="h-7 w-7" />
            </a>
            <p className="flex min-w-0 items-baseline gap-1.5 truncate leading-none">
              {/* The portfolio header's name: Archivo, semibold, 15px (mb-portfolio Header.jsx) */}
              <a href="https://mattblack.space/" className="font-sans text-[0.9375rem] font-semibold text-ink hover:text-accent">
                Matt Black
              </a>
              <span aria-hidden className="text-ink-faint">/</span>
              <a
                href="/experiments/"
                aria-current={hub ? 'page' : undefined}
                className="text-xs font-medium uppercase tracking-[0.14em] text-ink-muted hover:text-accent"
              >
                Experiments
              </a>
            </p>
          </nav>
          {menu ? <SiteMenu>{menu}</SiteMenu> : <ThemeSwitch />}
        </div>
      </header>
    </>
  )
}

/** An Erlenmeyer flask with liquid in it. The bubbles rise when you hover the mark. */
export function Flask({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      {/* liquid, with a wavy surface, filling the cone */}
      <path
        d="M9.23 18c1.5-.9 3-.9 4.5 0s3 .9 4.5 0 3-.9 4.54 0l4.53 6.6a2.5 2.5 0 0 1-2.1 3.9H7.3a2.5 2.5 0 0 1-2.1-3.9z"
        fill="var(--c-accent)"
        opacity="0.9"
      />
      <g fill="var(--c-paper)" opacity="0.85">
        <circle className="flask-bubble" cx="13" cy="24.5" r="1.4" />
        <circle className="flask-bubble flask-bubble-2" cx="18.5" cy="22" r="1" />
      </g>
      <circle className="flask-bubble flask-bubble-3" cx="16" cy="14.5" r="0.9" fill="var(--c-accent)" />
      {/* the glass: a lipped neck opening into a cone with a flat, rounded foot */}
      <path
        d="M13.5 3.5V11L5.2 24.6a2.5 2.5 0 0 0 2.1 3.9h17.4a2.5 2.5 0 0 0 2.1-3.9L18.5 11V3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M11.5 3.5h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/**
 * A menu button and its panel. The panel is a native popover, so Escape and a
 * click outside close it and it sits above everything; following a link in it
 * closes it too.
 */
function SiteMenu({ children }: { children: ReactNode }) {
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
        className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-rule px-3 text-sm text-ink-muted hover:border-ink-faint hover:text-ink"
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
        aria-label="Menu"
        role="dialog"
        onToggle={(e) => setOpen((e as unknown as ToggleEvent).newState === 'open')}
        onClick={(e) => { if ((e.target as HTMLElement).closest('a')) panel.current?.hidePopover() }}
        className="max-h-[calc(100dvh-5rem)] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-rule bg-paper p-5 text-ink shadow-xl"
        style={{ inset: 'auto', top: '4rem', right: 'max(1rem, calc((100vw - 80rem) / 2 + 1rem))', margin: 0 }}
      >
        {children}
      </div>
    </>
  )
}

/** Light and dark as two buttons, for inside a menu. */
export function ThemeChoice() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'))
  const pick = (t: 'light' | 'dark') => {
    document.documentElement.dataset.theme = t
    try {
      localStorage.setItem('mb-theme', t)
    } catch {
      /* private mode: the choice still applies to this page */
    }
    setTheme(t)
  }
  return (
    <div role="group" aria-label="Theme" className="flex gap-1.5">
      {(['light', 'dark'] as const).map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={theme === t}
          onClick={() => pick(t)}
          className={`rounded-full border px-3 py-1.5 text-sm capitalize ${theme === t ? 'border-accent bg-accent/15 text-accent-ink' : 'border-rule text-ink-muted hover:border-ink-faint hover:text-ink'}`}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

function ThemeSwitch() {
  // theme.js has already set data-theme before React runs, so read it straight away
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'))
  const next = theme === 'dark' ? 'light' : 'dark'
  const flip = () => {
    document.documentElement.dataset.theme = next
    try {
      // Same key as the portfolio, so the choice carries across mattblack.space
      localStorage.setItem('mb-theme', next)
    } catch {
      /* private mode: the switch still works for this page */
    }
    setTheme(next)
  }
  return (
    <button
      type="button"
      onClick={flip}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-rule text-ink-muted hover:border-ink-faint hover:text-ink"
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        </svg>
      )}
    </button>
  )
}
