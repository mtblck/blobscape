import { useState } from 'react'

/**
 * The sticky header every experiment page shares: the beaker mark, then
 * "Matt Black / Experiments", and a theme switch on the right.
 */
export function SiteHeader({ hub = false }: { hub?: boolean }) {
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
              <Beaker className="h-8 w-8" />
            </a>
            <p className="flex min-w-0 items-baseline gap-1.5 truncate text-[0.95rem]">
              <a href="https://mattblack.space/" className="font-serif text-lg font-medium text-ink hover:text-accent">
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
          <ThemeSwitch />
        </div>
      </header>
    </>
  )
}

/** A lab beaker with liquid in it. The bubbles rise when you hover the mark. */
export function Beaker({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      {/* liquid, with a wavy surface, clipped to the inside of the glass */}
      <path
        d="M7.5 16c1.9-1.1 3.8-1.1 5.67 0s3.8 1.1 5.67 0 3.8-1.1 5.66 0V24a4 4 0 0 1-4 4h-9a4 4 0 0 1-4-4z"
        fill="var(--c-accent)"
        opacity="0.9"
      />
      <g fill="var(--c-paper)" opacity="0.85">
        <circle className="beaker-bubble" cx="12.5" cy="23" r="1.4" />
        <circle className="beaker-bubble beaker-bubble-2" cx="18.5" cy="20.5" r="1" />
      </g>
      <circle className="beaker-bubble beaker-bubble-3" cx="15.5" cy="11.5" r="0.9" fill="var(--c-accent)" />
      {/* the glass: a lipped rim with a pouring spout, straight walls, round foot */}
      <path
        d="M5.5 5.5c1.3 0 2 .7 2 2V24a4 4 0 0 0 4 4h9a4 4 0 0 0 4-4V5.5h1.2"
        strokeLinecap="round"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* measuring marks */}
      <path d="M20.5 9.5h4M22 12.5h2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
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
