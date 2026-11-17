import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readObj } from '../../splat-engine/meshFile.ts'
import { modelDiorama, modelPalette } from './model.ts'

/** A red box with a blue lid, as an .obj with its .mtl. */
const BOX = ['v -1 0 -1', 'v 1 0 -1', 'v 1 0 1', 'v -1 0 1', 'v -1 3 -1', 'v 1 3 -1', 'v 1 3 1', 'v -1 3 1',
  'usemtl red', 'f 1 2 3 4', 'f 1 5 6 2', 'f 2 6 7 3', 'f 3 7 8 4', 'f 4 8 5 1', 'usemtl blue', 'f 5 8 7 6'].join('\n')
const MTL = 'newmtl red\nKd 0.8 0.1 0.1\nnewmtl blue\nKd 0.1 0.2 0.9\n'

test('an opened model becomes a scene: checked, cut with the model on its plinth, in a palette of its own colors', () => {
  const d = modelDiorama('crate.obj', readObj(BOX, MTL), [])
  assert.equal(d.label, 'crate')
  const built = d.make(0.06)
  const model = built.skeleton.index('model')
  let onModel = 0, reddest = 0
  for (let i = 0; i < built.blobs.count; i++) {
    const b = built.blobs.get(i)
    reddest = Math.max(reddest, b.color[0] - b.color[2])
    if (b.center[1] > 0.05) onModel++
  }
  assert.ok(model >= 0)
  assert.ok(onModel > 300, `${onModel} blobs above the plinth`)
  assert.ok(reddest > 0.3, 'the red sides keep their color')
  assert.ok(d.palette.colors.some(([r, g, b]) => r > g + 40 && r > b + 40), 'the palette has a red')
  assert.ok(d.palette.colors.some(([r, , b]) => b > r + 40), 'and a blue')
})

test('the palette is the colors at a few levels of light, no more than asked', () => {
  const p = modelPalette([[1, 0, 0], [0, 1, 0]], 6)
  assert.ok(p.length <= 6 && p.length >= 4, `${p}`)
})

