import { Blobs } from '../../splat-core/blobs.ts'
import { takeOutLight } from './delight.ts'

/** What the page sends: the kept blobs' arrays, and a number to answer with. */
export interface DelightAsk { id: number; count: number; center: Float32Array; scale: Float32Array; quat: Float32Array; color: Float32Array; opacity: Float32Array }
/** What comes back: the kept blobs' paint, and the light that was found. */
export interface DelightAnswer { id: number; color: Float32Array; found: { way: [number, number, number]; strength: number; explained: number } }

// Scan Studio's taking out of the scanned light: a few seconds on a big scan, so off the page's thread
self.onmessage = (ev: MessageEvent<DelightAsk>) => {
  const { id, count } = ev.data
  const b = new Blobs(Math.max(1, count))
  b.center.set(ev.data.center); b.scale.set(ev.data.scale); b.quat.set(ev.data.quat); b.color.set(ev.data.color); b.opacity.set(ev.data.opacity)
  b.count = count
  const d = takeOutLight(b)
  const color = d.blobs.color.slice(0, count * 3)
  const answer: DelightAnswer = { id, color, found: d.found }
  ;(self as unknown as Worker).postMessage(answer, [color.buffer])
}
