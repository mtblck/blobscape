import type { Vec3 } from '../../splat-core/blobs.ts'
import { buildBody, mix, spots, type Creature, type Part } from '../../splat-engine/body.ts'
import { axisAngle, mulQ, type Bone, type Skeleton } from '../../splat-engine/rig.ts'
import { PROP_RULES, type Prop, type PropKind } from './game.ts'

/**
 * The crates, urns and barrels that stand about the hall. Each is built
 * once, like a slime: a body on one bone and a handful of pieces (planks,
 * shards of clay, staves) each on its own, kept at no size while it is
 * whole. When it breaks the body is gone and the pieces fly on the way the
 * blow was going, tumble, land and lie on the floor until the hall is set
 * out again for the next wave.
 */

export const PIECES = 10
const BODY = 1, PIECE0 = 2
/** Seconds a prop put back takes to grow in. */
const GROW = 0.3

const WOOD: Vec3 = [0.62, 0.44, 0.26], WOOD_DARK: Vec3 = [0.3, 0.2, 0.12], IRON: Vec3 = [0.2, 0.19, 0.2]
const CLAY: Vec3 = [0.78, 0.47, 0.3], GLAZE: Vec3 = [0.2, 0.45, 0.55]

/** Where piece i starts inside the body: a ring at mid-height, alternating high and low. */
function home(kind: PropKind, i: number): Vec3 {
  const r = PROP_RULES[kind].r * 0.6, a = (i / PIECES) * Math.PI * 2
  const h = kind === 'urn' ? 0.5 : kind === 'crate' ? 0.6 : 0.7
  return [Math.cos(a) * r, h * (0.3 + 0.45 * (i % 2)), Math.sin(a) * r]
}

/** The four side walls and the lid of a box on the floor, as triangles. */
function box(w: number, h: number): Vec3[][] {
  const c: Vec3[] = [[-w, 0, -w], [w, 0, -w], [w, 0, w], [-w, 0, w]], t = c.map((p): Vec3 => [p[0], h, p[2]])
  const tris: Vec3[][] = [[t[0], t[1], t[2]], [t[0], t[2], t[3]]]
  for (let k = 0; k < 4; k++) { const j = (k + 1) % 4; tris.push([c[k], c[j], t[j]], [c[k], t[j], t[k]]) }
  return tris
}

export function makeProp(kind: PropKind, count = 1600): Creature {
  const bones: Bone[] = [
    { name: 'root', parent: -1, head: [0, 0, 0] },
    { name: 'body', parent: 0, head: [0, 0, 0] },
    ...Array.from({ length: PIECES }, (_, i): Bone => ({ name: `piece${i}`, parent: 0, head: home(kind, i) })),
  ]
  const parts: Part[] = []
  const grain = (p: Vec3, k: number) => mix(WOOD, WOOD_DARK, 0.22 * spots(p, 7, k))
  if (kind === 'crate') {
    const W = 0.3, H = 0.6
    // each face: boards with a thin gap between, a thick darker frame round the edge and one brace corner to corner
    const face = (p: Vec3, n: Vec3): Vec3 => {
      const top = n[1] > 0.7
      // across the face and up it, 0..1
      const u = ((Math.abs(n[0]) > 0.7 ? p[2] : p[0]) + W) / (2 * W), v = top ? (p[2] + W) / (2 * W) : p[1] / H
      const frame = Math.min(u, 1 - u, v, 1 - v) < 0.14
      const brace = !top && Math.abs(u - v) < 0.085
      const board = u * 4, gap = Math.abs(board - Math.round(board)) < 0.05
      return frame || brace ? mix(WOOD, WOOD_DARK, 0.62) : gap ? WOOD_DARK : grain(p, Math.floor(board))
    }
    parts.push({ shape: { sheet: box(W, H) }, color: face, bones: ['body'], density: 1 })
  } else if (kind === 'urn') {
    const clay = (p: Vec3): Vec3 => (Math.abs(p[1] - 0.3) < 0.04 ? GLAZE : Math.abs(p[1] - 0.2) < 0.02 ? mix(CLAY, GLAZE, 0.6) : mix(CLAY, [0.55, 0.3, 0.2], 0.3 * spots(p, 8, 4)))
    parts.push(
      { shape: { ball: [0, 0.23, 0], r: [0.21, 0.23, 0.21] }, color: clay, bones: ['body'] },
      { shape: { tube: [[0, 0.42, 0], [0, 0.5, 0]], r: [0.09, 0.075] }, color: CLAY, bones: ['body'], density: 1.5 },
      { shape: { ball: [0, 0.53, 0], r: [0.125, 0.025, 0.125] }, color: mix(CLAY, [1, 0.9, 0.8], 0.25), bones: ['body'], density: 2 },
      { shape: { ball: [0, 0.538, 0], r: [0.07, 0.01, 0.07] }, color: [0.08, 0.05, 0.04], bones: ['body'], density: 3 },
    )
  } else {
    // a belly of staves between two flat ends, bound by two iron hoops
    const H = 0.7, hoop = (y: number) => Math.abs(y - 0.17) < 0.035 || Math.abs(y - 0.53) < 0.035
    const stave = (p: Vec3): Vec3 => {
      if (hoop(p[1])) return IRON
      const a = Math.atan2(p[2], p[0]) / (Math.PI * 2) * 10
      return Math.abs(a - Math.round(a)) < 0.08 ? WOOD_DARK : grain(p, Math.round(a))
    }
    parts.push(
      { shape: { tube: [[0, 0.24, 0], [0, 0.07, 0]], r: [0.3, 0.24] }, color: stave, bones: ['body'] },
      { shape: { tube: [[0, 0.24, 0], [0, 0.46, 0]], r: [0.3, 0.3] }, color: stave, bones: ['body'] },
      { shape: { tube: [[0, 0.46, 0], [0, H - 0.07, 0]], r: [0.3, 0.24] }, color: stave, bones: ['body'] },
      // the lid: pale boards inside a dark rim
      { shape: { ball: [0, H - 0.03, 0], r: [0.25, 0.012, 0.25] }, color: (p) => (Math.hypot(p[0], p[2]) > 0.2 ? WOOD_DARK : mix(WOOD, [0.85, 0.68, 0.45], 0.5)), bones: ['body'], density: 1.6 },
    )
  }
  // the pieces, hidden until it breaks: each lies flat as built, so it can come to rest that way
  for (let i = 0; i < PIECES; i++) {
    const at = home(kind, i), k = 0.8 + ((i * 0.618) % 1) * 0.5
    const r: Vec3 = kind === 'crate' ? [0.15 * k, 0.014, 0.045] : kind === 'urn' ? [0.07 * k, 0.012, 0.05 * k] : [0.04, 0.016, 0.17 * k]
    const color = kind === 'urn' ? (i % 4 === 0 ? GLAZE : mix(CLAY, [0.5, 0.28, 0.18], (i % 3) * 0.25)) : kind === 'barrel' && i % 5 === 0 ? IRON : mix(WOOD, WOOD_DARK, ((i * 0.381) % 1) * 0.6)
    parts.push({ shape: { ball: at, r }, color, bones: [`piece${i}`], density: 2.5, size: 0.8 })
  }
  const b = buildBody({ bones, parts, blend: 0.02 }, count, 61 + kind.length)
  return { blobs: b.blobs, skin: b.skin, skeleton: b.skeleton }
}

/** When piece i of a broken prop lands, and where: it flies on the way the blow went, spread to the sides. */
export function pieceFlight(kind: PropKind, i: number, dx: number, dz: number, t: number): { at: Vec3; landed: boolean; spin: number } {
  const h = home(kind, i)
  // its own way out from the middle, leaning toward the blow's way
  const l = Math.hypot(h[0], h[2]) || 1
  const sp = 0.9 + ((i * 0.618) % 1) * 1.6, vy = 1.2 + ((i * 0.381) % 1) * 2.2, g = 9.8
  const vx = (h[0] / l) * sp + dx * 1.6, vz = (h[2] / l) * sp + dz * 1.6
  const rest = 0.02 + (i % 3) * 0.012
  const land = (vy + Math.sqrt(vy * vy + 2 * g * Math.max(0, h[1] - rest))) / g
  const tt = Math.min(t, land)
  return { at: [vx * tt, vy * tt - 0.5 * g * tt * tt, vz * tt], landed: t >= land, spin: (land - tt) * (7 + (i % 4) * 3) }
}

/** Poses a prop from the game's state of it. */
export function poseProp(sk: Skeleton, p: Prop) {
  sk.reset()
  sk.place.set([p.x, 0, p.z])
  // each stands turned its own way
  sk.setRotation(0, axisAngle([0, 1, 0], p.slot * 1.7))
  if (p.phase === 'whole') {
    for (let i = 0; i < PIECES; i++) sk.size[PIECE0 + i] = 0
    const u = Math.min(1, p.t / GROW)
    sk.size[BODY] = Math.max(0.001, u * (1 + 0.25 * Math.sin(u * Math.PI)))
    // struck: it rocks away from the blow and settles
    const rock = 0.16 * Math.exp(-p.struck * 7) * Math.cos(p.struck * 26)
    if (Math.abs(rock) > 1e-4) {
      // the blow's way, in the prop's own turned frame
      const a = -p.slot * 1.7, c = Math.cos(a), s = Math.sin(a)
      const lx = p.dx * c + p.dz * s, lz = -p.dx * s + p.dz * c
      sk.setRotation(BODY, axisAngle([lz, 0, -lx], rock))
    }
  } else {
    sk.size[BODY] = p.t < 0.05 ? 1 : 0
    const a = -p.slot * 1.7, c = Math.cos(a), s = Math.sin(a)
    const lx = p.dx * c + p.dz * s, lz = -p.dx * s + p.dz * c
    for (let i = 0; i < PIECES; i++) {
      const f = pieceFlight(p.kind, i, lx, lz, p.t)
      sk.offset.set(f.at, (PIECE0 + i) * 3)
      sk.size[PIECE0 + i] = 1
      // tumbling in the air, flat and turned its own way once down
      const yaw = axisAngle([0, 1, 0], i * 2.4)
      sk.setRotation(PIECE0 + i, f.landed ? yaw : mulQ(yaw, axisAngle([Math.cos(i), 0, Math.sin(i)], f.spin)))
    }
  }
  sk.update()
}
