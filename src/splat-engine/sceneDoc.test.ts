import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PASS_EDGE, checkScene, compileScene, dulled, duringAt, hasLamps, isLit, litFor, passed, sprouted, type SceneDoc } from './sceneDoc.ts'
import { buildVoxels } from './voxel.ts'
import { PUFFS } from './poke.ts'
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
    // the scene's five, and the hidden sparkles a tap throws
    assert.equal(new Set(b.partOf).size, 5 + PUFFS, `spacing ${spacing}`)
  }
  // a hole that swallows its shape leaves a part with nothing: the check can't see it, the build can
  const hollow = sound()
  hollow.parts[2] = { shape: { kind: 'cut', shape: { kind: 'sphere', at: [0, 0.5, 0], r: 0.1 }, hole: { kind: 'sphere', at: [0, 0.5, 0], r: 0.3 } }, paint: '#ffd166' }
  assert.deepEqual(checkScene(hollow), [])
  const h = compileScene(hollow)
  assert.deepEqual(h.empty(buildVoxels(h.spec(0.03))), [2])
  assert.deepEqual(c.empty(buildVoxels(c.spec(0.03))), [])
  assert.equal(c.bones.length, 4 + PUFFS)
  assert.equal(compileScene(sound(), { puffs: false }).bones.length, 4)
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
    ['an unknown ink', (d) => { d.parts[0].ink = { kind: 'swirl' } }, /^parts\[0\]\.ink\.kind: must be one of 'hatch'/],
    ['ink past 1', (d) => { d.parts[0].ink = { kind: 'cracks', amount: 3 } }, /^parts\[0\]\.ink\.amount: must be from 0 to 1/],
    ['glass past 1', (d) => { d.parts[0].glass = { see: 2 } }, /^parts\[0\]\.glass\.see: must be from 0 to 1/],
    ['a focus with no reach', (d) => { d.focus = { at: [0, 0, 0] } }, /^focus\.r: must be a number/],
    ['strokes past 1', (d) => { d.parts[0].strokes = 2 }, /^parts\[0\]\.strokes: must be from 0 to 1/],
    ['bounce past 1', (d) => { d.light = { bounce: 3 } }, /^light\.bounce: must be from 0 to 1/],
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
  const inked = withAir()
  inked.parts[0].ink = { kind: 'cracks', amount: 0.3, color: '#101018' }
  assert.deepEqual(checkScene(inked), [])
  assert.deepEqual(compileScene(inked).spec(0.05).parts[0].ink, { kind: 'cracks', amount: 0.3, color: [16 / 255, 16 / 255, 24 / 255] })
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

test('a move with `during` happens once, between two moments of the loop, and waits the rest of it', () => {
  assert.equal(duringAt(0.3), 0.3)
  assert.equal(duringAt(0.1, [0.2, 0.6]), 1, 'before it starts, as after it ends')
  assert.equal(duringAt(0.2, [0.2, 0.6]), 0)
  assert.ok(Math.abs(duringAt(0.4, [0.2, 0.6]) - 0.5) < 1e-9)
  assert.equal(duringAt(0.9, [0.2, 0.6]), 1)
  // across the seam
  assert.ok(Math.abs(duringAt(0.05, [0.9, 0.2]) - 0.5) < 1e-9)
  assert.equal(duringAt(0.5, [0.9, 0.2]), 1)
  assert.ok(Math.abs(sprouted(0.05, 0.1, 0.1) - 0.5) < 1e-9 && sprouted(0.5, 0.1, 0.1) === 1 && Math.abs(sprouted(0.95, 0.1, 0.1) - 0.5) < 1e-9)

  const doc = sound()
  doc.moves = [
    { kind: 'sprout', bone: 'arm', times: 1, during: [0.25, 0.75], rise: 0.1, fall: 0.1 },
    { kind: 'sway', bone: 'hand', axis: 'z', degrees: 40, times: 1, during: [0.4, 0.5] },
    { kind: 'drift', bone: 'puff', by: [0, 1, 0], times: 1, during: [0.9, 0.1] },
  ]
  doc.lights = [{ at: [0, 0.3, 0], color: '#ffd166', strength: 2, range: 0.8, during: [0.5, 0.75] }]
  assert.deepEqual(checkScene(doc), [])
  const c = compileScene(doc), sk = new Skeleton(c.bones)
  const arm = sk.index('arm'), hand = sk.index('hand'), puff = sk.index('puff')
  const at = (u: number) => { c.pose(sk, u * c.loop); return { arm: sk.size[arm], hand: Array.from(sk.rotation.subarray(hand * 4, hand * 4 + 4)), puff: sk.size[puff], light: c.lights(u * c.loop)[0].color[0] } }
  const still = at(0).hand
  assert.equal(at(0.1).arm, 0, 'not there yet')
  assert.equal(at(0.5).arm, 1, 'standing')
  assert.equal(at(0.8).arm, 0, 'gone again')
  assert.deepEqual(at(0.39).hand, still)
  assert.notDeepEqual(at(0.425).hand, still, 'the wave')
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(at(0.5).hand[i] - still[i]) < 1e-6, 'back where it began')
  assert.deepEqual(at(0.6).hand, still)
  assert.ok(at(0.5).puff < 1e-6 && at(0).puff > 0.9, 'the puff lives across the seam')
  assert.equal(at(0.3).light, 0)
  assert.ok(at(0.625).light > 0.5)
  assert.equal(at(0.76).light, 0)

  const errs = (m: unknown) => checkScene({ ...sound(), moves: [m as never] }).join('; ')
  assert.match(errs({ kind: 'sprout', bone: 'arm', times: 1, during: [0.2, 1.4] }), /during: must be \[from, to\]/)
  assert.match(errs({ kind: 'sprout', bone: 'arm', times: 1, during: [0.2, 0.2] }), /during: must last at least/)
  assert.match(errs({ kind: 'sprout', bone: 'arm', times: 1, rise: 0.7, fall: 0.6 }), /rise and fall together/)
})

test('a dissolve gathers a bone\'s blobs, leaves them whole and takes them away again, by itself looping', () => {
  const doc = sound()
  doc.moves = [{ kind: 'dissolve', bone: 'puff', times: 1, by: 0.8, during: [0.2, 0.6], rise: 0.1, fall: 0.5 }]
  assert.deepEqual(checkScene(doc), [])
  const c = compileScene(doc), sk = new Skeleton(c.bones), b = sk.index('puff')
  const gone = (u: number) => { c.pose(sk, u * c.loop); return sk.gone[b] }
  assert.equal(gone(0), 1, 'not there before its time')
  assert.equal(gone(0.3), 0, 'whole')
  assert.ok(Math.abs(gone(0.5) - 0.5) < 1e-6, 'half gone half way through its fall')
  assert.equal(gone(0.7), 1)
  assert.equal(sk.lift[b], Math.fround(0.8))
  assert.equal(sk.size[b], 1, 'the bone itself keeps its size')
  sk.reset()
  assert.equal(sk.gone[b], 0)
  const errs = (m: unknown) => checkScene({ ...sound(), moves: [m as never] }).join('; ')
  assert.match(errs({ kind: 'dissolve', bone: 'puff', times: 1, rise: 0.7, fall: 0.6 }), /rise and fall together/)
  assert.match(errs({ kind: 'dissolve', bone: 'puff', times: 1, by: 9 }), /by/)
})

test('a pass goes by at an even speed from where it is drawn, is gone at both ends of its way, and loops', () => {
  // drawn 0.3 along its way: there as the loop starts, and a steady share further on after each share of its time
  assert.ok(Math.abs(passed(0.3, 0.3)[0]) < 1e-9 && passed(0.3, 0.3)[1] === 1)
  assert.ok(Math.abs(passed(0.5, 0.3)[0] - 0.2) < 1e-9 && Math.abs(passed(0.1, 0.3)[0] + 0.2) < 1e-9)
  assert.equal(passed(0, 0.3)[1], 0)
  assert.ok(passed(0.9999, 0.3)[1] < 1e-4 && passed(PASS_EDGE, 0)[1] === 1 && passed(1 - PASS_EDGE, 0)[1] === 1)
  const doc = sound()
  doc.bones!.push({ name: 'post', at: [0.5, 0, 0.5] })
  doc.parts.push({ shape: { kind: 'cylinder', at: [0.5, 0, 0.5], height: 0.3, r: 0.03 }, paint: '#f4f1e4', bone: 'post' })
  doc.moves!.push({ kind: 'pass', bone: 'post', by: [-2, 0, 0], times: 2, phase: 0.25 })
  assert.deepEqual(checkScene(doc), [])
  const c = compileScene(doc), sk = new Skeleton(c.bones), b = sk.index('post')
  const x = (t: number) => { c.pose(sk, t); return sk.matrix[b * 16 + 12] }
  const size = (t: number) => { c.pose(sk, t); return Math.hypot(sk.matrix[b * 16], sk.matrix[b * 16 + 1], sk.matrix[b * 16 + 2]) }
  const x0 = x(0)
  assert.ok(Math.abs(size(0) - 1) < 1e-6, 'whole where it is drawn')
  // a loop of 8 s and twice a loop: 2 units in 4 s
  assert.ok(Math.abs(x(1) - x0 + 0.5) < 1e-5 && Math.abs(x(2) - x(1) + 0.5) < 1e-5)
  // three quarters of the way are left, so it is gone at 3 s and back at the start of its way after
  assert.ok(size(3) < 1e-6 && x(3.5) > x0)
  assert.ok(Math.abs(x(4.7) - x(0.7)) < 1e-5 && Math.abs(x(8.7) - x(0.7)) < 1e-5)
  const bad = sound()
  bad.moves!.push({ kind: 'pass', bone: 'puff', by: [1, 0, 0], times: -1 })
  assert.ok(checkScene(bad).some((e) => e.includes('must be over 0 for a pass')))
})

test('a description can ask for art-pixel effects, and they come out as the pixel look has them', () => {
  const d = sound()
  d.look = { bands: 2, heat: 1, selout: true, cycle: [{ colors: ['#3f7a45', '#f4f1e4'], times: 16 }] }
  assert.deepEqual(checkScene(d), [])
  const look = compileScene(d).look
  assert.equal(look.bands, 2)
  assert.equal(look.selout, true)
  assert.equal(look.heat!.pixels, 1)
  assert.ok(Number.isInteger(look.heat!.pace * d.loop), 'the haze changes a whole number of times a loop')
  assert.deepEqual(look.cycle, [{ colors: [[63, 122, 69], [244, 241, 228]], pace: 2 }])
  const wrong = sound()
  wrong.look = { bands: 3, heat: 1.5, cycle: [{ colors: ['#3f7a45'], times: 0.5 }] } as SceneDoc['look']
  const errs = checkScene(wrong)
  for (const at of [/^look\.bands:/, /^look\.heat:/, /^look\.cycle\[0\]\.colors:/, /^look\.cycle\[0\]\.times:/]) assert.ok(errs.some((e) => at.test(e)), `${at} in ${errs.join('; ')}`)
})

test('lamps wait for the dark: by day a light is out, its glass is dull and no longer glows, its flame is gone', () => {
  const d = sound()
  assert.equal(hasLamps(d), false)
  assert.equal(litFor(d, false), d, 'nothing in it goes by the time, so it comes back as it is')
  // the glowing part becomes a lamp's glass, with a flame on it, embers over it, a sun, and a light for each
  d.parts[2] = { ...d.parts[2], lit: 'dark' }
  d.parts.push({ shape: { kind: 'sphere', at: [0.3, 0.6, 0], r: 0.02 }, paint: '#ffd166', glow: true, lit: 'dark', unlit: 'gone' })
  d.parts.push({ shape: { kind: 'sphere', at: [0, 2, -1], r: 0.2 }, paint: '#ffd166', glow: true, lit: 'day', unlit: 'gone' })
  d.parts.push({ shape: { kind: 'box', at: [0.6, 0.3, 0], half: [0.05, 0.05, 0.02] }, paint: { kind: 'bands', axis: 'y', size: 0.05, colors: ['#ffd166', '#f4f1e4'] }, glow: true, lit: 'dark', unlit: '#101018' })
  d.lights = [{ at: [0.3, 0.6, 0], color: '#ffd166', strength: 2, range: 1, lit: 'dark' }, { at: [0, 1, 0], color: '#f4f1e4', strength: 1, range: 1, lit: 'always' }]
  d.air = { specks: [{ kind: 'embers', count: 4, from: [0.2, 0.6, -0.1], to: [0.4, 1, 0.1], colors: ['#ffd166'], lit: 'dark' }, { kind: 'dust', count: 4, from: [-1, 0, -1], to: [1, 1, 1], colors: ['#f4f1e4'] }] }
  assert.deepEqual(checkScene(d), [])
  assert.equal(hasLamps(d), true)
  const n = d.parts.length

  const day = litFor(d, false)
  assert.deepEqual(checkScene(day), [])
  assert.equal(day.parts.length, n - 1, 'only the flame is gone by day; the sun is up')
  const glass = day.parts[2]
  assert.ok(!glass.glow && !glass.lit && glass.paint === dulled('#ffd166'), 'the glass is a dull shade of itself and takes light like anything else')
  assert.equal(glass.laid, true, 'and its face stays whole over what it lies on, so a pane leaves no hole in its frame')
  assert.ok(day.palette.includes(dulled('#ffd166')) && day.palette.includes('#101018'))
  assert.equal(day.parts[n - 2].paint, '#101018', 'a part with its own unlit color takes it whole')
  assert.deepEqual(day.lights!.map((l) => l.strength), [0, 1], 'the lamp is out and keeps its place; what always shines does')
  assert.deepEqual(day.air!.specks!.map((k) => k.kind), ['dust'])
  assert.equal(d.parts.length, n, 'the description itself is untouched')

  const dark = litFor(d, true)
  assert.deepEqual(checkScene(dark), [])
  assert.equal(dark.parts.length, n - 1, 'only the sun is gone in the dark')
  assert.ok(dark.parts[2].glow && dark.lights![0].strength === 2 && dark.air!.specks!.length === 2)

  // a cave or a dungeon is never day: its lamps stay lit, but the sun still keeps its hours
  const cave = litFor({ ...d, lamps: 'always' }, false)
  assert.ok(cave.parts[2].glow && cave.lights![0].strength === 2)
  assert.equal(litFor(d, false, 'always').lights![0].strength, 2, 'and whoever sets a scene down can say so too')
  assert.ok(isLit('dark', false, 'always') && !isLit('day', true, 'always') && isLit(undefined, false))
  // the moon and stars are the night's own: no setting brings them out by day
  assert.ok(!isLit('night', false, 'always') && isLit('night', true))

  // a dull shade is darker and nearer gray
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(dulled('#ffd166').slice(i, i + 2), 16))
  assert.ok(r < 255 && Math.max(r, g, b) - Math.min(r, g, b) < 0xff - 0x66)

  const wrong = sound()
  wrong.parts[1] = { ...wrong.parts[1], lit: 'dark' }
  wrong.parts[2] = { ...wrong.parts[2], unlit: 'gone' }
  wrong.lights = [{ at: [0, 1, 0], color: '#f4f1e4', strength: 1, range: 1, lit: 'dusk' as 'dark' }]
  const errs = checkScene({ ...wrong, lamps: 'never' as 'always' })
  for (const at of [/^parts\[1\]\.lit:/, /^parts\[2\]\.unlit:/, /^lights\[0\]\.lit:/, /^lamps:/]) assert.ok(errs.some((e) => at.test(e)), `${at} in ${errs.join('; ')}`)
})

test('wind blows what falls sideways over the fall still to come, so it lands where it was planned to', () => {
  const doc: SceneDoc = { name: 'Blown', loop: 4, palette: ['#557744', '#ffffff'], camera: { target: [0, 0.5, 0], distance: 4, azimuth: 0, elevation: 20 }, bones: [{ name: 'x', at: [0, 0, 0] }], parts: [{ shape: { kind: 'box', at: [0, -0.05, 0], half: [1, 0.05, 1] }, paint: '#557744' }], air: { specks: [{ kind: 'rain', count: 30, from: [-0.5, 0, -0.5], to: [0.5, 2, 0.5], colors: ['#ffffff'], land: true }] } }
  const c = compileScene(doc)
  const still = new Skeleton(c.bones), blown = new Skeleton(c.bones)
  let moved = 0, landed = 0
  for (let t = 0; t < 4; t += 0.05) {
    c.pose(still, t); c.pose(blown, t); c.blow(blown, t, [0.5, 0])
    for (let b = 0; b < c.bones.length; b++) {
      if (!c.bones[b].name.startsWith('~speck')) continue
      const dx = blown.offset[b * 3] - still.offset[b * 3]
      // upwind (−x) by half the height still to fall, nothing once down
      if (dx > 1e-9) assert.fail(`${c.bones[b].name} blown the wrong way`)
      if (dx < -1e-3) moved++
      // lying where it came down: not moved at all
      else if (dx === 0 && still.size[b] > 0) landed++
    }
  }
  assert.ok(moved > 100 && landed > 10, `${moved} blown, ${landed} landed where planned`)
})
