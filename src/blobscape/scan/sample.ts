import { Blobs, quatFacing, type Vec3 } from '../../splat-core/blobs.ts'
import { rng } from '../../splat-engine/body.ts'
import { about, turned } from './clean.ts'

/**
 * A stand-in for a phone scan, made here so the page works before anyone has
 * scanned anything: a glazed mug on a patch of wooden table, with what a real
 * capture leaves round it (stray floaters, and huge faint blobs where the
 * room behind was only half seen), the whole thing tipped and moved off
 * center the way a scan app's axes rarely match the table.
 */

export interface SampleParts {
  blobs: Blobs
  /** Which blobs are which, for tests: 0 mug, 1 table, 2 floater, 3 haze. */
  part: Uint8Array
}

/** The tilt the sample comes in at, so tests can check it's undone. */
export const SAMPLE_TILT = about(norm([0.6, 0.15, 0.8]), 28)
export const SAMPLE_LIFT = 0.35

/** `size` scales the whole scan: 0.12 makes the mug about a real mug in meters, as a phone app would export it. */
export function sampleScan(seed = 7, detail = 1, size = 1): SampleParts {
  const r = rng(seed)
  const b = new Blobs(60000)
  const part: number[] = []
  const add = (center: Vec3, normal: Vec3, size: number, color: Vec3, opacity: number, p: number) => {
    b.push({ center, scale: [size, size, size * 0.25], quat: quatFacing(normal), color, opacity })
    part.push(p)
  }
  const jitter = (c: Vec3, k: number): Vec3 => c.map((v) => Math.min(1, Math.max(0, v + (r() - 0.5) * k))) as Vec3
  const n = (k: number) => Math.round(k * detail)

  // the mug: a glazed teal wall, a lighter rim, a cream inside, a handle
  const R = 0.38, H = 0.78, glaze: Vec3 = [0.16, 0.5, 0.52]
  for (let i = 0; i < n(16000); i++) {
    const a = r() * Math.PI * 2, y = 0.02 + r() * H
    // a little shine down one side, and darker near the foot
    const shine = Math.max(0, Math.cos(a - 0.7)) ** 8 * 0.35, foot = Math.min(1, y / 0.12)
    const c = jitter([glaze[0] * foot + shine, glaze[1] * foot + shine, glaze[2] * foot + shine], 0.04)
    add([Math.cos(a) * R, y, Math.sin(a) * R], [Math.cos(a), 0, Math.sin(a)], 0.022, c, 0.92, 0)
  }
  for (let i = 0; i < n(5000); i++) {
    const a = r() * Math.PI * 2, y = 0.08 + r() * (H - 0.06)
    add([Math.cos(a) * (R - 0.04), y, Math.sin(a) * (R - 0.04)], [-Math.cos(a), 0, -Math.sin(a)], 0.022, jitter([0.9, 0.86, 0.76], 0.05), 0.9, 0)
  }
  for (let i = 0; i < n(1600); i++) {
    const a = r() * Math.PI * 2, t = r() * 0.04
    add([Math.cos(a) * (R - t), H + 0.01, Math.sin(a) * (R - t)], [0, 1, 0], 0.016, jitter([0.85, 0.88, 0.84], 0.04), 0.95, 0)
  }
  for (let i = 0; i < n(1800); i++) {
    // the inside floor, a little coffee left in it
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (R - 0.05)
    add([Math.cos(a) * d, 0.1, Math.sin(a) * d], [0, 1, 0], 0.024, jitter([0.32, 0.2, 0.12], 0.04), 0.95, 0)
  }
  for (let i = 0; i < n(2600); i++) {
    // the handle: a ring tube on the +x side
    const u = -Math.PI / 2 + r() * Math.PI, v = r() * Math.PI * 2
    const cx = R + 0.02, cy = H / 2, ring = 0.22, tube = 0.055
    const px = cx + Math.cos(u) * (ring + Math.cos(v) * tube), py = cy + Math.sin(u) * (ring + Math.cos(v) * tube), pz = Math.sin(v) * tube
    const nrm: Vec3 = [Math.cos(u) * Math.cos(v), Math.sin(u) * Math.cos(v), Math.sin(v)]
    if (px < R - 0.02) continue
    add([px, py, pz], nrm, 0.016, jitter(glaze, 0.04), 0.92, 0)
  }

  // the table: a patch of oak, grain along x, a soft shadow under the mug
  for (let i = 0; i < n(20000); i++) {
    const x = (r() - 0.5) * 2.6, z = (r() - 0.5) * 2.2
    const d = Math.hypot(x, z)
    if (d < R - 0.02) continue
    const grain = 0.06 * Math.sin(z * 40 + Math.sin(x * 3) * 2), shade = 0.55 + 0.45 * Math.min(1, Math.max(0, (d - R) / 0.35))
    const c = jitter([(0.66 + grain) * shade, (0.46 + grain * 0.8) * shade, (0.28 + grain * 0.5) * shade], 0.03)
    add([x, (r() - 0.5) * 0.006, z], [0, 1, 0], 0.03, c, 0.95, 1)
  }

  // floaters: small stray blobs all round, some in little clusters
  for (let i = 0; i < n(700); i++) {
    const c: Vec3 = [(r() - 0.5) * 4, -0.6 + r() * 2.6, (r() - 0.5) * 4]
    if (Math.abs(c[0]) < 1.4 && Math.abs(c[2]) < 1.2 && c[1] < 1) continue
    const k = 1 + Math.floor(r() * 3)
    for (let j = 0; j < k; j++) add([c[0] + (r() - 0.5) * 0.05, c[1] + (r() - 0.5) * 0.05, c[2] + (r() - 0.5) * 0.05], norm([r() - 0.5, r() - 0.5, r() - 0.5]), 0.015 + r() * 0.03, jitter([0.5, 0.48, 0.45], 0.4), 0.3 + r() * 0.6, 2)
  }
  // haze: huge faint blobs where the room behind was half seen
  for (let i = 0; i < n(260); i++) {
    const a = r() * Math.PI * 2, d = 1.6 + r() * 1.4
    add([Math.cos(a) * d, r() * 1.8, Math.sin(a) * d], norm([r() - 0.5, r() - 0.5, r() - 0.5]), 0.35 + r() * 0.6, jitter([0.62, 0.6, 0.58], 0.2), 0.04 + r() * 0.14, 3)
  }

  const out = turned(b, SAMPLE_TILT, SAMPLE_LIFT)
  if (size !== 1) {
    for (let i = 0; i < out.count * 3; i++) { out.center[i] *= size; out.scale[i] *= size }
  }
  return { blobs: out, part: Uint8Array.from(part) }
}

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(...v) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
