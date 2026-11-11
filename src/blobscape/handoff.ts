import type { Blobs } from '../splat-core/blobs.ts'
import { go } from './routes.ts'

/**
 * Carries a lesson's scene into the sandbox. It's one page, so the scene
 * just waits here in memory; nothing is stored or sent anywhere.
 */
let pending: { name: string; blobs: Blobs } | null = null

export function handOff(name: string, blobs: Blobs) {
  pending = { name, blobs: blobs.clone() }
  go({ page: 'sandbox' })
}

export function takeHandOff() {
  const p = pending
  pending = null
  return p
}
