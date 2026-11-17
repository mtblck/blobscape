import type { Blobs } from '../../splat-core/blobs.ts'
import { FOV, type Orbit } from '../../splat-core/orbit.ts'
import { fitSide, nearnessFor, photoBlobs, PHOTO_SIDE, PHOTO_SIDE_PHONE } from '../photo.ts'
import type { DepthAnswer, DepthAsk } from './depth.worker.ts'

/**
 * The page side of One photo to a scene (issue #211): shrinks the photo, asks the depth worker how near each part is,
 * and stands the blobs in front of where the camera goes, so the first view is the photo itself.
 */

/** The model's own patch size: its input sides are whole numbers of these. */
const PATCH = 14
/** The longer side the model looks at, in pixels. Bigger is slower and no better for a blob a pixel. */
const MODEL_SIDE = 364
const MODEL_URL = `${import.meta.env.BASE_URL}models/depth-anything-v2-small.onnx`

/** Where the camera stands for the photo's own view, and how near and far the scene runs from it. */
const EYE: [number, number, number] = [0, 1.2, 5], NEAR = 2.5, FAR = 9

export interface PhotoScene { blobs: Blobs; orbit: Orbit; width: number; height: number }

let worker: Worker | undefined

function pixels(picture: ImageBitmap, w: number, h: number): Uint8ClampedArray {
  const c = new OffscreenCanvas(w, h), ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(picture, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h).data
}

export async function photoScene(file: Blob, phone: boolean): Promise<PhotoScene> {
  const picture = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const [w, h] = fitSide(picture.width, picture.height, phone ? PHOTO_SIDE_PHONE : PHOTO_SIDE)
    const [fw, fh] = fitSide(picture.width, picture.height, MODEL_SIDE)
    const mw = Math.max(PATCH, Math.round(fw / PATCH) * PATCH), mh = Math.max(PATCH, Math.round(fh / PATCH) * PATCH)
    worker ??= new Worker(new URL('./depth.worker.ts', import.meta.url), { type: 'module' })
    const answer = await new Promise<DepthAnswer>((done, fail) => {
      worker!.onmessage = (ev: MessageEvent<DepthAnswer>) => done(ev.data)
      worker!.onerror = (ev) => { worker = undefined; fail(new Error(ev.message || 'the depth model could not start')) }
      const ask: DepthAsk = { rgba: pixels(picture, mw, mh), width: mw, height: mh, model: MODEL_URL }
      worker!.postMessage(ask)
    })
    if (!answer.ok) throw new Error(answer.why)
    const nearness = nearnessFor(answer.nearness, answer.width, answer.height, w, h)
    // the view's lens is FOV up and down: the picture is unprojected with the same lens, so it fills the view as it was taken
    const tall = Math.tan((FOV * Math.PI) / 360)
    const fov = h >= w ? FOV : (Math.atan((tall * w) / h) * 360) / Math.PI
    const blobs = photoBlobs(pixels(picture, w, h), w, h, nearness, { fov, near: NEAR, far: FAR, eye: EYE })
    // the camera looks along -z from EYE at the middle of the scene's depth; turning goes round that point
    const depths = Float32Array.from({ length: blobs.count }, (_, i) => EYE[2] - blobs.center[i * 3 + 2]).sort()
    const mid = depths[depths.length >> 1] || NEAR
    return { blobs, orbit: { target: [EYE[0], EYE[1], EYE[2] - mid], distance: mid, azimuth: 0, elevation: 0 }, width: w, height: h }
  } finally {
    picture.close()
  }
}
