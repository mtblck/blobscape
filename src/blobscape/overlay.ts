import { project, projectPoint, quatToMat, rgbToHex, type Blobs, type Lens } from '../splat-core/blobs.ts'

/** Theme colors, read live so the overlay follows the light/dark switch. */
export function themeColor(name: 'accent' | 'ink' | 'ink-faint' | 'paper', from: Element = document.documentElement) {
  // Read from the canvas itself where possible: a lesson's display case is always dark, whatever the page theme
  return getComputedStyle(from).getPropertyValue(`--c-${name}`).trim() || '#888'
}

export interface OutlineOptions {
  /** Which blobs; all when omitted. */
  indices?: Iterable<number>
  /** Rings to draw, in standard deviations. */
  sigmas?: number[]
  /** A fixed stroke color; otherwise each blob's own color. */
  color?: string
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
    ctx.strokeStyle = o.color ?? rgbToHex(b.color.subarray(i * 3, i * 3 + 3))
    for (const k of sigmas) {
      ctx.beginPath()
      ctx.ellipse(f.x, f.y, Math.max(0.5, f.a * k), Math.max(0.5, f.b * k), f.angle, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (o.axes) drawAxes(ctx, b, i, lens, f.x, f.y)
  }
}

const AXIS_COLORS = ['#e5484d', '#30a46c', '#3e63dd']

/** The blob's own x, y and z axes, each as long as its scale (1σ), projected to the screen. */
function drawAxes(ctx: CanvasRenderingContext2D, b: Blobs, i: number, lens: Lens, cx: number, cy: number) {
  const R = quatToMat(b.quat.subarray(i * 4, i * 4 + 4))
  const c = b.center.subarray(i * 3, i * 3 + 3)
  const s = b.scale.subarray(i * 3, i * 3 + 3)
  for (let a = 0; a < 3; a++) {
    const tip = [c[0] + R[a] * s[a], c[1] + R[3 + a] * s[a], c[2] + R[6 + a] * s[a]]
    const p = toScreen(tip, lens)
    if (!p) continue
    ctx.strokeStyle = AXIS_COLORS[a]
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(p[0], p[1])
    ctx.stroke()
    // Letters as well as colors, so the axes don't rely on telling red from green
    const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1
    ctx.font = '600 12px "Archivo Variable", system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = themeColor('ink', ctx.canvas as HTMLCanvasElement)
    ctx.fillText('xyz'[a], p[0] + (dx / l) * 10, p[1] + (dy / l) * 10)
  }
}

/** World point to CSS pixels (y down), or null behind the camera. */
export function toScreen(p: ArrayLike<number>, lens: Lens): [number, number] | null {
  const s = projectPoint(p, lens)
  return s ? [s.x, s.y] : null
}

/** Blob centers as dots, for scenes too big to outline every blob. */
export function drawCenters(ctx: CanvasRenderingContext2D, b: Blobs, lens: Lens, color: string, max = 30000) {
  ctx.fillStyle = color
  const stride = Math.max(1, Math.ceil(b.count / max))
  for (let i = 0; i < b.count; i += stride) {
    const p = toScreen(b.center.subarray(i * 3, i * 3 + 3), lens)
    if (p) ctx.fillRect(p[0] - 0.75, p[1] - 0.75, 1.5, 1.5)
  }
}

/**
 * Bones as an x-ray: each one a tapered line from its head to its end, with a
 * ring at the joint, drawn over the blobs so you can see what moves what.
 */
export function drawBones(ctx: CanvasRenderingContext2D, bones: { from: ArrayLike<number>; to: ArrayLike<number> }[], lens: Lens, color: string) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  for (const b of bones) {
    const a = toScreen(b.from, lens), z = toScreen(b.to, lens)
    if (!a || !z) continue
    const dx = z[0] - a[0], dy = z[1] - a[1]
    const len = Math.hypot(dx, dy)
    if (len > 1) {
      // a long thin diamond, wide near the head like a bone in a 3D app
      const nx = (-dy / len) * Math.min(6, len * 0.12), ny = (dx / len) * Math.min(6, len * 0.12)
      const k = 0.18
      ctx.globalAlpha = 0.3
      ctx.beginPath()
      ctx.moveTo(a[0], a[1])
      ctx.lineTo(a[0] + dx * k + nx, a[1] + dy * k + ny)
      ctx.lineTo(z[0], z[1])
      ctx.lineTo(a[0] + dx * k - nx, a[1] + dy * k - ny)
      ctx.closePath()
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(a[0], a[1], 4.5, 0, Math.PI * 2)
    ctx.stroke()
  }
}
