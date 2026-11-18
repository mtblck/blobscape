import { useRef, type ReactNode } from 'react'

/** The sandbox shows one mode at a time: its tools, its panel. */
export type ModeId = 'build' | 'select' | 'creatures' | 'effects' | 'scene'

export const MODES: { id: ModeId; name: string; note: string; icon: string; dashed?: boolean }[] = [
  { id: 'build', name: 'Build', note: 'Put blobs down, rub them out, patch holes and copy things.', icon: 'M14 4l6 6-9 9H5v-6z' },
  { id: 'select', name: 'Select', note: 'Pick blobs, then move, recolor, resize or delete them.', icon: 'M4 4h16v16H4z', dashed: true },
  { id: 'creatures', name: 'Creatures', note: 'Add creatures that move in your scene.', icon: 'M5 19c0-7 3-12 7-12s7 5 7 12zM10 14h.01M14 14h.01' },
  { id: 'effects', name: 'Effects', note: 'Blow it up, melt it, twist it.', icon: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z' },
  { id: 'scene', name: 'Scene', note: 'Start again, open your own, save, film a camera path.', icon: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6' },
]

/** The mode an address asks for (`?mode=`), Build when it names none. */
export const modeFrom = (search: string): ModeId => {
  const asked = new URLSearchParams(search).get('mode')
  return MODES.find((m) => m.id === asked)?.id ?? 'build'
}

/** The address for a mode: Build is the plain address, the others carry `?mode=`. */
export const addressFor = (href: string, mode: ModeId): string => {
  const url = new URL(href)
  if (mode === 'build') url.searchParams.delete('mode')
  else url.searchParams.set('mode', mode)
  return url.pathname + url.search + url.hash
}

export const Icon = ({ d, dashed, className = 'h-5 w-5' }: { d: string; dashed?: boolean; className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden className={`flex-none ${className}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dashed ? '3 3' : undefined}><path d={d} /></svg>
)

export const tabId = (base: string, mode: ModeId) => `${base}-mode-${mode}`
export const panelId = (base: string, mode: ModeId) => `${base}-panel-${mode}`

/**
 * The five modes as a tab list: a rail down the left on a wide screen, a bar
 * along the bottom on a phone. Arrow keys in either direction move between them.
 */
export function ModeBar({ mode, setMode, base, marks }: { mode: ModeId; setMode: (m: ModeId) => void; base: string; marks?: Partial<Record<ModeId, ReactNode>> }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKeyDown = (ev: React.KeyboardEvent, i: number) => {
    const n = MODES.length
    const to = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? (i + 1) % n : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? (i - 1 + n) % n : ev.key === 'Home' ? 0 : ev.key === 'End' ? n - 1 : -1
    if (to < 0) return
    ev.preventDefault()
    setMode(MODES[to].id)
    refs.current[to]?.focus()
  }
  return (
    <div role="tablist" aria-label="Sandbox modes" className="flex gap-1 border-t border-rule bg-paper px-1 py-1 lg:min-h-0 lg:flex-1 lg:w-24 lg:flex-col lg:items-center lg:rounded-2xl lg:border lg:bg-paper-sunk lg:p-2">
      {MODES.map((m, i) => {
        const on = m.id === mode
        return (
          <button
            key={m.id}
            ref={(el) => { refs.current[i] = el }}
            type="button"
            role="tab"
            id={tabId(base, m.id)}
            aria-controls={panelId(base, m.id)}
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            title={m.note}
            onClick={() => setMode(m.id)}
            onKeyDown={(ev) => onKeyDown(ev, i)}
            className={`relative flex min-h-12 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-xs font-semibold transition-colors lg:min-h-16 lg:w-20 lg:flex-none ${on ? 'bg-accent text-paper' : 'text-ink-muted hover:bg-paper-sunk hover:text-ink lg:hover:bg-paper'}`}
          >
            <Icon d={m.icon} dashed={m.dashed} />
            <span className="max-w-full truncate">{m.name}</span>
            {marks?.[m.id]}
          </button>
        )
      })}
    </div>
  )
}

/** A tool as a button that says what it does: the held one is outlined. */
export function ToolButton({ name, note, held, onClick }: { name: string; note: string; held: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={held} title={note} onClick={onClick} className={`min-h-11 cursor-pointer rounded-full border px-4 text-sm font-semibold transition-colors ${held ? 'border-accent bg-accent text-paper' : 'border-rule bg-paper text-ink hover:border-ink-faint'}`}>
      {name}
    </button>
  )
}
