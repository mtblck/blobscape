import type { Blobs } from '../splat-core/blobs.ts'
import type { Collider } from '../splat-engine/colliders.ts'
import { go } from './routes.ts'

/**
 * Carries a lesson's scene into the sandbox. It's one page, so the scene
 * just waits here in memory; nothing is stored or sent anywhere.
 */
let pending: { name: string; blobs: Blobs; colliders?: Collider[] } | null = null

/** `colliders` are solid shapes drawn over the scene (Scan Studio), which the sandbox's creatures stand on. */
export function handOff(name: string, blobs: Blobs, colliders?: Collider[]) {
  pending = { name, blobs: blobs.clone(), colliders: colliders?.length ? colliders : undefined }
  go({ page: 'sandbox' })
}

export function takeHandOff() {
  const p = pending
  pending = null
  return p
}
