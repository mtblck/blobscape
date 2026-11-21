import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs } from '../splat-core/blobs.ts'
import { BLOCK_FROM, BLOCK_SHADE, SPECK_SIZE, blockHash, buildBlocks, faceLight, faceTone, type BlockSource } from './blocks.ts'
import { emptySkin } from './rig.ts'

type Rgb = [number, number, number]
const blob = (x: number, y: number, z: number, color: Rgb = [0.5, 0.5, 0.5], opacity = 1) => ({ center: [x, y, z] as Rgb, scale: [0.05, 0.05, 0.01] as Rgb, quat: [0, 0, 0, 1] as [number, number, number, number], color, opacity })

/** A source from blobs: each rides the bone its entry in `on` names (bone 0 where left out). */
function source(list: ReturnType<typeof blob>[], on: number[] = [], names: string[] = ['root'], glow?: number[]): BlockSource {
  const blobs = new Blobs()
  for (const b of list) blobs.push(b)
  const skin = emptySkin(list.length)
  for (let i = 0; i < list.length; i++) { skin.joints[i * 4] = on[i] ?? 0; skin.weights[i * 4] = 1 }
  return { blobs, skin, skeleton: { bones: names.map((name) => ({ name })) }, glow: glow && Uint8Array.from(glow) }
}
const plain = { cell: 0.1, vary: 0, corners: 0 }

test('one blob is one cube; two side by side on one bone share no face', () => {
  const one = buildBlocks([source([blob(0, 0, 0)])], plain)
  assert.equal(one.blocks, 1)
  assert.equal(one.faces, 6)
  assert.equal(one.pieces[0].indices.length, 36)
  const two = buildBlocks([source([blob(0, 0, 0), blob(0.1, 0, 0)])], plain)
  assert.equal(two.faces, 10)
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i < two.pieces[0].positions.length; i += 3) { lo = Math.min(lo, two.pieces[0].positions[i]); hi = Math.max(hi, two.pieces[0].positions[i]) }
  assert.ok(Math.abs(lo + 0.05) < 1e-6 && Math.abs(hi - 0.15) < 1e-6)
})

test('every face points out of its block and winds counterclockwise seen from outside', () => {
  const p = buildBlocks([source([blob(0, 0, 0)])], { ...plain, cell: 1 }).pieces[0]
  for (let t = 0; t < p.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => [0, 1, 2].map((j) => p.positions[p.indices[t + k] * 3 + j]))
    const e1 = b.map((v, j) => v - a[j]), e2 = c.map((v, j) => v - a[j])
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
    const want = [0, 1, 2].map((j) => p.normals[p.indices[t] * 3 + j])
    assert.ok(n[0] * want[0] + n[1] * want[1] + n[2] * want[2] > 0.9)
    // and away from the middle of the cube
    assert.ok(a[0] * want[0] + a[1] * want[1] + a[2] * want[2] > 0)
  }
})

test('a block takes the commonest color among its blobs, not their mix, and faint blobs make none', () => {
  const red: Rgb = [0.8, 0.1, 0.1], white: Rgb = [0.9, 0.9, 0.9]
  const b = buildBlocks([source([blob(0, 0, 0, red), blob(0.01, 0, 0, red), blob(0, 0.01, 0, white), blob(1, 1, 1, white, 0.1)])], plain)
  assert.equal(b.blocks, 1)
  const c = b.pieces[0].colors
  assert.ok(c[0] > 0.5 && c[1] < 0.05 && c[2] < 0.05, `${[...c.slice(0, 3)]}`)
})

test('a cell two bones share goes to the bone with more blobs in it, so no two cubes stand in one place', () => {
  const b = buildBlocks([source([blob(0, 0, 0), blob(0.01, 0, 0), blob(0, 0.01, 0), blob(0.3, 0, 0)], [1, 1, 0, 0], ['root', 'arm'])], plain)
  assert.equal(b.blocks, 2)
  assert.deepEqual(b.pieces.map((p) => [p.bone, p.blocks]).sort(), [[0, 1], [1, 1]])
})

test('cubes on different bones keep the faces between them, since one may move away', () => {
  const b = buildBlocks([source([blob(0, 0, 0), blob(0.1, 0, 0)], [0, 1], ['root', 'door'])], plain)
  assert.equal(b.faces, 12)
})

test('the three faces a view shows are three different tones, the one that faces the light most at full light', () => {
  const sun = faceLight(BLOCK_FROM)
  assert.equal(Math.max(...sun), 1)
  assert.equal(sun[1], 0)
  assert.equal(sun[3], 0)
  const tones = [0, 2, 4].map((f) => faceTone(f, 1, BLOCK_SHADE, sun))
  assert.equal(new Set(tones.map((t) => t.toFixed(3))).size, 3)
  assert.ok(Math.abs(Math.max(...tones) - (1 + BLOCK_SHADE * 0.16)) < 1e-9)
  // in shadow a face keeps only its shade, and a face turned down is darker than one turned up
  assert.ok(faceTone(2, 0, BLOCK_SHADE, sun) > faceTone(0, 0, BLOCK_SHADE, sun))
  assert.ok(faceTone(0, 0, BLOCK_SHADE, sun) > faceTone(3, 0, BLOCK_SHADE, sun))
})

/** The light on the top face of the cube at a place. */
function topTone(b: ReturnType<typeof buildBlocks>, at: Rgb): number {
  for (const p of b.pieces) for (let v = 0; v < p.normals.length / 3; v += 4) {
    if (p.normals[v * 3 + 1] !== 1) continue
    const mid = [0, 1, 2].map((j) => (p.positions[v * 3 + j] + p.positions[(v + 2) * 3 + j]) / 2)
    if (Math.abs(mid[0] - at[0]) < 1e-4 && Math.abs(mid[2] - at[2]) < 1e-4 && Math.abs(mid[1] - at[1] - 0.05) < 1e-4) return p.light[v * 3]
  }
  throw new Error('no such face')
}

test('a block in the way of the light puts the whole face behind it in shade, and only that face', () => {
  // a floor of 7 by 7, a post two high on its middle, the light from +x and above
  const list = []
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) list.push(blob(x * 0.1, 0, z * 0.1))
  list.push(blob(0, 0.1, 0), blob(0, 0.2, 0))
  const look = { ...plain, from: [1, 1, 0] as Rgb }
  const b = buildBlocks([source(list)], look)
  const sun = faceLight(look.from)
  const lit = faceTone(2, 1, BLOCK_SHADE, sun), dark = faceTone(2, 0, BLOCK_SHADE, sun)
  assert.ok(Math.abs(topTone(b, [-0.1, 0, 0]) - dark) < 1e-6, 'behind the post')
  assert.ok(Math.abs(topTone(b, [-0.2, 0, 0]) - dark) < 1e-6, 'two behind')
  assert.ok(Math.abs(topTone(b, [0.1, 0, 0]) - lit) < 1e-6, 'in front of it')
  assert.ok(Math.abs(topTone(b, [-0.1, 0, 0.2]) - lit) < 1e-6, 'beside its shadow')
  assert.ok(Math.abs(topTone(b, [0, 0.2, 0]) - lit) < 1e-6, 'the top of the post')
  const none = buildBlocks([source(list)], { ...look, shadows: false })
  assert.ok(Math.abs(topTone(none, [-0.1, 0, 0]) - lit) < 1e-6)
})

test('a corner where blocks meet is darker, and an open face is not', () => {
  const list = [blob(0, 0, 0), blob(0.1, 0, 0), blob(0.1, 0.1, 0)]
  const b = buildBlocks([source(list)], { cell: 0.1, vary: 0, corners: 1 })
  const p = b.pieces[0]
  let least = 1, most = 0
  for (let v = 0; v < p.light.length / 3; v++) { least = Math.min(least, p.light[v * 3 + 1]); most = Math.max(most, p.light[v * 3 + 1]) }
  assert.equal(most, 1)
  assert.ok(least < 0.9)
  // the top of the low block: its two corners against the step are darker than its two away from it
  for (let v = 0; v < p.normals.length / 3; v += 4) {
    if (p.normals[v * 3 + 1] !== 1 || p.positions[v * 3 + 1] > 0.06) continue
    for (let c = 0; c < 4; c++) assert.equal(p.light[(v + c) * 3 + 1] < 1, p.positions[(v + c) * 3] > 0.04)
  }
})

test('blocks differ a little in lightness by where they are, the same each time', () => {
  assert.equal(blockHash(3, -2, 7), blockHash(3, -2, 7))
  assert.notEqual(blockHash(3, -2, 7), blockHash(4, -2, 7))
  const list = Array.from({ length: 20 }, (_, i) => blob(i * 0.1, 0, 0))
  const a = buildBlocks([source(list)], { cell: 0.1, vary: 1 }), again = buildBlocks([source(list)], { cell: 0.1, vary: 1 })
  assert.deepEqual(a.pieces[0].colors, again.pieces[0].colors)
  assert.ok(new Set([...a.pieces[0].colors].map((v) => v.toFixed(4))).size > 5)
  for (const v of a.pieces[0].colors) assert.ok(Math.abs(v / 0.21404 - 1) < 0.1)
})

test('specks are small cubes of their own that cast no shadow and are no corner', () => {
  const list = [blob(0, 0, 0), blob(0.02, 0.1, 0)]
  const b = buildBlocks([source(list, [0, 1], ['root', '~speck0'])], { ...plain, corners: 1, from: [0, 1, 0] })
  const speck = b.pieces.find((p) => p.bone === 1)!, ground = b.pieces.find((p) => p.bone === 0)!
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i < speck.positions.length; i += 3) { lo = Math.min(lo, speck.positions[i]); hi = Math.max(hi, speck.positions[i]) }
  assert.ok(Math.abs(hi - lo - 0.1 * SPECK_SIZE) < 1e-6)
  for (let v = 0; v < ground.light.length / 3; v++) {
    assert.equal(ground.light[v * 3 + 1], 1)
    if (ground.normals[v * 3 + 1] === 1) assert.ok(ground.light[v * 3] > 0.9)
  }
})

test('a block that gives its own light says so and casts no shadow', () => {
  const b = buildBlocks([source([blob(0, 0, 0), blob(0, 0.1, 0)], [0, 1], ['root', 'lamp'], [0, 255])], { ...plain, from: [0, 1, 0] })
  const ground = b.pieces.find((p) => p.bone === 0)!, lamp = b.pieces.find((p) => p.bone === 1)!
  assert.equal(lamp.light[2], 1)
  assert.equal(ground.light[2], 0)
  for (let v = 0; v < ground.light.length / 3; v++) if (ground.normals[v * 3 + 1] === 1) assert.ok(ground.light[v * 3] > 0.9)
})

test('each source keeps its own pieces', () => {
  const b = buildBlocks([source([blob(0, 0, 0)]), source([blob(0, 0, 0), blob(0.5, 0, 0)])], plain)
  assert.deepEqual(b.pieces.map((p) => [p.actor, p.blocks]), [[0, 1], [1, 2]])
})

test('one source never shades another: each has its own rest pose and may stand anywhere', () => {
  const floor = []
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) floor.push(blob(x * 0.1, 0, z * 0.1))
  const look = { ...plain, corners: 1, from: [0, 1, 0] as Rgb }
  const b = buildBlocks([source(floor), source([blob(0, 0.1, 0), blob(0, 0.2, 0)])], look)
  const ground = b.pieces.find((p) => p.actor === 0)!
  for (let v = 0; v < ground.light.length / 3; v++) {
    assert.equal(ground.light[v * 3 + 1], 1)
    if (ground.normals[v * 3 + 1] === 1) assert.ok(ground.light[v * 3] > 0.9)
  }
})

test('a source cut on a grid of its own makes cubes that size', () => {
  const fine = { ...source([blob(0, 0, 0), blob(0.05, 0, 0)]), blockCell: 0.05 }
  const b = buildBlocks([source([blob(0, 0, 0), blob(0.03, 0, 0)]), fine], plain)
  // on the look's grid the two blobs fall in one cell; on the finer one they are two cubes, each 0.05 across
  assert.deepEqual(b.pieces.map((p) => p.blocks), [1, 2])
  const xs = Array.from({ length: b.pieces[1].positions.length / 3 }, (_, i) => b.pieces[1].positions[i * 3])
  assert.ok(Math.abs(Math.min(...xs) + 0.025) < 1e-6 && Math.abs(Math.max(...xs) - 0.075) < 1e-6)
})
