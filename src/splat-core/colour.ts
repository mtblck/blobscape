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
