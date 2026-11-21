import test from 'node:test'
import assert from 'node:assert/strict'
import { LOOPS } from '../src/blobscape/diorama/loops.ts'
import { missingLoops } from './loops-missing.mjs'

test('only scenes with no recorded loop are named, in the gallery order', () => {
  const ids = LOOPS.map((l) => l.id)
  assert.deepEqual(missingLoops(() => true), [])
  assert.deepEqual(missingLoops(() => false), ids)
  const fresh = new Set([ids[2], ids[0]])
  assert.deepEqual(missingLoops((path) => ![...fresh].some((id) => path === `public/loops/${id}.webp`)), [ids[0], ids[2]])
})

