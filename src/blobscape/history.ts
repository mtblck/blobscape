import type { Blobs } from '../splat-core/blobs.ts'

/**
 * Undo and redo as whole snapshots of the blob list. Simple and exact; a
 * 20,000-blob scene is about a megabyte, so a byte budget caps the history
 * rather than a step count.
 */
export class History {
  private past: Blobs[] = []
  private future: Blobs[] = []
  constructor(private budget = 48 * 1024 * 1024, private maxSteps = 60) {}

  /** Call before an edit, with the scene as it was. */
  record(before: Blobs) {
    this.keep(before.clone())
  }

  /** Like `record`, for a snapshot the caller already copied and won't touch again. */
  keep(snapshot: Blobs) {
    this.past.push(snapshot)
    this.future = []
    let bytes = this.past.reduce((n, b) => n + b.bytes, 0)
    while (this.past.length > 1 && (bytes > this.budget || this.past.length > this.maxSteps)) bytes -= this.past.shift()!.bytes
  }

  undo(current: Blobs): Blobs | null {
    const prev = this.past.pop()
    if (!prev) return null
    this.future.push(current.clone())
    return prev
  }

  redo(current: Blobs): Blobs | null {
    const next = this.future.pop()
    if (!next) return null
    this.past.push(current.clone())
    return next
  }

  get canUndo() { return this.past.length > 0 }
  get canRedo() { return this.future.length > 0 }

  clear() { this.past = []; this.future = [] }
}
