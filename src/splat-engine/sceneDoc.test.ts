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
    { shape: { kind: 'cylinder', at: [0, -0.2, 0], height: 0.2, r: 1 }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.3, colors: ['#3f7a45', '#101018'] }, side: '#101018' } },
    { shape: { kind: 'box', at: [0.15, 0.5, 0], half: [0.15, 0.03, 0.03] }, paint: { kind: 'bricks', size: [0.1, 0.05], colors: ['#f4f1e4'], line: '#101018' }, bone: 'arm' },
    { shape: { kind: 'sphere', at: [0.3, 0.5, 0], r: 0.005 }, paint: '#ffd166', bone: 'hand', glow: true },
    { shape: { kind: 'rough', shape: { kind: 'join', shapes: [{ kind: 'ball', at: [0, 1, 0], r: [0.1, 0.05, 0.1] }, { kind: 'cone', from: [0, 1, 0], to: [0.1, 1.1, 0], r: 0.04 }] }, by: 0.01 }, paint: { kind: 'split', axis: 'y', at: 1, below: '#101018', above: { kind: 'speckle', size: 0.05, colors: ['#f4f1e4', '#ffd166'] } }, bone: 'puff', noShadow: true },
    { shape: { kind: 'cut', shape: { kind: 'roof', at: [-0.5, 0, 0], half: [0.2, 0.2], height: 0.3 }, hole: { kind: 'ring', at: [-0.5, 0.1, 0], r: 0.1, tube: 0.03 } }, paint: { kind: 'faces', top: { kind: 'bands', axis: 'x', size: 0.05, colors: ['#f4f1e4', '#ffd166'] }, side: { kind: 'hex', size: 0.1, colors: ['#f4f1e4', '#ffd166'], line: '#101018', deep: '#3f7a45' } } },
  ],
  moves: [
    { kind: 'spin', bone: 'arm', axis: 'y', times: 2 },
    { kind: 'sway', bone: 'hand', axis: 'z', degrees: 30, times: 5, phase: 0.2 },
    { kind: 'bob', bone: 'hand', by: [0, 0.1, 0], times: 3 },
    { kind: 'drift', bone: 'puff', by: [0.1, 0.5, 0], times: 2, grow: [0.5, 2] },
    { kind: 'pulse', bone: 'puff', size: [0.8, 1.2], times: 7 },
  ],
  lights: [{ at: [0, 0.3, 0], color: '#ffd166', strength: 2, range: 0.8, flicker: { by: 0.3, times: 9 }, circle: { r: 0.5, times: 1 } }],
})

test('a sound description has nothing wrong with it', () => {
  assert.deepEqual(checkScene(sound()), [])
})

test('checkScene points at each mistake', () => {
  const cases: [string, (d: any) => void, RegExp][] = [
    ['a bad color', (d) => { d.palette[1] = 'green' }, /^palette\[1\]: must be a color/],
    ['too many colors', (d) => { d.palette = Array.from({ length: 33 }, () => '#000000') }, /^palette: must be 2 to 32 colors/],
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
    ['discs too wide', (d) => { d.disc = 2 }, /^disc: must be from 0\.4 to 1/],
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
  assert.deepEqual(c.look.sky, [[16, 16, 24], [63, 122, 69], 1])
  // discs are the builder's default unless the scene widens them, which only widens them
  const one = (d: number | undefined) => { const b = buildVoxels(compileScene({ ...sound(), disc: d }).spec(0.03)); return [b.blobs.count, b.blobs.scale[0]] }
  assert.equal(c.spec(0.03).disc, undefined)
  const [n, narrow] = one(undefined), [m, wide] = one(0.75)
  assert.equal(m, n)
  assert.ok(Math.abs(wide / narrow - 0.75 / 0.55) < 1e-6)
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
    assert.ok(Math.abs(la[0].color[i] - lb[0].color[i]) < 1e-6)
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

test('air: mistakes are pointed at, and a sound one builds specks that loop and mist that stays faint', () => {
  const bad: [string, (d: any) => void, RegExp][] = [
    ['an unknown speck', (d) => { d.air.specks[0].kind = 'hail' }, /^air\.specks\[0\]\.kind: 'hail' is not a kind of speck/],
    ['too many specks', (d) => { d.air.specks[0].count = 400 }, /^air\.specks\[0\]\.count: must be from 1 to 300/],
    ['a haze that ends before it starts', (d) => { d.air.haze.to = -1 }, /^air\.haze\.to: must be past from/],
    ['a mist with no color', (d) => { delete d.air.mist[0].color }, /^air\.mist\[0\]\.color: must be a color/],
    ['a bad grime', (d) => { d.parts[0].grime = 'moss' }, /^parts\[0\]\.grime: must be a color/],
    ['a ramp past 1', (d) => { d.light = { ramp: 2 } }, /^light\.ramp: must be from 0 to 1/],
    ['an unknown cover', (d) => { d.cover = { kind: 'ash', color: '#ffffff', amount: 0.5 } }, /^cover\.kind: must be one of 'snow'/],
    ['too much cover', (d) => { d.cover = { kind: 'snow', color: '#ffffff', amount: 2 } }, /^cover\.amount: must be from 0 to 1/],
    ['a bare that is not true or false', (d) => { d.parts[0].bare = 'yes' }, /^parts\[0\]\.bare: must be true or false/],
  ]
  const withAir = () => {
    const d: any = sound()
    d.air = {
      haze: { color: '#101018', from: 0.5, to: 5 },
      mist: [{ at: [0, 0.1, 0], half: [1, 0.08, 1], color: '#8090a0' }],
      shafts: [{ from: [0, 2, 0], to: [0, 0, 0.5], r: 0.2, color: '#ffe0a0' }],
      specks: [{ kind: 'rain', count: 20, from: [-1, 0, -1], to: [1, 2, 1], colors: ['#a0c0d0'] }, { kind: 'fireflies', count: 10, from: [-1, 0.2, -1], to: [1, 1, 1], colors: ['#ffe080'] }],
    }
    return d
  }
  assert.deepEqual(checkScene(withAir()), [])
  assert.deepEqual(checkScene({ ...withAir(), cover: { kind: 'moss', color: '#4a6a2a', amount: 0.4 } }), [])
  assert.equal(compileScene({ ...withAir(), cover: { kind: 'snow', color: '#ffffff', amount: 0.4 } }).spec(0.05).cover?.kind, 'snow')
  for (const [what, spoil, want] of bad) {
    const d = withAir()
    spoil(d)
    assert.ok(checkScene(d).some((e) => want.test(e)), `${what}: ${JSON.stringify(checkScene(d))}`)
  }
  const c = compileScene(withAir())
  const b = buildVoxels(c.spec(0.03))
  // every speck has a bone of its own and came out
  assert.equal(b.skeleton.bones.filter((x) => x.name.startsWith('~speck')).length, 30)
  // the mist is faint enough never to be taken for a surface
  let faint = 0
  for (let i = 0; i < b.blobs.count; i++) if (b.blobs.opacity[i] < 0.14) faint++
  assert.ok(faint > 10)
  assert.ok(c.haze && c.haze.to > c.haze.from)
  const sk = b.skeleton
  c.pose(sk, 1.3)
  const a = Float32Array.from(sk.offset), s0 = Float32Array.from(sk.size)
  c.pose(sk, 1.3 + c.loop)
  sk.offset.forEach((v, i) => assert.ok(Math.abs(v - a[i]) < 1e-4))
  sk.size.forEach((v, i) => assert.ok(Math.abs(v - s0[i]) < 1e-4))
  c.pose(sk, 1.9)
  assert.ok(sk.offset.some((v, i) => Math.abs(v - a[i]) > 1e-3), 'the specks move')
})

test('more shapes: each is checked, and each builds; a key paints a model by its letters', () => {
  const shaped = () => {
    const d: any = sound()
    d.parts.push(
      { shape: { kind: 'lathe', at: [0.5, 0, 0.5], profile: [[0.1, 0], [0.18, 0.15], [0.06, 0.35], [0.09, 0.4]] }, paint: '#f4f1e4' },
      { shape: { kind: 'sweep', path: [[-0.6, 0.05, 0.5], [-0.3, 0.2, 0.6], [-0.1, 0.1, 0.8]], r: 0.04, rTo: 0.015 }, paint: '#3f7a45' },
      { shape: { kind: 'join', blend: 'stairs', by: 0.08, steps: 2, shapes: [{ kind: 'box', at: [0, 0.2, -0.6], half: [0.3, 0.2, 0.05] }, { kind: 'box', at: [0, 0.03, -0.45], half: [0.3, 0.03, 0.1] }] }, paint: '#101018' },
      { shape: { kind: 'text', at: [0, 0.6, 0.6], text: 'Hi!', size: 0.2, depth: 0.04 }, paint: '#ffd166' },
      { shape: { kind: 'blocks', at: [0.6, 0, -0.4], size: 0.06, layers: [['.t.'], ['.t.'], ['lll']] }, paint: { kind: 'key', colors: { t: '#101018', l: '#3f7a45' } } },
    )
    return d
  }
  assert.deepEqual(checkScene(shaped()), [])
  const n = sound().parts.length
  const bad: [string, (d: any) => void, RegExp][] = [
    ['a lathe with one point', (d) => { d.parts[n].shape.profile = [[0.1, 0]] }, /^parts\[\d+\]\.shape\.profile: must be a list of 2 to 24/],
    ['a sweep with no path', (d) => { d.parts[n + 1].shape.path = [] }, /^parts\[\d+\]\.shape\.path: must be a list of 2 to 16 points/],
    ['an unknown blend', (d) => { d.parts[n + 2].shape.blend = 'weld' }, /^parts\[\d+\]\.shape\.blend: must be one of 'smooth'/],
    ['a blend with no reach', (d) => { delete d.parts[n + 2].shape.by }, /^parts\[\d+\]\.shape\.by: must be a number/],
    ['text it cannot draw', (d) => { d.parts[n + 3].shape.text = 'a&b' }, /^parts\[\d+\]\.shape\.text: can't draw '&'/],
    ['a key with a letter missing', (d) => { delete d.parts[n + 4].paint.colors.l }, /^parts\[\d+\]\.paint: the key has no color for 'l'/],
    ['a key on a box', (d) => { d.parts[0].paint = { kind: 'key', colors: { a: '#101018' } } }, /^parts\[0\]\.paint: a key paints a blocks shape only/],
    ['a quote in a model', (d) => { d.parts[n + 4].shape.layers[0][0] = ".'." }, /must not hold quotes/],
  ]
  for (const [what, spoil, want] of bad) {
    const d = shaped()
    spoil(d)
    assert.ok(checkScene(d).some((e) => want.test(e)), `${what}: ${JSON.stringify(checkScene(d))}`)
  }
  const b = buildVoxels(compileScene(shaped()).spec(0.02))
  const caught = new Set(b.partOf)
  for (let i = n; i < n + 5; i++) assert.ok(caught.has(i), `part ${i} caught no cells`)
  // the model's trunk is dark and its leaves green
  const colors = new Map<string, number>()
  for (let i = 0; i < b.blobs.count; i++) if (b.partOf[i] === n + 4) { const g = b.blobs.color[i * 3 + 1] > b.blobs.color[i * 3] + 0.05 ? 'green' : 'dark'; colors.set(g, (colors.get(g) ?? 0) + 1) }
  assert.ok((colors.get('green') ?? 0) > 20 && (colors.get('dark') ?? 0) > 10, JSON.stringify([...colors]))
})
