import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Loop } from './Gallery.tsx'
import { matching, type Pickable } from './pick.ts'

/** A scene in the picker: `loop` is false for one with no recorded loop (a file the visitor opened). */
export type PickerScene = Pickable & { loop?: boolean }

/** Cards drawn at first, and added each time the end of the list nears the screen. */
const BATCH = 12

/**
 * Every scene as a card with its recorded loop, in a large modal (the whole screen on a phone)
 * with a search box that stays put above the list (focused as it opens, except on a touchscreen,
 * where the keyboard would cover the cards). The keyboard stays in the search box: typing
 * narrows the list, the up and down arrows move through it and Enter opens the scene marked. Cards
 * are added as the list is scrolled, and a card's loop is only fetched as it nears the screen, so
 * a long list costs no more to open than a short one.
 */
export function ScenePicker({ open, onClose, scenes, current, onPick }: { open: boolean; onClose: () => void; scenes: readonly PickerScene[]; current: string; onPick: (id: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const more = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(current)
  const [count, setCount] = useState(BATCH)
  const found = useMemo(() => matching(scenes, query), [scenes, query])
  const at = Math.max(0, found.findIndex((s) => s.id === active))
  const shown = found.slice(0, Math.max(count, at + 1))

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      // opens on the scene that is playing, with the search box ready to type in
      setQuery('')
      setActive(current)
      setCount(BATCH * Math.ceil((scenes.findIndex((s) => s.id === current) + 2) / BATCH))
      d.showModal()
      // on a touchscreen the search waits for a tap, or the keyboard would come up over half the cards
      if (!window.matchMedia('(pointer: coarse)').matches) search.current?.focus()
    }
    if (!open && d.open) d.close()
    // only opening and closing: the scene playing is read as it opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // the card marked stays in sight as the arrows move it (and as the picker opens on the playing scene)
  useEffect(() => {
    if (open) list.current?.querySelector(`[data-scene="${CSS.escape(active)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, shown.length])

  // more cards as the end of the list nears the screen
  const all = shown.length >= found.length
  useEffect(() => {
    const end = more.current
    if (!open || all || !end || typeof IntersectionObserver === 'undefined') return
    const seen = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setCount((c) => c + BATCH) }, { root: list.current, rootMargin: '600px' })
    seen.observe(end)
    return () => seen.disconnect()
  }, [open, all, shown.length])

  const pick = (id: string) => { onPick(id); onClose() }
  const move = (by: number) => { if (found.length) setActive(found[Math.min(found.length - 1, Math.max(0, at + by))].id) }
  const marked = found[at]
  /** The search box's keys, and the list's when it is tabbed to: the arrows move the mark, Enter opens it. */
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Enter' && marked) { e.preventDefault(); pick(marked.id) }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="scene-picker-title"
      data-testid="scene-picker"
      onClose={onClose}
      // a click on the dimmed page behind closes it: the dialog itself is the only thing a click there lands on
      onClick={(e) => { if (e.target === ref.current) onClose() }}
      className="m-auto h-[min(100%-2rem,56rem)] max-h-none w-[min(100%-2rem,72rem)] max-w-none overflow-hidden rounded-2xl border border-rule bg-paper p-0 text-ink shadow-2xl backdrop:bg-black/60 max-sm:h-full max-sm:w-full max-sm:rounded-none max-sm:border-0"
    >
      {open && (
        <div className="flex h-full flex-col">
          <header className="flex-none border-b border-rule p-3 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 id="scene-picker-title" className="font-display text-2xl leading-tight sm:text-3xl">Select a scene</h2>
              <button type="button" onClick={onClose} aria-label="Close the scene list" className="grid size-9 flex-none cursor-pointer place-items-center rounded-full border border-rule text-ink hover:bg-paper-sunk">
                <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <div className="relative mt-3">
              <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
              <input
                ref={search}
                type="search"
                role="combobox"
                aria-label="Search the scenes"
                aria-expanded="true"
                aria-controls="scene-picker-list"
                aria-activedescendant={marked ? `scene-option-${marked.id}` : undefined}
                aria-autocomplete="list"
                autoComplete="off"
                enterKeyHint="go"
                placeholder="Search the scenes"
                value={query}
                data-testid="scene-search"
                onChange={(e) => { setQuery(e.target.value); const first = matching(scenes, e.target.value)[0]; if (first) setActive(first.id); list.current?.scrollTo({ top: 0 }) }}
                onKeyDown={keys}
                className="w-full rounded-lg border border-ink-faint/50 bg-paper py-2.5 pr-3 pl-9 text-base text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
              />
            </div>
            <p role="status" className="mt-2 text-xs text-ink-muted" data-testid="scene-count">
              {found.length === 0 ? `No scene matches “${query.trim()}”.` : query.trim() ? `${found.length} of ${scenes.length} scenes` : `${scenes.length} scenes`}
              <span className="max-sm:hidden">{found.length > 0 && '. Arrow keys move through them, Enter opens one.'}</span>
            </p>
          </header>
          {/* it scrolls, so the keyboard must be able to reach it; there it takes the same keys as the search box */}
          <div ref={list} tabIndex={0} role="group" aria-label="Scenes, scrolling" onKeyDown={keys} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:p-5">
            <div id="scene-picker-list" role="listbox" aria-label="Scenes" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {shown.map((s) => {
                const playing = s.id === current, on = marked?.id === s.id
                return (
                  <div
                    key={s.id}
                    id={`scene-option-${s.id}`}
                    role="option"
                    aria-selected={playing}
                    data-scene={s.id}
                    data-marked={on || undefined}
                    onClick={() => pick(s.id)}
                    className={`relative flex scroll-m-3 cursor-pointer flex-col gap-2 rounded-2xl border bg-paper p-2.5 transition-colors hover:border-ink-faint ${playing ? 'border-accent bg-accent/10' : 'border-rule'} ${on ? 'outline-2 outline-offset-2 outline-accent' : ''}`}
                  >
                    {s.loop === false
                      ? <div className="case grid aspect-[410/307] w-full place-items-center rounded-xl bg-paper p-3 text-center text-sm text-ink-muted ring-1 ring-rule">Opened from a file</div>
                      : <Loop id={s.id} />}
                    <span className="flex flex-wrap items-baseline justify-between gap-x-2 px-1">
                      <span className="font-display text-lg leading-tight text-ink">{s.label}</span>
                      {playing && <span className="text-xs font-medium text-accent-ink">Playing now</span>}
                    </span>
                  </div>
                )
              })}
            </div>
            {!all && <div ref={more} aria-hidden className="h-px" />}
          </div>
        </div>
      )}
    </dialog>
  )
}
