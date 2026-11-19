import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PlacedPoser, compileProject, placer, propSpec, type Placement } from '../../splat-engine/project.ts'
import { Skeleton } from '../../splat-engine/rig.ts'
import type { Shape } from '../../splat-engine/voxel.ts'
import { arrowWay, begin, copied, did, moved, onGround, redo, redrawn, removed, sized, stilled, turned, undo, wrapTurn } from './arrange.ts'
import { libraryProp } from './library.ts'
import { openingScene } from './shown.ts'

const windmill = () => {
  const o = openingScene('windmill')!
  assert.ok(o.kind === 'project')
  return o.project
}

test('edits give a new project and leave the old one as it was', () => {
  const p = windmill()
  const n = p.props.length
  const a = moved(p, 0, [1, 0.2, -0.5])
  assert.deepEqual(a.props[0].at, [1, 0.2, -0.5])
  assert.notDeepEqual(p.props[0].at, [1, 0.2, -0.5])
  assert.equal(turned(p, 1, 200).props[1].turn, -160)
  assert.equal(sized(p, 1, 50).props[1].size, 10)
  assert.equal(stilled(p, 2, true).props[2].still, true)
  assert.equal(stilled(p, 2, false).props[2].still, undefined)
  const c = copied(p, 3, [0.2, 0, 0])
  assert.equal(c.props.length, n + 1)
  assert.equal(c.props[n].prop, p.props[3].prop)
  assert.equal(c.props[n].at[0], Math.round((p.props[3].at[0] + 0.2) * 1e4) / 1e4)
  assert.equal(removed(p, 0).props.length, n - 1)
  assert.equal(removed(p, 0).props[0], p.props[1])
  assert.equal(wrapTurn(-190), 170)
  assert.equal(wrapTurn(180), -180)
})

test('undo and redo walk the copies, and a new edit drops what was undone', () => {
  let h = begin(1)
  h = did(h, 2); h = did(h, 3)
  assert.equal(did(h, h.now), h)
  h = undo(h)
  assert.equal(h.now, 2)
  h = redo(h)
  assert.equal(h.now, 3)
  h = undo(undo(h))
  assert.equal(h.now, 1)
  assert.equal(undo(h), h)
  h = did(h, 9)
  assert.deepEqual([h.past, h.now, h.future], [[1], 9, []])
})

test('a prop cut in one place and drawn in another stands just as one cut there', () => {
  const p = windmill()
  const cp = compileProject(p, libraryProp)
  const i = 0
  const { c, prop } = cp.props[i]
  const from: Placement = p.props[i]
  const to: Placement = { at: [from.at[0] + 0.4, from.at[1] + 0.1, from.at[2] - 0.3], turn: from.turn + 70, size: from.size * 1.3 }
  const specA = propSpec(cp, i, 0.05)
  const specB = propSpec(compileProject({ ...p, props: p.props.map((x, k) => (k === i ? { ...x, ...to } : x)) }, libraryProp), i, 0.05)
  const a = new Skeleton(specA.bones), b = new Skeleton(specB.bones)
  const t = 2.3
  new PlacedPoser(c, prop.foot, from).pose(a, t)
  redrawn(a, from, to)
  a.update()
  new PlacedPoser(c, prop.foot, to).pose(b, t)
  b.update()
  const pa = placer(prop.foot, from), pb = placer(prop.foot, to)
  // a point of the description, through each bone of each skeleton: rest where it was cut, then skinned
  const skin = (sk: Skeleton, j: number, x: number[]) => {
    const m = sk.matrix.subarray(j * 16, j * 16 + 16)
    return [0, 1, 2].map((r) => m[r] * x[0] + m[4 + r] * x[1] + m[8 + r] * x[2] + m[12 + r])
  }
  for (let j = 0; j < a.count; j++) {
    for (const x of [prop.foot, [prop.foot[0] + 0.2, prop.foot[1] + 0.5, prop.foot[2] - 0.1]]) {
      const ya = skin(a, j, pa.point(x)), yb = skin(b, j, pb.point(x))
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(ya[k] - yb[k]) < 1e-4, `bone ${a.bones[j].name}: ${ya} vs ${yb}`)
    }
  }
})

test('the ground under a line: the first surface it meets, or the level it was at', () => {
  const ball: Shape = { sdf: (x, y, z) => Math.hypot(x, y + 1, z) - 1, min: [-1, -2, -1], max: [1, 0, 1] }
  const hit = onGround([ball], [0, 5, 0], [0, -1, 0], 0)!
  assert.ok(Math.abs(hit[1]) < 0.01)
  const over = onGround([ball], [5, 1, 0], [0, -1, 0], 0.5)!
  assert.deepEqual(over, [5, 0.5, 0])
  assert.equal(onGround([ball], [5, 1, 0], [0, 1, 0], 0.5), undefined)
})

test('arrow keys move as the view looks', () => {
  const o = { target: [0, 0, 0] as [number, number, number], distance: 3, azimuth: 0, elevation: 20 }
  // seen from +z, up goes toward -z and right toward +x
  assert.deepEqual(arrowWay('ArrowUp', o)!.map((v) => Math.round(v) + 0), [0, -1])
  assert.deepEqual(arrowWay('ArrowRight', o)!.map((v) => Math.round(v) + 0), [1, 0])
  assert.deepEqual(arrowWay('ArrowLeft', { ...o, azimuth: 90 })!.map((v) => Math.round(v) + 0), [0, 1])
  assert.equal(arrowWay('a', o), undefined)
})
