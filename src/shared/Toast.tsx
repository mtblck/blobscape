import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

/**
 * Small notices that slide down from the top center and go away on their own,
 * so nothing on the page moves to make room for them. A lesson shows one when
 * a goal ticks (`step`) and a bigger one when every goal is done (`lesson`).
 *
 * Toasts are not a live region: whoever raises one also says it to screen
 * readers in its own words (a lesson has its own polite status line), so it
 * isn't read twice.
 */
export type ToastKind = 'step' | 'lesson'

export interface ToastInput {
  kind: ToastKind
  title: string
  body?: string
  /** Links shown under the text. A toast with links stays until it's closed, so there's time to use them. */
  links?: { label: string; href: string }[]
}

interface Toast extends ToastInput {
  id: number
  leaving: boolean
}

/** At most this many at once; an older one makes way. */
const MAX = 3
const LEAVE_MS = 200

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Shows a toast. Newest goes on top. */
export function toast(t: ToastInput): number {
  const id = nextId++
  toasts = [{ ...t, id, leaving: false }, ...toasts]
  // Too many: the oldest still showing leaves
  const showing = toasts.filter((x) => !x.leaving)
  if (showing.length > MAX) dismissToast(showing[showing.length - 1].id)
  emit()
  return id
}

/** Slides a toast back up, then drops it. */
export function dismissToast(id: number) {
  if (!toasts.some((t) => t.id === id && !t.leaving)) return
  toasts = toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t))
  emit()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }, LEAVE_MS)
}

/** Clears every toast at once (a new page). */
export function clearToasts() {
  if (!toasts.length) return
  toasts = []
  emit()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** How long a toast without links stays: long enough to read its words. */
export function toastMs(t: ToastInput): number {
  const words = `${t.title} ${t.body ?? ''}`.trim().split(/\s+/).length
  return Math.min(14000, 4000 + words * 250)
}

/** Where toasts show. Put one on the page, outside anything that remounts. On a phone only the newest shows, so they don't cover the view. */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => toasts, () => toasts)
  return (
    <section
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4"
    >
      {list.map((t) => <ToastCard key={t.id} t={t} />)}
    </section>
  )
}

function ToastCard({ t }: { t: Toast }) {
  const [paused, setPaused] = useState(false)
  const left = useRef(t.links?.length ? Infinity : toastMs(t))
  // Counts down only while nobody is hovering or focused on it
  useEffect(() => {
    if (paused || t.leaving || !Number.isFinite(left.current)) return
    const start = performance.now()
    const timer = setTimeout(() => dismissToast(t.id), left.current)
    return () => {
      clearTimeout(timer)
      left.current -= performance.now() - start
    }
  }, [paused, t.leaving, t.id])

  const lesson = t.kind === 'lesson'
  return (
    <div
      data-testid={`toast-${t.kind}`}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false) }}
      onKeyDown={(e) => { if (e.key === 'Escape') dismissToast(t.id) }}
      className={`pointer-events-auto flex w-full max-w-md max-sm:[&:not(:first-child)]:hidden items-start gap-3 rounded-2xl border bg-paper py-3 pr-2 pl-3.5 text-ink shadow-[0_14px_30px_-12px_rgb(0_0_0/0.45)] ${lesson ? 'border-placard-edge' : 'border-rule'} ${t.leaving ? 'toast-out' : 'toast-in'}`}
    >
      {lesson ? <LessonIcon /> : <StepIcon />}
      <div className="min-w-0 flex-1 pt-0.5">
        <p className={`leading-snug font-semibold ${lesson ? 'font-display text-lg' : 'text-[0.95rem]'}`}>{t.title}</p>
        {t.body && <p className="mt-0.5 text-sm leading-snug text-ink-muted">{t.body}</p>}
        {t.links && (
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
            {t.links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => dismissToast(t.id)} className="text-accent underline underline-offset-2 hover:text-accent-ink hover:no-underline">{l.label}</a>
            ))}
          </p>
        )}
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={() => dismissToast(t.id)}
        className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-ink-faint transition-colors hover:bg-paper-sunk hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  )
}

/** A goal ticked: a tick in a green disc, like the done goal cards. */
function StepIcon() {
  return (
    <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-done text-paper">
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    </span>
  )
}

/** A whole lesson done: a star on the goal placard. */
function LessonIcon() {
  return (
    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-placard text-placard-edge ring-2 ring-placard-edge">
      <svg viewBox="0 0 24 24" className="size-6" fill="currentColor"><path d="M12 2.8l2.75 5.9 6.45.75-4.78 4.4 1.3 6.37L12 17.02l-5.72 3.2 1.3-6.37-4.78-4.4 6.45-.75z" /></svg>
    </span>
  )
}
