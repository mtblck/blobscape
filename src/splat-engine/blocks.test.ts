import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs } from '../splat-core/blobs.ts'
import { BLOCK_FROM, BLOCK_SHADE, FACE_VOTE, FLOW_DROP, FLOW_MOST, FLOW_STEPS, FLOW_SWELL, SPECK_SIZE, blockHash, buildBlocks, faceLight, faceTone, faceSeesLamp, flowMesh, flowStep, lampSight, lampsOf, planFlow, shapeFlow, type BlockSource } from './blocks.ts'
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

test('with a palette a block is painted its nearest color, chosen from the commonest of its blobs before snapping', () => {
  const red: Rgb = [0.8, 0.1, 0.1], white: Rgb = [0.9, 0.9, 0.9]
  const list = [blob(0, 0, 0, red), blob(0.01, 0, 0, red), blob(0, 0.01, 0, white)]
  const palette = [[20, 20, 30], [230, 60, 50], [240, 240, 230]] as const
  const c = buildBlocks([source(list)], { ...plain, palette }).pieces[0].colors
  // the red block takes the palette's red, linear
  const lin = (v: number) => ((v / 255) <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
  for (let j = 0; j < 3; j++) assert.ok(Math.abs(c[j] - lin(palette[1][j])) < 1e-4, `${[...c.slice(0, 3)]}`)
  // and full color leaves it as it was
  const own = buildBlocks([source(list)], plain).pieces[0].colors
  assert.ok(Math.abs(own[0] - lin(0.8 * 255)) < 1e-3)
})

test('a pane laid on its frame, or a lamp, gives its cell its color though the frame has more blobs there', () => {
  const frame: Rgb = [0.1, 0.1, 0.15], pane: Rgb = [0.66, 0.76, 0.83]
  const list = [blob(0, 0, 0, frame), blob(0.01, 0, 0, frame), blob(0.02, 0, 0, frame), blob(0, 0.01, 0, pane)]
  const color = (s: BlockSource) => { const m = buildBlocks([s], plain).pieces[0]; return m.colors[0] }
  assert.ok(color(source(list)) < 0.05, 'by count the frame takes it')
  const laid = source(list); laid.laid = Uint8Array.from([0, 0, 0, 1])
  assert.ok(color(laid) > 0.3, 'a laid face is what is seen')
  assert.ok(color(source(list, [], ['root'], [0, 0, 0, 255])) > 0.3, 'and so is a lit one')
  assert.ok(FACE_VOTE >= 2)
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

test('a loose body, a moon, is filled with small cubes and not a grid of dots', () => {
  // a face of blobs a block apart, as a scene's moon is cut, on a loose bone
  const list = [blob(0, -1, 0)]
  for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) list.push(blob(x * 0.1, y * 0.1, 0))
  const b = buildBlocks([source(list, [0, ...list.slice(1).map(() => 1)], ['root', '~moon'])], plain)
  const moon = b.pieces.find((p) => p.bone === 1)!
  // every small cell across the face holds a cube: one face toward +z for each
  const side = 0.1 * SPECK_SIZE, seen = new Set<string>()
  for (let v = 0; v < moon.normals.length / 3; v += 4) {
    if (moon.normals[v * 3 + 2] !== 1) continue
    seen.add(`${Math.round((moon.positions[v * 3] + moon.positions[v * 3 + 6]) / 2 / side)},${Math.round((moon.positions[v * 3 + 1] + moon.positions[v * 3 + 7]) / 2 / side)}`)
  }
  for (let x = 0; x <= 10; x++) for (let y = 0; y <= 10; y++) if (!seen.has(`${x},${y}`)) assert.fail(`no cube at ${x}, ${y}`)
  // and a row of specks is still one small cube each
  const row = buildBlocks([source([blob(0, -1, 0), blob(0, 0, 0), blob(0.1, 0, 0), blob(0.2, 0, 0)], [0, 1, 1, 1], ['root', '~rain'])], plain)
  assert.equal(row.pieces.find((p) => p.bone === 1)!.positions.length / 12, 18)
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

test('a wide disc, as a scene cut broadly out of focus has, fills the cells it covers along its own plane', () => {
  // every other grid point, each disc twice the size: on blocks a cell of the fine grid there would be gaps between them
  const wide = (x: number, z: number) => ({ ...blob(x, 0, z), scale: [0.11, 0.11, 0.01] as Rgb, quat: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] as [number, number, number, number] })
  const b = buildBlocks([source([wide(0, 0), wide(0.2, 0), wide(0, 0.2), wide(0.2, 0.2)])], { ...plain, cell: 0.1 })
  // lying flat (its plane turned onto x and z), the four fill the five by five cells between and round them, and none above
  assert.equal(b.blocks, 25)
  const ys = new Set(b.pieces.flatMap((p) => Array.from({ length: p.positions.length / 3 }, (_, i) => Math.round(p.positions[i * 3 + 1] * 100))))
  assert.deepEqual([...ys].sort((a, c) => a - c), [-5, 5])
  // a disc of the fine grid's own size stays one cube
  assert.equal(buildBlocks([source([blob(0, 0, 0)])], { ...plain, cell: 0.1 }).blocks, 1)
})

/** A flat sheet of blobs over x and z, `n` a side and `gap` apart, at height `y`: a pond's surface. */
function sheet(n: number, gap: number, y: number, r = gap * 0.6): Blobs {
  const blobs = new Blobs()
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) blobs.push({ center: [i * gap, y, j * gap], scale: [r, r, r * 0.08], quat: [0, 0, 0, 1], color: [0.2, 0.4, 0.5], opacity: 0.5 })
  return blobs
}

test('a surface that moves makes no cubes of its own, only columns', () => {
  const blobs = sheet(6, 0.1, 0.02)
  const skin = emptySkin(blobs.count)
  const source: BlockSource = { blobs, skin, skeleton: { bones: [{ name: 'water' }] }, flows: true }
  assert.equal(buildBlocks([source], { cell: 0.1 }).blocks, 0)
  const plan = planFlow(blobs, 0.1)
  assert.equal(plan.count, 36)
  // every blob is read by the column it lies in
  const read = new Set(plan.list)
  assert.equal(read.size, blobs.count)
})

test('a grid finer than the blobs are spread leaves no holes in the columns', () => {
  const blobs = sheet(5, 0.1, 0)
  const plan = planFlow(blobs, 0.05)
  // 5 blobs a side, 0.1 apart, on cells of 0.05: nine columns a side with the ones between
  const has = new Set<string>()
  for (let k = 0; k < plan.count; k++) has.add(`${plan.cells[k * 2]},${plan.cells[k * 2 + 1]}`)
  for (let z = 0; z <= 8; z++) for (let x = 0; x <= 8; x++) assert.ok(has.has(`${x},${z}`), `column ${x},${z}`)
  for (let k = 0; k < plan.count; k++) assert.ok(plan.start[k + 1] > plan.start[k], 'every column reads a blob')
})

test('a surface rests a little under the top of its layer, and columns know the ones beside them', () => {
  const plan = planFlow(sheet(3, 0.1, 0.02), 0.1)
  assert.ok(Math.abs(plan.level - 0.02) < 1e-6)
  assert.ok(Math.abs(plan.rest - (0.05 - 0.1 * FLOW_DROP)) < 1e-6)
  const k = [...Array(plan.count).keys()].find((c) => plan.cells[c * 2] === 1 && plan.cells[c * 2 + 1] === 1)!
  const at = (c: number) => [plan.cells[c * 2], plan.cells[c * 2 + 1]]
  assert.deepEqual([0, 1, 2, 3].map((q) => at(plan.beside[k * 4 + q])), [[2, 1], [0, 1], [1, 2], [1, 0]])
  const corner = [...Array(plan.count).keys()].find((c) => plan.cells[c * 2] === 0 && plan.cells[c * 2 + 1] === 0)!
  assert.equal(plan.beside[corner * 4 + 1], -1)
  assert.equal(plan.beside[corner * 4 + 3], -1)
})

test('a ripple stands in whole steps, the same up as down, and never past its most', () => {
  const cell = 0.08, step = cell / FLOW_STEPS
  assert.equal(flowStep(0, cell), 0)
  assert.equal(flowStep(step * 0.4 / FLOW_SWELL, cell), 0)
  assert.ok(Math.abs(flowStep(step / FLOW_SWELL, cell) - step) < 1e-9)
  assert.equal(flowStep(-0.003, cell), -flowStep(0.003, cell))
  assert.equal(flowStep(10, cell), FLOW_MOST * cell)
  assert.equal(flowStep(0.01, cell, 0), 0)
  for (const lift of [0.0007, 0.002, 0.004, -0.0031]) {
    const s = flowStep(lift, cell) / step
    assert.ok(Math.abs(s - Math.round(s)) < 1e-9)
  }
})

test('columns follow the blobs: a crest lifts its top, risers join it to the ones beside, and it takes the blobs\' color', () => {
  const cell = 0.1, blobs = sheet(3, cell, 0, 0.02)
  const look = { cell, vary: 0 }
  const plan = planFlow(blobs, cell), mesh = flowMesh(plan, look)
  shapeFlow(plan, mesh, blobs, look)
  // level: every top at rest, every riser between columns of no height, the outer ones a block deep
  for (let k = 0; k < plan.count; k++) {
    assert.equal(mesh.tops[k], Math.fround(plan.rest))
    for (let q = 1; q < 5; q++) {
      const ys = [0, 1, 2, 3].map((c) => mesh.positions[(k * 20 + q * 4 + c) * 3 + 1])
      const tall = Math.max(...ys) - Math.min(...ys)
      assert.ok(Math.abs(tall - (plan.beside[k * 4 + q - 1] < 0 ? cell : 0)) < 1e-6)
    }
  }
  // lift the middle blob by a step's worth and paint it
  const step = cell / FLOW_STEPS, mid = 4
  blobs.center[mid * 3 + 1] = (2 * step) / FLOW_SWELL + plan.level
  blobs.color.set([1, 1, 1], mid * 3)
  blobs.opacity[mid] = 1
  shapeFlow(plan, mesh, blobs, look)
  const k = [...Array(plan.count).keys()].find((c) => plan.list[plan.start[c]] === mid)!
  assert.ok(Math.abs(mesh.tops[k] - (plan.rest + 2 * step)) < 1e-6)
  for (let c = 0; c < 4; c++) assert.ok(Math.abs(mesh.positions[(k * 20 + c) * 3 + 1] - mesh.tops[k]) < 1e-6)
  // its own risers are two steps tall; the neighbors' toward it have none (they are the lower)
  for (let q = 1; q < 5; q++) {
    const ys = [0, 1, 2, 3].map((c) => mesh.positions[(k * 20 + q * 4 + c) * 3 + 1])
    assert.ok(Math.abs(Math.max(...ys) - Math.min(...ys) - 2 * step) < 1e-6)
    const nb = plan.beside[k * 4 + q - 1], back = [1, 0, 3, 2][q - 1]
    assert.equal(plan.beside[nb * 4 + back], k)
    const theirs = [0, 1, 2, 3].map((c) => mesh.positions[(nb * 20 + (back + 1) * 4 + c) * 3 + 1])
    assert.ok(Math.max(...theirs) - Math.min(...theirs) < 1e-6)
  }
  assert.deepEqual([...mesh.colors.subarray(k * 80, k * 80 + 4)], [1, 1, 1, 1])
  // half-solid blobs, two deep, are three quarters solid
  const other = (k + 1) % plan.count
  assert.ok(Math.abs(mesh.colors[other * 80 + 3] - 0.75) < 1e-6)
})

test('a column\'s faces look outward: each triangle turns the way its normal points', () => {
  const cell = 0.1, blobs = sheet(1, cell, 0, 0.02), look = { cell }
  const plan = planFlow(blobs, cell), mesh = flowMesh(plan, look)
  shapeFlow(plan, mesh, blobs, look)
  const p = (v: number) => [mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]]
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [p(mesh.indices[t]), p(mesh.indices[t + 1]), p(mesh.indices[t + 2])]
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
    const v = mesh.indices[t]
    const dot = n[0] * mesh.normals[v * 3] + n[1] * mesh.normals[v * 3 + 1] + n[2] * mesh.normals[v * 3 + 2]
    assert.ok(dot > 0, `triangle ${t / 3}`)
  }
})

test('a lamp that stays put is known by the blobs that see less than all of it', () => {
  assert.deepEqual(lampsOf(undefined), [false, false, false, false])
  assert.deepEqual(lampsOf(Uint8Array.from([255, 255, 255, 255, 255, 40, 255, 255])), [false, true, false, false])
})

test('a lamp lights the faces turned to it with nothing between, and no others', () => {
  // a lamp in the middle of a hollow: a roof over it, a floor under it, a post further down, and a wall off to one side
  const list = [blob(0, 0.2, 0), blob(0, -0.2, 0), blob(0, -0.4, 0), blob(0.5, 0, 0)]
  const built = buildBlocks([source(list)], plain), solid = built.solids[0], lamp: [number, number, number] = [0, 0, 0]
  // the roof: its underside sees the lamp, its top is turned away
  assert.equal(faceSeesLamp(solid, 0, 2, 0, 3, lamp), true)
  assert.equal(faceSeesLamp(solid, 0, 2, 0, 2, lamp), false)
  // the post under the floor: its side faces are turned to the lamp's height but the floor is in the way... its top too
  assert.equal(faceSeesLamp(solid, 0, -4, 0, 2, lamp), false)
  // the wall to the side: the face toward the lamp is lit, the far one is not
  assert.equal(faceSeesLamp(solid, 5, 0, 0, 1, lamp), true)
  assert.equal(faceSeesLamp(solid, 5, 0, 0, 0, lamp), false)
  // something past the wall is in its shadow
  const more = buildBlocks([source([...list, blob(0.8, 0, 0)])], plain)
  assert.equal(faceSeesLamp(more.solids[0], 8, 0, 0, 1, lamp), false)
  // a lamp inside a solid cell still shines out of it
  const housed = buildBlocks([source([blob(0, 0, 0), blob(0.4, 0, 0)])], plain)
  assert.equal(faceSeesLamp(housed.solids[0], 4, 0, 0, 1, lamp), true)
})

test('lampSight gives a number a face, and leaves faces beyond the lamp\'s light alone', () => {
  const built = buildBlocks([source([blob(0, 0.2, 0), blob(5, 0, 0)])], plain)
  const piece = built.pieces[0], sight = lampSight(piece, built.solids[0], [0, 0, 0], 0.5)
  assert.equal(sight.length, piece.faceCells.length / 4)
  for (let f = 0; f < sight.length; f++) {
    const [x, y, , face] = piece.faceCells.subarray(f * 4, f * 4 + 4)
    if (x === 50) assert.equal(sight[f], 1)
    else assert.equal(sight[f], y === 2 && face === 3 ? 1 : 0)
  }
})
