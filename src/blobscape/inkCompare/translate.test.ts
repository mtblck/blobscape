import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs } from '../../splat-core/blobs.ts'
import { SH_C0 } from '../../splat-core/color.ts'
import { readOwnPly, writePly } from '../../splat-core/ply.ts'
import { inkCamera, inkCloud, inkFit, inkPalette, readInkLooks, swatch } from './translate.ts'

const blobs = () => {
  const b = new Blobs()
  b.push({ center: [1, 2, 3], scale: [0.1, 0.2, 0.3], quat: [0, 0, 0.6, 0.8], color: [1, 0.5, 0], opacity: 0.9 })
  b.push({ center: [-1, 0, 1], scale: [0.4, 0, 0.1], quat: [0, 0, 0, 2], color: [0.2, 0.2, 0.2], opacity: 1 })
  // hidden: a bone at size 0, and a clear blob
  b.push({ center: [9, 9, 9], scale: [0, 0, 0], quat: [0, 0, 0, 1], color: [1, 1, 1], opacity: 1 })
  b.push({ center: [-9, -9, -9], scale: [1, 1, 1], quat: [0, 0, 0, 1], color: [1, 1, 1], opacity: 0 })
  return b
}

test('the cloud is what a .ply of the same blobs decodes to, leaving out what cannot be seen', () => {
  const c = inkCloud([blobs()])
  assert.equal(c.count, 2)
  // the same numbers the standard .ply holds (Ink's decoder: exp of the log scale, sigmoid of the opacity, x y z w)
  const back = readOwnPly(writePly(blobs()))
  for (let a = 0; a < 3; a++) {
    assert.ok(Math.abs(c.positions[a] - back.center[a]) < 1e-6)
    assert.ok(Math.abs(c.scales[a] - back.scale[a]) < 1e-6)
    assert.ok(Math.abs(0.5 + SH_C0 * c.dc[a] - back.color[a]) < 1e-5)
  }
  assert.deepEqual([...c.rotations.subarray(0, 4)].map((v) => +v.toFixed(5)), [0, 0, 0.6, 0.8])
  // normalized, and a flat axis made just above nothing (Ink refuses a zero scale)
  assert.deepEqual([...c.rotations.subarray(4, 8)], [0, 0, 0, 1])
  assert.ok(c.scales[4] > 0)
  assert.ok(Math.abs(c.opacity[0] - 0.9) < 1e-6)
})

test('several actors join into one cloud', () => {
  assert.equal(inkCloud([blobs(), blobs()]).count, 4)
  assert.equal(inkCloud([]).count, 0)
})

test('the fit keeps our units and moves only the box middle to the origin', () => {
  const f = inkFit(inkCloud([blobs()]))
  assert.deepEqual(f.center, [0, 1, 2])
  // the widest way is 2, but six of the largest blob's 0.4 is more
  assert.ok(Math.abs(f.size - 2.4) < 1e-6)
  // a cloud smaller than its blobs takes six of its largest
  const one = new Blobs()
  one.push({ center: [0, 0, 0], scale: [1, 1, 1], quat: [0, 0, 0, 1], color: [1, 1, 1], opacity: 1 })
  assert.equal(inkFit(inkCloud([one])).size, 6)
})

test('the camera is our orbit in radians about the moved target', () => {
  const cam = inkCamera({ target: [1, 1, 2], distance: 5, azimuth: 90, elevation: 30 }, { center: [0, 1, 2], size: 2 }, 40)
  assert.deepEqual(cam.target, [1, 0, 0])
  assert.equal(cam.dist, 5)
  assert.ok(Math.abs(cam.yaw - Math.PI / 2) < 1e-12)
  assert.ok(Math.abs(cam.pitch - Math.PI / 6) < 1e-12)
  assert.ok(Math.abs(cam.fov - (40 * Math.PI) / 180) < 1e-12)
  // Ink's eye is at (cos p sin y, sin p, cos p cos y) from the target, as ours is
  const eye = [Math.cos(cam.pitch) * Math.sin(cam.yaw), Math.sin(cam.pitch), Math.cos(cam.pitch) * Math.cos(cam.yaw)].map((v) => v * cam.dist)
  assert.ok(Math.abs(eye[0] - 5 * Math.cos(Math.PI / 6)) < 1e-9 && Math.abs(eye[1] - 2.5) < 1e-9 && Math.abs(eye[2]) < 1e-9)
})

test('palettes are packed swatches, each once, at most 64', () => {
  assert.deepEqual(inkPalette([[255, 0, 0], [0, 128, 255], [255, 0, 0]]), [0xff0000, 0x0080ff])
  assert.equal(inkPalette(Array.from({ length: 80 }, (_, i) => [i, 0, 0])).length, 64)
  assert.equal(swatch('#00ff00'), 0x00ff00)
  assert.equal(swatch('nope'), undefined)
})

test('look files are read by their shape', () => {
  const own = readInkLooks(JSON.stringify({ inkLook: 1, label: 'Blue stipple', look: { tone: 'stipple' }, frame: { outline: false }, palette: ['#000000', '#ffffff'], pixelSize: 3 }), 'stipple.json')
  assert.equal(own.length, 1)
  assert.equal(own[0].label, 'Blue stipple')
  assert.deepEqual(own[0].look, { tone: 'stipple' })
  assert.deepEqual(own[0].palette, [0, 0xffffff])
  // an Ink diorama brings its finish.look; a bare look is taken whole
  assert.deepEqual(readInkLooks(JSON.stringify({ finish: { look: { pixelSize: 2 } }, solids: [] }), 'scene.json')[0].look, { pixelSize: 2 })
  assert.deepEqual(readInkLooks(JSON.stringify({ tone: { preset: 'stipple' } }), 'tone.json')[0].look, { tone: { preset: 'stipple' } })
  // an asset pack gives one look each
  const pack = readInkLooks(JSON.stringify({ type: 'ink-studio/asset-pack', looks: [{ id: 'relay/enamel', label: 'Enamel' }, { id: 'relay/rust' }] }), 'relay.json')
  assert.deepEqual(pack.map((l) => [l.id, l.label]), [['relay:relay/enamel', 'Enamel'], ['relay:relay/rust', 'relay/rust']])
  assert.equal(pack[0].asset?.id, 'relay/enamel')
})

test('a broken look file says what is wrong', () => {
  assert.throws(() => readInkLooks('{', 'a.json'), /a.json: not JSON/)
  assert.throws(() => readInkLooks('[]', 'a.json'), /one JSON object/)
  assert.throws(() => readInkLooks(JSON.stringify({ inkLook: 1, colorMode: 'neon' }), 'a.json'), /colorMode/)
  assert.throws(() => readInkLooks(JSON.stringify({ inkLook: 1, palette: ['red'] }), 'a.json'), /color 1/)
  assert.throws(() => readInkLooks(JSON.stringify({ label: 'x', frame: {} }), 'a.json'), /"inkLook": 1/)
})
