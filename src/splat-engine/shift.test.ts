import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs } from '../splat-core/blobs.ts'
import { amountAt, pairUp, shiftBlobs, sized, timeAt, type Order, type Path } from './shift.ts'

/** Blobs on a grid in a box, colored and sized by `tint`. */
function box(nx: number, ny: number, nz: number, size: [number, number, number], at: [number, number, number], tint: number) {
  const b = new Blobs(nx * ny * nz)
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
    b.push({
      center: [at[0] + ((i + 0.5) / nx - 0.5) * size[0], at[1] + ((j + 0.5) / ny) * size[1], at[2] + ((k + 0.5) / nz - 0.5) * size[2]],
      scale: [0.01 * tint, 0.02 * tint, 0.005 * tint], quat: [0, Math.sin(tint), 0, Math.cos(tint)], color: [tint / 4, 0.5, 1 - tint / 4], opacity: 0.5 + tint / 8,
    })
  }
  return b
}

const tall = () => box(6, 20, 6, [0.5, 2, 0.5], [0, 0, 0], 1)
const long = () => box(24, 5, 8, [2.4, 0.4, 0.7], [0.1, 0, 0], 2)

test('pairing: both shapes come out with the same number of blobs, and nothing is left out', () => {
  const a = tall(), b = long()
  assert.equal(a.count, 720)
  assert.equal(b.count, 960)
  const s = pairUp(a, b)
  assert.equal(s.count, 960)
  assert.equal(s.from.count, 960)
  assert.equal(s.to.count, 960)
  // every blob of each shape is there: the bigger shape once each, the smaller at least once
  const seen = (all: Blobs, got: Blobs) => {
    const key = (c: Float32Array, i: number) => `${c[i * 3].toFixed(4)},${c[i * 3 + 1].toFixed(4)},${c[i * 3 + 2].toFixed(4)}`
    const n = new Map<string, number>()
    for (let i = 0; i < got.count; i++) n.set(key(got.center, i), (n.get(key(got.center, i)) ?? 0) + 1)
    let least = Infinity, most = 0
    for (let i = 0; i < all.count; i++) { const k = n.get(key(all.center, i)) ?? 0; least = Math.min(least, k); most = Math.max(most, k) }
    return [least, most]
  }
  assert.deepEqual(seen(b, s.to), [1, 1])
  const [least, most] = seen(a, s.from)
  assert.ok(least >= 1 && most <= 2, `a blob of the smaller shape is used ${least} to ${most} times`)
})

test('pairing by place keeps trips short and tops with tops; random pairing does neither', () => {
  const a = tall(), b = box(10, 12, 8, [1, 1.4, 0.8], [0.1, 0, 0], 2)
  const near = pairUp(a, b), wild = pairUp(a, b, 'random')
  assert.ok(near.trip < wild.trip * 0.6, `by place ${near.trip}, random ${wild.trip}`)
  // rank by height carries over: blobs from the top half of one shape go to the upper part of the other
  const rank = (s: typeof near) => {
    let agree = 0
    for (let i = 0; i < s.count; i++) if ((s.from.center[i * 3 + 1] > 1) === (s.to.center[i * 3 + 1] > 0.7)) agree++
    return agree / s.count
  }
  assert.ok(rank(near) > 0.9, `by place ${rank(near)}`)
  assert.ok(rank(wild) < 0.65, `random ${rank(wild)}`)
  // the same pairing every time
  assert.deepEqual([...pairUp(a, b, 'random').to.center.subarray(0, 30)], [...wild.to.center.subarray(0, 30)])
})

test('a shift starts as one shape and ends as the other, whatever the path and order', () => {
  const s = pairUp(tall(), long())
  const out = new Blobs(s.count)
  const same = (x: Float32Array, y: Float32Array, n: number, what: string) => { for (let i = 0; i < n; i++) assert.ok(Math.abs(x[i] - y[i]) < 1e-5, `${what}[${i}]: ${x[i]} vs ${y[i]}`) }
  for (const path of ['straight', 'swirl', 'melt', 'burst'] as Path[]) {
    for (const order of ['together', 'rise', 'scatter'] as Order[]) {
      for (const [w, end] of [[0, s.from], [1, s.to], [-0.3, s.from], [1.4, s.to]] as const) {
        shiftBlobs(s, w, out, path, order)
        const what = `${path}/${order} at ${w}`
        same(out.center, end.center, s.count * 3, `${what} center`)
        same(out.scale, end.scale, s.count * 3, `${what} scale`)
        same(out.color, end.color, s.count * 3, `${what} color`)
        same(out.opacity, end.opacity, s.count, `${what} opacity`)
        for (let i = 0; i < s.count; i++) {
          const dot = out.quat[i * 4] * end.quat[i * 4] + out.quat[i * 4 + 1] * end.quat[i * 4 + 1] + out.quat[i * 4 + 2] * end.quat[i * 4 + 2] + out.quat[i * 4 + 3] * end.quat[i * 4 + 3]
          assert.ok(Math.abs(Math.abs(dot) - 1) < 1e-5, `${what} quat[${i}]`)
        }
      }
      // in between, every number is finite and every facing is a unit quaternion
      shiftBlobs(s, 0.37, out, path, order)
      for (const arr of [out.center, out.scale, out.quat, out.color, out.opacity]) for (let i = 0; i < arr.length; i++) assert.ok(Number.isFinite(arr[i]), `${path}/${order}`)
      for (let i = 0; i < s.count; i++) assert.ok(Math.abs(Math.hypot(out.quat[i * 4], out.quat[i * 4 + 1], out.quat[i * 4 + 2], out.quat[i * 4 + 3]) - 1) < 1e-5)
    }
  }
})

test('halfway: sizes blend by ratio, colors straight, and each path does what it says', () => {
  const s = pairUp(tall(), long())
  const out = new Blobs(s.count)
  shiftBlobs(s, 0.5, out)
  assert.ok(Math.abs(out.scale[0] - Math.sqrt(0.01 * 0.02)) < 1e-6)
  assert.ok(Math.abs(out.color[0] - 0.375) < 1e-6 && Math.abs(out.opacity[0] - 0.6875) < 1e-6)
  const height = () => { let m = -Infinity; for (let i = 0; i < s.count; i++) m = Math.max(m, out.center[i * 3 + 1]); return m }
  const reach = () => { let m = 0; for (let i = 0; i < s.count; i++) m = Math.max(m, Math.hypot(out.center[i * 3] - s.mid[0], out.center[i * 3 + 2] - s.mid[1])); return m }
  const straight = [height(), reach()]
  shiftBlobs(s, 0.5, out, 'melt')
  assert.ok(height() < 0.2 && height() < straight[0] * 0.2, `melted to ${height()} high`)
  assert.ok(reach() > straight[1] * 1.5)
  shiftBlobs(s, 0.5, out, 'burst')
  assert.ok(reach() > straight[1] + 0.4)
  // a swirl keeps each blob as far from the middle line as a straight blend of its two distances
  shiftBlobs(s, 0.5, out, 'swirl')
  const r = (b: Blobs, i: number) => Math.hypot(b.center[i * 3] - s.mid[0], b.center[i * 3 + 2] - s.mid[1])
  for (let i = 0; i < s.count; i += 37) assert.ok(Math.abs(r(out, i) - (r(s.from, i) + r(s.to, i)) / 2) < 1e-5)
})

test('order: rising starts at the floor, and a third of the way up the top has not moved', () => {
  const s = pairUp(tall(), long())
  const out = new Blobs(s.count)
  shiftBlobs(s, 0.25, out, 'straight', 'rise')
  let low = 0, lows = 0, high = 0, highs = 0
  for (let i = 0; i < s.count; i++) {
    const moved = Math.hypot(out.center[i * 3] - s.from.center[i * 3], out.center[i * 3 + 1] - s.from.center[i * 3 + 1], out.center[i * 3 + 2] - s.from.center[i * 3 + 2])
    const full = Math.hypot(s.to.center[i * 3] - s.from.center[i * 3], s.to.center[i * 3 + 1] - s.from.center[i * 3 + 1], s.to.center[i * 3 + 2] - s.from.center[i * 3 + 2])
    const y = (s.from.center[i * 3 + 1] + s.to.center[i * 3 + 1]) / 2
    if (y < 0.15) { low += moved / (full || 1); lows++ }
    if (y > 0.9) { high += moved; highs++ }
  }
  assert.ok(lows > 10 && highs > 10)
  assert.ok(low / lows > 0.2, `low blobs are ${low / lows} of the way`)
  assert.equal(high, 0)
})

test('the there-and-back loop holds at both ends and timeAt finds a moment in it', () => {
  assert.equal(amountAt(0, 3), 0)
  assert.equal(amountAt(0.5, 3), 0)
  assert.ok(Math.abs(amountAt(0.8 + 1.5, 3) - 0.5) < 1e-9)
  assert.equal(amountAt(4, 3), 1)
  assert.ok(Math.abs(amountAt(4.6 + 1, 3) - 2 / 3) < 1e-9)
  assert.equal(amountAt(7.6, 3), amountAt(0, 3))
  for (const w of [0, 0.2, 0.75, 1]) {
    assert.ok(Math.abs(amountAt(timeAt(w, 3), 3) - w) < 1e-9)
    assert.ok(Math.abs(amountAt(timeAt(w, 3, true), 3) - w) < 1e-9)
  }
})

test('sizing: the longest side becomes the size asked for, on the floor over the middle, blobs scaled with it', () => {
  const b = long(), s = sized(b, 1.2)
  assert.equal(s.count, b.count)
  const span = (k: number) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < s.count; i++) { lo = Math.min(lo, s.center[i * 3 + k]); hi = Math.max(hi, s.center[i * 3 + k]) } return [lo, hi] }
  const [x0, x1] = span(0), [y0] = span(1), [z0, z1] = span(2)
  assert.ok(Math.abs(x1 - x0 - 1.2) < 1e-5 && Math.abs(x0 + x1) < 1e-5 && Math.abs(y0) < 1e-6 && Math.abs(z0 + z1) < 1e-5)
  const f = 1.2 / (2.4 * (23 / 24))
  assert.ok(Math.abs(s.scale[0] - b.scale[0] * f) < 1e-7)
  // the blobs given are left alone
  assert.ok(Math.abs(b.center[0] - (0.1 + (0.5 / 24 - 0.5) * 2.4)) < 1e-6)
})
