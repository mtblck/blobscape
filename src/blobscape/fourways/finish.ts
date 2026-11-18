import { makeFrame, pixelArt, resolveFine, tidyLone, type Frame, type PixelLook } from '../../splat-core/pixel.ts'

/**
 * The same finish for every panel that is not drawn by Blobscape's own pixel pass: the panel hands over its scene
 * drawn at twice the art's size, and this settles each art pixel from its four samples and runs Pixel Diorama's
 * finish on it (`pixelArt`, the CPU twin of the engine's pass): palette, dither, glow, lines, outline and sky. So the
 * four pictures differ by how the scene was drawn, never by how it was finished.
 */
export function upright(pixels: Uint8Array, width: number, height: number, premultiplied: boolean): Frame {
  const f = makeFrame(width, height)
  for (let y = 0; y < height; y++) {
    const from = (height - 1 - y) * width * 4, to = y * width * 4
    for (let x = 0; x < width * 4; x += 4) {
      const a = pixels[from + x + 3]
      // a premultiplied pixel holds its color times its cover
      const k = premultiplied && a > 0 && a < 255 ? 255 / a : 1
      f.data[to + x] = Math.min(255, pixels[from + x] * k)
      f.data[to + x + 1] = Math.min(255, pixels[from + x + 1] * k)
      f.data[to + x + 2] = Math.min(255, pixels[from + x + 2] * k)
      f.data[to + x + 3] = a
    }
  }
  return f
}

export class Finisher {
  /** The art of the frame before, uncleaned: what steady pixels hold on to. */
  private before?: Frame
  art?: Frame
  /** The share of the last picture the scene covers (the rest is sky), and its brightness: the scene's pixels' red, green and blue summed. */
  cover = 0
  light = 0

  /** Finishes one frame (RGBA, bottom row first, twice the art's size each way). */
  finish(pixels: Uint8Array, width: number, height: number, look: PixelLook, premultiplied = false): Frame {
    const { small } = resolveFine(upright(pixels, width, height, premultiplied))
    let solid = 0, light = 0
    for (let i = 0; i < small.data.length; i += 4) if (small.data[i + 3] >= 128) { solid++; light += small.data[i] + small.data[i + 1] + small.data[i + 2] }
    this.cover = solid / (small.width * small.height)
    this.light = light
    const raw = pixelArt(small, { ...look, tidy: false, parts: false }, this.before)
    this.before = raw
    this.art = look.tidy ? tidyLone(raw, small) : raw
    return this.art
  }

  /** Puts the art on a canvas, one canvas pixel an art pixel: CSS scales it up with hard edges. */
  show(canvas: HTMLCanvasElement) {
    const art = this.art
    if (!art) return
    if (canvas.width !== art.width || canvas.height !== art.height) { canvas.width = art.width; canvas.height = art.height }
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(art.data), art.width, art.height), 0, 0)
  }

  reset() { this.before = undefined }
}
