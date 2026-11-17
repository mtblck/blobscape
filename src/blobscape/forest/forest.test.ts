import { test } from 'node:test'
import assert from 'node:assert/strict'
import { posedPoint } from '../../splat-engine/rig.ts'
import { Forest } from './forest.ts'
import { makePlant, sprung } from './plants.ts'
import { KINDS, PERIOD, RING, ROAM, RULES, TILE, layout, obstacles, pathHalf, pathX, slotOf, stepWalker, tileWindow } from './world.ts'

test('the path repeats every period, so a ring slot can reuse its ground', () => {
  for (const z of [0, 3.3, 17, 35.9]) {
    assert.ok(Math.abs(pathX(z) - pathX(z + PERIOD * 3)) < 1e-9)
    assert.ok(Math.abs(pathHalf(z) - pathHalf(z - PERIOD)) < 1e-9)
  }
})

test('the tile window is RING tiles in a row, one per ring slot, reaching farthest where the walker faces', () => {
  for (const [z, h] of [[0, 0], [123.4, 0], [-50, Math.PI], [10, 1.2]] as const) {
    const w = tileWindow(z, h)
    assert.equal(w.length, RING)
    assert.equal(new Set(w.map(slotOf)).size, RING)
    const here = Math.floor(z / TILE)
    assert.ok(w.includes(here))
  }
  const ahead = tileWindow(0, 0), back = tileWindow(0, Math.PI)
  assert.ok(ahead[RING - 1] > back[RING - 1] && ahead[0] > back[0])
})

test('a stretch of path grows the same plants every time, off the path, and another seed grows others', () => {
  const a = layout(17, 1), b = layout(17, 1), c = layout(17, 2)
  assert.deepEqual(a, b)
  assert.notDeepEqual(a, c)
  for (let i = -20; i < 20; i++) {
    for (const p of layout(i, 3)) {
      const off = Math.abs(p.x - pathX(p.z))
      assert.ok(off >= pathHalf(p.z) + RULES[p.kind].from - 1e-9, `${p.kind} on the path at ${off}`)
      assert.ok(p.z >= i * TILE && p.z < (i + 1) * TILE)
    }
  }
})

test('the walker turns, moves, keeps out of trunks and stays near the path', () => {
  let w = { x: 0, z: 0, heading: 0, speed: 0 }
  for (let k = 0; k < 120; k++) w = stepWalker(w, { forward: 1, turn: 0 }, 1 / 60)
  assert.ok(w.z > 1 && Math.abs(w.x) < 1e-9, `went to ${w.x}, ${w.z}`)
  const right = stepWalker(w, { forward: 0, turn: 1 }, 0.5)
  assert.ok(right.heading < w.heading, 'right turns clockwise from above, toward −x')
  // straight into a trunk: pushed round it, never inside
  let v = { x: 0, z: 0, heading: 0, speed: 0 }
  const trunk = [{ x: 0, z: 2, r: 0.3 }]
  for (let k = 0; k < 300; k++) {
    v = stepWalker(v, { forward: 1, turn: 0 }, 1 / 60, trunk)
    assert.ok(Math.hypot(v.x, v.z - 2) >= 0.3 + 0.28 - 1e-6)
  }
  // off sideways into the forest: held within ROAM of the path
  let s = { x: 0, z: 0, heading: Math.PI / 2, speed: 0 }
  for (let k = 0; k < 900; k++) s = stepWalker(s, { forward: 1, turn: 0 }, 1 / 60)
  assert.ok(Math.abs(s.x - pathX(s.z)) <= ROAM + 1e-9)
})

test('every kind of plant grows from nothing to its full size, on real bones', () => {
  assert.equal(sprung(0, 0, 1), 0)
  assert.equal(sprung(5, 0, 1), 1)
  for (const kind of KINDS) {
    const p = makePlant(kind, 42, 0.3, 'summer')
    const sk = p.skeleton
    for (let i = 0; i < p.blobs.count * 4; i++) assert.ok(p.skin.joints[i] < sk.count)
    p.pose(Infinity, 0, 0, 1, 1)
    const top = Math.max(...Array.from({ length: sk.count }, (_, b) => sk.posedHead[b * 3 + 1] + 0))
    p.pose(0, 0, 0, 1, 1)
    // how big a blob is on average, through its heaviest bone
    let small = 0
    for (let i = 0; i < p.blobs.count; i++) small += sk.scale[p.skin.joints[i * 4]] / p.blobs.count
    assert.ok(small < 0.4 || kind === 'rock', `${kind} at 0 s is already ${small} of its size`)
    assert.ok(Number.isFinite(top))
  }
})

test('walking the forest hands tiles on, grows plants near the elf and never loses one', () => {
  const f = new Forest({ detail: 0.12, season: 'summer', look: 'forest', seed: 5 })
  assert.ok(f.blobCount > 10000)
  const startTiles = f.tiles
  // follow the path, as someone walking it would
  for (let k = 0; k < 60 * 40; k++) {
    const { x, z, heading } = f.walker
    const want = Math.atan2(pathX(z + 2) - x, 2)
    f.update(1 / 60, { forward: 1, turn: Math.max(-1, Math.min(1, (heading - want) * 3)) })
  }
  const w = f.walker
  assert.ok(w.z > 30, `walked to z ${w.z}`)
  assert.ok(f.walked > 30)
  const want = tileWindow(w.z, w.heading)
  assert.deepEqual([...f.tiles].sort((a, b) => a! - b!), [...want].sort((a, b) => a - b))
  assert.notDeepEqual(f.tiles, startTiles)
  // each ground tile stands where its tile is
  for (let j = 0; j < RING; j++) assert.equal(f.grounds[j].skeleton.place[2], (f.tiles[j]! - j) * TILE)
  assert.ok(f.growing > 10, `${f.growing} plants growing`)
  // not inside any trunk
  for (const o of obstacles(want, f.seed)) assert.ok(Math.hypot(w.x - o.x, w.z - o.z) >= o.r + 0.27)
  // a new forest regrows from nothing
  f.reseed(9)
  f.update(1 / 60, { forward: 0, turn: 0 })
  const before = f.growing
  for (let k = 0; k < 30; k++) f.update(1 / 60, { forward: 0, turn: 0 })
  assert.ok(before > 0 && f.growing >= before)
})

test('the elf and the fox walk on planned footsteps: a planted foot stays put, and the fox keeps up', () => {
  const f = new Forest({ detail: 0.12, season: 'summer', look: 'forest', seed: 5 })
  const esk = f.elf.skeleton, fsk = f.fox.skeleton
  const ankles = ['lFoot', 'rFoot'].map((n) => esk.index(n))
  const paws = ['fl', 'fr', 'bl', 'br'].map((l) => fsk.index(`${l}Lower`))
  const feet = () => [
    ...ankles.map((b) => [esk.posedHead[b * 3], esk.posedHead[b * 3 + 1], esk.posedHead[b * 3 + 2]]),
    ...paws.map((b) => posedPoint(fsk, b, fsk.bones[b].tail!)),
  ]
  const planted = () => [...f.elfSteps.feet, ...f.foxSteps.feet].map((s) => s.t < 0)
  let slid = 0, far = 0
  // walk on, turn on the spot, walk on turning, back up, stand
  for (const [secs, forward, turn] of [[3, 1, 0], [2, 0, 1], [2, 1, -0.6], [1.5, -1, 0], [2.5, 0, 0]]) {
    for (let k = 0; k < secs * 60; k++) {
      const was = feet(), down = planted()
      f.update(1 / 60, { forward, turn })
      const now = feet(), still = planted()
      now.forEach((p, i) => { if (down[i] && still[i]) slid = Math.max(slid, Math.hypot(p[0] - was[i][0], p[1] - was[i][1], p[2] - was[i][2])) })
      far = Math.max(far, Math.hypot(f.foxWalker.x - f.walker.x, f.foxWalker.z - f.walker.z))
    }
  }
  // the plan's feet never move at all while down (steps.test.ts); the legs reach them to within a couple of centimeters
  assert.ok(slid < 0.03, `a planted foot slid ${slid} m in one frame`)
  assert.ok(f.elfSteps.taken > 12 && f.foxSteps.taken > 40, `${f.elfSteps.taken} elf steps, ${f.foxSteps.taken} fox steps`)
  assert.ok(far < 2.5, `the fox fell ${far} m behind`)
  // standing still at the end, the elf's feet are down and square under it
  const still = { ...f.walker, vx: 0, vz: 0, turn: 0 }
  f.elfSteps.feet.forEach((ft, i) => assert.ok(ft.t < 0 && f.elfSteps.off(i, still) <= f.elfSteps.opts.settle + 1e-9, `elf foot ${i} left off square`))
})

test('a spark lights the grass beside the path; blades burn down to black stubs and grow back', async () => {
  const { BLADE, STUB } = await import('./ground.ts')
  const { SCAR_TIME, REGROW_TIME } = await import('../../splat-engine/meadow.ts')
  const f = new Forest({ detail: 0.3, season: 'summer', look: 'forest', seed: 1 })
  const still = { forward: 0, turn: 0 }
  // facing across the path, so the spark lands in the grass
  f.walker = { ...f.walker, heading: Math.PI / 2 }
  const at = f.spark()
  assert.ok(at, 'it caught')
  assert.ok(Math.abs(at![0] - pathX(at![1])) >= pathHalf(at![1]) - 0.2, 'not on the path')
  for (let k = 0; k < 40; k++) f.update(0.1, still)
  // the tile under the spark: its blades near the fire are gone, their stubs black
  const g = f.grounds[slotOf(Math.floor(at![1] / TILE))]
  // the blobs standing where it has burnt out
  const burnt = (k: number) => { const c = f.meadow.index(g.blobs.center[k * 3], g.blobs.center[k * 3 + 2]); return c >= 0 && f.meadow.char[c] === 1 && f.meadow.fire[c] === 0 }
  const blades = [...g.kind.keys()].filter((k) => g.kind[k] === BLADE && burnt(k)), stubs = [...g.kind.keys()].filter((k) => g.kind[k] === STUB && burnt(k))
  assert.ok(blades.length > 3, `${blades.length} blades burnt`)
  assert.ok(blades.every((k) => g.blobs.opacity[k] < 0.05), 'burnt down')
  assert.ok(stubs.every((k) => g.blobs.color[k * 3 + 1] < 0.15), 'black stubs')
  assert.ok(f.meadow.burning > 0 || f.meadow.busy, 'still burning or scarred')
  // nothing burnt on the path
  for (let k = 0; k < f.meadow.char.length; k++) if (f.meadow.char[k] > 0) { const [x, z] = f.meadow.center(k); assert.ok(Math.abs(x - pathX(z)) >= pathHalf(z) - 0.2) }
  for (let k = 0; k < (SCAR_TIME + REGROW_TIME) * 40; k++) f.update(0.1, still)
  assert.equal(f.meadow.busy, false)
  assert.ok(blades.every((k) => Math.abs(g.blobs.opacity[k] - g.alpha[k]) < 1e-6), 'grown back')
})
