import { useEffect, useState } from 'react'

/**
 * Which lesson goals you've reached. Kept only in this browser
 * (localStorage), and the page works the same when storage is blocked.
 */
const KEY = 'blobscape-progress'

type Store = Record<string, string[]>

function read(): Store {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return v && typeof v === 'object' ? v : {}
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
