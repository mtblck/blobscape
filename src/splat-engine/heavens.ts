import type { Vec3 } from '../splat-core/blobs.ts'
import { hash } from './built.ts'
import type { BoneDoc, PartDoc, SceneDoc, ShapeDoc } from './sceneDoc.ts'
import { CLOUD_COVERS, type CloudId } from './skyRecipes.ts'

/**
 * The sun, the moon, the stars and a scene's own clouds as shared recipes (Matt, 2026-11-21: scenes use a reusable
 * sun, moon and clouds unless one calls for something of its own, an eclipse, a red sun, three moons). A description
 * says where its moon hangs and how big, how many stars and where, and how cloudy its sky is; what they look like is
 * written here once. Pure and tested.
 *
 * The moon, sun and stars are cut into the scene (`withHeavens`, which `compileScene`, `litFor` and `splitScene` call
 * first), each on a bone of its own named with a `~` (`~moon`, `~sun`, `~star<n>`), so cloud cover can put them out by
 * size without the scene being cut again (`showHeavens`), and Blocks draws them as small cubes. They wait for their
 * time like any part: the moon and stars are `lit: 'night'`, the sun `lit: 'day'`. The clouds are not cut into the
 * scene: they are the weather's own clouds (skyRecipes.ts), drawn over the scene in the colors the scene asks for, so
 * a scene's few clouds and a storm's many are one kind of cloud.
 */
export interface HeavensDoc {
  /** The moon: its middle and radius; `colors` its face and its craters. */
  moon?: { at: Vec3; r: number; colors?: [string, string] }
  /** The sun: its middle and radius, and its color. */
  sun?: { at: Vec3; r: number; color?: string }
  /**
   * Stars (at most `MOST_STARS`), scattered by a hash through the box `from` to `to`, or through the sky behind the
   * view's target when it is left out, never on the moon; `size` is a star's radius, `colors` taken in turn by a hash.
   */
  stars?: { count: number; from?: Vec3; to?: Vec3; size?: number; colors?: string[] }
  /** How cloudy the sky is as the scene stands, and the clouds' colors from underneath up; `glow` keeps them their own color at night. */
  clouds?: { cover: CloudId; colors?: [string, string, string]; glow?: boolean }
}

export const MOST_STARS = 40

/** The recipes' own colors. */
export const MOON_COLORS: [string, string] = ['#f5f7ff', '#ccd6e6']
export const SUN_COLOR = '#fff0b8'
export const STAR_COLORS = ['#ffffe6', '#cce0e6']

const round = (v: number) => Math.round(v * 1e4) / 1e4

/** Where star `i` of a scene's stars stands: in their box, or in the sky behind the view's target; off the moon. */
export function starAt(doc: Pick<SceneDoc, 'camera' | 'heavens'>, i: number): Vec3 {
  const h = doc.heavens!, s = h.stars!, cam = doc.camera
  const d = cam.distance, [tx, ty, tz] = cam.target, a = (cam.azimuth * Math.PI) / 180
  for (let k = 0; ; k++) {
    const u = hash(i + 1, 11, k), v = hash(i + 1, 13, k), w = hash(i + 1, 17, k)
    let p: Vec3
    if (s.from && s.to) p = [s.from[0] + (s.to[0] - s.from[0]) * u, s.from[1] + (s.to[1] - s.from[1]) * v, s.from[2] + (s.to[2] - s.from[2]) * w]
    else {
      // across the view (cos a, -sin a), away from the eye (-sin a, -cos a), up from the view's target
      const across = (u * 2 - 1) * 0.5 * d, up = (0.12 + 0.5 * v) * d, away = (0.3 + 0.15 * w) * d
      p = [tx + across * Math.cos(a) - away * Math.sin(a), ty + up, tz - across * Math.sin(a) - away * Math.cos(a)]
    }
    const m = h.moon
    if (k >= 8 || !m || Math.hypot(p[0] - m.at[0], p[1] - m.at[1], p[2] - m.at[2]) > m.r * 2) return p.map(round) as Vec3
  }
}

/** A scene's moon, sun and stars as parts on bones of their own, after everything else; its clouds are left to the weather. */
export function withHeavens(doc: SceneDoc): SceneDoc {
  const h = doc.heavens
  if (!h) return doc
  const bones: BoneDoc[] = [], parts: PartDoc[] = [], colors: string[] = []
  const sky = { glow: true, noShadow: true, bare: true } as const
  if (h.moon) {
    const { at, r } = h.moon, [face, crater] = h.moon.colors ?? MOON_COLORS, k = r / 0.17
    bones.push({ name: '~moon', at })
    parts.push({
      shape: { kind: 'sphere', at, r },
      // craters: round marks on the face, as deep columns through the moon so only their outline on the face counts
      paint: { kind: 'near', shape: { kind: 'join', shapes: [[0.05, 0.04, 0.06], [-0.07, -0.05, 0.05], [0.02, -0.09, 0.04]].map(([x, y, cr]): ShapeDoc => ({ kind: 'ball', at: [round(at[0] + x * k), round(at[1] + y * k), at[2]], r: [round(cr * k), round(cr * k), round(r * 2.4)] })) }, within: 0, near: crater, far: face },
      bone: '~moon', lit: 'night', unlit: 'gone', ...sky,
    })
    colors.push(face, crater)
  }
  if (h.sun) {
    const color = h.sun.color ?? SUN_COLOR
    bones.push({ name: '~sun', at: h.sun.at })
    parts.push({ shape: { kind: 'sphere', at: h.sun.at, r: h.sun.r }, paint: color, bone: '~sun', lit: 'day', unlit: 'gone', ...sky })
    colors.push(color)
  }
  if (h.stars) {
    const s = h.stars, n = Math.min(MOST_STARS, s.count), size = s.size ?? round(0.0045 * doc.camera.distance), cs = s.colors ?? STAR_COLORS
    for (let i = 0; i < n; i++) {
      const at = starAt(doc, i), paint = cs[Math.floor(hash(i + 1, 19) * cs.length) % cs.length]
      bones.push({ name: `~star${i}`, at })
      // one part each: a join's box would span the whole sky, and the builder walks every cell of it
      parts.push({ shape: { kind: 'sphere', at, r: size }, paint, bone: `~star${i}`, lit: 'night', unlit: 'gone', ...sky })
    }
    colors.push(...cs)
  }
  const palette = [...doc.palette]
  for (const c of colors) if (palette.length < 32 && !palette.includes(c)) palette.push(c)
  const { heavens: _h, ...rest } = doc
  return { ...rest, palette, bones: [...(doc.bones ?? []), ...bones], parts: [...doc.parts, ...parts] }
}

/** The share of the weather's clouds a scene's own sky has out. */
export const ownClouds = (doc: Pick<SceneDoc, 'heavens'>) => CLOUD_COVERS.find((c) => c.id === doc.heavens?.clouds?.cover)?.clouds ?? 0

/** The bones of a compiled scene that cloud cover puts out. */
export interface HeavenBones { moon: number[]; sun: number[]; stars: number[] }
export function heavenBones(names: readonly string[]): HeavenBones {
  const pick = (f: (n: string) => boolean) => names.map((n, i) => (f(n) ? i : -1)).filter((i) => i >= 0)
  return { moon: pick((n) => n === '~moon'), sun: pick((n) => n === '~sun'), stars: pick((n) => n.startsWith('~star')) }
}

/** The cover at which stars start to go, and at which the last is gone; the moon and sun go between `BODIES_GO` and 1. */
export const STARS_GO: [number, number] = [0.3, 0.8]
export const BODIES_GO = 0.8

/**
 * After a scene's own pose: with `cover` of the sky cloud (0 to 1), puts out the stars one at a time (all of them by a
 * cloudy sky) and the moon and sun under heavy cloud, by size, so a sky clouding over puts them out as it comes.
 */
export function showHeavens(size: Float32Array, bones: HeavenBones, cover: number) {
  const starsOut = 1 - Math.min(1, Math.max(0, (cover - STARS_GO[0]) / (STARS_GO[1] - STARS_GO[0])))
  // a hash decides which star goes first, so they do not go out from one side
  bones.stars.forEach((b, i) => { if (hash(i + 1, 23) >= starsOut) size[b] = 0 })
  const bodies = Math.min(1, Math.max(0, (1 - cover) / (1 - BODIES_GO)))
  for (const b of [...bones.moon, ...bones.sun]) size[b] *= bodies
}
