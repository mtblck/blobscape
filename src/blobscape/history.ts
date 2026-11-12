import type { Blobs } from '../splat-core/blobs.ts'
import type { Actor } from './actors.ts'

/** A scene as it was: its blobs, the name of what it started from, and the creatures in it (values, never changed in place). */
export interface Snapshot { blobs: Blobs; source: string; actors?: readonly Actor[] }

/**
 * Undo and redo as whole snapshots of the blob list. Simple and exact; a
 * 20,000-blob scene is about a megabyte, so a byte budget caps the history
 * rather than a step count.
 */
export class History {
  private past: Snapshot[] = []
  private future: Snapshot[] = []
  private budget: number
  private maxSteps: number
  constructor(budget = 48 * 1024 * 1024, maxSteps = 60) {
    this.budget = budget
    this.maxSteps = maxSteps
  }

  /** Call before an edit, with the scene as it was. */
  record(blobs: Blobs, source: string, actors?: readonly Actor[]) {
    this.keep({ blobs: blobs.clone(), source, actors })
  }

  /** Like `record`, for a snapshot the caller already copied and won't touch again. */
  keep(s: Snapshot) {
    this.past.push(s)
    this.future = []
    let bytes = this.past.reduce((n, p) => n + p.blobs.bytes, 0)
    while (this.past.length > 1 && (bytes > this.budget || this.past.length > this.maxSteps)) bytes -= this.past.shift()!.blobs.bytes
  }

  undo(current: Snapshot): Snapshot | null {
    const prev = this.past.pop()
    if (!prev) return null
    this.future.push({ ...current, blobs: current.blobs.clone() })
    return prev
  }

  redo(current: Snapshot): Snapshot | null {
    const next = this.future.pop()
    if (!next) return null
    this.past.push({ ...current, blobs: current.blobs.clone() })
    return next
  }

  get canUndo() { return this.past.length > 0 }
  get canRedo() { return this.future.length > 0 }
}
