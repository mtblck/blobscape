import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PALETTES } from '../diorama/scene.ts'
import { paletteChoices } from './styling.ts'

test('pixel art snaps to the project’s own palette first, then any shared one', () => {
  const own: [number, number, number][] = [[10, 20, 30], [200, 210, 220]]
  const ps = paletteChoices(own)
  assert.equal(ps[0].id, 'own')
  assert.deepEqual(ps[0].colors, own)
  assert.equal(ps.length, PALETTES.length + 1)
})
