import { captureKind, pictureCount, type CaptureKind } from '../trainCapture.ts'
import type { TrainAsk, TrainSay } from './train.worker.ts'

/**
 * The page side of training from a capture (issue #215): looks at what the folder holds, starts the worker and
 * passes on what it says.
 */

/** How far down a folder is listed to see what it is, and how many files at most. */
const DEEP = 4, MANY = 4000

/** The paths of a folder's files, a few levels down. */
export async function listFolder(folder: FileSystemDirectoryHandle): Promise<string[]> {
  const out: string[] = []
  const walk = async (dir: FileSystemDirectoryHandle, at: string, depth: number) => {
    for await (const [name, entry] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (out.length >= MANY) return
      if (entry.kind === 'file') out.push(at + name)
      else if (depth < DEEP) await walk(entry as FileSystemDirectoryHandle, `${at}${name}/`, depth + 1)
    }
  }
  await walk(folder, '', 0)
  return out
}

export interface Run {
  kind: CaptureKind
  photos: number
  /** Asks the trainer to stop after its current steps; what it has is still handed over. */
  stop(): void
  /** Settles when the run has ended, however it ended. */
  ended: Promise<void>
}

export interface Listeners {
  status(text: string): void
  step(iter: number, splats: number): void
  /** The scene so far as a .ply file. `last` is the finished one. */
  scene(ply: Uint8Array, iter: number, last: boolean): void | Promise<void>
  done(iter: number, stopped: boolean): void
  error(why: string): void
}

/** Starts training a capture folder. Throws if the folder is no capture with camera positions. */
export async function trainFolder(folder: FileSystemDirectoryHandle, steps: number, maxSplats: number, on: Listeners): Promise<Run> {
  const paths = await listFolder(folder)
  const kind = captureKind(paths)
  if (!kind) {
    throw new Error(pictureCount(paths)
      ? 'This folder has photos but no camera positions. Training needs a capture that says where each photo was taken: a folder with a transforms.json (Nerfstudio) or COLMAP\'s cameras and images files.'
      : 'This folder is not a capture: it has no transforms.json (Nerfstudio) and no COLMAP cameras and images files.')
  }
  // a new worker a run: Brush keeps its GPU device for as long as its module lives
  const worker = new Worker(new URL('./train.worker.ts', import.meta.url), { type: 'module' })
  let finish = () => {}
  const ended = new Promise<void>((r) => { finish = r })
  const end = () => { worker.terminate(); finish() }
  // scenes are handed over in order, and the worker is kept until the last one is in
  let chain: Promise<void> = Promise.resolve()
  worker.onmessage = (ev: MessageEvent<TrainSay>) => {
    const m = ev.data
    if (m.kind === 'status') on.status(m.text)
    else if (m.kind === 'step') on.step(m.iter, m.splats)
    else if (m.kind === 'scene') chain = chain.then(() => on.scene(m.ply, m.iter, m.last)).catch((err) => on.error(err instanceof Error ? err.message : String(err)))
    else if (m.kind === 'done') void chain.then(() => { on.done(m.iter, m.stopped); end() })
    else { on.error(m.why); end() }
  }
  worker.onerror = (ev) => { on.error(ev.message || 'the trainer could not start'); end() }
  const ask: TrainAsk = { kind: 'start', folder, steps, maxSplats }
  worker.postMessage(ask)
  return { kind, photos: pictureCount(paths), stop: () => worker.postMessage({ kind: 'stop' } satisfies TrainAsk), ended }
}
