import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RADIX_BITS, radixOrder } from './radix.ts'

test('radixOrder sorts 24-bit keys and keeps equal keys in index order', () => {
  let seed = 7
  const rand = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2 ** 32 }
  for (const n of [1, 5, 256, 1000, 70000]) {
    const keys = new Uint32Array(n)
    // many repeats (a few hundred values) and the full range
    for (let i = 0; i < n; i++) keys[i] = rand() < 0.5 ? Math.floor(rand() * 300) * 40000 : Math.floor(rand() * 2 ** RADIX_BITS)
    const got = radixOrder(keys, n, new Uint32Array(n))
    const want = Array.from({ length: n }, (_, i) => i).sort((a, b) => keys[a] - keys[b] || a - b)
    assert.deepEqual([...got], want)
  }
})
