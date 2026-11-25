import type { Rgb } from '../../splat-core/pixel.ts'

/** A palette's colors as a strip, with a line on what it does: under the Palette chips of every style that has them. */
export function PaletteStrip({ colors, note }: { colors: readonly Rgb[]; note: string }) {
  return (
    <>
      <div data-testid="palette-strip" aria-hidden className="mt-5 flex h-3 overflow-hidden rounded ring-1 ring-rule">
        {colors.length ? colors.map((c, i) => <span key={i} className="flex-1" style={{ background: `rgb(${c[0]} ${c[1]} ${c[2]})` }} />) : <span className="flex-1 bg-paper-sunk" />}
      </div>
      <p className="mt-2 text-xs text-ink-faint">{note}</p>
    </>
  )
}
