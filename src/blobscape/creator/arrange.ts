import type { Vec3 } from '../../splat-core/blobs.ts'
import type { Orbit } from '../../splat-core/orbit.ts'
import { SIZE_RANGE, MAX_PROPS, type Placement, type SceneProject } from '../../splat-engine/project.ts'
import { axisAngle, mulQ, rotate, type Skeleton } from '../../splat-engine/rig.ts'
import type { Shape } from '../../splat-engine/voxel.ts'

/**
 * Arranging a project's props (Scene Creator's Arrange mode, #336), pure so it is tested: edits that each give a new
 * project (so undo is a stack of copies), and how a prop cut in one place is drawn in another while it is dragged,
 * turned or sized, before it is cut again where it ends up.
 */

// --- Edits -----------------------------------------------------------------

const withProp = (p: SceneProject, i: number, change: Partial<SceneProject['props'][number]>): SceneProject => ({
  ...p,
  props: p.props.map((x, k) => (k === i ? { ...x, ...change } : x)),
})

/** Prop `i` stood at `at`. */
export const moved = (p: SceneProject, i: number, at: Vec3): SceneProject => withProp(p, i, { at: [round(at[0]), round(at[1]), round(at[2])] })

/** Prop `i` turned to `turn` degrees, kept within -180 to 180. */
export const turned = (p: SceneProject, i: number, turn: number): SceneProject => withProp(p, i, { turn: round(wrapTurn(turn), 10) })

/** Prop `i` sized, within the sizes a prop may take. */
export const sized = (p: SceneProject, i: number, size: number): SceneProject => withProp(p, i, { size: round(Math.min(SIZE_RANGE[1], Math.max(SIZE_RANGE[0], size)), 1000) })

/** Prop `i` holding still, or playing its own moves again. */
export const stilled = (p: SceneProject, i: number, still: boolean): SceneProject => withProp(p, i, { still: still || undefined })

/** Prop `i`'s lamps: always lit, waiting for the dark, or (nothing) as the scene they stand in says. */
export const lamped = (p: SceneProject, i: number, lit: 'dark' | 'always' | undefined): SceneProject => withProp(p, i, { lit })

/** Prop `i` gone. */
export const removed = (p: SceneProject, i: number): SceneProject => ({ ...p, props: p.props.filter((_, k) => k !== i) })

/** A copy of prop `i` set down `by` beside it, last in the list; the project as it was when it holds as many props as it may. */
export const copied = (p: SceneProject, i: number, by: Vec3): SceneProject => {
  if (p.props.length >= MAX_PROPS) return p
  const x = p.props[i]
  return { ...p, props: [...p.props, { ...x, at: [round(x.at[0] + by[0]), round(x.at[1] + by[1]), round(x.at[2] + by[2])] }] }
}

/** Degrees within -180 to 180. */
export const wrapTurn = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180

const round = (v: number, k = 10000) => Math.round(v * k) / k

// --- Undo ------------------------------------------------------------------

/** What can be undone and redone, and what is now. */
export interface History<T> { past: T[]; now: T; future: T[] }

/** The most steps kept to undo. */
export const MOST_UNDO = 100

export const begin = <T>(now: T): History<T> => ({ past: [], now, future: [] })

/** A new now; what was undone can't be redone after it. The same value twice is not a step. */
export const did = <T>(h: History<T>, next: T): History<T> => (next === h.now ? h : { past: [...h.past, h.now].slice(-MOST_UNDO), now: next, future: [] })

export const undo = <T>(h: History<T>): History<T> => (h.past.length ? { past: h.past.slice(0, -1), now: h.past[h.past.length - 1], future: [h.now, ...h.future] } : h)

export const redo = <T>(h: History<T>): History<T> => (h.future.length ? { past: [...h.past, h.now], now: h.future[0], future: h.future.slice(1) } : h)

// --- Drawn somewhere else than it was cut ----------------------------------

const DEG = Math.PI / 180

/**
 * A prop cut where `from` put it, drawn where `to` puts it: every root bone of its posed skeleton is turned, sized and
 * moved as the whole prop is, about the foot. Its own pose (written for `from`) stays as it is underneath, so a
 * windmill's sails go on turning about its axle while it is dragged round. Call after posing and before `sk.update()`.
 */
export function redrawn(sk: Skeleton, from: Placement, to: Placement) {
  const dt = to.turn - from.turn, k = to.size / from.size
  if (dt === 0 && k === 1 && to.at[0] === from.at[0] && to.at[1] === from.at[1] && to.at[2] === from.at[2]) return
  const q = axisAngle([0, 1, 0], dt * DEG)
  for (let i = 0; i < sk.count; i++) {
    const b = sk.bones[i]
    if (b.parent >= 0) continue
    const o = sk.offset.subarray(i * 3, i * 3 + 3)
    const was: Vec3 = [b.head[0] + o[0] - from.at[0], b.head[1] + o[1] - from.at[1], b.head[2] + o[2] - from.at[2]]
    const r = rotate(q, was)
    o.set([to.at[0] + k * r[0] - b.head[0], to.at[1] + k * r[1] - b.head[1], to.at[2] + k * r[2] - b.head[2]])
    sk.setRotation(i, mulQ(q, sk.rotation.subarray(i * 4, i * 4 + 4)))
    sk.size[i] *= k
  }
}

// --- Ground and keys -------------------------------------------------------

/**
 * Where a line from `origin` along `dir` first meets the ground's shapes, or where it meets the level `y` when it
 * meets none (a line that passes over the land's edge still slides the prop along).
 */
export function onGround(shapes: Shape[], origin: Vec3, dir: Vec3, y: number): Vec3 | undefined {
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1
  const d: Vec3 = [dir[0] / len, dir[1] / len, dir[2] / len]
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const s of shapes) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], s.min[i]); hi[i] = Math.max(hi[i], s.max[i]) }
  // into the box round the ground, then step by the nearest distance
  let t0 = 0, t1 = Infinity
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (origin[i] < lo[i] || origin[i] > hi[i]) { t1 = -1; break } continue }
    const a = (lo[i] - origin[i]) / d[i], b = (hi[i] - origin[i]) / d[i]
    t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b))
  }
  if (t1 >= t0 && shapes.length) {
    const at = (p: Vec3) => {
      let best = Infinity
      for (const s of shapes) {
        if (p[0] < s.min[0] - 0.05 || p[0] > s.max[0] + 0.05 || p[1] < s.min[1] - 0.05 || p[1] > s.max[1] + 0.05 || p[2] < s.min[2] - 0.05 || p[2] > s.max[2] + 0.05) continue
        best = Math.min(best, s.sdf(p[0], p[1], p[2]))
      }
      return best
    }
    let t = t0
    for (let k = 0; k < 300 && t <= t1; k++) {
      const p: Vec3 = [origin[0] + d[0] * t, origin[1] + d[1] * t, origin[2] + d[2] * t]
      const dist = at(p)
      if (dist < 0.002) return p
      t += Number.isFinite(dist) ? Math.max(dist, 0.002) : 0.02
    }
  }
  if (Math.abs(d[1]) < 1e-6) return
  const t = (y - origin[1]) / d[1]
  return t > 0 ? [origin[0] + d[0] * t, y, origin[2] + d[2] * t] : undefined
}

/** How far an arrow key moves a prop: a share of how far away the view is, so a step looks the same at any zoom. */
export const stepFor = (o: Orbit, small: boolean) => o.distance * (small ? 0.01 : 0.05)

/** Which way an arrow key moves a prop on the ground, as the view looks: up is away, right is right. */
export function arrowWay(key: string, o: Orbit): [number, number] | undefined {
  const az = o.azimuth * DEG
  const away: [number, number] = [-Math.sin(az), -Math.cos(az)], right: [number, number] = [Math.cos(az), -Math.sin(az)]
  switch (key) {
    case 'ArrowUp': return away
    case 'ArrowDown': return [-away[0], -away[1]]
    case 'ArrowRight': return right
    case 'ArrowLeft': return [-right[0], -right[1]]
  }
}
