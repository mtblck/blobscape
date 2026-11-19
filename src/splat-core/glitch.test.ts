import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MIX_A, MIX_B, glitchHash, glitchArt, glitchAt, pickOf, readFrom, stepAt, wrapX, type GlitchLook } from './glitch.ts'
import { makeFrame } from './pixel.ts'

const LOOK: GlitchLook = { amount: 0.5, strength: 0.6, jitter: true, split: true, blocks: true, pace: 12, loop: 8 }
const same = (a: object, b: object) => assert.deepEqual(a, b)

test('the glitch comes round with the scene\'s loop, so an exported loop joins up', () => {
  for (let f = 0; f < 96; f++) {
    const t = (f / 96) * 8
    same(glitchAt(t, LOOK), glitchAt(t + 8, LOOK))
    same(glitchAt(t, LOOK), glitchAt(t + 24, LOOK))
  }
  // and over the seam: the last steps of a loop run on into the first
  assert.equal(stepAt(7.99, LOOK).k, 95)
  assert.equal(stepAt(8, LOOK).k, 0)
})

test('it is stepped: nothing changes between two steps', () => {
  for (let k = 0; k < 96; k++) {
    const a = glitchAt(k / 12 + 0.001, LOOK), b = glitchAt(k / 12 + 0.07, LOOK)
    same(a, b)
  }
})

test('bursts pop in and out: some steps glitch, more do not, and more often at a higher amount', () => {
  const share = (amount: number) => Array.from({ length: 96 }, (_, k) => glitchAt(k / 12 + 0.01, { ...LOOK, amount }).on).filter(Boolean).length / 96
  const often = share(0.5)
  assert.ok(often > 0.05 && often < 0.6, `on ${often}`)
  assert.ok(share(1) > often && share(0.25) < often)
  assert.equal(share(0), 0)
})

test('nothing bursts under reduced motion or with every kind off', () => {
  for (let k = 0; k < 96; k++) {
    assert.equal(glitchAt(k / 12, { ...LOOK, still: true }).on, false)
    assert.equal(glitchAt(k / 12, { ...LOOK, jitter: false, split: false, blocks: false }).on, false)
  }
})

test('a kind turned off does nothing in a burst', () => {
  for (let k = 0; k < 96; k++) {
    const g = glitchAt(k / 12 + 0.01, { ...LOOK, split: false, blocks: false })
    assert.equal(g.split, 0)
    assert.equal(g.blocks, 0)
  }
})

test('the cell hash is plain unsigned 32-bit arithmetic, as the GPU does it', () => {
  const u = (x: bigint) => x & 0xffffffffn
  const ref = (a: number, b: number, key: number, salt: number) => {
    let h = u(BigInt(a) * BigInt(MIX_A)) ^ u(BigInt(b) * BigInt(MIX_B)) ^ u(BigInt(key + salt))
    h = (h ^ 61n) ^ (h >> 16n)
    h = u(h * 9n)
    h = h ^ (h >> 4n)
    h = u(h * 0x27d4eb2dn)
    h = h ^ (h >> 15n)
    return Number(h >> 8n)
  }
  for (const [a, b, key, salt] of [[0, 0, 0, 1], [3, 0, 16777215, 2], [400, 300, 123456, 6], [77, 12, 9999999, 4]]) assert.equal(glitchHash(a, b, key, salt), ref(a, b, key, salt))
  assert.equal(pickOf(0, 7), 0)
  assert.equal(pickOf(16777215, 7), 6)
})

test('a glitched pixel is read from inside the art, and is only ever colors the art already had, channel by channel', () => {
  for (const x of [-200, -41, -40, -1, 0, 39, 40, 95]) { const m = wrapX(x, 40); assert.ok(m >= 0 && m < 40 && (m - x) % 40 === 0, `${x}`) }
  const w = 40, h = 24, art = makeFrame(w, h)
  for (let i = 0; i < w * h; i++) { art.data[i * 4] = i % 251; art.data[i * 4 + 1] = (i * 7) % 253; art.data[i * 4 + 2] = (i * 13) % 255; art.data[i * 4 + 3] = 255 }
  let changed = 0
  for (let k = 0; k < 96; k++) {
    const g = glitchAt(k / 12 + 0.01, { ...LOOK, amount: 1, strength: 1 })
    const out = glitchArt(art, g)
    if (!g.on) { assert.equal(out, art); continue }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const f = readFrom(x, y, w, h, g)
      assert.ok(f.x >= 0 && f.x < w && f.y >= 0 && f.y < h)
    }
    const had = new Set([...art.data])
    for (let i = 0; i < w * h; i++) if (out.data[i * 4 + 3] !== 255) assert.fail('an opaque picture stays opaque')
    for (let i = 0; i < w * h; i++) if (out.data[i * 4] !== art.data[i * 4]) changed++
    assert.ok([...out.data].every((v) => had.has(v)), 'no color is made up')
  }
  assert.ok(changed > 0, 'bursts move pixels')
})
