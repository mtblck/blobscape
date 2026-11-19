/**
 * Exporting a scene's loop from Pixel Diorama's Export tab, in any style: the numbers behind it. A scene is posed from
 * the time alone and repeats every `loop` seconds, so an export steps through exactly one loop, a frame at a time,
 * however long each frame takes to draw. The last frame is one step short of the loop's end, so played round and
 * round the file joins up with no frame shown twice.
 */

/** Frames a second an export can have. Pixel art offers the first two (its Motion choices); the other styles all three. */
export const EXPORT_RATES = [12, 24, 30]

/** The long side, in pixels, a style other than pixel art can be exported at. */
export const EXPORT_SIDES = [480, 720, 1080, 1920]
/** An animated PNG stores every frame whole and lossless, so past this long side its file is too big to be useful. */
export const PNG_SIDE_MOST = 720

/** The moments, in seconds, of every frame of one loop at about `fps`: a whole number of even steps, none at the loop's end. */
export function loopTimes(loop: number, fps: number): number[] {
  const count = Math.max(1, Math.round(loop * fps))
  return Array.from({ length: count }, (_, f) => (f * loop) / count)
}

/**
 * The moments to draw before the first frame, oldest first: the last half second of the loop, since that is what
 * comes before frame 0 when it plays round. Looks that settle against the frame before (steady pixels, steady
 * characters) need them, or the first frame would differ from the one the loop's end leads into.
 */
export function leadIn(loop: number, fps: number): number[] {
  const count = Math.max(1, Math.round(loop * fps)), step = loop / count
  const n = Math.min(count, Math.max(1, Math.round(fps / 2)))
  return Array.from({ length: n }, (_, i) => loop - (n - i) * step)
}

/** The size a `w` by `h` picture is exported at: even numbers, the long side at most `side`, never bigger than it is. */
export function exportSize(w: number, h: number, side: number): [number, number] {
  const k = Math.min(1, side / Math.max(w, h, 1))
  return [Math.max(2, Math.round((w * k) / 2) * 2), Math.max(2, Math.round((h * k) / 2) * 2)]
}

/** The sides on offer for a file kind: every one for a video, the smaller ones for an animated PNG. */
export function sidesFor(kind: 'png' | 'mp4'): number[] {
  return kind === 'png' ? EXPORT_SIDES.filter((s) => s <= PNG_SIDE_MOST) : EXPORT_SIDES
}

/** The side used when `asked` is not on offer for the kind: the biggest one that is. */
export function sideFor(kind: 'png' | 'mp4', asked: number): number {
  const on = sidesFor(kind)
  return on.includes(asked) ? asked : on.filter((s) => s <= asked).pop() ?? on[0]
}

/** A file name for an export: the scene, the style when it is not pixel art, and what it is. */
export function exportName(scene: string, style: string, what: 'loop' | 'frame', ext: 'png' | 'mp4'): string {
  return `pixel-diorama-${scene}${style === 'pixel' ? '' : `-${style}`}${what === 'loop' ? '-loop' : ''}.${ext}`
}
