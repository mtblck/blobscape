import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DIORAMAS } from './scenes.ts'
import { ENGINE_LOOPS, LOOPS } from './loops.ts'

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'public')

test('there is a loop for every scene, in the same order and with the same name', () => {
  assert.deepEqual(LOOPS.map((l) => [l.id, l.label]), DIORAMAS.map((d) => [d.id, d.label]))
})

test('every loop has its moving and still files', () => {
  for (const { id } of LOOPS) for (const ext of ['webp', 'png']) assert.ok(existsSync(join(publicDir, 'loops', `${id}.${ext}`)), `public/loops/${id}.${ext} is missing: run scripts/record-loops.mjs`)
})

test('the engine page shows loops that exist', () => {
  for (const id of ENGINE_LOOPS) assert.ok(LOOPS.some((l) => l.id === id), id)
})
