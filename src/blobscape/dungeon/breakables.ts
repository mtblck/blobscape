import type { Vec3 } from '../../splat-core/blobs.ts'
import { buildBody, mix, spots, type Creature, type Part } from '../../splat-engine/body.ts'
import { Skeleton, axisAngle, emptySkin, mulQ, setWeights, type Bone } from '../../splat-engine/rig.ts'
import type { Prop, PropKind } from './game.ts'

/**
 * The crates, urns and barrels that stand about the hall. Each is built
 * once, like a slime, and then cut into pieces (issue #157): every blob of
 * the body goes to the nearest of a few seeds spread over it, and each
 * piece is a bone hung on the body. Whole, the pieces sit where they were
 * cut, so it is one thing; when it breaks the same paint and shape fly on
 * the way the blow was going, tumble, land and lie on the floor until the
 * hall is set out again for the next wave.
 */

export const PIECES = 10
const BODY = 1, PIECE0 = 2
/** Seconds a prop put back takes to grow in. */
const GROW = 0.3

const WOOD: Vec3 = [0.62, 0.44, 0.26], WOOD_DARK: Vec3 = [0.3, 0.2, 0.12], IRON: Vec3 = [0.2, 0.19, 0.2]
const CLAY: Vec3 = [0.78, 0.47, 0.3], GLAZE: Vec3 = [0.2, 0.45, 0.55]

/** The four side walls and the lid of a box on the floor, as triangles. */
function box(w: number, h: number): Vec3[][] {
  const c: Vec3[] = [[-w, 0, -w], [w, 0, -w], [w, 0, w], [-w, 0, w]], t = c.map((p): Vec3 => [p[0], h, p[2]])
  const tris: Vec3[][] = [[t[0], t[1], t[2]], [t[0], t[2], t[3]]]
  for (let k = 0; k < 4; k++) { const j = (k + 1) % 4; tris.push([c[k], c[j], t[j]], [c[k], t[j], t[k]]) }
  return tris
}

/** A piece cut from a prop: where its bone stands (the middle of its blobs) and how high that is once it lies on the floor. */
export interface Piece {
  home: Vec3
  rest: number
}

export interface PropBody extends Creature {
  pieces: Piece[]
}

/**
 * Cuts a built body into `n` pieces: seeds spread by farthest-point picking from the highest blob, then moved to the
 * middle of their blobs a few times (Lloyd's steps) so the pieces come out much of a size; each blob to its nearest
 * seed. Only blobs `use` passes (all, if left out) place the seeds. Returns which piece each blob went to.
 */
export function cutPieces(centers: ArrayLike<number>, count: number, n: number, steps = 4, use: (i: number) => boolean = () => true): Int32Array {
  const at = (i: number): Vec3 => [centers[i * 3], centers[i * 3 + 1], centers[i * 3 + 2]]
  const d2 = (i: number, s: Vec3) => (centers[i * 3] - s[0]) ** 2 + (centers[i * 3 + 1] - s[1]) ** 2 + (centers[i * 3 + 2] - s[2]) ** 2
  let top = -1
  for (let i = 0; i < count; i++) if (use(i) && (top < 0 || centers[i * 3 + 1] > centers[top * 3 + 1])) top = i
  if (top < 0) return new Int32Array(count)
  const seeds: Vec3[] = [at(top)]
  const near = new Float32Array(count).fill(Infinity)
  while (seeds.length < n) {
    const s = seeds[seeds.length - 1]
    let far = -1, farD = 0
    for (let i = 0; i < count; i++) {
      if (!use(i)) continue
      near[i] = Math.min(near[i], d2(i, s))
      if (near[i] > farD) { farD = near[i]; far = i }
    }
    if (far < 0) break
    seeds.push(at(far))
  }
  const of = new Int32Array(count)
  const assign = () => {
    for (let i = 0; i < count; i++) {
      let best = 0, bestD = Infinity
      for (let k = 0; k < seeds.length; k++) { const d = d2(i, seeds[k]); if (d < bestD) { bestD = d; best = k } }
      of[i] = best
    }
  }
  assign()
  for (let step = 0; step < steps; step++) {
    const sum = seeds.map(() => [0, 0, 0, 0])
    for (let i = 0; i < count; i++) { if (!use(i)) continue; const s = sum[of[i]]; s[0] += centers[i * 3]; s[1] += centers[i * 3 + 1]; s[2] += centers[i * 3 + 2]; s[3]++ }
    sum.forEach((s, k) => { if (s[3]) seeds[k] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]] })
    assign()
  }
  return of
}

export function makeProp(kind: PropKind, count = 1600): PropBody {
  const bones: Bone[] = [
    { name: 'root', parent: -1, head: [0, 0, 0] },
    { name: 'body', parent: 0, head: [0, 0, 0] },
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
  const b = buildBody({ bones, parts, blend: 0.02 }, count, 61 + kind.length)
  // what the shapes put under the floor was never seen whole, so it isn't seen flying either
  for (let i = 0; i < b.blobs.count; i++) if (b.blobs.center[i * 3 + 1] < -0.01) b.blobs.opacity[i] = 0
  // cut the body into pieces: each a bone on the body at the middle of its blobs, lying as cut once it lands
  const of = cutPieces(b.blobs.center, b.blobs.count, PIECES, 4, (i) => b.blobs.opacity[i] > 0)
  const sum = Array.from({ length: PIECES }, () => [0, 0, 0, 0]), low = new Array<number>(PIECES).fill(Infinity)
  for (let i = 0; i < b.blobs.count; i++) {
    if (!b.blobs.opacity[i]) continue
    const s = sum[of[i]], c = b.blobs.center
    s[0] += c[i * 3]; s[1] += c[i * 3 + 1]; s[2] += c[i * 3 + 2]; s[3]++
    low[of[i]] = Math.min(low[of[i]], c[i * 3 + 1] - Math.max(b.blobs.scale[i * 3], b.blobs.scale[i * 3 + 1], b.blobs.scale[i * 3 + 2]))
  }
  const pieces: Piece[] = sum.map((s, k) => {
    const home: Vec3 = s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : [0, 0.3, 0]
    return { home, rest: Math.max(0.01, home[1] - (Number.isFinite(low[k]) ? low[k] : home[1])) }
  })
  const skeleton = new Skeleton([...bones, ...pieces.map((p, k): Bone => ({ name: `piece${k}`, parent: BODY, head: p.home }))])
  const skin = emptySkin(b.blobs.count)
  for (let i = 0; i < b.blobs.count; i++) setWeights(skin, i, [[PIECE0 + of[i], 1]])
  return { blobs: b.blobs, skin, skeleton, pieces }
}

/**
 * When piece i of a broken prop lands, and how far it has gone from where it was cut: it flies on the way the blow
 * went, spread to the sides, and comes down with its bone `rest` above the floor.
 */
export function pieceFlight(piece: Piece, i: number, dx: number, dz: number, t: number): { at: Vec3; landed: boolean; spin: number } {
  const h = piece.home, rest = piece.rest
  // its own way out from the middle, leaning toward the blow's way
  const l = Math.hypot(h[0], h[2]) || 1
  const sp = 0.9 + ((i * 0.618) % 1) * 1.6, vy = 1.2 + ((i * 0.381) % 1) * 2.2, g = 9.8
  const vx = (h[0] / l) * sp + dx * 1.6, vz = (h[2] / l) * sp + dz * 1.6
  const land = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * g * (h[1] - rest)))) / g
  const tt = Math.min(t, land)
  return { at: [vx * tt, vy * tt - 0.5 * g * tt * tt, vz * tt], landed: t >= land, spin: (land - tt) * (7 + (i % 4) * 3) }
}

/** Poses a prop from the game's state of it. */
export function poseProp(prop: PropBody, p: Prop) {
  const sk = prop.skeleton
  sk.reset()
  sk.place.set([p.x, 0, p.z])
  // each stands turned its own way
  sk.setRotation(0, axisAngle([0, 1, 0], p.slot * 1.7))
  if (p.phase === 'whole') {
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
    const a = -p.slot * 1.7, c = Math.cos(a), s = Math.sin(a)
    const lx = p.dx * c + p.dz * s, lz = -p.dx * s + p.dz * c
    for (let i = 0; i < PIECES; i++) {
      const f = pieceFlight(prop.pieces[i], i, lx, lz, p.t)
      sk.offset.set(f.at, (PIECE0 + i) * 3)
      // tumbling in the air, then lying as it was cut, turned its own way about the upright
      const yaw = axisAngle([0, 1, 0], i * 2.4 * Math.min(1, p.t * 3))
      sk.setRotation(PIECE0 + i, f.landed ? yaw : mulQ(yaw, axisAngle([Math.cos(i), 0, Math.sin(i)], f.spin)))
    }
  }
  sk.update()
}
