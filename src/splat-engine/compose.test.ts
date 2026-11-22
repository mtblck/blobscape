import { test } from 'node:test'
import assert from 'node:assert/strict'
import { composeScene } from './compose.ts'
import { PlacedPoser, compileProject, placer, type PropDoc, type SceneProject } from './project.ts'
import { checkScene, compileScene, type SceneDoc } from './sceneDoc.ts'
import { buildVoxels } from './voxel.ts'
import { Skeleton } from './rig.ts'

const SPACING = 0.05

const LAND: PropDoc = {
  name: 'Lawn', foot: [0, 0, 0],
  doc: {
    name: 'Lawn', loop: 12, palette: ['#203020', '#80a060', '#c0c0c0', '#604020'], camera: { target: [0, 0.3, 0], distance: 3, azimuth: 0, elevation: 20 },
    parts: [{ shape: { kind: 'cylinder', at: [0, -0.2, 0], height: 0.2, r: 1.2 }, paint: '#80a060' }],
  },
}

/** A post with an arm that swings about x, a light at its top, and a paint that changes with height (so a placed part must read it where it was written). */
const POST: PropDoc = {
  name: 'Post', foot: [0, 0, 0],
  doc: {
    name: 'Post', loop: 6, palette: ['#604020', '#c0c0c0', '#ffd27a'], camera: { target: [0, 0.3, 0], distance: 2, azimuth: 0, elevation: 10 },
    bones: [{ name: 'arm', at: [0, 0.5, 0] }],
    parts: [
      { shape: { kind: 'box', at: [0, 0.3, 0], half: [0.04, 0.3, 0.04] }, paint: { kind: 'split', axis: 'y', at: 0.3, below: '#604020', above: '#c0c0c0' } },
      { shape: { kind: 'box', at: [0.15, 0.5, 0], half: [0.15, 0.03, 0.03] }, paint: '#c0c0c0', bone: 'arm' },
    ],
    moves: [{ kind: 'sway', bone: 'arm', axis: 'x', degrees: 20, times: 1 }, { kind: 'bob', bone: 'arm', by: [0.05, 0, 0], times: 2 }],
    lights: [{ at: [0, 0.62, 0], color: '#ffd27a', strength: 1, range: 0.5, lit: 'dark' }],
  },
}

const find = (id: string) => ({ lawn: LAND, post: POST } as Record<string, PropDoc>)[id]
const project = (props: SceneProject['props']): SceneProject => ({ kind: 'blobscape-project', version: 1, name: 'Yard', loop: 12, land: 'lawn', props })
const blobsOf = (doc: SceneDoc) => buildVoxels(compileScene(doc, { puffs: false }).spec(SPACING))

test('a scene made from props is one sound description: the land, then each prop set down, its bones apart from every other', () => {
  const doc = composeScene(project([{ prop: 'post', at: [0.5, 0, 0], turn: 0, size: 1 }, { prop: 'post', at: [-0.5, 0, 0], turn: 0, size: 1 }]), find)
  assert.deepEqual(checkScene(doc), [])
  assert.equal(doc.parts.length, 1 + 2 * POST.doc.parts.length)
  assert.equal(new Set(doc.bones!.map((b) => b.name)).size, 2)
  assert.equal(doc.lights!.length, 2)
  assert.equal(doc.loop, 12)
  // the post's move fitted to the scene's loop, as a prop in Scene Creator is
  assert.equal(doc.moves![0].times, 2)
})

test('a prop set down turned and sized is cut where it stands, its paint read where it was written', () => {
  const pl = { at: [0.3, 0, 0.2] as [number, number, number], turn: 90, size: 1.5 }
  const doc = composeScene(project([{ prop: 'post', ...pl }]), find)
  const built = blobsOf(doc)
  const t = placer(POST.foot, pl)
  // every blob of the post, taken back to where it was written, lies on the post as written, colored as written there
  let n = 0
  for (let i = 0; i < built.blobs.count; i++) {
    if (built.partOf[i] === 0) continue
    n++
    const back = t.back([built.blobs.center[i * 3], built.blobs.center[i * 3 + 1], built.blobs.center[i * 3 + 2]])
    assert.ok(back[1] > -0.05 && back[1] < 0.66 && Math.abs(back[2]) < 0.1 && back[0] > -0.1 && back[0] < 0.35, `blob ${i} back at ${back.map((v) => v.toFixed(2))}`)
  }
  assert.ok(n > 20)
  // the light went with it, and as far as the post grew
  assert.deepEqual(doc.lights![0].at.map((v) => +v.toFixed(6)), t.point([0, 0.62, 0]).map((v) => +v.toFixed(6)))
  assert.equal(doc.lights![0].range, 0.75)
})

test('a placed prop moves just as Scene Creator moves it: the same turn of every bone at every moment', () => {
  for (const turn of [0, 90, 37, 180, -120]) {
    const pl = { at: [0.2, 0, -0.1] as [number, number, number], turn, size: 1.2, phase: 0.3 }
    const doc = composeScene(project([{ prop: 'post', ...pl }]), find)
    const whole = compileScene(doc, { puffs: false })
    const own = compileScene({ ...POST.doc, loop: 12, moves: POST.doc.moves!.map((m) => ({ ...m, times: m.times * 2 })) }, { puffs: false })
    const poser = new PlacedPoser(own, POST.foot, pl)
    const a = new Skeleton(whole.bones), b = new Skeleton(own.bones)
    for (const t of [0, 1.3, 4.1, 7.7]) {
      whole.pose(a, t)
      poser.pose(b, t)
      const ia = a.index('post0/arm'), ib = b.index('arm')
      for (let k = 0; k < 4; k++) assert.ok(Math.abs(Math.abs(a.rotation[ia * 4 + k]) - Math.abs(b.rotation[ib * 4 + k])) < 1e-4, `turn ${turn} at ${t}: rotation ${k}`)
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(a.offset[ia * 3 + k] - b.offset[ib * 3 + k]) < 1e-4, `turn ${turn} at ${t}: offset ${k}`)
    }
  }
})

test('a prop is named, not copied: a change to it reaches the scene that sets it down', () => {
  const brighter: PropDoc = { ...POST, doc: { ...POST.doc, lights: [{ ...POST.doc.lights![0], strength: 3 }] } }
  const before = composeScene(project([{ prop: 'post', at: [0, 0, 0], turn: 0, size: 1 }]), find)
  const after = composeScene(project([{ prop: 'post', at: [0, 0, 0], turn: 0, size: 1 }]), (id) => (id === 'post' ? brighter : find(id)))
  assert.equal(before.lights![0].strength, 1)
  assert.equal(after.lights![0].strength, 3)
})

test("a prop set down to keep its lamps lit always has them so, whatever the time of day; a missing prop is said by name", () => {
  const doc = composeScene(project([{ prop: 'post', at: [0, 0, 0], turn: 0, size: 1, lit: 'always' }]), find)
  assert.equal(doc.lights![0].lit, 'always')
  assert.throws(() => composeScene(project([{ prop: 'gate', at: [0, 0, 0], turn: 0, size: 1 }]), find), /gate/)
})

test('falling leaves come down from under a leafy prop\'s crown, never from the sky, and not from a post', () => {
  const TREE: PropDoc = {
    name: 'Apple tree', foot: [0, 0, 0], tags: ['tree', 'leafy'],
    doc: {
      name: 'Apple tree', loop: 12, palette: ['#604020', '#4a8a3c'], camera: { target: [0, 0.5, 0], distance: 2, azimuth: 0, elevation: 10 },
      parts: [{ shape: { kind: 'cylinder', at: [0, 0.25, 0], height: 0.5, r: 0.05 }, paint: '#604020' }, { shape: { kind: 'sphere', at: [0, 0.8, 0], r: 0.3 }, paint: '#4a8a3c' }],
    },
  }
  const look = (id: string) => (id === 'tree' ? TREE : find(id))
  const p: SceneProject = { ...project([{ prop: 'tree', at: [0.5, 0, 0.2], turn: 90, size: 1 }, { prop: 'post', at: [-0.5, 0, 0], turn: 0, size: 1 }]), light: { weather: 'leaves' } }
  const doc = composeScene(p, look)
  assert.deepEqual(checkScene(doc), [])
  const leaves = (doc.air?.specks ?? []).filter((s) => s.kind === 'leaves')
  assert.equal(leaves.length, 1)
  const [l] = leaves
  // under the crown where the tree stands (the crown starts at 0.5), down to its foot
  assert.ok(l.to[1] <= 0.55 && l.to[1] > 0.4 && l.from[1] === 0, JSON.stringify(l))
  for (const a of [0, 2]) assert.ok(l.from[a] < [0.5, 0, 0.2][a] && l.to[a] > [0.5, 0, 0.2][a])
  // in Scene Creator the tree drops them itself, so they move with it; the land drops none
  const cp = compileProject(p, look)
  assert.ok(cp.props[0].c.bones.some((b) => b.name.startsWith('~')))
  assert.ok(!cp.props[1].c.bones.some((b) => b.name.startsWith('~')))
  assert.ok(!cp.land.c.bones.some((b) => b.name.startsWith('~speck')))
})
