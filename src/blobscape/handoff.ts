import type { Blobs } from '../splat-core/blobs.ts'
import type { Collider } from '../splat-engine/colliders.ts'
import { go, href, navigate } from './routes.ts'

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

/**
 * A cleaned scan carried from Scan Studio into Scene Creator (#385), as a file, so it opens and is kept
 * on the shelf exactly as one picked with Open a file would be. Held in memory only.
 */
let pendingScan: File | null = null

export function handOffScan(file: File) {
  pendingScan = file
  // the drawing choices a check or a tester asked for carry across
  const q = new URLSearchParams(location.search)
  const kept = new URLSearchParams([...q].filter(([k]) => k === 'offscreen' || k === 'webgl'))
  navigate(href({ page: 'creator' }) + (kept.size ? `?${kept}` : ''))
}

export function takeScan() {
  const f = pendingScan
  pendingScan = null
  return f
}
