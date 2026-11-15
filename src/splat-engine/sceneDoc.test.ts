import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkScene, compileScene, type SceneDoc } from './sceneDoc.ts'
import { buildVoxels } from './voxel.ts'
import { Skeleton } from './rig.ts'

const sound = (): SceneDoc => ({
  name: 'Test',
  loop: 8,
  palette: ['#101018', '#3f7a45', '#f4f1e4', '#ffd166'],
  sky: ['#101018', '#3f7a45'],
  camera: { target: [0, 0.5, 0], distance: 4, azimuth: 20, elevation: 10 },
  bones: [{ name: 'arm', at: [0, 0.5, 0] }, { name: 'hand', at: [0.3, 0.5, 0], parent: 'arm' }, { name: 'puff', at: [0, 1, 0] }],
  parts: [
    { shape: { kind: 'cylinder', at: [0, -0.2, 0], height: 0.2, r: 1 }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.3, colours: ['#3f7a45', '#101018'] }, side: '#101018' } },
    { shape: { kind: 'box', at: [0.15, 0.5, 0], half: [0.15, 0.03, 0.03] }, paint: { kind: 'bricks', size: [0.1, 0.05], colours: ['#f4f1e4'], line: '#101018' }, bone: 'arm' },
    { shape: { kind: 'sphere', at: [0.3, 0.5, 0], r: 0.005 }, paint: '#ffd166', bone: 'hand', glow: true },
    { shape: { kind: 'rough', shape: { kind: 'join', shapes: [{ kind: 'ball', at: [0, 1, 0], r: [0.1, 0.05, 0.1] }, { kind: 'cone', from: [0, 1, 0], to: [0.1, 1.1, 0], r: 0.04 }] }, by: 0.01 }, paint: { kind: 'split', axis: 'y', at: 1, below: '#101018', above: { kind: 'speckle', size: 0.05, colours: ['#f4f1e4', '#ffd166'] } }, bone: 'puff', noShadow: true },
    { shape: { kind: 'cut', shape: { kind: 'roof', at: [-0.5, 0, 0], half: [0.2, 0.2], height: 0.3 }, hole: { kind: 'ring', at: [-0.5, 0.1, 0], r: 0.1, tube: 0.03 } }, paint: { kind: 'faces', top: { kind: 'bands', axis: 'x', size: 0.05, colours: ['#f4f1e4', '#ffd166'] }, side: { kind: 'hex', size: 0.1, colours: ['#f4f1e4', '#ffd166'], line: '#101018', deep: '#3f7a45' } } },
  ],
  moves: [
    { kind: 'spin', bone: 'arm', axis: 'y', times: 2 },
    { kind: 'sway', bone: 'hand', axis: 'z', degrees: 30, times: 5, phase: 0.2 },
    { kind: 'bob', bone: 'hand', by: [0, 0.1, 0], times: 3 },
    { kind: 'drift', bone: 'puff', by: [0.1, 0.5, 0], times: 2, grow: [0.5, 2] },
    { kind: 'pulse', bone: 'puff', size: [0.8, 1.2], times: 7 },
  ],
  lights: [{ at: [0, 0.3, 0], colour: '#ffd166', strength: 2, range: 0.8, flicker: { by: 0.3, times: 9 }, circle: { r: 0.5, times: 1 } }],
})

test('a sound description has nothing wrong with it', () => {
  assert.deepEqual(checkScene(sound()), [])
})

test('checkScene points at each mistake', () => {
  const cases: [string, (d: any) => void, RegExp][] = [
    ['a bad colour', (d) => { d.palette[1] = 'green' }, /^palette\[1\]: must be a colour/],
    ['too many colours', (d) => { d.palette = Array.from({ length: 33 }, () => '#000000') }, /^palette: must be 2 to 32 colours/],
    ['an unknown shape', (d) => { d.parts[1].shape.kind = 'pyramid' }, /^parts\[1\]\.shape\.kind: 'pyramid' is not a shape/],
    ['a shape missing a size', (d) => { delete d.parts[2].shape.r }, /^parts\[2\]\.shape\.r: must be a number/],
    ['a nested shape', (d) => { d.parts[3].shape.shape.shapes[1].to = [0, 1] }, /^parts\[3\]\.shape\.shape\.shapes\[1\]\.to: must be 3 numbers/],
    ['an unknown paint', (d) => { d.parts[0].paint.top.kind = 'marble' }, /^parts\[0\]\.paint\.top\.kind: 'marble' is not a paint/],
    ['a part on no bone', (d) => { d.parts[1].bone = 'leg' }, /^parts\[1\]\.bone: 'leg' is not one of the bones/],
    ['a parent named later', (d) => { d.bones[0].parent = 'hand' }, /^bones\[0\]\.parent: 'hand' is not a bone named earlier/],
    ['a bone named twice', (d) => { d.bones[2].name = 'arm' }, /^bones\[2\]\.name: 'arm' is used twice/],
    ['a move that would not loop', (d) => { d.moves[0].times = 1.5 }, /^moves\[0\]\.times: must be a whole number/],
    ['an unknown move', (d) => { d.moves[1].kind = 'wiggle' }, /^moves\[1\]\.kind: 'wiggle' is not a move/],
    ['a light too strong', (d) => { d.lights[0].strength = 50 }, /^lights\[0\]\.strength: must be from 0 to 8/],
    ['a far-off part', (d) => { d.parts[0].shape.at = [0, 0, 40] }, /^parts\[0\]\.shape\.at\[2\]: must be from -4 to 4/],
    ['a part too big to build', (d) => { d.parts[0].shape = { kind: 'box', at: [0, 0, 0], half: [3, 3, 3] } }, /^parts\[0\]\.shape: is too big/],
    ['too much surface in all', (d) => { for (let i = 0; i < 12; i++) d.parts.push({ shape: { kind: 'box', at: [0, 0, 0], half: [1.2, 1.2, 1.2] }, paint: '#101018' }) }, /^parts: have too much surface/],
    ['too many moves on a bone', (d) => { for (let i = 0; i < 8; i++) d.moves.push({ kind: 'pulse', bone: 'puff', size: [4, 4], times: 1 }) }, /'puff' has more than 6 moves/],
    ['a kind that is not text', (d) => { d.parts[1].shape.kind = { toString: 1 } }, /^parts\[1\]\.shape\.kind: a object is not a shape/],
    ['a bone that is not text', (d) => { d.parts[1].bone = { toString: 1 }; d.moves[0].bone = [1]; d.bones[1].parent = { valueOf: 1 } }, /^parts\[1\]\.bone: a object is not one of the bones/],
    ['no camera', (d) => { delete d.camera }, /^camera: must be an object/],
  ]
  for (const [what, spoil, want] of cases) {
    const d = sound()
    spoil(d)
    const errs = checkScene(d)
    assert.ok(errs.some((e) => want.test(e)), `${what}: ${JSON.stringify(errs)}`)
  }
  assert.deepEqual(checkScene(null), ['scene: must be an object'])
  assert.deepEqual(checkScene('a windmill'), ['scene: must be an object'])
  // a hopeless one stops listing after a while
  assert.ok(checkScene({ parts: Array.from({ length: 200 }, () => ({})) }).length <= 40)
})

test('compileScene refuses an unsound description, saying why', () => {
  const d = sound()
  d.moves![0].times = 0
  assert.throws(() => compileScene(d), /Scene "Test" has 1 mistake: moves\[0\]\.times/)
})

test('a compiled scene builds with every part, however small, at any detail', () => {
  const c = compileScene(sound())
  for (const spacing of [0.05, 0.03, 0.02]) {
    const b = buildVoxels(c.spec(spacing))
    assert.equal(new Set(b.partOf).size, 5, `spacing ${spacing}`)
  }
  // a hole that swallows its shape leaves a part with nothing: the check can't see it, the build can
  const hollow = sound()
  hollow.parts[2] = { shape: { kind: 'cut', shape: { kind: 'sphere', at: [0, 0.5, 0], r: 0.1 }, hole: { kind: 'sphere', at: [0, 0.5, 0], r: 0.3 } }, paint: '#ffd166' }
  assert.deepEqual(checkScene(hollow), [])
  const h = compileScene(hollow)
  assert.deepEqual(h.empty(buildVoxels(h.spec(0.03))), [2])
  assert.deepEqual(c.empty(buildVoxels(c.spec(0.03))), [])
  assert.equal(c.bones.length, 4)
  assert.equal(c.bones[2].parent, 1)
  assert.equal(c.look.palette.length, 4)
  assert.deepEqual(c.look.outline, [16, 16, 24])
  assert.deepEqual(c.look.sky, [[16, 16, 24], [63, 122, 69]])
})

test('a compiled scene loops: bones and lights after one loop are where they began, and they move in between', () => {
  const c = compileScene(sound())
  const sk = new Skeleton(c.bones)
  c.pose(sk, 1.7)
  const a = Float32Array.from(sk.matrix), la = c.lights(1.7)
  c.pose(sk, 1.7 + c.loop)
  for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - sk.matrix[i]) < 1e-4, `matrix ${i}`)
  const lb = c.lights(1.7 + c.loop)
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(la[0].position[i] - lb[0].position[i]) < 1e-6)
    assert.ok(Math.abs(la[0].colour[i] - lb[0].colour[i]) < 1e-6)
  }
  c.pose(sk, 2.6)
  for (const name of ['arm', 'hand', 'puff']) {
    const b = sk.index(name)
    let moved = 0
    for (let k = 0; k < 16; k++) moved += Math.abs(a[b * 16 + k] - sk.matrix[b * 16 + k])
    assert.ok(moved > 1e-3, `${name} did not move`)
  }
  for (let k = 0; k < 16; k++) assert.equal(a[k], sk.matrix[k])
  assert.notDeepEqual(c.lights(2.6)[0].position, la[0].position)
})
