import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PlacedPoser, compileProject, placer, type SceneProject } from '../../splat-engine/project.ts'
import { Skeleton } from '../../splat-engine/rig.ts'
import { added } from './adding.ts'
import { colorsOf, cut } from './cut.ts'
import { LIBRARY, creatureMove, creatureSize, isCreature, libraryCreature, libraryProp, openLand } from './library.ts'

const project = (): SceneProject => openLand('plain-turf')!

test('every creature can be set down in a project, which compiles with it', () => {
  const ids = LIBRARY.filter((e) => e.kind === 'creature').map((e) => e.id)
  assert.ok(ids.includes('creature-fox') && ids.includes('creature-elf'))
  let p = project()
  for (const id of ids) {
    assert.ok(isCreature(id) && libraryProp(id), id)
    assert.ok(creatureSize(id) > 0 && creatureSize(id) <= 1, id)
    p = added(p, id, [0, 0, 0], creatureSize(id))
  }
  const cp = compileProject(p, libraryProp)
  assert.equal(cp.props.length, ids.length)
  assert.ok(cp.props.every((x) => x.c.lights(0).length === 0))
  assert.ok(!isCreature('giant-turkey') && !isCreature({ name: 'x', foot: [0, 0, 0], doc: libraryProp('giant-turkey')!.doc }))
})

test('a creature is made where it is placed: turned, sized and standing on its foot', () => {
  const at: [number, number, number] = [0.6, 0.1, -0.4]
  const p = { ...project(), props: [{ prop: 'creature-frog', at, turn: 90, size: 0.5 }] }
  const b = cut({ kind: 'prop', project: p, i: 0, spacing: 0.042 })
  const n = b.blobs.count - 1 // the stand-in shadow is last
  let low = Infinity, sx = 0, sz = 0
  for (let i = 0; i < n; i++) { low = Math.min(low, b.blobs.center[i * 3 + 1]); sx += b.blobs.center[i * 3]; sz += b.blobs.center[i * 3 + 2] }
  assert.ok(Math.abs(low - at[1]) < 0.05, `lowest ${low}`)
  assert.ok(Math.hypot(sx / n - at[0], sz / n - at[2]) < 0.15, 'centered over its spot')
  // its bones moved with it
  const frog = libraryCreature('creature-frog')!.make(libraryCreature('creature-frog')!.detail[0], 'green')
  const t = placer([0, 0, 0], { at, turn: 90, size: 0.5 })
  const want = t.point(frog.skeleton.bones[1].head), got = b.skeleton.bones[1].head
  assert.ok(Math.hypot(want[0] - got[0], want[1] - got[1], want[2] - got[2]) < 1e-5)
  // and it brings its own colors for pixel art
  const colors = colorsOf(b)
  assert.ok(colors.length >= 3 && colors.every((c) => /^#[0-9a-f]{6}$/.test(c)))
})

test('a creature plays a move on the spot, a whole number of times a loop, turned as it is placed', () => {
  const move = creatureMove('creature-fox', 12)!
  assert.equal(move.name, 'idle')
  const c = libraryCreature('creature-fox')!
  const sk = new Skeleton(c.make(c.detail[0], c.looks[0].id).skeleton.bones)
  const at0 = () => { move.pose(sk, 0); return Array.from(sk.rotation) }
  const a = at0()
  move.pose(sk, 12)
  assert.deepEqual(Array.from(sk.rotation).map((v) => v.toFixed(5)), a.map((v) => v.toFixed(5)), 'joins up at the loop')
  // posed through PlacedPoser as any prop is
  const poser = new PlacedPoser({ bones: sk.bones, pose: move.pose, lights: () => [] }, [0, 0, 0], { at: [0, 0, 0], turn: 90, size: 1 })
  const out = new Skeleton(sk.bones)
  poser.pose(out, 1.3)
  assert.ok(Array.from(out.rotation).some((v, i) => i % 4 !== 3 && Math.abs(v) > 1e-4), 'it moves')
})
