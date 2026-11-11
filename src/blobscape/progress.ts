import { useEffect, useState } from 'react'

/**
 * Which lesson goals you've reached. Kept only in this browser
 * (localStorage), and the page works the same when storage is blocked.
 */
const KEY = 'blobscape-progress'

type Store = Record<string, string[]>

function read(): Store {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    // Keep only lists of goal ids: anything else in storage is ignored, not trusted
    const out: Store = {}
    for (const [k, ids] of Object.entries(v)) if (Array.isArray(ids)) out[k] = ids.filter((x): x is string => typeof x === 'string')
    return out
  } catch {
    return {}
  }
}

function write(s: Store) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode or blocked: progress just isn't kept */ }
}

export function doneGoals(lesson: string): Set<string> {
  return new Set(read()[lesson] ?? [])
}

export function resetProgress() {
  try { localStorage.removeItem(KEY) } catch { /* nothing kept anyway */ }
}

export interface Goal { id: string; label: string; hint?: string }

/**
 * Ticks goals off as their checks come true. A goal stays ticked once
 * reached, so you're free to move on and play.
 */
export function useGoals(lesson: string, checks: Record<string, boolean>) {
  const [done, setDone] = useState(() => doneGoals(lesson))
  const met = Object.entries(checks).filter(([id, ok]) => ok && !done.has(id)).map(([id]) => id)
  const key = met.join(',')
  useEffect(() => {
    if (!key) return
    setDone((d) => {
      const next = new Set([...d, ...key.split(',')])
      write({ ...read(), [lesson]: [...next] })
      return next
    })
  }, [key, lesson])
  return done
}
