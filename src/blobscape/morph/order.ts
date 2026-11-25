/**
 * Style Morph's order of styles (issue #461): which of the shared looks it goes round, and the next one either way.
 * Pure, so it is tested.
 */
import type { Look } from '../drawnLook.tsx'
import { STYLES, isPixelStyle } from '../../splat-engine/styles/styles.ts'

/** The styles it goes round at first: soft blobs, then a spread of the others, each unlike the one before. */
export const MORPH_START: readonly Look[] = ['blobs', 'gouache', 'cel', 'ascii', 'watercolor', 'blocks', 'neon', 'halftone', 'glass', 'stipple']

/** The order asked for in the address (`?styles=blobs,cel,neon`), keeping only known looks once each, or the start; at least two. */
export function morphOrder(asked: string | null | undefined): Look[] {
  const known = new Set<string>(STYLES.filter((s) => !isPixelStyle(s.id)).map((s) => s.id))
  const picked: Look[] = []
  for (const id of (asked ?? '').split(',')) if (known.has(id) && !picked.includes(id as Look)) picked.push(id as Look)
  return picked.length >= 2 ? picked : [...MORPH_START]
}

/** The style after `look` in `order` (`by` -1 for the one before), round the end; the first when `look` is not in it. */
export function nextLook(order: readonly Look[], look: Look, by = 1): Look {
  const i = order.indexOf(look)
  if (i < 0) return order[0]
  return order[(((i + by) % order.length) + order.length) % order.length]
}
