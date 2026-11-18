/** The drawn looks (splat-core/marks.ts) as the pages offer them: Brush and Ink, and Scan Studio's Lighting tab. */
import { INK, PAPER, type MarkKind } from '../splat-core/marks.ts'

/** How the blobs are drawn: as they are, or as one of the marks. */
export type LookId = 'blobs' | MarkKind
export const LOOKS: { id: LookId; label: string; note: string }[] = [
  { id: 'gouache', label: 'Gouache', note: 'Flat, opaque dabs with the streaks of a dry brush.' },
  { id: 'oil', label: 'Oil', note: 'Thick paint: ridges between the bristles catch the light.' },
  { id: 'ink', label: 'Ink and wash', note: 'A thin wash of each color that leaves the paper showing in the light, pen strokes only in the shade, and a pen outline round everything.' },
  { id: 'hatch', label: 'Hatching', note: 'Pen lines on bare paper, drawn closer where it is darker.' },
  { id: 'blobs', label: 'Blobs', note: 'The soft dots underneath, as every other page draws them.' },
]

/** Paper and pen for the two drawn looks. */
export const PAPERS: { id: string; label: string; paper: readonly [number, number, number]; ink: readonly [number, number, number] }[] = [
  { id: 'cream', label: 'Cream', paper: PAPER, ink: INK },
  { id: 'gray', label: 'Gray', paper: [0.74, 0.74, 0.72], ink: [0.08, 0.08, 0.1] },
  { id: 'blue', label: 'Blueprint', paper: [0.12, 0.25, 0.47], ink: [0.9, 0.94, 1] },
  { id: 'night', label: 'Chalk', paper: [0.09, 0.1, 0.12], ink: [0.93, 0.92, 0.88] },
]
/** What the painted looks stand on: a dark, warm ground, as a primed board. */
export const GROUND = '#26221f'
/** A color (sRGB 0–1) as CSS. */
export const css = (c: readonly number[]) => `rgb(${c.map((v) => Math.round(v * 255)).join(' ')})`
