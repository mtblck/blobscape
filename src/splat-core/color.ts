/**
 * sRGB ↔ linear, the two transfer functions every renderer here needs: blobs
 * store display (sRGB) color, three.js's WebGPU renderer blends in linear,
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

/** The zeroth spherical-harmonic constant: a blob's base color is 0.5 + SH_C0 × its first coefficient. */
export const SH_C0 = 0.28209479177387814

/**
 * Pixels read back from a render target are linear and premultiplied by
 * alpha. Converts them to display (sRGB) color, either straight (for an
 * ImageData) or still premultiplied (for the pixel pipeline; `encoded` skips
 * the conversion for a target that already holds sRGB), and flips the
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

/** OKLab from sRGB in 0–1: lightness, then the two color axes (red–green, yellow–blue). */
export function toOklab(c: readonly number[]): [number, number, number] {
  const r = srgbToLinear(c[0]), g = srgbToLinear(c[1]), b = srgbToLinear(c[2])
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** sRGB in 0–1 from OKLab, clipped to what a screen can show. */
export function fromOklab(lab: readonly number[]): [number, number, number] {
  const l = (lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2]) ** 3
  const m = (lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2]) ** 3
  const s = (lab[0] - 0.0894841775 * lab[1] - 1.291485548 * lab[2]) ** 3
  const out = (v: number) => Math.min(1, Math.max(0, linearToSrgb(Math.max(0, v))))
  return [
    out(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    out(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    out(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}
