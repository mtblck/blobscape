import { bestMask, fitTo, type MaskView } from '../tapSelect.ts'
import type { Lens } from '../../splat-core/blobs.ts'
import type { SegmentAnswer, SegmentAsk } from './segment.worker.ts'

/**
 * The page side of tap to select (issue #214): hands the view's picture and the tap to the segmentation worker and
 * gives back the mask of what was tapped, as a `MaskView` for `blobsInMasks`.
 */

/** The longer side the model reads (the worker's `SIDE`; importing it would pull the worker's code into the page). */
const SIDE = 1024
const ENCODER = `${import.meta.env.BASE_URL}models/slimsam-encoder.onnx`
const DECODER = `${import.meta.env.BASE_URL}models/slimsam-decoder.onnx`

let worker: Worker | undefined
/** What the worker read last: a tap on the same picture needs no second reading. */
let readStamp = ''

/**
 * The mask of the thing at (x, y), CSS pixels of the view, or null when the model finds nothing it can call a thing
 * there. `canvas` must hold the picture now (straight after a draw); `stamp` names the picture, so the same scene from
 * the same spot is read once. `paper` goes behind the picture, as the page does.
 */
export async function thingAt(canvas: HTMLCanvasElement, lens: Lens, paper: string, x: number, y: number, stamp: string): Promise<MaskView | null> {
  const fit = fitTo(lens.width, lens.height, SIDE)
  let rgba: Uint8ClampedArray | undefined
  if (stamp !== readStamp || !worker) {
    const c = new OffscreenCanvas(fit.width, fit.height), ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.fillStyle = paper
    ctx.fillRect(0, 0, fit.width, fit.height)
    ctx.drawImage(canvas, 0, 0, fit.width, fit.height)
    rgba = ctx.getImageData(0, 0, fit.width, fit.height).data
  }
  worker ??= new Worker(new URL('./segment.worker.ts', import.meta.url), { type: 'module' })
  readStamp = ''
  const answer = await new Promise<SegmentAnswer>((done, fail) => {
    worker!.onmessage = (ev: MessageEvent<SegmentAnswer>) => done(ev.data)
    worker!.onerror = (ev) => { worker = undefined; fail(new Error(ev.message || 'the selection model could not start')) }
    const ask: SegmentAsk = { rgba, width: fit.width, height: fit.height, point: [x * fit.scale, y * fit.scale], encoder: ENCODER, decoder: DECODER }
    worker!.postMessage(ask, rgba ? [rgba.buffer] : [])
  })
  if (!answer.ok) throw new Error(answer.why)
  readStamp = stamp
  const cells = answer.width * answer.height
  const k = bestMask(answer.scores, answer.masks.map((m) => m.reduce((n, v) => n + v, 0) / cells))
  return k < 0 ? null : { lens, mask: answer.masks[k], width: answer.width, height: answer.height }
}
