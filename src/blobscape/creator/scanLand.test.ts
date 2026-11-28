import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs } from '../../splat-core/blobs.ts'
import { groundUnder } from '../../splat-engine/weather.ts'
import { checkProject } from '../../splat-engine/project.ts'
import { sampleScan } from '../scan/sample.ts'
import { modelId } from './models.ts'
import { known } from './store.ts'
import { SCAN_SPAN, landFromScan, scanGround, scanProject } from './scanLand.ts'

test('a scan comes in level, cleaned, its table kept as the ground, and as wide as a land', () => {
  const { blobs, part } = sampleScan(7, 0.5)
  const land = landFromScan(blobs)
  // floaters and haze are gone, most of the table stays
  const table = part.filter((p) => p === 1).length
  assert.ok(land.count < blobs.count && land.count > table * 0.7, `${land.count} of ${blobs.count}, table ${table}`)
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < land.count; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], land.center[i * 3 + k]); hi[k] = Math.max(hi[k], land.center[i * 3 + k]) }
  assert.ok(Math.abs(Math.max(hi[0] - lo[0], hi[2] - lo[2]) - SCAN_SPAN) < 1e-3)
  assert.ok(Math.abs(lo[0] + hi[0]) < 1e-3 && Math.abs(lo[2] + hi[2]) < 1e-3)
  // the table lies level at y = 0: most blobs are near it
  let near = 0
  for (let i = 0; i < land.count; i++) if (Math.abs(land.center[i * 3 + 1]) < 0.06) near++
  assert.ok(near > land.count * 0.3, `${near} of ${land.count} on the table`)
  // a prop set on the table edge stands on it; one on the mug's rim stands higher
  const g = scanGround(land)
  const edge = groundUnder([g], hi[0] * 0.8, 0, 3, -3)
  let rim = 0
  for (let x = -1; x <= 1; x += 0.02) rim = Math.max(rim, groundUnder([g], x, 0, 3, -3))
  assert.ok(Math.abs(edge) < 0.08, `edge ${edge}`)
  assert.ok(rim > 0.3, `rim ${rim}`)
})

test('the ground is the top of the solid blobs over each cell, and the floor where there are none', () => {
  const b = new Blobs(3)
  b.count = 3
  b.center.set([0, 0.5, 0, 1, 0.2, 1, 0.5, 2, 0.5])
  b.opacity.set([1, 1, 0.1])
  const g = scanGround(b, 0.25)
  assert.ok(Math.abs(groundUnder([g], 0.1, 0.1, 3, -3) - 0.5) < 0.01)
  assert.ok(Math.abs(groundUnder([g], 1, 1, 3, -3) - 0.2) < 0.01)
  // the faint blob up high is not ground
  assert.ok(Math.abs(groundUnder([g], 0.5, 0.5, 3, -3)) < 0.01)
})

test('a scan land opens as a project the checker takes', () => {
  const p = scanProject(modelId(new Uint8Array([4, 2])), 'Desk')
  assert.deepEqual(checkProject(p, known), [])
  assert.equal(p.props.length, 0)
})

test('a scan land takes the scene\'s sun (#463): baked under it, and its paint alone where light is live', async () => {
  const { cut } = await import('./cut.ts')
  const { modelFrom } = await import('./models.ts')
  const { stillActor } = await import('../scan/studio.ts')
  const land = landFromScan(sampleScan(7, 0.3).blobs)
  const m = modelFrom({ name: 'Desk', ...stillActor(land), clips: [] }, 'desk.ply', new Uint8Array([7, 7]))
  const project = scanProject(m.id, 'Desk')
  const job = (light: object | undefined, plain = false) => cut({ kind: 'land', project: { ...project, light }, spacing: 0.05, plain, model: { kind: 'splats', rest: m.rest } }).blobs
  const paint = job(undefined, true)
  const low = job({ sun: { turn: 0, height: 10 }, shade: 0.2 }), high = job({ sun: { turn: 0, height: 80 }, shade: 0.2 })
  assert.equal(paint.count, land.count)
  // the table's top faces up: a high sun lights it more than a low one
  let hi = 0, lo = 0
  for (let i = 0; i < land.count; i++) if (Math.abs(land.center[i * 3 + 1]) < 0.03) { hi += high.color[i * 3 + 1]; lo += low.color[i * 3 + 1] }
  assert.ok(hi > lo * 1.2, `${hi} vs ${lo}`)
})
