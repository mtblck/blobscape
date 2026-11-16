/**
 * sRGB ↔ linear, the two transfer functions every renderer here needs: blobs
 * store display (sRGB) colour, three.js's WebGPU renderer blends in linear,
 * and pixels read back from a render target come out linear.
 */
export function srgbToLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function linearToSrgb(c: number) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
}

/** linearToSrgb over 4096 steps, for converting whole images quickly. Index with round(linear × 4095). */
export const LINEAR_TO_SRGB_4K = Float32Array.from({ length: 4096 }, (_, i) => linearToSrgb(i / 4095))

/** The zeroth spherical-harmonic constant: a blob's base colour is 0.5 + SH_C0 × its first coefficient. */
export const SH_C0 = 0.28209479177387814

/**
 * Pixels read back from a render target are linear and premultiplied by
 * alpha. Converts them to display (sRGB) colour, either straight (for an
 * ImageData) or still premultiplied (for the pixel pipeline), and flips the
 * rows when `flip` is set (WebGPU reads top-down, WebGL bottom-up).
 */
export function readbackToSrgb(px: Uint8Array, w: number, h: number, { flip, premultiplied, encoded }: { flip: boolean; premultiplied: boolean; /** The target already holds straight sRGB (pixel mode's art): only the rows need turning. */ encoded?: boolean }, out = new Uint8ClampedArray(w * h * 4)) {
  for (let y = 0; y < h; y++) {
    const src = (flip ? h - 1 - y : y) * w * 4, dst = y * w * 4
    for (let x = 0; x < w * 4; x += 4) {
      const a = px[src + x + 3]
      out[dst + x + 3] = a
      if (!a) { out[dst + x] = out[dst + x + 1] = out[dst + x + 2] = 0; continue }
      if (encoded) { out[dst + x] = px[src + x]; out[dst + x + 1] = px[src + x + 1]; out[dst + x + 2] = px[src + x + 2]; continue }
      const k = a / 255
      for (let c = 0; c < 3; c++) {
        const srgb = LINEAR_TO_SRGB_4K[Math.round(Math.min(1, px[src + x + c] / a) * 4095)]
        out[dst + x + c] = Math.round(255 * (premultiplied ? srgb * k : srgb))
      }
    }
  }
  return out
}
