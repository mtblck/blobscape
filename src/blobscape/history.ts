import type { Blobs } from '../splat-core/blobs.ts'

/** A scene as it was: its blobs and the name of what it started from. */
export interface Snapshot { blobs: Blobs; source: string }

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
  record(blobs: Blobs, source: string) {
    this.keep({ blobs: blobs.clone(), source })
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
    this.future.push({ blobs: current.blobs.clone(), source: current.source })
    return prev
  }

  redo(current: Snapshot): Snapshot | null {
    const next = this.future.pop()
    if (!next) return null
    this.past.push({ blobs: current.blobs.clone(), source: current.source })
    return next
  }

  get canUndo() { return this.past.length > 0 }
  get canRedo() { return this.future.length > 0 }
}
