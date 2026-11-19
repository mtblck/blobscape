/**
 * A tiny animated PNG writer, for saving a scene's loop from the page (Pixel Diorama's Record loop). APNG is lossless,
 * plays as an ordinary image in every current browser, and ffmpeg reads it, so a recording can become the gallery's
 * WebP. Every frame is stored whole (no regions), 8-bit RGBA, rows unfiltered; deflate is passed in so the page can
 * use CompressionStream and tests can use node:zlib.
 */

export interface RgbaFrame {
  width: number
  height: number
  /** RGBA bytes, top row first. */
  data: Uint8Array | Uint8ClampedArray
}

/** A frame with every pixel drawn as a square `scale` pixels a side (a whole number), so small pixel art can be saved big and stay crisp. */
export function enlarged(frame: RgbaFrame, scale: number): RgbaFrame {
  const s = Math.max(1, Math.round(scale)), { width: w, height: h, data } = frame
  if (s === 1) return frame
  const W = w * s, out = new Uint8Array(W * h * s * 4)
  for (let y = 0; y < h; y++) {
    const row = y * s * W * 4
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      for (let k = 0; k < s; k++) out.set(data.subarray(i, i + 4), row + (x * s + k) * 4)
    }
    for (let k = 1; k < s; k++) out.copyWithin(row + k * W * 4, row, row + W * 4)
  }
  return { width: W, height: h * s, data: out }
}

/** zlib-wrapped deflate (what PNG's image data is). */
export type Deflate = (bytes: Uint8Array) => Promise<Uint8Array>

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let c = 0xffffffff
  for (let i = start; i < end; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const v = new DataView(out.buffer)
  v.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  v.setUint32(8 + data.length, crc32(out, 4, 8 + data.length))
  return out
}

function u32s(...n: number[]): Uint8Array {
  const out = new Uint8Array(n.length * 4)
  const v = new DataView(out.buffer)
  n.forEach((x, i) => v.setUint32(i * 4, x))
  return out
}

/** Rows with PNG's filter byte (0, none) in front of each. */
function scanlines(f: RgbaFrame): Uint8Array {
  const row = f.width * 4, out = new Uint8Array((row + 1) * f.height)
  for (let y = 0; y < f.height; y++) out.set(f.data.subarray(y * row, (y + 1) * row), y * (row + 1) + 1)
  return out
}

/** An animated PNG written a frame at a time, so a long or large loop never has every raw frame in memory at once. */
export interface ApngWriter {
  /** Adds the next frame, which must be the size given at the start. */
  add(frame: RgbaFrame): Promise<void>
  /** The finished file, once every frame promised has been added. */
  finish(): Uint8Array
}

/** Starts an APNG of `count` frames, each `width` by `height`, that loops forever at `fps`. */
export function startApng(width: number, height: number, count: number, fps: number, deflate: Deflate): ApngWriter {
  if (!(count >= 1)) throw new Error('no frames')
  const parts: Uint8Array[] = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]
  const ihdr = new Uint8Array(13)
  new DataView(ihdr.buffer).setUint32(0, width)
  new DataView(ihdr.buffer).setUint32(4, height)
  ihdr.set([8, 6, 0, 0, 0], 8)
  parts.push(chunk('IHDR', ihdr), chunk('acTL', u32s(count, 0)))
  // the delay as a fraction of a second: 1/fps, kept whole
  const den = Math.round(fps * 1000), num = 1000
  let seq = 0, added = 0
  return {
    async add(frame) {
      if (frame.width !== width || frame.height !== height) throw new Error('every frame must be the same size')
      if (added >= count) throw new Error('more frames than promised')
      const i = added++
      // the frame's place in the file is taken now, so frames stay in order whatever the deflate's timing
      const fc = new Uint8Array(26)
      const v = new DataView(fc.buffer)
      v.setUint32(0, seq++); v.setUint32(4, width); v.setUint32(8, height); v.setUint32(12, 0); v.setUint32(16, 0)
      v.setUint16(20, Math.min(num, 65535)); v.setUint16(22, Math.min(den, 65535)); fc[24] = 0; fc[25] = 0
      const own = i === 0 ? -1 : seq++
      const at = parts.push(chunk('fcTL', fc), new Uint8Array(0)) - 1
      const z = await deflate(scanlines(frame))
      if (own < 0) parts[at] = chunk('IDAT', z)
      else {
        const fd = new Uint8Array(4 + z.length)
        new DataView(fd.buffer).setUint32(0, own)
        fd.set(z, 4)
        parts[at] = chunk('fdAT', fd)
      }
    },
    finish() {
      if (added !== count) throw new Error(`${count} frames were promised and ${added} added`)
      const all = [...parts, chunk('IEND', new Uint8Array(0))]
      const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0))
      let at = 0
      for (const p of all) { out.set(p, at); at += p.length }
      return out
    },
  }
}

/** Writes `frames` (all one size) as an APNG that loops forever at `fps`. */
export async function encodeApng(frames: RgbaFrame[], fps: number, deflate: Deflate): Promise<Uint8Array> {
  if (!frames.length) throw new Error('no frames')
  const { width, height } = frames[0]
  if (frames.some((f) => f.width !== width || f.height !== height)) throw new Error('every frame must be the same size')
  const w = startApng(width, height, frames.length, fps, deflate)
  for (const f of frames) await w.add(f)
  return w.finish()
}

/** Deflate in the browser, through CompressionStream (zlib format, as PNG wants). */
export const browserDeflate: Deflate = async (bytes) => {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
