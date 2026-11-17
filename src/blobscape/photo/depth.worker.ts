/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm'
// The runtime's own two files, served from this site (by path: the package doesn't list them as entry points)
import wasmUrl from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url'
import glueUrl from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url'

/**
 * The depth guess for One photo to a scene: Depth Anything V2 Small (Apache 2.0), run with ONNX Runtime's WebAssembly
 * build off the main thread. The model and the runtime are served by this site, so the photo never leaves the device
 * and no other service is asked for anything. One thread: more would need the page to be cross-origin isolated.
 */

export interface DepthAsk { rgba: Uint8ClampedArray; width: number; height: number; model: string }
export type DepthAnswer = { ok: true; nearness: Float32Array; width: number; height: number } | { ok: false; why: string }

const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225]
let session: Promise<ort.InferenceSession> | undefined

self.onmessage = async (ev: MessageEvent<DepthAsk>) => {
  const { rgba, width: w, height: h, model } = ev.data
  try {
    ort.env.wasm.numThreads = 1
    ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: glueUrl }
    session ??= fetch(model).then(async (r) => {
      if (!r.ok) throw new Error(`the depth model did not load (${r.status})`)
      return ort.InferenceSession.create(new Uint8Array(await r.arrayBuffer()), { executionProviders: ['wasm'] })
    })
    const s = await session
    // planes of red, green and blue, each brought to the range the model was trained on
    const x = new Float32Array(3 * w * h)
    for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) x[c * w * h + i] = (rgba[i * 4 + c] / 255 - MEAN[c]) / STD[c]
    const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', x, [1, 3, h, w]) })
    const depth = out[s.outputNames[0]]
    const nearness = Float32Array.from(depth.data as Float32Array)
    const answer: DepthAnswer = { ok: true, nearness, width: depth.dims[2], height: depth.dims[1] }
    ;(self as unknown as Worker).postMessage(answer, [nearness.buffer])
  } catch (err) {
    session = undefined
    const answer: DepthAnswer = { ok: false, why: err instanceof Error ? err.message : String(err) }
    ;(self as unknown as Worker).postMessage(answer)
  }
}
