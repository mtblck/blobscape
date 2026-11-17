import { ArrayBufferTarget, Muxer } from 'mp4-muxer'
import type { Frame } from '../../splat-core/pixel.ts'

/**
 * A recorded loop as an MP4 for posting (Pixel Diorama's Record the loop): every art pixel becomes a `scale` × `scale`
 * block (scale is even, so H.264's half-size color lines up with the blocks and edges stay crisp), encoded with the
 * browser's own H.264 (WebCodecs) at a high bitrate and packed with mp4-muxer. Browser only.
 */

/** The video's long side stays under this, which every H.264 level a phone plays can hold. */
const MAX_SIDE = 3840

/** Whether this browser can make an MP4 of that size. */
export async function canMakeVideo(width: number, height: number): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false
  try {
    return !!(await VideoEncoder.isConfigSupported({ codec: 'avc1.640034', width, height, bitrate: 2e7, framerate: 12 })).supported
  } catch {
    return false
  }
}

/** The scale actually used: the one asked for, or the biggest even one under MAX_SIDE. */
export function videoScale(width: number, height: number, scale: number): number {
  let s = Math.max(2, Math.floor(scale / 2) * 2)
  while (s > 2 && Math.max(width, height) * s > MAX_SIDE) s -= 2
  return s
}

export async function encodeVideo(frames: Frame[], fps: number, scale: number): Promise<Uint8Array> {
  const { width: w, height: h } = frames[0]
  const s = videoScale(w, h, scale), W = w * s, H = h * s
  if (!(await canMakeVideo(W, H))) throw new Error('this browser cannot make an MP4')
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H, frameRate: fps }, fastStart: 'in-memory' })
  let failed: unknown
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failed = e } })
  // plenty for flat pixel art: about a third of a bit a pixel a frame, at most 60 Mb/s
  encoder.configure({ codec: 'avc1.640034', width: W, height: H, bitrate: Math.min(60e6, W * H * fps * 0.35), framerate: fps, avc: { format: 'avc' } })
  const small = new OffscreenCanvas(w, h), big = new OffscreenCanvas(W, H)
  const sc = small.getContext('2d')!, bc = big.getContext('2d')!
  bc.imageSmoothingEnabled = false
  for (let i = 0; i < frames.length; i++) {
    if (failed) break
    sc.putImageData(new ImageData(new Uint8ClampedArray(frames[i].data), w, h), 0, 0)
    // video has no see-through: what the sky leaves empty is black
    bc.fillStyle = '#000'
    bc.fillRect(0, 0, W, H)
    bc.drawImage(small, 0, 0, W, H)
    const vf = new VideoFrame(big, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) })
    encoder.encode(vf, { keyFrame: i % (fps * 2) === 0 })
    vf.close()
    // don't let the queue run far ahead of the encoder
    while (encoder.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 5))
  }
  await encoder.flush()
  encoder.close()
  if (failed) throw failed
  muxer.finalize()
  return new Uint8Array(muxer.target.buffer)
}
