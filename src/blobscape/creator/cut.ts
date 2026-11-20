import { buildVoxels, unlit } from '../../splat-engine/voxel.ts'
import { compileProject, landSpec, propSpec, settingOf, type CompiledProject, type SceneProject } from '../../splat-engine/project.ts'
import type { Built } from '../../splat-engine/body.ts'
import { Skeleton, mulQ } from '../../splat-engine/rig.ts'
import { oklab } from '../../splat-core/pixel.ts'
import { DIORAMAS } from '../diorama/scenes.ts'
import { creatureLook, isCreature, libraryCreature, libraryProp } from './library.ts'
import { placer, type Placement } from '../../splat-engine/project.ts'
import { DETAIL } from '../diorama/scene.ts'
import type { Species } from '../../splat-engine/zoo/species.ts'

/**
 * What Scene Creator asks to have cut, in a worker so the page keeps drawing: a scene that opens whole, or a
 * project's land or one of its props, on a grid of `spacing`. `plain` cuts it with no light baked in, for the styles that
 * light the blobs themselves (cel shading, neon, stained glass).
 */
export type CutJob =
  | { kind: 'whole'; scene: string; spacing: number; plain?: boolean }
  | { kind: 'land'; project: SceneProject; spacing: number; plain?: boolean }
  | { kind: 'prop'; project: SceneProject; i: number; spacing: number; plain?: boolean }

// one project is compiled once and kept while the jobs that follow ask for its pieces
let kept: { key: string; cp: CompiledProject } | undefined
const compiled = (project: SceneProject): CompiledProject => {
  const key = JSON.stringify(project)
  if (kept?.key !== key) kept = { key, cp: compileProject(project, libraryProp) }
  return kept.cp
}

/** Cuts what a job asks for. */
export function cut(job: CutJob): Built {
  if (job.plain) return unlit(() => cut({ ...job, plain: false }))
  if (job.kind === 'whole') {
    const d = DIORAMAS.find((x) => x.id === job.scene)
    if (!d) throw new Error(`no scene called "${job.scene}"`)
    return d.make(job.spacing)
  }
  if (job.kind === 'prop') {
    const placed = job.project.props[job.i]
    const c = isCreature(placed.prop) ? libraryCreature(placed.prop) : undefined
    if (c) return withShadow(placedCreature(c, placed, job.spacing, creatureLook(placed.prop as string)), placed.at)
  }
  const cp = compiled(job.project)
  const land = landSpec(cp, job.spacing)
  if (job.kind === 'land') return buildVoxels(land)
  return withShadow(buildVoxels(propSpec(cp, job.i, job.spacing, settingOf(land))), cp.props[job.i].placed.at)
}

/** How dark the stand-in shadow is, and how wide, as a share of the prop's own width. */
const SHADOW = { color: [0.03, 0.03, 0.05] as [number, number, number], opacity: 0.78, wide: 0.42 }

/**
 * A prop cut on its own casts no baked shadow on the land under it, so while it is being arranged a dark flat blob
 * at its foot stands in for one (a merged cut at Finish gives it the real one). It rides on the prop's root bone.
 */
export function withShadow(b: Built, foot: ArrayLike<number>): Built {
  const n = b.blobs.count
  if (!n) return b
  let reach = 0
  for (let i = 0; i < n; i++) reach = Math.max(reach, Math.abs(b.blobs.center[i * 3] - foot[0]), Math.abs(b.blobs.center[i * 3 + 2] - foot[2]))
  const r = Math.max(0.02, reach * SHADOW.wide)
  b.blobs.push({ center: [foot[0], foot[1] + Math.max(0.02, r * 0.05), foot[2]], scale: [r, r * 0.01, r], quat: [0, 0, 0, 1], color: SHADOW.color, opacity: SHADOW.opacity })
  const grow = <T extends Uint8Array | Uint16Array | Float32Array>(a: T, per: number, fill: number[]): T => {
    const out = new (a.constructor as new (n: number) => T)((n + 1) * per)
    out.set(a.subarray(0, n * per))
    out.set(fill, n * per)
    return out
  }
  let part = 0
  for (let i = 0; i < n; i++) part = Math.max(part, b.partOf[i])
  return {
    ...b,
    skin: { joints: grow(b.skin.joints, 4, [0, 0, 0, 0]), weights: grow(b.skin.weights, 4, [1, 0, 0, 0]) },
    partOf: grow(b.partOf, 1, [part + 1]),
    seen: b.seen && grow(b.seen, 4, [255, 255, 255, 255]),
    glow: b.glow && grow(b.glow, 1, [0]),
  }
}

/**
 * A creature from Splat Creatures, made in `look` (its first when left out) at the blob count of its own detail chip that matches the
 * page's detail (Chunky its lightest), and stood where it is placed: blobs and bones moved, turned and sized as a
 * placed prop's cut would be. Made standing on the floor at the middle, so its foot is the origin.
 */
export function placedCreature(c: Species, pl: Placement, spacing: number, look = c.looks[0].id): Built {
  const level = Math.max(0, DETAIL.findIndex((d) => Math.abs(d.spacing - spacing) < 1e-6))
  const made = c.make(c.detail[Math.min(level, c.detail.length - 1)], look) as Partial<Built> & Built
  const t = placer([0, 0, 0], pl)
  const b = made.blobs, n = b.count
  for (let i = 0; i < n; i++) {
    const p = t.point(b.center.subarray(i * 3, i * 3 + 3))
    b.center.set(p, i * 3)
    for (let k = 0; k < 3; k++) b.scale[i * 3 + k] *= t.size
    b.quat.set(mulQ(t.q, b.quat.subarray(i * 4, i * 4 + 4)), i * 4)
  }
  const bones = made.skeleton.bones.map((x) => ({ ...x, head: t.point(x.head), tail: x.tail && t.point(x.tail) }))
  return { blobs: b, skin: made.skin, skeleton: new Skeleton(bones), partOf: made.partOf ?? new Uint16Array(n), seen: made.seen, glow: made.glow }
}

/**
 * A creature's own colors, for the palette pixel art snaps to: its most common colors, at most `most`, each clearly
 * apart from the others (it is made with its colors baked in, so the scene's palette may lack them).
 */
export function colorsOf(b: Built, most = 8): string[] {
  const n = b.blobs.count, counts = new Map<number, number>()
  const to = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 31)
  for (let i = 0; i < n; i++) {
    if (b.blobs.opacity[i] < 0.5) continue
    const key = (to(b.blobs.color[i * 3]) << 10) | (to(b.blobs.color[i * 3 + 1]) << 5) | to(b.blobs.color[i * 3 + 2])
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const out: [number, number, number][] = []
  for (const [key] of [...counts].sort((a, b) => b[1] - a[1])) {
    const rgb: [number, number, number] = [((key >> 10) & 31) * 255 / 31, ((key >> 5) & 31) * 255 / 31, (key & 31) * 255 / 31]
    const lab = oklab(...rgb)
    if (out.some((o) => { const l = oklab(...o); return Math.hypot(l[0] - lab[0], l[1] - lab[1], l[2] - lab[2]) < 0.06 })) continue
    out.push(rgb)
    if (out.length >= most) break
  }
  return out.map((c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`)
}
