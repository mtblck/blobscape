import { useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

/** Shared controls for every experiment, so hover, cursor and focus states match across pages. */

/**
 * Accessible tabs (WAI-ARIA tabs pattern): arrow keys, Home and End move
 * between tabs; every panel stays mounted so its state and labels survive.
 */
export function Tabs({ label, tabs }: { label: string; tabs: { id: string; label: string; summary: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0].id)
  const base = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKeyDown = (ev: React.KeyboardEvent, i: number) => {
    const n = tabs.length
    const to = ev.key === 'ArrowRight' ? (i + 1) % n : ev.key === 'ArrowLeft' ? (i - 1 + n) % n : ev.key === 'Home' ? 0 : ev.key === 'End' ? n - 1 : -1
    if (to < 0) return
    ev.preventDefault()
    setActive(tabs[to].id)
    refs.current[to]?.focus()
  }
  return (
    <div>
      <div role="tablist" aria-label={label} className={`grid ${tabs.length > 4 ? 'grid-cols-3 sm:grid-flow-col sm:auto-cols-fr sm:grid-cols-none sm:border-b sm:border-rule' : 'grid-flow-col auto-cols-fr border-b border-rule'}`}>
        {tabs.map((t, i) => {
          const on = t.id === active
          return (
            <button
              key={t.id}
              ref={(el) => { refs.current[i] = el }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-controls={`${base}-panel-${t.id}`}
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(t.id)}
              onKeyDown={(ev) => onKeyDown(ev, i)}
              className={`group/tab -mb-px min-w-0 cursor-pointer rounded-t-md border-b-2 px-2 pt-2 pb-2.5 text-left transition-colors hover:bg-paper-sunk sm:px-3 ${on ? 'border-accent' : `${tabs.length > 4 ? 'max-sm:border-rule' : ''} border-transparent hover:border-ink-faint`}`}
            >
              <span className={`block truncate font-display ${tabs.length > 4 ? 'text-base' : 'text-lg'} transition-colors ${on ? 'text-ink' : 'text-ink-muted group-hover/tab:text-ink'}`}>{t.label}</span>
              <span className="block truncate text-xs text-ink-faint transition-colors group-hover/tab:text-ink-muted">{t.summary}</span>
            </button>
          )
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`${base}-panel-${t.id}`} aria-labelledby={`${base}-tab-${t.id}`} hidden={t.id !== active} className="pt-4">
          {t.content}
        </div>
      ))}
    </div>
  )
}

export function Panel({ note, children }: { note: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-ink-faint">{note}</p>
      {children}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className="field-row grid gap-1.5 text-sm sm:grid-cols-[8.5rem_1fr] sm:items-center">
      <span id={id} className="text-ink-muted">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function Slider({ label, value, min, max, step, onChange, format, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string; hint?: string }) {
  const id = useId()
  return (
    <div className="text-sm">
      <label className="slider-row grid gap-x-3 gap-y-1 sm:grid-cols-[8.5rem_1fr_4.5rem] sm:items-center">
        <span className="text-ink-muted">{label}</span>
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-valuetext={format(value)}
          aria-describedby={hint ? id : undefined}
          className="w-full accent-[var(--c-accent)]"
        />
        <span aria-hidden className="slider-value tabular-nums text-ink-faint sm:text-right">{format(value)}</span>
      </label>
      {hint && <p id={id} className="slider-hint mt-1 text-xs leading-relaxed text-ink-faint sm:pl-[9.25rem]">{hint}</p>}
    </div>
  )
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted hover:text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--c-accent)]" />
      {label}
    </label>
  )
}

export function Chip({ active, onClick, children, small }: { active?: boolean; onClick: () => void; children: ReactNode; small?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      // Filled at rest so it reads as a button; hovering lifts it and darkens the outline
      className={`rounded-full border shadow-[0_1px_0_rgb(0_0_0/0.12)] transition-[transform,box-shadow,background-color,border-color,color] hover:-translate-y-px hover:shadow-[0_3px_6px_-2px_rgb(0_0_0/0.25)] active:translate-y-0 active:shadow-none ${small ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'} ${active ? 'border-accent bg-accent/20 font-medium text-accent-ink hover:bg-accent/25' : 'border-ink-faint/30 bg-rule text-ink hover:border-ink-faint'}`}
    >
      {children}
    </button>
  )
}

/** A plain button: `primary` is the filled accent one, the default is outlined. */
export function Button({ primary, small, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; small?: boolean }) {
  const size = small ? 'px-3 py-1.5 text-sm' : primary ? 'px-4 py-2 font-medium' : 'px-3 py-2 text-sm'
  const look = primary
    ? 'bg-accent text-paper hover:bg-accent-ink'
    : 'border border-rule hover:border-ink-faint hover:bg-paper-sunk'
  return <button type="button" className={`rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${size} ${look} ${className ?? ''}`} {...rest} />
}
