/**
 * The translation layer for comparing Silicon Jungle's Ink Studio looks with ours (a dev tool, `dev/ink-compare/`):
 * the scene a Blobscape page has on show, turned into what Ink Studio's renderer takes. Pure, tested; none of Ink
 * Studio's code is here or in the site. Its renderer is loaded from a local build of it, only by the dev page.
 *
 * - `inkCloud` is the posed blobs as the cloud Ink Studio's `gaussianSplatWorld` takes (the fields its .ply decoder
 *   gives: linear scales, x y z w rotations, linear opacity, the color as the zeroth spherical-harmonic term).
 * - `inkFit` is how that world will be placed. Ink centers a cloud on its box and scales it to `size`; asked for the
 *   box's own size it keeps our units, so only the center moves.
 * - `inkCamera` is our orbit as Ink's camera (the same yaw and pitch: both put the eye at
 *   (sin az cos el, sin el, cos az cos el) from the target) with the stage's field of view.
 * - `inkPalette` is a palette as Ink's packed swatches.
 * - `readInkLooks` reads a dropped look file (see `InkLook`).
 */
import { SH_C0 } from '../../splat-core/color.ts'
import type { Blobs } from '../../splat-core/blobs.ts'
import type { Orbit } from '../../splat-core/orbit.ts'
import type { Rgb } from '../../splat-core/pixel.ts'

/** What Ink Studio's `gaussianSplatWorld` takes: one entry per blob, color by angle left out. */
export interface InkCloud {
  count: number
  positions: Float32Array
  scales: Float32Array
  rotations: Float32Array
  opacity: Float32Array
  dc: Float32Array
  sh: Float32Array
  degree: 0
}

/** A blob fainter than this, or smaller, is left out: hidden bones pose their blobs at size 0. */
export const INK_LEAST = { opacity: 1 / 255, scale: 1e-6 }

/** The most swatches Ink Studio's WebGL palette resolve reads (`scenePaletteSize` in its shaders). */
export const INK_SWATCHES = 64

/** Ink's swatch list may hold no more than this. */
const MOST_SWATCHES = 64

/** The blobs of several posed actors as one Ink cloud, leaving out those too faint or small to see. */
export function inkCloud(parts: readonly Blobs[]): InkCloud {
  const kept: [Blobs, number][] = []
  for (const b of parts) for (let i = 0; i < b.count; i++) {
    if (b.opacity[i] < INK_LEAST.opacity) continue
    if (Math.max(b.scale[i * 3], b.scale[i * 3 + 1], b.scale[i * 3 + 2]) < INK_LEAST.scale) continue
    kept.push([b, i])
  }
  const n = kept.length
  const c: InkCloud = {
    count: n, positions: new Float32Array(n * 3), scales: new Float32Array(n * 3), rotations: new Float32Array(n * 4),
    opacity: new Float32Array(n), dc: new Float32Array(n * 3), sh: new Float32Array(0), degree: 0,
  }
  kept.forEach(([b, i], k) => {
    for (let a = 0; a < 3; a++) {
      c.positions[k * 3 + a] = b.center[i * 3 + a]
      // a flat disc has a zero axis, which Ink refuses
      c.scales[k * 3 + a] = Math.max(INK_LEAST.scale, b.scale[i * 3 + a])
      c.dc[k * 3 + a] = (b.color[i * 3 + a] - 0.5) / SH_C0
    }
    const q = b.quat.subarray(i * 4, i * 4 + 4)
    const len = Math.hypot(q[0], q[1], q[2], q[3])
    // a quaternion of zeros (never set) is no turn
    for (let a = 0; a < 4; a++) c.rotations[k * 4 + a] = len ? q[a] / len : a === 3 ? 1 : 0
    c.opacity[k] = Math.min(1, b.opacity[i])
  })
  return c
}

/** Where Ink will put a cloud: its box's middle goes to the origin, and `size` (the box's own) keeps our units. */
export interface InkFit {
  center: [number, number, number]
  size: number
}

/** The placing Ink's `gaussianSplatWorld` gives `cloud` when asked for `size: fit.size` (its own sums, so it is one for one). */
export function inkFit(cloud: InkCloud): InkFit {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  let most = 0
  for (let i = 0; i < cloud.count * 3; i++) {
    const a = i % 3
    lo[a] = Math.min(lo[a], cloud.positions[i])
    hi[a] = Math.max(hi[a], cloud.positions[i])
    most = Math.max(most, cloud.scales[i])
  }
  if (!cloud.count) return { center: [0, 0, 0], size: 1 }
  const center = [0, 1, 2].map((a) => (lo[a] + hi[a]) / 2) as [number, number, number]
  const size = Math.max(...[0, 1, 2].map((a) => hi[a] - lo[a]), 6 * most, 1e-30)
  return { center, size }
}

/** Ink Studio's camera for a world placed by `fit`. */
export interface InkCamera {
  target: [number, number, number]
  dist: number
  yaw: number
  pitch: number
  /** Vertical, in radians. */
  fov: number
  sway: 0
}

/** Our orbit (degrees) as Ink's camera (radians), seen through a vertical field of view of `fovDegrees`. */
export function inkCamera(o: Orbit, fit: InkFit, fovDegrees: number): InkCamera {
  const rad = Math.PI / 180
  return {
    target: [o.target[0] - fit.center[0], o.target[1] - fit.center[1], o.target[2] - fit.center[2]],
    dist: o.distance,
    yaw: o.azimuth * rad,
    // the stage keeps the eye off the poles the same way
    pitch: Math.max(-89, Math.min(89, o.elevation)) * rad,
    fov: fovDegrees * rad,
    sway: 0,
  }
}

/** A palette (0–255 colors) as Ink's packed 0xrrggbb swatches, no more than it reads. */
export function inkPalette(colors: readonly Rgb[]): number[] {
  const out: number[] = []
  for (const [r, g, b] of colors) {
    const v = (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)
    if (!out.includes(v)) out.push(v)
  }
  return out.slice(0, Math.min(INK_SWATCHES, MOST_SWATCHES))
}

/**
 * One Ink Studio look to try, as a file dropped on the page or kept in `dev/ink-looks/`. Each part is handed to Ink
 * as written, so any setting its renderer reads works without a change here:
 * - `look`: fields of the world's `look` (`finish.look` in an Ink diorama: `tone`, `paletteRemap`, `colorCurves`,
 *   `colorLut`, `colorClusters`, `boundaryCels`, `stable` …).
 * - `frame`: options for each `renderer.render` call (`outline`, `dither`, `raw`, `tone`, `colored` …).
 * - `world`: fields set on the world itself (`dither`, `outline`, `fog`, `bg`).
 * - `colorMode`: how the cloud's colors are kept: 'baked' (Ink's default), 'rgb' or 'palette'.
 * - `palette`: swatches ('#rrggbb') in place of the Blobscape scene's own.
 * - `asset`: a look from an Ink asset pack (`ink-studio/asset-pack`), bound through its KIT when the page has one.
 * - `pixelSize`: CSS pixels across one of Ink's art pixels (its drawing buffer is the art grid).
 */
export interface InkLook {
  id: string
  label: string
  look?: Record<string, unknown>
  frame?: Record<string, unknown>
  world?: Record<string, unknown>
  colorMode?: 'baked' | 'rgb' | 'palette'
  palette?: number[]
  asset?: { pack: unknown; id: string }
  pixelSize?: number
  /** Where it came from, for the page's list. */
  source: string
}

/** Keys only our own look file has at its top: a bare Ink look with one of them is our file missing its mark. */
const OURS = ['frame', 'world', 'colorMode'] as const

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** '#rrggbb', 'rrggbb' or a packed number as a packed number, or undefined. */
export function swatch(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffff) return v
  if (typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v)) return parseInt(v.replace('#', ''), 16)
  return undefined
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'look'

/**
 * Reads a look file's text. Takes, by shape:
 * - our own file (`{ "inkLook": 1, "label", "look", "frame", … }`, see `InkLook`);
 * - an Ink diorama or scene (`{ "finish": { "look": … } }`): its look;
 * - an Ink asset pack (`{ "type": "ink-studio/asset-pack", "looks": [ … ] }`): one entry per look in it;
 * - a bare `finish.look` object.
 * Throws with a line saying what is wrong.
 */
export function readInkLooks(text: string, source: string): InkLook[] {
  let data: unknown
  try { data = JSON.parse(text) } catch { throw new Error(`${source}: not JSON`) }
  if (!isObject(data)) throw new Error(`${source}: a look file is one JSON object`)
  const name = source.replace(/\.json$/i, '')
  if (data.inkLook !== undefined) return [ours(data, name, source)]
  if (data.type === 'ink-studio/asset-pack' || (Array.isArray(data.looks) && data.looks.length)) {
    const looks = Array.isArray(data.looks) ? data.looks : []
    const found = looks.filter(isObject).filter((l) => typeof l.id === 'string')
    if (!found.length) throw new Error(`${source}: an asset pack with no looks`)
    return found.map((l) => ({ id: `${slug(name)}:${l.id}`, label: typeof l.label === 'string' ? l.label : String(l.id), asset: { pack: data, id: l.id as string }, source }))
  }
  const finish = isObject(data.finish) && isObject(data.finish.look) ? data.finish.look : undefined
  const look = finish ?? data
  if (!finish && OURS.some((k) => k in look)) throw new Error(`${source}: looks like our own look file but has no "inkLook": 1`)
  return [{ id: slug(name), label: name, look, source }]
}

function ours(d: Record<string, unknown>, name: string, source: string): InkLook {
  const where = (k: string) => `${source}: "${k}"`
  const part = (k: string) => {
    if (d[k] === undefined) return undefined
    if (!isObject(d[k])) throw new Error(`${where(k)} must be an object`)
    return d[k] as Record<string, unknown>
  }
  if (d.colorMode !== undefined && !['baked', 'rgb', 'palette'].includes(d.colorMode as string)) throw new Error(`${where('colorMode')} is baked, rgb or palette`)
  let palette: number[] | undefined
  if (d.palette !== undefined) {
    if (!Array.isArray(d.palette) || !d.palette.length || d.palette.length > MOST_SWATCHES) throw new Error(`${where('palette')} is 1 to ${MOST_SWATCHES} colors`)
    palette = d.palette.map((v, i) => {
      const s = swatch(v)
      if (s === undefined) throw new Error(`${where('palette')}: color ${i + 1} is not #rrggbb`)
      return s
    })
  }
  if (d.pixelSize !== undefined && !(typeof d.pixelSize === 'number' && d.pixelSize >= 1 && d.pixelSize <= 16)) throw new Error(`${where('pixelSize')} is 1 to 16`)
  const label = typeof d.label === 'string' && d.label.trim() ? d.label.trim() : name
  return {
    id: typeof d.id === 'string' && d.id ? d.id : slug(name), label,
    look: part('look'), frame: part('frame'), world: part('world'),
    colorMode: d.colorMode as InkLook['colorMode'], palette, pixelSize: d.pixelSize as number | undefined, source,
  }
}
