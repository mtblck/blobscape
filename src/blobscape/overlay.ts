import { project, quatToMat, type Blobs, type Lens } from '../splat-core/blobs.ts'
import { rgbToHex } from '../splat-core/blobs.ts'

/** Theme colours, read live so the overlay follows the light/dark switch. */
export function themeColour(name: 'accent' | 'ink' | 'ink-faint' | 'paper') {
  return getComputedStyle(document.documentElement).getPropertyValue(`--c-${name}`).trim() || '#888'
}

export interface OutlineOptions {
  /** Which blobs; all when omitted. */
  indices?: Iterable<number>
  /** Rings to draw, in standard deviations. */
  sigmas?: number[]
  /** A fixed stroke colour; otherwise each blob's own colour. */
  colour?: string
  width?: number
  /** Also draw the blob's three axes, projected. */
  axes?: boolean
}

/**
 * The x-ray view: each blob's footprint on screen, as the ellipse its
 * Gaussian falls to at 1σ, 2σ… This is the shape the renderer actually fills.
 */
export function drawOutlines(ctx: CanvasRenderingContext2D, b: Blobs, lens: Lens, o: OutlineOptions = {}) {
  const sigmas = o.sigmas ?? [2]
  ctx.lineWidth = o.width ?? 1
  const list = o.indices ?? Array.from({ length: b.count }, (_, i) => i)
  for (const i of list) {
    const f = project(b, i, lens)
    if (!f || f.depth <= 0) continue
    ctx.strokeStyle = o.colour ?? rgbToHex(b.colour.subarray(i * 3, i * 3 + 3))
    for (const k of sigmas) {
      ctx.beginPath()
      ctx.ellipse(f.x, f.y, Math.max(0.5, f.a * k), Math.max(0.5, f.b * k), f.angle, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (o.axes) drawAxes(ctx, b, i, lens, f.x, f.y)
  }
}

const AXIS_COLOURS = ['#e5484d', '#30a46c', '#3e63dd']

/** The blob's own x, y and z axes, each as long as its scale (1σ), projected to the screen. */
function drawAxes(ctx: CanvasRenderingContext2D, b: Blobs, i: number, lens: Lens, cx: number, cy: number) {
  const R = quatToMat(b.quat.subarray(i * 4, i * 4 + 4))
  const c = b.centre.subarray(i * 3, i * 3 + 3)
  const s = b.scale.subarray(i * 3, i * 3 + 3)
  for (let a = 0; a < 3; a++) {
    const tip = [c[0] + R[a] * s[a], c[1] + R[3 + a] * s[a], c[2] + R[6 + a] * s[a]]
    const p = toScreen(tip, lens)
    if (!p) continue
    ctx.strokeStyle = AXIS_COLOURS[a]
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(p[0], p[1])
    ctx.stroke()
  }
}

/** World point to CSS pixels (y down), or null behind the camera. */
export function toScreen(p: ArrayLike<number>, lens: Lens): [number, number] | null {
  const V = lens.view
  const tx = V[0] * p[0] + V[4] * p[1] + V[8] * p[2] + V[12]
  const ty = V[1] * p[0] + V[5] * p[1] + V[9] * p[2] + V[13]
  const tz = V[2] * p[0] + V[6] * p[1] + V[10] * p[2] + V[14]
  if (-tz <= 1e-4) return null
  return [lens.width / 2 + (lens.fx * tx) / -tz, lens.height / 2 - (lens.fy * ty) / -tz]
}

/** Blob centres as dots, for scenes too big to outline every blob. */
export function drawCentres(ctx: CanvasRenderingContext2D, b: Blobs, lens: Lens, colour: string, max = 30000) {
  ctx.fillStyle = colour
  const stride = Math.max(1, Math.ceil(b.count / max))
  for (let i = 0; i < b.count; i += stride) {
    const p = toScreen(b.centre.subarray(i * 3, i * 3 + 3), lens)
    if (p) ctx.fillRect(p[0] - 0.75, p[1] - 0.75, 1.5, 1.5)
  }
}
