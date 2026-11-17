/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm'
// The runtime's own two files, served from this site (by path: the package doesn't list them as entry points)
import wasmUrl from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url'
import glueUrl from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url'

/**
 * What was tapped, as a mask: SlimSAM (a slimmed Segment Anything, Apache 2.0) run with ONNX Runtime's WebAssembly
 * build off the main thread. It comes in two parts: one reads the picture (seconds), one answers a tap on a picture
 * already read (a fraction of a second), so the reading is kept and a second tap on the same view is quick. Both
 * parts and the runtime are served by this site: the picture never leaves the device.
 */

/** The side of the square the model reads: the picture's longer side is this, the rest is padding. */
export const SIDE = 1024
/** The model's masks are a quarter of that a side. */
const MASK = 256

export interface SegmentAsk {
  /** The picture, its longer side `SIDE`. Left out, the picture read last is asked again. */
  rgba?: Uint8ClampedArray
  width: number
  height: number
  /** The tap, in the picture's pixels. */
  point: [number, number]
  encoder: string
  decoder: string
}
export type SegmentAnswer =
  | { ok: true; masks: Uint8Array[]; scores: number[]; width: number; height: number }
  | { ok: false; why: string }

const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225]
let sessions: Promise<[ort.InferenceSession, ort.InferenceSession]> | undefined
let read: { embeddings: ort.Tensor; positions: ort.Tensor } | undefined

const load = async (url: string) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`the selection model did not load (${r.status})`)
  return ort.InferenceSession.create(new Uint8Array(await r.arrayBuffer()), { executionProviders: ['wasm'] })
}

self.onmessage = async (ev: MessageEvent<SegmentAsk>) => {
  const { rgba, width: w, height: h, point, encoder, decoder } = ev.data
  try {
    ort.env.wasm.numThreads = 1
    ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: glueUrl }
    sessions ??= Promise.all([load(encoder), load(decoder)])
    const [enc, dec] = await sessions
    if (rgba) {
      // planes of red, green and blue in the top left of the square, each brought to the range the model was trained on; the padding stays 0
      const x = new Float32Array(3 * SIDE * SIDE)
      for (let y = 0; y < h; y++) for (let px = 0; px < w; px++) for (let c = 0; c < 3; c++) x[c * SIDE * SIDE + y * SIDE + px] = (rgba[(y * w + px) * 4 + c] / 255 - MEAN[c]) / STD[c]
      read = undefined
      const out = await enc.run({ pixel_values: new ort.Tensor('float32', x, [1, 3, SIDE, SIDE]) })
      read = { embeddings: out.image_embeddings, positions: out.image_positional_embeddings }
    }
    if (!read) throw new Error('no picture has been read')
    const out = await dec.run({
      input_points: new ort.Tensor('float32', Float32Array.from(point), [1, 1, 1, 2]),
      input_labels: new ort.Tensor('int64', BigInt64Array.from([1n]), [1, 1, 1]),
      image_embeddings: read.embeddings,
      image_positional_embeddings: read.positions,
    })
    // each mask is the whole square, a quarter size: keep the picture's corner of it
    const mw = Math.max(1, Math.round((w * MASK) / SIDE)), mh = Math.max(1, Math.round((h * MASK) / SIDE))
    const logits = out.pred_masks.data as Float32Array, count = out.pred_masks.dims[2]
    const masks: Uint8Array[] = []
    for (let k = 0; k < count; k++) {
      const m = new Uint8Array(mw * mh)
      for (let y = 0; y < mh; y++) for (let px = 0; px < mw; px++) if (logits[k * MASK * MASK + y * MASK + px] > 0) m[y * mw + px] = 1
      masks.push(m)
    }
    const answer: SegmentAnswer = { ok: true, masks, scores: Array.from(out.iou_scores.data as Float32Array), width: mw, height: mh }
    ;(self as unknown as Worker).postMessage(answer, masks.map((m) => m.buffer))
  } catch (err) {
    sessions = undefined
    read = undefined
    const answer: SegmentAnswer = { ok: false, why: err instanceof Error ? err.message : String(err) }
    ;(self as unknown as Worker).postMessage(answer)
  }
}
