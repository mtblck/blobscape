import type { Vec3 } from '../splat-core/blobs.ts'
import { placer, type Placer } from './place.ts'
import { AUTUMN, LEAVES_EACH, joinPalettes, leafFall, litLand, refit, type Placed, type PropDoc, type PropRef, type SceneProject } from './project.ts'
import { moveAxis, type SpeckDoc, type BoneDoc, type LightDoc, type MoveAxis, type MoveDoc, type PartDoc, type SceneDoc } from './sceneDoc.ts'

/**
 * A scene written as a land and props set down on it (a `SceneProject`, the same thing Scene Creator saves) made into
 * one ordinary description, so Diorama, every style, the weather and the water draw it as they draw any scene.
 *
 * The props are named, not copied: a scene that sets down the library's stone lantern gets the lantern as the library
 * has it today, so a change to a prop (its light, its sway) reaches every scene that uses it (Matt, 2026-11-21).
 *
 * The land comes as it is (its sky, air, water, light, look and camera are the scene's). Each prop's parts keep their
 * shapes and paint as written and say where they were set down (`PartDoc.placed`); its bones, moves and lights are
 * moved, turned and sized here, and its bones renamed `<prop><i>/<bone>` so two of one prop never share a name.
 */
export function composeScene(project: SceneProject, find: (id: string) => PropDoc | undefined): SceneDoc {
  const get = (ref: PropRef, at: string): PropDoc => {
    const p = typeof ref === 'string' ? find(ref) : ref
    if (!p) throw new Error(`${project.name}: ${at} names "${String(ref)}", which is not a prop`)
    return p
  }
  const land = get(project.land, 'land')
  const ground = litLand(refit(land.doc, project.loop), project.light)
  const bones: BoneDoc[] = [...(ground.bones ?? [])]
  const parts: PartDoc[] = [...ground.parts]
  const moves: MoveDoc[] = [...(ground.moves ?? [])]
  const lights: LightDoc[] = [...(ground.lights ?? [])]
  const palettes = [ground.palette]
  // falling leaves come down from under each leafy prop's crown, onto whatever is under it
  const leaves: SpeckDoc[] = []
  project.props.forEach((placed, i) => {
    const prop = get(placed.prop, `props[${i}]`)
    const doc = refit(prop.doc, project.loop)
    palettes.push(doc.palette)
    const prefix = `${slug(prop.name)}${i}/`
    // a speck's bone keeps its ~ first, which is how it is told apart
    const name = (b: string) => (b.startsWith('~') ? `~${prefix}${b.slice(1)}` : prefix + b)
    const t = placer(prop.foot, placed)
    const fall = project.light?.weather === 'leaves' ? leafFall(prop) : undefined
    if (fall) {
      const corners = [0, 1, 2, 3].map((k) => t.point([k & 1 ? fall.to[0] : fall.from[0], fall.to[1], k & 2 ? fall.to[2] : fall.from[2]]))
      const lo = [0, 2].map((a) => Math.min(...corners.map((c) => c[a]))), hi = [0, 2].map((a) => Math.max(...corners.map((c) => c[a])))
      const bottom = t.point(fall.from)[1]
      leaves.push({ kind: 'leaves', count: LEAVES_EACH, colors: AUTUMN, size: fall.size * placed.size, land: true, from: [lo[0], bottom, lo[1]], to: [hi[0], corners[0][1], hi[1]] })
    }
    const at = t.same ? undefined : { foot: [...prop.foot] as Vec3, at: [...placed.at] as Vec3, turn: placed.turn, size: placed.size }
    for (const b of doc.bones ?? []) bones.push({ name: name(b.name), at: t.point(b.at), ...(b.parent ? { parent: name(b.parent) } : {}) })
    for (const p of doc.parts) {
      if (p.placed) throw new Error(`${project.name}: ${prop.name} is made of placed parts itself, which cannot be set down again`)
      parts.push({ ...p, ...(p.bone ? { bone: name(p.bone) } : {}), ...(at ? { placed: at } : {}), ...(lampsAlways(placed) && p.lit === 'dark' ? { lit: 'always' as const } : {}) })
    }
    if (!placed.still) for (const m of doc.moves ?? []) moves.push(placedMove({ ...m, bone: name(m.bone) }, t, placed.phase ?? 0))
    for (const l of doc.lights ?? []) {
      lights.push({
        ...l, at: t.point(l.at), range: l.range * t.size,
        ...(l.clear !== undefined ? { clear: l.clear * t.size } : {}),
        ...(l.circle ? { circle: { ...l.circle, r: l.circle.r * t.size } } : {}),
        ...(lampsAlways(placed) && l.lit === 'dark' ? { lit: 'always' as const } : {}),
      })
    }
  })
  const palette = joinPalettes(palettes).map(([r, g, b]) => `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`)
  return {
    ...ground,
    name: project.name,
    loop: project.loop,
    palette,
    camera: project.camera ? { ...ground.camera, ...project.camera } : ground.camera,
    bones,
    parts,
    moves,
    lights,
    ...(leaves.length ? { air: { ...ground.air, specks: [...(ground.air?.specks ?? []), ...leaves.slice(0, Math.max(0, Math.floor((300 - (ground.air?.specks ?? []).reduce((n, x) => n + x.count, 0)) / LEAVES_EACH)))] } } : {}),
  }
}

const lampsAlways = (p: Placed) => p.lit === 'always'

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'prop'

/** An axis turned with its prop: still a letter where it lands on one, with the sign moved into the move. */
function placedAxis(a: MoveAxis, t: Placer): { axis: MoveAxis; sign: number } {
  if (t.same) return { axis: a, sign: 1 }
  const v = t.dir(moveAxis(a))
  for (const [k, i] of [['x', 0], ['y', 1], ['z', 2]] as const) if (Math.abs(Math.abs(v[i]) - 1) < 1e-6) return { axis: k, sign: Math.sign(v[i]) }
  return { axis: v.map((c) => Math.round(c * 1e6) / 1e6) as Vec3, sign: 1 }
}

/** A move as its prop was set down: turns about the turned axis, slides along the turned way and as far times the size, `phase` of the loop later. */
function placedMove(m: MoveDoc, t: Placer, phase: number): MoveDoc {
  const later = phase ? { phase: (m.phase ?? 0) + phase * m.times - Math.floor((m.phase ?? 0) + phase * m.times) } : {}
  switch (m.kind) {
    case 'spin': { const { axis, sign } = placedAxis(m.axis, t); return { ...m, axis, times: m.times * sign, ...later } }
    case 'sway': { const { axis, sign } = placedAxis(m.axis, t); return { ...m, axis, degrees: m.degrees * sign, ...later } }
    case 'bob': case 'drift': case 'pass': return { ...m, by: t.dir(m.by).map((c) => c * t.size) as Vec3, ...later }
    case 'dissolve': return { ...m, ...(m.by !== undefined ? { by: m.by * t.size } : {}), ...later }
    default: return { ...m, ...later }
  }
}
