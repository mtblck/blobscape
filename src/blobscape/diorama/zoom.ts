/**
 * Zooming in on pixel art: the pixels grow, not the blobs. A scene is cut so a blob is about one art pixel at its starting
 * view; brought closer, each blob would cover many pixels and show as a scalloped disc, with lines between parts tracing
 * the discs' edges. So the art's pixels are made bigger in whole steps as the view comes in, which keeps a blob near one
 * pixel and a pixel edge the only edge there is.
 */

/** How many times bigger the art's pixels are for a view at `now` from the scene's starting distance `start`: whole steps, never under 1. */
export function zoomStep(start: number, now: number): number {
  if (!(now > 0) || !(start > 0)) return 1
  return Math.max(1, Math.floor(start / now + 0.15))
}
