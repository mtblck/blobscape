import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_PROPS, type SceneProject } from '../../splat-engine/project.ts'
import { LIBRARY } from './library.ts'
import { PACKS, PACK_GAP, packAdded, packSpots } from './packs.ts'

test('every pack is named once and holds props the library has, each once', () => {
  assert.equal(new Set(PACKS.map((p) => p.id)).size, PACKS.length)
  assert.equal(new Set(PACKS.map((p) => p.name)).size, PACKS.length)
  for (const pack of PACKS) {
    assert.ok(pack.items.length >= 3, pack.id)
    assert.equal(new Set(pack.items).size, pack.items.length, pack.id)
    for (const id of pack.items) assert.equal(LIBRARY.find((e) => e.id === id)?.kind, 'prop', `${pack.id}: ${id}`)
  }
})

test('a pack is set down in rows centered on the spot, no two things nearer than the gap', () => {
  for (const n of [1, 3, 4, 5, 6, 7]) {
    const spots = packSpots(n, [2, 0, -1])
    const mx = spots.reduce((s, [x]) => s + x, 0) / n, mz = spots.reduce((s, [, z]) => s + z, 0) / n
    if (n % 3 === 0 || n < 3) { assert.ok(Math.abs(mx - 2) < 1e-9, `${n}`); assert.ok(Math.abs(mz + 1) < 1e-9, `${n}`) }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      assert.ok(Math.hypot(spots[i][0] - spots[j][0], spots[i][1] - spots[j][1]) >= PACK_GAP - 1e-9, `${n}: ${i} ${j}`)
    }
  }
})

test('adding a pack adds all of it on the ground, in one step, or nothing when it would not fit', () => {
  const empty: SceneProject = { kind: 'blobscape-project', version: 1, name: 'Test', loop: 12, land: 'plain-turf', props: [] }
  const pack = PACKS[0]
  const next = packAdded(empty, pack, [0, 0, 0], (x, z) => 0.1 * x + 0.05 * z)
  assert.deepEqual(next.props.map((p) => p.prop), pack.items)
  for (const p of next.props) assert.ok(Math.abs(p.at[1] - (0.1 * p.at[0] + 0.05 * p.at[2])) < 1e-3)
  const full: SceneProject = { ...empty, props: Array.from({ length: MAX_PROPS - 2 }, () => ({ prop: 'kit-bush', at: [0, 0, 0], turn: 0, size: 1 })) }
  assert.equal(packAdded(full, pack, [0, 0, 0], () => 0), full)
})
