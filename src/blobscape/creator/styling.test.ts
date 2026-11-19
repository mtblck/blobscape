import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PALETTES } from '../diorama/scene.ts'
import { paletteChoices, pixelLook, pixelStart } from './styling.ts'

test('pixel art snaps to the project’s own palette first, then any shared one', () => {
  const own: [number, number, number][] = [[10, 20, 30], [200, 210, 220]]
  const ps = paletteChoices(own)
  assert.equal(ps[0].id, 'own')
  assert.deepEqual(ps[0].colors, own)
  assert.equal(ps.length, PALETTES.length + 1)
  const start = pixelStart({ dither: 0.5, outline: true, edges: false, sky: true, glow: 1 } as never)
  const sky: [[number, number, number], [number, number, number]] = [[0, 0, 40], [90, 90, 120]]
  const look = pixelLook(start, ps, sky, 1.5)
  assert.deepEqual(look.palette, own)
  assert.deepEqual(look.outline, [10, 20, 30])
  assert.deepEqual(look.sky, sky)
  assert.equal(look.glow, 1.5)
  assert.equal(look.edges, 0)
  const bare = pixelLook({ ...start, palette: 'none', sky: false, outline: true }, ps, sky, 1)
  assert.deepEqual(bare.palette, [])
  assert.equal(bare.sky, undefined)
  assert.deepEqual(bare.outline, [11, 16, 38])
  // a palette the list doesn't have falls back to the project's own
  assert.deepEqual(pixelLook({ ...start, palette: 'gone' }, ps, sky, 1).palette, own)
})
