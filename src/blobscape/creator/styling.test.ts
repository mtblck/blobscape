import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PALETTES } from '../diorama/scene.ts'
import { paletteChoices } from './styling.ts'

test('pixel art starts in full color, then the project’s own palette, then any shared one', () => {
  const own: [number, number, number][] = [[10, 20, 30], [200, 210, 220]]
  const ps = paletteChoices(own)
  assert.equal(ps[0].id, 'none')
  assert.equal(ps[1].id, 'own')
  assert.deepEqual(ps[1].colors, own)
  assert.equal(ps.length, PALETTES.length + 1)
})
