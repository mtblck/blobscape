import { projectPoint, type Blobs, type Lens, type Vec3 } from '../splat-core/blobs.ts'

/**
 * Tap to select (sandbox, issue #214): a tap on a thing selects the thing's blobs. A segmentation model says which
 * pixels of the picture belong to what was tapped; it knows nothing of blobs or depth. This file is the other half,
 * plain numbers tested in Node: from the masks of a few views of the same scene to the blobs inside all of them.
 *
 * One mask is a cone from the camera: everything in front of and behind the thing is inside it too. So the cone is
 * cut to a window of depth round the tap, as deep as the mask is across, and then to the blobs that hang together with
 * the ones the view sees. More views, if given, cut it further to where their cones cross; the sandbox gives one,
 * because the model takes seconds a picture.
 */

/** One view of the scene and the model's answer for it. */
export interface MaskView {
  lens: Lens
  /** One byte a cell, row by row, anything but 0 inside. It covers the whole view at its own size. */
  mask: Uint8Array
  width: number
  height: number
}

/** A mask over more of the picture than this is the background, not a thing. */
export const MAX_SHARE = 0.6

/** Whether a point of the view (CSS pixels) is inside the mask. */
export function inMask(v: MaskView, x: number, y: number): boolean {
  if (!(x >= 0 && y >= 0 && x < v.lens.width && y < v.lens.height)) return false
  const mx = Math.min(v.width - 1, Math.floor((x * v.width) / v.lens.width)), my = Math.min(v.height - 1, Math.floor((y * v.height) / v.lens.height))
  return v.mask[my * v.width + mx] !== 0
}

/** The share of the picture a mask covers, and its box in CSS pixels (null when empty). */
export function maskBox(v: MaskView): { share: number; lo: [number, number]; hi: [number, number] } | null {
  let n = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
  for (let y = 0; y < v.height; y++) for (let x = 0; x < v.width; x++) {
    if (!v.mask[y * v.width + x]) continue
    n++
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  if (!n) return null
  const sx = v.lens.width / v.width, sy = v.lens.height / v.height
  return { share: n / (v.width * v.height), lo: [x0 * sx, y0 * sy], hi: [(x1 + 1) * sx, (y1 + 1) * sy] }
}

/** Where a point of the scene lands in a view (CSS pixels), or null when it is behind the camera or out of the picture. */
export function promptAt(lens: Lens, p: Vec3): [number, number] | null {
  const s = projectPoint(p, lens)
  if (!s || !(s.x >= 0 && s.y >= 0 && s.x < lens.width && s.y < lens.height)) return null
  return [s.x, s.y]
}

/**
 * The blobs of the tapped thing: 1 for each blob whose center is inside every mask (the first view is the tapped one;
 * a blob that falls outside a later view's picture is not judged by it), not much further in front of or behind
 * the tapped point `at`, as the first view sees it, than the mask is across there (`FRONT`, `BACK`), and joined to what the first view
 * sees (`joined`). A mask that is empty or covers most of its picture is left out; when the tapped view's own is,
 * nothing is picked.
 */
export function blobsInMasks(b: Blobs, views: MaskView[], at: Vec3): Uint8Array {
  const picked = new Uint8Array(b.count)
  const first = views[0], box = first && maskBox(first)
  const tap = first && projectPoint(at, first.lens)
  if (!first || !box || box.share > MAX_SHARE || !tap) return picked
  // how big the masked thing is at the tap's depth, in scene units: it is taken to be about as deep as it is across
  const px = Math.max(box.hi[0] - box.lo[0], box.hi[1] - box.lo[1])
  const across = first.lens.ortho ? px / first.lens.fx : (px * tap.depth) / first.lens.fx
  const others = views.slice(1).filter((v) => { const m = maskBox(v); return !!m && m.share <= MAX_SHARE })
  for (let i = 0; i < b.count; i++) {
    const c = b.center.subarray(i * 3, i * 3 + 3)
    const s = projectPoint(c, first.lens)
    if (!s || s.depth < tap.depth - across * FRONT || s.depth > tap.depth + across * BACK || !inMask(first, s.x, s.y)) continue
    let inside = true
    for (const v of others) {
      const q = projectPoint(c, v.lens)
      if (!q || !(q.x >= 0 && q.y >= 0 && q.x < v.lens.width && q.y < v.lens.height)) continue
      if (!inMask(v, q.x, q.y)) { inside = false; break }
    }
    if (inside) picked[i] = 1
  }
  return joined(b, first, picked, across)
}

/**
 * Of the blobs inside the mask's cone, those that hang together with what the view sees there: the nearest blob of
 * each mask cell is seen, and the rest are kept only if a chain of close neighbors leads to a seen one. The far side
 * of the thing stays, since its surface runs round to it; something else standing behind it does not. "Close" is a
 * few times the gap between the seen blobs.
 */
export function joined(b: Blobs, v: MaskView, picked: Uint8Array, across: number): Uint8Array {
  const ids: number[] = []
  for (let i = 0; i < b.count; i++) if (picked[i]) ids.push(i)
  if (ids.length < 2) return picked
  // the nearest blob of each mask cell
  const front = new Map<number, { i: number; depth: number }>()
  for (const i of ids) {
    const s = projectPoint(b.center.subarray(i * 3, i * 3 + 3), v.lens)!
    const cell = Math.min(v.height - 1, Math.floor((s.y * v.height) / v.lens.height)) * v.width + Math.min(v.width - 1, Math.floor((s.x * v.width) / v.lens.width))
    const was = front.get(cell)
    if (!was || s.depth < was.depth) front.set(cell, { i, depth: s.depth })
  }
  // the seen blobs cover about the mask's own area: their gap is the side of one's share of it
  const gap = Math.sqrt((across * across) / Math.max(1, front.size))
  const link = Math.max(gap * LINK, across / 200)
  const key = (x: number, y: number, z: number) => `${Math.floor(x / link)},${Math.floor(y / link)},${Math.floor(z / link)}`
  const cells = new Map<string, number[]>()
  for (const i of ids) {
    const k = key(b.center[i * 3], b.center[i * 3 + 1], b.center[i * 3 + 2])
    const list = cells.get(k)
    if (list) list.push(i); else cells.set(k, [i])
  }
  const kept = new Uint8Array(b.count)
  const todo: number[] = []
  for (const { i } of front.values()) { kept[i] = 1; todo.push(i) }
  while (todo.length) {
    const i = todo.pop()!
    const x = b.center[i * 3], y = b.center[i * 3 + 1], z = b.center[i * 3 + 2]
    const cx = Math.floor(x / link), cy = Math.floor(y / link), cz = Math.floor(z / link)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const list = cells.get(`${cx + dx},${cy + dy},${cz + dz}`)
      if (!list) continue
      for (const j of list) {
        if (kept[j] || (b.center[j * 3] - x) ** 2 + (b.center[j * 3 + 1] - y) ** 2 + (b.center[j * 3 + 2] - z) ** 2 > link * link) continue
        kept[j] = 1
        todo.push(j)
      }
    }
  }
  return kept
}

/** The window of depth round the tapped point, in mask widths: the tap is on the thing's near side, so most of it lies behind. */
const FRONT = 0.5, BACK = 1.25
/** How many gaps between seen blobs still count as joined. */
const LINK = 3

/**
 * Which of the model's answers to take: it gives a few masks for a tap (a part, the thing, everything) with a score
 * each. Of those that are neither empty nor most of the picture, the biggest that scores within `NEAR_BEST` of the
 * best: a tap on a spot of a toadstool's cap means the toadstool. -1 when there is none.
 */
export function bestMask(scores: ArrayLike<number>, shares: ArrayLike<number>): number {
  const fits = (k: number) => shares[k] > 0 && shares[k] <= MAX_SHARE
  let top = -Infinity
  for (let k = 0; k < scores.length; k++) if (fits(k)) top = Math.max(top, scores[k])
  let best = -1
  for (let k = 0; k < scores.length; k++) if (fits(k) && scores[k] >= top - NEAR_BEST && (best < 0 || shares[k] > shares[best])) best = k
  return best
}
/** How far under the best score a bigger mask may be and still be taken. */
export const NEAR_BEST = 0.1

/** A picture's size once its longer side is `side`, and the scale that takes it there. */
export function fitTo(width: number, height: number, side: number): { width: number; height: number; scale: number } {
  const scale = side / Math.max(width, height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale }
}
