/**
 * Photos to splats (sandbox, issue #215): training a scene from a capture, in the page, with Brush (Apache 2.0, built
 * to WebAssembly and WebGPU; `vendor/brush`). Brush fits splats to photos whose camera positions are already known:
 * it does not find them. So this takes a capture folder as scanning apps and COLMAP write them, not loose photos.
 * This file is the plain part, tested in Node: telling what a folder is, what Brush is asked to do, and the words.
 */

/** The two layouts Brush reads: Nerfstudio's `transforms.json`, or COLMAP's `cameras` and `images` files. */
export type CaptureKind = 'nerfstudio' | 'colmap'

/** What a folder is, from the paths of its files (as far down as they were listed); null when it is no capture Brush can read. */
export function captureKind(paths: readonly string[]): CaptureKind | null {
  const names = paths.map((p) => p.replace(/\\/g, '/').toLowerCase())
  const has = (re: RegExp) => names.some((n) => re.test(n))
  if (has(/(^|\/)transforms(_train)?\.json$/)) return 'nerfstudio'
  if (has(/(^|\/)cameras\.(bin|txt)$/) && has(/(^|\/)images\.(bin|txt)$/)) return 'colmap'
  return null
}

/** How many of a folder's files are pictures. */
export function pictureCount(paths: readonly string[]): number {
  return paths.filter((p) => /\.(jpe?g|png|webp)$/i.test(p) && !/(^|\/)masks?\//i.test(p.replace(/\\/g, '/'))).length
}

/** How long to train: steps of the optimizer. More is sharper and slower; Stop keeps what there is. */
export const PLANS = [
  { id: 'quick', name: 'Quick', steps: 2000, note: 'A rough scene in a minute or two on a good graphics card.' },
  { id: 'good', name: 'Good', steps: 7000, note: 'Most of the detail. A few minutes.' },
  { id: 'long', name: 'Long', steps: 30000, note: 'As sharp as it gets. Leave it running.' },
] as const
export type PlanId = (typeof PLANS)[number]['id']

/** The most splats a trained scene may grow to: what the sandbox's tools stay quick with. */
export const TRAIN_MAX_SPLATS = 300_000
/** Photos are shrunk so their longer side is at most this before training. */
export const TRAIN_MAX_SIDE = 1280
/** How many storage buffers one of Brush's compute passes binds: a GPU that allows fewer cannot train. */
export const BUFFERS_NEEDED = 12

/**
 * Brush's settings for a run, from the ones it starts with (its defaults, or the capture's own `args.txt`): how long,
 * how big, flat color only (the sandbox draws no color by angle), and nothing written back into the folder.
 */
export function trainConfig(init: Record<string, unknown>, steps: number, maxSplats = TRAIN_MAX_SPLATS): Record<string, unknown> {
  const max = Math.min(maxSplats, typeof init['max-splats'] === 'number' ? (init['max-splats'] as number) : Infinity)
  return {
    ...init,
    'total-train-iters': steps,
    // growing stops half way, as in Brush's own schedule for its default length
    'growth-stop-iter': Math.round(steps / 2),
    'max-splats': max,
    'sh-degree': 0,
    'max-resolution': Math.min(TRAIN_MAX_SIDE, typeof init['max-resolution'] === 'number' ? (init['max-resolution'] as number) : Infinity),
    'eval-split-every': null,
    'eval-every': steps + 1,
    'eval-save-to-disk': false,
    'export-every': steps + 1,
    'rerun-enabled': false,
  }
}

/** Why training cannot start here, in words for the page; null when it can. */
export function cannotTrain(has: { picker: boolean; gpu: boolean; buffers?: number }): string | null {
  if (!has.picker) return 'This needs a browser that can open a folder: Chrome or Edge on a computer.'
  if (!has.gpu) return 'This needs WebGPU, which this browser does not have: Chrome or Edge on a computer.'
  if (has.buffers !== undefined && has.buffers < BUFFERS_NEEDED) return `This device's graphics card can't run the trainer (it allows ${has.buffers} buffers a pass, and the trainer needs ${BUFFERS_NEEDED}).`
  return null
}

/** The line under the button while it trains. */
export function trainSay(iter: number, total: number, splats: number): string {
  return `Step ${Math.min(iter, total).toLocaleString('en-US')} of ${total.toLocaleString('en-US')}, ${splats.toLocaleString('en-US')} blobs`
}
