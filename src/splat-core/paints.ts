import { oklab, type Rgb } from './pixel.ts'

/**
 * Paints from a palette, for the styles that draw the scene's paint and light it themselves (blocks, cel shading):
 * each color snapped to the palette's nearest in OKLab, as pixel art snaps its pixels, but before the light, so the
 * style's own light and shade fall on palette paints. Colors in and out are sRGB 0–1; the palette is sRGB 0–255.
 * An empty palette (Full color) gives undefined: leave the colors as they are.
 */
export function paletteSnap(palette: readonly Rgb[] | undefined): ((r: number, g: number, b: number) => [number, number, number]) | undefined {
  if (!palette?.length) return undefined
  const labs = palette.map((c) => oklab(c[0], c[1], c[2]))
  const outs = palette.map((c) => [c[0] / 255, c[1] / 255, c[2] / 255] as [number, number, number])
  // a scene has a few hundred thousand blobs in far fewer colors: each color is worked out once, to whole sRGB levels
  const seen = new Map<number, number>()
  return (r, g, b) => {
    const R = Math.round(Math.min(1, Math.max(0, r)) * 255), G = Math.round(Math.min(1, Math.max(0, g)) * 255), B = Math.round(Math.min(1, Math.max(0, b)) * 255)
    const key = (R << 16) | (G << 8) | B
    let at = seen.get(key)
    if (at === undefined) {
      const [l, a, bb] = oklab(R, G, B)
      let best = Infinity
      at = 0
      for (let k = 0; k < labs.length; k++) {
        const d = (labs[k][0] - l) ** 2 + (labs[k][1] - a) ** 2 + (labs[k][2] - bb) ** 2
        if (d < best) { best = d; at = k }
      }
      seen.set(key, at)
    }
    return outs[at]
  }
}
